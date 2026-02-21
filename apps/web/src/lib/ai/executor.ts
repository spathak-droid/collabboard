/**
 * Client-side executor that translates parsed AI tool calls into
 * concrete Yjs CRUD operations on the whiteboard.
 *
 * Each tool call is mapped to createObject / updateObject / deleteObject
 * calls exposed by the useYjs hook.
 */

import { generateId } from '@/lib/utils/geometry';
import { STICKY_COLORS } from '@/types/canvas';
import { getObjectBounds, type Bounds } from '@/lib/utils/objectBounds';
import { getAnchorPoints } from '@/lib/utils/connectors';
import { calculateDirectionalMovement, getViewportCenterPosition, type ViewportState } from './viewportContext';
import type {
  WhiteboardObject,
  StickyNote,
  RectShape,
  CircleShape,
  TriangleShape,
  StarShape,
  LineShape,
  TextShape,
  TextBubbleShape,
  Frame,
  AnchorPosition,
} from '@/types/canvas';
import type {
  ParsedToolCall,
  CreateStickyNoteArgs,
  CreateTextArgs,
  CreateTextBubbleArgs,
  CreateShapeArgs,
  CreateFrameArgs,
  CreateConnectorArgs,
  MoveObjectArgs,
  ResizeObjectArgs,
  UpdateTextArgs,
  ChangeColorArgs,
  DeleteObjectArgs,
  ArrangeInGridArgs,
  AnalyzeObjectsArgs,
  CreateSWOTAnalysisArgs,
  CreateUserJourneyMapArgs,
  CreateRetrospectiveBoardArgs,
  CreateProsConsBoardArgs,
} from './tools';

// ── Helpers ─────────────────────────────────────────────────

const COLOR_NAME_TO_HEX: Record<string, string> = {
  yellow: STICKY_COLORS.YELLOW,
  pink: STICKY_COLORS.PINK,
  blue: STICKY_COLORS.BLUE,
  green: STICKY_COLORS.GREEN,
  orange: STICKY_COLORS.ORANGE,
  // Shape colors (commonly used)
  red: '#EF4444',
  purple: '#A855F7',
  violet: '#A855F7',
  cyan: '#06B6D4',
  teal: '#14B8A6',
  indigo: '#6366F1',
  lime: '#84CC16',
  amber: '#F59E0B',
  gray: '#6B7280',
  grey: '#6B7280',
  black: '#000000',
  white: '#FFFFFF',
};

function resolveStickyColor(color?: string): string {
  if (!color) return STICKY_COLORS.YELLOW;
  
  // If it's a hex color, validate and return it
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if ((hex.length === 3 || hex.length === 6) && /^[0-9A-Fa-f]+$/.test(hex)) {
      return color.toUpperCase(); // Valid hex, normalize to uppercase
    }
    console.error(`Invalid hex color for sticky: ${color}, using fallback`);
    return STICKY_COLORS.YELLOW;
  }
  
  // Otherwise try color name lookup
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? STICKY_COLORS.YELLOW;
}

function resolveShapeColor(color?: string): string {
  if (!color) return '#E5E7EB';
  
  // If it's a hex color, validate it
  if (color.startsWith('#')) {
    // Valid hex: #RGB (3 digits) or #RRGGBB (6 digits)
    const hex = color.slice(1);
    if (hex.length === 3 || hex.length === 6) {
      // Check if all characters are valid hex digits
      if (/^[0-9A-Fa-f]+$/.test(hex)) {
        return color.toUpperCase(); // Normalize to uppercase
      }
    }
    console.error(`Invalid hex color: ${color}, using fallback`);
    return '#E5E7EB'; // Invalid hex, use fallback
  }
  
  // Try to resolve color name
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? '#E5E7EB';
}

/**
 * Check if coordinates are explicitly provided (not undefined or null).
 * Used to determine whether to use smart placement or explicit coordinates.
 */
function hasExplicitCoordinates(args: { x?: number | null; y?: number | null }): boolean {
  return args.x != null && args.y != null; // != null checks for both null and undefined
}

/**
 * Get the inner bounds of a frame (excluding padding).
 * Returns the area where objects should be placed inside the frame.
 */
function getFrameInnerBounds(
  frameId: string,
  objects: WhiteboardObject[],
  padding = 40
): { x: number; y: number; width: number; height: number } | null {
  console.log(`🔍 [Frame Bounds] Looking for frame: ${frameId}`);
  const frame = objects.find((o) => o.id === frameId && o.type === 'frame');
  if (!frame || frame.type !== 'frame') {
    console.error(`❌ [Frame Bounds] Frame ${frameId} not found! Available objects: ${objects.length}`);
    return null;
  }
  
  const frameObj = frame as Frame;
  const bounds = {
    x: frameObj.x + padding,
    y: frameObj.y + padding,
    width: Math.max(frameObj.width - padding * 2, 100),
    height: Math.max(frameObj.height - padding * 2, 100),
  };
  
  console.log(`✅ [Frame Bounds] Frame found at (${frameObj.x}, ${frameObj.y}), size: ${frameObj.width}x${frameObj.height}`);
  console.log(`   Inner bounds: (${bounds.x}, ${bounds.y}), size: ${bounds.width}x${bounds.height}`);
  
  return bounds;
}

// ── Smart placement algorithm ──────────────────────────────
// Used ONLY when user doesn't specify explicit coordinates (x, y)
// When coordinates are provided, objects are placed exactly where requested

interface PlacementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if two boxes overlap with a margin.
 */
function boxesOverlap(a: PlacementBox, b: PlacementBox, margin = 20): boolean {
  return !(
    a.x + a.width + margin < b.x ||
    b.x + b.width + margin < a.x ||
    a.y + a.height + margin < b.y ||
    b.y + b.height + margin < a.y
  );
}

/**
 * Find a free position near existing objects or a reference point.
 * Tries positions in a spiral pattern: right, down, left, up, expanding outward.
 * Optimized for performance with large object counts.
 * 
 * @param existingBoxes - Pre-calculated placement boxes (for performance)
 * @param width - Width of object to place
 * @param height - Height of object to place
 * @param preferredX - Preferred X coordinate
 * @param preferredY - Preferred Y coordinate
 */
function findFreePositionWithBoxes(
  existingBoxes: PlacementBox[],
  width: number,
  height: number,
  preferredX = 200,
  preferredY = 200,
): { x: number; y: number } {
  // If no objects exist, use the preferred position
  if (existingBoxes.length === 0) {
    return { x: preferredX, y: preferredY };
  }

  // For large numbers of objects, use optimized overlap checking
  // Pre-calculate bounds for faster checks
  const candidate: PlacementBox = { x: preferredX, y: preferredY, width, height };
  
  // Optimized overlap check: early exit on first match
  let hasOverlap = false;
  for (const box of existingBoxes) {
    if (boxesOverlap(candidate, box)) {
      hasOverlap = true;
      break; // Early exit - found overlap, no need to check rest
    }
  }

  if (!hasOverlap) {
    return { x: preferredX, y: preferredY };
  }

  // Spiral search pattern: right, down, left, up, expanding outward
  const STEP = 220; // Distance to move in each direction
  const directions = [
    { dx: 1, dy: 0 },  // right
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 0, dy: -1 }, // up
  ];

  let x = preferredX;
  let y = preferredY;
  let stepsInDirection = 1; // How many steps to take in current direction
  let directionIndex = 0;
  let stepsTaken = 0;

  // For large object counts, limit search iterations to prevent slowdown
  // With many objects, finding exact free space becomes expensive
  // Instead, use a faster grid-based approach after initial attempts
  const maxIterations = existingBoxes.length > 100 ? 20 : 100;

  for (let i = 0; i < maxIterations; i++) {
    const dir = directions[directionIndex];
    x += dir.dx * STEP;
    y += dir.dy * STEP;
    stepsTaken++;

    // Check if this position is free - optimized with early exit
    candidate.x = x;
    candidate.y = y;
    hasOverlap = false;
    for (const box of existingBoxes) {
      if (boxesOverlap(candidate, box)) {
        hasOverlap = true;
        break; // Early exit on first overlap
      }
    }

    if (!hasOverlap) {
      return { x, y };
    }

    // Change direction in spiral pattern
    if (stepsTaken >= stepsInDirection) {
      stepsTaken = 0;
      directionIndex = (directionIndex + 1) % 4;
      
      // Increase steps after completing two directions (right+down or left+up)
      if (directionIndex % 2 === 0) {
        stepsInDirection++;
      }
    }
  }

  // Fallback: if no free position found quickly, place far to the right of all objects
  // Calculate maxX efficiently (single pass)
  let maxX = preferredX;
  for (const box of existingBoxes) {
    const rightEdge = box.x + box.width;
    if (rightEdge > maxX) {
      maxX = rightEdge;
    }
  }
  return { x: maxX + STEP, y: preferredY };
}

/**
 * Legacy wrapper for backward compatibility.
 * Prefer using findFreePositionWithBoxes with pre-calculated boxes for better performance.
 */
function findFreePosition(
  objects: WhiteboardObject[],
  width: number,
  height: number,
  preferredX = 200,
  preferredY = 200,
): { x: number; y: number } {
  // Convert objects to boxes
  const existingBoxes: PlacementBox[] = objects
    .filter((obj) => obj.type !== 'line')
    .map((obj) => {
      if (obj.type === 'circle') {
        const r = (obj as CircleShape).radius;
        return {
          x: obj.x - r,
          y: obj.y - r,
          width: r * 2,
          height: r * 2,
        };
      }
      if ('width' in obj && 'height' in obj) {
        return {
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        };
      }
      return { x: obj.x, y: obj.y, width: 100, height: 100 };
    });
  
  return findFreePositionWithBoxes(existingBoxes, width, height, preferredX, preferredY);
}

// ── CRUD interface (matches useYjs hook shape) ──────────────

export interface BoardOperations {
  createObject: (obj: WhiteboardObject) => void;
  createObjectsBatch: (objects: WhiteboardObject[]) => void;
  updateObject: (id: string, data: Partial<WhiteboardObject>) => void;
  deleteObjects: (ids: string[]) => void;
  clearObjects?: () => void; // Optional: ultra-fast clear using Yjs Map.clear()
  objects: WhiteboardObject[];
  userId: string;
}

export interface ExecuteToolCallsOptions {
  selectionArea?: { x: number; y: number; width: number; height: number } | null;
  viewport?: { position: { x: number; y: number }; scale: number; width: number; height: number };
}

export interface ExecutionResult {
  createdIds: string[];
  modifiedIds: string[];
  summary: string;
}

// ── Main executor ───────────────────────────────────────────

