/**
 * Hierarchical Agent System for Whiteboard AI
 * 
 * Architecture:
 * - Supervisor Agent: Breaks down user intent into tasks
 * - Worker Agents: Each specialized in one type of operation
 * 
 * Flow:
 * 1. User request → Supervisor
 * 2. Supervisor creates execution plan (list of tasks)
 * 3. Each task is routed to a specialized worker agent
 * 4. Workers execute their tasks sequentially
 * 5. Supervisor aggregates results and provides final response
 */

// ─────────────────────────────────────────────────────────────
// WORKER AGENTS - Each specialized in one operation type
// ─────────────────────────────────────────────────────────────

/**
 * Create Objects Agent
 * Specializes in: Creating sticky notes, shapes, frames
 */
export const CREATE_AGENT = {
  name: 'CreateAgent',
  description: 'Creates new objects on the whiteboard (sticky notes, shapes, frames)',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'createStickyNote',
        description: 'Create a sticky note (yellow/pink/blue/green/orange card with text)',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            color: { type: 'string', enum: ['yellow', 'pink', 'blue', 'green', 'orange'] },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createText',
        description: 'Create plain floating text without background',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createTextBubble',
        description: 'Create a text bubble (plain text box without background, different from sticky note)',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number', description: 'Width in pixels (default 200)' },
            height: { type: 'number', description: 'Height in pixels (default 100)' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createShape',
        description: 'Create a geometric shape',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['rect', 'circle', 'triangle', 'star'] },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            color: { type: 'string' },
          },
          required: ['type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createFrame',
        description: 'Create a frame container',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['title'],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Create Agent. Your ONLY job is to create objects on the whiteboard.

**Object Type Distinctions:**
- **Sticky notes**: Colored cards (yellow/pink/blue/green/orange) for ideas, brainstorming. Use createStickyNote.
- **Text**: Plain floating text without any background or border. Use createText.
- **Text bubbles**: Text inside a box with border. Use createTextBubble.
- **Shapes**: Geometric shapes (rect, circle, triangle, star). Use createShape.
- **Frames**: Container boxes for grouping objects. Use createFrame.

When given a task, call the appropriate creation tools. You MUST:
- Create objects exactly as specified in the task
- **For templates (SWOT, retro boards, journey maps)**: Create ALL elements in ONE response
  - SWOT: Create 4 sticky notes in 2x2 grid FIRST, then ONE frame around them
  - Sticky notes at: (150,150), (370,150), (150,370), (370,370) with labels "Strengths", "Weaknesses", "Opportunities", "Threats"
  - Then create ONE frame at (100,100) with width=500, height=500 to wrap all 4 notes
- **For grids (e.g., "2x3 grid", "3x2 layout")**: Calculate explicit x,y positions for each object
  - Sticky notes: Use 220px spacing (200px width + 20px gap)
  - Example 2x3 grid: positions at (100,100), (320,100), (100,320), (320,320), (100,540), (320,540)
  - Formula: x = startX + (col * 220), y = startY + (row * 220)
- Use smart auto-placement ONLY if positions aren't specified and it's NOT a grid or template
- For frames "that include all shapes" or "around all objects", set width/height to cover all objects (use large values like 1000x800 if unsure)
- ONLY call creation tools (createStickyNote, createText, createTextBubble, createShape, createFrame)
- Return the IDs of created objects for the next agent

DO NOT:
- Try to connect objects (that's the Connect Agent's job)
- Modify existing objects (that's the Modify Agent's job)
- Delete objects (that's the Delete Agent's job)

Focus on creation only.`,
};

/**
 * Connect Objects Agent
 * Specializes in: Creating connectors/lines between objects
 */
export const CONNECT_AGENT = {
  name: 'ConnectAgent',
  description: 'Creates connectors/lines between existing objects',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'createConnector',
        description: 'Create a line between two objects',
        parameters: {
          type: 'object',
          properties: {
            fromId: { type: 'string', description: 'Source object ID from board state' },
            toId: { type: 'string', description: 'Target object ID from board state' },
            style: { type: 'string', enum: ['straight', 'curved'] },
          },
          required: ['fromId', 'toId'],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Connect Agent. Your ONLY job is to create connectors/lines between objects.

IMPORTANT: You should ONLY be invoked when the user explicitly asks to:
- "Connect" objects
- "Draw a line between" objects
- "Link" objects together
- Create objects "connected by lines"

**Connection Patterns:**
- "Connect 3 circles to each other" or "connecting each other" or "from left to right" = Create a CHAIN (A→B, B→C), NOT all possible combinations
- "Connect A to B" = One line from A to B
- "Connect A, B, and C" = Chain them (A→B→C)
- For N objects, create N-1 connectors in sequence (chain pattern)
- "left to right" means connect in the order they appear in the board state

**CRITICAL: Only connect EXISTING objects. Do NOT create new objects.**
- If you see duplicate objects in the board state, only connect the FIRST set that matches the description
- Example: If board has 6 circles but task is "connect 3 circles", only use the first 3 circle IDs

DO NOT connect:
- Frames to shapes (frames are containers, not connected elements)
- Objects unless explicitly requested
- Every object to every other object (avoid fully connected graphs)
- Duplicate or extra objects beyond what was requested

When given a task, you will receive:
- The board state with all object IDs
- The IDs of objects to connect

You MUST:
- Use the ACTUAL object IDs from the board state
- Create connectors in a CHAIN pattern (object 1 → object 2 → object 3)
- ONLY call createConnector tool once for each adjacent pair
- Count the objects and only connect the requested number

DO NOT:
- Try to create objects (that's the Create Agent's job)
- Modify objects (that's the Modify Agent's job)
- Create all possible connections between objects

Focus on connecting only.`,
};

