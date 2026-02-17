/**
 * Connector utilities — compute anchor positions on shapes and find nearest anchors.
 */

import type { WhiteboardObject, AnchorPosition } from '@/types/canvas';

export interface AnchorPoint {
  objectId: string;
  anchor: AnchorPosition;
  x: number;
  y: number;
}

const SNAP_DISTANCE = 20; // px — how close the cursor must be to snap

/**
 * Get the 4 anchor points (top, right, bottom, left) for a shape in canvas coordinates.
 * Accounts for object rotation around the top-left corner (Konva default).
 */
export const getAnchorPoints = (obj: WhiteboardObject): AnchorPoint[] => {
  const rotation = obj.rotation || 0;
  const rotRad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  
  if (obj.type === 'rect' || obj.type === 'sticky' || obj.type === 'textBubble') {
    // Anchor points in local coordinates (relative to top-left, which is the rotation origin)
    const halfW = obj.width / 2;
    const halfH = obj.height / 2;
    
    const localAnchors = [
      { anchor: 'top' as const, x: halfW, y: 0 },           // top center
      { anchor: 'right' as const, x: obj.width, y: halfH }, // right center
      { anchor: 'bottom' as const, x: halfW, y: obj.height }, // bottom center
      { anchor: 'left' as const, x: 0, y: halfH },          // left center
    ];
    
    // Apply rotation around origin (0,0) which is top-left corner
    return localAnchors.map(({ anchor, x, y }) => {
      const rotX = x * cosR - y * sinR;
      const rotY = x * sinR + y * cosR;
      return {
        objectId: obj.id,
        anchor,
        x: obj.x + rotX,
        y: obj.y + rotY,
      };
    });
  }

  if (obj.type === 'circle') {
    // Circle position is the center, rotation is around center
    const localAnchors = [
      { anchor: 'top' as const, x: 0, y: -obj.radius },
      { anchor: 'right' as const, x: obj.radius, y: 0 },
      { anchor: 'bottom' as const, x: 0, y: obj.radius },
      { anchor: 'left' as const, x: -obj.radius, y: 0 },
    ];
    
    return localAnchors.map(({ anchor, x, y }) => {
      const rotX = x * cosR - y * sinR;
      const rotY = x * sinR + y * cosR;
      return {
        objectId: obj.id,
        anchor,
        x: obj.x + rotX,
        y: obj.y + rotY,
      };
    });
  }

  return [];
};

/**
 * Get the canvas position of a specific anchor on a specific object.
 */
export const getAnchorPosition = (
  obj: WhiteboardObject,
  anchor: AnchorPosition
): { x: number; y: number } | null => {
  const points = getAnchorPoints(obj);
  const found = points.find((p) => p.anchor === anchor);
  return found ? { x: found.x, y: found.y } : null;
};

/**
 * Find the nearest anchor point to a given position, within SNAP_DISTANCE.
 * Optionally exclude a specific object (e.g., the line itself).
 */
export const findNearestAnchor = (
  canvasX: number,
  canvasY: number,
  objects: WhiteboardObject[],
  excludeIds: string[] = []
): AnchorPoint | null => {
  let nearest: AnchorPoint | null = null;
  let minDist = SNAP_DISTANCE;

  for (const obj of objects) {
    if (excludeIds.includes(obj.id)) continue;
    if (obj.type === 'line') continue; // lines don't have anchors

    const anchors = getAnchorPoints(obj);
    for (const anchor of anchors) {
      const dx = anchor.x - canvasX;
      const dy = anchor.y - canvasY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = anchor;
      }
    }
  }

  return nearest;
};

/**
 * Resolve a line's actual start/end points, taking connected anchors into account.
 * Returns absolute canvas coordinates [x1, y1, x2, y2].
 */
export const resolveLinePoints = (
  line: { x: number; y: number; points: number[]; startAnchor?: { objectId: string; anchor: AnchorPosition }; endAnchor?: { objectId: string; anchor: AnchorPosition } },
  objectsMap: Map<string, WhiteboardObject>
): [number, number, number, number] => {
  let x1 = line.x + line.points[0];
  let y1 = line.y + line.points[1];
  let x2 = line.x + line.points[2];
  let y2 = line.y + line.points[3];

  if (line.startAnchor) {
    const obj = objectsMap.get(line.startAnchor.objectId);
    if (obj) {
      const pos = getAnchorPosition(obj, line.startAnchor.anchor);
      if (pos) { x1 = pos.x; y1 = pos.y; }
    }
  }

  if (line.endAnchor) {
    const obj = objectsMap.get(line.endAnchor.objectId);
    if (obj) {
      const pos = getAnchorPosition(obj, line.endAnchor.anchor);
      if (pos) { x2 = pos.x; y2 = pos.y; }
    }
  }

  return [x1, y1, x2, y2];
};
