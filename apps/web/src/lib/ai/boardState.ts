/**
 * Summarizes the current whiteboard state into a compact format
 * suitable for inclusion in an LLM prompt without blowing up token count.
 */

import type { WhiteboardObject } from '@/types/canvas';
import { STICKY_COLORS } from '@/types/canvas';

export interface BoardObjectSummary {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color?: string;
  text?: string;
  name?: string;
}

export interface BoardStateSummary {
  objectCount: number;
  objects: BoardObjectSummary[];
}

const HEX_TO_COLOR_NAME: Record<string, string> = {
  [STICKY_COLORS.YELLOW]: 'yellow',
  [STICKY_COLORS.PINK]: 'pink',
  [STICKY_COLORS.BLUE]: 'blue',
  [STICKY_COLORS.GREEN]: 'green',
  [STICKY_COLORS.ORANGE]: 'orange',
};

function truncateText(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

/**
 * Converts a full WhiteboardObject into a compact summary for the LLM.
 * Strips rendering-only fields (zIndex, rotation, strokeWidth, etc.)
 * and maps hex colors to human-readable names where possible.
 */
function summarizeObject(obj: WhiteboardObject): BoardObjectSummary {
  const summary: BoardObjectSummary = {
    id: obj.id,
    type: obj.type,
    x: Math.round(obj.x),
    y: Math.round(obj.y),
  };

  if ('width' in obj && obj.width !== undefined) {
    summary.width = Math.round(obj.width);
  }
  if ('height' in obj && obj.height !== undefined) {
    summary.height = Math.round(obj.height);
  }
  if ('radius' in obj && obj.radius !== undefined) {
    summary.radius = Math.round(obj.radius);
  }

  if (obj.type === 'sticky') {
    summary.color = HEX_TO_COLOR_NAME[obj.color] ?? obj.color;
  } else if (obj.type === 'frame' && 'fill' in obj && obj.fill) {
    // Frames: fill is the background color
    summary.color = obj.fill;
  } else if ('fill' in obj && obj.fill) {
    summary.color = obj.fill;
  }

  if ('text' in obj && obj.text) {
    summary.text = truncateText(obj.text);
  }

  if (obj.type === 'frame' && obj.name) {
    summary.name = obj.name;
  }

  return summary;
}

/**
 * Produces a compact board state summary. Caps at 200 objects to keep
 * the prompt within reasonable token limits.
 */
export function summarizeBoardState(
  objects: WhiteboardObject[],
): BoardStateSummary {
  const MAX_OBJECTS = 200;
  const subset =
    objects.length > MAX_OBJECTS ? objects.slice(0, MAX_OBJECTS) : objects;

  return {
    objectCount: objects.length,
    objects: subset.map(summarizeObject),
  };
}

/**
 * Renders the board state summary as a concise string for the system prompt.
 */
export function boardStateToPromptString(
  summary: BoardStateSummary,
): string {
  if (summary.objectCount === 0) {
    return 'The board is currently empty.';
  }

  const lines = summary.objects.map((obj) => {
    const parts = [`id=${obj.id}`, `type=${obj.type}`, `pos=(${obj.x},${obj.y})`];
    if (obj.width !== undefined) parts.push(`w=${obj.width}`);
    if (obj.height !== undefined) parts.push(`h=${obj.height}`);
    if (obj.radius !== undefined) parts.push(`r=${obj.radius}`);
    if (obj.color) parts.push(`color=${obj.color}`);
    if (obj.text) parts.push(`text="${obj.text}"`);
    if (obj.name) parts.push(`name="${obj.name}"`);
    return parts.join(' ');
  });

  let result = `Board has ${summary.objectCount} object(s):\n`;
  result += lines.join('\n');

  if (summary.objectCount > summary.objects.length) {
    result += `\n... and ${summary.objectCount - summary.objects.length} more objects (truncated)`;
  }

  return result;
}
