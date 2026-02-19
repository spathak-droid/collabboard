/**
 * OpenAI function-calling tool definitions for AI board commands.
 *
 * Each tool maps to a whiteboard operation that the LLM can invoke.
 * The executor (executor.ts) translates these into Yjs CRUD calls.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// ── Tool argument types ─────────────────────────────────────

export interface CreateStickyNoteArgs {
  text: string;
  x?: number;
  y?: number;
  color?: 'yellow' | 'pink' | 'blue' | 'green' | 'orange';
}

export interface CreateTextArgs {
  text: string;
  x?: number;
  y?: number;
}

export interface CreateTextBubbleArgs {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CreateShapeArgs {
  type: 'rect' | 'circle' | 'triangle' | 'star';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface CreateFrameArgs {
  title: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CreateConnectorArgs {
  fromId: string;
  toId: string;
  style?: 'straight' | 'curved';
}

export interface MoveObjectArgs {
  objectId: string;
  x: number;
  y: number;
}

export interface ResizeObjectArgs {
  objectId: string;
  width: number;
  height: number;
}

export interface UpdateTextArgs {
  objectId: string;
  newText: string;
}

export interface ChangeColorArgs {
  objectId: string;
  color: string;
}

export interface DeleteObjectArgs {
  objectIds: string[];
}

export interface ArrangeInGridArgs {
  objectIds: string[];
}

export interface AnalyzeObjectsArgs {
  objectIds?: string[];
}

// getBoardState and analyzeObjects take no/optional arguments — read-only tools

export type ToolName =
  | 'createStickyNote'
  | 'createText'
  | 'createTextBubble'
  | 'createShape'
  | 'createFrame'
  | 'createConnector'
  | 'moveObject'
  | 'resizeObject'
  | 'updateText'
  | 'changeColor'
  | 'deleteObject'
  | 'getBoardState'
  | 'arrangeInGrid'
  | 'analyzeObjects';

export type ToolArgs =
  | CreateStickyNoteArgs
  | CreateTextArgs
  | CreateTextBubbleArgs
  | CreateShapeArgs
  | CreateFrameArgs
  | CreateConnectorArgs
  | MoveObjectArgs
  | ResizeObjectArgs
  | UpdateTextArgs
  | ChangeColorArgs
  | DeleteObjectArgs
  | ArrangeInGridArgs
  | AnalyzeObjectsArgs
  | Record<string, never>; // getBoardState

export interface ParsedToolCall {
  id: string;
  name: ToolName;
  arguments: ToolArgs;
}

// ── OpenAI tool schemas ─────────────────────────────────────

export const AI_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'createStickyNote',
      description:
        'Create a sticky note on the whiteboard. Use for brainstorming items, ideas, labels, or any text-based card.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text content of the sticky note',
          },
          x: {
            type: 'number',
            description:
              'X position on canvas in pixels. If omitted, auto-placed.',
          },
          y: {
            type: 'number',
            description:
              'Y position on canvas in pixels. If omitted, auto-placed.',
          },
          color: {
            type: 'string',
            enum: ['yellow', 'pink', 'blue', 'green', 'orange'],
            description: 'Sticky note color. Defaults to yellow.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createShape',
      description:
        'Create a geometric shape (rectangle, circle, triangle, or star) on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rect', 'circle', 'triangle', 'star'],
            description: 'Shape type',
          },
          x: {
            type: 'number',
            description: 'X position on canvas in pixels',
          },
          y: {
            type: 'number',
            description: 'Y position on canvas in pixels',
          },
          width: {
            type: 'number',
            description: 'Width in pixels (default 150)',
          },
          height: {
            type: 'number',
            description: 'Height in pixels (default 150)',
          },
          color: {
            type: 'string',
            description:
              'Fill color as hex string (e.g. "#3B82F6") or color name',
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createFrame',
      description:
        'Create a frame (grouping container) on the whiteboard. Frames visually group objects and have a title label.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Frame title / label',
          },
          x: {
            type: 'number',
            description: 'X position on canvas in pixels',
          },
          y: {
            type: 'number',
            description: 'Y position on canvas in pixels',
          },
          width: {
            type: 'number',
            description: 'Width in pixels (default 400)',
          },
          height: {
            type: 'number',
            description: 'Height in pixels (default 400)',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createConnector',
      description:
        'Create a line/connector between two existing objects on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          fromId: {
            type: 'string',
            description: 'ID of the source object',
          },
          toId: {
            type: 'string',
            description: 'ID of the target object',
          },
          style: {
            type: 'string',
            enum: ['straight', 'curved'],
            description: 'Connector style (default straight)',
          },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moveObject',
      description:
        'Move an existing object to a new position on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to move',
          },
          x: {
            type: 'number',
            description: 'New X position in pixels',
          },
          y: {
            type: 'number',
            description: 'New Y position in pixels',
          },
        },
        required: ['objectId', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resizeObject',
      description: 'Resize an existing object on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to resize',
          },
          width: {
            type: 'number',
            description: 'New width in pixels',
          },
          height: {
            type: 'number',
            description: 'New height in pixels',
          },
        },
        required: ['objectId', 'width', 'height'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateText',
      description:
        'Update the text content of an existing sticky note or text element.',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to update',
          },
          newText: {
            type: 'string',
            description: 'New text content',
          },
        },
        required: ['objectId', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeColor',
      description:
        'Change the color of an existing object. For sticky notes use color names (yellow, pink, blue, green, orange). For shapes use hex colors.',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to recolor',
          },
          color: {
            type: 'string',
            description:
              'New color — a name (yellow, pink, blue, green, orange) for sticky notes, or a hex string for shapes',
          },
        },
        required: ['objectId', 'color'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBoardState',
      description:
        'Retrieve the current state of all objects on the whiteboard. Use this when you need to know what already exists before making changes (e.g. "move all pink sticky notes", "resize the frame").',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arrangeInGrid',
      description:
        'Arrange the selected objects into an evenly spaced grid. Use when the user says "arrange in grid", "arrange these in a grid", "organize in a grid", etc. The layout engine computes positions deterministically.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to arrange (the selected objects)',
          },
        },
        required: ['objectIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeObjects',
      description:
        'Analyze and count objects by type and color. Use when the user asks "how many", "count", "analyze", "show me statistics", etc. Returns structured counts with human-readable color names (automatically converted from hex by analyzing RGB values).',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of object IDs to analyze. If empty or omitted, analyzes all objects on the board.',
          },
        },
        required: [],
      },
    },
  },
];
