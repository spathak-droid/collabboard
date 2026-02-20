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
} from './tools';

// ── Helpers ─────────────────────────────────────────────────

const COLOR_NAME_TO_HEX: Record<string, string> = {
  yellow: STICKY_COLORS.YELLOW,
  pink: STICKY_COLORS.PINK,
  blue: STICKY_COLORS.BLUE,
  green: STICKY_COLORS.GREEN,
  orange: STICKY_COLORS.ORANGE,
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
  objects: WhiteboardObject[];
  userId: string;
}

export interface ExecuteToolCallsOptions {
  selectionArea?: { x: number; y: number; width: number; height: number } | null;
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
        const id = generateId();
        
        let pos: { x: number; y: number };
        if (hasExplicitCoordinates(args)) {
          // Explicit coordinates provided - use them directly (user's exact request)
          pos = { x: args.x!, y: args.y! };
        } else {
          // No coordinates provided - use smart placement to avoid overlaps
          // Uses cached boxes for better performance
          pos = findFreePositionWithBoxes(getPlacementBoxes(), 200, 200);
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
        // Add to tempObjects BEFORE next iteration (for collision detection)
        tempObjects.push(obj);
        // Queue for batch creation
        objectsToCreate.push(obj);
        createdIds.push(id);
        descriptions.push(`Created sticky note "${truncate(args.text)}"`);
        break;
      }

