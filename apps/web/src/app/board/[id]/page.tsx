/**
 * Whiteboard Board Page - Main collaborative canvas with real-time sync
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Rect as KonvaRect, Circle as KonvaCircle, Line as KonvaLine, Star as KonvaStar } from 'react-konva';
import Konva from 'konva';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { Circle } from '@/components/canvas/objects/Circle';
import { Triangle } from '@/components/canvas/objects/Triangle';
import { Star } from '@/components/canvas/objects/Star';
import { Line } from '@/components/canvas/objects/Line';
import { Text } from '@/components/canvas/objects/Text';
import { TextBubble } from '@/components/canvas/objects/TextBubble';
import { Frame } from '@/components/canvas/objects/Frame';
import { SelectionArea } from '@/components/canvas/SelectionArea';
import { Cursors } from '@/components/canvas/Cursors';
import { DisconnectBanner } from '@/components/canvas/DisconnectBanner';
import { PropertiesSidebar } from '@/components/canvas/PropertiesSidebar';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { useAuth } from '@/lib/hooks/useAuth';
import { useYjs } from '@/lib/hooks/useYjs';
import { useCursorSync } from '@/lib/hooks/useCursorSync';
import { useDirectKonvaUpdates } from '@/lib/hooks/useDirectKonvaUpdates';
import { useSelection } from '@/lib/hooks/useSelection';
import { useCanvasStore } from '@/lib/store/canvas';
import { generateId } from '@/lib/utils/geometry';
import { getUserColor } from '@/lib/utils/colors';
import { supabase, updateBoard, fetchBoardMembers, ensureBoardAccess, fetchOnlineUserUids, type BoardMember } from '@/lib/supabase/client';
import { usePresenceHeartbeat } from '@/lib/hooks/usePresenceHeartbeat';
import { ConnectionDots } from '@/components/canvas/objects/ConnectionDots';
import { findNearestAnchor, resolveLinePoints } from '@/lib/utils/connectors';
import { calculateAutoFit } from '@/lib/utils/autoFit';
import { getVisibleObjects, getViewport, type Viewport } from '@/lib/utils/viewportCulling';
import { STICKY_COLORS } from '@/types/canvas';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape, CircleShape, TriangleShape, StarShape, LineShape, TextShape, TextBubbleShape, Frame as FrameType, AnchorPosition } from '@/types/canvas';
// Refactored hooks
import { useObjectBounds } from '@/lib/hooks/useObjectBounds';
import { useFrameManagement } from '@/lib/hooks/useFrameManagement';
import { useObjectManipulation } from '@/lib/hooks/useObjectManipulation';
import { useConnectorDrawing } from '@/lib/hooks/useConnectorDrawing';
import { useClipboardOperations } from '@/lib/hooks/useClipboardOperations';
import { useBoardMetadata } from '@/lib/hooks/useBoardMetadata';
import { AIAssistant } from '@/components/canvas/AIAssistant';
import { useAICommands } from '@/lib/hooks/useAICommands';

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;
  
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Send heartbeat every 60s so other users know we're online
  usePresenceHeartbeat(user?.uid);
  
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#000000');
  const [shapeFillColor, setShapeFillColor] = useState('#E5E7EB');
  const [showAllUsers, setShowAllUsers] = useState(false);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usersDropdownRef = useRef<HTMLDivElement>(null);
  
  // Check if snapshot was preloaded from dashboard (for instant loading)
  const preloadIndicator = useRef<string | null>(null);
  if (typeof window !== 'undefined' && !preloadIndicator.current) {
    try {
      preloadIndicator.current = sessionStorage.getItem(`board_preload_${boardId}`);
      if (preloadIndicator.current) {
        // Clear immediately to avoid stale reads on refresh
        sessionStorage.removeItem(`board_preload_${boardId}`);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }
  
  // Initialize Yjs connection
  const {
    objects,
    connectionStatus,
    onlineUsers,
    awareness,
    createObject,
    createObjectsBatch,
    updateObject,
    updateObjectsBatch,
    deleteObjects,
    clearObjects,
    updateCursor,
    broadcastLiveDrag,
    clearLiveDrag,
    broadcastSelectionTransform,
    clearSelectionTransform,
    getBroadcastRate,
    hasUnsavedChanges,
  } = useYjs({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
    // preloadedSnapshot is fetched from cache inside useYjs if available
    // The preloadIndicator ensures cache is used (already preloaded by dashboard)
  });

  // Initialize dedicated cursor sync (bypasses Yjs for ultra-low latency)
  const {
    cursors: fastCursors,
    livePositions: cursorServerLivePositions,
    isConnected: cursorSyncConnected,
    sendCursor: sendFastCursor,
    sendLiveDrag: sendCursorServerLiveDrag,
    clearLiveDrag: clearCursorServerLiveDrag,
  } = useCursorSync({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
    enabled: !!user && !!boardId, // Enable if user and board are loaded
  });

  // Use refactored hooks
  const boardMetadata = useBoardMetadata(boardId, user, onlineUsers.length);
  const { boardTitle, setBoardTitle, ownerUid, isOwner } = boardMetadata;
  
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

  const stageRef = useRef<Konva.Stage>(null);

  // Document-level pointer tracking so cursor updates continue during drag
  // (Stage's onMouseMove stops when a Konva object captures the pointer)
  // Only send when pointer is within canvas bounds to avoid wrong positions
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;

      const container = stage.container();
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inBounds) return;

      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const canvasX = (clientX - position.x) / scale;
      const canvasY = (clientY - position.y) / scale;

      if (cursorSyncConnected) {
        sendFastCursor(canvasX, canvasY);
      } else {
        updateCursor(canvasX, canvasY);
      }
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => document.removeEventListener('pointermove', handlePointerMove);
  }, [position, scale, cursorSyncConnected, sendFastCursor, updateCursor]);

  // Build an objects map for resolving connector positions
  const objectsMap = useMemo(() => {
    const map = new Map<string, WhiteboardObject>();
    for (const obj of objects) map.set(obj.id, obj);
    return map;
  }, [objects]);

  // Direct Konva updates for remote live drag (Yjs awareness + cursor server)
  // Must be after objectsMap is defined
  useDirectKonvaUpdates({
    awareness,
    currentUserId: user?.uid || '',
    stageRef,
    objectsMap,
    cursorServerLivePositions: cursorServerLivePositions,
  });

  // Connector drawing state moved to useConnectorDrawing hook
  // Live drag/transform state moved to useObjectManipulation hook
  // Track line points for live drag (for lines)
  const liveLinePointsRef = useRef<Map<string, number[]>>(new Map());
  // Track initial frame position when drag starts
  const frameDragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
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

  // Enforce lock for non-owners on this board page (initial load + realtime updates)
  useEffect(() => {
    if (!user || !boardId) return;

    let cancelled = false;

    const checkLock = async () => {
      const { data, error } = await supabase
        .from('boards')
        .select('owner_uid, is_locked')
        .eq('id', boardId)
        .single();

      if (cancelled || error || !data) return;

      const isOwnerOfBoard = (data.owner_uid as string) === user.uid;
      const isLocked = !!data.is_locked;
      if (isLocked && !isOwnerOfBoard) {
        router.replace('/dashboard');
      }
    };

    checkLock().catch((err) => {
      console.error('Failed to verify board lock status:', err);
    });

    const channel = supabase
      .channel(`board-lock-${boardId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
        (payload) => {
          const updated = payload.new as { owner_uid?: string; is_locked?: boolean } | null;
          if (!updated) return;
          const isOwnerOfBoard = updated.owner_uid === user.uid;
          if (updated.is_locked && !isOwnerOfBoard) {
            router.replace('/dashboard');
          }
        }
      )
      .subscribe();

    const lockCheckInterval = window.setInterval(() => {
      checkLock().catch((err) => {
        console.error('Failed to verify board lock status (poll):', err);
      });
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(lockCheckInterval);
      supabase.removeChannel(channel);
    };
  }, [user, boardId, router]);
  
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

  // Frame warning cleanup is handled by useFrameManagement hook

  // Auto-fit canvas when objects first load
  const hasAutoFittedRef = useRef(false);
  
  useEffect(() => {
    if (hasAutoFittedRef.current || !mounted) return;
    
    // If no objects yet, wait a bit to see if they load
    // Reduced timeout from 1000ms to 300ms for faster loading when snapshot is preloaded
    if (objects.length === 0) {
      const timer = setTimeout(() => {
        // If still no objects after 300ms, show canvas at default zoom
        hasAutoFittedRef.current = true;
      }, 300);
      return () => clearTimeout(timer);
    }
    
    // Objects loaded - calculate and apply immediately
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const autoFit = calculateAutoFit(objects, viewport.width, viewport.height);
    
    if (autoFit && typeof autoFit.scale === 'number' && !isNaN(autoFit.scale) && isFinite(autoFit.scale)) {
      setScale(autoFit.scale);
      setPosition(autoFit.position);
      hasAutoFittedRef.current = true;
    } else {
      // Fallback to default scale if auto-fit fails
      setScale(0.3);
      setPosition({ x: 0, y: 0 });
      hasAutoFittedRef.current = true;
    }
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
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && obj.type !== 'sticky') {
          updateObject(id, { stroke: color });
        }
      });
    }
    setShapeStrokeColor(color);
  };
  
  const handleShapeFillColorChange = (color: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
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
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && obj.type === 'sticky') {
          updateObject(id, { color });
        }
      });
    }
  };

  const handleTextColorChange = (color: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && obj.type === 'text') {
          updateObject(id, { fill: color });
        }
      });
    }
  };
  
  const handleTextChange = (text: string) => {
    if (selectedIds.length > 0) {
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'text' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
          updateObject(id, { text });
        }
      });
    }
  };

  const handleTextSizeChange = (size: number) => {
    const clamped = Math.max(12, Math.min(48, size));
    if (selectedIds.length > 0) {
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'text' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
          updateObject(id, { textSize: clamped });
        }
      });
    }
  };

  const handleTextFamilyChange = (family: 'Inter' | 'Poppins' | 'Merriweather') => {
    if (selectedIds.length > 0) {
      selectedIds.forEach((id: string) => {
        const obj = objects.find((o: WhiteboardObject) => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'text' || obj.type === 'textBubble' || obj.type === 'triangle' || obj.type === 'star')) {
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

  // Use refactored hooks
  const { getObjectBounds, getConnectedObjectIds, intersectsRect } = useObjectBounds();

  // Selection area for AI: use explicit selection box, or compute from selected objects
  const selectionAreaForAI = useMemo(() => {
    if (selectionArea) return selectionArea;
    if (selectedIds.length === 0) return null;
    const selected = objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id));
    if (selected.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of selected) {
      const b = getObjectBounds(obj, objectsMap);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [selectionArea, selectedIds, objects, objectsMap, getObjectBounds]);

  const aiCommands = useAICommands({
    boardId,
    createObject,
    createObjectsBatch,
    updateObject,
    deleteObjects,
    clearObjects,
    objects,
    userId: user?.uid || '',
    selectedIds,
    selectionArea: selectionAreaForAI,
    viewport: { position, scale },
  });
  const frameManagement = useFrameManagement(objects);
  const manipulation = useObjectManipulation(objects, objectsMap, updateObject);
  
  // Sync remote live positions from cursor server into liveDragRef for React re-renders
  // This ensures frame names follow the frame during remote drag operations
  useEffect(() => {
    const interval = setInterval(() => {
      if (!cursorServerLivePositions?.current) return;
      
      const positions = cursorServerLivePositions.current;
      if (positions.size === 0) {
        return;
      }
      
      let hasUpdates = false;
      positions.forEach((pos, objectId) => {
        // Only add if not from current user (avoid duplicates)
        if (pos.userId !== user?.uid) {
          const existing = manipulation.liveDragRef.current.get(objectId);
          if (!existing || existing.x !== pos.x || existing.y !== pos.y) {
            manipulation.liveDragRef.current.set(objectId, { x: pos.x, y: pos.y });
            hasUpdates = true;
          }
        }
      });
      
      // Trigger re-render to update frame names
      if (hasUpdates) {
        manipulation.setDragTick((t: number) => t + 1);
      }
    }, 16); // Check every 16ms (~60fps)
    
    return () => clearInterval(interval);
  }, [user?.uid, manipulation, cursorServerLivePositions]);
  
  // Clear live drag/transform refs when objects change from external sources (AI, other users)
  // This ensures AI updates aren't overridden by stale live drag positions
  useEffect(() => {
    // #region agent log
    const hadDrag = manipulation.liveDragRef.current.size > 0;
    const hadTransform = manipulation.liveTransformRef.current.size > 0;
    if (hadDrag || hadTransform) {
      fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'page.tsx:useEffect-clearRefs',message:'Clearing live refs on objects change',data:{hadDrag,hadTransform,dragKeys:[...manipulation.liveDragRef.current.keys()],transformKeys:[...manipulation.liveTransformRef.current.keys()]},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    }
    // #endregion
    if (manipulation.liveDragRef.current.size > 0) {
      manipulation.liveDragRef.current.clear();
    }
    if (manipulation.liveTransformRef.current.size > 0) {
      manipulation.liveTransformRef.current.clear();
    }
  }, [objects, manipulation.liveDragRef, manipulation.liveTransformRef]);

  const handleShapeDragMoveWithBroadcast = useCallback(
    (shapeId: string, liveX: number, liveY: number) => {
      manipulation.handleShapeDragMove(shapeId, liveX, liveY);
      if (cursorSyncConnected) sendCursorServerLiveDrag(shapeId, liveX, liveY);
      broadcastLiveDrag(shapeId, liveX, liveY);

      // Broadcast connected lines so viewers see them update in real-time
      const shapeObj = objectsMap.get(shapeId);
      if (shapeObj) {
        const tempMap = new Map(objectsMap);
        tempMap.set(shapeId, { ...shapeObj, x: liveX, y: liveY } as WhiteboardObject);
        for (const obj of objects) {
          if (obj.type !== 'line') continue;
          const line = obj as LineShape;
          const connected = line.startAnchor?.objectId === shapeId || line.endAnchor?.objectId === shapeId;
          if (!connected) continue;
          const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
          const points = [x1, y1, x2, y2];
          if (cursorSyncConnected) sendCursorServerLiveDrag(line.id, 0, 0, { points });
          broadcastLiveDrag(line.id, 0, 0, { points } as any);
        }
      }
    },
    [manipulation.handleShapeDragMove, cursorSyncConnected, sendCursorServerLiveDrag, broadcastLiveDrag, objectsMap, objects]
  );

  // Throttle transform broadcasts to prevent lag (16ms = ~60fps)
  const lastTransformBroadcastRef = useRef<Map<string, number>>(new Map());
  const TRANSFORM_BROADCAST_INTERVAL = 16; // 16ms = ~60fps

  const handleShapeTransformMoveWithBroadcast = useCallback(
    (
      shapeId: string,
      liveX: number,
      liveY: number,
      liveRotation: number,
      dimensions?: { width?: number; height?: number; radius?: number }
    ) => {
      // Always update local state immediately for smooth local rendering
      manipulation.handleShapeTransformMove(shapeId, liveX, liveY, liveRotation, dimensions);
      
      // Throttle network broadcasts to prevent lag
      const now = Date.now();
      const lastBroadcast = lastTransformBroadcastRef.current.get(shapeId) || 0;
      const shouldBroadcast = now - lastBroadcast >= TRANSFORM_BROADCAST_INTERVAL;
      
      if (shouldBroadcast) {
        lastTransformBroadcastRef.current.set(shapeId, now);
        
        // Broadcast transform updates (rotation, scale, position) to viewers in real-time
        const extra = {
          rotation: liveRotation,
          ...dimensions,
        };
        
        if (cursorSyncConnected) sendCursorServerLiveDrag(shapeId, liveX, liveY, extra);
        broadcastLiveDrag(shapeId, liveX, liveY, extra);

        // Broadcast connected lines so viewers see them update in real-time during rotation/resize
        const shapeObj = objectsMap.get(shapeId);
        if (shapeObj) {
          const tempMap = new Map(objectsMap);
          tempMap.set(shapeId, { ...shapeObj, x: liveX, y: liveY, rotation: liveRotation, ...dimensions } as WhiteboardObject);
          for (const obj of objects) {
            if (obj.type !== 'line') continue;
            const line = obj as LineShape;
            const connected = line.startAnchor?.objectId === shapeId || line.endAnchor?.objectId === shapeId;
            if (!connected) continue;
            const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
            const points = [x1, y1, x2, y2];
            if (cursorSyncConnected) sendCursorServerLiveDrag(line.id, 0, 0, { points });
            broadcastLiveDrag(line.id, 0, 0, { points } as any);
          }
        }
      }
    },
    [manipulation.handleShapeTransformMove, cursorSyncConnected, sendCursorServerLiveDrag, broadcastLiveDrag, objectsMap, objects]
  );

  const handleShapeUpdateWithClear = useCallback(
    (shapeId: string, updates: Partial<WhiteboardObject>) => {
      manipulation.updateShapeAndConnectors(shapeId, updates);
      clearLiveDrag(shapeId);
      clearCursorServerLiveDrag(shapeId);
      // Clear throttle ref for this object
      lastTransformBroadcastRef.current.delete(shapeId);
      // Clear live drag for connected lines so viewers stop showing stale positions
      for (const obj of objects) {
        if (obj.type !== 'line') continue;
        const line = obj as LineShape;
        if (line.startAnchor?.objectId === shapeId || line.endAnchor?.objectId === shapeId) {
          clearLiveDrag(line.id);
          clearCursorServerLiveDrag(line.id);
        }
      }
    },
    [manipulation.updateShapeAndConnectors, clearLiveDrag, clearCursorServerLiveDrag, objects]
  );
  
  // Connector drawing hook
  const connectorDrawing = useConnectorDrawing(
    objects,
    objectsMap,
    updateObject,
    createObject,
    deleteObjects,
    position,
    scale,
    shapeStrokeColor,
    user,
    setActiveTool
  );

  // Clipboard operations hook
  const clipboard = useClipboardOperations(
    objects,
    selectedIds,
    createObject,
    deselectAll,
    selectObject,
    user,
    () => {
      const viewportCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
      const viewportCenterY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
      return {
        x: (viewportCenterX - position.x) / scale,
        y: (viewportCenterY - position.y) / scale,
      };
    },
    (source, target, userId) => {
      // Clone objects including frames and their contained objects
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
      for (const obj of source) {
        idMap.set(obj.id, generateId());
        allObjectsToClone.push(obj);
        // Only include contained objects if this is an AI container frame
        if (obj.type === 'frame' && obj.isAIContainer) {
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
          const newContainedIds = (frame.containedObjectIds || []).map((id: string) => idMap.get(id) || id);
          const frameCount = objects.filter((o: WhiteboardObject) => o.type === 'frame').length + cloned.filter((o: WhiteboardObject) => o.type === 'frame').length + 1;
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
    }
  );

  // getCurrentCanvasCursor and cloneObjectsAtPoint are defined above (passed to clipboard hook)

  // OLD CODE REMOVED - Now using useObjectBounds hook above

  // OLD getConnectedObjectIds removed - now using hook

  const handleCanvasClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      
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
        } else if (activeTool === 'text') {
          // Ensure x and y are valid numbers
          const safeX = typeof x === 'number' && !isNaN(x) ? x : 0;
          const safeY = typeof y === 'number' && !isNaN(y) ? y : 0;
          
          const text: TextShape = {
            id: generateId(),
            type: 'text',
            x: safeX,
            y: safeY,
            text: '',
            textSize: 16,
            textFamily: 'Inter',
            fill: '#000000',
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || '',
            createdAt: Date.now(),
          };

          createObject(text);
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

  // Frame management functions moved to useFrameManagement hook
  
  // Object manipulation functions moved to useObjectManipulation hook

  // Render frames behind all other objects so inner-object clicks are not stolen.
  // Apply viewport culling for performance with 500+ objects
  const renderObjects = useMemo(() => {
    const frames = objects.filter((obj: WhiteboardObject) => obj.type === 'frame');
    const others = objects.filter((obj: WhiteboardObject) => obj.type !== 'frame');
    
    // Create viewport from current canvas state
    const viewport = getViewport(
      position,
      scale,
      { 
        width: typeof window !== 'undefined' ? window.innerWidth : 1920,
        height: typeof window !== 'undefined' ? window.innerHeight : 1080
      }
    );
    
    // Apply viewport culling to non-frame objects (frames always render)
    // Padding of 200px ensures objects slightly outside viewport are still rendered
    const visibleOthers = getVisibleObjects(others, viewport, 200);
    
    return [...frames, ...visibleOthers];
  }, [objects, position, scale]);

  // Frames are visual containers only - objects can move independently

  const updateFrameAndContents = useCallback(
    (frameId: string, updates: Partial<FrameType>) => {
      // Frames are visual containers only - update frame only, objects move independently
      const frame = objectsMap.get(frameId);
      if (!frame || frame.type !== 'frame') {
        updateObject(frameId, updates);
        return;
      }

      // Clear live drag overlays once final values are persisted
      manipulation.liveDragRef.current.delete(frameId);
      frameDragStartRef.current.delete(frameId);

      updateObject(frameId, updates);

      // Clear live drag broadcast for frame
      clearLiveDrag(frameId);
      clearCursorServerLiveDrag(frameId);
    },
    [objectsMap, updateObject, clearLiveDrag, clearCursorServerLiveDrag]
  );

  const handleFrameDragMove = useCallback(
    (frameId: string, liveX: number, liveY: number) => {
      // Frames are visual containers only - move frame only, objects move independently
      const frame = objectsMap.get(frameId);
      if (!frame || frame.type !== 'frame') {
        manipulation.liveDragRef.current.set(frameId, { x: liveX, y: liveY });
        manipulation.setDragTick((t: number) => t + 1);
        return;
      }

      // Initialize drag start tracking if this is the first move
      let dragStart = frameDragStartRef.current.get(frameId);
      if (!dragStart) {
        dragStart = {
          x: frame.x,
          y: frame.y,
        };
        frameDragStartRef.current.set(frameId, dragStart);
      }

      // Move frame visually during drag (persist on drag end)
      manipulation.liveDragRef.current.set(frameId, { x: liveX, y: liveY });
      manipulation.setDragTick((t: number) => t + 1);

      // Broadcast live drag for remote users: frame only
      if (cursorSyncConnected) sendCursorServerLiveDrag(frameId, liveX, liveY);
      broadcastLiveDrag(frameId, liveX, liveY);
    },
    [objectsMap, cursorSyncConnected, sendCursorServerLiveDrag, broadcastLiveDrag]
  );

  // Overlay live drag positions on top of objectsMap for smooth line rendering
  // Computed every render (cheap — only iterates liveDragRef entries)
  const liveObjectsMap: Map<string, WhiteboardObject> = manipulation.liveDragRef.current.size === 0 && manipulation.liveTransformRef.current.size === 0 && liveLinePointsRef.current.size === 0
    ? objectsMap
    : (() => {
        const map = new Map(objectsMap);
        manipulation.liveDragRef.current.forEach((pos: { x: number; y: number }, id: string) => {
          const obj = map.get(id) as WhiteboardObject | undefined;
          if (obj) {
            if (obj.type === 'line') {
              const line = obj as LineShape;
              const points = liveLinePointsRef.current.get(id) || line.points;
              map.set(id, { ...obj, x: 0, y: 0, points } as WhiteboardObject);
            } else {
              map.set(id, { ...obj, x: pos.x, y: pos.y } as WhiteboardObject);
            }
          }
        });
        liveLinePointsRef.current.forEach((points: number[], id: string) => {
          const obj = map.get(id) as WhiteboardObject | undefined;
          if (obj && obj.type === 'line') {
            map.set(id, { ...obj, points } as WhiteboardObject);
          }
        });
        manipulation.liveTransformRef.current.forEach((transform: { x: number; y: number; rotation: number; width?: number; height?: number; radius?: number }, id: string) => {
          const obj = map.get(id);
          if (obj) {
            // During transform, only update dimensions and rotation, NOT position
            // Position will be finalized in handleTransformEnd
            const updates: Partial<WhiteboardObject> & {
              width?: number;
              height?: number;
              radius?: number;
            } = { rotation: transform.rotation };
            if (transform.width !== undefined) updates.width = transform.width;
            if (transform.height !== undefined) updates.height = transform.height;
            if (transform.radius !== undefined) updates.radius = transform.radius;
            map.set(id, { ...obj, ...updates } as WhiteboardObject);
          }
        });
        return map;
      })();

  // Connector drawing functions moved to useConnectorDrawing hook

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      
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
      if (connectorDrawing.isDrawingLine && connectorDrawing.drawingLineId) {
        connectorDrawing.handleDrawingMouseMove(x, y);
      }
    },
    [position, scale, updateCursor, cursorSyncConnected, sendFastCursor, connectorDrawing, objectsMap, objects]
  );

  // Connector drawing functions moved to useConnectorDrawing hook
  // intersectsRect moved to useObjectBounds hook

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
      // User-drawn frames don't auto-contain objects - they're just shapes
      containedObjectIds = [];
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
    const frameCount = objects.filter((obj: WhiteboardObject) => obj.type === 'frame').length + 1;
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
      fill: null,
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

    // First pass: identify AI container frames and mark their contained objects
    selectedIds.forEach((id: string) => {
      const obj = objectsMap.get(id);
      if (obj?.type === 'frame' && obj.isAIContainer) {
        obj.containedObjectIds?.forEach((containedId: string) => {
          containedInSelectedFrames.add(containedId);
        });
      }
    });

    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'page.tsx:getDeleteIds',message:'Delete IDs computation',data:{selectedIds,containedInSelectedFrames:[...containedInSelectedFrames],frames:selectedIds.filter((id:string)=>{const o=objectsMap.get(id);return o?.type==='frame';}).map((id:string)=>{const o=objectsMap.get(id) as any;return {id,isAIContainer:o?.isAIContainer,containedObjectIds:o?.containedObjectIds};})},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    // Second pass: collect IDs to delete
    selectedIds.forEach((id: string) => {
      const obj = objectsMap.get(id);
      if (obj?.type === 'frame') {
        idsToDeleteSet.add(id);
        if (obj.isAIContainer) {
          obj.containedObjectIds?.forEach((containedId: string) => {
            idsToDeleteSet.add(containedId);
          });
        }
      } else {
        if (!containedInSelectedFrames.has(id)) {
          idsToDeleteSet.add(id);
        }
      }
    });

    // Convert set to array
    idsToDeleteSet.forEach((id) => idsToDelete.push(id));

    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'page.tsx:getDeleteIds-result',message:'Final delete IDs',data:{idsToDelete},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion

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

  // Clipboard functions moved to useClipboardOperations hook

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.getElementById('inline-shape-editor')) {
        return;
      }
      
      // Don't handle shortcuts when editing text in input/textarea
      if (isEditableElement(e.target)) return;

      // Escape cancels line drawing
      if (e.key === 'Escape' && connectorDrawing.isDrawingLine && connectorDrawing.drawingLineId) {
        connectorDrawing.cancelLineDrawing();
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
          clipboard.copySelectedObjects();
        }
      }

      // Handle paste (Ctrl+V / Cmd+V)
      if (isMetaOrCtrl && e.key.toLowerCase() === 'v') {
        // Always try to paste (will check both system clipboard and memory clipboard)
        e.preventDefault();
        clipboard.pasteClipboardObjects();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, deleteObjects, deselectAll, connectorDrawing, getDeleteIds, clipboard]);
  
  // duplicateSelectedObjects moved to useClipboardOperations hook

  const handleDelete = useCallback(() => {
    if (selectedIds.length > 0) {
      deleteObjects(getDeleteIds());
      deselectAll();
      setSelectionArea(null); // Clear selection area after deletion
    }
  }, [selectedIds, getDeleteIds, deleteObjects, deselectAll]);

  // Move selected objects by delta (used for selection area drag)
  const handleMoveSelection = useCallback((dx: number, dy: number) => {
    if (selectedIds.length === 0) return;
    
    const selectedObjects = objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id));
    
    // Update each selected object's position
    selectedObjects.forEach((obj: WhiteboardObject) => {
      if (obj.type === 'line') {
        // For lines, update points array
        const line = obj as LineShape;
        const newPoints = [
          line.points[0] + dx,
          line.points[1] + dy,
          line.points[2] + dx,
          line.points[3] + dy,
        ];
        updateObject(obj.id, { points: newPoints });
      } else {
        // For other objects, update x and y
        updateObject(obj.id, { 
          x: obj.x + dx, 
          y: obj.y + dy,
          modifiedAt: Date.now()
        });
      }
    });
  }, [selectedIds, objects, updateObject]);

  // Track initial object positions when selection area drag starts
  const selectionAreaDragStartRef = useRef<Map<string, { x: number; y: number; points?: number[] }>>(new Map());
  const selectionAreaInitialPosRef = useRef<{ x: number; y: number } | null>(null);
  const selectionAreaLivePosRef = useRef<{ x: number; y: number } | null>(null);

  // Handle selection area drag start - store initial positions
  useEffect(() => {
    const handleDragStart = () => {
      if (!selectionArea || selectedIds.length === 0) return;
      
      selectionAreaInitialPosRef.current = { x: selectionArea.x, y: selectionArea.y };
      selectionAreaDragStartRef.current.clear();
      
      const selectedObjects = objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id));
      selectedObjects.forEach((obj) => {
        if (obj.type === 'line') {
          const line = obj as LineShape;
          selectionAreaDragStartRef.current.set(obj.id, {
            x: obj.x,
            y: obj.y,
            points: [...line.points],
          });
        } else {
          selectionAreaDragStartRef.current.set(obj.id, {
            x: obj.x,
            y: obj.y,
          });
        }
      });
    };

    window.addEventListener('object-drag-start', handleDragStart);
    return () => window.removeEventListener('object-drag-start', handleDragStart);
  }, [selectionArea, selectedIds, objects]);

  // Handle selection area drag move - update objects using live drag refs (like frames)
  const handleSelectionAreaDragMove = useCallback((dx: number, dy: number) => {
    if (!selectionArea || selectedIds.length === 0 || !selectionAreaInitialPosRef.current) return;
    
    // Calculate new selection area position based on initial position
    const newX = selectionAreaInitialPosRef.current.x + dx;
    const newY = selectionAreaInitialPosRef.current.y + dy;
    
    // Store live position in ref (don't update state during drag to avoid glitches)
    selectionAreaLivePosRef.current = { x: newX, y: newY };
    
    // Update selection area state for visual feedback (but SelectionArea component won't reset during drag)
    setSelectionArea({
      ...selectionArea,
      x: newX,
      y: newY,
    });
    
    // Optimization: Use group transform for 10+ objects to reduce network overhead
    const MULTI_SELECT_THRESHOLD = 10;
    const useGroupTransform = selectedIds.length >= MULTI_SELECT_THRESHOLD;
    
    // Build temp map with live positions for all selected objects
    const tempMap = new Map(objectsMap);
    const selectedObjects = objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id));
    
    if (useGroupTransform) {
      // Group transform strategy: Update local positions, broadcast once
      selectedObjects.forEach((obj) => {
        const initialPos = selectionAreaDragStartRef.current.get(obj.id);
        if (!initialPos) return;

        if (obj.type === 'line') {
          const newPoints = [
            initialPos.points![0] + dx,
            initialPos.points![1] + dy,
            initialPos.points![2] + dx,
            initialPos.points![3] + dy,
          ];
          manipulation.liveDragRef.current.set(obj.id, {
            x: 0,
            y: 0,
            points: newPoints,
          } as any);
          tempMap.set(obj.id, { ...obj, x: 0, y: 0, points: newPoints } as WhiteboardObject);
        } else {
          const newX = initialPos.x + dx;
          const newY = initialPos.y + dy;
          manipulation.liveDragRef.current.set(obj.id, { x: newX, y: newY });
          tempMap.set(obj.id, { ...obj, x: newX, y: newY } as WhiteboardObject);
        }
      });
      
      // Single broadcast for entire selection (50x fewer network messages!)
      broadcastSelectionTransform(selectedIds, dx, dy);
      
      // Still broadcast to cursor server individually (ultra-low latency path)
      if (cursorSyncConnected) {
        selectedObjects.forEach((obj) => {
          const initialPos = selectionAreaDragStartRef.current.get(obj.id);
          if (!initialPos) return;
          
          if (obj.type === 'line') {
            const newPoints = [
              initialPos.points![0] + dx,
              initialPos.points![1] + dy,
              initialPos.points![2] + dx,
              initialPos.points![3] + dy,
            ];
            sendCursorServerLiveDrag(obj.id, 0, 0, { points: newPoints });
          } else {
            const newX = initialPos.x + dx;
            const newY = initialPos.y + dy;
            sendCursorServerLiveDrag(obj.id, newX, newY);
          }
        });
      }
    } else {
      // Small selection strategy: Individual broadcasts (existing behavior)
      selectedObjects.forEach((obj) => {
        const initialPos = selectionAreaDragStartRef.current.get(obj.id);
        if (!initialPos) return;

        if (obj.type === 'line') {
          const line = obj as LineShape;
          const newPoints = [
            initialPos.points![0] + dx,
            initialPos.points![1] + dy,
            initialPos.points![2] + dx,
            initialPos.points![3] + dy,
          ];
          manipulation.liveDragRef.current.set(obj.id, {
            x: 0,
            y: 0,
            points: newPoints,
          } as any);
          tempMap.set(obj.id, { ...obj, x: 0, y: 0, points: newPoints } as WhiteboardObject);
          if (cursorSyncConnected) sendCursorServerLiveDrag(obj.id, 0, 0, { points: newPoints });
          broadcastLiveDrag(obj.id, 0, 0, { points: newPoints } as any);
        } else {
          const newX = initialPos.x + dx;
          const newY = initialPos.y + dy;
          manipulation.liveDragRef.current.set(obj.id, { x: newX, y: newY });
          tempMap.set(obj.id, { ...obj, x: newX, y: newY } as WhiteboardObject);
          if (cursorSyncConnected) sendCursorServerLiveDrag(obj.id, newX, newY);
          broadcastLiveDrag(obj.id, newX, newY);
        }
      });
    }

    // Broadcast connected lines (connect to selected shapes but may not be selected)
    const selectedIdsSet = new Set(selectedIds);
    for (const obj of objects) {
      if (obj.type !== 'line') continue;
      const line = obj as LineShape;
      const startId = line.startAnchor?.objectId;
      const endId = line.endAnchor?.objectId;
      const connectedToSelection = (startId && selectedIdsSet.has(startId)) || (endId && selectedIdsSet.has(endId));
      if (!connectedToSelection) continue;
      if (selectedIdsSet.has(line.id)) continue; // Already broadcast above
      const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
      const points = [x1, y1, x2, y2];
      if (cursorSyncConnected) sendCursorServerLiveDrag(line.id, 0, 0, { points });
      broadcastLiveDrag(line.id, 0, 0, { points } as any);
    }

    manipulation.setDragTick((t) => t + 1);
  }, [selectionArea, selectedIds, objects, objectsMap, manipulation, cursorSyncConnected, sendCursorServerLiveDrag, broadcastLiveDrag, broadcastSelectionTransform]);

  // Handle selection area drag end - finalize positions
  const handleSelectionAreaDragEnd = useCallback(() => {
    if (!selectionArea || selectedIds.length === 0 || !selectionAreaInitialPosRef.current) {
      selectionAreaDragStartRef.current.clear();
      selectionAreaInitialPosRef.current = null;
      selectionAreaLivePosRef.current = null;
      clearSelectionTransform(); // Clear any group transform
      return;
    }
    
    // Get final delta from the live position ref (or fallback to state)
    const finalPos = selectionAreaLivePosRef.current || selectionArea;
    const finalDx = finalPos.x - selectionAreaInitialPosRef.current.x;
    const finalDy = finalPos.y - selectionAreaInitialPosRef.current.y;
    
    // Clear group transform broadcast
    clearSelectionTransform();
    
    // Finalize all selected objects and clear live drag for connected lines
    const selectedObjects = objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id));
    const selectedIdsSet = new Set(selectedIds);
    
    // Optimization: Use batch update for 10+ objects
    const MULTI_SELECT_THRESHOLD = 10;
    const useBatchUpdate = selectedObjects.length >= MULTI_SELECT_THRESHOLD;
    
    if (useBatchUpdate) {
      // Batch CRDT updates for performance
      const updates: Array<{ id: string; data: Partial<WhiteboardObject> }> = [];
      
      selectedObjects.forEach((obj) => {
        const initialPos = selectionAreaDragStartRef.current.get(obj.id);
        if (!initialPos) return;

        manipulation.liveDragRef.current.delete(obj.id);
        clearLiveDrag(obj.id);
        clearCursorServerLiveDrag(obj.id);

        if (obj.type === 'line') {
          const newPoints = [
            initialPos.points![0] + finalDx,
            initialPos.points![1] + finalDy,
            initialPos.points![2] + finalDx,
            initialPos.points![3] + finalDy,
          ];
          updates.push({ id: obj.id, data: { points: newPoints } });
        } else {
          updates.push({ 
            id: obj.id, 
            data: { 
              x: initialPos.x + finalDx, 
              y: initialPos.y + finalDy,
              modifiedAt: Date.now()
            } 
          });
        }
      });
      
      // Single Yjs transaction for all updates (1 network message instead of N)
      updateObjectsBatch(updates);
    } else {
      // Small selection: Individual updates (existing behavior)
      selectedObjects.forEach((obj) => {
        const initialPos = selectionAreaDragStartRef.current.get(obj.id);
        if (!initialPos) return;

        manipulation.liveDragRef.current.delete(obj.id);
        clearLiveDrag(obj.id);
        clearCursorServerLiveDrag(obj.id);

        if (obj.type === 'line') {
          const newPoints = [
            initialPos.points![0] + finalDx,
            initialPos.points![1] + finalDy,
            initialPos.points![2] + finalDx,
            initialPos.points![3] + finalDy,
          ];
          updateObject(obj.id, { points: newPoints });
        } else {
          updateObject(obj.id, { 
            x: initialPos.x + finalDx, 
            y: initialPos.y + finalDy,
            modifiedAt: Date.now()
          });
        }
      });
    }

    // Clear live drag for connected lines (may have been broadcast but not selected)
    for (const obj of objects) {
      if (obj.type !== 'line') continue;
      const line = obj as LineShape;
      const startId = line.startAnchor?.objectId;
      const endId = line.endAnchor?.objectId;
      const connectedToSelection = (startId && selectedIdsSet.has(startId)) || (endId && selectedIdsSet.has(endId));
      if (connectedToSelection) {
        clearLiveDrag(line.id);
        clearCursorServerLiveDrag(line.id);
      }
    }
    
    // Update selection area state to final position
    if (selectionAreaLivePosRef.current) {
      setSelectionArea({
        ...selectionArea,
        x: selectionAreaLivePosRef.current.x,
        y: selectionAreaLivePosRef.current.y,
      });
    }
    
    // Trigger re-render to clear live drag
    manipulation.setDragTick((t) => t + 1);
    
    // Clear drag tracking
    selectionAreaDragStartRef.current.clear();
    selectionAreaInitialPosRef.current = null;
    selectionAreaLivePosRef.current = null;
  }, [selectionArea, selectedIds, objects, updateObject, updateObjectsBatch, manipulation, clearLiveDrag, clearSelectionTransform, clearCursorServerLiveDrag]);

  // ── Build collaborator list (only users currently viewing this board) ──
  type CollabUser = {
    uid: string;
    name: string;
    color: string;
    isYou: boolean;
  };

  // Only show users currently viewing this board (Yjs awareness)
  const collaborators: CollabUser[] = [];
  const addedUids = new Set<string>();
  for (const state of onlineUsers) {
    if (addedUids.has(state.user.id)) continue;
    addedUids.add(state.user.id);
    collaborators.push({
      uid: state.user.id,
      name: state.user.name,
      color: state.user.color,
      isYou: state.user.id === user?.uid,
    });
  }

  const MAX_VISIBLE = 4;
  const visibleCollabs = collaborators.slice(0, MAX_VISIBLE);
  const overflowCount = collaborators.length - MAX_VISIBLE;
  
  // Render canvas immediately - auth check happens but doesn't block rendering
  // The redirect logic will handle unauthenticated users
  
  return (
    <div className="w-full h-screen relative bg-white" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      {/* Copy Toast Notification */}
      {clipboard.copyToastVisible && (
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
      {frameManagement.frameWarningVisible && (
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
      <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 py-2 px-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToDashboard}
            className="p-1.5 rounded-md transition-colors hover:bg-gray-100"
            title="Back to Dashboard"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <input
            type="text"
            value={boardTitle}
            onChange={handleTitleChange}
            readOnly={!isOwner}
            disabled={!isOwner}
            className={`text-sm font-bold text-gray-900 bg-transparent border-none outline-none px-1.5 py-0.5 rounded ${
              isOwner
                ? 'hover:bg-gray-100 cursor-text'
                : 'cursor-default opacity-100'
            }`}
            placeholder="Untitled Board"
            title={isOwner ? 'Click to rename' : 'Only the board owner can rename'}
          />
        </div>
        
        <div className="flex items-center gap-3">
          {/* Collaborator avatars */}
          <div className="relative" ref={usersDropdownRef}>
            <button
              onClick={() => setShowAllUsers((prev: boolean) => !prev)}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-full bg-gray-100 border border-gray-200 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              title="View collaborators"
            >
              <div className="flex -space-x-1.5">
                {visibleCollabs.map((c, i) => (
                  <div
                    key={c.uid}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-gray-100 shadow-sm relative hover:z-20 hover:scale-110 transition-transform"
                    style={{
                      backgroundColor: c.color,
                      zIndex: MAX_VISIBLE - i,
                    }}
                    title={c.name + (c.isYou ? ' (You)' : '')}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                ))}

                {overflowCount > 0 && (
                  <div
                    className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-[10px] font-bold border-2 border-gray-100 shadow-sm hover:bg-gray-300 transition-colors relative z-0"
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>
              
              {/* Dropdown chevron icon */}
              <svg 
                className="w-3 h-3 text-gray-600 flex-shrink-0" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown listing all collaborators */}
            {showAllUsers && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-lg shadow-xl border border-gray-200 py-2 px-1 min-w-[220px] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 pb-1.5 mb-1 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Collaborators — {collaborators.length}
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {collaborators.map((c) => (
                    <div
                      key={c.uid}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
                        style={{
                          backgroundColor: c.color,
                        }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-gray-800 truncate leading-tight">
                          {c.name}
                          {c.isYou && (
                            <span className="text-gray-400 ml-1 text-[10px]">(You)</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-gray-300 text-xs">|</span>
          <div className="text-[11px] text-gray-500">
            Objects: <strong>{objects.length}</strong>
          </div>
        </div>
      </div>

      <Toolbar onDelete={handleDelete} selectedCount={selectedIds.length} />
      
      <ZoomControl />
      
      {user && (
        <Cursors
          awareness={awareness}
          currentUserId={user.uid}
          scale={scale}
          position={position}
          cursors={fastCursors}
          useFastCursors={cursorSyncConnected}  // Use fast cursors if connected
        />
      )}
      
      {/* Properties Sidebar - shows when objects selected */}
      {/* Show selection area properties when selection area is active */}
      {selectionArea && selectedIds.length > 0 && (
        <PropertiesSidebar
          selectedObjects={objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id))}
          onStrokeColorChange={handleShapeStrokeColorChange}
          onFillColorChange={handleShapeFillColorChange}
          onStickyColorChange={handleStickyColorChange}
          onTextColorChange={handleTextColorChange}
          onTextChange={handleTextChange}
          onTextSizeChange={handleTextSizeChange}
          onTextFamilyChange={handleTextFamilyChange}
          onDelete={handleDelete}
          onDuplicate={clipboard.duplicateSelectedObjects}
          onCopy={clipboard.copySelectedObjects}
          onMove={handleMoveSelection}
          isSelectionArea={true}
        />
      )}
      
      {/* Show regular properties sidebar when no selection area */}
      {!selectionArea && selectedIds.length > 0 && (
        <PropertiesSidebar
          selectedObjects={objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id))}
          onStrokeColorChange={handleShapeStrokeColorChange}
          onFillColorChange={handleShapeFillColorChange}
          onStickyColorChange={handleStickyColorChange}
          onTextColorChange={handleTextColorChange}
          onTextChange={handleTextChange}
          onTextSizeChange={handleTextSizeChange}
          onTextFamilyChange={handleTextFamilyChange}
          onDelete={handleDelete}
          onDuplicate={objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id)).some((obj: WhiteboardObject) => obj.type === 'frame') ? undefined : clipboard.duplicateSelectedObjects}
          onCopy={objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id)).some((obj: WhiteboardObject) => obj.type === 'frame') ? undefined : clipboard.copySelectedObjects}
        />
      )}


      <Canvas
        boardId={boardId}
        objects={objects}
        stageRef={stageRef}
        onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
          if (connectorDrawing.isDrawingLine) {
            const stage = e.target.getStage();
            const pointerPosition = stage?.getPointerPosition();
            if (pointerPosition) {
              const x = (pointerPosition.x - position.x) / scale;
              const y = (pointerPosition.y - position.y) / scale;
              connectorDrawing.handleConnectorClick(x, y);
            }
          } else {
            handleCanvasClick(e);
          }
        }}
        onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) => {
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

        {/* Selection Area - draggable selection rectangle */}
        {selectionArea && selectedIds.length > 0 && (
          <SelectionArea
            x={selectionArea.x}
            y={selectionArea.y}
            width={selectionArea.width}
            height={selectionArea.height}
            scale={scale}
            selectedObjects={objects.filter((obj: WhiteboardObject) => selectedIds.includes(obj.id))}
            onDragMove={handleSelectionAreaDragMove}
            onDragEnd={handleSelectionAreaDragEnd}
          />
        )}

        {renderObjects.map((obj: WhiteboardObject) => {
          const renderObj = (liveObjectsMap.get(obj.id) ?? obj) as WhiteboardObject;

          if (renderObj.type === 'frame') {
            return (
              <Frame
                key={obj.id}
                data={renderObj as FrameType}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
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
                onUpdate={(updates: Partial<FrameType>) => updateFrameAndContents(obj.id, updates)}
                onDragMove={handleFrameDragMove}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }

          if (renderObj.type === 'sticky') {
            return (
              <StickyNote
                key={obj.id}
                data={renderObj as StickyNoteType}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
                onSelect={(e: Konva.KonvaEventObject<MouseEvent>) => {
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
                onUpdate={(updates: Partial<StickyNoteType>) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }
          
          if (renderObj.type === 'rect') {
            return (
              <Rectangle
                key={obj.id}
                data={renderObj as RectShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
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
                onUpdate={(updates) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }
          
          if (renderObj.type === 'circle') {
            return (
              <Circle
                key={obj.id}
                data={renderObj as CircleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
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
                onUpdate={(updates) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
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
                onSelect={(e: Konva.KonvaEventObject<MouseEvent>) => {
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
                onUpdate={(updates: Partial<LineShape>) => updateObject(obj.id, updates)}
                onEndpointDrag={connectorDrawing.handleEndpointDrag}
                onEndpointDragEnd={connectorDrawing.handleEndpointDragEnd}
              />
            );
          }

          if (renderObj.type === 'text') {
            return (
              <Text
                key={obj.id}
                data={renderObj as TextShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
                onSelect={(e: Konva.KonvaEventObject<MouseEvent>) => {
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
                onUpdate={(updates: Partial<TextShape>) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }

          if (renderObj.type === 'textBubble') {
            return (
              <TextBubble
                key={obj.id}
                data={renderObj as TextBubbleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
                onSelect={(e: Konva.KonvaEventObject<MouseEvent>) => {
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
                onUpdate={(updates: Partial<TextBubbleShape>) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }

          if (renderObj.type === 'triangle') {
            return (
              <Triangle
                key={obj.id}
                data={renderObj as TriangleShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
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
                onUpdate={(updates) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }

          if (renderObj.type === 'star') {
            return (
              <Star
                key={obj.id}
                data={renderObj as StarShape}
                isSelected={isSelected(obj.id) && !selectionArea}
                isDraggable={activeTool !== 'move'}
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
                onUpdate={(updates) => handleShapeUpdateWithClear(obj.id, updates)}
                onDragMove={handleShapeDragMoveWithBroadcast}
                onTransformMove={handleShapeTransformMoveWithBroadcast}
              />
            );
          }
          
          return null;
        })}

        {/* Connection dots on shapes — show when line tool active, drawing, or hovering */}
        {objects.map((obj: WhiteboardObject) => {
          const renderObj = (liveObjectsMap.get(obj.id) ?? obj) as WhiteboardObject;
          if (renderObj.type === 'line' || renderObj.type === 'frame') return null;
          const anyLineSelected = selectedIds.some((sid: string) => {
            const o = objectsMap.get(sid);
            return o?.type === 'line';
          });
          // Don't show dots on selected objects (Transformer handles would be blocked)
          // Only show dots when: line tool active, drawing a line, or hovering (but not selected)
          const showDots = !isTransforming && !isDragging && (
            activeTool === 'line' || 
            connectorDrawing.isDrawingLine || 
            (connectorDrawing.hoveredShapeId === obj.id && !isSelected(obj.id)) || 
            anyLineSelected
          );
          if (!showDots) return null;
          return (
            <ConnectionDots
              key={`dots-${obj.id}`}
              object={renderObj}
              highlightedAnchor={connectorDrawing.highlightedAnchor}
              onAnchorMouseDown={connectorDrawing.handleAnchorMouseDown}
            />
          );
        })}
      </Canvas>

      <AIAssistant
        messages={aiCommands.messages}
        isProcessing={aiCommands.isProcessing}
        isConnected={aiCommands.isConnected}
        isReconnecting={aiCommands.isReconnecting}
        onSendMessage={aiCommands.sendCommand}
        onReconnect={aiCommands.reconnect}
      />
    </div>
  );
}
