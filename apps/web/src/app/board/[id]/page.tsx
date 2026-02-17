/**
 * Whiteboard Board Page - Main collaborative canvas with real-time sync
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Rect as KonvaRect, Circle as KonvaCircle } from 'react-konva';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { Circle } from '@/components/canvas/objects/Circle';
import { Line } from '@/components/canvas/objects/Line';
import { TextBubble } from '@/components/canvas/objects/TextBubble';
import { Cursors } from '@/components/canvas/Cursors';
import { DisconnectBanner } from '@/components/canvas/DisconnectBanner';
import { PropertiesSidebar } from '@/components/canvas/PropertiesSidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useYjs } from '@/lib/hooks/useYjs';
import { useSelection } from '@/lib/hooks/useSelection';
import { useCanvasStore } from '@/lib/store/canvas';
import { generateId } from '@/lib/utils/geometry';
import { getUserColor } from '@/lib/utils/colors';
import { supabase, updateBoard, fetchBoardMembers, ensureBoardAccess, fetchOnlineUserUids, type BoardMember } from '@/lib/supabase/client';
import { usePresenceHeartbeat } from '@/lib/hooks/usePresenceHeartbeat';
import { ConnectionDots } from '@/components/canvas/objects/ConnectionDots';
import { findNearestAnchor, resolveLinePoints } from '@/lib/utils/connectors';
import { STICKY_COLORS } from '@/types/canvas';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape, CircleShape, LineShape, TextBubbleShape, AnchorPosition } from '@/types/canvas';

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
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usersDropdownRef = useRef<HTMLDivElement>(null);

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
    hasUnsavedChanges,
  } = useYjs({
    boardId,
    userId: user?.uid || '',
    userName: user?.displayName || user?.email || 'Anonymous',
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
  } = useSelection();
  
  const { activeTool, setActiveTool, scale, position, snapToGrid, gridMode } = useCanvasStore();
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);

  // ── Connector drawing state ──
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [drawingLineId, setDrawingLineId] = useState<string | null>(null);
  const [highlightedAnchor, setHighlightedAnchor] = useState<{ objectId: string; anchor: string } | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const drawingStartedAtRef = useRef<number>(0);

  // Track live drag positions for smooth line following during shape drag
  const liveDragRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [, setDragTick] = useState(0);
  
  // Redirect to login if not authenticated, or to verify-email if unverified
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.emailVerified) {
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
        if (obj && obj.type !== 'sticky' && obj.type !== 'line') {
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
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble')) {
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
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble')) {
          updateObject(id, { textSize: clamped });
        }
      });
    }
  };

  const handleTextFamilyChange = (family: 'Inter' | 'Poppins' | 'Merriweather') => {
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const obj = objects.find(o => o.id === id);
        if (obj && (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble')) {
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
    [activeTool, objects.length, user, shapeFillColor, shapeStrokeColor, createObject, getPlacementCoordinates, setActiveTool, deselectAll]
  );
  
  // Update a shape and reposition any connected lines
  const updateShapeAndConnectors = useCallback(
    (shapeId: string, updates: Partial<WhiteboardObject>) => {
      // Clear live drag position — the real state is now being persisted
      liveDragRef.current.delete(shapeId);

      updateObject(shapeId, updates);

      const currentObj = objects.find((o) => o.id === shapeId);
      if (!currentObj) return;

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
    [objects, updateObject]
  );

  // Live-update connected lines while a shape is being dragged
  // Uses a ref so we bypass stale React state — just store position and trigger re-render
  const handleShapeDragMove = useCallback(
    (shapeId: string, liveX: number, liveY: number) => {
      liveDragRef.current.set(shapeId, { x: liveX, y: liveY });
      setDragTick((t) => t + 1);
    },
    []
  );

  // Build an objects map for resolving connector positions
  const objectsMap = useMemo(() => {
    const map = new Map<string, WhiteboardObject>();
    for (const obj of objects) map.set(obj.id, obj);
    return map;
  }, [objects]);

  // Overlay live drag positions on top of objectsMap for smooth line rendering
  // Computed every render (cheap — only iterates liveDragRef entries)
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
      
      updateCursor(x, y);

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
    [position, scale, updateCursor, isDrawingLine, drawingLineId, objectsMap, objects, updateObject]
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

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.getElementById('inline-shape-editor')) {
        return;
      }

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
          deleteObjects(selectedIds);
          deselectAll();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, deleteObjects, deselectAll, isDrawingLine, drawingLineId]);
  
  const handleDelete = useCallback(() => {
    if (selectedIds.length > 0) {
      deleteObjects(selectedIds);
      deselectAll();
    }
  }, [selectedIds, deleteObjects, deselectAll]);

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
  
  if (!mounted || authLoading || !user || !user.emailVerified) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen relative bg-white" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <DisconnectBanner status={connectionStatus} />
      
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
          <span className={`text-xs px-2 py-1 rounded ${
            connectionStatus.status === 'connected'
              ? 'text-green-700 bg-green-100'
              : connectionStatus.status === 'connecting'
              ? 'text-blue-700 bg-blue-100'
              : 'text-red-700 bg-red-100'
          }`}>
            {connectionStatus.status === 'connected' ? 'Connected' : connectionStatus.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
      </div>

      <Toolbar onDelete={handleDelete} selectedCount={selectedIds.length} />
      
      <Cursors
        awareness={awareness}
        currentUserId={user.uid}
        scale={scale}
        position={position}
      />
      
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
        />
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
                onSelect={(e) => {
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
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
                onSelect={(e) => {
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
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
                onSelect={(e) => {
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
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
                onSelect={(e) => {
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

          if (obj.type === 'textBubble') {
            return (
              <TextBubble
                key={obj.id}
                data={obj as TextBubbleShape}
                isSelected={isSelected(obj.id)}
                onSelect={(e) => {
                  if (e.evt.shiftKey) {
                    selectObject(obj.id, true);
                  } else {
                    selectObject(obj.id, false);
                  }
                }}
                onUpdate={(updates) => updateShapeAndConnectors(obj.id, updates)}
                onDragMove={handleShapeDragMove}
              />
            );
          }
          
          return null;
        })}

        {/* Connection dots on shapes — show when line tool active, drawing, or hovering */}
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
    </div>
  );
}
