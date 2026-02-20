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
  quantity?: number; // Optional: create multiple sticky notes
  rows?: number; // Optional: explicit grid rows (e.g., "7x2 grid" = rows:7)
  columns?: number; // Optional: explicit grid columns (e.g., "7x2 grid" = columns:2)
}

export interface CreateTextArgs {
  text: string;
  x?: number;
  y?: number;
  quantity?: number; // Optional: create multiple text objects
  rows?: number; // Optional: explicit grid rows (e.g., "4x2 grid" = rows:4)
  columns?: number; // Optional: explicit grid columns (e.g., "4x2 grid" = columns:2)
}

export interface CreateTextBubbleArgs {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  quantity?: number; // Optional: create multiple text bubbles
  rows?: number; // Optional: explicit grid rows (e.g., "4x2 grid" = rows:4)
  columns?: number; // Optional: explicit grid columns (e.g., "4x2 grid" = columns:2)
}

export interface CreateShapeArgs {
  type: 'rect' | 'circle' | 'triangle' | 'star';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  text?: string; // Optional text label to display inside the shape
  quantity?: number; // Optional: create multiple shapes
  rows?: number; // Optional: explicit grid rows (e.g., "4x2 grid" = rows:4)
  columns?: number; // Optional: explicit grid columns (e.g., "4x2 grid" = columns:2)
}

export interface CreateFrameArgs {
  title: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  quantity?: number; // Optional: create multiple frames
  rows?: number; // Optional: explicit grid rows (e.g., "4x2 grid" = rows:4)
  columns?: number; // Optional: explicit grid columns (e.g., "4x2 grid" = columns:2)
}

export interface CreateConnectorArgs {
  fromId: string;
  toId: string;
  style?: 'straight' | 'curved';
}

export interface MoveObjectArgs {
  objectId: string;
  x?: number;
  y?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
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
  frameId?: string; // Optional: arrange within this frame's bounds
  rows?: number; // Optional: explicit number of rows
  columns?: number; // Optional: explicit number of columns
}

export interface AnalyzeObjectsArgs {
  objectIds?: string[];
}

export interface FitFrameToContentsArgs {
  frameId: string;
  padding?: number;
}

export interface CreateSWOTAnalysisArgs {
  quadrants?: number;
  shape?: 'rect' | 'circle' | 'triangle' | 'star';
  x?: number;
  y?: number;
  color?: string;
  withFrame?: boolean;
}

export interface CreateUserJourneyMapArgs {
  stages: string[];
  x?: number;
  y?: number;
  orientation?: 'horizontal' | 'vertical';
}

export interface CreateRetrospectiveBoardArgs {
  columns?: string[];
  notesPerColumn?: number;
  noteContents?: string[][]; // Optional: 2D array of note contents [column][note]
  x?: number;
  y?: number;
}

