/**
 * Plan Schema — the contract between the Planner LLM and the Layout Engine.
 *
 * The LLM outputs a CompositionPlan (WHAT to create, and optionally WHERE).
 * For structured layouts (columns, grid, flow) the engine computes positions.
 * For layout="freeform" the LLM MUST provide x,y on each child — the agent
 * figures out constraints and placement, then outputs that JSON.
 */

// ── Layout types ────────────────────────────────────────────
// Each layout tells the engine how to arrange children spatially.

export const LAYOUT_TYPES = [
  'columns',          // Side-by-side columns (kanban, retro boards)
  'stack_vertical',   // Top-to-bottom stacking (buildings, timelines)
  'stack_horizontal', // Left-to-right stacking (pipelines)
  'grid',             // Rows × columns matrix (dashboards, SWOT)
  'radial',           // Circle around a center node (mind maps)
  'flow_horizontal',  // Left-to-right with connectors (flowcharts)
  'flow_vertical',    // Top-to-bottom with connectors (org charts)
  'freeform',         // Agent provides x,y for each child (placement JSON from the agent)
];

// ── Node types ──────────────────────────────────────────────
// Leaf nodes map 1:1 to whiteboard primitives.
// Container nodes (column, group, composition) hold children.

export const NODE_TYPES = [
  'sticky',       // Sticky note (200×200, colored)
  'shape',        // Geometric shape (rect, circle, triangle, star)
  'text',         // Plain floating text
  'textBubble',   // Text inside a bordered box
  'frame',        // Frame container with title
  'column',       // Virtual grouping — rendered as a frame column
  'group',        // Virtual grouping — no visual frame, just layout
  'composition',  // Top-level plan root
];

// ── Color names the LLM can use ─────────────────────────────
// The layout engine resolves these to hex codes.

export const STICKY_COLOR_MAP = {
  yellow: '#FFF59D',
  pink: '#F48FB1',
  blue: '#81D4FA',
  green: '#A5D6A7',
  orange: '#FFCC80',
};

export const SHAPE_COLOR_MAP = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#10B981',
  purple: '#A855F7',
  orange: '#F97316',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
  cyan: '#06B6D4',
  teal: '#14B8A6',
  indigo: '#6366F1',
  pink: '#EC4899',
  amber: '#F59E0B',
  lime: '#84CC16',
  black: '#000000',
  white: '#FFFFFF',
  brown: '#92400E',
};

// ── OpenAI function-calling tool definition ─────────────────
// This is the single tool the Planner LLM calls.

export const CREATE_PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'createPlan',
    description: 'Output a composition plan. For layout=freeform you MUST provide x,y (pixels) on every child — you figure out constraints and placement, then output that JSON. For other layouts the engine computes positions.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Human-readable title for the composition (e.g., "Kanban Board", "Building")',
        },
        layout: {
          type: 'string',
          enum: LAYOUT_TYPES,
          description: 'How to arrange the top-level children spatially',
        },
        wrapInFrame: {
          type: 'boolean',
          description: 'Whether to wrap the entire composition in a frame. Default true for structured layouts (columns, grid), false for freeform.',
        },
        children: {
          type: 'array',
          description: 'The objects or groups to create',
          items: {
            $ref: '#/$defs/PlanNode',
          },
        },
      },
      required: ['title', 'layout', 'children'],
      $defs: {
        PlanNode: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: NODE_TYPES,
              description: 'Node type: sticky, shape, text, textBubble, frame, column, group',
            },
            // Leaf node fields
            text: {
              type: 'string',
              description: 'Text content (for sticky, text, textBubble, shape label)',
            },
            color: {
              type: 'string',
              description: 'Color name (yellow, pink, blue, green, orange for stickies; red, blue, green, purple, etc. for shapes). Use "random" for varied colors.',
            },
            shape: {
              type: 'string',
              enum: ['rect', 'circle', 'triangle', 'star'],
              description: 'Shape subtype (only for type="shape")',
            },
            aspect: {
              type: 'string',
              enum: ['square', 'wide', 'tall', 'tall_narrow', 'small', 'large'],
              description: 'Size hint for the layout engine. Default is "square".',
            },
            x: {
              type: 'number',
              description: 'X position in pixels. REQUIRED for every child when layout=freeform (agent provides placement JSON). Top-left origin. Omit for non-freeform layouts.',
            },
            y: {
              type: 'number',
              description: 'Y position in pixels. REQUIRED for every child when layout=freeform (agent provides placement JSON). Top-left origin. Omit for non-freeform layouts.',
            },
            // Container node fields
            title: {
              type: 'string',
              description: 'Title for frame or column containers',
            },
            layout: {
              type: 'string',
              enum: LAYOUT_TYPES,
              description: 'Layout for children of this container node',
            },
            children: {
              type: 'array',
              description: 'Child nodes (for column, group, frame, composition)',
              items: {
                $ref: '#/$defs/PlanNode',
              },
            },
            // Connector hint
            connectTo: {
              type: 'string',
              description: 'Connect this node to the NEXT sibling with a connector line. Value is the connector style: "straight" or "curved".',
            },
            // Optional branch (e.g. error/failure path) from this node
            branch: {
              type: 'object',
              description: 'Optional side branch from this node (e.g. "if email fails", "did not receive link" → ERROR). Layout engine places it to the side/up/down based on main flow.',
              properties: {
                direction: {
                  type: 'string',
                  enum: ['down', 'up', 'left', 'right'],
                  description: 'Where to draw the branch relative to main flow: "down" for flow_horizontal (branch below), "right"/"left" for flow_vertical.',
                },
                steps: {
                  type: 'array',
                  description: 'Nodes in the branch (e.g. condition then error). Each step is connected in order; first step connects from this node.',
                  items: { $ref: '#/$defs/PlanNode' },
                },
              },
              required: ['direction', 'steps'],
            },
          },
          required: ['type'],
        },
      },
    },
  },
};
