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
            description: 'Number of objects (e.g., "50 stars" = 50, "a circle" = 1, "7x2 grid" = 14)',
          },
          rows: {
            type: 'number',
            description: 'Grid rows if specified (e.g., "7x2 grid" = rows:7)',
          },
          columns: {
            type: 'number',
            description: 'Grid columns if specified (e.g., "7x2 grid" = columns:2)',
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
          direction: {
            type: 'string',
            enum: ['left', 'right', 'up', 'down'],
            description: 'Direction for movement (e.g., "move right" = "right")',
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
- **CRITICAL - Color Variation Keywords (Extract as "random"):**
  * "random color", "different color", "different colors", "varied colors", "various colors", "all should be different color", "each a different color"
  * When you see these phrases → SET color: "random" (so executor knows to cycle colors)
  * Example: "create 5 sticky notes which all should be different color" → color: "random"
  * Example: "create 9 sticky notes with random color" → color: "random"
  * Example: "add 6 circles with different colors" → color: "random"
  * DO NOT convert "random" to a hex code - keep it as the string "random"

**QUANTITY PARSING:**
- "a circle" = 1
- "50 stars" = 50
- "3 sticky notes" = 3
- "create stars" (no number) = 1
- "some circles" = 3 (reasonable default)
- **CRITICAL: Always extract the number when present** (e.g., "create 3 X" → quantity:3)
- **GRID PATTERNS:**
  * "7x2 grid" or "7×2 grid" → rows:7, columns:2, quantity:14
  * "4x3 grid of circles" → rows:4, columns:3, quantity:12
  * "1 row 5 columns" → rows:1, columns:5, quantity:5
  * "create 8 stars" (no grid) → quantity:8 (no rows/columns, auto-calculated)

**OPERATION DETECTION:**
- **CREATE**: "create", "add", "make", "draw", "generate" + object type
  * "create 50 green stars" → operation=CREATE, objectType=shape, shapeType=star, quantity=50, color="#10B981"
  * "add a red circle" → operation=CREATE, objectType=shape, shapeType=circle, quantity=1, color="#EF4444"
  * "make 5 yellow sticky notes" → operation=CREATE, objectType=sticky, quantity=5, color="yellow"
  * **"add a sticky note that says X"** → operation=CREATE, text="X" (NOT UPDATE!)
  * **"create a circle that says X"** → operation=CREATE, text="X" (NOT UPDATE!)
  * **CRITICAL: If command STARTS with "create", "add", "make", "draw", or "generate" → operation=CREATE (NOT UPDATE, NOT CHANGE_COLOR)**
  * **CRITICAL: "add/create X that says Y" = CREATE with text Y (NOT UPDATE)**
  * **CRITICAL: "create X with [color]" = CREATE operation, even if "color" keyword appears**
  * **CRITICAL - Frame Context: If user says "create X inside/in this", "create X in the frame", "create X here" → set targetFilter={useSelection:true}**
  * **CRITICAL - Frame Around Selection: If user says "create frame around/surrounding these/this/selected" → set targetFilter={useSelection:true}**
  * **This tells the system to create objects inside the selected frame (if a frame is selected)**
  * **Or wrap a frame around selected objects (if creating a frame)**
  * Examples:
    - "create 5 sticky notes with random color" → operation=CREATE (NOT CHANGE_COLOR)
    - "add 9 circles with different colors" → operation=CREATE (NOT CHANGE_COLOR)
    - "make sticky notes with blue color" → operation=CREATE (NOT CHANGE_COLOR)
    - "create 2 stars inside this" → operation=CREATE, shapeType=star, quantity=2, targetFilter={useSelection:true}
    - "add 3 circles in this frame" → operation=CREATE, shapeType=circle, quantity=3, targetFilter={useSelection:true}
    - "create sticky notes here" → operation=CREATE, objectType=sticky, targetFilter={useSelection:true}
    - "create a frame around these" → operation=CREATE, objectType=frame, targetFilter={useSelection:true}
    - "add frame surrounding selected objects" → operation=CREATE, objectType=frame, targetFilter={useSelection:true}
  
- **UPDATE**: "write", "update text", "change text", "edit text", "set text to" (WITHOUT create/add/make at the start)
  * "write 'upcoming' in all pink notes" → operation=UPDATE, text="upcoming", targetFilter={color:'pink', type:'sticky'}
  * "write 'Stars' in both yellow stars" → operation=UPDATE, text="Stars", targetFilter={color:'yellow', type:'star'}
  * "update all rectangles to say hello" → operation=UPDATE, text="hello", targetFilter={type:'rect'}
  * **CRITICAL: UPDATE requires targeting EXISTING objects ("in all X", "in both Y", "in the Z")**
  * **CRITICAL: "write X in all Y" or "write X in both Y" = UPDATE operation (modifies existing objects)**
  * **CRITICAL: If command STARTS with "add", "create", "make" → NEVER classify as UPDATE, always CREATE**
  * **CRITICAL: Extract the text being written (the first quoted or mentioned text)**
  * **CRITICAL: Parse target filter correctly:**
    - "in all pink notes" → targetFilter={color:'pink', type:'sticky'}
    - "in both yellow stars" → targetFilter={color:'yellow', type:'star'}
    - "in all circles" → targetFilter={type:'circle'}
    - "in the rectangle" → targetFilter={useSelection:true} (implies specific object)
  
- **CHANGE_COLOR**: "color", "change color", "make [existing] blue" (WITHOUT create/add/make keywords)
  * "color all circles red" → operation=CHANGE_COLOR, targetFilter={type:'circle'}, color="#EF4444"
  * "make these green" → operation=CHANGE_COLOR, targetFilter={useSelection:true}, color="#10B981"
  * **"color these stars pink" → operation=CHANGE_COLOR, targetFilter={useSelection:true}, color="#EC4899" (NOT type:star!)**
  * **"color this red" → operation=CHANGE_COLOR, targetFilter={useSelection:true}, color="#EF4444"**
  * **CRITICAL: "these", "this", "them" = useSelection:true, ignore object type in command**
  * **CRITICAL: CHANGE_COLOR requires EXISTING objects - never use for creation commands**
  * **CRITICAL: If "create", "add", "make" appears in command → NOT CHANGE_COLOR, it's CREATE**
  
- **MOVE**: "move", "shift", "drag" + direction/coordinates
  * "move right" → operation=MOVE, direction="right", targetFilter={useSelection:true}
  * "move all sticky notes left" → operation=MOVE, direction="left", targetFilter={type:'sticky'}
  * "move to 100, 200" → operation=MOVE, coordinates={x:100, y:200}, targetFilter={useSelection:true}
  
- **RESIZE**: "resize", "make bigger/smaller" + dimensions (NOT for frames to fit contents)
  * "resize to 300x200" → operation=RESIZE, dimensions={width:300, height:200}
  
- **FIT_FRAME_TO_CONTENTS**: "resize frame to fit", "fit frame to contents", "make frame fit", "extend frame"
  * "resize frame to fit contents" → operation=FIT_FRAME_TO_CONTENTS, objectType=frame
  * This operation requires board context (needs mini-agent or full agent)
  
- **ROTATE**: "rotate", "turn" + angle
  * "rotate 45 degrees" → operation=ROTATE, rotation=45
  
- **DELETE**: "delete", "remove", "clear"
  * "delete all circles" → operation=DELETE, targetFilter={type:'circle'}
  * **"delete these" or "delete this" → operation=DELETE, targetFilter={useSelection:true}**
  
- **ARRANGE**: "arrange", "organize", "grid", "space"
  * "arrange in grid" → operation=ARRANGE, method="grid"
  
- **ANALYZE**: "how many", "count", "analyze", "show statistics"
  * "how many circles" → operation=ANALYZE, targetFilter={type:'circle'}
  * "how many pink stars" → operation=ANALYZE, targetFilter={type:'star', color:'pink'}
  * "how many yellow sticky notes" → operation=ANALYZE, targetFilter={type:'sticky', color:'yellow'}
  * "count red rectangles" → operation=ANALYZE, targetFilter={type:'rect', color:'red'}
  * **CRITICAL: Always extract BOTH type AND color from the query**
  
- **MULTI_STEP**: Commands with multiple **independent** operations or "connected by"
  * "create 3 circles connected by lines" → isMultiStep=true, steps=[{operation:CREATE}, {operation:CONNECT}]
  * "delete all rectangles and create 5 stars" → isMultiStep=true
  * **NOTE: "create X and color them Y" is NOT multi-step - it's a single CREATE with color**

**CRITICAL - Operations that need agent handling:**
- FIT_FRAME_TO_CONTENTS - requires board context to find frame and its contents
- CONNECT - requires board context to find objects to connect
- MULTI_STEP - requires orchestration
- **CONTENT GENERATION - requires AI to generate meaningful content based on a topic**
  * Triggers: "for [topic]", "about [topic]", "on [topic]", "comparing [X] vs [Y]"
  * Examples:
    - "create sticky notes for project planning" → needs agent to generate planning-related content
    - "create 2x3 grid of sticky notes for thinking vs critical thinking" → needs agent to compare concepts
    - "add sticky notes about marketing strategy" → needs agent to generate strategy points
    - "create shapes for product roadmap" → needs agent to generate roadmap stages
  * If detected, set isMultiStep=true to route to agent system

For these operations, classify them but return isMultiStep=true or operation specific so the router can hand off to the appropriate agent.

**OBJECT TYPES:**
- "star", "circle", "rectangle", "triangle" → objectType=shape, shapeType=[star/circle/rect/triangle]
  * **For filtering (targetFilter), ALWAYS use shapeType directly, not objectType='shape'**
  * Example: "how many stars" → targetFilter={type:'star'} OR targetFilter={shapeType:'star'}
  * Example: "pink stars" → targetFilter={type:'star', color:'pink'} OR targetFilter={shapeType:'star', color:'pink'}
- "sticky note", "note" → objectType=sticky (also used in targetFilter)
- "text" → objectType=text (also used in targetFilter)
- "text bubble", "text box" → objectType=textBubble (also used in targetFilter)
- "frame" → objectType=frame (also used in targetFilter)

**CRITICAL RULES:**
1. **CREATE always wins over CHANGE_COLOR**: If command has "create", "add", "make", "draw", or "generate" → operation=CREATE (even if "color" keyword appears)
2. **CREATE always wins over UPDATE**: If command STARTS with "add", "create", "make" → operation=CREATE (NOT UPDATE), even if "says" or "write" appears later
3. **"add/create X that says Y" = CREATE with text Y** (NOT UPDATE)
4. If quantity specified → it's CREATE, NOT modification
5. Color must be converted to hex for shapes
6. "a" or "one" = quantity:1
7. Always extract ALL mentioned parameters
8. For CREATE operations with quantity, operation=CREATE (not CHANGE_COLOR)
9. **"create X and color them Y" = CREATE with color parameter (NOT multi-step)**
10. **"create X green" or "create green X" = CREATE with color parameter**
11. **"create X with [any color phrase]" = CREATE operation (NOT CHANGE_COLOR)**
12. **"these", "this", "them", "those" = useSelection:true (ignore any object type mentioned)**
13. **"write X in Y" = UPDATE operation (modifies existing objects) - ONLY if command does NOT start with create/add/make**
14. **"write" keyword means UPDATE only when targeting existing objects ("in all X", "in the Y")**
15. **Content generation detected**: If command has "for [topic]", "about [topic]", "on [topic]", "[X] vs [Y]" → set isMultiStep=true (needs agent reasoning)

Examples:

User: "create 2 stars and color them green"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 2,
  "color": "#10B981"
}

User: "add 5 red circles"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 5,
  "color": "#EF4444"
}