      case 'createText': {
        const args = call.arguments as CreateTextArgs;
        const id = generateId();
        
        // Text has no dimensions, use small area for collision detection
        const pos = hasExplicitCoordinates(args)
          ? { x: args.x!, y: args.y! }
          : findFreePositionWithBoxes(getPlacementBoxes(), 100, 30);
        
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
        const id = generateId();
        
        const width = args.width || 200;
        const height = args.height || 100;
        
        // Find free position if x/y not specified
        const pos = hasExplicitCoordinates(args)
          ? { x: args.x!, y: args.y! }
          : findFreePositionWithBoxes(getPlacementBoxes(), width, height);
        
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
        const id = generateId();
        
        // Determine dimensions for placement calculation
        const width = args.width ?? 150;
        const height = args.height ?? 150;
        const radius = args.type === 'circle' ? Math.round((width + height) / 4) : 0;
        const placementSize = args.type === 'circle' ? radius * 2 : width;
        
        let pos: { x: number; y: number };
        if (hasExplicitCoordinates(args)) {
          // Explicit coordinates provided - use them directly (user's exact request)
          pos = { x: args.x!, y: args.y! };
        } else {
          // No coordinates provided - use smart placement to avoid overlaps
          // Uses cached boxes for better performance
          pos = findFreePositionWithBoxes(getPlacementBoxes(), placementSize, placementSize);
          
          // CRITICAL FIX: Circles use center-based coordinates, not top-left
          // findFreePositionWithBoxes returns top-left position of bounding box
          // For circles, we need to offset to the center point
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
          } as CircleShape;
          // Queued for batch creation
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
          } as TriangleShape;
          // Queued for batch creation
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
          } as StarShape;
          // Queued for batch creation
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
          } as RectShape;
          // Queued for batch creation
          objectsToCreate.push(createdObj);
        }

        tempObjects.push(createdObj); // Track for collision detection
        createdIds.push(id);
        descriptions.push(`Created ${args.type} shape`);
        break;
      }

      case 'createFrame': {
        const args = call.arguments as CreateFrameArgs;
        const id = generateId();
        
        let width = args.width ?? 400;
        let height = args.height ?? 400;
        let x = args.x;
        let y = args.y;
        let containedIds: string[] = [];
        
        // If large frame (suggesting "include all objects"), calculate bounds
        const allObjs = getAllObjects().filter(o => o.type !== 'line');
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
        } else if (x !== undefined && y !== undefined) {
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
          const pos = findFreePositionWithBoxes(getPlacementBoxes(), width, height, 100, 100);
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
        ops.updateObject(args.objectId, { x: args.x, y: args.y });
        modifiedIds.push(args.objectId);
        descriptions.push(`Moved object to (${args.x}, ${args.y})`);
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
        console.log('[changeColor] Received args:', JSON.stringify(args));
        console.log('[changeColor] Color value:', args.color, 'Length:', args.color?.length);
        
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not change color — ID "${args.objectId}" not found`,
          );
          break;
        }

        if (target.type === 'sticky') {
          const resolvedColor = resolveStickyColor(args.color);
          console.log(`[changeColor] Sticky: ${args.color} → ${resolvedColor} (Length: ${resolvedColor.length})`);
          ops.updateObject(args.objectId, {
            color: resolvedColor,
          } as Partial<WhiteboardObject>);
        } else if (target.type === 'frame') {
          const resolvedColor = resolveShapeColor(args.color);
          console.log(`[changeColor] Frame: ${args.color} → ${resolvedColor} (Length: ${resolvedColor.length})`);
          // Frames: fill is the background color
          ops.updateObject(args.objectId, {
            fill: resolvedColor,
          } as Partial<WhiteboardObject>);
        } else if ('fill' in target) {
          const resolvedColor = resolveShapeColor(args.color);
          console.log(`[changeColor] Shape: ${args.color} → ${resolvedColor} (Length: ${resolvedColor.length})`);
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
        const validIds = ids.filter((id) =>
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
        const result = runArrangeInGrid(args.objectIds, ops, options?.selectionArea ?? null, false);
        modifiedIds.push(...result.modifiedIds);
        descriptions.push(result.summary);
        break;
      }

      case 'arrangeInGridAndResize': {
        const args = call.arguments as ArrangeInGridArgs;
        const result = runArrangeInGrid(args.objectIds, ops, options?.selectionArea ?? null, true);
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
        const frameData = frame as any;
        
        if (frameData.containedObjectIds && Array.isArray(frameData.containedObjectIds) && frameData.containedObjectIds.length > 0) {
          // Use the frame's tracked contained object IDs
          containedObjects = ops.objects.filter((obj) => 
            frameData.containedObjectIds.includes(obj.id) && obj.type !== 'line'
          );
        } else {
          // Strategy 2: Find objects that overlap or are inside the frame bounds
          const frameX = frame.x;
          const frameY = frame.y;
          const frameWidth = frameData.width || 0;
          const frameHeight = frameData.height || 0;
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
        
        console.log(`[fitFrameToContents] Resized frame ${args.frameId} to ${Math.round(newWidth)}×${Math.round(newHeight)}`);
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
): { modifiedIds: string[]; summary: string } {
  const modifiedIds: string[] = [];
  const objects = objectIds
    .map((id) => ops.objects.find((o) => o.id === id))
    .filter((o): o is WhiteboardObject => o != null && o.type !== 'line');

  if (objects.length === 0) {
    return { modifiedIds, summary: 'No valid objects to arrange' };
  }

  const N = objects.length;
  const columns = N <= 4 ? 2 : N <= 9 ? 3 : Math.ceil(Math.sqrt(N));
  const rows = Math.ceil(N / columns);

  // Create map for bounds calculations
  const objectMap = new Map<string, WhiteboardObject>(
    ops.objects.map((obj) => [obj.id, obj])
  );

  // Compute bounding box using proper bounds calculation
  let boundingBox: { x: number; y: number; width: number; height: number };
  if (selectionArea && selectionArea.width > 0 && selectionArea.height > 0) {
    boundingBox = selectionArea;
  } else {
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
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i];
    const rowIndex = Math.floor(i / columns);
    const colIndex = i % columns;
    
    // Calculate cell position with gaps
    const cellX = boundingBox.x + colIndex * (cellWidth + GAP);
    const cellY = boundingBox.y + rowIndex * (cellHeight + GAP);
    
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
