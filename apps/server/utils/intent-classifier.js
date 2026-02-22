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
            enum: ['CREATE', 'UPDATE', 'DELETE', 'MOVE', 'RESIZE', 'ROTATE', 'CHANGE_COLOR', 'ARRANGE', 'ANALYZE', 'CONNECT', 'FIT_FRAME_TO_CONTENTS', 'MULTI_STEP', 'CREATIVE', 'CONVERSATION', 'UNKNOWN'],
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
            description: 'Color as hex code (#EF4444), name (red, blue, green), or "random" for varied colors. When user asks for "different colors", "varied colors", "random colors" - return "random"',
          },
          colors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of specific colors when user requests multiple specific colors (e.g., "create 3 red, blue, and green circles" = ["#EF4444", "#3B82F6", "#10B981"]). Leave empty if color is "random"',
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
            description: 'Direction: "left", "right", "up", "down", or "to frame" when user says "move X to the frame" / "move all Y into the frame"',
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
          creativeDescription: {
            type: 'string',
            description: 'When operation=CREATIVE, a brief description of what the user wants to visually compose (e.g., "kanban board with 3 columns", "multi-story building")',
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
- cyan → "#06B6D4"
- teal → "#14B8A6"
- indigo → "#6366F1"
- lime → "#84CC16"
- amber → "#F59E0B"
- For sticky notes: yellow/pink/blue/green/orange (names OK for sticky notes only)
- For shapes: ALWAYS use hex codes
- **Creative/non-standard color names**: Convert to closest hex code:
  * "lemon lime", "lime green", "chartreuse" → "#84CC16"
  * "grape", "violet", "plum" → "#8B5CF6"
  * "coral", "salmon" → "#F87171"
  * "sky blue", "baby blue" → "#38BDF8"
  * "navy", "dark blue" → "#1E40AF"
  * "gold", "golden" → "#EAB308"
  * "mint", "seafoam" → "#34D399"
  * "burgundy", "maroon", "wine" → "#991B1B"
  * "peach" → "#FDBA74"
  * "lavender" → "#C4B5FD"
  * "turquoise" → "#2DD4BF"
  * For any other creative color name, pick the closest hex code you know

**CRITICAL - Color Variation Handling:**
When user requests varied/different/random colors:
  * "random color", "different color", "different colors", "varied colors", "various colors", "all should be different color", "each a different color"
  * SET color: "random" AND colors: ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"] (5 vibrant colors for cycling)
  * Example: "create 5 sticky notes which all should be different color" → color: "random", colors: ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
  * Example: "create 9 sticky notes with random color" → color: "random", colors: ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
  * Example: "add 6 circles with different colors" → color: "random", colors: ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
  * The "random" string tells executor to cycle, colors array provides the palette
  
**Specific Multiple Colors:**
When user specifies exact colors for multiple objects:
  * "create 3 circles: one red, one blue, one green" → colors: ["#EF4444", "#3B82F6", "#10B981"]
  * "create 4 sticky notes: red, blue, green, yellow" → colors: ["#EF4444", "#3B82F6", "#10B981", "#EAB308"]
  * In this case, DO NOT set color="random", only populate colors array

**QUANTITY PARSING:**
- "a circle" = 1
- "50 stars" = 50
- "3 sticky notes" = 3
- "create stars" (no number) = 1
- "some circles" = 3 (reasonable default)
- **CRITICAL: Always extract the number when present** (e.g., "create 3 X" → quantity:3)
- **CRITICAL - Multiple Groups with Different Colors (EVERY WORD MATTERS):**
  When the user specifies different quantities of different colors, you MUST:
  1. Sum ALL quantities to get total quantity
  2. Build a colors array that repeats each hex color exactly by its count
  3. Do NOT set color="random" — use the explicit colors array
  4. Do NOT ignore any color group — parse EVERY group mentioned
  
  Pattern: "N [color1] and M [color2]" or "N [color1], M [color2]"
  * "25 green and 25 white" → quantity: 50, colors: [25x "#10B981", 25x "#FFFFFF"]
  * "4 blue stars, 3 pink stars" → quantity: 7, colors: [4x "#3B82F6", 3x "#EC4899"]
  * "2 red circles, 5 green circles" → quantity: 7, colors: [2x "#EF4444", 5x "#10B981"]
  * "one blue, 3 pink" → quantity: 4, colors: [1x "#3B82F6", 3x "#EC4899"]
  * "10 red, 10 blue, 10 green" → quantity: 30, colors: [10x "#EF4444", 10x "#3B82F6", 10x "#10B981"]
  * "create 50 stars, 25 green and 25 white" → quantity: 50, colors: [25x "#10B981", 25x "#FFFFFF"]
  * Total quantity = sum of all groups
  * Colors array = repeat each color hex by its count in order
  * NEVER ignore the color breakdown — if user says "25 green and 25 white", you MUST produce exactly 25 green hex codes followed by 25 white hex codes
- **GRID PATTERNS:**
  * "7x2 grid" or "7×2 grid" → rows:7, columns:2, quantity:14
  * "4x3 grid of circles" → rows:4, columns:3, quantity:12
  * "1 row 5 columns" → rows:1, columns:5, quantity:5
  * "create 8 stars" (no grid) → quantity:8 (no rows/columns, auto-calculated)

**CONVERSATIONAL QUERIES (NOT COMMANDS):**
- **CONVERSATION**: User is chatting, asking questions, or making conversation (NOT giving whiteboard commands)
  * Greetings: "hello", "hi", "hey", "good morning"
  * Questions about you: "who are you?", "what can you do?", "help"
  * Casual chat: "tell me a joke", "how are you?", "thanks", "thank you"
  * General questions: "what is X?", "explain Y", "tell me about Z" (when NOT about the board)
  * If it's a conversation/question and NOT a whiteboard command → operation=CONVERSATION
  * Examples:
    - "hello" → operation=CONVERSATION
    - "tell me a joke" → operation=CONVERSATION
    - "what can you do?" → operation=CONVERSATION
    - "thanks!" → operation=CONVERSATION
    - "how are you?" → operation=CONVERSATION

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
  * **CRITICAL - Frame Around Object Type: If user says "create frame around [object type]" (e.g. "sticky notes", "circles", "all rectangles") with NO "these/selected/this" → set targetFilter by TYPE so the system finds those objects on the board. Do NOT set useSelection:true.**
  * **This tells the system to create objects inside the selected frame (if a frame is selected), wrap a frame around selected objects (if these/selected), or wrap a frame around all objects of that type (if type specified).**
  * Examples:
    - "create 5 sticky notes with random color" → operation=CREATE (NOT CHANGE_COLOR)
    - "add 9 circles with different colors" → operation=CREATE (NOT CHANGE_COLOR)
    - "make sticky notes with blue color" → operation=CREATE (NOT CHANGE_COLOR)
    - "create 2 stars inside this" → operation=CREATE, shapeType=star, quantity=2, targetFilter={useSelection:true}
    - "add 3 circles in this frame" → operation=CREATE, shapeType=circle, quantity=3, targetFilter={useSelection:true}
    - "create sticky notes here" → operation=CREATE, objectType=sticky, targetFilter={useSelection:true}
    - "create a frame around these" → operation=CREATE, objectType=frame, targetFilter={useSelection:true}
    - "add frame surrounding selected objects" → operation=CREATE, objectType=frame, targetFilter={useSelection:true}
    - "create a frame around sticky notes" → operation=CREATE, objectType=frame, targetFilter={type:'sticky'}
    - "add frame around all circles" → operation=CREATE, objectType=frame, targetFilter={shapeType:'circle'}
    - "frame around the rectangles" → operation=CREATE, objectType=frame, targetFilter={shapeType:'rect'}
  
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
  * **"move all sticky notes to the frame"** → operation=MOVE, direction="to frame", targetFilter={type:'sticky'}
  * **"move these into the frame"** → operation=MOVE, direction="to frame", targetFilter={useSelection:true}
  
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

- **CREATIVE**: User describes a **concept, scene, diagram, real-world object, or composition** rather than a literal whiteboard primitive. The user wants the AI to figure out WHAT objects to create and HOW to arrange them.
  * **Key distinction:** CREATE = user names a specific whiteboard primitive (circle, rectangle, sticky note, frame, star, triangle, text). CREATIVE = user describes something that needs to be DECOMPOSED into multiple primitives.
  * **Triggers:**
    - Real-world objects: "building", "house", "car", "tree", "robot", "person", "city"
    - Diagrams/frameworks: "kanban board", "flowchart", "mind map", "org chart", "wireframe", "dashboard", "calendar"
    - Scenes/compositions: "solar system", "landscape", "classroom", "office layout"
    - Descriptive modifiers that imply composition: "multi-story", "with rooms", "with columns", "with sections", "with stages"
    - Abstract concepts visualized: "project timeline", "user flow", "architecture diagram"
  * **NOT CREATIVE (these are CREATE):**
    - "create a rectangle" → CREATE (literal primitive)
    - "create 5 circles" → CREATE (literal primitives)
    - "create a frame" → CREATE (literal primitive)
    - "create a sticky note" → CREATE (literal primitive)
    - "create a star" → CREATE (literal primitive)
    - "create a red circle" → CREATE (literal primitive with color)
  * **CREATIVE examples:**
    - "create a kanban board" → operation=CREATIVE, creativeDescription="kanban board with columns for task management"
    - "create a tall building with multiple stories" → operation=CREATIVE, creativeDescription="tall multi-story building"
    - "create a rectangle shaped tall building with multi story" → operation=CREATIVE, creativeDescription="rectangle-shaped tall multi-story building"
    - "create a flowchart for user signup" → operation=CREATIVE, creativeDescription="flowchart showing user signup process"
    - "draw a house with a garden" → operation=CREATIVE, creativeDescription="house with garden scene"
    - "make a dashboard layout" → operation=CREATIVE, creativeDescription="dashboard layout with sections"
    - "create a mind map about productivity" → operation=CREATIVE, creativeDescription="mind map centered on productivity"
    - "draw a robot" → operation=CREATIVE, creativeDescription="robot figure"
    - "create a project timeline with 5 phases" → operation=CREATIVE, creativeDescription="project timeline with 5 phases"
    - "make a wireframe for a login page" → operation=CREATIVE, creativeDescription="wireframe for login page UI"
  * **CRITICAL:** Always include creativeDescription when operation=CREATIVE
  * **CRITICAL - Frame Context for CREATIVE:** If user says "create X inside/in/within this/the frame", STILL set targetFilter={useSelection:true} alongside operation=CREATIVE. This tells the system to compose objects inside the selected frame.
  * Examples with frame context:
    - "create a cooking recipe within frame with sticky notes" → operation=CREATIVE, creativeDescription="cooking recipe for a new dish using sticky notes", targetFilter={useSelection:true}
    - "create a kanban board inside this frame" → operation=CREATIVE, creativeDescription="kanban board with columns", targetFilter={useSelection:true}
    - "make a flowchart in the frame" → operation=CREATIVE, creativeDescription="flowchart", targetFilter={useSelection:true}

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
9. **"create X and color them Y" = CREATE with color parameter (NOT multi-step). Also: "create X all random colors", "create X with different colors", "create X each a different color", "create X with varied colors" = CREATE with color:"random" (NEVER multi-step, NEVER isMultiStep=true)**
10. **"create X green" or "create green X" = CREATE with color parameter**
11. **"create X with [any color phrase]" = CREATE operation (NOT CHANGE_COLOR)**
12. **"these", "this", "them", "those" = useSelection:true (ignore any object type mentioned)**
13. **"write X in Y" = UPDATE operation (modifies existing objects) - ONLY if command does NOT start with create/add/make**
14. **"write" keyword means UPDATE only when targeting existing objects ("in all X", "in the Y")**
15. **Content generation detected**: If command has "for [topic]", "about [topic]", "on [topic]", "[X] vs [Y]" → set isMultiStep=true (needs agent reasoning)
16. **CREATIVE vs CREATE**: If user describes a concept, scene, real-world object, or composition (not a literal whiteboard primitive) → operation=CREATIVE with creativeDescription. If user names a specific primitive (circle, rectangle, sticky note, frame, star, triangle, text) → operation=CREATE.
17. **CRITICAL - Random/different colors is NEVER multi-step**: "create N objects all random colors", "create N objects with different colors", "create N objects each a different color", "create N objects with varied colors" → operation=CREATE, color="random", isMultiStep=false. This is a SINGLE creation operation. Do NOT set isMultiStep=true. Do NOT split into create + change color. The color variation is handled by the colors array parameter.
18. **CRITICAL - Specific color groups MUST be parsed exactly**: When user says "create 50 stars, 25 green and 25 white" or "create 10 circles, 5 red and 5 blue", you MUST parse EVERY color group. Extract each (count, color) pair, sum counts for total quantity, and build the colors array by repeating each hex color exactly by its count. NEVER ignore color breakdowns. NEVER return just a single color when multiple groups are specified. This is a SINGLE CREATE operation (isMultiStep=false).

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
  "color": "random",
  "colors": ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
}

