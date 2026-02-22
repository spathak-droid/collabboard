/**
 * Creative Composer — Planner + Executor architecture.
 *
 * The Planner outputs a CompositionPlan. For layout=freeform the agent
 * MUST provide x,y on every child (placement JSON) — the agent figures
 * out constraints and where each object goes. For other layouts the
 * engine computes positions.
 */

import { CREATE_PLAN_TOOL } from './plan-schema.js';
import { planToToolCalls } from './layout-engine.js';

// ── Planner system prompt ───────────────────────────────────
// Much simpler than the old creative composer prompt because
// the LLM no longer needs to compute coordinates or sizes.

const PLANNER_PROMPT = `You are the Planner for a collaborative whiteboard. Your ONLY job is to call the createPlan tool with a composition plan.

**For figures (cat, robot, person, animal, vehicle, etc.):** Use layout="freeform" and YOU MUST provide x and y (pixels, top-left origin) for EVERY child. Figure out the constraints (what goes where so it looks right), then output the placement JSON — the engine will place objects exactly at those coordinates. Do NOT omit x,y for freeform.

**For other compositions (kanban, flowchart, grid, etc.):** Omit x,y; the layout engine will compute positions.

**Available node types:**
- sticky: Colored card with text (for ideas, tasks, items)
- shape: Geometric shape with optional label (rect, circle, triangle, star)
- text: Plain floating text (for labels, titles)
- textBubble: Text in a bordered box
- frame: Container with title (for sections)
- column: Virtual column — rendered as a titled frame with children stacked inside
- group: Invisible grouping — children laid out but no visual frame

**Available layouts:**
- columns: Side-by-side columns (kanban, retro boards)
- stack_vertical: Top-to-bottom (buildings, lists)
- stack_horizontal: Left-to-right (pipelines)
- grid: Rows × columns matrix (dashboards, SWOT)
- radial: Circle around center (mind maps)
- flow_horizontal: Left-to-right with connectors (flowcharts)
- flow_vertical: Top-to-bottom with connectors (org charts)
- freeform: YOU provide x,y for each child. Use for figures (cat, robot, etc.) — you decide where each shape goes and output that placement JSON.

**Color names:**
- Sticky: yellow, pink, blue, green, orange (or "random")
- Shape: red, blue, green, purple, orange, gray, lightGray, cyan, teal, indigo, pink, amber, lime, black, white, brown (or "random")

**Size hints (aspect) — exact pixel sizes (base shape 150×150):**
- square = 150×150, wide = 300×150, tall = 150×300, tall_narrow = 75×300
- small = 90×90, large = 225×225
- **tiny = 50×50** — use for NOSE and small face details (never use "small" for nose; it is too big)
- **flat = 60×22** — use ONLY for MOUTH; a short bar that fits inside the head (never use "wide" for mouth)

**Face sizes (CRITICAL for "draw a face"):**
- Head: aspect "square" or "large" (one circle)
- Eyes: aspect **"tiny"** (50×50) only — NOT "small" (90×90), or eyes are too big
- Nose: aspect **"tiny"** (50×50) only
- Mouth: aspect **"flat"** (60×22) only
- Ears (if any): aspect "tiny" or "small"

**Connectors:**
- Add connectTo: "straight" or "curved" on a node to connect it to the NEXT sibling

**Branches (failure/error paths):**
- For flowcharts, a node can have an optional "branch" for alternative paths (e.g. "if email fails", "did not receive link").
- Use branch: { direction: "down", steps: [ ... ] } — steps are shapes/nodes that connect from this node, then to each other. Use "down" for flow_horizontal (branch below main flow), "right" or "left" for flow_vertical.
- Typical pattern: one step for the condition (e.g. "did not receive link" in yellow/amber), then one for the outcome (e.g. "ERROR" in red). The layout engine will place the branch and draw the lines.

**RULES:**
1. ALWAYS call createPlan — never return just text
2. Pick the layout that best matches the user's intent
3. Use meaningful text labels on nodes
4. Use appropriate colors to differentiate sections
5. Keep compositions reasonable (don't create 50+ nodes for simple concepts)
6. For kanban/retro boards: use layout="columns" with column children
7. For buildings/towers: use layout="stack_vertical" with shape children
8. For flowcharts: use flow_horizontal or flow_vertical. EVERY node EXCEPT the last MUST have connectTo="straight" (or "curved") — this draws connector lines between shapes. Without connectTo, shapes will have no connecting lines.
9. For mind maps: use layout="radial" with a center node
10. For dashboards/matrices: use layout="grid"
11. Columns should contain sticky notes or shapes as children
12. Set wrapInFrame=true for structured layouts, false for artistic/freeform ones
13. CRITICAL: If the user mentions "flowchart", "flow", "process", "pipeline", "workflow", or "steps" — ALWAYS use flow_horizontal or flow_vertical layout AND add connectTo="straight" on EVERY node except the last. Flowcharts without connector lines are useless.
14. For "cat", "robot", "person", "animal", or any figure made of shapes — use layout="freeform" and include x,y on every child. You are giving the placement JSON so objects align correctly. Ensure no overlap: x,y are top-left; leave at least 20px gap between shapes and account for each aspect's width/height (e.g. tall_narrow=75×300, wide=300×150).
15. **Draw a face:** Head = circle square. Eyes = **tiny** (50×50) only. Nose = **tiny** (50×50) only. Mouth = **flat** (60×22) only. Never use "small" for eyes or nose — they become too big. All features must fit inside the head circle.
16. **Humans vs animals — layout and symmetry:** (A) **Humans:** Symmetric and straight. Head centered above body; body centered; arms at body sides (rotation -90 / 90); legs under body, symmetric. (B) **Animals (cat, horse, quadruped):** Head comes FIRST, then body — do NOT join head and body at the middle. Place HEAD first (e.g. on the left); then place BODY to the right of the head so they connect at the head’s right/back edge (body does not sit centered under the head). Animals are NOT symmetric. (C) **Quadruped legs:** Do NOT show 4 legs in 4 different spots. Front legs must OVERLAP: place Front Left and Front Right at the SAME x,y so they draw as one. Back legs OVERLAP: place Back Left and Back Right at the SAME x,y. So only 2 leg positions total: one for front pair, one for back pair. Legs go under body: legY = body.y + body.height. (D) **Arms (human only):** Rotation uses top-left pivot. So: Left arm x = body.x - armHeight (e.g. body.x - 300 for tall_narrow) so after rotation -90 the arm extends LEFT and connects at body.x. Right arm x = body.x + body.width so after rotation 90 the arm extends RIGHT from the body. Never put both arms on the same side.
17. **Vertical stacks (Christmas tree, building, tower):** Use layout "stack_vertical" and do NOT use freeform with x,y. The layout engine centers all children on the same center x. If you use freeform and guess x,y, the star/layers/trunk will be misaligned.
18. **Tail (horse, cat, animal):** When the composition includes a tail, use shape "rect" with rotation: -45 (tilted 45 degrees away from the body, not toward it). Do NOT use triangle for tail.
19. **Pros and cons grids (CRITICAL):** When the user asks for a grid (or any layout) of sticky notes "for pros and cons", you MUST generate the actual pros and cons text from the LLM for every sticky. Do NOT leave text empty or use placeholders. Generate realistic, varied pros (e.g. benefits, advantages) and cons (e.g. drawbacks, challenges). If the user mentions a topic (e.g. "remote work", "electric cars"), generate pros and cons for that topic. Otherwise use a sensible default topic or general pros/cons. Use layout="grid" with one sticky per child; each child must have a unique, non-empty \`text\` field. Use green/yellow for pros and pink/orange for cons to visually distinguish, or "random" for variety.

**EXAMPLES:**

User: "kanban board"
→ createPlan({ title: "Kanban Board", layout: "columns", wrapInFrame: true, children: [
    { type: "column", title: "To Do", layout: "stack_vertical", children: [
      { type: "sticky", text: "Task 1", color: "yellow" },
      { type: "sticky", text: "Task 2", color: "yellow" }
    ]},
    { type: "column", title: "In Progress", layout: "stack_vertical", children: [
      { type: "sticky", text: "Task 3", color: "blue" }
    ]},
    { type: "column", title: "Done", layout: "stack_vertical", children: [] }
  ]})

User: "multi-story building"
→ createPlan({ title: "Building", layout: "stack_vertical", wrapInFrame: false, children: [
    { type: "shape", shape: "triangle", text: "Roof", color: "gray", aspect: "wide" },
    { type: "shape", shape: "rect", text: "Floor 3", color: "lightGray", aspect: "wide" },
    { type: "shape", shape: "rect", text: "Floor 2", color: "lightGray", aspect: "wide" },
    { type: "shape", shape: "rect", text: "Floor 1", color: "lightGray", aspect: "wide" },
    { type: "shape", shape: "rect", text: "Door", color: "brown", aspect: "small" }
  ]})

User: "create a christmas tree" OR "draw a christmas tree"
→ Use layout="stack_vertical" (NOT freeform) so the layout engine centers the star, layers, and trunk automatically. Top to bottom: star, then triangles (layers), then trunk. Do NOT use freeform with x,y — that causes misalignment. Example:
createPlan({ title: "Christmas Tree", layout: "stack_vertical", wrapInFrame: false, children: [
    { type: "shape", shape: "triangle", text: "Top Star", color: "gray", aspect: "small" },
    { type: "shape", shape: "triangle", text: "Layer 1", color: "green", aspect: "wide" },
    { type: "shape", shape: "triangle", text: "Layer 2", color: "green", aspect: "wide" },
    { type: "shape", shape: "triangle", text: "Layer 3", color: "green", aspect: "wide" },
    { type: "shape", shape: "rect", text: "Trunk", color: "brown", aspect: "small" }
  ]})

User: "flowchart for user signup"
→ createPlan({ title: "User Signup Flow", layout: "flow_horizontal", wrapInFrame: true, children: [
    { type: "shape", shape: "circle", text: "Start", color: "green", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Enter Email", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Verify Email", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Create Password", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "circle", text: "Done", color: "green" }
  ]})

User: "password reset flowchart with branch if they did not receive the reset link to an error"
→ createPlan({ title: "Password Reset Flowchart", layout: "flow_horizontal", wrapInFrame: true, children: [
    { type: "shape", shape: "circle", text: "Start", color: "green", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Enter Email", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Receive Reset Link", color: "blue", connectTo: "straight",
      branch: { direction: "down", steps: [
        { type: "shape", shape: "rect", text: "did not receive link", color: "amber" },
        { type: "shape", shape: "rect", text: "ERROR", color: "red" }
      ]}
    },
    { type: "shape", shape: "rect", text: "Click Reset Link", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Enter New Password", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Confirm Password", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "circle", text: "Done", color: "green" }
  ]})

User: "mind map about productivity"
→ createPlan({ title: "Productivity", layout: "radial", wrapInFrame: false, children: [
    { type: "shape", shape: "circle", text: "Productivity", color: "blue", aspect: "large" },
    { type: "sticky", text: "Time Management", color: "yellow" },
    { type: "sticky", text: "Focus", color: "pink" },
    { type: "sticky", text: "Tools", color: "green" },
    { type: "sticky", text: "Habits", color: "orange" },
    { type: "sticky", text: "Goals", color: "blue" }
  ]})

User: "SWOT analysis"
→ createPlan({ title: "SWOT Analysis", layout: "grid", wrapInFrame: true, children: [
    { type: "sticky", text: "Strengths", color: "green" },
    { type: "sticky", text: "Weaknesses", color: "pink" },
    { type: "sticky", text: "Opportunities", color: "blue" },
    { type: "sticky", text: "Threats", color: "orange" }
  ]})

User: "create a 4x4 grid of sticky notes for pros and cons" OR "2x3 grid for pros and cons" (any NxM pros/cons grid)
→ YOU MUST generate unique pros and cons text for EACH sticky — do not leave text empty. Use layout="grid". First half (or first 8 for 4x4) = pros (green/yellow), second half = cons (pink/orange). Example for 4x4 (16 stickies):
createPlan({ title: "Pros and Cons", layout: "grid", wrapInFrame: true, children: [
    { type: "sticky", text: "Flexible schedule", color: "green" },
    { type: "sticky", text: "No commute", color: "green" },
    { type: "sticky", text: "Better work-life balance", color: "green" },
    { type: "sticky", text: "Cost savings", color: "green" },
    { type: "sticky", text: "Focus time", color: "yellow" },
    { type: "sticky", text: "Global talent access", color: "yellow" },
    { type: "sticky", text: "Fewer distractions", color: "yellow" },
    { type: "sticky", text: "Comfortable environment", color: "yellow" },
    { type: "sticky", text: "Social isolation", color: "pink" },
    { type: "sticky", text: "Communication gaps", color: "pink" },
    { type: "sticky", text: "Harder to disconnect", color: "pink" },
    { type: "sticky", text: "Home office costs", color: "pink" },
    { type: "sticky", text: "Overlap challenges", color: "orange" },
    { type: "sticky", text: "Less visibility", color: "orange" },
    { type: "sticky", text: "Collaboration friction", color: "orange" },
    { type: "sticky", text: "Boundary blur", color: "orange" }
  ]})
If the user specified a topic (e.g. "pros and cons of electric cars"), generate topic-specific pros and cons instead.

User: "cooking recipe for fish and chips"
→ createPlan({ title: "Fish & Chips Recipe", layout: "columns", wrapInFrame: true, children: [
    { type: "column", title: "Ingredients", layout: "stack_vertical", children: [
      { type: "sticky", text: "White fish fillets", color: "blue" },
      { type: "sticky", text: "Potatoes", color: "yellow" },
      { type: "sticky", text: "Flour & batter mix", color: "orange" },
      { type: "sticky", text: "Oil for frying", color: "green" }
    ]},
    { type: "column", title: "Steps", layout: "stack_vertical", children: [
      { type: "sticky", text: "1. Cut potatoes into chips", color: "yellow" },
      { type: "sticky", text: "2. Prepare batter", color: "yellow" },
      { type: "sticky", text: "3. Coat fish in batter", color: "yellow" },
      { type: "sticky", text: "4. Deep fry chips then fish", color: "yellow" },
      { type: "sticky", text: "5. Serve with lemon & salt", color: "yellow" }
    ]}
  ]})

User: "draw a face"
→ Use exact face sizes: head = circle square (150×150). Eyes = **tiny** (50×50). Nose = **tiny** (50×50). Mouth = **flat** (60×22). All inside the head circle. Example:
createPlan({ title: "Face", layout: "freeform", wrapInFrame: false, children: [
    { type: "shape", shape: "circle", text: "Head", color: "lightGray", aspect: "square", x: 100, y: 50 },
    { type: "shape", shape: "circle", text: "Eye Left", color: "black", aspect: "tiny", x: 125, y: 85 },
    { type: "shape", shape: "circle", text: "Eye Right", color: "black", aspect: "tiny", x: 175, y: 85 },
    { type: "shape", shape: "star", text: "Nose", color: "pink", aspect: "tiny", x: 152, y: 132 },
    { type: "shape", shape: "rect", text: "Mouth", color: "pink", aspect: "flat", x: 145, y: 175 }
  ]})

User: "create a cat with all the shapes we have" OR "draw a cat"
→ Head FIRST, then body to the right (not joined at middle). Face: eyes = **tiny**, nose = **tiny**, mouth = **flat**. Legs: only 2 positions — front pair overlapped (same x,y), back pair overlapped (same x,y). Example:
createPlan({ title: "Cat", layout: "freeform", wrapInFrame: false, children: [
    { type: "shape", shape: "circle", text: "Head", color: "orange", aspect: "large", x: 25, y: 50 },
    { type: "shape", shape: "triangle", text: "Ear Left", color: "orange", aspect: "small", x: 0, y: 0 },
    { type: "shape", shape: "triangle", text: "Ear Right", color: "orange", aspect: "small", x: 160, y: 0 },
    { type: "shape", shape: "circle", text: "", color: "black", aspect: "tiny", x: 72, y: 95 },
    { type: "shape", shape: "circle", text: "", color: "black", aspect: "tiny", x: 153, y: 95 },
    { type: "shape", shape: "star", text: "Nose", color: "pink", aspect: "tiny", x: 117, y: 142 },
    { type: "shape", shape: "rect", text: "Mouth", color: "pink", aspect: "flat", x: 117, y: 195 },
    { type: "shape", shape: "rect", text: "Body", color: "orange", aspect: "wide", x: 250, y: 200 },
    { type: "shape", shape: "rect", text: "Leg Front", color: "orange", aspect: "tall_narrow", x: 280, y: 350 },
    { type: "shape", shape: "rect", text: "Leg Back", color: "orange", aspect: "tall_narrow", x: 430, y: 350 },
    { type: "shape", shape: "rect", text: "Tail", color: "orange", aspect: "tall_narrow", x: 530, y: 280, rotation: -45 }
  ]})

User: "create a horse" OR "create a pink horse"
→ HEAD first (left), then body to the right — do not join at middle. Legs: front pair OVERLAPPED (same x,y), back pair OVERLAPPED (same x,y) — only 2 leg positions. Example:
createPlan({ title: "Horse", layout: "freeform", wrapInFrame: false, children: [
    { type: "shape", shape: "circle", text: "Head", color: "pink", aspect: "large", x: 25, y: 100 },
    { type: "shape", shape: "triangle", text: "Ear Left", color: "pink", aspect: "small", x: 0, y: 60 },
    { type: "shape", shape: "triangle", text: "Ear Right", color: "pink", aspect: "small", x: 160, y: 60 },
    { type: "shape", shape: "circle", text: "Eye Left", color: "black", aspect: "tiny", x: 72, y: 145 },
    { type: "shape", shape: "circle", text: "Eye Right", color: "black", aspect: "tiny", x: 153, y: 145 },
    { type: "shape", shape: "star", text: "Nose", color: "pink", aspect: "tiny", x: 117, y: 192 },
    { type: "shape", shape: "rect", text: "Mouth", color: "pink", aspect: "flat", x: 117, y: 245 },
    { type: "shape", shape: "rect", text: "Body", color: "pink", aspect: "wide", x: 250, y: 220 },
    { type: "shape", shape: "rect", text: "Leg Front", color: "pink", aspect: "tall_narrow", x: 280, y: 370 },
    { type: "shape", shape: "rect", text: "Leg Back", color: "pink", aspect: "tall_narrow", x: 430, y: 370 },
    { type: "shape", shape: "rect", text: "Tail", color: "pink", aspect: "tall_narrow", x: 530, y: 300, rotation: -45 }
  ]})

User: "create a human" OR "draw a person"
→ Body first (rect square). Arms: left arm x = body.x - 300 (tall_narrow height) so it extends LEFT from body; right arm x = body.x + body.width so it extends RIGHT. Example:
createPlan({ title: "Human", layout: "freeform", wrapInFrame: false, children: [
    { type: "shape", shape: "circle", text: "Head", color: "lightGray", aspect: "small", x: 115, y: 20 },
    { type: "shape", shape: "rect", text: "Body", color: "lightGray", aspect: "square", x: 100, y: 110 },
    { type: "shape", shape: "rect", text: "Arm Left", color: "lightGray", aspect: "tall_narrow", x: -200, y: 125, rotation: -90 },
    { type: "shape", shape: "rect", text: "Arm Right", color: "lightGray", aspect: "tall_narrow", x: 250, y: 125, rotation: 90 },
    { type: "shape", shape: "rect", text: "Leg Left", color: "lightGray", aspect: "tall_narrow", x: 105, y: 270, rotation: 10 },
    { type: "shape", shape: "rect", text: "Leg Right", color: "lightGray", aspect: "tall_narrow", x: 165, y: 270, rotation: -10 }
  ]})`;

