/**
 * Client-side Response Agent
 *
 * Generates outcome-focused summaries from tool execution results:
 * "Here's what I set up: • Column A — ..., • Column B — ..." instead of
 * "I added one star, I added this that."
 */

import type { ParsedToolCall } from './tools';
import type { ExecutionResult } from './executor';
import type { WhiteboardObject } from '@/types/canvas';

export interface ResponseContext {
  originalMessage: string;
  toolCalls: ParsedToolCall[];
  executionResult: ExecutionResult;
  serverMessage?: string;
}

/** Common hex colors to human-readable names for summaries. */
const HEX_TO_COLOR_NAME: Record<string, string> = {
  '#fff59d': 'yellow', '#f48fb1': 'pink', '#81d4fa': 'blue', '#a5d6a7': 'green', '#ffcc80': 'orange',
  '#ef4444': 'red', '#3b82f6': 'blue', '#10b981': 'green', '#eab308': 'yellow', '#f97316': 'orange',
  '#6366f1': 'indigo', '#a855f7': 'purple', '#ec4899': 'pink', '#6b7280': 'gray', '#000000': 'black',
};

function hexToColorName(hex: string | undefined): string {
  if (!hex) return '';
  const key = hex.toLowerCase();
  return HEX_TO_COLOR_NAME[key] ?? '';
}

/**
 * One-line description of a created object for the outcome summary.
 */
function describeCreatedObject(obj: WhiteboardObject): string {
  const colorName = hexToColorName(
    'color' in obj ? (obj as { color?: string }).color : 'fill' in obj ? (obj as { fill?: string }).fill : undefined,
  );
  const color = colorName ? ` ${colorName}` : '';

  switch (obj.type) {
    case 'sticky': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — sticky note${color}` : `${colorName || 'Sticky'} sticky note`;
    }
    case 'frame': {
      const name = (obj as { name?: string }).name;
      return name ? `${name} — section/column` : 'Frame — container';
    }
    case 'text': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — label` : 'Text label';
    }
    case 'textBubble': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — text bubble` : `Text bubble${color}`;
    }
    case 'rect': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — rectangle${color}` : `Rectangle${color}`;
    }
    case 'circle': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — circle${color}` : `Circle${color}`;
    }
    case 'triangle': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — triangle${color}` : `Triangle${color}`;
    }
    case 'star': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — star${color}` : `Star${color}`;
    }
    case 'line':
      return 'Connector line';
    case 'emoji': {
      const emoji = (obj as { emoji?: string }).emoji;
      return emoji ? `${emoji} — emoji` : 'Emoji';
    }
    default:
      return `${obj.type}${color}`;
  }
}

/** Short label for grouping/pluralization (e.g. "star", "blue circle", "Product Backlog — sticky note"). */
function getGroupLabel(obj: WhiteboardObject): string {
  const colorName = hexToColorName(
    'color' in obj ? (obj as { color?: string }).color : 'fill' in obj ? (obj as { fill?: string }).fill : undefined,
  );
  const colorPrefix = colorName ? `${colorName} ` : '';
  switch (obj.type) {
    case 'sticky': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — sticky note` : `${colorPrefix}sticky note`.trim() || 'sticky note';
    }
    case 'frame': {
      const name = (obj as { name?: string }).name;
      return name ? `${name} — section` : 'frame';
    }
    case 'text': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — label` : 'text label';
    }
    case 'textBubble': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? text : `${colorPrefix}text bubble`.trim();
    }
    case 'rect': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — rectangle` : `${colorPrefix}rectangle`.trim() || 'rectangle';
    }
    case 'circle': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — circle` : `${colorPrefix}circle`.trim() || 'circle';
    }
    case 'triangle': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — triangle` : `${colorPrefix}triangle`.trim() || 'triangle';
    }
    case 'star': {
      const text = (obj as { text?: string }).text?.trim();
      return text ? `${text} — star` : `${colorPrefix}star`.trim() || 'star';
    }
    case 'line':
      return 'connector line';
    case 'emoji': {
      const emoji = (obj as { emoji?: string }).emoji;
      return emoji ?? 'emoji';
    }
    default:
      return `${colorPrefix}${obj.type}`.trim() || obj.type;
  }
}

