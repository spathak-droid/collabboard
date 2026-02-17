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
 */
export const getAnchorPoints = (obj: WhiteboardObject): AnchorPoint[] => {
  if (obj.type === 'rect' || obj.type === 'sticky' || obj.type === 'textBubble') {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    return [
      { objectId: obj.id, anchor: 'top', x: cx, y: obj.y },
      { objectId: obj.id, anchor: 'right', x: obj.x + obj.width, y: cy },
      { objectId: obj.id, anchor: 'bottom', x: cx, y: obj.y + obj.height },
      { objectId: obj.id, anchor: 'left', x: obj.x, y: cy },
    ];
  }

  if (obj.type === 'circle') {
    return [
      { objectId: obj.id, anchor: 'top', x: obj.x, y: obj.y - obj.radius },
      { objectId: obj.id, anchor: 'right', x: obj.x + obj.radius, y: obj.y },
      { objectId: obj.id, anchor: 'bottom', x: obj.x, y: obj.y + obj.radius },
      { objectId: obj.id, anchor: 'left', x: obj.x - obj.radius, y: obj.y },
    ];
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
