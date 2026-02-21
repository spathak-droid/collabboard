/**
 * Mini-Agents: Ultra-lightweight agents for common single-operation commands
 * Each mini-agent has a tiny prompt (20-50 words) for maximum speed
 */

import { COMPLEX_SUPERVISOR } from './agent-system.js';

// ────────────────────────────────────────────────────────────────
// MINI-AGENT DEFINITIONS
// ────────────────────────────────────────────────────────────────

export const MINI_CREATE = {
  name: 'MiniCreate',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'createStickyNote',
        description: 'Create sticky note',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            color: { type: 'string', description: 'Hex color code (e.g., #FFF59D, #F48FB1, #81D4FA, #A5D6A7, #FFCC80) or "random" for varied colors' },
            colors: { type: 'array', items: { type: 'string' }, description: 'Array of hex colors to cycle through when creating multiple objects' },
            quantity: { type: 'number', description: 'Number of sticky notes to create (default: 1)' },
            rows: { type: 'number', description: 'Number of rows in grid layout' },
            columns: { type: 'number', description: 'Number of columns in grid layout' },
            frameId: { type: 'string', description: 'Optional: ID of frame to create sticky notes inside' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createShape',
        description: 'Create shape',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['rect', 'circle', 'triangle', 'star'] },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            color: { type: 'string', description: 'Hex color code (e.g., #EF4444 for red, #3B82F6 for blue) or "random" for varied colors' },
            colors: { type: 'array', items: { type: 'string' }, description: 'Array of hex colors to cycle through when creating multiple objects' },
            text: { type: 'string' },
            quantity: { type: 'number', description: 'Number of shapes to create (default: 1)' },
            rows: { type: 'number', description: 'Number of rows in grid layout' },
            columns: { type: 'number', description: 'Number of columns in grid layout' },
            frameId: { type: 'string', description: 'Optional: ID of frame to create shapes inside' },
          },
          required: ['type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createText',
        description: 'Create plain text',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            quantity: { type: 'number', description: 'Number of text objects to create (default: 1)' },
            rows: { type: 'number', description: 'Number of rows in grid layout' },
            columns: { type: 'number', description: 'Number of columns in grid layout' },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createFrame',
        description: 'Create frame container',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            quantity: { type: 'number', description: 'Number of frames to create (default: 1)' },
            rows: { type: 'number', description: 'Number of rows in grid layout' },
            columns: { type: 'number', description: 'Number of columns in grid layout' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'createTextBubble',
        description: 'Create text bubble',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            quantity: { type: 'number', description: 'Number of text bubbles to create (default: 1)' },
            rows: { type: 'number', description: 'Number of rows in grid layout' },
            columns: { type: 'number', description: 'Number of columns in grid layout' },
          },
          required: ['text'],
        },
      },
    },
  ],
  
  prompt: `Create a SINGLE object. This mini-agent is ONLY for creating ONE object at a time.

CRITICAL:
- This mini-agent is ONLY for single objects (e.g., "create a frame", "add a circle")
- If the user wants multiple objects (e.g., "create 10 frames"), you should NOT be called
- "frame" → use createFrame tool
- "circle/star/rectangle/triangle" → use createShape tool with that type
- "sticky note" → use createStickyNote tool
- "text bubble" → use createTextBubble tool
- "text" (plain text) → use createText tool
- **Colors:** If user specifies a color, convert it to hex code in the color parameter
  * Common hex codes: red="#EF4444", blue="#3B82F6", green="#10B981", purple="#A855F7", orange="#F97316", pink="#EC4899", yellow="#EAB308"
  * If user asks for "random" or "different" colors, use the colors array parameter
  * For multiple objects with varied colors, pass colors array (e.g., colors: ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"])
- **Frame Context:** If user has a frame selected (see User Selection context) and says "create X in/inside this frame", pass the frameId parameter

Examples (SINGLE objects only):
- "add a frame" → createFrame(title='Frame')
- "red circle" → createShape(type='circle', color='#EF4444')
- "purple star" → createShape(type='star', color='#A855F7')
- "blue rectangle" → createShape(type='rect', color='#3B82F6')
- "create a text bubble" → createTextBubble(text='')
- User has frame "frame123" selected, says "create a star inside" → createShape(type='star', frameId='frame123')`,
};