export interface CreateProsConsBoardArgs {
  topic?: string;
  prosCount?: number;
  consCount?: number;
  prosContent?: string[];
  consContent?: string[];
  x?: number;
  y?: number;
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
  | 'rotateObject'
  | 'updateText'
  | 'changeColor'
  | 'deleteObject'
  | 'getBoardState'
  | 'arrangeInGrid'
  | 'arrangeInGridAndResize'
  | 'fitFrameToContents'
  | 'analyzeObjects'
  | 'createSWOTAnalysis'
  | 'createUserJourneyMap'
  | 'createRetrospectiveBoard'
  | 'createProsConsBoard';

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
  | FitFrameToContentsArgs
  | AnalyzeObjectsArgs
  | CreateSWOTAnalysisArgs
  | CreateUserJourneyMapArgs
  | CreateRetrospectiveBoardArgs
  | CreateProsConsBoardArgs
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
        'Create sticky note(s) on the whiteboard. Use for brainstorming items, ideas, labels. Can create multiple notes at once in a grid layout.',
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
          quantity: {
            type: 'number',
            description: 'Number of sticky notes to create. Use when user specifies a count (e.g., "create 10 pink notes").',
          },
          rows: {
            type: 'number',
            description: 'Explicit number of rows for grid layout (e.g., "7x2 grid" = rows:7). Only used with quantity > 1.',
          },
          columns: {
            type: 'number',
            description: 'Explicit number of columns for grid layout (e.g., "7x2 grid" = columns:2). Only used with quantity > 1.',
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
        'Create geometric shape(s) (rectangle, circle, triangle, or star) with OPTIONAL text label inside. Shapes can have text labels built-in - no need for separate text objects. Can create multiple shapes at once in a grid layout.',
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
          text: {
            type: 'string',
            description:
              'Optional text label to display INSIDE the shape. Use this to label circles (e.g., planet names), rectangles (e.g., stage names), etc. No need to create separate text objects.',
          },
          quantity: {
            type: 'number',
            description: 'Number of shapes to create. Use when user specifies a count (e.g., "create 8 stars").',
          },
          rows: {
            type: 'number',
            description: 'Explicit number of rows for grid layout (e.g., "4x2 grid" = rows:4). Only used with quantity > 1.',
          },
          columns: {
            type: 'number',
            description: 'Explicit number of columns for grid layout (e.g., "4x2 grid" = columns:2). Only used with quantity > 1.',
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
        'Create a frame (visual container) to organize and group objects on the whiteboard. Use this when the user asks to "organize", "group", "put things in sections/categories", or "create sections". When created by AI, frames automatically contain objects within their bounds. For simple "draw a frame" commands without grouping intent, the user will draw it manually. Only use this tool when there is clear intent to organize or group existing objects.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Frame title / label (e.g., "Ideas", "Done", "In Progress")',
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
            description: 'Width in pixels (default 400). Use large values (1000+) to encompass all objects when organizing the entire board.',
          },
          height: {
            type: 'number',
            description: 'Height in pixels (default 400). Use large values (800+) to encompass all objects when organizing the entire board.',
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
        'Move an existing object to a new position. Supports absolute positioning (x, y) or directional movement (left, right, up, down). Use direction for commands like "move right" or "shift left".',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to move',
          },
          x: {
            type: 'number',
            description: 'New X position in pixels (absolute positioning)',
          },
          y: {
            type: 'number',
            description: 'New Y position in pixels (absolute positioning)',
          },
          direction: {
            type: 'string',
            enum: ['left', 'right', 'up', 'down'],
            description: 'Direction to move the object relative to viewport (use this for "move right", "shift left", etc.)',
          },
        },
        required: ['objectId'],
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
      name: 'rotateObject',
      description: 'Rotate an existing object by a specified angle. Use when user says "rotate X by Y degrees" or "rotate 30 degrees".',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to rotate',
          },
          rotation: {
            type: 'number',
            description: 'Rotation angle in degrees (0-360)',
          },
        },
        required: ['objectId', 'rotation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateText',
      description:
        'Update the text content of an existing sticky note, text element, text bubble, or frame name.',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to update',
          },
          newText: {
            type: 'string',
            description: 'New text content (or frame name for frames)',
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
        'Arrange the selected objects into an evenly spaced grid (positions only, keeps original sizes). Use when the user says "arrange in grid", "space them evenly", "organize in a grid", etc. Can optionally arrange within a frame\'s bounds.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to arrange (the selected objects)',
          },
          frameId: {
            type: 'string',
            description: 'Optional: ID of frame to arrange objects within. If provided, arranges objects to fit within this frame\'s bounds.',
          },
          rows: {
            type: 'number',
            description: 'Optional: Explicit number of rows. Use when user specifies like "1x5 grid" (1 row) or "2x3 grid" (2 rows).',
          },
          columns: {
            type: 'number',
            description: 'Optional: Explicit number of columns. Use when user specifies like "1x5 grid" (5 columns) or "2x3 grid" (3 columns).',
          },
        },
        required: ['objectIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arrangeInGridAndResize',
      description:
        'Arrange objects in a grid AND resize them to perfectly fit the selection area or frame. Use when the user says "resize and space them evenly", "resize to fit", "make them the same size and space evenly", etc.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to arrange and resize',
          },
          frameId: {
            type: 'string',
            description: 'Optional: ID of frame to arrange objects within. If provided, resizes and arranges objects to fit within this frame\'s bounds.',
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
  {
    type: 'function',
    function: {
      name: 'fitFrameToContents',
      description:
        'Automatically resize a frame to fit all objects contained within it, with proper padding. Use when the user says "resize to fit contents", "fit to contents", "resize frame to fit", "make frame fit the objects", "extend frame to fit", or similar. This tool automatically calculates the bounding box of all objects inside the frame and resizes it with padding.',
      parameters: {
        type: 'object',
        properties: {
          frameId: {
            type: 'string',
            description: 'ID of the frame to resize',
          },
          padding: {
            type: 'number',
            description: 'Padding in pixels around the contents (default 40)',
          },
        },
        required: ['frameId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createSWOTAnalysis',
      description:
        'Create a SWOT analysis or structured matrix with sticky notes arranged in a grid. Creates quadrants number of sticky notes (default 4 for 2x2 matrix) with optional shapes and frame wrapping. All objects are created in a single tool call and arranged in matrix form.',
      parameters: {
        type: 'object',
        properties: {
          quadrants: {
            type: 'number',
            description: 'Number of quadrants (default 4 for 2x2 matrix). Supports 4, 6, 9, etc. for different grid sizes.',
          },
          shape: {
            type: 'string',
            enum: ['rect', 'circle', 'triangle', 'star'],
            description: 'Optional shape to create instead of sticky notes',
          },
          x: {
            type: 'number',
            description: 'Starting X position (random if not specified)',
          },
          y: {
            type: 'number',
            description: 'Starting Y position (random if not specified)',
          },
          color: {
            type: 'string',
            description: 'Color for objects (random if not specified). Use hex for shapes, color names for sticky notes.',
          },
          withFrame: {
            type: 'boolean',
            description: 'Whether to wrap the matrix with a frame (default true)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createUserJourneyMap',
      description:
        'Create a user journey map with labeled stages connected by lines. The AI generates appropriate stage names based on the user\'s request (e.g., "Awareness", "Consideration", "Purchase", "Retention", "Advocacy"). Creates colored rectangles for each stage with text labels and connects them with lines to show flow.',
      parameters: {
        type: 'object',
        properties: {
          stages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of stage names/labels for the journey (e.g., ["Awareness", "Consideration", "Purchase", "Retention", "Advocacy"]). The AI should generate appropriate stage names based on context.',
          },
          x: {
            type: 'number',
            description: 'Starting X position (uses viewport center if not specified)',
          },
          y: {
            type: 'number',
            description: 'Starting Y position (uses viewport center if not specified)',
          },
          orientation: {
            type: 'string',
            enum: ['horizontal', 'vertical'],
            description: 'Layout orientation (default horizontal)',
          },
        },
        required: ['stages'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createRetrospectiveBoard',
      description:
        'Create a complete retrospective board with frames and sticky notes in ONE call. Creates vertical columns (frames) with sticky notes inside each. Default: 3 columns ("What Went Well", "What Didn\'t", "Action Items") with 3 sticky notes per column. You should generate appropriate example content for each note based on the column type.',
      parameters: {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of column names (default: ["What Went Well", "What Didn\'t", "Action Items"])',
          },
          notesPerColumn: {
            type: 'number',
            description: 'Number of sticky notes per column (default 3)',
          },
          noteContents: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
            description: 'Optional 2D array of note contents [column][note]. Generate example content for each note based on the column type. Example: [["Team collaboration", "Met deadlines"], ["Communication issues", "Technical debt"], ["Improve meetings", "Add tests"]]',
          },
          x: {
            type: 'number',
            description: 'Starting X position (uses viewport center if not specified)',
          },
          y: {
            type: 'number',
            description: 'Starting Y position (uses viewport center if not specified)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createProsConsBoard',
      description:
        'Create a Pros and Cons board with two columns of sticky notes in ONE call. You MUST generate contextually appropriate pros and cons based on the topic the user provides. For example, "pros and cons of remote work" should generate relevant pros like "flexibility" and cons like "isolation".',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The topic to analyze (e.g., "remote work", "electric cars", "AI in education")',
          },
          prosCount: {
            type: 'number',
            description: 'Number of pros to generate (default 3)',
          },
          consCount: {
            type: 'number',
            description: 'Number of cons to generate (default 3)',
          },
          prosContent: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of pros - YOU MUST generate these based on the topic. Example for "remote work": ["Flexible schedule", "No commute", "Better work-life balance"]',
          },
          consContent: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of cons - YOU MUST generate these based on the topic. Example for "remote work": ["Social isolation", "Communication challenges", "Harder to disconnect"]',
          },
          x: {
            type: 'number',
            description: 'Starting X position (uses viewport center if not specified)',
          },
          y: {
            type: 'number',
            description: 'Starting Y position (uses viewport center if not specified)',
          },
        },
        required: ['prosContent', 'consContent'],
      },
    },
  },
];
