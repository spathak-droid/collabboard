/**
 * Whiteboard Board Page - Main collaborative canvas with real-time sync
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Rect as KonvaRect, Circle as KonvaCircle, Line as KonvaLine, Star as KonvaStar } from 'react-konva';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { Circle } from '@/components/canvas/objects/Circle';
import { Triangle } from '@/components/canvas/objects/Triangle';
import { Star } from '@/components/canvas/objects/Star';
import { Line } from '@/components/canvas/objects/Line';
import { TextBubble } from '@/components/canvas/objects/TextBubble';
import { Frame } from '@/components/canvas/objects/Frame';
import { Cursors } from '@/components/canvas/Cursors';
import { DisconnectBanner } from '@/components/canvas/DisconnectBanner';
import { PropertiesSidebar } from '@/components/canvas/PropertiesSidebar';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { LatencyStatusButton } from '@/components/canvas/LatencyStatusButton';
import { useAuth } from '@/lib/hooks/useAuth';
import { useYjs } from '@/lib/hooks/useYjs';
import { useCursorSync } from '@/lib/hooks/useCursorSync';
import { useSelection } from '@/lib/hooks/useSelection';
import { useCanvasStore } from '@/lib/store/canvas';
import { generateId } from '@/lib/utils/geometry';
import { getUserColor } from '@/lib/utils/colors';
import { supabase, updateBoard, fetchBoardMembers, ensureBoardAccess, fetchOnlineUserUids, type BoardMember } from '@/lib/supabase/client';
import { usePresenceHeartbeat } from '@/lib/hooks/usePresenceHeartbeat';
import { ConnectionDots } from '@/components/canvas/objects/ConnectionDots';
import { findNearestAnchor, resolveLinePoints } from '@/lib/utils/connectors';
import { calculateAutoFit } from '@/lib/utils/autoFit';
import { STICKY_COLORS } from '@/types/canvas';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape, CircleShape, TriangleShape, StarShape, LineShape, TextBubbleShape, Frame as FrameType, AnchorPosition } from '@/types/canvas';

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#000000');
  const [shapeFillColor, setShapeFillColor] = useState('#E5E7EB');
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  const [frameWarningVisible, setFrameWarningVisible] = useState(false);
  const frameWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usersDropdownRef = useRef<HTMLDivElement>(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send heartbeat every 60s so other users know we're online
  usePresenceHeartbeat(user?.uid);

  // Track every user ever seen online in this session so they persist as
  // "offline" after they disconnect (Yjs awareness only has live users).
  const seenUsersRef = useRef<Map<string, { name: string; color: string }>>(new Map());
  
  // Load board metadata from Supabase (non-blocking)
  const boardMetaLoaded = useRef(false);
  useEffect(() => {
    if (!boardId || !user || boardMetaLoaded.current) return;
    boardMetaLoaded.current = true;

    supabase
      .from('boards')
      .select('title, owner_uid')
      .eq('id', boardId)
      .single()
      .then(({ data, error }) => {
        if (error) { console.error('Error loading board meta:', error); return; }
        if (data?.title) setBoardTitle(data.title);
        if (data?.owner_uid) setOwnerUid(data.owner_uid);
      });

    // Register this user as a collaborator, then fetch all known members
    ensureBoardAccess(boardId, user.uid)
      .then(() => fetchBoardMembers(boardId))
      .then((members) => {
        setBoardMembers(members);
        const uids = members.map((m) => m.uid);
        fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
      })
      .catch(console.error);
  }, [boardId, user]);

  const isOwner = ownerUid !== null && user?.uid === ownerUid;
  
  // Initialize Yjs connection
  const {
    objects,
    connectionStatus,
    onlineUsers,
    awareness,
    createObject,
    updateObject,
    deleteObjects,
    updateCursor,
    getBroadcastRate,
    hasUnsavedChanges,
  } = useYjs({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
  });

  // Initialize dedicated cursor sync (bypasses Yjs for ultra-low latency)
  const { cursors: fastCursors, isConnected: cursorSyncConnected, sendCursor: sendFastCursor } = useCursorSync({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
    enabled: !!user && !!boardId, // Enable if user and board are loaded
  });

  // Re-fetch board members & global presence whenever someone disconnects
  const prevOnlineCountRef = useRef(0);
  useEffect(() => {
    const currentCount = onlineUsers.length;
    if (prevOnlineCountRef.current > currentCount && boardId) {
      fetchBoardMembers(boardId).then((members) => {
        setBoardMembers(members);
        const uids = members.map((m) => m.uid);
        fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
      }).catch(console.error);
    }
    prevOnlineCountRef.current = currentCount;
  }, [onlineUsers.length, boardId]);

  // Poll global presence every 30s so we detect when users go online/offline
  useEffect(() => {
    if (boardMembers.length === 0) return;
    const poll = () => {
      const uids = boardMembers.map((m) => m.uid);
      fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
    };
    poll(); // immediate
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [boardMembers]);
  
  const {
    selectedIds,
    selectObject,
    deselectAll,
    isSelected,
    selectByRect,
  } = useSelection();
  
  const { activeTool, setActiveTool, scale, position, snapToGrid, gridMode, setScale, setPosition, selectionRect } = useCanvasStore();
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const isCreatingFrame = useRef(false);
  const pendingFrameRect = useRef<typeof selectionRect>(null);
  
  // Selection Area - persistent selection rectangle
  const [selectionArea, setSelectionArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // ── Connector drawing state ──
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [drawingLineId, setDrawingLineId] = useState<string | null>(null);
  const [highlightedAnchor, setHighlightedAnchor] = useState<{ objectId: string; anchor: string } | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const drawingStartedAtRef = useRef<number>(0);

  // Track live drag positions for smooth line following during shape drag
  const liveDragRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const liveTransformRef = useRef<Map<string, { x: number; y: number; rotation: number; width?: number; height?: number; radius?: number }>>(new Map());
  // Track line points for live drag (for lines contained in frames)
  const liveLinePointsRef = useRef<Map<string, number[]>>(new Map());
  // Track initial frame position when drag starts (for calculating contained object deltas)
  const frameDragStartRef = useRef<Map<string, { x: number; y: number; containedInitialPositions: Map<string, { x: number; y: number; points?: number[] }> }>>(new Map());
  const [, setDragTick] = useState(0);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Listen for global transform events to hide connection dots
  useEffect(() => {
    const handleTransformStart = () => setIsTransforming(true);
    const handleTransformEnd = () => setIsTransforming(false);
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => {
      setIsDragging(false);
      // Clean up frame drag tracking if drag ends without updateFrameAndContents being called
      // (e.g., if drag is cancelled)
      frameDragStartRef.current.clear();
    };
    
    window.addEventListener('object-transform-start', handleTransformStart);
    window.addEventListener('object-transform-end', handleTransformEnd);
    window.addEventListener('object-drag-start', handleDragStart);
    window.addEventListener('object-drag-end', handleDragEnd);
    
    return () => {
      window.removeEventListener('object-transform-start', handleTransformStart);
      window.removeEventListener('object-transform-end', handleTransformEnd);
      window.removeEventListener('object-drag-start', handleDragStart);
      window.removeEventListener('object-drag-end', handleDragEnd);
    };
  }, []);
  
  // Redirect to login if not authenticated, or to verify-email if unverified
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.emailVerified && !user.isAnonymous) {
      router.push('/verify-email');
    }
  }, [user, authLoading, router]);
  
  // Close users dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (usersDropdownRef.current && !usersDropdownRef.current.contains(e.target as Node)) {
        setShowAllUsers(false);
      }
    };
    if (showAllUsers) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAllUsers]);

  // Cleanup frame warning timeout on unmount
  useEffect(() => {
    return () => {
      if (frameWarningTimeoutRef.current) {
        clearTimeout(frameWarningTimeoutRef.current);
      }
    };
  }, []);

  // Auto-fit canvas when objects first load
  const hasAutoFittedRef = useRef(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  useEffect(() => {
    if (hasAutoFittedRef.current || !mounted) return;
    
    // If no objects yet, wait a bit to see if they load
    if (objects.length === 0) {
      const timer = setTimeout(() => {
        // If still no objects after 1 second, show canvas at default zoom
        setIsInitializing(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
    
    // Objects loaded - calculate and apply immediately
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const autoFit = calculateAutoFit(objects, viewport.width, viewport.height);
    
    if (autoFit) {
      setScale(autoFit.scale);
      setPosition(autoFit.position);
      hasAutoFittedRef.current = true;
      console.log(`[Auto-fit] ${objects.length} objects, zoom: ${Math.round(autoFit.scale * 100)}%`);
    }
    
    setIsInitializing(false);
  }, [objects.length, mounted, setScale, setPosition]);

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const newTitle = e.target.value;
    setBoardTitle(newTitle);

    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      updateBoard(boardId, {
        title: newTitle,
        last_modified: new Date().toISOString(),
      }).catch(console.error);
    }, 500);
  };
  
  const handleShapeStrokeColorChange = (color: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && obj.type !== 'sticky') {
          updateObject(id, { stroke: color });
        }
      });
    }
    setShapeStrokeColor(color);
  };
  
  const handleShapeFillColorChange = (color: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'frame')) {
          // For frames, only update the frame fill, not contained objects
          updateObject(id, { fill: color });
        }
      });
    }
    setShapeFillColor(color);
  };

  const handleStickyColorChange = (color: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && obj.type === 'sticky') {
          updateObject(id, { color });
        }
      });
    }
  };
  
  const handleTextChange = (text: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
          updateObject(id, { text });
        }
      });
    }
  };

  const handleTextSizeChange = (size: number) => {
    const clamped = Math.max(12, Math.min(48, size));
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
          updateObject(id, { textSize: clamped });
        }
      });
    }
  };

  const handleTextFamilyChange = (family: 'Inter' | 'Poppins' | 'Merriweather') => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
          updateObject(id, { textFamily: family });
        }
      });
    }
  };
  
  const getPlacementCoordinates = useCallback(
    (pointerX: number, pointerY: number) => {
      const rawX = (pointerX - position.x) / scale;
      const rawY = (pointerY - position.y) / scale;
      const gridSpacing = gridMode === 'line' ? 40 : 24;
      const x = snapToGrid && gridMode !== 'none' ? Math.round(rawX / gridSpacing) * gridSpacing : rawX;
      const y = snapToGrid && gridMode !== 'none' ? Math.round(rawY / gridSpacing) * gridSpacing : rawY;
      return { x, y };
    },
    [position, scale, snapToGrid, gridMode]
  );

  const handleCanvasMouseMove = useCallback(
    (e: any) => {
      if (!activeTool || activeTool === 'select') {
        setPreviewPosition(null);
        return;
      }

      const stage = e.target.getStage();
      const pointerPosition = stage?.getPointerPosition();
      if (!pointerPosition) {
        setPreviewPosition(null);
        return;
      }

      // For frame tool, we still want to show cursor feedback but don't need preview shape
      if (activeTool === 'frame') {
        setPreviewPosition(getPlacementCoordinates(pointerPosition.x, pointerPosition.y));
      } else {
        setPreviewPosition(getPlacementCoordinates(pointerPosition.x, pointerPosition.y));
      }
    },
    [activeTool, getPlacementCoordinates]
  );

  useEffect(() => {
    if (!activeTool || activeTool === 'select') {
      setPreviewPosition(null);
    }
    // For frame tool, we want to keep previewPosition active for cursor feedback
  }, [activeTool]);

  // Build an objects map for resolving connector positions
  const objectsMap = useMemo(() => {
    const map = new Map<string, WhiteboardObject>();
    for (const obj of objects) map.set(obj.id, obj);
    return map;
  }, [objects]);

  // Get object bounds (needed for frame containment checks and frame creation)
  const getObjectBounds = useCallback((obj: WhiteboardObject, map: Map<string, WhiteboardObject>) => {
    const strokePad =
      'strokeWidth' in obj && typeof obj.strokeWidth === 'number'
        ? obj.strokeWidth / 2 + 2
        : 2;

    if (obj.type === 'circle') {
      return {
        minX: obj.x - obj.radius - strokePad,
        minY: obj.y - obj.radius - strokePad,
        maxX: obj.x + obj.radius + strokePad,
        maxY: obj.y + obj.radius + strokePad,
      };
    }

    if (obj.type === 'line') {
      const [x1, y1, x2, y2] = resolveLinePoints(obj, map);
      const pad = (obj.strokeWidth ?? 2) / 2 + 2;
      return {
        minX: Math.min(x1, x2) - pad,
        minY: Math.min(y1, y2) - pad,
        maxX: Math.max(x1, x2) + pad,
        maxY: Math.max(y1, y2) + pad,
      };
    }

    // Width/height objects rotate around top-left group origin (Konva default).
    // Use transformed corners so frame bounds include full rotated geometry.
    const rotation = obj.rotation || 0;
    const rotRad = (rotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const localCorners = [
      { x: 0, y: 0 },
      { x: obj.width, y: 0 },
      { x: obj.width, y: obj.height },
      { x: 0, y: obj.height },
    ];
    const worldCorners = localCorners.map((corner) => ({
      x: obj.x + corner.x * cosR - corner.y * sinR,
      y: obj.y + corner.x * sinR + corner.y * cosR,
    }));
    const xs = worldCorners.map((p) => p.x);
    const ys = worldCorners.map((p) => p.y);

    return {
      minX: Math.min(...xs) - strokePad,
      minY: Math.min(...ys) - strokePad,
      maxX: Math.max(...xs) + strokePad,
      maxY: Math.max(...ys) + strokePad,
    };
  }, []);

  const getConnectedObjectIds = useCallback((seedIds: string[], allObjects: WhiteboardObject[]) => {
    const result = new Set<string>(seedIds);
    const allMap = new Map<string, WhiteboardObject>(allObjects.map((obj) => [obj.id, obj]));
    const lineObjects = allObjects.filter((obj): obj is LineShape => obj.type === 'line');

    const pointInBounds = (
      x: number,
      y: number,
      bounds: { minX: number; minY: number; maxX: number; maxY: number }
    ) => {
      const tolerance = 10;
      return (
        x >= bounds.minX - tolerance &&
        x <= bounds.maxX + tolerance &&
        y >= bounds.minY - tolerance &&
        y <= bounds.maxY + tolerance
      );
    };

    const getClusterBounds = () => {
      const clusterIds = Array.from(result);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const id of clusterIds) {
        const obj = allMap.get(id);
        if (!obj || obj.type === 'frame') continue;
        const bounds = getObjectBounds(obj, allMap);
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
      }

      return { minX, minY, maxX, maxY };
    };

    let changed = true;
    while (changed) {
      changed = false;
      const clusterBounds = getClusterBounds();

      for (const line of lineObjects) {
        const lineId = line.id;
        const startId = line.startAnchor?.objectId;
        const endId = line.endAnchor?.objectId;

        const touchesClusterByAnchor =
          (!!startId && result.has(startId)) ||
          (!!endId && result.has(endId)) ||
          result.has(lineId);

        const lineBounds = getObjectBounds(line, allMap);
        const intersectsCluster = clusterBounds
          ? !(
              lineBounds.maxX < clusterBounds.minX ||
              lineBounds.minX > clusterBounds.maxX ||
              lineBounds.maxY < clusterBounds.minY ||
              lineBounds.minY > clusterBounds.maxY
            )
          : false;

        if (!touchesClusterByAnchor && !intersectsCluster) continue;

        if (!result.has(lineId)) {
          result.add(lineId);
          changed = true;
        }

        if (startId && !result.has(startId)) {
          result.add(startId);
          changed = true;
        }
        if (endId && !result.has(endId)) {
          result.add(endId);
          changed = true;
        }

        // If endpoints or line span geometrically touch an object, include that object too.
        const [x1, y1, x2, y2] = resolveLinePoints(line, allMap);
        const lineSpanBounds = {
          minX: Math.min(x1, x2),
          minY: Math.min(y1, y2),
          maxX: Math.max(x1, x2),
          maxY: Math.max(y1, y2),
        };
        for (const obj of allObjects) {
          if (obj.type === 'line' || obj.type === 'frame') continue;
          const bounds = getObjectBounds(obj, allMap);
          const lineOverlapsObject = !(
            lineSpanBounds.maxX < bounds.minX ||
            lineSpanBounds.minX > bounds.maxX ||
            lineSpanBounds.maxY < bounds.minY ||
            lineSpanBounds.minY > bounds.maxY
          );
          if (lineOverlapsObject || pointInBounds(x1, y1, bounds) || pointInBounds(x2, y2, bounds)) {
            if (!result.has(obj.id)) {
              result.add(obj.id);
              changed = true;
            }
          }
        }
      }
    }

    return Array.from(result);
  }, [getObjectBounds]);

  const handleCanvasClick = useCallback(
    (e: any) => {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      
      if (!pointerPosition) return;
      
      const { x, y } = getPlacementCoordinates(pointerPosition.x, pointerPosition.y);
      
      // Check if click is outside the selection area
      if (selectionArea) {
        const isOutsideSelectionArea = 
          x < selectionArea.x ||
          x > selectionArea.x + selectionArea.width ||
          y < selectionArea.y ||
          y > selectionArea.y + selectionArea.height;
        
        if (isOutsideSelectionArea) {
          setSelectionArea(null);
          deselectAll();
        }
      }
      
      if (e.target === stage) {
        deselectAll();
        
        if (activeTool === 'sticky') {
          const stickyNote: StickyNoteType = {
            id: generateId(),
            type: 'sticky',
            x,
            y,
            width: 200,
            height: 200,
            color: STICKY_COLORS.YELLOW,
            text: '',
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };
          
          createObject(stickyNote);
          setActiveTool('select');
        } else if (activeTool === 'rect') {
          const rect: RectShape = {
            id: generateId(),
            type: 'rect',
            x,
            y,
            width: 250,
            height: 150,
            fill: shapeFillColor,
            stroke: shapeStrokeColor,
            strokeWidth: 2,
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };
          
          createObject(rect);
          setActiveTool('select');
        } else if (activeTool === 'circle') {
          const circle: CircleShape = {
            id: generateId(),
            type: 'circle',
            x,
            y,
            radius: 80,
            fill: shapeFillColor,
            stroke: shapeStrokeColor,
            strokeWidth: 2,
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };
          
          createObject(circle);
          setActiveTool('select');
        } else if (activeTool === 'triangle') {
          const triangle: TriangleShape = {
            id: generateId(),
            type: 'triangle',
            x,
            y,
            width: 220,
            height: 180,
            fill: shapeFillColor,
            stroke: shapeStrokeColor,
            strokeWidth: 2,
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };

          createObject(triangle);
          setActiveTool('select');
        } else if (activeTool === 'star') {
          const star: StarShape = {
            id: generateId(),
            type: 'star',
            x,
            y,
            width: 180,
            height: 180,
            fill: shapeFillColor,
            stroke: shapeStrokeColor,
            strokeWidth: 2,
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };

          createObject(star);
          setActiveTool('select');
        } else if (activeTool === 'textBubble') {
          const textBubble: TextBubbleShape = {
            id: generateId(),
            type: 'textBubble',
            x,
            y,
            width: 220,
            height: 120,
            text: '',
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };

          createObject(textBubble);
          setActiveTool('select');
        }
      }
    },
    [activeTool, objects.length, objects, objectsMap, user, shapeFillColor, shapeStrokeColor, createObject, getPlacementCoordinates, setActiveTool, deselectAll, getConnectedObjectIds, getObjectBounds, selectObject, selectionArea]
  );

  // Show frame boundary warning
  const showFrameWarning = useCallback(() => {
    setFrameWarningVisible(true);
    if (frameWarningTimeoutRef.current) {
      clearTimeout(frameWarningTimeoutRef.current);
    }
    frameWarningTimeoutRef.current = setTimeout(() => {
      setFrameWarningVisible(false);
    }, 3000);
  }, []);

  // Find which frame contains an object (if any)
  const findContainingFrame = useCallback((objectId: string): FrameType | null => {
    if (!objects || objects.length === 0) return null;
    for (const obj of objects) {
      if (obj && obj.type === 'frame') {
        const frame = obj as FrameType;
        if (frame.containedObjectIds?.includes(objectId)) {
          return frame;
        }
      }
    }
    return null;
  }, [objects]);

  // Check if object bounds are within frame bounds
  const isObjectWithinFrame = useCallback((
    obj: WhiteboardObject,
    frame: FrameType,
    objX?: number,
    objY?: number,
    objPoints?: number[],
    map?: Map<string, WhiteboardObject>
  ): boolean => {
    const testObj = { ...obj };
    if (typeof objX === 'number') testObj.x = objX;
    if (typeof objY === 'number') testObj.y = objY;
    
    // For line objects, update points if provided
    if (obj.type === 'line' && objPoints) {
      (testObj as LineShape).points = objPoints;
    }
    
    // Create map from objects if not provided
    const objMap = map || new Map(objects.map((o) => [o.id, o]));
    const objBounds = getObjectBounds(testObj, objMap);
    const frameBounds = getObjectBounds(frame, objMap);
    
    // Check if object is completely within frame (with small padding)
    const padding = 5;
    return (
      objBounds.minX >= frameBounds.minX + padding &&
      objBounds.minY >= frameBounds.minY + padding &&
      objBounds.maxX <= frameBounds.maxX - padding &&
      objBounds.maxY <= frameBounds.maxY - padding
    );
  }, [getObjectBounds, objects]);
  
  // Update a shape and reposition any connected lines
  const updateShapeAndConnectors = useCallback(
    (shapeId: string, updates: Partial<WhiteboardObject>) => {
      // Clear live drag/transform positions — the real state is now being persisted
      liveDragRef.current.delete(shapeId);
      liveTransformRef.current.delete(shapeId);

      const currentObj = objects.find((o) => o.id === shapeId);
      if (!currentObj) return;

      // Check if object is contained in a frame and if new position would be outside
      const containingFrame = findContainingFrame(shapeId);
      if (containingFrame && (typeof updates.x === 'number' || typeof updates.y === 'number')) {
        const newX = typeof updates.x === 'number' ? updates.x : currentObj.x;
        const newY = typeof updates.y === 'number' ? updates.y : currentObj.y;
        const tempMap = new Map(objects.map((o) => [o.id, o]));
        const isWithin = isObjectWithinFrame(currentObj, containingFrame, newX, newY, undefined, tempMap);
        
        if (!isWithin) {
          // Don't update position if outside frame - revert to current position
          showFrameWarning();
          // Only update other properties, not position
          const { x, y, ...otherUpdates } = updates;
          if (Object.keys(otherUpdates).length > 0) {
            updateObject(shapeId, otherUpdates);
          }
          
          const updatedObj = { ...currentObj, ...otherUpdates } as WhiteboardObject;
          // Still update connected lines with current position
          for (const obj of objects) {
            if (obj.type !== 'line') continue;
            const line = obj as LineShape;
            const startConnected = line.startAnchor?.objectId === shapeId;
            const endConnected = line.endAnchor?.objectId === shapeId;
            if (!startConnected && !endConnected) continue;

            const tempMap = new Map(objects.map((o) => [o.id, o]));
            tempMap.set(shapeId, updatedObj);

            const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
            updateObject(line.id, { x: 0, y: 0, points: [x1, y1, x2, y2] });
          }
          return;
        }
      }

      updateObject(shapeId, updates);

      const updatedObj = { ...currentObj, ...updates } as WhiteboardObject;

      for (const obj of objects) {
        if (obj.type !== 'line') continue;
        const line = obj as LineShape;
        const startConnected = line.startAnchor?.objectId === shapeId;
        const endConnected = line.endAnchor?.objectId === shapeId;
        if (!startConnected && !endConnected) continue;

        const tempMap = new Map(objects.map((o) => [o.id, o]));
        tempMap.set(shapeId, updatedObj);

        const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
        updateObject(line.id, { x: 0, y: 0, points: [x1, y1, x2, y2] });
      }
    },
    [objects, updateObject, findContainingFrame, isObjectWithinFrame, showFrameWarning]
  );

  // Live-update connected lines while a shape is being dragged
  // Uses a ref so we bypass stale React state — just store position and trigger re-render
  const handleShapeDragMove = useCallback(
    (shapeId: string, liveX: number, liveY: number) => {
      const obj = objectsMap.get(shapeId);
      if (!obj) {
        liveDragRef.current.set(shapeId, { x: liveX, y: liveY });
        setDragTick((t) => t + 1);
        return;
      }

      // Check if object is contained in a frame
      const containingFrame = findContainingFrame(shapeId);
      if (containingFrame) {
        // Check if new position would be outside frame
        const tempMap = new Map(objects.map((o) => [o.id, o]));
        const isWithin = isObjectWithinFrame(obj, containingFrame, liveX, liveY, undefined, tempMap);
        if (!isWithin) {
          showFrameWarning();
        }
      }

      liveDragRef.current.set(shapeId, { x: liveX, y: liveY });
      setDragTick((t) => t + 1);
    },
    [objectsMap, findContainingFrame, isObjectWithinFrame, showFrameWarning]
  );

  // Live-update connected lines while a shape is being transformed (rotated/resized)
  const handleShapeTransformMove = useCallback(
    (shapeId: string, liveX: number, liveY: number, liveRotation: number, dimensions?: { width?: number; height?: number; radius?: number }) => {
      liveTransformRef.current.set(shapeId, { x: liveX, y: liveY, rotation: liveRotation, ...dimensions });
      setDragTick((t) => t + 1);
    },
    []
  );

  // Render frames behind all other objects so inner-object clicks are not stolen.
  const renderObjects = useMemo(() => {
    const frames = objects.filter((obj) => obj.type === 'frame');
    const others = objects.filter((obj) => obj.type !== 'frame');
    return [...frames, ...others];
  }, [objects]);

  // Check if any selected object is a frame, and if so, lock contained objects
  const selectedFrameIds = useMemo(() => {
    return selectedIds.filter((id) => {
      const obj = objectsMap.get(id);
      return obj?.type === 'frame';
    });
  }, [selectedIds, objectsMap]);

  const isObjectLockedByFrame = useCallback((objectId: string): boolean => {
    for (const frameId of selectedFrameIds) {
      const frame = objectsMap.get(frameId);
      if (frame?.type === 'frame' && frame.containedObjectIds?.includes(objectId)) {
        return true;
      }
    }
    return false;
  }, [selectedFrameIds, objectsMap]);

  const updateFrameAndContents = useCallback(
    (frameId: string, updates: Partial<FrameType>) => {
      const frame = objectsMap.get(frameId);
      if (!frame || frame.type !== 'frame') {
        updateObject(frameId, updates);
        return;
      }

      const prevX = frame.x;
      const prevY = frame.y;
      const nextX = typeof updates.x === 'number' ? updates.x : prevX;
      const nextY = typeof updates.y === 'number' ? updates.y : prevY;
      const deltaX = nextX - prevX;
      const deltaY = nextY - prevY;
      const isResizeOrRotate =
        typeof updates.width === 'number' ||
        typeof updates.height === 'number' ||
        typeof updates.rotation === 'number';

      // Clear live drag overlays once final values are persisted.
      liveDragRef.current.delete(frameId);
      frameDragStartRef.current.delete(frameId);
      
      // Clear live drag for contained objects
      if (frame.containedObjectIds) {
        for (const containedId of frame.containedObjectIds) {
          liveDragRef.current.delete(containedId);
          liveLinePointsRef.current.delete(containedId);
        }
      }

      updateObject(frameId, updates);
      
      // Move all contained objects when frame moves
      if ((deltaX !== 0 || deltaY !== 0) && !isResizeOrRotate && frame.containedObjectIds) {
        for (const containedId of frame.containedObjectIds) {
          const containedObj = objectsMap.get(containedId);
          if (!containedObj) continue;
          
          // Clear live drag overlay for contained object
          liveDragRef.current.delete(containedId);
          
          if (containedObj.type === 'line') {
            // Line objects use points array instead of x/y
            const line = containedObj as LineShape;
            const newPoints = [
              line.points[0] + deltaX,
              line.points[1] + deltaY,
              line.points[2] + deltaX,
              line.points[3] + deltaY,
            ];
            updateObject(containedId, { points: newPoints });
          } else {
            // Regular objects use x/y
            updateObject(containedId, {
              x: containedObj.x + deltaX,
              y: containedObj.y + deltaY,
            });
          }
        }
      }
    },
    [objectsMap, updateObject]
  );

  const handleFrameDragMove = useCallback(
    (frameId: string, liveX: number, liveY: number) => {
      const frame = objectsMap.get(frameId);
      if (!frame || frame.type !== 'frame') {
        liveDragRef.current.set(frameId, { x: liveX, y: liveY });
        setDragTick((t) => t + 1);
        return;
      }

      // Initialize drag start tracking if this is the first move
      let dragStart = frameDragStartRef.current.get(frameId);
      if (!dragStart) {
        const containedInitialPositions = new Map<string, { x: number; y: number; points?: number[] }>();
        if (frame.containedObjectIds) {
          for (const containedId of frame.containedObjectIds) {
            const containedObj = objectsMap.get(containedId);
            if (!containedObj) continue;
            if (containedObj.type === 'line') {
              containedInitialPositions.set(containedId, { 
                x: containedObj.x, 
                y: containedObj.y,
                points: [...(containedObj as LineShape).points]
              });
            } else {
              containedInitialPositions.set(containedId, { 
                x: containedObj.x, 
                y: containedObj.y 
              });
            }
          }
        }
        dragStart = {
          x: frame.x,
          y: frame.y,
          containedInitialPositions,
        };
        frameDragStartRef.current.set(frameId, dragStart);
      }

      // Calculate delta from initial frame position
      const deltaX = liveX - dragStart.x;
      const deltaY = liveY - dragStart.y;

      // Move frame visually during drag (persist on drag end).
      liveDragRef.current.set(frameId, { x: liveX, y: liveY });

      // Move all contained objects during live drag
      if ((deltaX !== 0 || deltaY !== 0) && frame.containedObjectIds) {
        for (const containedId of frame.containedObjectIds) {
          const initialPos = dragStart.containedInitialPositions.get(containedId);
          if (!initialPos) continue;
          
          if (initialPos.points) {
            // Line object - update points array
            const newPoints = [
              initialPos.points[0] + deltaX,
              initialPos.points[1] + deltaY,
              initialPos.points[2] + deltaX,
              initialPos.points[3] + deltaY,
            ];
            liveLinePointsRef.current.set(containedId, newPoints);
          } else {
            // Regular object - update x/y
            liveDragRef.current.set(containedId, {
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY,
            });
          }
        }
      }

      setDragTick((t) => t + 1);
    },
    [objectsMap]
  );

  // Overlay live drag positions on top of objectsMap for smooth line rendering
  // Computed every render (cheap — only iterates liveDragRef entries)
  const liveObjectsMap: Map<string, WhiteboardObject> = liveDragRef.current.size === 0 && liveTransformRef.current.size === 0 && liveLinePointsRef.current.size === 0
    ? objectsMap
    : (() => {
        const map = new Map(objectsMap);
        liveDragRef.current.forEach((pos, id) => {
          const obj = map.get(id);
          if (obj) map.set(id, { ...obj, x: pos.x, y: pos.y } as WhiteboardObject);
        });
        liveLinePointsRef.current.forEach((points, id) => {
          const obj = map.get(id);
          if (obj && obj.type === 'line') {
            map.set(id, { ...obj, points } as WhiteboardObject);
          }
        });
        liveTransformRef.current.forEach((transform, id) => {
          const obj = map.get(id);
          if (obj) {
            const updates: any = { x: transform.x, y: transform.y, rotation: transform.rotation };
            if (transform.width !== undefined) updates.width = transform.width;
            if (transform.height !== undefined) updates.height = transform.height;
            if (transform.radius !== undefined) updates.radius = transform.radius;
            map.set(id, { ...obj, ...updates } as WhiteboardObject);
          }
        });
        return map;
      })();

  // Click a dot to start drawing, click again to finish (two-click flow)
  const handleAnchorMouseDown = useCallback(
    (objectId: string, anchor: string, anchorX: number, anchorY: number) => {
      // If already drawing, treat this as finishing on this anchor
      if (isDrawingLine && drawingLineId) {
        const line = objectsMap.get(drawingLineId) as LineShape | undefined;
        if (line && objectId !== line.startAnchor?.objectId) {
          updateObject(drawingLineId, {
            endAnchor: { objectId, anchor: anchor as AnchorPosition },
            points: [line.points[0], line.points[1], anchorX, anchorY],
          });
        }
        setIsDrawingLine(false);
        setDrawingLineId(null);
        setHighlightedAnchor(null);
        return;
      }

      // Start a new connector line
      const lineId = generateId();
      const line: LineShape = {
        id: lineId,
        type: 'line',
        x: 0,
        y: 0,
        points: [anchorX, anchorY, anchorX, anchorY],
        stroke: shapeStrokeColor,
        strokeWidth: 3,
        rotation: 0,
        zIndex: objects.length,
        createdBy: user?.uid || '',
        createdAt: Date.now(),
        startAnchor: { objectId, anchor: anchor as AnchorPosition },
      };
      createObject(line);
      setDrawingLineId(lineId);
      setIsDrawingLine(true);
      drawingStartedAtRef.current = Date.now();
      setActiveTool('select');
    },
    [isDrawingLine, drawingLineId, objectsMap, shapeStrokeColor, objects.length, user, createObject, updateObject, setActiveTool]
  );

  const handleMouseMove = useCallback(
    (e: any) => {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      
      if (!pointerPosition) return;
      
      const x = (pointerPosition.x - position.x) / scale;
      const y = (pointerPosition.y - position.y) / scale;
      
      // Use fast cursor sync if connected, otherwise fall back to Yjs awareness
      if (cursorSyncConnected) {
        sendFastCursor(x, y);
      } else {
        updateCursor(x, y);
      }

      // While drawing a connector line, update the end point to follow cursor
      if (isDrawingLine && drawingLineId) {
        const line = objectsMap.get(drawingLineId) as LineShape | undefined;
        if (line) {
          const nearest = findNearestAnchor(x, y, objects, [drawingLineId, line.startAnchor?.objectId || '']);
          if (nearest) {
            setHighlightedAnchor({ objectId: nearest.objectId, anchor: nearest.anchor });
            updateObject(drawingLineId, {
              points: [line.points[0], line.points[1], nearest.x, nearest.y],
            });
          } else {
            setHighlightedAnchor(null);
            updateObject(drawingLineId, {
              points: [line.points[0], line.points[1], x, y],
            });
          }
        }
      }
    },
    [position, scale, updateCursor, cursorSyncConnected, sendFastCursor, isDrawingLine, drawingLineId, objectsMap, objects, updateObject]
  );

  // Second click on empty canvas finishes the line (free endpoint with arrow)
  const handleConnectorClick = useCallback(
    (e: any) => {
      if (!isDrawingLine || !drawingLineId) return;

      // Ignore the click that comes from the same mouseDown that started drawing
      if (Date.now() - drawingStartedAtRef.current < 300) return;

      const stage = e.target.getStage();
      const pointerPosition = stage?.getPointerPosition();
      if (!pointerPosition) return;

      const x = (pointerPosition.x - position.x) / scale;
      const y = (pointerPosition.y - position.y) / scale;

      const line = objectsMap.get(drawingLineId) as LineShape | undefined;
      if (!line) {
        setIsDrawingLine(false);
        setDrawingLineId(null);
        setHighlightedAnchor(null);
        return;
      }

      // Check if near an anchor
      const nearest = findNearestAnchor(x, y, objects, [drawingLineId, line.startAnchor?.objectId || '']);
      if (nearest) {
        updateObject(drawingLineId, {
          endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
          points: [line.points[0], line.points[1], nearest.x, nearest.y],
        });
      } else {
        updateObject(drawingLineId, {
          points: [line.points[0], line.points[1], x, y],
        });
      }

      setIsDrawingLine(false);
      setDrawingLineId(null);
      setHighlightedAnchor(null);
    },
    [isDrawingLine, drawingLineId, position, scale, objectsMap, objects, updateObject]
  );
  
  // Endpoint drag handler — called while dragging a line's start/end handle
  const handleEndpointDrag = useCallback(
    (lineId: string, endpoint: 'start' | 'end', canvasX: number, canvasY: number) => {
      const line = objectsMap.get(lineId) as LineShape | undefined;
      const excludeIds = [lineId];
      if (endpoint === 'start' && line?.endAnchor) excludeIds.push(line.endAnchor.objectId);
      if (endpoint === 'end' && line?.startAnchor) excludeIds.push(line.startAnchor.objectId);

      const nearest = findNearestAnchor(canvasX, canvasY, objects, excludeIds);
      if (nearest) {
        setHighlightedAnchor({ objectId: nearest.objectId, anchor: nearest.anchor });
        return nearest;
      }
      setHighlightedAnchor(null);
      return null;
    },
    [objectsMap, objects]
  );

  // Endpoint drag end — finalize connection or leave free
  const handleEndpointDragEnd = useCallback(
    (lineId: string, endpoint: 'start' | 'end', canvasX: number, canvasY: number) => {
      const line = objectsMap.get(lineId) as LineShape | undefined;
      if (!line) { setHighlightedAnchor(null); return; }

      const excludeIds = [lineId];
      if (endpoint === 'start' && line.endAnchor) excludeIds.push(line.endAnchor.objectId);
      if (endpoint === 'end' && line.startAnchor) excludeIds.push(line.startAnchor.objectId);

      const nearest = findNearestAnchor(canvasX, canvasY, objects, excludeIds);
      if (nearest) {
        if (endpoint === 'start') {
          updateObject(lineId, {
            startAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [nearest.x, nearest.y, line.points[2], line.points[3]],
            x: 0, y: 0,
          });
        } else {
          updateObject(lineId, {
            endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [line.points[0], line.points[1], nearest.x, nearest.y],
            x: 0, y: 0,
          });
        }
      } else {
        // Free endpoint — clear anchor
        if (endpoint === 'start') {
          updateObject(lineId, { startAnchor: undefined });
        } else {
          updateObject(lineId, { endAnchor: undefined });
        }
      }
      setHighlightedAnchor(null);
    },
    [objectsMap, objects, updateObject]
  );

  const intersectsRect = useCallback(
    (obj: WhiteboardObject, rect: { x: number; y: number; width: number; height: number }, map: Map<string, WhiteboardObject>) => {
      const bounds = getObjectBounds(obj, map);
      return !(
        bounds.maxX < rect.x ||
        bounds.minX > rect.x + rect.width ||
        bounds.maxY < rect.y ||
        bounds.minY > rect.y + rect.height
      );
    },
    [getObjectBounds]
  );

  // Handle Selection Area - create persistent selection area when dragging in select mode
  useEffect(() => {
    // When selectionRect becomes null after being set, check if we should create a selection area
    if (!selectionRect && pendingFrameRect.current && activeTool === 'select' && !isCreatingFrame.current) {
      const rect = pendingFrameRect.current;
      pendingFrameRect.current = null;
      
      // Only create selection area if rectangle is large enough
      if (rect.width >= 10 && rect.height >= 10) {
        setSelectionArea(rect);
        // Select objects within the selection area
        selectByRect(objects, rect);
      }
    }
  }, [selectionRect, activeTool, objects, selectByRect]);

  // Create frame from drag selection (in select mode or frame mode), expand to connected graph.
  useEffect(() => {
    if (selectionRect) {
      pendingFrameRect.current = selectionRect;
      return;
    }

    // Only create frame if we have a pending rect and activeTool is 'select' or 'frame'
    // Skip if we're in select mode (that's handled by selection area above)
    if (!pendingFrameRect.current || isCreatingFrame.current || activeTool !== 'frame' || !user) return;

    const rect = pendingFrameRect.current;
    pendingFrameRect.current = null;

    if (rect.width < 10 || rect.height < 10) {
      isCreatingFrame.current = false;
      return;
    }

    isCreatingFrame.current = true;

    const initialIds: string[] = [];
    let hasFrameInSelection = false;

    for (const obj of objects) {
      if (obj.type === 'frame') {
        if (intersectsRect(obj, rect, objectsMap)) hasFrameInSelection = true;
        continue;
      }
      if (intersectsRect(obj, rect, objectsMap)) initialIds.push(obj.id);
    }

    // In frame mode, always create a frame. In select mode, only if there are objects selected.
    if (activeTool === 'frame') {
      // In frame mode, create frame even if no objects are selected (empty frame)
      if (hasFrameInSelection) {
        isCreatingFrame.current = false;
        return;
      }
    } else {
      // In select mode, require objects to be selected
      if (hasFrameInSelection || initialIds.length === 0) {
        isCreatingFrame.current = false;
        return;
      }
    }

    // In frame mode, use the drag rectangle directly. In select mode, expand to connected objects.
    let containedObjectIds: string[];
    let minX: number, minY: number, maxX: number, maxY: number;

    if (activeTool === 'frame') {
      // In frame mode, use the drag rectangle bounds directly
      containedObjectIds = initialIds.length > 0 ? getConnectedObjectIds(initialIds, objects) : [];
      minX = rect.x;
      minY = rect.y;
      maxX = rect.x + rect.width;
      maxY = rect.y + rect.height;

      // If there are objects, calculate bounds from objects instead
      if (containedObjectIds.length > 0) {
        minX = Infinity;
        minY = Infinity;
        maxX = -Infinity;
        maxY = -Infinity;

        for (const id of containedObjectIds) {
          const obj = objectsMap.get(id);
          if (!obj || obj.type === 'frame') continue;
          const bounds = getObjectBounds(obj, objectsMap);
          minX = Math.min(minX, bounds.minX);
          minY = Math.min(minY, bounds.minY);
          maxX = Math.max(maxX, bounds.maxX);
          maxY = Math.max(maxY, bounds.maxY);
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
          isCreatingFrame.current = false;
          return;
        }
      }
    } else {
      // In select mode, expand to connected objects
      containedObjectIds = getConnectedObjectIds(initialIds, objects);
      if (containedObjectIds.length === 0) {
        isCreatingFrame.current = false;
        return;
      }

      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;

      for (const id of containedObjectIds) {
        const obj = objectsMap.get(id);
        if (!obj || obj.type === 'frame') continue;
        const bounds = getObjectBounds(obj, objectsMap);
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        isCreatingFrame.current = false;
        return;
      }
    }

    const padding = 20;
    const now = Date.now();
    
    // Generate default frame name (frame1, frame2, etc.)
    const frameCount = objects.filter(obj => obj.type === 'frame').length + 1;
    const frameName = `frame${frameCount}`;
    
    const frame: FrameType = {
      id: generateId(),
      type: 'frame',
      x: minX - padding,
      y: minY - padding,
      width: Math.max(50, maxX - minX + padding * 2),
      height: Math.max(50, maxY - minY + padding * 2),
      rotation: 0,
      stroke: '#3b82f6',
      strokeWidth: 2,
      fill: '#FFFFFF',
      containedObjectIds,
      name: frameName,
      zIndex: -1,
      createdBy: user.uid,
      createdAt: now,
      modifiedAt: now,
    };

    createObject(frame);
    selectObject(frame.id, false);
    setActiveTool('select');
    isCreatingFrame.current = false;
  }, [selectionRect, activeTool, user, objects, objectsMap, createObject, selectObject, setActiveTool, intersectsRect, getConnectedObjectIds, getObjectBounds]);

  const getDeleteIds = useCallback(() => {
    const idsToDelete: string[] = [];
    const idsToDeleteSet = new Set<string>();
    const containedInSelectedFrames = new Set<string>();

    // First pass: identify frames and mark their contained objects
    selectedIds.forEach((id) => {
      const obj = objectsMap.get(id);
      if (obj?.type === 'frame') {
        // Mark all contained objects as being deleted with their frame
        obj.containedObjectIds.forEach((containedId) => {
          containedInSelectedFrames.add(containedId);
        });
      }
    });

    // Second pass: collect IDs to delete
    selectedIds.forEach((id) => {
      const obj = objectsMap.get(id);
      if (obj?.type === 'frame') {
        // When deleting a frame, also delete all contained objects
        idsToDeleteSet.add(id);
        obj.containedObjectIds.forEach((containedId) => {
          idsToDeleteSet.add(containedId);
        });
      } else {
        // For non-frame objects, only delete if they're not contained in a selected frame
        // (if they are, they'll be deleted with the frame above)
        if (!containedInSelectedFrames.has(id)) {
          idsToDeleteSet.add(id);
        }
      }
    });

    // Convert set to array
    idsToDeleteSet.forEach((id) => idsToDelete.push(id));

    return idsToDelete;
  }, [selectedIds, objectsMap]);

  // Helper to check if target is an editable element
  const isEditableElement = (target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      element.isContentEditable
    );
  };

  // Clipboard refs (must be defined before functions that use them)
  const clipboardRef = useRef<WhiteboardObject[]>([]);
  const pasteCountRef = useRef(0);

  // Show copy toast notification
  const showCopyToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
    }, 1300);
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  // Get current canvas cursor position
  const getCurrentCanvasCursor = useCallback(() => {
    const viewportCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
    const viewportCenterY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
    return {
      x: (viewportCenterX - position.x) / scale,
      y: (viewportCenterY - position.y) / scale,
    };
  }, [position, scale]);

  // Clone objects including frames and their contained objects
  const cloneObjectsAtPoint = useCallback((
    source: WhiteboardObject[],
    target: { x: number; y: number },
    userId: string
  ): WhiteboardObject[] => {
    // Calculate bounds of all source objects
    let minX = Infinity;
    let minY = Infinity;
    for (const obj of source) {
      if (obj.type === 'line') {
        const line = obj as LineShape;
        minX = Math.min(minX, line.points[0], line.points[2]);
        minY = Math.min(minY, line.points[1], line.points[3]);
      } else {
        minX = Math.min(minX, obj.x);
        minY = Math.min(minY, obj.y);
      }
    }
    
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [];
    
    const dx = target.x - minX;
    const dy = target.y - minY;

    const idMap = new Map<string, string>();
    const allObjectsToClone: WhiteboardObject[] = [];
    
    // First pass: collect all objects including contained objects in frames
    for (const obj of source) {
      idMap.set(obj.id, generateId());
      allObjectsToClone.push(obj);
      
      // If it's a frame, also clone contained objects
      if (obj.type === 'frame') {
        const frame = obj as FrameType;
        for (const containedId of frame.containedObjectIds || []) {
          if (!idMap.has(containedId)) {
            const containedObj = objectsMap.get(containedId);
            if (containedObj) {
              idMap.set(containedId, generateId());
              allObjectsToClone.push(containedObj);
            }
          }
        }
      }
    }

    const now = Date.now();
    const cloned: WhiteboardObject[] = [];
    
    for (const obj of allObjectsToClone) {
      const newId = idMap.get(obj.id)!;
      const baseMeta = {
        ...obj,
        id: newId,
        zIndex: obj.zIndex + cloned.length + 1,
        createdBy: userId,
        createdAt: now,
        modifiedAt: now,
      };

      if (obj.type === 'line') {
        const line = obj as LineShape;
        const clonedStart = line.startAnchor && idMap.has(line.startAnchor.objectId)
          ? { ...line.startAnchor, objectId: idMap.get(line.startAnchor.objectId)! }
          : undefined;
        const clonedEnd = line.endAnchor && idMap.has(line.endAnchor.objectId)
          ? { ...line.endAnchor, objectId: idMap.get(line.endAnchor.objectId)! }
          : undefined;
        cloned.push({
          ...baseMeta,
          x: line.x + dx,
          y: line.y + dy,
          points: [
            line.points[0] + dx,
            line.points[1] + dy,
            line.points[2] + dx,
            line.points[3] + dy,
          ],
          startAnchor: clonedStart,
          endAnchor: clonedEnd,
        } as WhiteboardObject);
      } else if (obj.type === 'frame') {
        const frame = obj as FrameType;
        // Update containedObjectIds to use new IDs
        const newContainedIds = (frame.containedObjectIds || []).map(id => idMap.get(id) || id);
        // Generate new frame name
        const frameCount = objects.filter(o => o.type === 'frame').length + cloned.filter(o => o.type === 'frame').length + 1;
        cloned.push({
          ...baseMeta,
          x: frame.x + dx,
          y: frame.y + dy,
          containedObjectIds: newContainedIds,
          name: `frame${frameCount}`,
        } as WhiteboardObject);
      } else {
        cloned.push({
          ...baseMeta,
          x: obj.x + dx,
          y: obj.y + dy,
        } as WhiteboardObject);
      }
    }
    
    return cloned;
  }, [objectsMap, objects]);

  // Copy selected objects to clipboard
  const copySelectedObjects = useCallback(async () => {
    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    if (selectedObjects.length === 0) return;
    
    // Store in memory clipboard for internal paste
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 0;
    
    // Copy to system clipboard using Clipboard API
    try {
      const clipboardData = JSON.stringify(selectedObjects);
      await navigator.clipboard.writeText(clipboardData);
      // Show success toast
      showCopyToast();
    } catch (err) {
      // Fallback: clipboard API might not be available (e.g., non-HTTPS)
      console.warn('Failed to copy to system clipboard:', err);
      // Still show toast even if clipboard API failed (memory clipboard worked)
      showCopyToast();
    }
  }, [selectedIds, objects, showCopyToast]);

  // Paste objects from clipboard
  const pasteClipboardObjects = useCallback(async () => {
    if (!user) return;
    
    // Try to read from system clipboard first
    let objectsToPaste: WhiteboardObject[] = [];
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        try {
          const parsed = JSON.parse(clipboardText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            objectsToPaste = parsed;
          }
        } catch {
          // Not valid JSON, fall back to memory clipboard
        }
      }
    } catch (err) {
      // Clipboard API might not be available, fall back to memory clipboard
    }
    
    // Fall back to memory clipboard if system clipboard didn't work
    if (objectsToPaste.length === 0 && clipboardRef.current.length > 0) {
      objectsToPaste = clipboardRef.current;
    }
    
    if (objectsToPaste.length === 0) return;
    
    // Clone objects at current cursor position
    const cloned = cloneObjectsAtPoint(objectsToPaste, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;
    
    // Create cloned objects
    cloned.forEach((obj) => createObject(obj));
    
    // Select the last pasted object
    if (cloned.length > 0) {
      deselectAll();
      selectObject(cloned[cloned.length - 1].id, false);
    }
    
    pasteCountRef.current += 1;
  }, [user, cloneObjectsAtPoint, getCurrentCanvasCursor, createObject, deselectAll, selectObject]);

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.getElementById('inline-shape-editor')) {
        return;
      }
      
      // Don't handle shortcuts when editing text in input/textarea
      if (isEditableElement(e.target)) return;

      // Escape cancels line drawing
      if (e.key === 'Escape' && isDrawingLine && drawingLineId) {
        deleteObjects([drawingLineId]);
        setIsDrawingLine(false);
        setDrawingLineId(null);
        setHighlightedAnchor(null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          deleteObjects(getDeleteIds());
          deselectAll();
          setSelectionArea(null); // Clear selection area after deletion
        }
      }

      // Handle copy (Ctrl+C / Cmd+C)
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      if (isMetaOrCtrl && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          copySelectedObjects();
        }
      }

      // Handle paste (Ctrl+V / Cmd+V)
      if (isMetaOrCtrl && e.key.toLowerCase() === 'v') {
        // Always try to paste (will check both system clipboard and memory clipboard)
        e.preventDefault();
        pasteClipboardObjects();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, deleteObjects, deselectAll, isDrawingLine, drawingLineId, getDeleteIds, copySelectedObjects, pasteClipboardObjects]);
  
  const duplicateSelectedObjects = useCallback(() => {
    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    if (selectedObjects.length === 0 || !user) return;
    const cloned = cloneObjectsAtPoint(selectedObjects, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;
    cloned.forEach((obj) => createObject(obj));
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 1;
    deselectAll();
    // Select the last cloned object (usually the frame if frames were cloned)
    if (cloned.length > 0) {
      selectObject(cloned[cloned.length - 1].id, false);
    }
  }, [selectedIds, objects, user, cloneObjectsAtPoint, getCurrentCanvasCursor, createObject, deselectAll, selectObject]);

  const handleDelete = useCallback(() => {
    if (selectedIds.length > 0) {
      deleteObjects(getDeleteIds());
      deselectAll();
      setSelectionArea(null); // Clear selection area after deletion
    }
  }, [selectedIds, getDeleteIds, deleteObjects, deselectAll]);

  // ── Build merged collaborator list (viewing → online → offline) ──
  // Remember every user we've ever seen viewing this board in this session
  for (const state of onlineUsers) {
    seenUsersRef.current.set(state.user.id, {
      name: state.user.name,
      color: state.user.color,
    });
  }

  type PresenceStatus = 'viewing' | 'online' | 'offline';
  type CollabUser = {
    uid: string;
    name: string;
    color: string;
    status: PresenceStatus;
    isYou: boolean;
  };

  const viewingIds = new Set(onlineUsers.map((s) => s.user.id));

  const getStatus = (uid: string): PresenceStatus => {
    if (viewingIds.has(uid)) return 'viewing';
    if (globalOnlineUids.has(uid)) return 'online';
    return 'offline';
  };

  const collaborators: CollabUser[] = [];
  const addedUids = new Set<string>();

  // 1) Users currently viewing this board (Yjs awareness)
  for (const state of onlineUsers) {
    if (addedUids.has(state.user.id)) continue;
    addedUids.add(state.user.id);
    collaborators.push({
      uid: state.user.id,
      name: state.user.name,
      color: state.user.color,
      status: 'viewing',
      isYou: state.user.id === user?.uid,
    });
  }

  // 2) Previously-seen users who left this board
  Array.from(seenUsersRef.current.entries()).forEach(([uid, info]) => {
    if (addedUids.has(uid)) return;
    addedUids.add(uid);
    collaborators.push({
      uid,
      name: info.name,
      color: info.color,
      status: getStatus(uid),
      isYou: uid === user?.uid,
    });
  });

  // 3) Board members from Supabase who weren't seen in this session
  for (const member of boardMembers) {
    if (addedUids.has(member.uid)) continue;
    addedUids.add(member.uid);
    const name = member.displayName || member.email?.split('@')[0] || 'Unknown';
    collaborators.push({
      uid: member.uid,
      name,
      color: getUserColor(member.uid),
      status: getStatus(member.uid),
      isYou: member.uid === user?.uid,
    });
  }

  const MAX_VISIBLE = 4;
  const visibleCollabs = collaborators.slice(0, MAX_VISIBLE);
  const overflowCount = collaborators.length - MAX_VISIBLE;
  
  if (!mounted || authLoading || !user || (!user.emailVerified && !user.isAnonymous)) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen relative bg-white" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      {/* Copy Toast Notification */}
      {copyToastVisible && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.173 10.414 3.29 7.53l-.707.707L6.173 11.83l6.414-6.414-.707-.707z" />
              </svg>
            </span>
            Copied to clipboard
          </div>
        </div>
      )}
      <DisconnectBanner status={connectionStatus} />
      
      {/* Frame boundary warning popup */}
      {frameWarningVisible && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-semibold text-yellow-800">
              You are moving shape outside of the frame.
            </p>
          </div>
        </div>
      )}
      
      {/* Top Header Bar */}
      <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 py-2.5 px-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToDashboard}
            className="p-2 rounded-lg transition-colors hover:bg-gray-100"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <input
            type="text"
            value={boardTitle}
            onChange={handleTitleChange}
            readOnly={!isOwner}
            disabled={!isOwner}
            className={`text-lg font-bold text-gray-900 bg-transparent border-none outline-none px-2 py-1 rounded ${
              isOwner
                ? 'hover:bg-gray-100 cursor-text'
                : 'cursor-default opacity-100'
            }`}
            placeholder="Untitled Board"
            title={isOwner ? 'Click to rename' : 'Only the board owner can rename'}
          />
        </div>
        
        <div className="flex items-center gap-4">
          {/* Collaborator avatars */}
          <div className="relative" ref={usersDropdownRef}>
            <button
              onClick={() => setShowAllUsers((prev) => !prev)}
              className="flex items-center focus:outline-none"
              title="View collaborators"
            >
              <div className="flex -space-x-2">
                {visibleCollabs.map((c, i) => (
                  <div
                    key={c.uid}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm relative hover:z-20 hover:scale-110 transition-transform ${
                      c.status === 'offline' ? 'text-gray-400' : 'text-white'
                    }`}
                    style={{
                      backgroundColor:
                        c.status === 'viewing' ? c.color
                        : c.status === 'online' ? c.color
                        : '#e5e7eb',
                      zIndex: MAX_VISIBLE - i,
                      opacity: c.status === 'offline' ? 0.7 : c.status === 'online' ? 0.85 : 1,
                    }}
                    title={
                      c.name +
                      (c.isYou ? ' (You)' : '') +
                      (c.status === 'viewing' ? ' — Viewing' : c.status === 'online' ? ' — Online' : ' — Offline')
                    }
                  >
                    {c.name.charAt(0).toUpperCase()}
                    {c.status === 'online' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white" />
                    )}
                    {c.status === 'viewing' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border border-white" />
                    )}
                  </div>
                ))}

                {overflowCount > 0 && (
                  <div
                    className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold border-2 border-white shadow-sm hover:bg-gray-300 transition-colors relative z-0"
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>
            </button>

            {/* Dropdown listing all collaborators with 3-state presence */}
            {showAllUsers && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-3 px-1 min-w-[260px] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 pb-2 mb-1 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Collaborators — {collaborators.length}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {collaborators.map((c) => (
                    <div
                      key={c.uid}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          c.status === 'offline' ? 'text-gray-400' : 'text-white'
                        }`}
                        style={{
                          backgroundColor:
                            c.status === 'viewing' ? c.color
                            : c.status === 'online' ? c.color
                            : '#e5e7eb',
                          opacity: c.status === 'online' ? 0.85 : 1,
                        }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-gray-800 truncate leading-tight">
                          {c.name}
                          {c.isYou && (
                            <span className="text-gray-400 ml-1 text-xs">(You)</span>
                          )}
                        </span>
                        <span className={`text-[11px] leading-tight ${
                          c.status === 'viewing' ? 'text-green-600'
                          : c.status === 'online' ? 'text-amber-500'
                          : 'text-gray-400'
                        }`}>
                          {c.status === 'viewing' ? 'Viewing this board'
                           : c.status === 'online' ? 'Online'
                           : 'Offline'}
                        </span>
                      </div>
                      <span
                        className={`ml-auto w-2 h-2 rounded-full shrink-0 ${
                          c.status === 'viewing' ? 'bg-green-400'
                          : c.status === 'online' ? 'bg-amber-400'
                          : 'bg-gray-300'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-gray-300">|</span>
          <div className="text-xs text-gray-500">
            Zoom: <strong>{Math.round(scale * 100)}%</strong>
          </div>
          <span className="text-gray-300">|</span>
          <div className="text-xs text-gray-500">
            Objects: <strong>{objects.length}</strong>
          </div>
          <span className="text-gray-300">|</span>
          <LatencyStatusButton
            connectionStatus={connectionStatus}
            awareness={awareness}
            currentUserId={user.uid}
            getBroadcastRate={getBroadcastRate}
          />
        </div>
      </div>

      <Toolbar onDelete={handleDelete} selectedCount={selectedIds.length} />
      
      <ZoomControl />
      
      <Cursors
        awareness={awareness}
        currentUserId={user.uid}
        scale={scale}
        position={position}
        cursors={fastCursors}
        useFastCursors={cursorSyncConnected}  // Use fast cursors if connected
      />
      
      {/* Properties Sidebar - shows when objects selected */}
      {/* Show selection area properties when selection area is active */}
      {selectionArea && selectedIds.length > 0 && (
        <PropertiesSidebar
          selectedObjects={objects.filter(obj => selectedIds.includes(obj.id))}
          onStrokeColorChange={handleShapeStrokeColorChange}
          onFillColorChange={handleShapeFillColorChange}
          onStickyColorChange={handleStickyColorChange}
          onTextChange={handleTextChange}
          onTextSizeChange={handleTextSizeChange}
          onTextFamilyChange={handleTextFamilyChange}
          onDelete={handleDelete}
          onDuplicate={duplicateSelectedObjects}
          onCopy={copySelectedObjects}
          isSelectionArea={true}
        />
      )}
      
      {/* Show regular properties sidebar when no selection area */}
      {!selectionArea && selectedIds.length > 0 && (
        <PropertiesSidebar
          selectedObjects={objects.filter(obj => selectedIds.includes(obj.id))}
          onStrokeColorChange={handleShapeStrokeColorChange}
          onFillColorChange={handleShapeFillColorChange}
          onStickyColorChange={handleStickyColorChange}
          onTextChange={handleTextChange}
          onTextSizeChange={handleTextSizeChange}
          onTextFamilyChange={handleTextFamilyChange}
          onDelete={handleDelete}
          onDuplicate={objects.filter(obj => selectedIds.includes(obj.id)).some(obj => obj.type === 'frame') ? undefined : duplicateSelectedObjects}
          onCopy={objects.filter(obj => selectedIds.includes(obj.id)).some(obj => obj.type === 'frame') ? undefined : copySelectedObjects}
        />
      )}

      {/* Loading overlay while initializing zoom */}
      {isInitializing && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading board...</p>
          </div>
        </div>
      )}

      <Canvas 
        boardId={boardId} 
        objects={objects}
        onClick={(e) => {
          if (isDrawingLine) {
            handleConnectorClick(e);
          } else {
            handleCanvasClick(e);
          }
        }}
        onMouseMove={(e) => {
          handleMouseMove(e);
          handleCanvasMouseMove(e);
        }}
      >
        {previewPosition && activeTool === 'sticky' ? (
          <KonvaRect
            x={previewPosition.x}
            y={previewPosition.y}
            width={200}
            height={200}
            fill="#fde68a"
            opacity={0.3}
            stroke="#b45309"
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}

        {previewPosition && activeTool === 'rect' ? (
          <KonvaRect
            x={previewPosition.x}
            y={previewPosition.y}
            width={250}
            height={150}
            fill={shapeFillColor}
            opacity={0.25}
            stroke={shapeStrokeColor}
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}

        {previewPosition && activeTool === 'circle' ? (
          <KonvaCircle
            x={previewPosition.x}
            y={previewPosition.y}
            radius={80}
            fill={shapeFillColor}
            opacity={0.25}
            stroke={shapeStrokeColor}
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}

        {previewPosition && activeTool === 'triangle' ? (
          <KonvaLine
            x={previewPosition.x}
            y={previewPosition.y}
            points={[110, 0, 220, 180, 0, 180]}
            closed
            fill={shapeFillColor}
            opacity={0.25}
            stroke={shapeStrokeColor}
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}

        {previewPosition && activeTool === 'star' ? (
          <KonvaStar
            x={previewPosition.x + 90}
            y={previewPosition.y + 90}
            numPoints={5}
            innerRadius={40}
            outerRadius={90}
            fill={shapeFillColor}
            opacity={0.25}
            stroke={shapeStrokeColor}
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}

        {previewPosition && activeTool === 'textBubble' ? (
          <KonvaRect
            x={previewPosition.x}
            y={previewPosition.y}
            width={220}
            height={120}
            fill="#ffffff"
            opacity={0.3}
            stroke="#94a3b8"
            strokeWidth={1.5}
            dash={[10, 8]}
            cornerRadius={16}
            listening={false}
          />
        ) : null}

        {/* Line tool: no preview — lines are created by dragging from connection dots */}

        {/* Selection Area - persistent selection rectangle */}
        {selectionArea && (
          <KonvaRect
            x={selectionArea.x}
            y={selectionArea.y}
            width={selectionArea.width}
            height={selectionArea.height}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="#3b82f6"
            strokeWidth={2 / scale}
            dash={[10 / scale, 5 / scale]}
            listening={false}
          />
        )}

        {renderObjects.map((obj) => {
          const renderObj = (liveObjectsMap.get(obj.id) ?? obj) as WhiteboardObject;

          if (renderObj.type === 'frame') {
            return (
              <Frame
                key={obj.id}
                data={renderObj as FrameType}
                isSelected={isSelected(obj.id) && !selectionArea}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateFrameAndContents(obj.id, updates)}
                onDragMove={handleFrameDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }

          if (renderObj.type === 'sticky') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <StickyNote
                key={obj.id}
                data={renderObj as StickyNoteType}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }
          
          if (renderObj.type === 'rect') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <Rectangle
                key={obj.id}
                data={renderObj as RectShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }
          
          if (renderObj.type === 'circle') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <Circle
                key={obj.id}
                data={renderObj as CircleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }
          
          if (renderObj.type === 'line') {
            const lineData = renderObj as LineShape;
            const hasConnector = !!(lineData.startAnchor || lineData.endAnchor);
            const resolved = hasConnector ? resolveLinePoints(lineData, liveObjectsMap) : null;
            return (
              <Line
                key={obj.id}
                data={lineData}
                resolvedPoints={resolved}
                isSelected={isSelected(obj.id) && !selectionArea}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateObject(obj.id, updates)}
                onEndpointDrag={handleEndpointDrag}
                onEndpointDragEnd={handleEndpointDragEnd}
              />
            );
          }

          if (renderObj.type === 'textBubble') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <TextBubble
                key={obj.id}
                data={renderObj as TextBubbleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }

          if (renderObj.type === 'triangle') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <Triangle
                key={obj.id}
                data={renderObj as TriangleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }

          if (renderObj.type === 'star') {
            const isLocked = isObjectLockedByFrame(obj.id);
            return (
              <Star
                key={obj.id}
                data={renderObj as StarShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={!isLocked}
                onSelect={(e) => {
                  // Don't select individual objects when selection area is active
                  if (selectionArea) {
                    e.evt.stopPropagation();
                    return;
                  }
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
                onTransformMove={handleShapeTransformMove}
              />
            );
          }
          
          return null;
        })}

        {/* Connection dots on shapes — show when line tool active, drawing, or hovering */}
        {objects.map((obj) => {
          const renderObj = (liveObjectsMap.get(obj.id) ?? obj) as WhiteboardObject;
          if (renderObj.type === 'line' || renderObj.type === 'frame') return null;
          const anyLineSelected = selectedIds.some((sid) => {
            const o = objectsMap.get(sid);
            return o?.type === 'line';
          });
          const showDots = !isTransforming && !isDragging && (activeTool === 'line' || isDrawingLine || isSelected(obj.id) || hoveredShapeId === obj.id || anyLineSelected);
          if (!showDots) return null;
          return (
            <ConnectionDots
              key={`dots-${obj.id}`}
              object={renderObj}
              highlightedAnchor={highlightedAnchor}
              onAnchorMouseDown={handleAnchorMouseDown}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
