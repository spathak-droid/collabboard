/**
 * Client-side Response Agent
 * 
 * Generates natural language responses from tool execution results.
 * This ensures users get meaningful feedback instead of generic messages.
 */

import type { ParsedToolCall } from './tools';
import type { ExecutionResult } from './executor';

export interface ResponseContext {
  originalMessage: string;
  toolCalls: ParsedToolCall[];
  executionResult: ExecutionResult;
  serverMessage?: string;
}

/**
 * Generate a natural, human-friendly response from tool execution results.
 */
export function generateResponse(context: ResponseContext): string {
  const { originalMessage, toolCalls, executionResult, serverMessage } = context;

  // If server provided an analysis message (like from AnalyzeAgent), keep it separate
  let analysisPrefix = '';
  if (serverMessage && 
      !isGenericMessage(serverMessage) && 
      !serverMessage.toLowerCase().includes("i'll") && 
      !serverMessage.toLowerCase().includes("i've")) {
    // This looks like an analysis result (e.g., "You have 5 circles")
    analysisPrefix = serverMessage;
  }

  // Count what was done
  const createdCount = executionResult.createdIds.length;
  const modifiedCount = executionResult.modifiedIds.length;
  const deletedCount = toolCalls.filter(tc => tc.name === 'deleteObject').length;

  // Generate response based on what happened
  const actionParts: string[] = [];

  // Handle creation
  if (createdCount > 0) {
    const createdTypes = getCreatedObjectTypes(toolCalls);
    const creationMessage = formatCreationMessage(createdTypes);
    
    // Handle connections
    const connectorCount = toolCalls.filter(tc => tc.name === 'createConnector').length;
    if (connectorCount > 0) {
      // Combine creation and connection in one sentence
      actionParts.push(`${creationMessage} and connected them with ${connectorCount === 1 ? 'a line' : `${connectorCount} lines`}`);
    } else {
      actionParts.push(creationMessage);
    }
  } else {
    // Handle connections separately if nothing was created
    const connectorCount = toolCalls.filter(tc => tc.name === 'createConnector').length;
    if (connectorCount > 0) {
      actionParts.push(`connected them with ${connectorCount} ${connectorCount === 1 ? 'line' : 'lines'}`);
    }
  }

  // Handle modifications
  if (modifiedCount > 0) {
    const modificationTypes = getModificationTypes(toolCalls);
    actionParts.push(formatModificationMessage(modificationTypes, modifiedCount));
  }

  // Handle deletions
  if (deletedCount > 0) {
    actionParts.push(`removed ${deletedCount} ${deletedCount === 1 ? 'object' : 'objects'}`);
  }

  // Handle organization
  const organizeCount = toolCalls.filter(tc => tc.name === 'arrangeInGrid').length;
  if (organizeCount > 0) {
    actionParts.push('arranged them in a grid');
  }

  // Combine into a sentence
  let actionMessage = '';
  if (actionParts.length > 0) {
    if (actionParts.length === 1) {
      actionMessage = `I've ${actionParts[0]}.`;
    } else {
      // Multiple distinct actions (not already combined)
      const last = actionParts.pop();
      actionMessage = `I've ${actionParts.join(', ')} and ${last}.`;
    }
  }

  // Combine analysis and actions with proper formatting
  if (analysisPrefix && actionMessage) {
    return `${analysisPrefix} ${actionMessage}`;
  } else if (analysisPrefix) {
    return analysisPrefix;
  } else if (actionMessage) {
    return actionMessage;
  }

  // Fallback
  return executionResult.summary || "I've completed the tasks.";
}

/**
 * Get types of objects that were created.
 */
function getCreatedObjectTypes(toolCalls: ParsedToolCall[]): Map<string, number> {
  const types = new Map<string, number>();

  for (const call of toolCalls) {
    if (call.name === 'createStickyNote') {
      types.set('sticky note', (types.get('sticky note') || 0) + 1);
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
  ];

  return genericMessages.some(generic => 
    message.toLowerCase().includes(generic.toLowerCase())
  );
}
