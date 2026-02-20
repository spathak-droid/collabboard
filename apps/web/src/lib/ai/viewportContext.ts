/**
 * Viewport-aware positioning utilities for AI commands.
 * 
 * Handles calculations for:
 * - Directional movements (left, right, up, down) relative to viewport
 * - Smart placement within visible area
 * - Coordinate conversions between screen space and canvas space
 * 
 * This module keeps viewport logic separate from board/canvas components.
 */

export interface ViewportState {
  position: { x: number; y: number }; // Canvas pan position
  scale: number; // Zoom level (1.0 = 100%)
  width: number; // Viewport width in pixels
  height: number; // Viewport height in pixels
}

export interface ViewportBounds {
  minX: number; // Left edge in canvas coordinates
  minY: number; // Top edge in canvas coordinates
  maxX: number; // Right edge in canvas coordinates
  maxY: number; // Bottom edge in canvas coordinates
  centerX: number; // Horizontal center in canvas coordinates
  centerY: number; // Vertical center in canvas coordinates
  width: number; // Visible width in canvas units
  height: number; // Visible height in canvas units
}

/**
 * Convert viewport state to canvas coordinate bounds.
 * Takes into account pan position and zoom scale.
 */
export function getViewportBounds(viewport: ViewportState): ViewportBounds {
  // Convert screen viewport to canvas coordinates
  // Canvas coordinates = (screen coordinates - pan position) / scale
  const minX = -viewport.position.x / viewport.scale;
  const minY = -viewport.position.y / viewport.scale;
  const maxX = (viewport.width - viewport.position.x) / viewport.scale;
  const maxY = (viewport.height - viewport.position.y) / viewport.scale;

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate movement delta for directional commands.
 * 
 * @param direction - One of: 'left', 'right', 'up', 'down'
 * @param viewport - Current viewport state
 * @param distancePercent - Percentage of viewport to move (default 30%)
 * @returns Delta x and y in canvas coordinates
 */
export function calculateDirectionalMovement(
  direction: 'left' | 'right' | 'up' | 'down',
  viewport: ViewportState,
  distancePercent: number = 30
): { dx: number; dy: number } {
  const bounds = getViewportBounds(viewport);
  
  // Calculate movement distance as percentage of visible viewport
  const moveX = (bounds.width * distancePercent) / 100;
  const moveY = (bounds.height * distancePercent) / 100;

  switch (direction) {
    case 'left':
      return { dx: -moveX, dy: 0 };
    case 'right':
      return { dx: moveX, dy: 0 };
    case 'up':
      return { dx: 0, dy: -moveY };
    case 'down':
      return { dx: 0, dy: moveY };
    default:
      return { dx: 0, dy: 0 };
  }
}

/**
 * Get the center position of the viewport in canvas coordinates.
 * Useful for creating new objects in the user's visible area.
 */
export function getViewportCenterPosition(viewport: ViewportState): { x: number; y: number } {
  const bounds = getViewportBounds(viewport);
  return {
    x: bounds.centerX,
    y: bounds.centerY,
  };
}

/**
 * Check if a position is currently visible in the viewport.
 * Includes a padding margin to account for object size.
 */
export function isInViewport(
  x: number,
  y: number,
  viewport: ViewportState,
  padding: number = 100
): boolean {
  const bounds = getViewportBounds(viewport);
  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  );
}

/**
 * Calculate a grid of positions within the viewport for bulk object creation.
 * Ensures created objects are visible to the user.
 * 
 * @param viewport - Current viewport state
 * @param count - Number of positions needed
 * @param objectSize - Approximate size of objects to place
 * @returns Array of {x, y} positions in canvas coordinates
 */
export function getViewportGridPositions(
  viewport: ViewportState,
  count: number,
  objectSize: { width: number; height: number } = { width: 200, height: 200 }
): Array<{ x: number; y: number }> {
  const bounds = getViewportBounds(viewport);
  
  // Use 80% of viewport to leave margins
  const usableWidth = bounds.width * 0.8;
  const usableHeight = bounds.height * 0.8;
  const startX = bounds.centerX - usableWidth / 2;
  const startY = bounds.centerY - usableHeight / 2;

  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(count * (usableWidth / usableHeight)));
  const rows = Math.ceil(count / cols);
  
  const spacingX = usableWidth / cols;
  const spacingY = usableHeight / rows;

  const positions: Array<{ x: number; y: number }> = [];
  
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    positions.push({
      x: startX + col * spacingX + spacingX / 2,
      y: startY + row * spacingY + spacingY / 2,
    });
  }

  return positions;
}

/**
 * Get a position offset from viewport center.
 * Useful for placing objects relative to what user is viewing.
 * 
 * @param viewport - Current viewport state
 * @param offsetX - Horizontal offset from center (percentage, -100 to 100)
 * @param offsetY - Vertical offset from center (percentage, -100 to 100)
 */
export function getViewportOffsetPosition(
  viewport: ViewportState,
  offsetX: number = 0,
  offsetY: number = 0
): { x: number; y: number } {
  const bounds = getViewportBounds(viewport);
  
  return {
    x: bounds.centerX + (bounds.width * offsetX) / 100,
    y: bounds.centerY + (bounds.height * offsetY) / 100,
  };
}
