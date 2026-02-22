/**
 * Creative Composer — Planner + Executor architecture.
 *
 * The Planner LLM (gpt-5-nano) outputs a structured CompositionPlan:
 *   { title, layout, children: [{ type, text, color, shape, ... }] }
 *
 * The Layout Engine (deterministic, zero LLM calls) converts the plan
 * into positioned tool calls with concrete x/y coordinates.
 *
 * The LLM never outputs coordinates. It reasons about WHAT to create
 * and HOW to arrange it. The engine handles WHERE.
 */

import { CREATE_PLAN_TOOL } from './plan-schema.js';
import { planToToolCalls } from './layout-engine.js';

// ── Planner system prompt ───────────────────────────────────
// Much simpler than the old creative composer prompt because
// the LLM no longer needs to compute coordinates or sizes.

const PLANNER_PROMPT = `You are the Planner for a collaborative whiteboard. Your ONLY job is to call the createPlan tool with a structured composition plan. You decide WHAT to create and HOW to arrange it. A layout engine will handle all positioning — you NEVER specify coordinates.

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

**Color names:**
- Sticky: yellow, pink, blue, green, orange (or "random")
- Shape: red, blue, green, purple, orange, gray, lightGray, cyan, teal, indigo, pink, amber, lime, black, white, brown (or "random")

**Size hints (aspect):**
- square (default), wide (2:1), tall (1:2), tall_narrow (0.5:2), small (0.6x), large (1.5x)

**Connectors:**
- Add connectTo: "straight" or "curved" on a node to connect it to the NEXT sibling

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

User: "flowchart for user signup"
→ createPlan({ title: "User Signup Flow", layout: "flow_horizontal", wrapInFrame: true, children: [
    { type: "shape", shape: "circle", text: "Start", color: "green", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Enter Email", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Verify Email", color: "blue", connectTo: "straight" },
    { type: "shape", shape: "rect", text: "Create Password", color: "blue", connectTo: "straight" },
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
