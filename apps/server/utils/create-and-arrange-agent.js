/**
 * Create-and-Arrange Mini-Agent
 *
 * Handles "create a RxC grid of sticky notes or shapes (for pros/cons or a topic)" in one shot:
 * - Sticky notes: pros/cons content or placeholders; colors green/yellow/pink/orange.
 * - Shapes (rect, circle, star, triangle): topic-based labels (e.g. "student time management").
 * - Returns a single tool call createStickyNotesInGrid so the client creates and arranges on free canvas space (no frame).
 */

const GENERATE_STICKIES_SCHEMA = {
  type: 'function',
  function: {
    name: 'generateStickies',
    description: 'Return an array of sticky note content: { text, color } for each cell. Pros use green/yellow, cons use pink/orange.',
    parameters: {
      type: 'object',
      properties: {
        stickies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Short text for the sticky (one line, few words)' },
              color: { type: 'string', enum: ['green', 'yellow', 'pink', 'orange'], description: 'green/yellow for pros, pink/orange for cons' },
            },
            required: ['text', 'color'],
          },
          description: 'One entry per sticky, in grid order (row by row). First half pros, second half cons.',
        },
      },
      required: ['stickies'],
    },
  },
};

const GENERATE_LABELS_SCHEMA = {
  type: 'function',
  function: {
    name: 'generateLabels',
    description: 'Return an array of short labels for grid cells (e.g. for time management: Morning routine, Study block, ...).',
    parameters: {
      type: 'object',
      properties: {
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'One short label per cell, in grid order. 2-5 words each.',
        },
      },
      required: ['labels'],
    },
  },
};

const SHAPE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316'];

/** Resolve shape color for one item. Uses intent.color (single) or intent.colors (cycle) when specified; else default palette. */
function getShapeColorForIndex(intent, index) {
  const single = intent.color && intent.color !== 'random' ? intent.color : null;
  const multi = Array.isArray(intent.colors) && intent.colors.length > 0 ? intent.colors : null;
  if (single) return single;
  if (multi) return multi[index % multi.length];
  return SHAPE_COLORS[index % SHAPE_COLORS.length];
}

/**
 * Run the create-and-arrange agent: generate content then return one tool call.
 *
 * @param {object} openai - OpenAI client
 * @param {object} intent - Classified intent: CREATE_AND_ARRANGE, rows, columns, objectType (sticky|shape), shapeType (rect|circle|star|triangle), prosAndCons, topic
 * @returns {{ toolCalls: Array<{ name: string, arguments: object }>, summary: string }}
 */