User: "create 5 sticky notes which all should be different color"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 5,
  "color": "random"
}

User: "create 9 sticky notes with random color and write I love hotdogs in them"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 9,
  "text": "I love hotdogs",
  "color": "random"
}

User: "add 6 circles with different colors"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 6,
  "color": "random"
}

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

User: "add a yellow sticky note that says 'User Research'"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 1,
  "color": "yellow",
  "text": "User Research"
}
Note: Command STARTS with "add" → always CREATE, not UPDATE. Extract text from "says 'X'" or "that says X".

User: "create a circle that says 'Hello'"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 1,
  "text": "Hello"
}
Note: Command STARTS with "create" → always CREATE. Shapes can have text labels inside them.

User: "color all circles blue"
{
  "operation": "CHANGE_COLOR",
  "targetFilter": { "type": "circle" },
  "color": "#3B82F6"
}

User: "color these stars pink"
{
  "operation": "CHANGE_COLOR",
  "targetFilter": { "useSelection": true },
  "color": "#EC4899"
}

User: "make this red"
{
  "operation": "CHANGE_COLOR",
  "targetFilter": { "useSelection": true },
  "color": "#EF4444"
}

User: "write 'upcoming' in all pink notes"
{
  "operation": "UPDATE",
  "text": "upcoming",
  "targetFilter": { "type": "sticky", "color": "pink" }
}

