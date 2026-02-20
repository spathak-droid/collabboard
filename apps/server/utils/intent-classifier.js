/**
 * Intent Classifier - Ultra-fast command analysis
 * 
 * This runs BEFORE any agent routing. It classifies user intent and extracts
 * parameters in a single fast LLM call, then routes directly to tool execution.
 * 
 * Flow:
 * 1. User: "create 50 green stars"
 * 2. Classifier identifies: operation=CREATE, object=star, quantity=50, color=green
 * 3. Direct tool call: createShape(type='star', color='green') x50
 * 4. Skip supervisor, skip worker agents → Direct execution
 */

export const INTENT_CLASSIFIER = {
  name: 'IntentClassifier',
  description: 'Classifies user intent and extracts parameters for direct tool execution',
  
  schema: {
    type: 'function',
    function: {
      name: 'classifyIntent',
      description: 'Analyze user command and extract structured parameters',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['CREATE', 'UPDATE', 'DELETE', 'MOVE', 'RESIZE', 'ROTATE', 'CHANGE_COLOR', 'ARRANGE', 'ANALYZE', 'CONNECT', 'FIT_FRAME_TO_CONTENTS', 'MULTI_STEP', 'UNKNOWN'],
            description: 'Primary operation type',
          },
          objectType: {
            type: 'string',
            enum: ['sticky', 'shape', 'text', 'textBubble', 'frame', 'connector', 'mixed'],
            description: 'Type of object being operated on',
          },
          shapeType: {
            type: 'string',
            enum: ['rect', 'circle', 'triangle', 'star'],
            description: 'Specific shape type (only if objectType=shape)',
          },
          quantity: {
            type: 'number',
            description: 'Number of objects (e.g., "50 stars" = 50, "a circle" = 1)',
          },
          color: {
            type: 'string',
            description: 'Color as hex code (#EF4444) or name (red, blue, green, yellow, orange, pink, purple)',
          },
          text: {
            type: 'string',
            description: 'Text content for sticky notes, text objects, or frames',
          },
          coordinates: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
            description: 'Explicit coordinates if specified (e.g., "at 100, 200")',
          },
          dimensions: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
            description: 'Explicit dimensions if specified (e.g., "300x200")',
          },
          rotation: {
            type: 'number',
            description: 'Rotation angle in degrees (e.g., "rotate 45 degrees" = 45)',
          },
          targetFilter: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Object type to target (e.g., "all circles")' },
              color: { type: 'string', description: 'Color filter (e.g., "red rectangles")' },
              useSelection: { type: 'boolean', description: 'Whether to use selected objects' },
            },
            description: 'Filters for targeting existing objects (for modify/delete operations)',
          },
          isMultiStep: {
            type: 'boolean',
            description: 'True if command requires multiple steps (e.g., "create 3 circles connected by lines")',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                operation: { type: 'string' },
                description: { type: 'string' },
              },
            },
            description: 'Individual steps if isMultiStep=true',
          },
        },
        required: ['operation'],
      },
    },
  },
  
  systemPrompt: `You are an intent classifier. Analyze user commands and extract structured parameters.

**COLOR CONVERSION (CRITICAL):**
- red → "#EF4444"
- blue → "#3B82F6"
- green → "#10B981"
- yellow → "#EAB308"
- orange → "#F97316"
- pink → "#EC4899"
- purple → "#A855F7"
- For sticky notes: yellow/pink/blue/green/orange (names OK)
- For shapes: ALWAYS use hex codes

**QUANTITY PARSING:**
- "a circle" = 1
- "50 stars" = 50
- "create stars" (no number) = 1
- "some circles" = 3 (reasonable default)

**OPERATION DETECTION:**
- **CREATE**: "create", "add", "make", "draw", "generate" + object type
  * "create 50 green stars" → operation=CREATE, objectType=shape, shapeType=star, quantity=50, color="#10B981"
  * "add a red circle" → operation=CREATE, objectType=shape, shapeType=circle, quantity=1, color="#EF4444"
  * "make 5 yellow sticky notes" → operation=CREATE, objectType=sticky, quantity=5, color="yellow"
  
- **CHANGE_COLOR**: "color", "change color", "make [existing] blue"
  * "color all circles red" → operation=CHANGE_COLOR, targetFilter={type:'circle'}, color="#EF4444"
  * "make these green" → operation=CHANGE_COLOR, targetFilter={useSelection:true}, color="#10B981"
  
- **MOVE**: "move", "shift", "drag" + direction/coordinates
  * "move right" → operation=MOVE, direction="right"
  * "move to 100, 200" → operation=MOVE, coordinates={x:100, y:200}
  
- **RESIZE**: "resize", "make bigger/smaller" + dimensions (NOT for frames to fit contents)
  * "resize to 300x200" → operation=RESIZE, dimensions={width:300, height:200}
  
- **FIT_FRAME_TO_CONTENTS**: "resize frame to fit", "fit frame to contents", "make frame fit", "extend frame"
  * "resize frame to fit contents" → operation=FIT_FRAME_TO_CONTENTS, objectType=frame
  * This operation requires board context (needs mini-agent or full agent)
  
- **ROTATE**: "rotate", "turn" + angle
  * "rotate 45 degrees" → operation=ROTATE, rotation=45
  
- **DELETE**: "delete", "remove", "clear"
  * "delete all circles" → operation=DELETE, targetFilter={type:'circle'}
  
- **ARRANGE**: "arrange", "organize", "grid", "space"
  * "arrange in grid" → operation=ARRANGE, method="grid"
  
- **ANALYZE**: "how many", "count", "analyze", "show statistics"
  * "how many circles" → operation=ANALYZE, targetFilter={type:'circle'}
  
- **MULTI_STEP**: Commands with "and", "then", "connected", or multiple operations
  * "create 3 circles connected by lines" → isMultiStep=true, steps=[{operation:CREATE}, {operation:CONNECT}]

**CRITICAL - Operations that need agent handling:**
- FIT_FRAME_TO_CONTENTS - requires board context to find frame and its contents
- CONNECT - requires board context to find objects to connect
- MULTI_STEP - requires orchestration

For these operations, classify them but return isMultiStep=true or operation specific so the router can hand off to the appropriate agent.

**OBJECT TYPES:**
- "star", "circle", "rectangle", "triangle" → objectType=shape, shapeType=[star/circle/rect/triangle]
- "sticky note", "note" → objectType=sticky
- "text" → objectType=text
- "text bubble", "text box" → objectType=textBubble
- "frame" → objectType=frame

**CRITICAL RULES:**
1. If quantity specified → it's CREATE, NOT modification
2. Color must be converted to hex for shapes
3. "a" or "one" = quantity:1
4. Always extract ALL mentioned parameters
5. For CREATE operations with quantity, operation=CREATE (not CHANGE_COLOR)

Examples:

User: "create 50 green stars"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 50,
  "color": "#10B981"
}

User: "add a red circle"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 1,
  "color": "#EF4444"
}

User: "color all circles blue"
{
  "operation": "CHANGE_COLOR",
  "targetFilter": { "type": "circle" },
  "color": "#3B82F6"
}

User: "create 3 stars connected by lines"
{
  "operation": "MULTI_STEP",
  "isMultiStep": true,
  "steps": [
    { "operation": "CREATE", "description": "Create 3 stars" },
    { "operation": "CONNECT", "description": "Connect with lines" }
  ]
}

User: "resize to 300x200"
{
  "operation": "RESIZE",
  "dimensions": { "width": 300, "height": 200 },
  "targetFilter": { "useSelection": true }
}

User: "resize frame to fit contents" OR "fit frame to contents"
{
  "operation": "FIT_FRAME_TO_CONTENTS",
  "objectType": "frame",
  "targetFilter": { "type": "frame" }
}
Note: This will fall through to mini-agent since it needs board context to find the frame.

User: "delete all red rectangles"
{
  "operation": "DELETE",
  "targetFilter": { "type": "shape", "shapeType": "rect", "color": "#EF4444" }
}`,
};