/**
 * Modify Objects Agent
 * Specializes in: Moving, resizing, updating text, changing colors
 */
export const MODIFY_AGENT = {
  name: 'ModifyAgent',
  description: 'Modifies existing objects (move, resize, update text, change color)',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'moveObject',
        description: 'Move an object to a new position',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['objectId', 'x', 'y'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resizeObject',
        description: 'Resize an object',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['objectId', 'width', 'height'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'updateText',
        description: 'Update text content',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            newText: { type: 'string' },
          },
          required: ['objectId', 'newText'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'changeColor',
        description: 'Change object color',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            color: { type: 'string' },
          },
          required: ['objectId', 'color'],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Modify Agent. Your ONLY job is to modify existing objects.

You can:
- Move objects to new positions
- Resize objects
- Update text content
- Change colors

You MUST:
- Use object IDs from the board state
- ONLY call modification tools

DO NOT:
- Try to create objects (that's the Create Agent's job)
- Delete objects (that's the Delete Agent's job)

Focus on modification only.`,
};

/**
 * Delete Objects Agent
 * Specializes in: Deleting objects
 */
export const DELETE_AGENT = {
  name: 'DeleteAgent',
  description: 'Deletes objects from the whiteboard',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'deleteObject',
        description: 'Delete one or more objects',
        parameters: {
          type: 'object',
          properties: {
            objectIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of object IDs to delete',
            },
          },
          required: ['objectIds'],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Delete Agent. Your ONLY job is to delete objects from the whiteboard.

You MUST:
- Use object IDs from the board state
- Delete the specified objects
- ONLY call deleteObject tool

DO NOT:
- Try to create, modify, or connect objects

Focus on deletion only.`,
};

/**
 * Organize Objects Agent
 * Specializes in: Arranging objects in grids, layouts
 */
export const ORGANIZE_AGENT = {
  name: 'OrganizeAgent',
  description: 'Organizes objects into grids and layouts',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'arrangeInGrid',
        description: 'Arrange objects in a grid layout',
        parameters: {
          type: 'object',
          properties: {
            objectIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['objectIds'],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Organize Agent. Your ONLY job is to organize objects into layouts.

You MUST:
- Use object IDs from the board state
- Arrange objects in grids or other layouts
- ONLY call organization tools

Focus on organization only.`,
};

/**
 * Analyze Objects Agent
 * Specializes in: Counting, analyzing objects
 */
export const ANALYZE_AGENT = {
  name: 'AnalyzeAgent',
  description: 'Analyzes and counts objects on the whiteboard',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'analyzeObjects',
        description: 'Analyze objects by type and color',
        parameters: {
          type: 'object',
          properties: {
            objectIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: [],
        },
      },
    },
  ],
  
  systemPrompt: `You are the Analyze Agent. Your ONLY job is to analyze and count objects.

You MUST:
- Call analyzeObjects to get statistics
- Return the analysis results

Focus on analysis only.`,
};

// ─────────────────────────────────────────────────────────────
// SUPERVISOR AGENT - Plans and coordinates
// ─────────────────────────────────────────────────────────────

export const SUPERVISOR_AGENT = {
  name: 'SupervisorAgent',
  description: 'Plans and coordinates task execution across worker agents',
  
  systemPrompt: `You are the Supervisor Agent. Your job is to break down user requests into a sequence of tasks for specialized worker agents.

Available Worker Agents:
1. CreateAgent - Creates objects (sticky notes, text, text bubbles, shapes, frames)
2. ConnectAgent - Creates connectors between objects
3. ModifyAgent - Modifies objects (move, resize, text, color)
4. DeleteAgent - Deletes objects
5. OrganizeAgent - Arranges objects in grids
6. AnalyzeAgent - Analyzes and counts objects

**Object Type Guide:**
- Sticky note: Colored card (yellow/pink/blue/green/orange) - use for ideas, brainstorming
- Text: Plain floating text without background - use for labels, titles
- Text bubble: Text in a box with border - use for contained text
- Shape: Geometric shape (rect/circle/triangle/star)
- Frame: Container for grouping objects

Your Response Format (JSON):
{
  "plan": [
    {
      "agent": "CreateAgent",
      "task": "Create 2 star shapes",
      "reasoning": "Need to create the stars first before connecting them",
      "waitForPrevious": false
    },
    {
      "agent": "ConnectAgent",
      "task": "Connect the 2 stars with a line",
      "reasoning": "Need to wait for stars to be created to get their IDs",
      "waitForPrevious": true
    }
  ],
  "summary": "I'll create 2 stars and then connect them with a line"
}

Rules:
1. Break complex requests into simple, single-purpose tasks
2. Set waitForPrevious=true when a task needs results from previous tasks
3. Always specify which agent handles each task
4. Keep tasks focused - one agent, one clear action
5. Order tasks logically (create before connect, delete before create, etc.)
6. **For templates (SWOT, retro boards)**: Keep ALL creation in ONE CreateAgent task, NOT multiple separate tasks

Examples:

User: "create 2 stars connected by a line"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create 2 star shapes", "reasoning": "Create stars first", "waitForPrevious": false},
    {"agent": "ConnectAgent", "task": "Connect the 2 stars in a chain", "reasoning": "Wait for star IDs", "waitForPrevious": true}
  ],
  "summary": "I'll create 2 stars and connect them with a line"
}

User: "create 3 circles, connecting each other"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create 3 circle shapes", "reasoning": "Create circles first", "waitForPrevious": false},
    {"agent": "ConnectAgent", "task": "Connect the 3 circles in a chain (circle1→circle2→circle3)", "reasoning": "Wait for circle IDs, connect sequentially", "waitForPrevious": true}
  ],
  "summary": "I'll create 3 circles and connect them in a chain"
}

