/**
 * Board Canvas Page - Real-time collaborative via Yjs + Hocuspocus
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Rect as KonvaRect, Circle as KonvaCircle, Line as KonvaLine, Star as KonvaStar } from 'react-konva';
import { useAuth } from '@/lib/hooks/useAuth';
import { useYjs } from '@/lib/hooks/useYjs';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { Circle } from '@/components/canvas/objects/Circle';
import { Triangle } from '@/components/canvas/objects/Triangle';
import { Star } from '@/components/canvas/objects/Star';
import { Line } from '@/components/canvas/objects/Line';
import { TextBubble } from '@/components/canvas/objects/TextBubble';
import { Cursors } from '@/components/canvas/Cursors';
import { DisconnectBanner } from '@/components/canvas/DisconnectBanner';
import { PropertiesSidebar } from '@/components/canvas/PropertiesSidebar';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { LatencyStatusButton } from '@/components/canvas/LatencyStatusButton';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSelection } from '@/lib/hooks/useSelection';
import { generateId } from '@/lib/utils/geometry';
import { ConnectionDots } from '@/components/canvas/objects/ConnectionDots';
import { findNearestAnchor, resolveLinePoints } from '@/lib/utils/connectors';
import { STICKY_COLORS } from '@/types/canvas';
import { supabase, updateBoard, fetchBoardMembers, ensureBoardAccess, fetchOnlineUserUids, type BoardMember } from '@/lib/supabase/client';
import { getUserColor } from '@/lib/utils/colors';
import { usePresenceHeartbeat } from '@/lib/hooks/usePresenceHeartbeat';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape, CircleShape, TriangleShape, StarShape, LineShape, TextBubbleShape, AnchorPosition } from '@/types/canvas';

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

const getObjectBounds = (obj: WhiteboardObject) => {
  if (obj.type === 'circle') {
    return {
      x: obj.x - obj.radius,
      y: obj.y - obj.radius,
      width: obj.radius * 2,
      height: obj.radius * 2,
    };
  }

  if (obj.type === 'line') {
    const [x1, y1, x2, y2] = obj.points;
    const minX = Math.min(x1, x2) + obj.x;
    const minY = Math.min(y1, y2) + obj.y;
    return {
      x: minX,
      y: minY,
      width: Math.max(24, Math.abs(x2 - x1)),
      height: Math.max(24, Math.abs(y2 - y1)),
    };
  }

  return {
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
  };
};

const getSelectionBounds = (items: WhiteboardObject[]) => {
  if (items.length === 0) return null;
  const first = getObjectBounds(items[0]);
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;

  for (let i = 1; i < items.length; i += 1) {
    const bounds = getObjectBounds(items[i]);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const cloneObjectsAtPoint = (
  source: WhiteboardObject[],
  target: { x: number; y: number },
  userId: string
): WhiteboardObject[] => {
  const sourceBounds = getSelectionBounds(source);
  if (!sourceBounds) return [];
  const dx = target.x - sourceBounds.x;
  const dy = target.y - sourceBounds.y;

  const idMap = new Map<string, string>();
  source.forEach((obj) => {
    idMap.set(obj.id, generateId());
  });

  const now = Date.now();
  return source.map((obj, index) => {
    const newId = idMap.get(obj.id) || generateId();
    const baseMeta = {
      ...obj,
      id: newId,
      zIndex: obj.zIndex + index + 1,
      createdBy: userId,
      createdAt: now,
      modifiedBy: userId,
      modifiedAt: now,
    };

    if (obj.type === 'line') {
      const clonedStart = obj.startAnchor && idMap.has(obj.startAnchor.objectId)
        ? { ...obj.startAnchor, objectId: idMap.get(obj.startAnchor.objectId)! }
        : undefined;
      const clonedEnd = obj.endAnchor && idMap.has(obj.endAnchor.objectId)
        ? { ...obj.endAnchor, objectId: idMap.get(obj.endAnchor.objectId)! }
        : undefined;
      return {
        ...baseMeta,
        x: obj.x + dx,
        y: obj.y + dy,
        points: [obj.points[0] + dx, obj.points[1] + dy, obj.points[2] + dx, obj.points[3] + dy],
        startAnchor: clonedStart,
        endAnchor: clonedEnd,
      } as WhiteboardObject;
    }

    return {
      ...baseMeta,
      x: obj.x + dx,
      y: obj.y + dy,
    } as WhiteboardObject;
  });
};

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const boardId = params.id as string;
  
  const { activeTool, setActiveTool, scale, position, snapToGrid, gridMode } = useCanvasStore();
  const { selectedIds, selectObject, deselectAll, isSelected } = useSelection();
  
  const [shapeStrokeColor, setShapeStrokeColor] = useState('#000000');
  const [shapeFillColor, setShapeFillColor] = useState('#E5E7EB');
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [drawingLineId, setDrawingLineId] = useState<string | null>(null);
  const [highlightedAnchor, setHighlightedAnchor] = useState<{ objectId: string; anchor: string } | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const drawingStartedAtRef = useRef<number>(0);
  const liveDragRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [, setDragTick] = useState(0);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  const usersDropdownRef = useRef<HTMLDivElement>(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardRef = useRef<WhiteboardObject[]>([]);
  const pasteCountRef = useRef(0);
  const cursorCanvasPosRef = useRef<{ x: number; y: number } | null>(null);

  // Send heartbeat every 60s so other users know we're online
  usePresenceHeartbeat(user?.uid);

  // Track users currently viewing (cleaned up when they leave)
  const seenUsersRef = useRef<Map<string, { name: string; color: string }>>(new Map());

  // ── Real-time Yjs collaboration ───────────────────────────
  const {
    objects,
    connectionStatus,
    onlineUsers,
    awareness,
    hasUnsavedChanges,
    boardTitle: yjsBoardTitle,
    createObject: yjsCreate,
    updateObject: yjsUpdate,
    deleteObjects: yjsDeleteMany,
    updateCursor,
    getBroadcastRate,
    setBoardTitle: yjsSetBoardTitle,
  } = useYjs({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
  });

  // Redirect to login if not authenticated, or to verify-email if unverified
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.emailVerified && !user.isAnonymous) {
      router.push('/verify-email');
    }
  }, [user, authLoading, router]);

  // Load board owner + seed Yjs title + fetch members from Supabase on first load
  const boardMetaLoaded = useRef(false);
  useEffect(() => {
    if (!boardId || !user || boardMetaLoaded.current) return;
    boardMetaLoaded.current = true;

    // Fire all in parallel
    supabase
      .from('boards')
      .select('title, owner_uid')
      .eq('id', boardId)
      .single()
      .then(({ data }) => {
        if (data?.owner_uid) setOwnerUid(data.owner_uid);
        if (data?.title && !yjsBoardTitle) {
          yjsSetBoardTitle(data.title);
        }
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
  
  const isOwner = ownerUid !== null && user?.uid === ownerUid;
  const boardTitle = yjsBoardTitle || 'Untitled Board';

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const newTitle = e.target.value;

    // Update via Yjs (real-time broadcast to all users)
    yjsSetBoardTitle(newTitle);

    // Debounce persist to Supabase
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      updateBoard(boardId, {
        title: newTitle,
        last_modified: new Date().toISOString(),
      }).catch(console.error);
    }, 500);
  };
  
  const createObject = (obj: WhiteboardObject) => {
    yjsCreate(obj);
  };
  
  const updateObject = (id: string, updates: Partial<WhiteboardObject>) => {
    yjsUpdate(id, updates);
  };
  
  const deleteObjectsByIds = (ids: string[]) => {
    yjsDeleteMany(ids);
  };
  
  const handleShapeStrokeColorChange = (color: string) => {
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && obj.type !== 'sticky') {
        yjsUpdate(id, { stroke: color });
      }
    });
  };
  
  const handleShapeFillColorChange = (color: string) => {
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && obj.type !== 'sticky' && obj.type !== 'line') {
        yjsUpdate(id, { fill: color });
      }
    });
  };

  const handleStickyColorChange = (color: string) => {
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && obj.type === 'sticky') {
        yjsUpdate(id, { color });
      }
    });
  };
  
  const handleTextChange = (text: string) => {
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'sticky' || obj.type === 'textBubble')) {
        yjsUpdate(id, { text });
      }
    });
  };

  const handleTextSizeChange = (size: number) => {
    const clamped = Math.max(12, Math.min(48, size));
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'sticky' || obj.type === 'textBubble')) {
        yjsUpdate(id, { textSize: clamped });
      }
    });
  };

  const handleTextFamilyChange = (family: 'Inter' | 'Poppins' | 'Merriweather') => {
    selectedIds.forEach((id) => {
      const obj = objects.find((o) => o.id === id);
      if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'sticky' || obj.type === 'textBubble')) {
        yjsUpdate(id, { textFamily: family });
      }
    });
  };
  
  const handleObjectSelect = (id: string) => {
    selectObject(id);
  };

  const selectedObjects = useMemo(
    () => objects.filter((obj) => selectedIds.includes(obj.id)),
    [objects, selectedIds]
  );

  const showCopyToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
    }, 1300);
  }, []);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  const getCurrentCanvasCursor = useCallback(() => {
    if (cursorCanvasPosRef.current) return cursorCanvasPosRef.current;
    const viewportCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
    const viewportCenterY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
    return {
      x: (viewportCenterX - position.x) / scale,
      y: (viewportCenterY - position.y) / scale,
    };
  }, [position, scale]);

  const copySelectedObjects = useCallback(() => {
    if (selectedObjects.length === 0) return;
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 0;
    showCopyToast();
  }, [selectedObjects, showCopyToast]);

  const pasteClipboardObjects = useCallback(() => {
    if (!user || clipboardRef.current.length === 0) return;
    const cloned = cloneObjectsAtPoint(clipboardRef.current, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;
    cloned.forEach((obj) => yjsCreate(obj));
    selectObject(cloned[cloned.length - 1].id);
    pasteCountRef.current += 1;
  }, [user, yjsCreate, selectObject, getCurrentCanvasCursor]);

  const duplicateSelectedObjects = useCallback(() => {
    if (selectedObjects.length === 0 || !user) return;
    const cloned = cloneObjectsAtPoint(selectedObjects, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;
    cloned.forEach((obj) => yjsCreate(obj));
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 1;
    selectObject(cloned[cloned.length - 1].id);
  }, [selectedObjects, user, yjsCreate, selectObject, getCurrentCanvasCursor]);

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

      setPreviewPosition(getPlacementCoordinates(pointerPosition.x, pointerPosition.y));
    },
    [activeTool, getPlacementCoordinates]
  );

  useEffect(() => {
    if (!activeTool || activeTool === 'select') {
      setPreviewPosition(null);
    }
  }, [activeTool]);
  
  const handleCanvasClick = useCallback(
    (e: any) => {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();
      
      if (!pointerPosition) return;
      
      const { x, y } = getPlacementCoordinates(pointerPosition.x, pointerPosition.y);
      
      // Check if clicking on background
      if (e.target === stage) {
        // Deselect all when clicking empty canvas
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
            createdBy: user?.uid || 'unknown',
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
            createdBy: user?.uid || 'unknown',
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
            createdBy: user?.uid || 'unknown',
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
            width: 240,
            height: 180,
            fill: shapeFillColor,
            stroke: shapeStrokeColor,
            strokeWidth: 2,
            rotation: 0,
            zIndex: objects.length,
            createdBy: user?.uid || 'unknown',
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
            createdBy: user?.uid || 'unknown',
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
            createdBy: user?.uid || 'unknown',
            createdAt: Date.now(),
          };

          createObject(textBubble);
          setActiveTool('select');
        } else {
          deselectAll();
        }
      }
    },
    [activeTool, objects, user, shapeFillColor, shapeStrokeColor, getPlacementCoordinates, setActiveTool, deselectAll]
  );
  
  const handleDelete = useCallback(() => {
    if (selectedIds.length > 0) {
      deleteObjectsByIds(selectedIds);
      deselectAll();
    }
  }, [selectedIds, deselectAll, deleteObjectsByIds]);

  // ── Connector logic ──
  const objectsMap = useMemo(() => {
    const map = new Map<string, WhiteboardObject>();
    for (const obj of objects) map.set(obj.id, obj);
    return map;
  }, [objects]);

  // Overlay live drag positions for smooth line rendering during shape drag
  const liveObjectsMap: Map<string, WhiteboardObject> = liveDragRef.current.size === 0
    ? objectsMap
    : (() => {
        const map = new Map(objectsMap);
        liveDragRef.current.forEach((pos, id) => {
          const obj = map.get(id);
          if (obj) map.set(id, { ...obj, x: pos.x, y: pos.y } as WhiteboardObject);
        });
        return map;
      })();

  const updateShapeAndConnectors = useCallback(
    (shapeId: string, updates: Partial<WhiteboardObject>) => {
      liveDragRef.current.delete(shapeId);

      yjsUpdate(shapeId, updates);
      const currentObj = objects.find((o) => o.id === shapeId);
      if (!currentObj) return;
      const updatedObj = { ...currentObj, ...updates } as WhiteboardObject;
      for (const obj of objects) {
        if (obj.type !== 'line') continue;
        const line = obj as LineShape;
        if (line.startAnchor?.objectId !== shapeId && line.endAnchor?.objectId !== shapeId) continue;
        const tempMap = new Map(objects.map((o) => [o.id, o]));
        tempMap.set(shapeId, updatedObj);
        const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
        yjsUpdate(line.id, { x: 0, y: 0, points: [x1, y1, x2, y2] });
      }
    },
    [objects, yjsUpdate]
  );

  // Live-update connected lines while a shape is being dragged
  const handleShapeDragMove = useCallback(
    (shapeId: string, liveX: number, liveY: number) => {
      liveDragRef.current.set(shapeId, { x: liveX, y: liveY });
      setDragTick((t) => t + 1);
    },
    []
  );

  // Click a dot to start drawing, click again to finish (two-click flow)
  const handleAnchorMouseDown = useCallback(
    (objectId: string, anchor: string, anchorX: number, anchorY: number) => {
      // If already drawing, treat this as finishing on this anchor
      if (isDrawingLine && drawingLineId) {
        const line = objectsMap.get(drawingLineId) as LineShape | undefined;
        if (line && objectId !== line.startAnchor?.objectId) {
          yjsUpdate(drawingLineId, {
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
      yjsCreate(line);
      setDrawingLineId(lineId);
      setIsDrawingLine(true);
      drawingStartedAtRef.current = Date.now();
      setActiveTool('select');
    },
    [isDrawingLine, drawingLineId, objectsMap, shapeStrokeColor, objects.length, user, yjsCreate, yjsUpdate, setActiveTool]
  );

  const handleConnectorMouseMove = useCallback(
    (pointerX: number, pointerY: number) => {
      if (!isDrawingLine || !drawingLineId) return;
      const x = (pointerX - position.x) / scale;
      const y = (pointerY - position.y) / scale;
      const line = objectsMap.get(drawingLineId) as LineShape | undefined;
      if (!line) return;
      const nearest = findNearestAnchor(x, y, objects, [drawingLineId, line.startAnchor?.objectId || '']);
      if (nearest) {
        setHighlightedAnchor({ objectId: nearest.objectId, anchor: nearest.anchor });
        yjsUpdate(drawingLineId, { points: [line.points[0], line.points[1], nearest.x, nearest.y] });
      } else {
        setHighlightedAnchor(null);
        yjsUpdate(drawingLineId, { points: [line.points[0], line.points[1], x, y] });
      }
    },
    [isDrawingLine, drawingLineId, position, scale, objectsMap, objects, yjsUpdate]
  );

  // Second click on empty canvas finishes the line (free endpoint with arrow)
  const handleConnectorClick = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } } }) => {
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

      const nearest = findNearestAnchor(x, y, objects, [drawingLineId, line.startAnchor?.objectId || '']);
      if (nearest) {
        yjsUpdate(drawingLineId, {
          endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
          points: [line.points[0], line.points[1], nearest.x, nearest.y],
        });
      } else {
        yjsUpdate(drawingLineId, {
          points: [line.points[0], line.points[1], x, y],
        });
      }

      setIsDrawingLine(false);
      setDrawingLineId(null);
      setHighlightedAnchor(null);
    },
    [isDrawingLine, drawingLineId, position, scale, objectsMap, objects, yjsUpdate]
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
          yjsUpdate(lineId, {
            startAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [nearest.x, nearest.y, line.points[2], line.points[3]],
            x: 0, y: 0,
          });
        } else {
          yjsUpdate(lineId, {
            endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [line.points[0], line.points[1], nearest.x, nearest.y],
            x: 0, y: 0,
          });
        }
      } else {
        if (endpoint === 'start') {
          yjsUpdate(lineId, { startAnchor: undefined });
        } else {
          yjsUpdate(lineId, { endAnchor: undefined });
        }
      }
      setHighlightedAnchor(null);
    },
    [objectsMap, objects, yjsUpdate]
  );

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

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.getElementById('inline-shape-editor')) {
        return;
      }
      if (isEditableElement(e.target)) return;

      // Escape cancels line drawing
      if (e.key === 'Escape' && isDrawingLine && drawingLineId) {
        deleteObjectsByIds([drawingLineId]);
        setIsDrawingLine(false);
        setDrawingLineId(null);
        setHighlightedAnchor(null);
        return;
      }
      
      if (e.key === 'Delete') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDelete();
        }
      }

      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      if (isMetaOrCtrl && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          copySelectedObjects();
        }
      }

      if (isMetaOrCtrl && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault();
          pasteClipboardObjects();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    isDrawingLine,
    drawingLineId,
    deleteObjectsByIds,
    handleDelete,
    copySelectedObjects,
    pasteClipboardObjects,
  ]);
  
  // ── Build collaborator list (only currently viewing + board members) ──
  // Clean up seenUsersRef: remove users who are no longer viewing
  const currentViewingIds = new Set(onlineUsers.map((s) => s.user.id));
  Array.from(seenUsersRef.current.keys()).forEach((uid) => {
    if (!currentViewingIds.has(uid)) {
      seenUsersRef.current.delete(uid);
    }
  });
  // Track current users (for potential future use)
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
      status: 'viewing',
      isYou: state.user.id === user?.uid,
    });
  }

  const MAX_VISIBLE = 4;
  const visibleCollabs = collaborators.slice(0, MAX_VISIBLE);
  const overflowCount = collaborators.length - MAX_VISIBLE;
  const selectedBounds = getSelectionBounds(selectedObjects);
  const popupPosition = selectedBounds
    ? {
        x: Math.min(
          Math.max(position.x + (selectedBounds.x + selectedBounds.width / 2) * scale, 90),
          typeof window !== 'undefined' ? window.innerWidth - 90 : 1200
        ),
        y: Math.max(position.y + selectedBounds.y * scale - 12, 78),
      }
    : null;
  const canShowObjectActions =
    selectedIds.length > 0 &&
    (typeof document === 'undefined' || !document.getElementById('inline-shape-editor'));

  if (!mounted || authLoading || !user || (!user.emailVerified && !user.isAnonymous)) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen relative bg-white" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
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
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white shadow-sm relative hover:z-20 hover:scale-110 transition-transform"
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
                    className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold border-2 border-white shadow-sm hover:bg-gray-300 transition-colors relative z-0"
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>
            </button>

            {/* Dropdown listing all collaborators */}
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
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                        style={{
                          backgroundColor: c.color,
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
                      </div>
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
      
      {/* Properties Sidebar - shows when objects selected */}
      {selectedIds.length > 0 && (
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
        />
      )}

      {/* Disconnect banner */}
      <DisconnectBanner status={connectionStatus} />

      <Canvas 
        boardId={boardId}
        objects={objects}
        onClick={(e: any) => {
          if (isDrawingLine) {
            handleConnectorClick(e);
          } else {
            handleCanvasClick(e);
          }
        }}
        onMouseMove={(e: any) => {
          handleCanvasMouseMove(e);
          const stage = e.target.getStage();
          const pos = stage?.getPointerPosition();
          if (pos) {
            const canvasX = (pos.x - position.x) / scale;
            const canvasY = (pos.y - position.y) / scale;
            cursorCanvasPosRef.current = { x: canvasX, y: canvasY };
            updateCursor(canvasX, canvasY);
            handleConnectorMouseMove(pos.x, pos.y);
          }
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
            points={[120, 0, 240, 180, 0, 180]}
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

        {objects.map((obj) => {
          if (obj.type === 'sticky') {
            return (
              <StickyNote
                key={obj.id}
                data={obj as StickyNoteType}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }
          
          if (obj.type === 'rect') {
            return (
              <Rectangle
                key={obj.id}
                data={obj as RectShape}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }
          
          if (obj.type === 'circle') {
            return (
              <Circle
                key={obj.id}
                data={obj as CircleShape}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }

          if (obj.type === 'triangle') {
            return (
              <Triangle
                key={obj.id}
                data={obj as TriangleShape}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }

          if (obj.type === 'star') {
            return (
              <Star
                key={obj.id}
                data={obj as StarShape}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }
          
          if (obj.type === 'line') {
            const lineData = obj as LineShape;
            const hasConnector = !!(lineData.startAnchor || lineData.endAnchor);
            const resolved = hasConnector ? resolveLinePoints(lineData, liveObjectsMap) : null;
            return (
              <Line
                key={obj.id}
                data={lineData}
                resolvedPoints={resolved}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateObject(obj.id, updates)}
                onEndpointDrag={handleEndpointDrag}
                onEndpointDragEnd={handleEndpointDragEnd}
              />
            );
          }

          if (obj.type === 'textBubble') {
            return (
              <TextBubble
                key={obj.id}
                data={obj as TextBubbleShape}
                isSelected={isSelected(obj.id)}
                onSelect={() => handleObjectSelect(obj.id)}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }
          
          return null;
        })}

        {/* Connection dots on shapes */}
        {objects.map((obj) => {
          if (obj.type === 'line') return null;
          const anyLineSelected = selectedIds.some((sid) => {
            const o = objectsMap.get(sid);
            return o?.type === 'line';
          });
          const showDots = activeTool === 'line' || isDrawingLine || isSelected(obj.id) || hoveredShapeId === obj.id || anyLineSelected;
          if (!showDots) return null;
          return (
            <ConnectionDots
              key={`dots-${obj.id}`}
              object={obj}
              highlightedAnchor={highlightedAnchor}
              onAnchorMouseDown={handleAnchorMouseDown}
            />
          );
        })}

      </Canvas>

      {/* Multiplayer cursors (HTML overlay) */}
      <Cursors
        awareness={awareness}
        currentUserId={user.uid}
        scale={scale}
        position={position}
      />

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs z-30">
        <div className="font-semibold mb-1 text-gray-900">⌨️ Controls:</div>
        <div className="text-gray-600">Delete key - Delete selected</div>
        <div className="text-gray-600">Cmd/Ctrl+C - Copy selected</div>
        <div className="text-gray-600">Cmd/Ctrl+V - Paste copied</div>
        <div className="text-gray-600">Scroll/Swipe - Zoom in/out</div>
        <div className="text-gray-600">Click+Drag - Pan canvas</div>
      </div>
    </div>
  );
}