/**
 * Classify user intent and extract parameters
 * @returns {object|null} Classified intent or null if classification failed
 */
export async function classifyUserIntent(openai, userMessage) {
  console.log('🔍 Classifying user intent:', userMessage);
  
  const startTime = Date.now();
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast model for classification
      messages: [
        { role: 'system', content: INTENT_CLASSIFIER.systemPrompt },
        { role: 'user', content: `Analyze this command: "${userMessage}"` },
      ],
      tools: [INTENT_CLASSIFIER.schema],
      tool_choice: { type: 'function', function: { name: 'classifyIntent' } }, // Force function call
      temperature: 0.1, // Low temperature for consistent classification
    });
    
    const duration = Date.now() - startTime;
    console.log(`🔍 Classification completed in ${duration}ms`);
    
    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'classifyIntent') {
      console.warn('⚠️  No classification returned');
      return null;
    }
    
    const intent = JSON.parse(toolCall.function.arguments);
    console.log('✅ Intent classified:', JSON.stringify(intent, null, 2));
    
    return intent;
  } catch (error) {
    console.error('❌ Classification failed:', error.message);
    return null;
  }
}

/**
 * Execute command directly from classified intent (bypass all agents)
 * @returns {object|null} Tool calls to execute on client, or null if needs agent with board context
 */
