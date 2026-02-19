/**
 * React hook that manages the AI command lifecycle via WebSocket:
 *   user message → WS send → server calls OpenAI → WS receive → Yjs execution → UI feedback
 *
 * Connects to the /ai/{boardId} WebSocket endpoint on the same server
 * that handles CRDT sync and cursor broadcasting.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { summarizeBoardState } from '@/lib/ai/boardState';
import { executeToolCalls } from '@/lib/ai/executor';
import { generateResponse, isGenericMessage } from '@/lib/ai/responseAgent';
import type { BoardOperations } from '@/lib/ai/executor';
import type { ParsedToolCall } from '@/lib/ai/tools';
import type { WhiteboardObject } from '@/types/canvas';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actionSummary?: string;
}

interface UseAICommandsOptions {
  boardId: string;
  createObject: (obj: WhiteboardObject) => void;
  updateObject: (id: string, data: Partial<WhiteboardObject>) => void;
  deleteObjects: (ids: string[]) => void;
  objects: WhiteboardObject[];
  userId: string;
  /** Currently selected object IDs — when user says "them", "these", "format them", use these */
  selectedIds?: string[];
  /** Bounding box of the selected area — AI should operate within this region */
  selectionArea?: { x: number; y: number; width: number; height: number } | null;
}

export function useAICommands(options: UseAICommandsOptions) {
  const { boardId, createObject, updateObject, deleteObjects, objects, userId, selectedIds = [], selectionArea = null } =
    options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messageIdCounter = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const nextId = () => {
    messageIdCounter.current += 1;
    return `msg-${messageIdCounter.current}-${Date.now()}`;
  };

  // Stable refs for callbacks that need current values
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const createObjectRef = useRef(createObject);
  createObjectRef.current = createObject;
  const updateObjectRef = useRef(updateObject);
  updateObjectRef.current = updateObject;
  const deleteObjectsRef = useRef(deleteObjects);
  deleteObjectsRef.current = deleteObjects;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const selectionAreaRef = useRef(selectionArea);
  selectionAreaRef.current = selectionArea;
  
  // Track the original message for follow-up calls
  const originalMessageRef = useRef<string>('');
  const boardIdRef = useRef(boardId);

  // Connect WebSocket (only reconnect when boardId changes)
  useEffect(() => {
    if (!boardId) return;

    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    const url = `${baseUrl}/ai/${boardId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[AI WS] Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'connected') {
        return;
      }

      if (data.type === 'processing') {
        return;
      }
      
      // Handle progress updates from multi-step tasks
      if (data.type === 'progress') {
        const { step, totalSteps, task, actions, message } = data;
        
        const ops: BoardOperations = {
          createObject: createObjectRef.current,
          updateObject: updateObjectRef.current,
          deleteObjects: deleteObjectsRef.current,
          objects: objectsRef.current,
          userId: userIdRef.current,
        };
        
        // Execute the actions for this step
        const executionResult = executeToolCalls(actions, ops, {
          objectsRef: objectsRef.current,
          canvasViewportRef: { x: 0, y: 0 },
        });
        
        // Generate response for this step
        const stepMessage = generateResponse({
          originalMessage: originalMessageRef.current,
          toolCalls: actions,
          executionResult,
          serverMessage: message,
        });
        
        // Add message to chat
        const chatMessage: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: stepMessage,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, chatMessage]);
        
        return;
      }
      
      // Handle completion signal when progress updates were used
      if (data.type === 'complete') {
        setIsProcessing(false);
        return;
      }

      if (data.type === 'error') {
        const errorMessage: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${data.error}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsProcessing(false);
        return;
      }

      if (data.type === 'result') {
        const { actions, assistantMessage, requiresFollowUp, remainingTasks, supervisorPlan } = data as {
          actions: ParsedToolCall[];
          assistantMessage: string;
          requiresFollowUp?: boolean;
          remainingTasks?: any[];
          supervisorPlan?: any;
        };

        const ops: BoardOperations = {
          createObject: createObjectRef.current,
          updateObject: updateObjectRef.current,
          deleteObjects: deleteObjectsRef.current,
          objects: objectsRef.current,
          userId: userIdRef.current,
        };

        let actionSummary = '';
        let createdIds: string[] = [];
        let executionResult;
        
        if (actions && actions.length > 0) {
          executionResult = executeToolCalls(actions, ops, {
            selectionArea: selectionAreaRef.current ?? undefined,
          });
          actionSummary = executionResult.summary;
          createdIds = executionResult.createdIds;
        }

        // If requires follow-up, send execution results back to server
        if (requiresFollowUp && remainingTasks) {
          console.log('[AI] Requires follow-up, sending execution results back to server');
          
          // Wait a tiny bit for objects to sync, then send follow-up
          setTimeout(() => {
            const updatedBoardState = summarizeBoardState(objectsRef.current);
            
            ws.send(JSON.stringify({
              message: originalMessageRef.current,
              boardState: updatedBoardState,
              conversationHistory: messagesRef.current.slice(-10).map((m) => ({
                role: m.role,
                content: m.content,
              })),
              selectedIds: selectedIds.length > 0 ? selectedIds : undefined,
              selectionArea: selectionAreaRef.current ?? undefined,
              toolExecutionResults: {
                summary: actionSummary,
                createdIds,
              },
              remainingTasks, // Include remaining tasks for continuation
            }));
          }, 100);
          
          return; // Don't show message yet, wait for follow-up response
        }

        // Generate natural language response using the response agent
        let finalMessage = assistantMessage;
        
        // If the server message is generic or if there were actions, generate a better message
        if (executionResult && (isGenericMessage(assistantMessage) || actions.length > 0)) {
          finalMessage = generateResponse({
            originalMessage: originalMessageRef.current,
            toolCalls: actions,
            executionResult,
            serverMessage: assistantMessage,
          });
        }

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: finalMessage,
          timestamp: Date.now(),
          actionSummary: actionSummary || undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setIsProcessing(false);
      }
    };

    ws.onclose = () => {
      console.log('[AI WS] Disconnected');
      setIsConnected(false);
    };

    ws.onerror = (err) => {
      console.error('[AI WS] Error:', err);
      setIsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  /**
   * Send a natural-language command to the AI server via WebSocket.
   */
  const sendCommand = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        const errorMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: 'AI Assistant is not connected. Please try again in a moment.',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        return;
      }

      const userMessage: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const updated = [...messages, userMessage];
      setMessages(updated);

      // Store original message for potential follow-up
      originalMessageRef.current = text;

      const boardState = summarizeBoardState(objects);
      const conversationHistory = updated.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      ws.send(JSON.stringify({
        message: text,
        boardState,
        conversationHistory,
        selectedIds: selectedIds.length > 0 ? selectedIds : undefined,
        selectionArea: selectionArea ?? undefined,
      }));

      setIsProcessing(true);
    },
    [isProcessing, objects, messages, selectedIds, selectionArea],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isProcessing,
    isConnected,
    sendCommand,
    clearMessages,
  };
}