User: "create 9 sticky notes with random color and write I love hotdogs in them"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 9,
  "text": "I love hotdogs",
  "color": "random",
  "colors": ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
}

User: "add 6 circles with different colors"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 6,
  "color": "random",
  "colors": ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
}

User: "create 50 green stars"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 50,
  "color": "#10B981"
}

User: "create 50 stars all random colors"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 50,
  "color": "random",
  "colors": ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
}
Note: "all random colors" = color:"random" with colors array. This is NOT multi-step. isMultiStep must be false.

User: "create 20 circles each a different color"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 20,
  "color": "random",
  "colors": ["#EF4444", "#3B82F6", "#10B981", "#A855F7", "#F97316"]
}
Note: "each a different color" = color:"random". NOT multi-step.

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

User: "move all sticky notes to the frame" OR "move these into the frame"
{
  "operation": "MOVE",
  "direction": "to frame",
  "targetFilter": { "type": "sticky" }
}
Note: Use direction "to frame" when user wants objects moved inside a frame. Use targetFilter.type for "all sticky notes", or useSelection for "these".

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

User: "create a frame around sticky notes" OR "add a frame around all sticky notes"
{
  "operation": "CREATE",
  "objectType": "frame",
  "targetFilter": { "type": "sticky" }
}
Note: Use type in targetFilter so the system finds sticky notes on the board; do NOT use useSelection when no selection is implied.

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
Note: Quantity is explicitly extracted from the command. No color specified = use default (yellow).