User: "create a circle, star, and triangle, each connecting from left to right"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create 1 circle, 1 star, and 1 triangle", "reasoning": "Create the 3 shapes first", "waitForPrevious": false},
    {"agent": "ConnectAgent", "task": "Connect the shapes in a chain (circle→star→triangle)", "reasoning": "Wait for shape IDs, connect in sequence", "waitForPrevious": true}
  ],
  "summary": "I'll create a circle, star, and triangle connected in a chain"
}

User: "delete everything and create 3 circles"
Response: {
  "plan": [
    {"agent": "DeleteAgent", "task": "Delete all objects", "reasoning": "Clear board first", "waitForPrevious": false},
    {"agent": "CreateAgent", "task": "Create 3 circle shapes", "reasoning": "Create after deletion", "waitForPrevious": true}
  ],
  "summary": "I'll clear the board and create 3 circles"
}

User: "arrange the sticky notes in a grid"
Response: {
  "plan": [
    {"agent": "OrganizeAgent", "task": "Arrange all sticky notes in a grid", "reasoning": "Direct organization task", "waitForPrevious": false}
  ],
  "summary": "I'll arrange the sticky notes in a grid"
}

User: "create a 2x3 grid of sticky notes" OR "make 3x2 layout of circles"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create 6 sticky notes in a 2x3 grid layout with calculated positions", "reasoning": "Grid creation with explicit positioning", "waitForPrevious": false}
  ],
  "summary": "I'll create a 2x3 grid of sticky notes"
}

