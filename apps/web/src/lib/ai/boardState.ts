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
  containedObjectIds?: string[]; // For frames: IDs of objects inside
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

  // Include containedObjectIds for frames
  if (obj.type === 'frame' && 'containedObjectIds' in obj && Array.isArray(obj.containedObjectIds)) {
    summary.containedObjectIds = obj.containedObjectIds;
  }

  return summary;
}

/**
 * Produces a compact board state summary.
 * 
 * Sends ALL objects to the LLM for complete board awareness.
 * Uses compact format to minimize token usage.
 */
export function summarizeBoardState(
  objects: WhiteboardObject[],
): BoardStateSummary {
  return {
    objectCount: objects.length,
    objects: objects.map(summarizeObject),
    // allObjectIds no longer needed since we send all objects
  };
}

/**
 * Renders the board state summary as JSON for the system prompt.
 * The model should use the exact id values from the objects array in tool calls.
 */
export function boardStateToPromptString(
  summary: BoardStateSummary,
): string {
  if (summary.objectCount === 0) {
    return JSON.stringify({ objectCount: 0, objects: [] });
  }
  return JSON.stringify(summary);
}
