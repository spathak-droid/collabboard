/**
 * Viewport Culling Utilities
 * 
 * Only renders objects that are visible in the current viewport.
 * This dramatically improves performance when there are many objects.
 * 
 * Benefits:
 * - 1000 objects total, only 50 visible = render 50 (20x faster)
 * - Smooth pan/zoom even with thousands of objects
 * - Maintains 60 FPS with large canvases
 */

import type { WhiteboardObject } from '@/types/canvas';

export interface Viewport {
  x: number; // Top-left X (canvas coordinates)
  y: number; // Top-left Y (canvas coordinates)
  width: number; // Viewport width (screen pixels)
  height: number; // Viewport height (screen pixels)
  scale: number; // Current zoom level
}

/**
 * Get object bounds in canvas coordinates (for minimap and viewport culling).
 */
export function getObjectBounds(obj: WhiteboardObject): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (obj.type === 'circle') {
    const radius = (obj as any).radius || 50;
    return {
      minX: obj.x - radius,
      minY: obj.y - radius,
      maxX: obj.x + radius,
      maxY: obj.y + radius,
    };
  }

  if (obj.type === 'line') {
    const points = (obj as any).points || [0, 0, 100, 100];
    return {
      minX: Math.min(points[0], points[2]) + obj.x,
      minY: Math.min(points[1], points[3]) + obj.y,
      maxX: Math.max(points[0], points[2]) + obj.x,
      maxY: Math.max(points[1], points[3]) + obj.y,
    };
  }

  if (obj.type === 'text') {
    // Text has no dimensions, use estimated size
    return {
      minX: obj.x,
      minY: obj.y,
      maxX: obj.x + 200,
      maxY: obj.y + 50,
    };
  }

  if (obj.type === 'path') {
    const path = obj as { x: number; y: number; points: number[] };
    const pts = path.points;
    if (!pts || pts.length < 2) {
      return { minX: path.x, minY: path.y, maxX: path.x + 1, maxY: path.y + 1 };
    }
    let minX = path.x + pts[0];
    let minY = path.y + pts[1];
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i < pts.length; i += 2) {
      const px = path.x + pts[i];
      const py = path.y + pts[i + 1];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return { minX, minY, maxX, maxY };
  }

  // All other types have width/height
  const width = (obj as any).width || 100;
  const height = (obj as any).height || 100;
  
  return {
    minX: obj.x,
    minY: obj.y,
    maxX: obj.x + width,
    maxY: obj.y + height,
  };
}

/**
 * Check if an object is visible in the viewport
 * 
 * Adds padding to render objects slightly outside viewport
 * (prevents pop-in during pan/zoom)
 */
export function isObjectVisible(
  obj: WhiteboardObject,
  viewport: Viewport,
  padding = 200 // Render objects 200px outside viewport
): boolean {
  const bounds = getObjectBounds(obj);

  // Convert screen viewport to canvas coordinates
  const viewportMinX = -viewport.x / viewport.scale - padding;
  const viewportMinY = -viewport.y / viewport.scale - padding;
  const viewportMaxX = (viewport.width - viewport.x) / viewport.scale + padding;
  const viewportMaxY = (viewport.height - viewport.y) / viewport.scale + padding;

  // Check if object bounds overlap with viewport
  const overlaps = !(
    bounds.maxX < viewportMinX || // Object is completely to the left
    bounds.minX > viewportMaxX || // Object is completely to the right
    bounds.maxY < viewportMinY || // Object is completely above
    bounds.minY > viewportMaxY    // Object is completely below
  );

  return overlaps;
}

/**
 * Filter objects to only those visible in viewport
 * 
 * @param objects - All objects on the canvas
 * @param viewport - Current viewport state
 * @param padding - Extra padding around viewport (default 200px)
 * @returns Array of visible objects
 */
export function getVisibleObjects(
  objects: WhiteboardObject[],
  viewport: Viewport,
  padding = 200
): WhiteboardObject[] {
  return objects.filter((obj) => isObjectVisible(obj, viewport, padding));
}

/**
 * Get viewport state from canvas position and scale
 */
export function getViewport(
  position: { x: number; y: number },
  scale: number,
  dimensions: { width: number; height: number }
): Viewport {
  return {
    x: position.x,
    y: position.y,
    width: dimensions.width,
    height: dimensions.height,
    scale,
  };
}
