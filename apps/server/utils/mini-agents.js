/**
 * Mini-Agents: Ultra-lightweight agents for common single-operation commands
 * Each mini-agent has a tiny prompt (20-50 words) for maximum speed
 */

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
            color: { type: 'string', enum: ['yellow', 'pink', 'blue', 'green', 'orange'] },
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
            color: { type: 'string' },
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
          },
          required: ['text'],
        },
      },
    },
  ],
  
  prompt: `Create objects. Call the correct tool based on what the user asks for.

CRITICAL:
- "frame" → use createFrame tool
- "circle/star/rectangle/triangle" → use createShape tool with that type
- "sticky note" → use createStickyNote tool
- If user specifies a color, convert it to hex code in the color parameter
- Color conversions: red="#EF4444", blue="#3B82F6", green="#10B981", purple="#A855F7", orange="#F97316", pink="#EC4899", yellow="#EAB308"
- "a" or "one" = create 1 object, "5" = create 5 objects

Examples:
- "add a frame" → createFrame(title='Frame')
- "red circle" → createShape(type='circle', color='#EF4444')
- "purple star" → createShape(type='star', color='#A855F7')
- "blue rectangle" → createShape(type='rect', color='#3B82F6')
- "5 circles" → call createShape 5 times with type='circle'`,
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
        description: 'Move object',
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
  ],
  
  prompt: `Move objects. Calculate new position from current position + direction.

- "Move right" → x + 300
- "Move far left" → x - 800
- "Move up" → y - 300
- "Outside frame right" → frame.x + frame.width + 50

Find object(s) in board state. Call moveObject for each.`,
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

Examples:
- "Delete all circles" → deleteObject(objectIds: [all circle IDs])
- "Remove these" → deleteObject(objectIds: [selected IDs])

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

Works on: sticky notes, text bubbles, plain text objects, frame names.`,
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

// ────────────────────────────────────────────────────────────────
// MINI-AGENT ROUTING
// ────────────────────────────────────────────────────────────────

/**
 * Detect which mini-agent should handle this command
 * Returns mini-agent config or null if needs full agent
 */
export function detectMiniAgent(command, hasSelection = false) {
  const lower = command.toLowerCase();
  
  // CREATE patterns
  if (/^(create|add|make|draw)\s+(a |an |one )?[a-z]/i.test(lower)) {
    // Check for templates (needs full agent)
    if (/(swot|retrospective|retro|journey|template)/i.test(lower)) {
      return null; // Too complex for mini-agent
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
  
  // UPDATE TEXT patterns (change text, update text, rename)
  if (/^(change|update|edit).*text/i.test(lower) || /^rename/i.test(lower)) {
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