User: "write Stars in both yellow stars"
{
  "operation": "UPDATE",
  "text": "Stars",
  "targetFilter": { "type": "star", "color": "yellow" }
}

User: "update all rectangles to say hello"
{
  "operation": "UPDATE",
  "text": "hello",
  "targetFilter": { "type": "rect" }
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

User: "how many pink stars"
{
  "operation": "ANALYZE",
  "objectType": "shape",
  "shapeType": "star",
  "targetFilter": { "shapeType": "star", "color": "pink" }
}

User: "count yellow circles"
{
  "operation": "ANALYZE",
  "objectType": "shape",
  "shapeType": "circle",
  "targetFilter": { "shapeType": "circle", "color": "yellow" }
}

User: "how many stars are in the board"
{
  "operation": "ANALYZE",
  "objectType": "shape",
  "shapeType": "star",
  "targetFilter": { "shapeType": "star" }
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
}

User: "create a 2x3 grid of sticky notes for thinking vs critical thinking"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 6,
  "rows": 2,
  "columns": 3,
  "isMultiStep": true
}
Note: isMultiStep=true because "for thinking vs critical thinking" requires AI reasoning to generate content.

User: "add sticky notes about marketing strategy"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "isMultiStep": true
}
Note: "about marketing strategy" requires content generation, route to agent.