User: "create 4 blue stars, 3 pink stars"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 7,
  "colors": ["#3B82F6", "#3B82F6", "#3B82F6", "#3B82F6", "#EC4899", "#EC4899", "#EC4899"]
}
Note: Total quantity = 4 + 3 = 7. Colors array repeats each color by its count.

User: "add one red circle, 5 green circles"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 6,
  "colors": ["#EF4444", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981"]
}
Note: Total quantity = 1 + 5 = 6. First color once, second color five times.

User: "create 50 stars, 25 green and 25 white"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "star",
  "quantity": 50,
  "colors": ["#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#10B981", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]
}
Note: "25 green and 25 white" = 25 + 25 = 50 total. Colors array has 25x green hex then 25x white hex. EVERY color group matters.

User: "create 10 circles, 5 red and 5 blue"
{
  "operation": "CREATE",
  "objectType": "shape",
  "shapeType": "circle",
  "quantity": 10,
  "colors": ["#EF4444", "#EF4444", "#EF4444", "#EF4444", "#EF4444", "#3B82F6", "#3B82F6", "#3B82F6", "#3B82F6", "#3B82F6"]
}
Note: 5 + 5 = 10. Colors array = 5x red then 5x blue.

User: "hello"
{
  "operation": "CONVERSATION"
}

