/**
 * Object bounds utilities — calculate bounding boxes for whiteboard objects
 */

import type { WhiteboardObject, LineShape } from '@/types/canvas';
import { resolveLinePoints } from './connectors';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculate the bounding box for an object, accounting for rotation and stroke width.
 * Returns bounds in canvas coordinates.
 */
export const getObjectBounds = (
  obj: WhiteboardObject,
  map: Map<string, WhiteboardObject>
): Bounds => {
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
};

/**
 * Check if a point is within bounds (with tolerance).
 */
export const pointInBounds = (
  x: number,
  y: number,
  bounds: Bounds,
  tolerance: number = 10
): boolean => {
  return (
    x >= bounds.minX - tolerance &&
    x <= bounds.maxX + tolerance &&
    y >= bounds.minY - tolerance &&
    y <= bounds.maxY + tolerance
  );
};

/**
 * Check if an object's bounds intersect with a rectangle.
 */
export const intersectsRect = (
  obj: WhiteboardObject,
  rect: { x: number; y: number; width: number; height: number },
  map: Map<string, WhiteboardObject>
): boolean => {
  const bounds = getObjectBounds(obj, map);
  return !(
    bounds.maxX < rect.x ||
    bounds.minX > rect.x + rect.width ||
    bounds.maxY < rect.y ||
    bounds.minY > rect.y + rect.height
  );
};

/**
 * Get all object IDs connected to the seed IDs through lines and geometric intersections.
 * This includes:
 * - Objects directly connected via line anchors
 * - Lines that intersect the cluster bounds
 * - Objects that lines touch geometrically
 */
export const getConnectedObjectIds = (
  seedIds: string[],
  allObjects: WhiteboardObject[],
  getBoundsFn: (obj: WhiteboardObject, map: Map<string, WhiteboardObject>) => Bounds
): string[] => {
  const result = new Set<string>(seedIds);
  const allMap = new Map<string, WhiteboardObject>(allObjects.map((obj) => [obj.id, obj]));
  const lineObjects = allObjects.filter((obj): obj is LineShape => obj.type === 'line');

  const getClusterBounds = (): Bounds | null => {
    const clusterIds = Array.from(result);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of clusterIds) {
      const obj = allMap.get(id);
      if (!obj || obj.type === 'frame') continue;
      const bounds = getBoundsFn(obj, allMap);
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

      const lineBounds = getBoundsFn(line, allMap);
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
      const lineSpanBounds: Bounds = {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2),
      };
      for (const obj of allObjects) {
        if (obj.type === 'line' || obj.type === 'frame') continue;
        const bounds = getBoundsFn(obj, allMap);
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
};