export const MINI_COLOR = {
  name: 'MiniColor',
  
  tools: [
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
  
  prompt: `Change colors. Find matching objects in board state. Call changeColor for EACH one.

Examples:
- "Color all circles red" → Find circles, call changeColor for each with color='red' or '#EF4444'
- "Make these blue" → Use provided IDs, call changeColor for each with color='blue' or '#3B82F6'

Sticky colors: yellow/pink/blue/green/orange. Shapes: use hex (#3B82F6=blue, #EF4444=red, #10B981=green).`,
};

export const MINI_MOVE = {
  name: 'MiniMove',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'moveObject',
        description: 'Move object by direction or to absolute position',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            direction: { type: 'string', enum: ['left', 'right', 'up', 'down'] },
          },
          required: ['objectId'],
        },
      },
    },
  ],
  
  prompt: `Move objects using directional movement or absolute positioning.

**VIEWPORT-AWARE MOVEMENT (PREFERRED):**
When viewport is available, use direction parameter:
- "move right" → moveObject(objectId, direction='right')
- "shift left" → moveObject(objectId, direction='left')
- "move up" → moveObject(objectId, direction='up')
- "move down" → moveObject(objectId, direction='down')

The system automatically calculates movement based on user's viewport (30% of visible area).

**ABSOLUTE POSITIONING (FALLBACK):**
Only use x/y when user specifies exact coordinates:
- "move to 500, 300" → moveObject(objectId, x=500, y=300)
- "position at 0, 0" → moveObject(objectId, x=0, y=0)

Find object(s) in board state. Call moveObject for EACH object.

CRITICAL: Prefer direction over calculating x/y manually. Direction is viewport-aware and works correctly on infinite canvas.`,
};

export const MINI_DELETE = {
  name: 'MiniDelete',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'deleteObject',
        description: 'Delete objects',
        parameters: {
          type: 'object',
          properties: {
            objectIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['objectIds'],
        },
      },
    },
  ],
  
  prompt: `Delete objects. Find matching objects in board state. ONE deleteObject call with ALL IDs as array.

**CRITICAL: For "delete all", "clear all", "delete everything", "remove everything":**
- You MUST pass ALL object IDs from the board state
- Do NOT filter by type - include EVERY object (sticky notes, shapes, text, frames, lines, etc.)
- Count total objects in board state and verify your array has ALL IDs
- Example: If board has 50 objects, pass array with 50 IDs
- Example: If board has 500 objects, pass array with 500 IDs

Examples:
- "Delete all circles" → deleteObject(objectIds: [all circle IDs])
- "Remove these" → deleteObject(objectIds: [selected IDs])
- "Delete everything" → deleteObject(objectIds: [EVERY single object ID from board state])
- "Clear all" → deleteObject(objectIds: [EVERY single object ID from board state])

NEVER call deleteObject multiple times. One call with array of all IDs.`,
};

export const MINI_ANALYZE = {
  name: 'MiniAnalyze',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'analyzeObjects',
        description: 'Count and analyze objects',
        parameters: {
          type: 'object',
          properties: {
            objectIds: { type: 'array', items: { type: 'string' } },
          },
          required: [],
        },
      },
    },
  ],
  
  prompt: `Analyze objects. Call analyzeObjects with object IDs (or empty array for all objects).

- "How many circles" → analyzeObjects([])
- "Count these" → analyzeObjects([selected IDs])`,
};

export const MINI_RESIZE = {
  name: 'MiniResize',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'resizeObject',
        description: 'Resize object',
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
  ],
  
  prompt: `Resize objects. Find matching objects in board state. Call resizeObject for each.

Extract dimensions from task (e.g., "200x100" → width: 200, height: 100).`,
};

