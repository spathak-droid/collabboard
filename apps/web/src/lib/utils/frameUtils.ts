/**
 * Frame utilities — frame containment and management logic
 */

import type { WhiteboardObject, Frame as FrameType, LineShape } from '@/types/canvas';
import { getObjectBounds, type Bounds } from './objectBounds';

/**
 * Find which frame contains an object (if any).
 */
export const findContainingFrame = (
  objectId: string,
  objects: WhiteboardObject[]
): FrameType | null => {
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
};

/**
 * Check if object bounds are within frame bounds.
 * Optionally test with different position/points for drag preview.
 */
export const isObjectWithinFrame = (
  obj: WhiteboardObject,
  frame: FrameType,
  objects: WhiteboardObject[],
  objX?: number,
  objY?: number,
  objPoints?: number[]
): boolean => {
  const testObj = { ...obj };
  if (typeof objX === 'number') testObj.x = objX;
  if (typeof objY === 'number') testObj.y = objY;
  
  // For line objects, update points if provided
  if (obj.type === 'line' && objPoints) {
    (testObj as LineShape).points = objPoints;
  }
  
  const objMap = new Map(objects.map((o) => [o.id, o]));
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
};

/**
 * Get frame bounds.
 */
export const getFrameBounds = (
  frame: FrameType,
  objects: WhiteboardObject[]
): Bounds => {
  const objMap = new Map(objects.map((o) => [o.id, o]));
  return getObjectBounds(frame, objMap);
};