/** Pluralize a short label: "star" -> "50 stars", "blue circle" -> "3 blue circles". */
function pluralizeLabel(label: string, count: number): string {
  if (count === 1) return label;
  const singularPlural: [string, string][] = [
    ['sticky note', 'sticky notes'],
    ['sticky notes', 'sticky notes'],
    ['rectangle', 'rectangles'],
    ['circle', 'circles'],
    ['triangle', 'triangles'],
    ['star', 'stars'],
    ['connector line', 'connector lines'],
    ['frame', 'frames'],
    ['section', 'sections'],
    ['label', 'labels'],
    ['emoji', 'emojis'],
    ['text bubble', 'text bubbles'],
  ];
  const lower = label.toLowerCase();
  for (const [singular, plural] of singularPlural) {
    if (lower === singular || lower.endsWith(' ' + singular)) {
      const out = label.replace(new RegExp(`\\b${singular}$`, 'i'), plural);
      return `${count} ${out}`;
    }
  }
  return `${count} ${label}s`;
}

/**
 * Build an outcome-focused summary. Groups identical items (e.g. 50 stars -> "• 50 stars")
 * instead of repeating the same line many times.
 */
function buildOutcomeSummary(createdObjects: WhiteboardObject[]): string {
  if (createdObjects.length === 0) return '';
  const groupKeyToCount = new Map<string, number>();
  const groupKeyToLabel = new Map<string, string>();
  for (const obj of createdObjects) {
    const key = getGroupLabel(obj);
    groupKeyToCount.set(key, (groupKeyToCount.get(key) ?? 0) + 1);
    groupKeyToLabel.set(key, key);
  }
  const lines: string[] = [];
  for (const [key, count] of groupKeyToCount) {
    const label = groupKeyToLabel.get(key)!;
    if (count === 1) {
      lines.push(`• ${describeCreatedObject(createdObjects.find((o) => getGroupLabel(o) === key)!)}`);
    } else {
      lines.push(`• ${pluralizeLabel(label.trim(), count)}`);
    }
  }
  const total = createdObjects.length;
  const intro =
    total === 1 ? "Here's what I added:" : `Here's what I set up (${total} item${total === 1 ? '' : 's'}):`;
  return `${intro}\n\n${lines.join('\n')}\n\nFeel free to ask me to add, edit, or reorganize anything.`;
}

/**
 * Generate a natural, outcome-focused response from tool execution results.
 */
export function generateResponse(context: ResponseContext): string {
  const { toolCalls, executionResult, serverMessage } = context;

  const createdCount = executionResult.createdIds.length;
  const createdObjects = executionResult.createdObjects ?? [];
  const modifiedCount = executionResult.modifiedIds.length;

  const deletedCount = toolCalls
    .filter((tc) => tc.name === 'deleteObject')
    .reduce((total, tc) => {
      const args = tc.arguments as { objectIds?: string[] };
      return total + (args.objectIds?.length || 0);
    }, 0);

  // Prefer server message when it's already a clear outcome (e.g. "Here's your Sprint Planning Board! It includes...")
  const isOutcomeStyle =
    serverMessage &&
    (serverMessage.includes("Here's your") ||
      serverMessage.includes("Here's what") ||
      serverMessage.includes('It includes') ||
      serverMessage.includes('with 5 columns') ||
      serverMessage.includes('with these'));

  if (isOutcomeStyle && !isGenericMessage(serverMessage!)) {
    return serverMessage!;
  }

  // For creations: show outcome summary (what was created, with labels) instead of "I added X, I added Y"
  if (createdCount > 0 && createdObjects.length > 0) {
    const outcomeSummary = buildOutcomeSummary(createdObjects);
    if (outcomeSummary) {
      const connectorCount = toolCalls.filter((tc) => tc.name === 'createConnector').length;
      if (connectorCount > 0) {
        return `${outcomeSummary.replace(/\n\nFeel free.*/, '')} I also connected some items with ${connectorCount === 1 ? 'a line' : `${connectorCount} lines`}.\n\nFeel free to ask me to add, edit, or reorganize anything.`;
      }
      return outcomeSummary;
    }
  }

  // Outcome summaries for every tool: color, clear, delete, move, arrange, update, resize, etc.
  const outcomeLines = buildOutcomeLines(toolCalls, executionResult, createdCount);
  if (outcomeLines.length > 0) {
    const intro = "I";
    const body = outcomeLines.length === 1 ? outcomeLines[0] : outcomeLines.map((l) => `• ${l}`).join('\n');
    return outcomeLines.length === 1 ? `${intro} ${body}` : `${intro}\n\n${body}`;
  }

  // Prefer server message when it's a clear analysis (e.g. analyze result)
  if (
    serverMessage &&
    !isGenericMessage(serverMessage) &&
    !serverMessage.toLowerCase().includes("i'll") &&
    !serverMessage.toLowerCase().includes("i've")
  ) {
    return serverMessage;
  }

  return executionResult.summary || "I've completed the tasks.";
}

/**
 * Build one clear outcome line per tool type used (color, clear, delete, move, arrange, update, resize, etc.).
 */