export const MINI_ROTATE = {
  name: 'MiniRotate',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'rotateObject',
        description: 'Rotate object',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string' },
            rotation: { type: 'number' },
          },
          required: ['objectId', 'rotation'],
        },
      },
    },
  ],
  
  prompt: `Rotate objects. Find object in board state. Call rotateObject with angle in degrees.

Examples:
- "rotate 45 degrees" → rotation: 45
- "rotate the circle 90 degrees" → rotation: 90`,
};

export const MINI_TEXT = {
  name: 'MiniText',
  
  tools: [
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
  ],
  
  prompt: `Update text. Find object in board state. Call updateText with the new text.

Works on: sticky notes, text bubbles, plain text objects, frame names.

Supports:
- "write X in Y" - extracts text X and finds objects matching Y description
- "write X in all Y" - updates all objects of type Y with text X
- "write X in both Y" - updates objects matching Y description with text X
- "update text" - updates selected object text
- "change text" - updates selected object text
- "rename" - updates frame name or object text`,
};

export const MINI_FIT_FRAME = {
  name: 'MiniFitFrame',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'fitFrameToContents',
        description: 'Fit frame to contents',
        parameters: {
          type: 'object',
          properties: {
            frameId: { type: 'string' },
            padding: { type: 'number' },
          },
          required: ['frameId'],
        },
      },
    },
  ],
  
  prompt: `Resize frame to fit its contents. Find frame in board state. Call fitFrameToContents.

Default padding: 40px (can be customized if user specifies).`,
};