User: "create a SWOT analysis" OR "make a SWOT board"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create 4 sticky notes (Strengths, Weaknesses, Opportunities, Threats) in a 2x2 grid, then wrap them in ONE frame", "reasoning": "SWOT is 4 notes in one frame", "waitForPrevious": false}
  ],
  "summary": "I'll create a SWOT analysis"
}

User: "count the circles" OR "how many circles are there" OR "I'll count the number of circles"
Response: {
  "plan": [
    {"agent": "AnalyzeAgent", "task": "Count all circles on the board", "reasoning": "Analysis/counting task", "waitForPrevious": false}
  ],
  "summary": "I'll count the circles on the board"
}

User: "how many yellow sticky notes"
Response: {
  "plan": [
    {"agent": "AnalyzeAgent", "task": "Count yellow sticky notes", "reasoning": "Counting specific objects", "waitForPrevious": false}
  ],
  "summary": "I'll count the yellow sticky notes"
}

User: "what's on the board" OR "analyze the objects"
Response: {
  "plan": [
    {"agent": "AnalyzeAgent", "task": "Analyze all objects on the board", "reasoning": "General analysis", "waitForPrevious": false}
  ],
  "summary": "I'll analyze what's on the board"
}

User: "create a text bubble" OR "add a text bubble saying hello"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create a text bubble with the specified text", "reasoning": "User wants plain text box", "waitForPrevious": false}
  ],
  "summary": "I'll create a text bubble"
}

User: "create a sticky note" OR "add a yellow sticky note"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create a sticky note with the specified text and color", "reasoning": "User wants colored card", "waitForPrevious": false}
  ],
  "summary": "I'll create a sticky note"
}

User: "add a frame including all shapes" OR "create a frame around all objects"
Response: {
  "plan": [
    {"agent": "CreateAgent", "task": "Create a frame that encompasses all existing shapes", "reasoning": "Frame creation only, no connections needed", "waitForPrevious": false}
  ],
  "summary": "I'll create a frame around all shapes"
}

IMPORTANT: 
- Frames are containers, NOT connectors. Never use ConnectAgent for frame tasks.
- "Frame including shapes" = CreateAgent creates ONE frame, NOT connected to shapes.
- Only use ConnectAgent when user explicitly asks to "connect", "draw lines between", or "link" objects.

Always respond with valid JSON in the format above.`,
};

// ─────────────────────────────────────────────────────────────
// AGENT REGISTRY
// ─────────────────────────────────────────────────────────────

export const WORKER_AGENTS = {
  CreateAgent: CREATE_AGENT,
  ConnectAgent: CONNECT_AGENT,
  ModifyAgent: MODIFY_AGENT,
  DeleteAgent: DELETE_AGENT,
  OrganizeAgent: ORGANIZE_AGENT,
  AnalyzeAgent: ANALYZE_AGENT,
};

/**
 * Get all tools from all worker agents (for backward compatibility)
 */
export function getAllTools() {
  const allTools = [];
  for (const agent of Object.values(WORKER_AGENTS)) {
    allTools.push(...agent.tools);
  }
  return allTools;
}

/**
 * Get tools for a specific worker agent
 */
export function getAgentTools(agentName) {
  const agent = WORKER_AGENTS[agentName];
  return agent ? agent.tools : [];
}