export function executeToolCalls(
  toolCalls: ParsedToolCall[],
  ops: BoardOperations,
  options?: ExecuteToolCallsOptions,
): ExecutionResult {
  const createdIds: string[] = [];
  const modifiedIds: string[] = [];
  const descriptions: string[] = [];

  let nextZIndex = ops.objects.length;
  
  // Track temporary objects being created in this batch
  // This ensures smart placement considers them for collision detection
  const tempObjects: WhiteboardObject[] = [];
  
  // Collect all objects to create for batch insertion
  const objectsToCreate: WhiteboardObject[] = [];
  
  // Cache for placement boxes to avoid recalculating for each object
  // This dramatically speeds up bulk creation (e.g., 500 objects)
  let cachedBoxes: PlacementBox[] | null = null;
  let cachedBoxesVersion = 0;
  
  // Helper to get all objects including temporary ones
  const getAllObjects = () => [...ops.objects, ...tempObjects];
  
  // Optimized helper to get placement boxes with caching
  // For bulk creation (many objects), this cache dramatically improves performance
  const getPlacementBoxes = (): PlacementBox[] => {
    const currentVersion = ops.objects.length + tempObjects.length;
    if (cachedBoxes && cachedBoxesVersion === currentVersion) {
      return cachedBoxes;
    }
    
    // Recalculate boxes - incremental update would be faster but more complex
    // For now, full recalculation is acceptable since we cache the result
    const allObjs = getAllObjects();
    cachedBoxes = allObjs
      .filter((obj) => obj.type !== 'line')
      .map((obj) => {
        if (obj.type === 'circle') {
          const r = (obj as CircleShape).radius;
          return {
            x: obj.x - r,
            y: obj.y - r,
            width: r * 2,
            height: r * 2,
          };
        }
        if ('width' in obj && 'height' in obj) {
          return {
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
          };
        }
        return { x: obj.x, y: obj.y, width: 100, height: 100 };
      });
    cachedBoxesVersion = currentVersion;
    return cachedBoxes;
  };
  
  // Helper to get bounding box from any object
  const getBoxFromObject = (obj: WhiteboardObject): PlacementBox => {
    if (obj.type === 'circle') {
      const r = (obj as CircleShape).radius;
      return {
        x: obj.x - r,
        y: obj.y - r,
        width: r * 2,
        height: r * 2,
      };
    }
    if ('width' in obj && 'height' in obj) {
      return {
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      };
    }
    // Fallback for objects without dimensions
    return { x: obj.x, y: obj.y, width: 100, height: 100 };
  };

  for (const call of toolCalls) {
    switch (call.name) {
      case 'createStickyNote': {
        const args = call.arguments as CreateStickyNoteArgs;
        const quantity = args.quantity ?? 1;
        
        // Log frame context
        if (args.frameId) {
          console.log(`📦 [Client Executor] createStickyNote received frameId: ${args.frameId}`);
        }
        
        // Create multiple sticky notes with grid layout
        if (quantity > 1) {
          const currentTime = Date.now();
          
          // Calculate grid positions - use frame bounds if frameId provided
          let preferredPos: { x: number; y: number };
          if (args.frameId) {
            const frameBounds = getFrameInnerBounds(args.frameId, ops.objects);
            if (frameBounds) {
              preferredPos = { x: frameBounds.x, y: frameBounds.y };
            } else {
              preferredPos = options?.viewport 
                ? getViewportCenterPosition(options.viewport as ViewportState)
                : { x: 200, y: 200 };
            }
          } else {
            preferredPos = options?.viewport 
              ? getViewportCenterPosition(options.viewport as ViewportState)
              : { x: 200, y: 200 };
          }
          
          const positions = calculateGridPositions(
            quantity,
            200, // sticky note width
            200, // sticky note height
            args.rows,
            args.columns,
            preferredPos.x,
            preferredPos.y
          );
          
          // Color handling: ONLY cycle colors if explicitly requested via colors array or color="random"
          const hasColorsArray = args.colors && Array.isArray(args.colors) && args.colors.length > 0;
          const colorArray: string[] = hasColorsArray
            ? args.colors! // Use LLM-provided color palette (non-null assertion since we checked hasColorsArray)
            : ['#FFF59D', '#F48FB1', '#81D4FA', '#A5D6A7', '#FFCC80']; // Default: yellow, pink, blue, green, orange
          
          // CRITICAL: Only cycle if colors array provided OR color="random"
          const shouldCycleColors = (hasColorsArray || args.color === 'random') && quantity > 1;
          const singleColor = args.color && args.color !== 'random' ? resolveStickyColor(args.color) : resolveStickyColor();
          
          // Create all sticky notes with calculated positions
          for (let i = 0; i < quantity; i++) {
            const id = generateId();
            const noteColor = shouldCycleColors ? colorArray[i % colorArray.length] : singleColor;
            
            const obj: StickyNote = {
              id,
              type: 'sticky',
              x: positions[i].x,
              y: positions[i].y,
              width: 200,
              height: 200,
              color: noteColor,
              text: args.text || '',
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: currentTime,
            };
            objectsToCreate.push(obj);
            tempObjects.push(obj);
            createdIds.push(id);
          }
          
          const colorDescription = shouldCycleColors ? 'multi-colored' : singleColor;
          const locationDesc = args.frameId ? ' inside frame' : ' in a grid';
          descriptions.push(`Created ${quantity} ${colorDescription} sticky notes${locationDesc}`);
        }
        // Single sticky note
        else {
          const id = generateId();
          
          let pos: { x: number; y: number };
          if (hasExplicitCoordinates(args)) {
            pos = { x: args.x!, y: args.y! };
          } else if (args.frameId) {
            // Place inside frame bounds
            const frameBounds = getFrameInnerBounds(args.frameId, ops.objects);
            if (frameBounds) {
              // Center the sticky note in the frame
              pos = {
                x: frameBounds.x + (frameBounds.width - 200) / 2,
                y: frameBounds.y + (frameBounds.height - 200) / 2,
              };
            } else {
              // Fallback if frame not found
              const preferredPos = options?.viewport 
                ? getViewportCenterPosition(options.viewport as ViewportState)
                : { x: 200, y: 200 };
              pos = findFreePositionWithBoxes(getPlacementBoxes(), 200, 200, preferredPos.x, preferredPos.y);
            }
          } else {
            const preferredPos = options?.viewport 
              ? getViewportCenterPosition(options.viewport as ViewportState)
              : { x: 200, y: 200 };
            pos = findFreePositionWithBoxes(getPlacementBoxes(), 200, 200, preferredPos.x, preferredPos.y);
          }
          
          const obj: StickyNote = {
            id,
            type: 'sticky',
            x: pos.x,
            y: pos.y,
            width: 200,
            height: 200,
            color: resolveStickyColor(args.color),
            text: args.text,
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: Date.now(),
          };
          tempObjects.push(obj);
          objectsToCreate.push(obj);
          createdIds.push(id);
          const locationDesc = args.frameId ? ' inside frame' : '';
          descriptions.push(`Created sticky note "${truncate(args.text)}"${locationDesc}`);
        }
        break;
      }

      case 'createText': {
        const args = call.arguments as CreateTextArgs;
        const quantity = args.quantity ?? 1;
        const explicitRows = args.rows;
        const explicitColumns = args.columns;
        
        // Multi-object creation with grid layout
        if (quantity > 1) {
          const width = 100; // Approximate text width
          const height = 30; // Approximate text height
          
          // Calculate viewport center or default position
          const preferredPos = options?.viewport 
            ? getViewportCenterPosition(options.viewport as ViewportState)
            : { x: 200, y: 200 };
          
          // Use calculateGridPositions to get positions for N text objects
          const positions = calculateGridPositions(
            quantity,
            width,
            height,
            preferredPos.x,
            preferredPos.y,
            explicitRows,
            explicitColumns
          );
          
          // Create text objects at calculated positions
          for (let i = 0; i < quantity; i++) {
            const id = generateId();
            const pos = positions[i];
            
            const obj: TextShape = {
              id,
              type: 'text',
              x: pos.x,
              y: pos.y,
              text: args.text,
              fill: '#000000',
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: Date.now(),
            };
            
            objectsToCreate.push(obj);
            tempObjects.push(obj);
            createdIds.push(id);
          }
          
          descriptions.push(`Created ${quantity} text objects in grid layout`);
          break;
        }
        
        // Single text creation (original logic)
        const id = generateId();
        
        // Text has no dimensions, use small area for collision detection
        const preferredPos = options?.viewport 
          ? getViewportCenterPosition(options.viewport as ViewportState)
          : { x: 200, y: 200 };
        const pos = hasExplicitCoordinates(args)
          ? { x: args.x!, y: args.y! }
          : findFreePositionWithBoxes(getPlacementBoxes(), 100, 30, preferredPos.x, preferredPos.y);
        
        const obj: TextShape = {
          id,
          type: 'text',
          x: pos.x,
          y: pos.y,
          text: args.text,
          fill: '#000000', // Default black text
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        // Queued for batch creation
        objectsToCreate.push(obj);
        tempObjects.push(obj); // Track for collision detection
        createdIds.push(id);
        descriptions.push(`Created text "${truncate(args.text)}"`);
        break;
      }

      case 'createTextBubble': {
        const args = call.arguments as CreateTextBubbleArgs;
        const quantity = args.quantity ?? 1;
        const explicitRows = args.rows;
        const explicitColumns = args.columns;
        
        // Multi-object creation with grid layout
        if (quantity > 1) {
          const width = args.width || 200;
          const height = args.height || 100;
          
          // Calculate viewport center or default position
          const preferredPos = options?.viewport 
            ? getViewportCenterPosition(options.viewport as ViewportState)
            : { x: 200, y: 200 };
          
          // Use calculateGridPositions to get positions for N text bubbles
          const positions = calculateGridPositions(
            quantity,
            width,
            height,
            preferredPos.x,
            preferredPos.y,
            explicitRows,
            explicitColumns
          );
          
          // Create text bubbles at calculated positions
          for (let i = 0; i < quantity; i++) {
            const id = generateId();
            const pos = positions[i];
            
            const obj: TextBubbleShape = {
              id,
              type: 'textBubble',
              x: pos.x,
              y: pos.y,
              width,
              height,
              text: args.text,
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: Date.now(),
            };
            
            objectsToCreate.push(obj);
            tempObjects.push(obj);
            createdIds.push(id);
          }
          
          descriptions.push(`Created ${quantity} text bubbles in grid layout`);
          break;
        }
        
        // Single text bubble creation (original logic)
        const id = generateId();
        
        const width = args.width || 200;
        const height = args.height || 100;
        
        // Find free position if x/y not specified
        const preferredPos = options?.viewport 
          ? getViewportCenterPosition(options.viewport as ViewportState)
          : { x: 200, y: 200 };
        const pos = hasExplicitCoordinates(args)
          ? { x: args.x!, y: args.y! }
          : findFreePositionWithBoxes(getPlacementBoxes(), width, height, preferredPos.x, preferredPos.y);
        
        const obj: TextBubbleShape = {
          id,
          type: 'textBubble',
          x: pos.x,
          y: pos.y,
          width,
          height,
          text: args.text,
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        // Queued for batch creation
        objectsToCreate.push(obj);
        tempObjects.push(obj); // Track for collision detection
        createdIds.push(id);
        descriptions.push(`Created text bubble "${truncate(args.text)}"`);
        break;
      }

      case 'createShape': {
        const args = call.arguments as CreateShapeArgs;
        const quantity = args.quantity ?? 1;
        
        // Log frame context
        if (args.frameId) {
          console.log(`📦 [Client Executor] createShape received frameId: ${args.frameId}`);
          const frame = ops.objects.find(o => o.id === args.frameId && o.type === 'frame');
          if (frame && frame.type === 'frame') {
            const frameObj = frame as Frame;
            console.log(`   Frame found: ${frameObj.type} at (${frameObj.x}, ${frameObj.y}), size: ${frameObj.width}x${frameObj.height}`);
          } else {
            console.error(`   ⚠️ Frame ${args.frameId} NOT FOUND in objects!`);
          }
        }
        
        // Create multiple shapes with grid layout
        if (quantity > 1) {
          const currentTime = Date.now();
          const width = args.width ?? 150;
          const height = args.height ?? 150;
          
          // Color handling: ONLY cycle colors if explicitly requested via colors array or color="random"
          const hasColorsArray = args.colors && Array.isArray(args.colors) && args.colors.length > 0;
          const shapeColorArray: string[] = hasColorsArray
            ? args.colors! // Use LLM-provided color palette (non-null assertion since we checked hasColorsArray)
            : ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316']; // Default: red, blue, green, purple, orange
          
          // CRITICAL: Only cycle if colors array provided OR color="random"
          const shouldCycleColors = (hasColorsArray || args.color === 'random') && quantity > 1;
          const singleColor = args.color && args.color !== 'random' ? resolveShapeColor(args.color) : resolveShapeColor();
          
          // Calculate grid positions - use frame bounds if frameId provided
          let preferredPos: { x: number; y: number };
          if (args.frameId) {
            const frameBounds = getFrameInnerBounds(args.frameId, ops.objects);
            if (frameBounds) {
              preferredPos = { x: frameBounds.x, y: frameBounds.y };
            } else {
              preferredPos = options?.viewport 
                ? getViewportCenterPosition(options.viewport as ViewportState)
                : { x: 200, y: 200 };
            }
          } else {
            preferredPos = options?.viewport 
              ? getViewportCenterPosition(options.viewport as ViewportState)
              : { x: 200, y: 200 };
          }
          
          const positions = calculateGridPositions(
            quantity,
            width,
            height,
            args.rows,
            args.columns,
            preferredPos.x,
            preferredPos.y
          );
          
          // Create all shapes with calculated positions
          for (let i = 0; i < quantity; i++) {
            const id = generateId();
            const pos = positions[i];
            const shapeColor = shouldCycleColors ? shapeColorArray[i % shapeColorArray.length] : singleColor;
            
            // For circles, adjust position to center
            if (args.type === 'circle') {
              const radius = Math.round((width + height) / 4);
              pos.x += radius;
              pos.y += radius;
            }
            
            const baseFields = {
              id,
              x: pos.x,
              y: pos.y,
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: currentTime,
            };

            let createdObj: WhiteboardObject;
            
            if (args.type === 'circle') {
              const radius = Math.round((width + height) / 4);
              createdObj = {
                ...baseFields,
                type: 'circle',
                radius,
                fill: shapeColor,
                stroke: '#000000',
                strokeWidth: 2,
                ...(args.text ? { text: args.text } : {}),
              } as CircleShape;
            } else if (args.type === 'triangle') {
              createdObj = {
                ...baseFields,
                type: 'triangle',
                width,
                height,
                fill: shapeColor,
                stroke: '#000000',
                strokeWidth: 2,
                ...(args.text ? { text: args.text } : {}),
              } as TriangleShape;
            } else if (args.type === 'star') {
              createdObj = {
                ...baseFields,
                type: 'star',
                width,
                height,
                fill: shapeColor,
                stroke: '#000000',
                strokeWidth: 2,
                ...(args.text ? { text: args.text } : {}),
              } as StarShape;
            } else {
              createdObj = {
                ...baseFields,
                type: 'rect',
                width,
                height,
                fill: shapeColor,
                stroke: '#000000',
                strokeWidth: 2,
                ...(args.text ? { text: args.text } : {}),
              } as RectShape;
            }

            objectsToCreate.push(createdObj);
            tempObjects.push(createdObj);
            createdIds.push(id);
          }
          
          const colorDescription = shouldCycleColors ? 'multi-colored' : singleColor;
          const locationDesc = args.frameId ? ' inside frame' : ' in a grid';
          descriptions.push(`Created ${quantity} ${colorDescription} ${args.type} shapes${locationDesc}`);
        }
        // Single shape
        else {
          const id = generateId();
          
          // Determine dimensions for placement calculation
          const width = args.width ?? 150;
          const height = args.height ?? 150;
          const radius = args.type === 'circle' ? Math.round((width + height) / 4) : 0;
          const placementSize = args.type === 'circle' ? radius * 2 : width;
          
          let pos: { x: number; y: number };
          if (hasExplicitCoordinates(args)) {
            pos = { x: args.x!, y: args.y! };
          } else if (args.frameId) {
            // Place inside frame bounds
            const frameBounds = getFrameInnerBounds(args.frameId, ops.objects);
            if (frameBounds) {
              // Center the shape in the frame
              pos = {
                x: frameBounds.x + (frameBounds.width - placementSize) / 2,
                y: frameBounds.y + (frameBounds.height - placementSize) / 2,
              };
              // Adjust for circle center positioning
              if (args.type === 'circle') {
                pos.x += radius;
                pos.y += radius;
              }
            } else {
              // Fallback if frame not found
              const preferredPos = options?.viewport 
                ? getViewportCenterPosition(options.viewport as ViewportState)
                : { x: 200, y: 200 };
              pos = findFreePositionWithBoxes(getPlacementBoxes(), placementSize, placementSize, preferredPos.x, preferredPos.y);
              if (args.type === 'circle') {
                pos.x += radius;
                pos.y += radius;
              }
            }
          } else {
            const preferredPos = options?.viewport 
              ? getViewportCenterPosition(options.viewport as ViewportState)
              : { x: 200, y: 200 };
            pos = findFreePositionWithBoxes(getPlacementBoxes(), placementSize, placementSize, preferredPos.x, preferredPos.y);
            
            if (args.type === 'circle') {
              pos.x += radius;
              pos.y += radius;
            }
          }
          
          const baseFields = {
            id,
            x: pos.x,
            y: pos.y,
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: Date.now(),
          };

          let createdObj: WhiteboardObject;
          
          if (args.type === 'circle') {
            createdObj = {
              ...baseFields,
              type: 'circle',
              radius,
              fill: resolveShapeColor(args.color),
              stroke: '#000000',
              strokeWidth: 2,
              ...(args.text ? { text: args.text } : {}),
            } as CircleShape;
            objectsToCreate.push(createdObj);
          } else if (args.type === 'triangle') {
            createdObj = {
              ...baseFields,
              type: 'triangle',
              width,
              height,
              fill: resolveShapeColor(args.color),
              stroke: '#000000',
              strokeWidth: 2,
              ...(args.text ? { text: args.text } : {}),
            } as TriangleShape;
            objectsToCreate.push(createdObj);
          } else if (args.type === 'star') {
            createdObj = {
              ...baseFields,
              type: 'star',
              width,
              height,
              fill: resolveShapeColor(args.color),
              stroke: '#000000',
              strokeWidth: 2,
              ...(args.text ? { text: args.text } : {}),
            } as StarShape;
            objectsToCreate.push(createdObj);
          } else {
            createdObj = {
              ...baseFields,
              type: 'rect',
              width,
              height,
              fill: resolveShapeColor(args.color),
              stroke: '#000000',
              strokeWidth: 2,
              ...(args.text ? { text: args.text } : {}),
            } as RectShape;
            objectsToCreate.push(createdObj);
          }

          tempObjects.push(createdObj);
          createdIds.push(id);
          const locationDesc = args.frameId ? ' inside frame' : '';
          descriptions.push(`Created ${args.type} shape${locationDesc}`);
        }
        break;
      }

      case 'createFrame': {
        const args = call.arguments as CreateFrameArgs;
        const quantity = args.quantity ?? 1;
        const explicitRows = args.rows;
        const explicitColumns = args.columns;
        
        // Multi-object creation with grid layout
        if (quantity > 1) {
          const width = args.width ?? 400;
          const height = args.height ?? 400;
          
          // Calculate viewport center or default position
          const preferredPos = options?.viewport 
            ? getViewportCenterPosition(options.viewport as ViewportState)
            : { x: 100, y: 100 };
          
          // Use calculateGridPositions to get positions for N frames
          const positions = calculateGridPositions(
            quantity,
            width,
            height,
            preferredPos.x,
            preferredPos.y,
            explicitRows,
            explicitColumns
          );
          
          // Create frames at calculated positions
          for (let i = 0; i < quantity; i++) {
            const id = generateId();
            const pos = positions[i];
            
            const obj: Frame = {
              id,
              type: 'frame',
              x: pos.x,
              y: pos.y,
              width,
              height,
              stroke: '#6B7280',
              strokeWidth: 2,
              containedObjectIds: [],
              name: args.title,
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: Date.now(),
              isAIContainer: false,
            };
            
            objectsToCreate.push(obj);
            tempObjects.push(obj);
            createdIds.push(id);
          }
          
          descriptions.push(`Created ${quantity} frames in grid layout`);
          break;
        }
        
        // Single frame creation (original logic)
        const id = generateId();
        
        let width = args.width ?? 400;
        let height = args.height ?? 400;
        let x = args.x;
        let y = args.y;
        let containedIds: string[] = [];
        
        // Get all objects (including tempObjects from current batch)
        const allObjs = getAllObjects().filter(o => o.type !== 'line');
        
        // If large frame (suggesting "include all objects"), calculate bounds
        if ((width > 800 || height > 600) && allObjs.length > 0) {
          // Calculate bounding box of all objects
          const objectMap = new Map(ops.objects.map(obj => [obj.id, obj]));
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          
          for (const obj of allObjs) {
            const bounds = getObjectBounds(obj, objectMap);
            minX = Math.min(minX, bounds.minX);
            minY = Math.min(minY, bounds.minY);
            maxX = Math.max(maxX, bounds.maxX);
            maxY = Math.max(maxY, bounds.maxY);
          }
          
          // Add padding around objects
          const PADDING = 40;
          x = minX - PADDING;
          y = minY - PADDING;
          width = (maxX - minX) + (PADDING * 2);
          height = (maxY - minY) + (PADDING * 2);
          
          // Mark all these objects as contained
          containedIds = allObjs.map(o => o.id);
        } 
        // If medium frame + tempObjects exist = wrap only tempObjects (SWOT/journey map pattern)
        else if (width >= 400 && width <= 1000 && height >= 250 && height <= 600 && tempObjects.length > 0) {
          // Calculate bounds of ONLY tempObjects (recently created in this batch)
          const objectMap = new Map<string, WhiteboardObject>();
          ops.objects.forEach(obj => objectMap.set(obj.id, obj));
          tempObjects.forEach(obj => objectMap.set(obj.id, obj));
          
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          
          for (const obj of tempObjects.filter(o => o.type !== 'line')) {
            const bounds = getObjectBounds(obj, objectMap);
            minX = Math.min(minX, bounds.minX);
            minY = Math.min(minY, bounds.minY);
            maxX = Math.max(maxX, bounds.maxX);
            maxY = Math.max(maxY, bounds.maxY);
          }
          
          if (Number.isFinite(minX)) {
            // Add padding around objects
            const PADDING = 40;
            x = minX - PADDING;
            y = minY - PADDING;
            width = (maxX - minX) + (PADDING * 2);
            height = (maxY - minY) + (PADDING * 2);
            
            // Mark only tempObjects as contained
            containedIds = tempObjects.filter(o => o.type !== 'line').map(o => o.id);
          }
        }
        else if (x !== undefined && y !== undefined) {
          // Frame has explicit position, find objects within its bounds
          const frameRight = x + width;
          const frameBottom = y + height;
          
          for (const obj of allObjs) {
            // Check if object is within frame bounds
            if (obj.x >= x && obj.y >= y) {
              const objRight = obj.x + ('width' in obj ? obj.width : 0);
              const objBottom = obj.y + ('height' in obj ? obj.height : 0);
              
              if (objRight <= frameRight && objBottom <= frameBottom) {
                containedIds.push(obj.id);
              }
            }
          }
        } else if (!hasExplicitCoordinates({ x, y })) {
          // Find free position if x/y not specified
          // Use cached boxes for better performance
          const preferredPos = options?.viewport 
            ? getViewportCenterPosition(options.viewport as ViewportState)
            : { x: 100, y: 100 };
          const pos = findFreePositionWithBoxes(getPlacementBoxes(), width, height, preferredPos.x, preferredPos.y);
          x = pos.x;
          y = pos.y;
        }
        
        const obj: Frame = {
          id,
          type: 'frame',
          x: x!,
          y: y!,
          width,
          height,
          stroke: '#6B7280',
          strokeWidth: 2,
          containedObjectIds: containedIds,
          name: args.title,
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
          isAIContainer: containedIds.length > 0, // Mark as AI container only if it contains objects
        };
        // Queued for batch creation
        objectsToCreate.push(obj);
        tempObjects.push(obj); // Track for collision detection
        createdIds.push(id);
        descriptions.push(`Created frame "${args.title}"`);
        break;
      }

      case 'createConnector': {
        const args = call.arguments as CreateConnectorArgs;
        
        // Check both ops.objects and tempObjects for the source/target
        const allObjectsForLookup = getAllObjects();
        const fromObj = allObjectsForLookup.find((o) => o.id === args.fromId);
        const toObj = allObjectsForLookup.find((o) => o.id === args.toId);

        if (!fromObj || !toObj) {
          descriptions.push(
            'Could not create connector — source or target object not found',
          );
          break;
        }

        // Find the nearest anchor points between the two objects
        const { fromAnchor, toAnchor, fromPoint, toPoint } = findNearestAnchorsBetweenObjects(fromObj, toObj);

        const id = generateId();
        const obj: LineShape = {
          id,
          type: 'line',
          x: 0,
          y: 0,
          points: [fromPoint.x, fromPoint.y, toPoint.x, toPoint.y],
          stroke: '#000000',
          strokeWidth: 2,
          startAnchor: { objectId: args.fromId, anchor: fromAnchor },
          endAnchor: { objectId: args.toId, anchor: toAnchor },
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        // Queued for batch creation
        objectsToCreate.push(obj);
        createdIds.push(id);
        descriptions.push('Created connector');
        break;
      }

      case 'moveObject': {
        const args = call.arguments as MoveObjectArgs;
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not move object — ID "${args.objectId}" not found`,
          );
          break;
        }
        
        // Handle directional movement with viewport context
        if ('direction' in args && args.direction && options?.viewport) {
          const movement = calculateDirectionalMovement(
            args.direction as 'left' | 'right' | 'up' | 'down',
            options.viewport as ViewportState,
            30 // 30% of viewport
          );
          
          const newX = target.x + movement.dx;
          const newY = target.y + movement.dy;
          
          ops.updateObject(args.objectId, { x: newX, y: newY });
          modifiedIds.push(args.objectId);
          descriptions.push(`Moved object ${args.direction} to (${Math.round(newX)}, ${Math.round(newY)})`);
        } else if (args.x != null && args.y != null) {
          // Absolute positioning
          ops.updateObject(args.objectId, { x: args.x, y: args.y });
          modifiedIds.push(args.objectId);
          descriptions.push(`Moved object to (${args.x}, ${args.y})`);
        } else {
          descriptions.push(`Move command missing coordinates or direction`);
        }
        break;
      }

      case 'resizeObject': {
        const args = call.arguments as ResizeObjectArgs;
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not resize object — ID "${args.objectId}" not found`,
          );
          break;
        }
        if (target.type === 'circle') {
          const radius = Math.round((args.width + args.height) / 4);
          ops.updateObject(args.objectId, { radius } as Partial<WhiteboardObject>);
        } else {
          ops.updateObject(args.objectId, {
            width: args.width,
            height: args.height,
          } as Partial<WhiteboardObject>);
        }
        modifiedIds.push(args.objectId);
        descriptions.push(
          `Resized object to ${args.width}×${args.height}`,
        );
        break;
      }

      case 'rotateObject': {
        const args = call.arguments as { objectId: string; rotation: number };
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not rotate object — ID "${args.objectId}" not found`,
          );
          break;
        }
        ops.updateObject(args.objectId, { rotation: args.rotation } as Partial<WhiteboardObject>);
        modifiedIds.push(args.objectId);
        descriptions.push(
          `Rotated object to ${args.rotation} degrees`,
        );
        break;
      }

      case 'updateText': {
        const args = call.arguments as UpdateTextArgs;
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not update text — ID "${args.objectId}" not found`,
          );
          break;
        }
        
        // Frames use 'name' property, other objects use 'text'
        if (target.type === 'frame') {
          ops.updateObject(args.objectId, {
            name: args.newText,
          } as Partial<WhiteboardObject>);
          modifiedIds.push(args.objectId);
          descriptions.push(`Updated frame name to "${truncate(args.newText)}"`);
        } else {
          ops.updateObject(args.objectId, {
            text: args.newText,
          } as Partial<WhiteboardObject>);
          modifiedIds.push(args.objectId);
          descriptions.push(`Updated text to "${truncate(args.newText)}"`);
        }
        break;
      }

      case 'changeColor': {
        const args = call.arguments as ChangeColorArgs;
        
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not change color — ID "${args.objectId}" not found`,
          );
          break;
        }

        if (target.type === 'sticky') {
          const resolvedColor = resolveStickyColor(args.color);
          ops.updateObject(args.objectId, {
            color: resolvedColor,
          } as Partial<WhiteboardObject>);
        } else if (target.type === 'frame') {
          const resolvedColor = resolveShapeColor(args.color);
          // Frames: fill is the background color
          ops.updateObject(args.objectId, {
            fill: resolvedColor,
          } as Partial<WhiteboardObject>);
        } else if ('fill' in target) {
          const resolvedColor = resolveShapeColor(args.color);
          ops.updateObject(args.objectId, {
            fill: resolvedColor,
          } as Partial<WhiteboardObject>);
        }
        modifiedIds.push(args.objectId);
        descriptions.push(`Changed color to ${args.color}`);
        break;
      }

      case 'deleteObject': {
        const args = call.arguments as DeleteObjectArgs & { objectId?: string };
        const raw = args.objectIds ?? (args.objectId ? [args.objectId] : []);
        const ids = Array.isArray(raw) ? raw : [raw];
        
        // Smart deletion: If trying to delete 95%+ of objects, delete ALL objects
        // This ensures "delete everything" actually deletes everything, even if LLM missed some IDs
        const totalObjectCount = ops.objects.length;
        const requestedDeleteCount = ids.length;
        const deletePercentage = (requestedDeleteCount / totalObjectCount) * 100;
        
        let validIds: string[];
        let isFullClear = false;
        
        if (deletePercentage >= 95 && totalObjectCount > 0) {
          // User wants to delete almost everything - use ultra-fast clear
          isFullClear = true;
          validIds = ops.objects.map((o) => o.id);
          console.log(`[AI Delete] Detected "delete all" intent (${deletePercentage.toFixed(1)}% of objects). Using ultra-fast clear for ALL ${validIds.length} objects.`);
          
          // Use Yjs Map.clear() if available (infinitely faster than individual deletes)
          if (ops.clearObjects) {
            ops.clearObjects();
            descriptions.push(`Cleared all ${validIds.length} objects from the board`);
          } else {
            // Fallback to batch delete if clearObjects not available
            ops.deleteObjects(validIds);
            descriptions.push(`Deleted all ${validIds.length} objects`);
          }
        } else {
          // Normal deletion: only delete requested IDs
          validIds = ids.filter((id) =>
            ops.objects.some((o) => o.id === id),
          );
          
          if (validIds.length > 0) {
            ops.deleteObjects(validIds);
            descriptions.push(
              validIds.length === 1
                ? `Deleted object ${validIds[0]}`
                : `Deleted ${validIds.length} objects`,
            );
          } else if (ids.length > 0) {
            descriptions.push(
              `Could not delete — none of the specified IDs were found on the board`,
            );
          }
        }
        break;
      }

      case 'getBoardState': {
        descriptions.push(
          `Read board state (${ops.objects.length} objects)`,
        );
        break;
      }

      case 'arrangeInGrid': {
        const args = call.arguments as ArrangeInGridArgs;
        const result = runArrangeInGrid(args.objectIds, ops, options?.selectionArea ?? null, false, args.frameId, args.rows, args.columns);
        modifiedIds.push(...result.modifiedIds);
        descriptions.push(result.summary);
        break;
      }

      case 'arrangeInGridAndResize': {
        const args = call.arguments as ArrangeInGridArgs;
        const result = runArrangeInGrid(args.objectIds, ops, options?.selectionArea ?? null, true, args.frameId, args.rows, args.columns);
        modifiedIds.push(...result.modifiedIds);
        descriptions.push(result.summary);
        break;
      }

      case 'fitFrameToContents': {
        const args = call.arguments as { frameId: string; padding?: number };
        const padding = args.padding ?? 40;
        
        const frame = ops.objects.find((o) => o.id === args.frameId && o.type === 'frame');
        if (!frame || frame.type !== 'frame') {
          descriptions.push(
            `Could not fit frame to contents — Frame ID "${args.frameId}" not found or is not a frame`,
          );
          break;
        }

        // Strategy 1: Use containedObjectIds if available
        let containedObjects: WhiteboardObject[] = [];
        const frameObj = frame as Frame;
        
        if (frameObj.containedObjectIds && Array.isArray(frameObj.containedObjectIds) && frameObj.containedObjectIds.length > 0) {
          // Use the frame's tracked contained object IDs
          containedObjects = ops.objects.filter((obj) => 
            frameObj.containedObjectIds.includes(obj.id) && obj.type !== 'line'
          );
        } else {
          // Strategy 2: Find objects that overlap or are inside the frame bounds
          const frameX = frameObj.x;
          const frameY = frameObj.y;
          const frameWidth = frameObj.width || 0;
          const frameHeight = frameObj.height || 0;
          const frameRight = frameX + frameWidth;
          const frameBottom = frameY + frameHeight;
          
          containedObjects = ops.objects.filter((obj) => {
            if (obj.id === args.frameId) return false; // Skip the frame itself
            if (obj.type === 'line') return false; // Skip lines for bounding box calculation
            
            // Get object bounds
            let objLeft = obj.x;
            let objTop = obj.y;
            let objRight = obj.x;
            let objBottom = obj.y;
            
            if (obj.type === 'circle') {
              const radius = (obj as any).radius || 50;
              objLeft = obj.x - radius;
              objTop = obj.y - radius;
              objRight = obj.x + radius;
              objBottom = obj.y + radius;
            } else if (obj.type === 'star') {
              // Stars have width/height but are centered
              const starWidth = (obj as any).width || 180;
              const starHeight = (obj as any).height || 180;
              objLeft = obj.x;
              objTop = obj.y;
              objRight = obj.x + starWidth;
              objBottom = obj.y + starHeight;
            } else if ('width' in obj && 'height' in obj) {
              objRight = obj.x + (obj as any).width;
              objBottom = obj.y + (obj as any).height;
            } else {
              // Default size for objects without dimensions (like plain text)
              objRight = obj.x + 100;
              objBottom = obj.y + 30;
            }
            
            // Check if object overlaps with frame (not just if top-left corner is inside)
            const overlaps = !(
              objRight < frameX ||   // Object is completely to the left
              objLeft > frameRight || // Object is completely to the right
              objBottom < frameY ||   // Object is completely above
              objTop > frameBottom    // Object is completely below
            );
            
            return overlaps;
          });
        }

        if (containedObjects.length === 0) {
          descriptions.push(
            `Frame is empty — no objects found inside to fit`,
          );
          break;
        }

        // Calculate bounding box of all contained objects
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of containedObjects) {
          let objMinX = obj.x;
          let objMinY = obj.y;
          let objMaxX = obj.x;
          let objMaxY = obj.y;

          if (obj.type === 'circle') {
            const radius = (obj as any).radius || 50;
            objMinX = obj.x - radius;
            objMinY = obj.y - radius;
            objMaxX = obj.x + radius;
            objMaxY = obj.y + radius;
          } else if (obj.type === 'star') {
            // Stars have width/height and are positioned at top-left
            const starWidth = (obj as any).width || 180;
            const starHeight = (obj as any).height || 180;
            objMinX = obj.x;
            objMinY = obj.y;
            objMaxX = obj.x + starWidth;
            objMaxY = obj.y + starHeight;
          } else if ('width' in obj && 'height' in obj) {
            objMaxX = obj.x + (obj as any).width;
            objMaxY = obj.y + (obj as any).height;
          } else {
            // Default size for objects without dimensions (like plain text)
            objMaxX = obj.x + 100;
            objMaxY = obj.y + 30;
          }

          minX = Math.min(minX, objMinX);
          minY = Math.min(minY, objMinY);
          maxX = Math.max(maxX, objMaxX);
          maxY = Math.max(maxY, objMaxY);
        }

        // Calculate new frame dimensions with padding
        const newX = minX - padding;
        const newY = minY - padding;
        const newWidth = (maxX - minX) + (padding * 2);
        const newHeight = (maxY - minY) + (padding * 2);

        // Update frame
        ops.updateObject(args.frameId, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        } as Partial<WhiteboardObject>);

        modifiedIds.push(args.frameId);
        descriptions.push(
          `Resized frame to fit ${containedObjects.length} object(s) with ${padding}px padding (${Math.round(newWidth)}×${Math.round(newHeight)})`,
        );
        
        break;
      }

      case 'createSWOTAnalysis': {
        const args = call.arguments as CreateSWOTAnalysisArgs;
        const quadrants = args.quadrants ?? 4;
        const withFrame = args.withFrame ?? true;
        
        // Calculate grid dimensions (e.g., 4 quadrants = 2x2, 9 = 3x3, 6 = 2x3)
        const cols = Math.ceil(Math.sqrt(quadrants));
        const rows = Math.ceil(quadrants / cols);
        
        // Size for each object (sticky notes or shapes)
        const objWidth = 200;
        const objHeight = 200;
        const gap = 20;
        
        // Calculate total grid dimensions
        const gridWidth = (objWidth * cols) + (gap * (cols - 1));
        const gridHeight = (objHeight * rows) + (gap * (rows - 1));
        
        // Determine starting position (random or specified)
        let startX = args.x ?? Math.random() * 300 + 100;
        let startY = args.y ?? Math.random() * 300 + 100;
        
        // Use viewport center if available and position not specified
        if (!args.x && !args.y && options?.viewport) {
          const center = getViewportCenterPosition(options.viewport);
          startX = center.x - gridWidth / 2;
          startY = center.y - gridHeight / 2;
        }
        
        // Random colors for variety
        const possibleColors = ['#FFF59D', '#F48FB1', '#81D4FA', '#A5D6A7', '#FFCC80'];
        const stickyColorNames = ['yellow', 'pink', 'blue', 'green', 'orange'];
        const shapeColors = ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316'];
        
        const createdObjectIds: string[] = [];
        const currentTime = Date.now();
        
        // SWOT labels for 4-quadrant layout
        const swotLabels = ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'];
        
        // Create grid of objects
        for (let i = 0; i < quadrants; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          
          const x = startX + (col * (objWidth + gap));
          const y = startY + (row * (objHeight + gap));
          
          const id = generateId();
          
          // Determine text label (use SWOT labels for 4-quadrant layout)
          const labelText = (quadrants === 4 && i < swotLabels.length) ? swotLabels[i] : '';
          
          // Determine color (random if not specified)
          let objColor: string;
          if (args.shape) {
            // Shape mode: use shape colors
            objColor = args.color ?? shapeColors[i % shapeColors.length];
          } else {
            // Sticky note mode: use sticky colors
            objColor = args.color ?? possibleColors[i % possibleColors.length];
          }
          
          if (args.shape) {
            // Create shape
            let shapeObj: WhiteboardObject;
            
            if (args.shape === 'circle') {
              shapeObj = {
                id,
                type: 'circle',
                x: x + objWidth / 2,
                y: y + objHeight / 2,
                radius: Math.min(objWidth, objHeight) / 2,
                fill: resolveShapeColor(objColor),
                stroke: '#000000',
                strokeWidth: 2,
                rotation: 0,
                zIndex: nextZIndex++,
                createdBy: ops.userId,
                createdAt: currentTime,
              } as CircleShape;
            } else if (args.shape === 'star') {
              shapeObj = {
                id,
                type: 'star',
                x,
                y,
                width: objWidth,
                height: objHeight,
                numPoints: 5,
                innerRadius: (Math.min(objWidth, objHeight) / 2) * 0.5,
                outerRadius: Math.min(objWidth, objHeight) / 2,
                fill: resolveShapeColor(objColor),
                stroke: '#000000',
                strokeWidth: 2,
                rotation: 0,
                zIndex: nextZIndex++,
                createdBy: ops.userId,
                createdAt: currentTime,
              } as StarShape;
            } else if (args.shape === 'triangle') {
              shapeObj = {
                id,
                type: 'triangle',
                x,
                y,
                width: objWidth,
                height: objHeight,
                fill: resolveShapeColor(objColor),
                stroke: '#000000',
                strokeWidth: 2,
                rotation: 0,
                zIndex: nextZIndex++,
                createdBy: ops.userId,
                createdAt: currentTime,
              } as TriangleShape;
            } else {
              // rect
              shapeObj = {
                id,
                type: 'rect',
                x,
                y,
                width: objWidth,
                height: objHeight,
                fill: resolveShapeColor(objColor),
                stroke: '#000000',
                strokeWidth: 2,
                rotation: 0,
                zIndex: nextZIndex++,
                createdBy: ops.userId,
                createdAt: currentTime,
              } as RectShape;
            }
            
            objectsToCreate.push(shapeObj);
          } else {
            // Create sticky note
            const stickyObj: StickyNote = {
              id,
              type: 'sticky',
              x,
              y,
              width: objWidth,
              height: objHeight,
              color: resolveStickyColor(objColor),
              text: labelText,
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: currentTime,
            };
            objectsToCreate.push(stickyObj);
          }
          
          createdObjectIds.push(id);
          createdIds.push(id);
        }
        
        // Optionally wrap with frame
        if (withFrame) {
          const framePadding = 40;
          const frameId = generateId();
          const frameObj: Frame = {
            id: frameId,
            type: 'frame',
            x: startX - framePadding,
            y: startY - framePadding,
            width: gridWidth + framePadding * 2,
            height: gridHeight + framePadding * 2,
            name: quadrants === 4 ? 'SWOT Analysis' : `${cols}×${rows} Matrix`,
            stroke: '#9CA3AF',
            strokeWidth: 2,
            fill: '#FFFFFF',
            rotation: 0,
            containedObjectIds: createdObjectIds,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          objectsToCreate.push(frameObj);
          createdIds.push(frameId);
          
          descriptions.push(
            `Created ${cols}×${rows} matrix with ${quadrants} ${args.shape ? args.shape + 's' : 'sticky notes'} and frame`
          );
        } else {
          descriptions.push(
            `Created ${cols}×${rows} matrix with ${quadrants} ${args.shape ? args.shape + 's' : 'sticky notes'}`
          );
        }
        
        break;
      }

      case 'createUserJourneyMap': {
        const args = call.arguments as CreateUserJourneyMapArgs;
        const stages = args.stages || [];
        const orientation = args.orientation || 'horizontal';
        
        if (stages.length === 0) {
          descriptions.push('No stages provided for journey map');
          break;
        }
        
        // Stage box dimensions
        const stageWidth = 200;
        const stageHeight = 120;
        const gap = 80; // Gap between stages for connector lines
        
        // Calculate total dimensions
        const totalWidth = orientation === 'horizontal' 
          ? (stageWidth * stages.length) + (gap * (stages.length - 1))
          : stageWidth;
        const totalHeight = orientation === 'vertical'
          ? (stageHeight * stages.length) + (gap * (stages.length - 1))
          : stageHeight;
        
        // Determine starting position
        let startX = args.x ?? Math.random() * 300 + 100;
        let startY = args.y ?? Math.random() * 300 + 100;
        
        // Use viewport center if available and position not specified
        if (!args.x && !args.y && options?.viewport) {
          const center = getViewportCenterPosition(options.viewport);
          startX = center.x - totalWidth / 2;
          startY = center.y - totalHeight / 2;
        }
        
        // Color palette for stages
        const stageColors = [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Amber
          '#EF4444', // Red
          '#8B5CF6', // Purple
          '#EC4899', // Pink
          '#14B8A6', // Teal
          '#F97316', // Orange
        ];
        
        const stageIds: string[] = [];
        const currentTime = Date.now();
        
        // Create colored rectangles with text for each stage
        for (let i = 0; i < stages.length; i++) {
          // Calculate position - all stages at same Y, only X shifts
          const x = orientation === 'horizontal'
            ? startX + (i * (stageWidth + gap))
            : startX;
          const y = orientation === 'vertical'
            ? startY + (i * (stageHeight + gap))
            : startY;
          
          const rectId = generateId();
          const color = stageColors[i % stageColors.length];
          
          // Create colored rectangle with text inside
          const rect: RectShape = {
            id: rectId,
            type: 'rect',
            x,
            y,
            width: stageWidth,
            height: stageHeight,
            fill: color,
            stroke: '#FFFFFF',
            strokeWidth: 2,
            text: stages[i],
            textSize: 18,
            textFamily: 'Inter',
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          
          objectsToCreate.push(rect);
          stageIds.push(rectId);
          createdIds.push(rectId);
        }
        
        // Create connector lines between stages
        for (let i = 0; i < stages.length - 1; i++) {
          const lineId = generateId();
          
          // Calculate line positions
          let x1, y1, x2, y2;
          
          if (orientation === 'horizontal') {
            // Right edge of current stage to left edge of next stage
            x1 = startX + (i * (stageWidth + gap)) + stageWidth;
            y1 = startY + stageHeight / 2;
            x2 = startX + ((i + 1) * (stageWidth + gap));
            y2 = startY + stageHeight / 2;
          } else {
            // Bottom edge of current stage to top edge of next stage
            x1 = startX + stageWidth / 2;
            y1 = startY + (i * (stageHeight + gap)) + stageHeight;
            x2 = startX + stageWidth / 2;
            y2 = startY + ((i + 1) * (stageHeight + gap));
          }
          
          const line: LineShape = {
            id: lineId,
            type: 'line',
            x: x1,
            y: y1,
            points: [0, 0, x2 - x1, y2 - y1],
            stroke: '#6B7280',
            strokeWidth: 3,
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          
          objectsToCreate.push(line);
          createdIds.push(lineId);
        }
        
        // Add frame around entire journey map
        const framePadding = 40;
        const frameId = generateId();
        const frameObj: Frame = {
          id: frameId,
          type: 'frame',
          x: startX - framePadding,
          y: startY - framePadding,
          width: totalWidth + framePadding * 2,
          height: totalHeight + framePadding * 2,
          name: 'User Journey Map',
          stroke: '#9CA3AF',
          strokeWidth: 2,
          fill: '#FFFFFF',
          containedObjectIds: [...stageIds],
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: currentTime,
        };
        
        objectsToCreate.push(frameObj);
        createdIds.push(frameId);
        
        descriptions.push(
          `Created user journey map with ${stages.length} stages: ${stages.join(' → ')}`
        );
        
        break;
      }

      case 'createRetrospectiveBoard': {
        const args = call.arguments as CreateRetrospectiveBoardArgs;
        const columns = args.columns || ['What Went Well', "What Didn't", 'Action Items'];
        const notesPerColumn = args.notesPerColumn || 3;
        
        // Frame dimensions
        const frameWidth = 300;
        const frameHeight = 500;
        const frameGap = 50;
        
        // Sticky note dimensions - smaller to fit inside frame
        const noteWidth = 250;
        const noteHeight = 120;
        const noteGap = 15;
        
        // Calculate total dimensions
        const totalWidth = (frameWidth * columns.length) + (frameGap * (columns.length - 1));
        const totalHeight = frameHeight;
        
        // Determine starting position
        let startX = args.x ?? Math.random() * 300 + 100;
        let startY = args.y ?? Math.random() * 300 + 100;
        
        // Use viewport center if available and position not specified
        if (!args.x && !args.y && options?.viewport) {
          const center = getViewportCenterPosition(options.viewport);
          startX = center.x - totalWidth / 2;
          startY = center.y - totalHeight / 2;
        }
        
        const currentTime = Date.now();
        let totalNotesCreated = 0;
        
        // Use LLM-provided content if available, otherwise use default examples
        const defaultContent: Record<string, string[]> = {
          'What Went Well': [
            'Team collaboration was excellent',
            'Delivered features on time',
            'Good code review process',
          ],
          "What Didn't": [
            'Communication gaps occurred',
            'Testing took longer than expected',
            'Some technical debt accumulated',
          ],
          'Action Items': [
            'Improve stand-up meetings',
            'Add more automated tests',
            'Schedule refactoring sprint',
          ],
        };
        
        // Create frames and sticky notes for each column
        for (let col = 0; col < columns.length; col++) {
          const frameX = startX + (col * (frameWidth + frameGap));
          const frameY = startY;
          const frameId = generateId();
          const columnName = columns[col];
          
          // Create frame
          const frame: Frame = {
            id: frameId,
            type: 'frame',
            x: frameX,
            y: frameY,
            width: frameWidth,
            height: frameHeight,
            name: columnName,
            stroke: '#9CA3AF',
            strokeWidth: 2,
            fill: '#FFFFFF',
            containedObjectIds: [],
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          
          objectsToCreate.push(frame);
          createdIds.push(frameId);
          
          // Get content for this column - prefer LLM-provided content
          let columnContent: string[] = [];
          if (args.noteContents && args.noteContents[col]) {
            columnContent = args.noteContents[col];
          } else if (defaultContent[columnName]) {
            columnContent = defaultContent[columnName];
          } else {
            // Generic fallback
            columnContent = Array(notesPerColumn).fill('');
          }
          
          // Create sticky notes inside the frame
          const notesInColumn: string[] = [];
          for (let note = 0; note < notesPerColumn; note++) {
            const noteId = generateId();
            const noteX = frameX + (frameWidth - noteWidth) / 2; // Center horizontally in frame
            const noteY = frameY + 60 + (note * (noteHeight + noteGap)); // Start below frame title
            
            // Use LLM content or default content
            const noteText = columnContent[note] || '';
            
            const stickyNote: StickyNote = {
              id: noteId,
              type: 'sticky',
              x: noteX,
              y: noteY,
              width: noteWidth,
              height: noteHeight,
              color: STICKY_COLORS.YELLOW,
              text: noteText,
              rotation: 0,
              zIndex: nextZIndex++,
              createdBy: ops.userId,
              createdAt: currentTime,
            };
            
            objectsToCreate.push(stickyNote);
            createdIds.push(noteId);
            notesInColumn.push(noteId);
            totalNotesCreated++;
          }
          
          // Update frame's containedObjectIds
          frame.containedObjectIds = notesInColumn;
        }
        
        descriptions.push(
          `Created retrospective board with ${columns.length} columns (${columns.join(', ')}) and ${totalNotesCreated} sticky notes`
        );
        
        break;
      }

      case 'createProsConsBoard': {
        const args = call.arguments as CreateProsConsBoardArgs;
        const prosCount = args.prosCount || 3;
        const consCount = args.consCount || 3;
        const prosContent = args.prosContent || [];
        const consContent = args.consContent || [];
        
        // Frame dimensions
        const frameWidth = 300;
        const frameHeight = 500;
        const frameGap = 50;
        
        // Sticky note dimensions
        const noteWidth = 250;
        const noteHeight = 120;
        const noteGap = 15;
        
        // Calculate total dimensions (2 columns: Pros and Cons)
        const totalWidth = (frameWidth * 2) + frameGap;
        const totalHeight = frameHeight;
        
        // Determine starting position
        let startX = args.x ?? Math.random() * 300 + 100;
        let startY = args.y ?? Math.random() * 300 + 100;
        
        // Use viewport center if available and position not specified
        if (!args.x && !args.y && options?.viewport) {
          const center = getViewportCenterPosition(options.viewport);
          startX = center.x - totalWidth / 2;
          startY = center.y - totalHeight / 2;
        }
        
        const currentTime = Date.now();
        let totalNotesCreated = 0;
        
        // Create Pros column
        const prosFrameX = startX;
        const prosFrameY = startY;
        const prosFrameId = generateId();
        
        const prosFrame: Frame = {
          id: prosFrameId,
          type: 'frame',
          x: prosFrameX,
          y: prosFrameY,
          width: frameWidth,
          height: frameHeight,
          name: 'Pros',
          stroke: '#10B981',
          strokeWidth: 2,
          fill: '#FFFFFF',
          containedObjectIds: [],
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: currentTime,
        };
        
        objectsToCreate.push(prosFrame);
        createdIds.push(prosFrameId);
        
        // Create pros sticky notes
        const prosNotes: string[] = [];
        for (let i = 0; i < prosCount; i++) {
          const noteId = generateId();
          const noteX = prosFrameX + (frameWidth - noteWidth) / 2;
          const noteY = prosFrameY + 60 + (i * (noteHeight + noteGap));
          const noteText = prosContent[i] || '';
          
          const stickyNote: StickyNote = {
            id: noteId,
            type: 'sticky',
            x: noteX,
            y: noteY,
            width: noteWidth,
            height: noteHeight,
            color: STICKY_COLORS.GREEN,
            text: noteText,
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          
          objectsToCreate.push(stickyNote);
          createdIds.push(noteId);
          prosNotes.push(noteId);
          totalNotesCreated++;
        }
        
        prosFrame.containedObjectIds = prosNotes;
        
        // Create Cons column
        const consFrameX = startX + frameWidth + frameGap;
        const consFrameY = startY;
        const consFrameId = generateId();
        
        const consFrame: Frame = {
          id: consFrameId,
          type: 'frame',
          x: consFrameX,
          y: consFrameY,
          width: frameWidth,
          height: frameHeight,
          name: 'Cons',
          stroke: '#EF4444',
          strokeWidth: 2,
          fill: '#FFFFFF',
          containedObjectIds: [],
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: currentTime,
        };
        
        objectsToCreate.push(consFrame);
        createdIds.push(consFrameId);
        
        // Create cons sticky notes
        const consNotes: string[] = [];
        for (let i = 0; i < consCount; i++) {
          const noteId = generateId();
          const noteX = consFrameX + (frameWidth - noteWidth) / 2;
          const noteY = consFrameY + 60 + (i * (noteHeight + noteGap));
          const noteText = consContent[i] || '';
          
          const stickyNote: StickyNote = {
            id: noteId,
            type: 'sticky',
            x: noteX,
            y: noteY,
            width: noteWidth,
            height: noteHeight,
            color: STICKY_COLORS.PINK,
            text: noteText,
            rotation: 0,
            zIndex: nextZIndex++,
            createdBy: ops.userId,
            createdAt: currentTime,
          };
          
          objectsToCreate.push(stickyNote);
          createdIds.push(noteId);
          consNotes.push(noteId);
          totalNotesCreated++;
        }
        
        consFrame.containedObjectIds = consNotes;
        
        const topicDisplay = args.topic ? ` for "${args.topic}"` : '';
        descriptions.push(
          `Created Pros and Cons board${topicDisplay} with ${prosCount} pros and ${consCount} cons`
        );
        
        break;
      }

      case 'analyzeObjects': {
        // This tool is executed server-side and the AI's message already contains the answer.
        // We don't need to execute it again client-side or show a summary.
        // Skip execution to avoid duplicate/conflicting output.
        break;
      }

      default:
        descriptions.push(`Unknown tool: ${call.name}`);
    }
  }
  
  // Batch create all queued objects for optimal performance
  // This creates all objects in a single Yjs transaction:
  // - 50 objects = 1 Yjs update (instead of 50)
  // - 1 WebSocket broadcast (instead of 50) 
  // - 1 React render (instead of 50)
  if (objectsToCreate.length > 0) {
    ops.createObjectsBatch(objectsToCreate);
  }

  return {
    createdIds,
    modifiedIds,
    summary:
      descriptions.length > 0
        ? descriptions.join('. ')
        : 'No actions performed.',
  };
}

// ── Layout engine: arrange in grid ──────────────────────────

/**
 * Calculate grid positions for N objects without needing the objects to exist yet.
 * Returns array of {x, y} positions in grid order.
 */
function calculateGridPositions(
  count: number,
  objectWidth: number,
  objectHeight: number,
  explicitRows?: number,
  explicitColumns?: number,
  startX: number = 200,
  startY: number = 200,
): Array<{ x: number; y: number }> {
  const GAP = 20;
  
  // Calculate grid layout
  let columns: number;
  let rows: number;
  
  // Priority 1: Use explicit rows/columns if provided
  if (explicitRows != null && explicitColumns != null) {
    rows = explicitRows;
    columns = explicitColumns;
  } else if (explicitRows != null) {
    rows = explicitRows;
    columns = Math.ceil(count / rows);
  } else if (explicitColumns != null) {
    columns = explicitColumns;
    rows = Math.ceil(count / columns);
  }
  // Priority 2: Auto-calculate balanced grid
  else {
    if (count <= 3) {
      columns = count;
      rows = 1;
    } else if (count === 4) {
      columns = 2;
      rows = 2;
    } else if (count <= 6) {
      columns = 3;
      rows = 2;
    } else {
      let bestRows = 2;
      let bestColumns = Math.ceil(count / bestRows);
      
      for (let r = 2; r <= Math.ceil(Math.sqrt(count)); r++) {
        const c = Math.ceil(count / r);
        if (r * c === count || (r * c - count < bestRows * bestColumns - count)) {
          bestRows = r;
          bestColumns = c;
        }
      }
      
      rows = bestRows;
      columns = bestColumns;
    }
  }
  
  console.log(`[calculateGridPositions] ${count} objects → ${rows}×${columns} grid`);
  
  // Calculate positions
  const positions: Array<{ x: number; y: number }> = [];
  
  for (let i = 0; i < count; i++) {
    const rowIndex = Math.floor(i / columns);
    const colIndex = i % columns;
    
    const x = startX + colIndex * (objectWidth + GAP);
    const y = startY + rowIndex * (objectHeight + GAP);
    
    positions.push({ x, y });
  }
  
  return positions;
}

/**
 * Get the visual dimensions of an object accounting for rotation.
 * Uses getObjectBounds to calculate the actual space the object occupies.
 */
function getObjectVisualDimensions(
  obj: WhiteboardObject,
  map: Map<string, WhiteboardObject>
): { width: number; height: number } {
  const bounds = getObjectBounds(obj, map);
  return {
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

/**
 * Get the reference point (top-left of visual bounds) for an object.
 * For circles, this converts center-based coordinates to bounds-based.
 */
function getObjectReferencePoint(
  obj: WhiteboardObject,
  map: Map<string, WhiteboardObject>
): { x: number; y: number } {
  const bounds = getObjectBounds(obj, map);
  return { x: bounds.minX, y: bounds.minY };
}

/**
 * Calculate the position to apply to an object to place its visual bounds
 * at a target reference point.
 */
function calculatePositionForTarget(
  obj: WhiteboardObject,
  targetX: number,
  targetY: number,
  map: Map<string, WhiteboardObject>
): { x: number; y: number } {
  const bounds = getObjectBounds(obj, map);
  const offsetX = obj.x - bounds.minX;
  const offsetY = obj.y - bounds.minY;
  return {
    x: targetX + offsetX,
    y: targetY + offsetY,
  };
}

function runArrangeInGrid(
  objectIds: string[],
  ops: BoardOperations,
  selectionArea: { x: number; y: number; width: number; height: number } | null,
  shouldResize = false,
  frameId?: string,
  explicitRows?: number,
  explicitColumns?: number,
): { modifiedIds: string[]; summary: string } {
  const modifiedIds: string[] = [];
  const objects = objectIds
    .map((id) => ops.objects.find((o) => o.id === id))
    .filter((o): o is WhiteboardObject => o != null && o.type !== 'line');

  if (objects.length === 0) {
    return { modifiedIds, summary: 'No valid objects to arrange' };
  }

  const N = objects.length;
  
  // Detect if this is a frame-based arrangement
  const isFrameArrangement = frameId != null;
  
  // Calculate grid layout
  let columns: number;
  let rows: number;
  
  // Priority 1: Use explicit rows/columns if provided
  if (explicitRows != null && explicitColumns != null) {
    rows = explicitRows;
    columns = explicitColumns;
  } else if (explicitRows != null) {
    // Only rows specified: calculate columns
    rows = explicitRows;
    columns = Math.ceil(N / rows);
  } else if (explicitColumns != null) {
    // Only columns specified: calculate rows
    columns = explicitColumns;
    rows = Math.ceil(N / columns);
  }
  // Priority 2: Frame-based arrangement defaults
  else if (isFrameArrangement) {
    // Frame arrangement: check if it's a square-ish layout or horizontal row
    // 4 objects = 2×2 (SWOT), 5+ objects = 1×N (journey map)
    if (N === 4) {
      // SWOT pattern: 2×2 grid
      columns = 2;
      rows = 2;
    } else {
      // Journey map pattern: horizontal single row (1×N grid)
      columns = N;
      rows = 1;
    }
  }
  // Priority 3: Auto-calculate balanced grid
  else {
    // Auto-calculate: balanced grid by splitting evenly
    // Goal: Create rectangular grids that divide evenly when possible
    // 4 → 2×2, 6 → 3×2, 7 → 4×2 (with 1 empty), 8 → 4×2, 9 → 3×3
    
    if (N <= 3) {
      // 1-3: horizontal line
      columns = N;
      rows = 1;
    } else if (N === 4) {
      // 4: perfect square
      columns = 2;
      rows = 2;
    } else if (N <= 6) {
      // 5-6: 3×2 grid
      columns = 3;
      rows = 2;
    } else {
      // 7+: Find best divisor that creates balanced rectangle
      // Try divisors from small to large to prefer wider grids
      // For 8: try 2 → 8/2=4 → 4×2 ✓ (even division)
      // For 9: try 3 → 9/3=3 → 3×3 ✓ (perfect square)
      // For 10: try 2 → 10/2=5 → 5×2 ✓ (even division)
      
      let bestRows = 2;
      let bestColumns = Math.ceil(N / bestRows);
      
      // Try different row counts (2, 3, 4...) and pick the most balanced
      for (let r = 2; r <= Math.ceil(Math.sqrt(N)); r++) {
        const c = Math.ceil(N / r);
        // Prefer layouts where division is exact or close
        if (r * c === N || (r * c - N < bestRows * bestColumns - N)) {
          bestRows = r;
          bestColumns = c;
        }
      }
      
      rows = bestRows;
      columns = bestColumns;
    }
    
    console.log('[arrangeInGrid] Auto-calculation for', N, 'objects:', { rows, columns, layout: `${rows}×${columns}` });
  }

  // Create map for bounds calculations
  const objectMap = new Map<string, WhiteboardObject>(
    ops.objects.map((obj) => [obj.id, obj])
  );

  // Compute bounding box using proper bounds calculation
  let boundingBox: { x: number; y: number; width: number; height: number };
  
  // Priority 1: Frame bounds (if frameId provided)
  if (frameId) {
    const frame = ops.objects.find((o) => o.id === frameId && o.type === 'frame');
    if (frame && frame.type === 'frame') {
      // Use frame's inner bounds with padding
      const frameObj = frame as Frame;
      const FRAME_PADDING = 40;
      boundingBox = {
        x: frameObj.x + FRAME_PADDING,
        y: frameObj.y + FRAME_PADDING,
        width: Math.max(frameObj.width - FRAME_PADDING * 2, 100),
        height: Math.max(frameObj.height - FRAME_PADDING * 2, 100),
      };
    } else {
      return { modifiedIds, summary: `Frame ID "${frameId}" not found` };
    }
  }
  // Priority 2: Selection area
  else if (selectionArea && selectionArea.width > 0 && selectionArea.height > 0) {
    boundingBox = selectionArea;
  } 
  // Priority 3: Calculate from objects' current bounds
  else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of objects) {
      const bounds = getObjectBounds(obj, objectMap);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
    boundingBox = {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  }

  // Add padding between cells (20px gap)
  const GAP = 20;
  const usableWidth = boundingBox.width - GAP * (columns - 1);
  const usableHeight = boundingBox.height - GAP * (rows - 1);
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;

  // Sort objects by original position (left to right, top to bottom)
  const sorted = [...objects].sort((a, b) => {
    const refA = getObjectReferencePoint(a, objectMap);
    const refB = getObjectReferencePoint(b, objectMap);
    if (Math.abs(refA.y - refB.y) > 10) return refA.y - refB.y;
    return refA.x - refB.x;
  });

  // Position each object in grid
  console.log('[arrangeInGrid] Positioning', sorted.length, 'objects in', `${rows}×${columns}`, 'grid');
  console.log('[arrangeInGrid] Bounding box:', boundingBox);
  console.log('[arrangeInGrid] Cell dimensions:', { cellWidth, cellHeight, gap: GAP });
  
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i];
    const rowIndex = Math.floor(i / columns);
    const colIndex = i % columns;
    
    // Calculate cell position with gaps
    const cellX = boundingBox.x + colIndex * (cellWidth + GAP);
    const cellY = boundingBox.y + rowIndex * (cellHeight + GAP);
    
    console.log(`[arrangeInGrid] Object ${i} (${obj.type}): row=${rowIndex}, col=${colIndex}, cellPos=(${Math.round(cellX)}, ${Math.round(cellY)})`);
    
    if (shouldResize) {
      // RESIZE MODE: Make objects fit perfectly in cells
      if (obj.type === 'circle') {
        // For circles, use the smaller dimension to maintain aspect ratio
        const newRadius = Math.min(cellWidth, cellHeight) / 2;
        // Center the circle in the cell
        const centerX = cellX + cellWidth / 2;
        const centerY = cellY + cellHeight / 2;
        ops.updateObject(obj.id, { 
          x: centerX, 
          y: centerY, 
          radius: newRadius 
        } as Partial<WhiteboardObject>);
      } else if ('width' in obj && 'height' in obj) {
        // For rectangles, stars, triangles, sticky notes - resize to fill cell
        ops.updateObject(obj.id, {
          x: cellX,
          y: cellY,
          width: cellWidth,
          height: cellHeight,
        } as Partial<WhiteboardObject>);
      } else {
        // For objects without dimensions (text), just position
        ops.updateObject(obj.id, { x: cellX, y: cellY });
      }
    } else {
      // POSITION-ONLY MODE: Keep original size, center in cell
      const dim = getObjectVisualDimensions(obj, objectMap);
      const targetRefX = cellX + (cellWidth - dim.width) / 2;
      const targetRefY = cellY + (cellHeight - dim.height) / 2;
      const newPos = calculatePositionForTarget(obj, targetRefX, targetRefY, objectMap);
      ops.updateObject(obj.id, { x: newPos.x, y: newPos.y });
    }
    
    modifiedIds.push(obj.id);
  }

  const action = shouldResize ? 'Arranged and resized' : 'Arranged';
  return {
    modifiedIds,
    summary: `${action} ${modifiedIds.length} objects in a ${columns}×${rows} grid`,
  };
}

// ── Analysis engine: count and categorize objects ──────────

interface AnalysisResult {
  summary: string;
  data: {
    totalObjects: number;
    countByType: Record<string, number>;
    countByColor: Record<string, number>;
    countByTypeAndColor: Record<string, number>;
  };
}

function runAnalyzeObjects(
  objectIds: string[],
  ops: BoardOperations,
): AnalysisResult {
  // Determine which objects to analyze
  const objectsToAnalyze =
    objectIds.length > 0
      ? objectIds
          .map((id) => ops.objects.find((o) => o.id === id))
          .filter((o): o is WhiteboardObject => o != null)
      : ops.objects;

  if (objectsToAnalyze.length === 0) {
    return {
      summary: 'No objects to analyze',
      data: {
        totalObjects: 0,
        countByType: {},
        countByColor: {},
        countByTypeAndColor: {},
      },
    };
  }

  const countByType: Record<string, number> = {};
  const countByColor: Record<string, number> = {};
  const countByTypeAndColor: Record<string, number> = {};

  for (const obj of objectsToAnalyze) {
    // Extract type (normalize names)
    const type = normalizeTypeName(obj.type);

    // Extract color
    const color = extractColor(obj);

    // Count by type
    countByType[type] = (countByType[type] ?? 0) + 1;

    // Count by color
    countByColor[color] = (countByColor[color] ?? 0) + 1;

    // Count by type + color
    const key = `${color}_${type}`;
    countByTypeAndColor[key] = (countByTypeAndColor[key] ?? 0) + 1;
  }

  const totalObjects = objectsToAnalyze.length;

  // Generate human-readable summary with color breakdown
  const typesList = Object.entries(countByType)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
    .join(', ');

  // Add detailed breakdown by type and color
  const detailedBreakdown = Object.entries(countByTypeAndColor)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([key, count]) => {
      const [color, ...typeParts] = key.split('_');
      const type = typeParts.join('_');
      return `${count} ${color} ${type}${count !== 1 ? 's' : ''}`;
    })
    .join(', ');

  const summary = `Analyzed ${totalObjects} object${totalObjects !== 1 ? 's' : ''}: ${typesList}. Breakdown: ${detailedBreakdown}`;

  return {
    summary,
    data: {
      totalObjects,
      countByType,
      countByColor,
      countByTypeAndColor,
    },
  };
}

/**
 * Normalize object type names for user-friendly display.
 */
function normalizeTypeName(type: string): string {
  const typeMap: Record<string, string> = {
    sticky: 'sticky note',
    rect: 'rectangle',
    circle: 'circle',
    triangle: 'triangle',
    star: 'star',
    line: 'connector',
    frame: 'frame',
  };
  return typeMap[type] ?? type;
}

/**
 * Convert hex color to RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');
  
  // Handle 3-digit hex
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return { r, g, b };
  }
  
  // Handle 6-digit hex
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return { r, g, b };
  }
  
  return null;
}

/**
 * Analyze RGB values to determine human-readable color name.
 * Uses HSL color space for more accurate color categorization.
 */
function rgbToColorName(r: number, g: number, b: number): string {
  // Normalize RGB to 0-1 range
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  // Calculate lightness (0-1)
  const lightness = (max + min) / 2;
  
  // Calculate saturation (0-1)
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
  }
  
  // Grayscale colors (low saturation)
  if (saturation < 0.15) {
    if (lightness < 0.2) return 'black';
    if (lightness < 0.5) return 'gray';
    if (lightness < 0.9) return 'light gray';
    return 'white';
  }
  
  // Calculate hue (0-360 degrees)
  let hue = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      hue = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      hue = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      hue = 60 * ((rNorm - gNorm) / delta + 4);
    }
    if (hue < 0) hue += 360;
  }
  
  // Categorize by hue ranges
  // Red: 0-15, 345-360
  if (hue < 15 || hue >= 345) {
    if (lightness > 0.7 && saturation < 0.7) return 'pink';
    return 'red';
  }
  
  // Orange: 15-45
  if (hue >= 15 && hue < 45) {
    if (lightness < 0.4) return 'brown';
    return 'orange';
  }
  
  // Yellow: 45-65
  if (hue >= 45 && hue < 65) {
    return 'yellow';
  }
  
  // Yellow-green / Lime: 65-80
  if (hue >= 65 && hue < 80) {
    return 'lime';
  }
  
  // Green: 80-165
  if (hue >= 80 && hue < 165) {
    return 'green';
  }
  
  // Cyan: 165-200
  if (hue >= 165 && hue < 200) {
    return 'cyan';
  }
  
  // Blue: 200-260
  if (hue >= 200 && hue < 260) {
    return 'blue';
  }
  
  // Purple/Magenta: 260-330
  if (hue >= 260 && hue < 330) {
    if (lightness > 0.6) return 'pink';
    if (hue < 290) return 'purple';
    return 'magenta';
  }
  
  // Pink/Magenta: 330-345
  if (hue >= 330 && hue < 345) {
    return 'pink';
  }
  
  return 'gray';
}

/**
 * Extract color from an object, handling different field names.
 * Returns human-readable color names by analyzing RGB values.
 */
function extractColor(obj: WhiteboardObject): string {
  let hexColor: string | null = null;
  
  // Sticky notes use 'color' field
  if (obj.type === 'sticky' && 'color' in obj) {
    hexColor = obj.color as string;
  }
  // Shapes use 'fill' or 'color' field
  else if ('fill' in obj && typeof obj.fill === 'string') {
    hexColor = obj.fill;
  }
  else if ('color' in obj && typeof obj.color === 'string') {
    hexColor = obj.color as string;
  }

  // Frames and lines don't have fill colors
  if (obj.type === 'frame' || obj.type === 'line') {
    return 'none';
  }

  // If we have a hex color, convert it to a color name
  if (hexColor) {
    const rgb = hexToRgb(hexColor);
    if (rgb) {
      return rgbToColorName(rgb.r, rgb.g, rgb.b);
    }
  }

  return 'unknown';
}

// ── Utilities ───────────────────────────────────────────────

/**
 * Find the nearest anchor points between two objects.
 * Returns the anchor positions and their coordinates.
 */
function findNearestAnchorsBetweenObjects(
  fromObj: WhiteboardObject,
  toObj: WhiteboardObject
): {
  fromAnchor: AnchorPosition;
  toAnchor: AnchorPosition;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
} {
  const fromAnchors = getAnchorPoints(fromObj);
  const toAnchors = getAnchorPoints(toObj);

  let minDistance = Infinity;
  let bestFromAnchor: AnchorPosition = 'right';
  let bestToAnchor: AnchorPosition = 'left';
  let bestFromPoint = { x: 0, y: 0 };
  let bestToPoint = { x: 0, y: 0 };

  // Find the pair of anchors with minimum distance
  for (const fromAnchor of fromAnchors) {
    for (const toAnchor of toAnchors) {
      const dx = toAnchor.x - fromAnchor.x;
      const dy = toAnchor.y - fromAnchor.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        bestFromAnchor = fromAnchor.anchor;
        bestToAnchor = toAnchor.anchor;
        bestFromPoint = { x: fromAnchor.x, y: fromAnchor.y };
        bestToPoint = { x: toAnchor.x, y: toAnchor.y };
      }
    }
  }

  return {
    fromAnchor: bestFromAnchor,
    toAnchor: bestToAnchor,
    fromPoint: bestFromPoint,
    toPoint: bestToPoint,
  };
}

function getObjectCenter(obj: WhiteboardObject): { x: number; y: number } {
  if (obj.type === 'circle') {
    return { x: obj.x, y: obj.y };
  }
  if ('width' in obj && 'height' in obj) {
    return {
      x: obj.x + obj.width / 2,
      y: obj.y + obj.height / 2,
    };
  }
  return { x: obj.x, y: obj.y };
}

function truncate(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}