export const MINI_ORGANIZE = {
  name: 'MiniOrganize',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'arrangeInGrid',
        description: 'Arrange in grid',
        parameters: {
          type: 'object',
          properties: {
            objectIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['objectIds'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'arrangeInGridAndResize',
        description: 'Arrange and resize to fit',
        parameters: {
          type: 'object',
          properties: {
            objectIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['objectIds'],
        },
      },
    },
  ],
  
  prompt: `Organize objects. Use selected object IDs from context.

- "Arrange in grid" → arrangeInGrid([selected IDs])
- "Resize and space evenly" → arrangeInGridAndResize([selected IDs])`,
};

export const MINI_SWOT = {
  name: 'MiniSWOT',
  
  tools: [
    {
      type: 'function',
      function: {
        name: 'createSWOTAnalysis',
        description: 'Create SWOT analysis or matrix',
        parameters: {
          type: 'object',
          properties: {
            quadrants: { type: 'number' },
            shape: { type: 'string', enum: ['rect', 'circle', 'triangle', 'star'] },
            x: { type: 'number' },
            y: { type: 'number' },
            color: { type: 'string' },
            withFrame: { type: 'boolean' },
          },
          required: [],
        },
      },
    },
  ],
  
  prompt: `Create SWOT analysis or structured matrix. Call createSWOTAnalysis with parameters.

CRITICAL:
- Default quadrants=4 (2x2 matrix for SWOT)
- Use shape parameter if user specifies shapes instead of sticky notes
- Common hex codes: red="#EF4444", blue="#3B82F6", green="#10B981", purple="#A855F7", orange="#F97316"
- withFrame=true by default

RESPONSE MESSAGE:
- When quadrants=4 and no shape specified, say: "I've created the SWOT analysis template with Strengths, Weaknesses, Opportunities, and Threats sections."
- For other matrix sizes, say: "I've created a [NxN] matrix template with [N] sections."
- For shapes, say: "I've created a [NxN] grid with [N] [shape]s."

Examples:
- "create swot" → createSWOTAnalysis(quadrants=4) → say "I've created the SWOT analysis template"
- "create 3x3 matrix" → createSWOTAnalysis(quadrants=9) → say "I've created a 3x3 matrix template"
- "swot with circles" → createSWOTAnalysis(quadrants=4, shape='circle') → say "I've created a 2x2 grid with 4 circles"
- "4 red rectangles in grid" → createSWOTAnalysis(quadrants=4, shape='rect', color='#EF4444') → say "I've created a 2x2 grid with 4 red rectangles"`,
};

// ────────────────────────────────────────────────────────────────
// MINI-AGENT ROUTING
// ────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────
// COMPLEX COMMAND DETECTION AND ROUTING
// ────────────────────────────────────────────────────────────────

/**
 * Detect if a command requires the Complex Supervisor (GPT-4o-mini reasoning)
 * Returns true for commands that need:
 * - Domain knowledge (solar system, food chain, etc.)
 * - Complex spatial reasoning (linear vs grid layouts)
 * - Understanding of what labels/connections make sense
 */
export function needsComplexSupervisor(command) {
  const lower = command.toLowerCase();
  
  // Domain-specific spatial layouts
  const domainPatterns = [
    /solar system/i,
    /food chain/i,
    /family tree/i,
    /org(anization)? chart/i,
    /timeline/i,
    /life cycle/i,
    /water cycle/i,
    /carbon cycle/i,
    /periodic table/i,
    /phylogenetic tree/i,
    /evolutionary tree/i,
  ];
  
  if (domainPatterns.some(pattern => pattern.test(lower))) {
    return true;
  }
  
  // Complex spatial patterns with specific requirements
  if (
    (/labeled.*circle/i.test(lower) || /circle.*labeled/i.test(lower)) &&
    (/connected|connecting|line/i.test(lower))
  ) {
    return true;
  }
  
  // Linear/sequential layouts with connections
  if (
    (/linear|sequence|chain|row/i.test(lower)) &&
    (/connected|connecting|line/i.test(lower)) &&
    /\d+/.test(lower) // Has a number
  ) {
    return true;
  }
  
  return false;
}

/**
 * Execute a command with the Complex Supervisor (uses GPT-4o-mini for reasoning)
 */
export async function executeComplexSupervisor(openai, userMessage, boardState, context) {
  console.log('🧠 COMPLEX SUPERVISOR: Using GPT-4o-mini for reasoning');
  
  const messages = [
    { role: 'system', content: COMPLEX_SUPERVISOR.systemPrompt },
    { role: 'user', content: `Command: ${userMessage}\n\nCurrent board state:\n${context}` },
  ];

  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Use GPT-4o-mini for complex reasoning
    messages,
    response_format: { type: 'json_object' }, // Force JSON response
    temperature: 0.3, // Slightly creative for domain knowledge
  });
  const duration = Date.now() - startTime;

  console.log(`🧠 Complex Supervisor reasoned in ${duration}ms`);

  const choice = response.choices[0];
  if (!choice || !choice.message.content) {
    throw new Error('No response from Complex Supervisor');
  }

  let plan;
  try {
    plan = JSON.parse(choice.message.content);
  } catch (error) {
    console.error('Failed to parse Complex Supervisor response:', choice.message.content);
    throw new Error('Complex Supervisor returned invalid JSON');
  }

  // Convert the plan into tool calls
  const toolCalls = [];
  const createdObjectIds = []; // Track created objects for sequential connections
  
  for (const step of plan.plan) {
    if (step.action === 'createCircle' || step.action === 'createRect' || step.action === 'createTriangle' || step.action === 'createStar') {
      // Map to createShape tool call
      const shapeType = step.action.replace('create', '').toLowerCase(); // createCircle → circle
      const id = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      toolCalls.push({
        id: `call_${toolCalls.length}`,
        name: 'createShape',
        arguments: {
          type: shapeType,
          ...step.params,
        },
      });
      
      createdObjectIds.push(id); // Track for connections
    } else if (step.action === 'createConnector') {
      // Map fromIndex/toIndex to actual IDs
      const fromIndex = step.params.fromIndex;
      const toIndex = step.params.toIndex;
      
      // If we have created objects, use their IDs
      // Otherwise, use IDs from board state (for existing objects)
      let fromId, toId;
      
      if (createdObjectIds.length > fromIndex && createdObjectIds.length > toIndex) {
        fromId = createdObjectIds[fromIndex];
        toId = createdObjectIds[toIndex];
      } else {
        // Fallback: use sequential IDs from board state (for connecting existing objects)
        const objects = boardState.objects || [];
        if (objects.length > fromIndex && objects.length > toIndex) {
          fromId = objects[fromIndex].id;
          toId = objects[toIndex].id;
        } else {
          console.warn(`Cannot create connector: index out of bounds (${fromIndex} → ${toIndex})`);
          continue;
        }
      }
      
      toolCalls.push({
        id: `call_${toolCalls.length}`,
        name: 'createConnector',
        arguments: {
          fromId,
          toId,
          style: step.params.style || 'straight',
        },
      });
    }
  }

  console.log(`✅ Complex Supervisor generated ${toolCalls.length} tool calls`);

  return {
    success: true,
    agentName: 'ComplexSupervisor',
    toolCalls,
    message: plan.summary,
    summary: plan.summary,
    analysis: plan.analysis, // Include reasoning for debugging
  };
}

