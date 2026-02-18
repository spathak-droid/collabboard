/**
 * Hook for connector/line drawing logic
 */

import { useState, useCallback, useRef } from 'react';
import type { WhiteboardObject, LineShape, AnchorPosition } from '@/types/canvas';
import { findNearestAnchor } from '@/lib/utils/connectors';
import { generateId } from '@/lib/utils/geometry';
import type { ActiveTool } from '@/lib/store/canvas';

interface HighlightedAnchor {
  objectId: string;
  anchor: string;
}

/**
 * Hook that manages connector/line drawing state and handlers.
 */
export function useConnectorDrawing(
  objects: WhiteboardObject[],
  objectsMap: Map<string, WhiteboardObject>,
  updateObject: (id: string, updates: Partial<WhiteboardObject>) => void,
  createObject: (obj: WhiteboardObject) => void,
  deleteObjects: (ids: string[]) => void,
  position: { x: number; y: number },
  scale: number,
  shapeStrokeColor: string,
  user: { uid: string } | null,
  setActiveTool: (tool: ActiveTool) => void
) {
  const [isDrawingLine, setIsDrawingLine] = useState(false);
  const [drawingLineId, setDrawingLineId] = useState<string | null>(null);
  const [highlightedAnchor, setHighlightedAnchor] = useState<HighlightedAnchor | null>(null);
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const drawingStartedAtRef = useRef<number>(0);

  /**
   * Start drawing a connector line from an anchor point.
   */
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

      // Start new line from this anchor
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
    [
      isDrawingLine,
      drawingLineId,
      objectsMap,
      shapeStrokeColor,
      objects.length,
      user,
      createObject,
      updateObject,
      setActiveTool,
    ]
  );

  /**
   * Handle mouse move during line drawing - update line end point.
   */
  const handleDrawingMouseMove = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!isDrawingLine || !drawingLineId) return;

      const line = objectsMap.get(drawingLineId) as LineShape | undefined;
      if (!line) return;

      const nearest = findNearestAnchor(canvasX, canvasY, objects, [
        drawingLineId,
        line.startAnchor?.objectId || '',
      ]);
      if (nearest) {
        setHighlightedAnchor({ objectId: nearest.objectId, anchor: nearest.anchor });
        updateObject(drawingLineId, {
          points: [line.points[0], line.points[1], nearest.x, nearest.y],
        });
      } else {
        setHighlightedAnchor(null);
        updateObject(drawingLineId, {
          points: [line.points[0], line.points[1], canvasX, canvasY],
        });
      }
    },
    [isDrawingLine, drawingLineId, objectsMap, objects, updateObject]
  );

  /**
   * Handle click to finish drawing a connector line.
   */
  const handleConnectorClick = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!isDrawingLine || !drawingLineId) return;

      // Ignore the click that comes from the same mouseDown that started drawing
      if (Date.now() - drawingStartedAtRef.current < 300) return;

      const line = objectsMap.get(drawingLineId) as LineShape | undefined;
      if (!line) {
        setIsDrawingLine(false);
        setDrawingLineId(null);
        setHighlightedAnchor(null);
        return;
      }

      // Check if near an anchor
      const nearest = findNearestAnchor(canvasX, canvasY, objects, [
        drawingLineId,
        line.startAnchor?.objectId || '',
      ]);
      if (nearest) {
        updateObject(drawingLineId, {
          endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
          points: [line.points[0], line.points[1], nearest.x, nearest.y],
        });
      } else {
        updateObject(drawingLineId, {
          points: [line.points[0], line.points[1], canvasX, canvasY],
        });
      }

      setIsDrawingLine(false);
      setDrawingLineId(null);
      setHighlightedAnchor(null);
    },
    [isDrawingLine, drawingLineId, objectsMap, objects, updateObject]
  );

  /**
   * Cancel line drawing (e.g., on Escape key).
   */
  const cancelLineDrawing = useCallback(() => {
    if (drawingLineId) {
      deleteObjects([drawingLineId]);
    }
    setIsDrawingLine(false);
    setDrawingLineId(null);
    setHighlightedAnchor(null);
  }, [drawingLineId, deleteObjects]);

  /**
   * Endpoint drag handler — called while dragging a line's start/end handle.
   */
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

  /**
   * Endpoint drag end — finalize connection or leave free.
   */
  const handleEndpointDragEnd = useCallback(
    (lineId: string, endpoint: 'start' | 'end', canvasX: number, canvasY: number) => {
      const line = objectsMap.get(lineId) as LineShape | undefined;
      if (!line) {
        setHighlightedAnchor(null);
        return;
      }

      const excludeIds = [lineId];
      if (endpoint === 'start' && line.endAnchor) excludeIds.push(line.endAnchor.objectId);
      if (endpoint === 'end' && line.startAnchor) excludeIds.push(line.startAnchor.objectId);

      const nearest = findNearestAnchor(canvasX, canvasY, objects, excludeIds);
      if (nearest) {
        if (endpoint === 'start') {
          updateObject(lineId, {
            startAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [nearest.x, nearest.y, line.points[2], line.points[3]],
            x: 0,
            y: 0,
          });
        } else {
          updateObject(lineId, {
            endAnchor: { objectId: nearest.objectId, anchor: nearest.anchor as AnchorPosition },
            points: [line.points[0], line.points[1], nearest.x, nearest.y],
            x: 0,
            y: 0,
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

  return {
    isDrawingLine,
    drawingLineId,
    highlightedAnchor,
    hoveredShapeId,
    setHoveredShapeId,
    handleAnchorMouseDown,
    handleDrawingMouseMove,
    handleConnectorClick,
    cancelLineDrawing,
    handleEndpointDrag,
    handleEndpointDragEnd,
  };
}