/**
 * Build frame context instruction when composing inside an existing frame.
 */
function buildFrameContextInstruction(frameInfo) {
  if (!frameInfo) return '';

  return `\n\n**FRAME CONTEXT:** You are composing INSIDE an existing frame (${frameInfo.width}x${frameInfo.height}). The layout engine will automatically position objects within the frame bounds. Do NOT create an outer frame — one already exists. Just output the inner content.`;
}

/**
 * Execute the creative composition pipeline: Planner LLM → Layout Engine → Tool Calls.
 *
 * @param {object} openai - OpenAI client
 * @param {string} userMessage - Original user message
 * @param {object} boardState - Current board state (unused by planner — no coordinates needed)
 * @param {string} context - Formatted board context string (unused by planner)
 * @param {string} creativeDescription - Description from intent classifier
 * @param {object|null} frameInfo - Selected frame info { id, x, y, width, height } or null
 */
export async function executeCreativeComposer(openai, userMessage, boardState, context, creativeDescription, frameInfo = null) {
  console.log('🎨 CREATIVE COMPOSER (Planner+Executor): Decomposing semantic prompt');
  console.log(`   User message: "${userMessage}"`);
  console.log(`   Creative description: "${creativeDescription || 'none'}"`);
  console.log(`   Frame context: ${frameInfo ? `frame "${frameInfo.id}" at (${frameInfo.x},${frameInfo.y}) ${frameInfo.width}x${frameInfo.height}` : 'none'}`);

  const frameInstruction = buildFrameContextInstruction(frameInfo);

  const messages = [
    { role: 'system', content: PLANNER_PROMPT },
    {
      role: 'user',
      content: `Create the following on the whiteboard: "${userMessage}"${creativeDescription ? `\n\nContext: ${creativeDescription}` : ''}${frameInstruction}`,
    },
  ];

  // ── Step 1: Planner LLM (gpt-5-nano) ─────────────────────
  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages,
    tools: [CREATE_PLAN_TOOL],
    tool_choice: { type: 'function', function: { name: 'createPlan' } },
  });
  const planDuration = Date.now() - startTime;
  console.log(`📋 Planner responded in ${planDuration}ms`);

  const choice = response.choices[0];
  if (!choice) {
    throw new Error('No response from Planner LLM');
  }

  // Extract the plan from the tool call
  let plan = null;
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === 'function' && tc.function.name === 'createPlan') {
        try {
          plan = JSON.parse(tc.function.arguments);
        } catch (parseError) {
          console.error('Failed to parse plan JSON:', parseError);
          throw new Error('Planner returned invalid JSON');
        }
        break;
      }
    }
  }

  if (!plan) {
    console.error('Planner did not call createPlan tool. Response:', JSON.stringify(choice.message));
    throw new Error('Planner did not output a plan');
  }

  console.log(`📋 Plan: "${plan.title}", layout=${plan.layout}, ${plan.children?.length || 0} top-level children`);

  // ── Step 2: Layout Engine (deterministic) ─────────────────
  // ALL creative compositions should use explicit positions with batch anchor
  // This ensures objects stay together as a cohesive unit, not scattered individually
  // - Frame-based: Keeps frames and children together
  // - Non-frame: Keeps shapes in stack/radial/grid layouts together
  const useExplicitPositions = true; // Always use explicit positions for creative compositions
  
  // CRITICAL: Use (0,0) as anchor for creative compositions
  // Executor will find free space and offset all coordinates
  const anchor = { x: 0, y: 0 };
  
  const engineStart = Date.now();
  const { toolCalls, summary } = planToToolCalls(plan, anchor, frameInfo, useExplicitPositions);
  const engineDuration = Date.now() - engineStart;
  console.log(`⚙️ Layout Engine produced ${toolCalls.length} tool calls in ${engineDuration}ms (explicit positions from (0,0) anchor for batch placement)`);

  // Convert to the format the client executor expects (add id field)
  const formattedToolCalls = toolCalls.map((tc, i) => ({
    id: `plan_tc_${i}`,
    name: tc.name,
    arguments: tc.arguments,
  }));

  console.log(`✅ Creative Composer total: ${planDuration + engineDuration}ms (planner: ${planDuration}ms, engine: ${engineDuration}ms)`);

  return {
    success: true,
    agentName: 'CreativeComposer',
    toolCalls: formattedToolCalls,
    message: choice.message.content,
    summary: summary || `I've composed "${plan.title}" with ${formattedToolCalls.length} objects`,
  };
}