export async function executeCreateAndArrangeAgent(openai, intent) {
  const rows = intent.rows ?? 2;
  const columns = intent.columns ?? 3;
  const quantity = intent.quantity ?? rows * columns;
  const prosAndCons = intent.prosAndCons === true;
  const topic = (intent.topic || '').trim();
  const objectType = intent.objectType === 'shape' ? (intent.shapeType || 'rect') : 'sticky';
  const isShape = objectType !== 'sticky';

  console.log(`📐 Create-and-arrange: ${rows}×${columns} grid, ${quantity} ${objectType}s, prosAndCons=${prosAndCons}, topic="${topic}"`);

  let items;

  if (isShape) {
    if (topic && quantity > 0) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You generate short, varied labels for a whiteboard grid. Topic: "${topic}". Each label: 2-5 words, one line. Return exactly ${quantity} labels in order (row by row).` },
          { role: 'user', content: `Generate ${quantity} labels for a grid about: ${topic}.` },
        ],
        tools: [GENERATE_LABELS_SCHEMA],
        tool_choice: { type: 'function', function: { name: 'generateLabels' } },
        temperature: 0.5,
      });
      const toolCall = response.choices[0]?.message?.tool_calls?.find(tc => tc.function?.name === 'generateLabels');
      if (toolCall) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          const list = Array.isArray(parsed.labels) ? parsed.labels : [];
          items = list.slice(0, quantity).map((text, i) => ({
            text: String(text || '').trim() || `Item ${i + 1}`,
            color: getShapeColorForIndex(intent, i),
          }));
        } catch (e) {
          items = makePlaceholderItems(quantity, true, intent);
        }
      } else {
        items = makePlaceholderItems(quantity, true, intent);
      }
    } else {
      items = makePlaceholderItems(quantity, true, intent);
    }
  } else {
    if (prosAndCons && quantity > 0) {
      const half = Math.ceil(quantity / 2);
      const systemPrompt = `You generate short, varied sticky note texts for a pros-and-cons grid on a whiteboard.
- First ${half} stickies are PROS (benefits, advantages). Use color "green" or "yellow" for each.
- Remaining ${quantity - half} stickies are CONS (drawbacks, challenges). Use color "pink" or "orange" for each.
- Each text: one short line, few words, no quotes. Be specific and varied.
- Topic: ${topic || 'general'}. Generate ${quantity} entries in order (pros first, then cons).`;

      const userPrompt = topic
        ? `Generate ${quantity} pros and cons sticky texts for topic: ${topic}. First ${half} pros (green/yellow), then ${quantity - half} cons (pink/orange).`
        : `Generate ${quantity} general pros and cons sticky texts. First ${half} pros (green/yellow), then ${quantity - half} cons (pink/orange).`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [GENERATE_STICKIES_SCHEMA],
        tool_choice: { type: 'function', function: { name: 'generateStickies' } },
        temperature: 0.6,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.find(tc => tc.function?.name === 'generateStickies');
      if (!toolCall) {
        items = makePlaceholderStickies(quantity);
      } else {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          const list = Array.isArray(parsed.stickies) ? parsed.stickies : [];
          if (list.length >= quantity) {
            items = list.slice(0, quantity).map(s => ({
              text: String(s.text || '').trim() || 'Note',
              color: ['green', 'yellow', 'pink', 'orange'].includes(s.color) ? s.color : 'yellow',
            }));
          } else {
            items = makePlaceholderStickies(quantity);
          }
        } catch (e) {
          items = makePlaceholderStickies(quantity);
        }
      }
    } else if (topic && quantity > 0) {
      const systemPrompt = `You generate short, varied sticky note texts for a whiteboard grid. Topic: "${topic}". Each sticky: one line, 2-10 words, specific and varied (not generic). Return exactly ${quantity} entries in grid order (row by row). Use colors green, yellow, pink, or orange for variety.`;
      const userPrompt = `Generate ${quantity} sticky note texts about: ${topic}. Each line should be a distinct point or idea.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [GENERATE_STICKIES_SCHEMA],
        tool_choice: { type: 'function', function: { name: 'generateStickies' } },
        temperature: 0.6,
      });
      const toolCall = response.choices[0]?.message?.tool_calls?.find(tc => tc.function?.name === 'generateStickies');
      if (!toolCall) {
        items = makeBlankStickies(quantity, intent);
      } else {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          const list = Array.isArray(parsed.stickies) ? parsed.stickies : [];
          if (list.length >= quantity) {
            const singleColor = intent.color && intent.color !== 'random' ? intent.color : null;
            const colorList = Array.isArray(intent.colors) && intent.colors.length > 0 ? intent.colors : null;
            items = list.slice(0, quantity).map((s, i) => {
              const color = singleColor || (colorList ? colorList[i % colorList.length] : null) || (['green', 'yellow', 'pink', 'orange'].includes(s.color) ? s.color : 'yellow');
              return {
                text: String(s.text || '').trim() || 'Note',
                color,
              };
            });
          } else {
            items = makeBlankStickies(quantity, intent);
          }
        } catch (e) {
          items = makeBlankStickies(quantity, intent);
        }
      }
    } else {
      items = makeBlankStickies(quantity, intent);
    }
  }

  const args = {
    rows,
    columns,
    stickies: items,
  };
  if (isShape) {
    args.objectType = objectType;
    args.shapeType = objectType;
  }

  const toolCalls = [
    {
      id: 'create_and_arrange_0',
      name: 'createStickyNotesInGrid',
      arguments: args,
    },
  ];

  const typeLabel = isShape ? (objectType === 'rect' ? 'rectangles' : objectType + 's') : 'sticky notes';
  const summary = prosAndCons && !isShape
    ? `Created ${quantity} sticky notes for pros and cons in a ${rows}×${columns} grid on the canvas.`
    : topic && !isShape
      ? `Created ${quantity} sticky notes about ${topic} in a ${rows}×${columns} grid on the canvas.`
      : topic && isShape
        ? `Created ${quantity} ${typeLabel} for ${topic} in a ${rows}×${columns} grid on the canvas.`
        : `Created ${quantity} ${typeLabel} in a ${rows}×${columns} grid on the canvas.`;

  return { toolCalls, summary };
}

const DEFAULT_STICKY_COLOR = 'yellow';

/** Sticky notes with blank text for generic grids (not pros/cons). Uses default color unless intent specifies color(s). */
function makeBlankStickies(quantity, intent = {}) {
  const specifiedColor = intent.color && intent.color !== 'random' ? intent.color : null;
  const specifiedColors = Array.isArray(intent.colors) && intent.colors.length > 0 ? intent.colors : null;
  const stickies = [];
  for (let i = 0; i < quantity; i++) {
    const color = specifiedColor
      ? specifiedColor
      : specifiedColors
        ? specifiedColors[i % specifiedColors.length]
        : DEFAULT_STICKY_COLOR;
    stickies.push({ text: '', color });
  }
  return stickies;
}

/** Sticky notes with "Pro N" / "Con N" text for pros-and-cons grids only. */
function makePlaceholderStickies(quantity) {
  const stickies = [];
  const half = Math.ceil(quantity / 2);
  const prosColors = ['green', 'yellow'];
  const consColors = ['pink', 'orange'];
  for (let i = 0; i < quantity; i++) {
    const isPro = i < half;
    stickies.push({
      text: isPro ? `Pro ${i + 1}` : `Con ${i - half + 1}`,
      color: isPro ? prosColors[i % prosColors.length] : consColors[(i - half) % consColors.length],
    });
  }
  return stickies;
}

function makePlaceholderItems(quantity, isShape, intent = {}) {
  const items = [];
  for (let i = 0; i < quantity; i++) {
    const color = isShape ? getShapeColorForIndex(intent, i) : (intent.color && intent.color !== 'random' ? intent.color : intent.colors?.[i % (intent.colors?.length || 1)] ?? 'yellow');
    items.push({
      text: `Item ${i + 1}`,
      color,
    });
  }
  return items;
}