function buildOutcomeLines(
  toolCalls: ParsedToolCall[],
  executionResult: ExecutionResult,
  createdCount: number,
): string[] {
  const lines: string[] = [];

  // Creation (we only reach here when createdObjects was empty — otherwise we returned earlier with buildOutcomeSummary)
  if (createdCount > 0) {
    const createdTypes = getCreatedObjectTypes(toolCalls);
    const creationMessage = formatCreationMessage(createdTypes);
    const connectorCount = toolCalls.filter((tc) => tc.name === 'createConnector').length;
    if (connectorCount > 0) {
      lines.push(`${creationMessage} and connected them with ${connectorCount === 1 ? 'a line' : `${connectorCount} lines`}.`);
    } else {
      lines.push(`${creationMessage}.`);
    }
  } else {
    const connectorCount = toolCalls.filter((tc) => tc.name === 'createConnector').length;
    if (connectorCount > 0) {
      lines.push(`Connected items with ${connectorCount === 1 ? 'a line' : `${connectorCount} lines`}.`);
    }
  }

  // clearCanvas
  const clearCalls = toolCalls.filter((tc) => tc.name === 'clearCanvas');
  if (clearCalls.length > 0) {
    lines.push('Cleared the canvas.');
  }

  // deleteObject
  const deletedCount = toolCalls
    .filter((tc) => tc.name === 'deleteObject')
    .reduce((total, tc) => total + ((tc.arguments as { objectIds?: string[] }).objectIds?.length ?? 0), 0);
  if (deletedCount > 0) {
    lines.push(`Removed ${deletedCount} ${deletedCount === 1 ? 'object' : 'objects'}.`);
  }

  // changeColor
  const colorCalls = toolCalls.filter((tc) => tc.name === 'changeColor');
  if (colorCalls.length > 0) {
    const colorArg = (colorCalls[0].arguments as { color?: string }).color;
    const colorName = colorArg && !colorArg.startsWith('#') ? colorArg : hexToColorName(colorArg);
    const toColor = colorName ? ` to ${colorName}` : '';
    lines.push(`Changed the color of ${colorCalls.length} ${colorCalls.length === 1 ? 'object' : 'objects'}${toColor}.`);
  }

  // moveObject
  const moveCalls = toolCalls.filter((tc) => tc.name === 'moveObject');
  if (moveCalls.length > 0) {
    const args = moveCalls[0].arguments as { direction?: string };
    const dir = args.direction ? ` ${args.direction}` : '';
    lines.push(`Moved ${moveCalls.length} ${moveCalls.length === 1 ? 'object' : 'objects'}${dir}.`);
  }

  // resizeObject
  const resizeCalls = toolCalls.filter((tc) => tc.name === 'resizeObject');
  if (resizeCalls.length > 0) {
    lines.push(`Resized ${resizeCalls.length} ${resizeCalls.length === 1 ? 'object' : 'objects'}.`);
  }

  // rotateObject
  const rotateCalls = toolCalls.filter((tc) => tc.name === 'rotateObject');
  if (rotateCalls.length > 0) {
    lines.push(`Rotated ${rotateCalls.length} ${rotateCalls.length === 1 ? 'object' : 'objects'}.`);
  }

  // updateText
  const updateTextCalls = toolCalls.filter((tc) => tc.name === 'updateText');
  if (updateTextCalls.length > 0) {
    lines.push(`Updated text on ${updateTextCalls.length} ${updateTextCalls.length === 1 ? 'object' : 'objects'}.`);
  }

  // arrangeInGrid
  const arrangeCalls = toolCalls.filter((tc) => tc.name === 'arrangeInGrid');
  if (arrangeCalls.length > 0) {
    const args = arrangeCalls[0].arguments as { rows?: number; columns?: number; objectIds?: string[] };
    const n = args.objectIds?.length ?? (executionResult.modifiedIds.length || 0);
    const grid = args.rows && args.columns ? ` in a ${args.rows}×${args.columns} grid` : ' in a grid';
    const count = n > 0 ? `${n} object${n === 1 ? '' : 's'}` : 'the selected objects';
    lines.push(`Arranged ${count}${grid}.`);
  }

  // arrangeInGridAndResize
  const arrangeResizeCalls = toolCalls.filter((tc) => tc.name === 'arrangeInGridAndResize');
  if (arrangeResizeCalls.length > 0) {
    const args = arrangeResizeCalls[0].arguments as { rows?: number; columns?: number; objectIds?: string[] };
    const n = args.objectIds?.length ?? (executionResult.modifiedIds.length || 0);
    const grid = args.rows && args.columns ? ` in a ${args.rows}×${args.columns} grid` : ' in a grid';
    const count = n > 0 ? `${n} object${n === 1 ? '' : 's'}` : 'the selected objects';
    lines.push(`Arranged and resized ${count}${grid}.`);
  }

  // createStickyNotesInGrid (one-shot create + arrange on canvas, no frame)
  const createGridCalls = toolCalls.filter((tc) => tc.name === 'createStickyNotesInGrid');
  if (createGridCalls.length > 0) {
    const args = createGridCalls[0].arguments as { rows?: number; columns?: number; stickies?: unknown[] };
    const n = args.stickies?.length ?? executionResult.createdIds.length ?? 0;
    const grid = args.rows && args.columns ? ` in a ${args.rows}×${args.columns} grid` : ' in a grid';
    lines.push(`Created ${n} sticky note${n !== 1 ? 's' : ''}${grid} on the canvas.`);
  }

  // fitFrameToContents
  const fitCalls = toolCalls.filter((tc) => tc.name === 'fitFrameToContents');
  if (fitCalls.length > 0) {
    lines.push('Adjusted frame to fit its contents.');
  }

  return lines;
}