User: "tell me a joke"
{
  "operation": "CONVERSATION"
}

User: "what can you do?"
{
  "operation": "CONVERSATION"
}

User: "create a kanban board"
{
  "operation": "CREATIVE",
  "creativeDescription": "kanban board with columns (To Do, In Progress, Done) for task management"
}

User: "create a rectangle shaped tall building with multi story"
{
  "operation": "CREATIVE",
  "creativeDescription": "rectangle-shaped tall multi-story building"
}

User: "draw a flowchart for user signup"
{
  "operation": "CREATIVE",
  "creativeDescription": "flowchart showing user signup process steps"
}

User: "make a dashboard layout"
{
  "operation": "CREATIVE",
  "creativeDescription": "dashboard layout with multiple sections and widgets"
}

User: "create a mind map about productivity"
{
  "operation": "CREATIVE",
  "creativeDescription": "mind map centered on productivity with branching subtopics"
}

User: "draw a house with a garden"
{
  "operation": "CREATIVE",
  "creativeDescription": "house with garden scene composed of shapes"
}

User: "create a project timeline with 5 phases"
{
  "operation": "CREATIVE",
  "creativeDescription": "project timeline with 5 sequential phases"
}

User: "make a wireframe for a login page"
{
  "operation": "CREATIVE",
  "creativeDescription": "wireframe mockup of a login page UI"
}