export function executeFromIntent(intent, boardState) {
  console.log('⚡ Executing directly from intent (agent bypass)');
  
  // Operations that NEED agent with board context - return null to fall through
  if (intent.operation === 'FIT_FRAME_TO_CONTENTS' || 
      intent.operation === 'CONNECT' ||
      intent.isMultiStep) {
    console.log(`⚠️  ${intent.operation} needs agent with board context, falling through`);
    return null;
  }
  
  const toolCalls = [];
  
  switch (intent.operation) {
    case 'CREATE': {
      // Generate tool calls for creation
      const quantity = intent.quantity || 1;
      
      // Convert color name to hex
      const color = intent.color ? colorNameToHex(intent.color) : undefined;
      
      if (intent.objectType === 'shape' && intent.shapeType) {
        // Create shapes
        for (let i = 0; i < quantity; i++) {
          const args = {
            type: intent.shapeType,
          };
          
          // Add color if specified (now converted to hex)
          if (color) {
            args.color = color;
          }
          
          // Add coordinates if specified (only for first object, others auto-placed)
          if (i === 0 && intent.coordinates) {
            args.x = intent.coordinates.x;
            args.y = intent.coordinates.y;
          }
          
          // Add dimensions if specified
          if (intent.dimensions) {
            args.width = intent.dimensions.width;
            args.height = intent.dimensions.height;
          }
          
          toolCalls.push({
            id: `create_${i}`,
            name: 'createShape',
            arguments: args,
          });
        }
      } else if (intent.objectType === 'sticky') {
        // Create sticky notes
        for (let i = 0; i < quantity; i++) {
          const args = {
            text: intent.text || '',
          };
          
          // Sticky notes can use color names, but normalize them
          if (color) {
            args.color = color;
          }
          
          if (i === 0 && intent.coordinates) {
            args.x = intent.coordinates.x;
            args.y = intent.coordinates.y;
          }
          
          toolCalls.push({
            id: `create_${i}`,
            name: 'createStickyNote',
            arguments: args,
          });
        }
      } else if (intent.objectType === 'frame') {
        const args = {
          title: intent.text || 'Frame',
        };
        
        if (intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        if (intent.dimensions) {
          args.width = intent.dimensions.width;
          args.height = intent.dimensions.height;
        }
        
        toolCalls.push({
          id: 'create_0',
          name: 'createFrame',
          arguments: args,
        });
      } else if (intent.objectType === 'text') {
        const args = {
          text: intent.text || '',
        };
        
        if (intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        toolCalls.push({
          id: 'create_0',
          name: 'createText',
          arguments: args,
        });
      } else if (intent.objectType === 'textBubble') {
        const args = {
          text: intent.text || '',
        };
        
        if (intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        if (intent.dimensions) {
          args.width = intent.dimensions.width;
          args.height = intent.dimensions.height;
        }
        
        toolCalls.push({
          id: 'create_0',
          name: 'createTextBubble',
          arguments: args,
        });
      }
      
      break;
    }
    
    case 'CHANGE_COLOR': {
      // Find matching objects and change their color
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      // Convert color name to hex if needed
      const hexColor = colorNameToHex(intent.color);
      
      targets.forEach((obj, i) => {
        toolCalls.push({
          id: `color_${i}`,
          name: 'changeColor',
          arguments: {
            objectId: obj.id,
            color: hexColor,
          },
        });
      });
      
      break;
    }
    
    case 'DELETE': {
      // Find matching objects and delete them
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      if (targets.length > 0) {
        toolCalls.push({
          id: 'delete_0',
          name: 'deleteObject',
          arguments: {
            objectIds: targets.map(obj => obj.id),
          },
        });
      }
      
      break;
    }
    
    case 'MOVE': {
      // Find matching objects and move them
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      targets.forEach((obj, i) => {
        const newPos = intent.coordinates || obj; // Use explicit coords or calculate from direction
        
        toolCalls.push({
          id: `move_${i}`,
          name: 'moveObject',
          arguments: {
            objectId: obj.id,
            x: newPos.x,
            y: newPos.y,
          },
        });
      });
      
      break;
    }
    
    case 'RESIZE': {
      // Find matching objects and resize them
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      targets.forEach((obj, i) => {
        if (intent.dimensions) {
          toolCalls.push({
            id: `resize_${i}`,
            name: 'resizeObject',
            arguments: {
              objectId: obj.id,
              width: intent.dimensions.width,
              height: intent.dimensions.height,
            },
          });
        }
      });
      
      break;
    }
    
    case 'ROTATE': {
      // Find matching objects and rotate them
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      targets.forEach((obj, i) => {
        toolCalls.push({
          id: `rotate_${i}`,
          name: 'rotateObject',
          arguments: {
            objectId: obj.id,
            rotation: intent.rotation,
          },
        });
      });
      
      break;
    }
    
    case 'ARRANGE': {
      // Arrange selected objects in grid
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      if (targets.length > 0) {
        toolCalls.push({
          id: 'arrange_0',
          name: intent.method === 'resize' ? 'arrangeInGridAndResize' : 'arrangeInGrid',
          arguments: {
            objectIds: targets.map(obj => obj.id),
          },
        });
      }
      
      break;
    }
    
    case 'ANALYZE': {
      // Analyze objects
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      toolCalls.push({
        id: 'analyze_0',
        name: 'analyzeObjects',
        arguments: {
          objectIds: targets.length > 0 ? targets.map(obj => obj.id) : [],
        },
      });
      
      break;
    }
    
    default:
      console.warn(`⚠️  Cannot execute operation: ${intent.operation} (needs agent routing)`);
      return null;
  }
  
  console.log(`✅ Generated ${toolCalls.length} tool calls from intent`);
  return toolCalls;
}

/**
 * Convert color names to hex codes
 * Ensures consistent color mapping regardless of LLM output
 */
function colorNameToHex(colorInput) {
  if (!colorInput) return colorInput;
  
  // If already hex, return as-is
  if (colorInput.startsWith('#')) return colorInput;
  
  // Normalize to lowercase for matching
  const color = colorInput.toLowerCase().trim();
  
  // Color mapping (matches intent classifier prompt)
  const colorMap = {
    'red': '#EF4444',
    'blue': '#3B82F6',
    'green': '#10B981',
    'yellow': '#EAB308',
    'orange': '#F97316',
    'pink': '#EC4899',
    'purple': '#A855F7',
    'gray': '#6B7280',
    'grey': '#6B7280',
    'black': '#000000',
    'white': '#FFFFFF',
  };
  
  return colorMap[color] || colorInput;
}

/**
 * Find objects matching the target filter
 */
function findMatchingObjects(boardState, targetFilter) {
  if (!targetFilter || !boardState?.objects) {
    return [];
  }
  
  let matches = boardState.objects;
  
  // Filter by type
  if (targetFilter.type) {
    matches = matches.filter(obj => obj.type === targetFilter.type);
  }
  
  // Filter by shape type
  if (targetFilter.shapeType) {
    matches = matches.filter(obj => obj.type === targetFilter.shapeType);
  }
  
  // Filter by color (check both 'color' and 'fill' fields)
  if (targetFilter.color) {
    matches = matches.filter(obj => 
      obj.color === targetFilter.color || obj.fill === targetFilter.color
    );
  }
  
  // Use selection if specified
  if (targetFilter.useSelection && boardState.selectedIds) {
    matches = matches.filter(obj => boardState.selectedIds.includes(obj.id));
  }
  
  return matches;
}