// ────────────────────────────────────────────────────────────────
// MINI-AGENT ROUTING
// ────────────────────────────────────────────────────────────────

/**
 * Detect which mini-agent should handle this command
 * Returns mini-agent config or null if needs full agent
 */
export function detectMiniAgent(command, hasSelection = false) {
  const lower = command.toLowerCase();
  
  // JOURNEY MAP patterns - needs full agent for LLM stage generation
  if (/(journey|user journey|customer journey)/i.test(lower)) {
    return null; // Too complex for mini-agent, needs LLM to generate stages
  }
  
  // SWOT patterns (check before CREATE to avoid conflict)
  if (/(swot|matrix|quadrant)/i.test(lower) && /create|add|make|draw/i.test(lower)) {
    return MINI_SWOT;
  }
  
  // CREATE patterns
  if (/^(create|add|make|draw)\s+(a |an |one )?[a-z]/i.test(lower)) {
    // Check for templates (needs full agent)
    if (/(retrospective|retro|journey|template)/i.test(lower)) {
      return null; // Too complex for mini-agent
    }
    
    // Check for quantities > 1 (needs full agent for auto-grid arrangement)
    // Examples: "create 8 stars", "add 5 circles", "make 10 rectangles"
    const quantityMatch = lower.match(/(?:create|add|make|draw)\s+(\d+)/i);
    if (quantityMatch && parseInt(quantityMatch[1]) > 1) {
      return null; // Multiple objects need full agent for grid arrangement
    }
    
    return MINI_CREATE;
  }
  
  // COLOR patterns
  if (/(color|change.*color|make.*\w+\s+(red|blue|green|yellow|orange|pink|purple))/i.test(lower)) {
    return MINI_COLOR;
  }
  
  // MOVE patterns (simple directional)
  if (/^move.*\b(right|left|up|down|outside)\b/i.test(lower) && !/and|then|,/.test(lower)) {
    return MINI_MOVE;
  }
  
  // DELETE patterns
  if (/^(delete|remove|clear)/i.test(lower) && !/and|then/.test(lower)) {
    return MINI_DELETE;
  }
  
  // FIT FRAME patterns (check before general resize)
  if (/resize.*frame|fit.*content|fit.*frame|frame.*fit|frame.*content/i.test(lower)) {
    return MINI_FIT_FRAME;
  }
  
  // RESIZE patterns
  if (/^resize/i.test(lower) && !/and|then/i.test(lower)) {
    return MINI_RESIZE;
  }
  
  // ROTATE patterns
  if (/^rotate/i.test(lower) && !/and|then/i.test(lower)) {
    return MINI_ROTATE;
  }
  
  // UPDATE TEXT patterns (write, change text, update text, rename)
  if (/^(write|change|update|edit).*text/i.test(lower) || /^rename/i.test(lower) || /^write\s+/i.test(lower)) {
    return MINI_TEXT;
  }
  
  // ORGANIZE patterns
  if (hasSelection && /(arrange|space|organize|grid)/i.test(lower) && !/create/i.test(lower)) {
    return MINI_ORGANIZE;
  }
  
  // ANALYZE patterns
  if (/^(how many|count|analyze|what|show|list)/i.test(lower)) {
    return MINI_ANALYZE;
  }
  
  return null; // Needs full agent
}