User: "create a kanban style task board"
{
  "operation": "CREATIVE",
  "creativeDescription": "kanban-style task board with columns for workflow stages"
}

User: "draw a robot"
{
  "operation": "CREATIVE",
  "creativeDescription": "robot figure composed of geometric shapes"
}

User: "create a cooking recipe within frame with sticky notes for new dish from england"
{
  "operation": "CREATIVE",
  "creativeDescription": "cooking recipe layout with sticky notes for a traditional English dish, including ingredients and steps",
  "targetFilter": { "useSelection": true }
}
Note: "within frame" means compose inside the selected frame. Set targetFilter.useSelection=true.

User: "create a kanban board inside this frame"
{
  "operation": "CREATIVE",
  "creativeDescription": "kanban board with columns (To Do, In Progress, Done)",
  "targetFilter": { "useSelection": true }
}

User: "create three sticky notes inside the frame"
{
  "operation": "CREATE",
  "objectType": "sticky",
  "quantity": 3,
  "targetFilter": { "useSelection": true }
}
Note: This is CREATE (literal primitives: sticky notes), NOT CREATIVE. "inside the frame" sets useSelection=true.`,
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
  console.log('📋 Intent details:', JSON.stringify({
    operation: intent.operation,
    objectType: intent.objectType,
    shapeType: intent.shapeType,
    quantity: intent.quantity,
    color: intent.color,
    colorsLength: intent.colors?.length,
    isMultiStep: intent.isMultiStep,
  }));
  
  // CONVERSATION mode - return null to let the agent respond naturally
  if (intent.operation === 'CONVERSATION') {
    console.log('💬 Conversational query detected, routing to chat agent');
    return null;
  }
  
  // CREATIVE mode - return null to route to creative composer
  if (intent.operation === 'CREATIVE') {
    console.log('🎨 Creative command detected, routing to creative composer');
    return null;
  }
  
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
      
      // Get color palette for cycling (either from intent.colors or default)
      const colorPalette = intent.colors && Array.isArray(intent.colors) && intent.colors.length > 0
        ? intent.colors // Use LLM-provided palette
        : ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316']; // Default: red, blue, green, purple, orange
      
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
        // CRITICAL: Pass colors array if provided by intent classifier
        if (color && color !== 'random') {
          args.color = color;
        }
        
        // Pass colors array if provided (for color cycling)
        if (colorPalette && intent.colors && intent.colors.length > 0) {
          args.colors = colorPalette;
        } else if (color === 'random') {
          // Fallback: if color is "random" but no colors array, use default palette
          args.colors = colorPalette;
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
        
        console.log(`📦 [executeFromIntent] createShape args: type=${args.type}, quantity=${args.quantity}, color=${args.color}, colorsLength=${args.colors?.length}, hasColors=${!!args.colors}`);
        if (args.colors && args.colors.length > 0) {
          const unique = [...new Set(args.colors)];
          console.log(`   Colors unique: ${unique.join(', ')}, first=${args.colors[0]}, last=${args.colors[args.colors.length - 1]}`);
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
        // CRITICAL: Pass colors array if provided by intent classifier
        if (color && color !== 'random') {
          args.color = color;
        }
        
        // Pass colors array if provided (for color cycling)
        if (colorPalette && intent.colors && intent.colors.length > 0) {
          args.colors = colorPalette;
        } else if (color === 'random') {
          // Fallback: if color is "random" but no colors array, use default palette
          args.colors = colorPalette;
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
        
        // Determine objects to wrap: from selection OR from targetFilter type/shapeType (e.g. "frame around sticky notes")
        let objectsToWrap = [];
        if (intent.targetFilter?.useSelection && boardState?.selectedIds && boardState.selectedIds.length > 0) {
          objectsToWrap = boardState.objects?.filter(obj => boardState.selectedIds.includes(obj.id)) || [];
          console.log(`📦 [Frame Context] Creating frame around ${objectsToWrap.length} selected objects`);
        } else if (intent.targetFilter && (intent.targetFilter.type || intent.targetFilter.shapeType) && boardState?.objects) {
          objectsToWrap = findMatchingObjects(boardState, intent.targetFilter);
          console.log(`📦 [Frame Context] Creating frame around ${objectsToWrap.length} objects by type (targetFilter: ${JSON.stringify(intent.targetFilter)})`);
        }
        if (objectsToWrap.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const obj of objectsToWrap) {
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
            minX = Math.min(minX, objMinX);
            minY = Math.min(minY, objMinY);
            maxX = Math.max(maxX, objMaxX);
            maxY = Math.max(maxY, objMaxY);
          }
          const PADDING = 40;
          args.x = minX - PADDING;
          args.y = minY - PADDING;
          args.width = (maxX - minX) + (PADDING * 2);
          args.height = (maxY - minY) + (PADDING * 2);
          console.log(`✅ [Frame Context] Frame bounds calculated: (${args.x}, ${args.y}), size: ${args.width}x${args.height}`);
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
      const targets = findMatchingObjects(boardState, intent.targetFilter);
      const isMoveToFrame = intent.direction && String(intent.direction).toLowerCase().replace(/\s+/g, ' ') === 'to frame';

      if (isMoveToFrame && targets.length > 0) {
        // Resolve frame: selected frame, or first frame on board
        let frame = null;
        if (boardState?.selectedIds?.length === 1 && boardState?.objects) {
          frame = boardState.objects.find(o => o.id === boardState.selectedIds[0] && o.type === 'frame');
        }
        if (!frame && boardState?.objects) {
          frame = boardState.objects.find(o => o.type === 'frame');
        }
        if (!frame) {
          console.warn('⚠️  MOVE to frame: no frame found on board or selected');
          break;
        }
        const fx = frame.x ?? 0;
        const fy = frame.y ?? 0;
        const fw = Math.max(frame.width ?? 400, 200);
        const fh = Math.max(frame.height ?? 400, 200);
        const PADDING = 24;
        const innerW = fw - PADDING * 2;
        const innerH = fh - PADDING * 2;
        const N = targets.length;
        const cols = Math.ceil(Math.sqrt(N));
        const rows = Math.ceil(N / cols);
        const cellW = innerW / cols;
        const cellH = innerH / rows;
        targets.forEach((obj, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const objW = obj.width ?? 200;
          const objH = obj.height ?? 200;
          const x = fx + PADDING + col * cellW + (cellW - objW) / 2;
          const y = fy + PADDING + row * cellH + (cellH - objH) / 2;
          toolCalls.push({
            id: `move_${i}`,
            name: 'moveObject',
            arguments: { objectId: obj.id, x: Math.round(x), y: Math.round(y) },
          });
        });
        console.log(`✅ [MOVE to frame] Moving ${targets.length} objects into frame ${frame.id}`);
      } else {
        targets.forEach((obj, i) => {
          const args = { objectId: obj.id };
          if (intent.direction && ['left', 'right', 'up', 'down'].includes(String(intent.direction).toLowerCase())) {
            args.direction = intent.direction.toLowerCase();
          } else if (intent.coordinates) {
            args.x = intent.coordinates.x;
            args.y = intent.coordinates.y;
          } else {
            console.warn(`⚠️  MOVE operation missing direction or coordinates for object ${obj.id}`);
            return;
          }
          toolCalls.push({ id: `move_${i}`, name: 'moveObject', arguments: args });
        });
      }
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
      const useSelection = intent.targetFilter?.useSelection && boardState?.selectedIds?.length > 0;

      // When user selected a single frame and said "space sticky notes to grid" → arrange contents inside the frame
      if (useSelection && targets.length === 1 && targets[0].type === 'frame') {
        const frame = targets[0];
        const containedIds = Array.isArray(frame.containedObjectIds) ? frame.containedObjectIds : [];
        if (containedIds.length > 0) {
          toolCalls.push({
            id: 'arrange_0',
            name: intent.method === 'resize' ? 'arrangeInGridAndResize' : 'arrangeInGrid',
            arguments: {
              objectIds: containedIds,
              frameId: frame.id,
            },
          });
        } else {
          // Frame has no containedObjectIds (e.g. legacy data) — let agent resolve from board state
          console.log('ℹ️  [ARRANGE] Single frame selected but no containedObjectIds, falling through to agent');
          return null;
        }
      } else if (targets.length > 0) {
        // Normal case: arrange the selected (or matched) objects
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
