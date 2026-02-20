/**
 * Hook for object manipulation — drag, transform, and connector updates
 */

import { useCallback, useRef, useState } from 'react';
import type { WhiteboardObject, LineShape } from '@/types/canvas';
import { resolveLinePoints } from '@/lib/utils/connectors';

interface LiveDragPosition {
  x: number;
  y: number;
}

interface LiveTransformPosition {
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
  radius?: number;
}

/**
 * Hook that provides object manipulation functions.
 */
export function useObjectManipulation(
  objects: WhiteboardObject[],
  objectsMap: Map<string, WhiteboardObject>,
  updateObject: (id: string, updates: Partial<WhiteboardObject>) => void
) {
  const liveDragRef = useRef<Map<string, LiveDragPosition>>(new Map());
  const liveTransformRef = useRef<Map<string, LiveTransformPosition>>(new Map());
  const [dragTick, setDragTick] = useState(0);

  /**
   * Update a shape and reposition any connected lines.
   * Objects can move independently - no frame locking.
   */
  const updateShapeAndConnectors = useCallback(
    (shapeId: string, updates: Partial<WhiteboardObject>) => {
      // Clear live drag/transform positions — the real state is now being persisted
      liveDragRef.current.delete(shapeId);
      liveTransformRef.current.delete(shapeId);

      const currentObj = objects.find((o) => o.id === shapeId);
      if (!currentObj) return;

      // Update object - no frame containment checks
      updateObject(shapeId, updates);

      const updatedObj = { ...currentObj, ...updates } as WhiteboardObject;
      updateConnectedLines(shapeId, updatedObj, objects, updateObject);
    },
    [objects, updateObject]
  );

  /**
   * Helper function to update connected lines when a shape moves.
   */
  const updateConnectedLines = (
    shapeId: string,
    updatedObj: WhiteboardObject,
    allObjects: WhiteboardObject[],
    updateFn: (id: string, updates: Partial<WhiteboardObject>) => void
  ) => {
    for (const obj of allObjects) {
      if (obj.type !== 'line') continue;
      const line = obj as LineShape;
      const startConnected = line.startAnchor?.objectId === shapeId;
      const endConnected = line.endAnchor?.objectId === shapeId;
      if (!startConnected && !endConnected) continue;

      const tempMap = new Map(allObjects.map((o) => [o.id, o]));
      tempMap.set(shapeId, updatedObj);

      const [x1, y1, x2, y2] = resolveLinePoints(line, tempMap);
      updateFn(line.id, { x: 0, y: 0, points: [x1, y1, x2, y2] });
    }
  };

  /**
   * Live-update connected lines while a shape is being dragged.
   * Uses a ref so we bypass stale React state — just store position and trigger re-render.
   * Objects can move independently - no frame containment checks.
   */
  const handleShapeDragMove = useCallback(
    (shapeId: string, liveX: number, liveY: number) => {
      liveDragRef.current.set(shapeId, { x: liveX, y: liveY });
      setDragTick((t) => t + 1);
    },
    []
  );

  /**
   * Live-update connected lines while a shape is being transformed (rotated/resized).
   */
  const handleShapeTransformMove = useCallback(
    (
      shapeId: string,
      liveX: number,
      liveY: number,
      liveRotation: number,
      dimensions?: { width?: number; height?: number; radius?: number }
    ) => {
      liveTransformRef.current.set(shapeId, {
        x: liveX,
        y: liveY,
        rotation: liveRotation,
        ...dimensions,
      });
      setDragTick((t) => t + 1);
    },
    []
  );

  /**
   * Get live drag position for an object (for smooth rendering during drag).
   */
  const getLiveDragPosition = useCallback((objectId: string): LiveDragPosition | null => {
    return liveDragRef.current.get(objectId) || null;
  }, []);

  /**
   * Get live transform position for an object (for smooth rendering during transform).
   */
  const getLiveTransformPosition = useCallback(
    (objectId: string): LiveTransformPosition | null => {
      return liveTransformRef.current.get(objectId) || null;
    },
    []
  );

  return {
    updateShapeAndConnectors,
    handleShapeDragMove,
    handleShapeTransformMove,
    getLiveDragPosition,
    getLiveTransformPosition,
    dragTick, // Used to trigger re-renders during drag
    setDragTick, // Expose setter for frame dragging
    liveDragRef, // Expose ref for frame dragging
    liveTransformRef, // Expose ref for frame dragging
  };
}