/**
 * Execute a command with a mini-agent (ultra-fast)
 */
export async function executeMiniAgent(openai, miniAgent, userMessage, boardState, context, executeAnalyzeObjectsServerSide) {
  console.log(`⚡⚡ MINI-AGENT: ${miniAgent.name} (ultra-fast mode)`);
  
  const messages = [
    { role: 'system', content: miniAgent.prompt },
    { role: 'user', content: `Board state:\n${context}\n\nTask: ${userMessage}` },
  ];

  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-nano', // Mini-agents use nano model for ultra-low latency
    messages,
    tools: miniAgent.tools,
    tool_choice: 'auto',
    temperature: 0.1, // Lower temp for faster, more deterministic responses
  });
  const duration = Date.now() - startTime;

  console.log(`⚡⚡ ${miniAgent.name} responded in ${duration}ms`);

  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`No response from ${miniAgent.name}`);
  }

  const toolCalls = [];
  let analysisMessage = choice.message.content;
  
  // Handle analyzeObjects server-side execution
  if (choice.message.tool_calls) {
    const analyzeCall = choice.message.tool_calls.find(tc => tc.function.name === 'analyzeObjects');
    
    if (analyzeCall && executeAnalyzeObjectsServerSide) {
      console.log('📊 Executing analyzeObjects (mini-agent)');
      
      let args;
      try { args = JSON.parse(analyzeCall.function.arguments); } catch { args = {}; }
      
      const objectIdsToAnalyze = args.objectIds || [];
      const analysisResult = executeAnalyzeObjectsServerSide(objectIdsToAnalyze, boardState);
      
      const breakdown = Object.entries(analysisResult.countByTypeAndColor)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => {
          const [color, ...typeParts] = key.split('_');
          const type = typeParts.join('_');
          // Skip "none" color - just show type
          if (color === 'none') {
            return `${count} ${type}${count !== 1 ? 's' : ''}`;
          }
          return `${count} ${color} ${type}${count !== 1 ? 's' : ''}`;
        })
        .join(', ');
      
      const resultString = JSON.stringify({
        totalObjects: analysisResult.totalObjects,
        breakdown: breakdown,
        countByType: analysisResult.countByType,
        countByColor: analysisResult.countByColor,
      });

      const messages2 = [
        ...messages,
        choice.message,
        {
          role: 'tool',
          tool_call_id: analyzeCall.id,
          content: resultString,
        },
      ];

      const response2 = await openai.chat.completions.create({
        model: 'gpt-4.1-nano',
        messages: messages2,
        temperature: 0.1,
      });

      const choice2 = response2.choices[0];
      if (choice2?.message?.content) {
        analysisMessage = choice2.message.content;
      }
    }
    
    // Collect all tool calls for client execution
    for (const tc of choice.message.tool_calls) {
      if (tc.type === 'function') {
        let args;
        try {
          args = JSON.parse(tc.function.arguments);
          
          // DEBUG: Log color changes specifically
          if (tc.function.name === 'changeColor') {
            console.log('[MINI-AGENT] changeColor raw arguments:', tc.function.arguments);
            console.log('[MINI-AGENT] changeColor parsed args:', JSON.stringify(args));
          }
        } catch {
          args = {};
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
      }
    }
  }

  console.log(`✅ ${miniAgent.name} returned ${toolCalls.length} tool calls`);

  return {
    success: true,
    agentName: miniAgent.name,
    toolCalls,
    message: analysisMessage,
    summary: analysisMessage || `${miniAgent.name} completed`,
  };
}
