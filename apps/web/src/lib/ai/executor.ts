/**
 * Client-side executor that translates parsed AI tool calls into
 * concrete Yjs CRUD operations on the whiteboard.
 *
 * Each tool call is mapped to createObject / updateObject / deleteObject
 * calls exposed by the useYjs hook.
 */

import { generateId } from '@/lib/utils/geometry';
import { STICKY_COLORS } from '@/types/canvas';
import type {
  WhiteboardObject,
  StickyNote,
  RectShape,
  CircleShape,
  TriangleShape,
  StarShape,
  LineShape,
  Frame,
} from '@/types/canvas';
import type {
  ParsedToolCall,
  CreateStickyNoteArgs,
  CreateShapeArgs,
  CreateFrameArgs,
  CreateConnectorArgs,
  MoveObjectArgs,
  ResizeObjectArgs,
  UpdateTextArgs,
  ChangeColorArgs,
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
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? STICKY_COLORS.YELLOW;
}

function resolveShapeColor(color?: string): string {
  if (!color) return '#E5E7EB';
  if (color.startsWith('#')) return color;
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? '#E5E7EB';
}

// ── CRUD interface (matches useYjs hook shape) ──────────────

export interface BoardOperations {
  createObject: (obj: WhiteboardObject) => void;
  updateObject: (id: string, data: Partial<WhiteboardObject>) => void;
  deleteObjects: (ids: string[]) => void;
  objects: WhiteboardObject[];
  userId: string;
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
): ExecutionResult {
  const createdIds: string[] = [];
  const modifiedIds: string[] = [];
  const descriptions: string[] = [];

  let nextZIndex = ops.objects.length;

  for (const call of toolCalls) {
    switch (call.name) {
      case 'createStickyNote': {
        const args = call.arguments as CreateStickyNoteArgs;
        const id = generateId();
        const obj: StickyNote = {
          id,
          type: 'sticky',
          x: args.x ?? 200 + createdIds.length * 220,
          y: args.y ?? 200,
          width: 200,
          height: 200,
          color: resolveStickyColor(args.color),
          text: args.text,
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        ops.createObject(obj);
        createdIds.push(id);
        descriptions.push(`Created sticky note "${truncate(args.text)}"`);
        break;
      }

      case 'createShape': {
        const args = call.arguments as CreateShapeArgs;
        const id = generateId();
        const baseFields = {
          id,
          x: args.x ?? 200 + createdIds.length * 170,
          y: args.y ?? 200,
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };

        if (args.type === 'circle') {
          const radius = Math.round(
            ((args.width ?? 150) + (args.height ?? 150)) / 4,
          );
          const obj: CircleShape = {
            ...baseFields,
            type: 'circle',
            radius,
            fill: resolveShapeColor(args.color),
            stroke: '#000000',
            strokeWidth: 2,
          };
          ops.createObject(obj);
        } else if (args.type === 'triangle') {
          const obj: TriangleShape = {
            ...baseFields,
            type: 'triangle',
            width: args.width ?? 150,
            height: args.height ?? 150,
            fill: resolveShapeColor(args.color),
            stroke: '#000000',
            strokeWidth: 2,
          };
          ops.createObject(obj);
        } else if (args.type === 'star') {
          const obj: StarShape = {
            ...baseFields,
            type: 'star',
            width: args.width ?? 150,
            height: args.height ?? 150,
            fill: resolveShapeColor(args.color),
            stroke: '#000000',
            strokeWidth: 2,
          };
          ops.createObject(obj);
        } else {
          const obj: RectShape = {
            ...baseFields,
            type: 'rect',
            width: args.width ?? 150,
            height: args.height ?? 150,
            fill: resolveShapeColor(args.color),
            stroke: '#000000',
            strokeWidth: 2,
          };
          ops.createObject(obj);
        }

        createdIds.push(id);
        descriptions.push(`Created ${args.type} shape`);
        break;
      }

      case 'createFrame': {
        const args = call.arguments as CreateFrameArgs;
        const id = generateId();
        const obj: Frame = {
          id,
          type: 'frame',
          x: args.x ?? 100,
          y: args.y ?? 100,
          width: args.width ?? 400,
          height: args.height ?? 400,
          stroke: '#6B7280',
          strokeWidth: 2,
          containedObjectIds: [],
          name: args.title,
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        ops.createObject(obj);
        createdIds.push(id);
        descriptions.push(`Created frame "${args.title}"`);
        break;
      }

      case 'createConnector': {
        const args = call.arguments as CreateConnectorArgs;
        const fromObj = ops.objects.find((o) => o.id === args.fromId);
        const toObj = ops.objects.find((o) => o.id === args.toId);

        if (!fromObj || !toObj) {
          descriptions.push(
            'Could not create connector — source or target object not found',
          );
          break;
        }

        const fromCenter = getObjectCenter(fromObj);
        const toCenter = getObjectCenter(toObj);

        const id = generateId();
        const obj: LineShape = {
          id,
          type: 'line',
          x: 0,
          y: 0,
          points: [fromCenter.x, fromCenter.y, toCenter.x, toCenter.y],
          stroke: '#000000',
          strokeWidth: 2,
          startAnchor: { objectId: args.fromId, anchor: 'right' },
          endAnchor: { objectId: args.toId, anchor: 'left' },
          rotation: 0,
          zIndex: nextZIndex++,
          createdBy: ops.userId,
          createdAt: Date.now(),
        };
        ops.createObject(obj);
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

      case 'updateText': {
        const args = call.arguments as UpdateTextArgs;
        const target = ops.objects.find((o) => o.id === args.objectId);
        if (!target) {
          descriptions.push(
            `Could not update text — ID "${args.objectId}" not found`,
          );
          break;
        }
        ops.updateObject(args.objectId, {
          text: args.newText,
        } as Partial<WhiteboardObject>);
        modifiedIds.push(args.objectId);
        descriptions.push(`Updated text to "${truncate(args.newText)}"`);
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
          ops.updateObject(args.objectId, {
            color: resolveStickyColor(args.color),
          } as Partial<WhiteboardObject>);
        } else if ('fill' in target) {
          ops.updateObject(args.objectId, {
            fill: resolveShapeColor(args.color),
          } as Partial<WhiteboardObject>);
        }
        modifiedIds.push(args.objectId);
        descriptions.push(`Changed color to ${args.color}`);
        break;
      }

      case 'getBoardState': {
        descriptions.push(
          `Read board state (${ops.objects.length} objects)`,
        );
        break;
      }

      default:
        descriptions.push(`Unknown tool: ${call.name}`);
    }
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

// ── Utilities ───────────────────────────────────────────────

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