User: "create 5 sticky notes"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 5
}
Note: No topic/content generation needed, can execute directly.

User: "create 3 sticky notes"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 3
}
Note: Quantity is explicitly extracted from the command. No color specified = use default (yellow).`,
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
      
      // Convert color name to hex (but preserve "random" as-is)
      const color = intent.color && intent.color !== 'random' ? colorNameToHex(intent.color) : intent.color;
      
      // Check if user has a frame selected (for "create X inside this frame")
      let selectedFrameId = null;
      if (intent.targetFilter?.useSelection && boardState?.selectedIds && boardState.selectedIds.length > 0) {
        console.log(`🔍 [Frame Context] Checking selection for frame...`);
        console.log(`   Selected IDs: ${JSON.stringify(boardState.selectedIds)}`);
        
        // Find if any selected object is a frame
        const selectedFrame = boardState.objects?.find(obj => 
          boardState.selectedIds.includes(obj.id) && obj.type === 'frame'
        );
        if (selectedFrame) {
          selectedFrameId = selectedFrame.id;
          console.log(`📦 [Frame Context] Creating objects inside selected frame: ${selectedFrameId}`);
        } else {
          console.log(`⚠️  [Frame Context] Selection exists but no frame found`);
          console.log(`   Selected object types: ${boardState.objects?.filter(o => boardState.selectedIds.includes(o.id)).map(o => o.type).join(', ')}`);
        }
      } else {
        console.log(`ℹ️  [Frame Context] No frame selection detected (useSelection: ${intent.targetFilter?.useSelection}, selectedIds: ${boardState?.selectedIds?.length || 0})`);
      }
      
      if (intent.objectType === 'shape' && intent.shapeType) {
        // Create shape(s) - single tool call with quantity parameter
        const args = {
          type: intent.shapeType,
        };
        
        // Add color if specified (now converted to hex)
        // CRITICAL: If color is "random", OMIT it entirely so client cycles through colors
        if (color && color !== 'random') {
          args.color = color;
        }
        
        // Add frameId if a frame is selected
        if (selectedFrameId) {
          args.frameId = selectedFrameId;
          console.log(`✅ [Frame Context] Added frameId to createShape: ${selectedFrameId}`);
        }
        
        // Add quantity if > 1
        if (quantity > 1) {
          args.quantity = quantity;
          
          // Add grid dimensions if specified
          if (intent.rows) args.rows = intent.rows;
          if (intent.columns) args.columns = intent.columns;
        }
        
        // Add coordinates if specified (only for single objects)
        if (quantity === 1 && intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        // Add dimensions if specified
        if (intent.dimensions) {
          args.width = intent.dimensions.width;
          args.height = intent.dimensions.height;
        }
        
        toolCalls.push({
          id: 'create_shapes',
          name: 'createShape',
          arguments: args,
        });
      } else if (intent.objectType === 'sticky') {
        // Create sticky note(s) - single tool call with quantity parameter
        const args = {
          text: intent.text || '',
        };
        
        // Sticky notes can use color names, but normalize them
        // CRITICAL: If color is "random", OMIT it entirely so client cycles through colors
        if (color && color !== 'random') {
          args.color = color;
        }
        
        // Add frameId if a frame is selected
        if (selectedFrameId) {
          args.frameId = selectedFrameId;
          console.log(`✅ [Frame Context] Added frameId to createStickyNote: ${selectedFrameId}`);
        }
        
        // Add quantity if > 1
        if (quantity > 1) {
          args.quantity = quantity;
          
          // Add grid dimensions if specified
          if (intent.rows) args.rows = intent.rows;
          if (intent.columns) args.columns = intent.columns;
        }
        
        // Add coordinates if specified (only for single objects)
        if (quantity === 1 && intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        toolCalls.push({
          id: 'create_stickies',
          name: 'createStickyNote',
          arguments: args,
        });
      } else if (intent.objectType === 'frame') {
        const args = {
          title: intent.text || 'Frame',
        };
        
        // If user has objects selected and is creating a frame, wrap the frame around selected objects
        if (intent.targetFilter?.useSelection && boardState?.selectedIds && boardState.selectedIds.length > 0) {
          console.log(`📦 [Frame Context] Creating frame around ${boardState.selectedIds.length} selected objects`);
          console.log(`   Selected IDs: ${JSON.stringify(boardState.selectedIds)}`);
          
          // Calculate bounding box of selected objects
          const selectedObjects = boardState.objects?.filter(obj => 
            boardState.selectedIds.includes(obj.id)
          ) || [];
          
          if (selectedObjects.length > 0) {
            // Find min/max coordinates
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            for (const obj of selectedObjects) {
              if (obj.type === 'line') continue; // Skip lines
              
              let objMinX = obj.x;
              let objMinY = obj.y;
              let objMaxX = obj.x;
              let objMaxY = obj.y;
              
              if (obj.type === 'circle') {
                const radius = obj.radius || 50;
                objMinX = obj.x - radius;
                objMinY = obj.y - radius;
                objMaxX = obj.x + radius;
                objMaxY = obj.y + radius;
              } else if (obj.type === 'star') {
                objMaxX = obj.x + (obj.width || 180);
                objMaxY = obj.y + (obj.height || 180);
              } else if (obj.width && obj.height) {
                objMaxX = obj.x + obj.width;
                objMaxY = obj.y + obj.height;
              }
              
              console.log(`   Object ${obj.id} (${obj.type}): min(${objMinX}, ${objMinY}) max(${objMaxX}, ${objMaxY})`);
              
              minX = Math.min(minX, objMinX);
              minY = Math.min(minY, objMinY);
              maxX = Math.max(maxX, objMaxX);
              maxY = Math.max(maxY, objMaxY);
            }
            
            console.log(`   Combined bounds: min(${minX}, ${minY}) max(${maxX}, ${maxY})`);
            
            // Add padding
            const PADDING = 40;
            args.x = minX - PADDING;
            args.y = minY - PADDING;
            args.width = (maxX - minX) + (PADDING * 2);
            args.height = (maxY - minY) + (PADDING * 2);
            
            console.log(`✅ [Frame Context] Frame bounds calculated: (${args.x}, ${args.y}), size: ${args.width}x${args.height}`);
          }
        }
        
        // Add quantity if > 1
        if (quantity > 1) {
          args.quantity = quantity;
          
          // Add grid dimensions if specified
          if (intent.rows) args.rows = intent.rows;
          if (intent.columns) args.columns = intent.columns;
        }
        
        // Add coordinates if specified (only for single objects, and not already calculated from selection)
        if (quantity === 1 && intent.coordinates && !args.x) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        if (intent.dimensions) {
          args.width = intent.dimensions.width;
          args.height = intent.dimensions.height;
        }
        
        toolCalls.push({
          id: 'create_frames',
          name: 'createFrame',
          arguments: args,
        });
      } else if (intent.objectType === 'text') {
        const args = {
          text: intent.text || '',
        };
        
        // Add quantity if > 1
        if (quantity > 1) {
          args.quantity = quantity;
          
          // Add grid dimensions if specified
          if (intent.rows) args.rows = intent.rows;
          if (intent.columns) args.columns = intent.columns;
        }
        
        // Add coordinates if specified (only for single objects)
        if (quantity === 1 && intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        toolCalls.push({
          id: 'create_texts',
          name: 'createText',
          arguments: args,
        });
      } else if (intent.objectType === 'textBubble') {
        const args = {
          text: intent.text || '',
        };
        
        // Add quantity if > 1
        if (quantity > 1) {
          args.quantity = quantity;
          
          // Add grid dimensions if specified
          if (intent.rows) args.rows = intent.rows;
          if (intent.columns) args.columns = intent.columns;
        }
        
        // Add coordinates if specified (only for single objects)
        if (quantity === 1 && intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        }
        
        if (intent.dimensions) {
          args.width = intent.dimensions.width;
          args.height = intent.dimensions.height;
        }
        
        toolCalls.push({
          id: 'create_textbubbles',
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
        const args = {
          objectId: obj.id,
        };
        
        // Prefer direction over coordinates (viewport-aware)
        if (intent.direction) {
          args.direction = intent.direction;
        } else if (intent.coordinates) {
          args.x = intent.coordinates.x;
          args.y = intent.coordinates.y;
        } else {
          // Fallback: no movement specified
          console.warn(`⚠️  MOVE operation missing direction or coordinates for object ${obj.id}`);
          return;
        }
        
        toolCalls.push({
          id: `move_${i}`,
          name: 'moveObject',
          arguments: args,
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
    
    case 'UPDATE': {
      // Update text content of objects
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      
      if (!intent.text) {
        console.warn(`⚠️  UPDATE operation missing text content`);
        return null;
      }
      
      targets.forEach((obj, i) => {
        toolCalls.push({
          id: `update_${i}`,
          name: 'updateText',
          arguments: {
            objectId: obj.id,
            newText: intent.text,
          },
        });
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
  
  // Filter by type or shapeType
  // Intent classifier uses objectType='shape' + shapeType='star'
  // But actual objects have type='star' directly
  // So we need to check: targetFilter.type OR targetFilter.shapeType
  if (targetFilter.shapeType) {
    // Shape-specific filter (e.g., star, circle, rect, triangle)
    matches = matches.filter(obj => obj.type === targetFilter.shapeType);
  } else if (targetFilter.type) {
    // Generic type filter
    // If type='shape', match any shape type (rect, circle, triangle, star)
    if (targetFilter.type === 'shape') {
      matches = matches.filter(obj => 
        obj.type === 'rect' || 
        obj.type === 'circle' || 
        obj.type === 'triangle' || 
        obj.type === 'star'
      );
    } else {
      matches = matches.filter(obj => obj.type === targetFilter.type);
    }
  }
  
  // Filter by color (check both 'color' and 'fill' fields)
  if (targetFilter.color) {
    const targetColorHex = colorNameToHex(targetFilter.color);
    const targetColorLower = targetFilter.color.toLowerCase();
    
    matches = matches.filter(obj => {
      // Direct match (exact color value)
      if (obj.color === targetFilter.color || obj.fill === targetFilter.color) {
        return true;
      }
      
      // Hex match (convert target color to hex if needed)
      if (obj.color === targetColorHex || obj.fill === targetColorHex) {
        return true;
      }
      
      // Handle sticky note color names (yellow, pink, blue, green, orange)
      const stickyColors = {
        'yellow': '#FFF59D',
        'pink': '#F48FB1',
        'blue': '#81D4FA',
        'green': '#A5D6A7',
        'orange': '#FFCC80',
      };
      
      // Check if object has a sticky note color that matches the target
      if (obj.color && stickyColors[targetColorLower] === obj.color) {
        return true;
      }
      
      return false;
    });
  }
  
  // Use selection if specified
  if (targetFilter.useSelection && boardState.selectedIds) {
    matches = matches.filter(obj => boardState.selectedIds.includes(obj.id));
  }
  
  return matches;
}
