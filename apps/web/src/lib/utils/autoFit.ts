/**
 * Auto-fit utilities for canvas zoom and positioning
 */

import type { WhiteboardObject } from '@/types/canvas';

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Calculate bounding box for all objects on the canvas
 */
export function calculateBoundingBox(objects: WhiteboardObject[]): BoundingBox | null {
  if (objects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    if (obj.type === 'line') {
      // For lines, use the points
      const x1 = obj.x + obj.points[0];
      const y1 = obj.y + obj.points[1];
      const x2 = obj.x + obj.points[2];
      const y2 = obj.y + obj.points[3];
      
      minX = Math.min(minX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxX = Math.max(maxX, x1, x2);
      maxY = Math.max(maxY, y1, y2);
    } else if (obj.type === 'circle') {
      // For circles, use center and radius
      minX = Math.min(minX, obj.x - obj.radius);
      minY = Math.min(minY, obj.y - obj.radius);
      maxX = Math.max(maxX, obj.x + obj.radius);
      maxY = Math.max(maxY, obj.y + obj.radius);
    } else if (obj.type === 'text') {
      // TextShape doesn't have width/height, use default size
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + 100);
      maxY = Math.max(maxY, obj.y + 30);
    } else {
      // For rectangles, sticky notes, text bubbles, frames - all have width/height
      const objWithDimensions = obj as WhiteboardObject & { width: number; height: number };
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + objWithDimensions.width);
      maxY = Math.max(maxY, obj.y + objWithDimensions.height);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return { minX, minY, maxX, maxY, width, height, centerX, centerY };
}

/**
 * Calculate optimal zoom and position to fit content
 * @param objects - All objects on the canvas
 * @param viewportWidth - Canvas viewport width in pixels
 * @param viewportHeight - Canvas viewport height in pixels
 * @param padding - Padding around content (default 100px)
 * @returns Optimal scale and position, or null if no objects
 */
export function calculateAutoFit(
  objects: WhiteboardObject[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 100
): { scale: number; position: { x: number; y: number } } | null {
  const bbox = calculateBoundingBox(objects);
  if (!bbox) return null;

  // Validate viewport dimensions
  if (!viewportWidth || !viewportHeight || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }
  
  // Validate bounding box dimensions
  if (!bbox.width || !bbox.height || bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }
  
  // Calculate zoom to fit content with padding
  const scaleX = (viewportWidth - padding * 2) / bbox.width;
  const scaleY = (viewportHeight - padding * 2) / bbox.height;
  
  // Validate calculated scales
  if (!isFinite(scaleX) || !isFinite(scaleY) || isNaN(scaleX) || isNaN(scaleY)) {
    return null;
  }
  
  // Use the smaller scale to ensure everything fits
  let scale = Math.min(scaleX, scaleY);
  
  // Clamp between 10% and 100% (reasonable zoom range)
  scale = Math.max(0.1, Math.min(1, scale));
  
  // Final validation
  if (!isFinite(scale) || isNaN(scale)) {
    return null;
  }
  
  // If scale is less than 30% and we have few objects, increase it
  if (scale < 0.3 && objects.length <= 3) {
    scale = Math.min(0.3, scale * 1.5);
  }
  
  // Calculate position to center the content
  const scaledWidth = bbox.width * scale;
  const scaledHeight = bbox.height * scale;
  
  const x = (viewportWidth - scaledWidth) / 2 - bbox.minX * scale;
  const y = (viewportHeight - scaledHeight) / 2 - bbox.minY * scale;

  return {
    scale: Math.round(scale * 100) / 100, // Round to 2 decimals
    position: { x: Math.round(x), y: Math.round(y) },
  };
}