/**
 * Get types of objects that were created.
 */
function getCreatedObjectTypes(toolCalls: ParsedToolCall[]): Map<string, number> {
  const types = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.name === 'createStickyNote') {
      types.set('sticky note', (types.get('sticky note') || 0) + 1);
    } else if (call.name === 'createStickyNotesInGrid') {
      const args = call.arguments as { stickies?: unknown[]; items?: unknown[]; objectType?: string };
      const n = args.stickies?.length ?? args.items?.length ?? 0;
      if (n > 0) {
        const objType = args.objectType ?? 'sticky';
        const typeName = objType === 'sticky' ? 'sticky note' : objType === 'rect' ? 'rectangle' : objType;
        types.set(typeName, (types.get(typeName) || 0) + n);
      }
    } else if (call.name === 'createText') {
      types.set('text', (types.get('text') || 0) + 1);
    } else if (call.name === 'createTextBubble') {
      types.set('text bubble', (types.get('text bubble') || 0) + 1);
    } else if (call.name === 'createShape') {
      const shapeType = (call.arguments as any).type || 'shape';
      const typeName = shapeType === 'rect' ? 'rectangle' : shapeType;
      types.set(typeName, (types.get(typeName) || 0) + 1);
    } else if (call.name === 'createFrame') {
      types.set('frame', (types.get('frame') || 0) + 1);
    }
  }

  return types;
}

/**
 * Format creation message.
 */
function formatCreationMessage(types: Map<string, number>): string {
  const parts: string[] = [];
  
  types.forEach((count, type) => {
    if (count === 1) {
      parts.push(`a ${type}`);
    } else {
      let plural: string;
      if (type === 'sticky note') {
        plural = 'sticky notes';
      } else if (type === 'text bubble') {
        plural = 'text bubbles';
      } else {
        plural = type + 's';
      }
      parts.push(`${count} ${plural}`);
    }
  });

  if (parts.length === 0) return 'created some objects';
  if (parts.length === 1) return `created ${parts[0]}`;
  if (parts.length === 2) return `created ${parts[0]} and ${parts[1]}`;
  
  const last = parts.pop();
  return `created ${parts.join(', ')}, and ${last}`;
}

/**
 * Get types of modifications that were made.
 */
function getModificationTypes(toolCalls: ParsedToolCall[]): Set<string> {
  const types = new Set<string>();

  for (const call of toolCalls) {
    if (call.name === 'moveObject') {
      types.add('moved');
    } else if (call.name === 'resizeObject') {
      types.add('resized');
    } else if (call.name === 'updateText') {
      types.add('updated text');
    } else if (call.name === 'changeColor') {
      types.add('changed color');
    }
  }

  return types;
}

/**
 * Format modification message.
 */
function formatModificationMessage(types: Set<string>, count: number): string {
  if (types.size === 0) return `modified ${count} ${count === 1 ? 'object' : 'objects'}`;
  if (types.size === 1) {
    const type = Array.from(types)[0];
    return `${type} ${count} ${count === 1 ? 'object' : 'objects'}`;
  }
  
  const typeArray = Array.from(types);
  const last = typeArray.pop();
  return `${typeArray.join(', ')} and ${last} objects`;
}

/**
 * Check if a message is generic/unhelpful.
 */
export function isGenericMessage(message: string): boolean {
  const genericMessages = [
    "I've completed the tasks",
    "Tasks completed",
    "I've made the changes you requested",
    "Done",
    "Completed",
    'Composed "', // e.g. "Composed \"Sprint Planning\" with 15 objects" — we replace with outcome summary
  ];

  return genericMessages.some((generic) =>
    message.toLowerCase().includes(generic.toLowerCase()),
  );
}
