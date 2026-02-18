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
}

export function useAICommands(options: UseAICommandsOptions) {
  const { boardId, createObject, updateObject, deleteObjects, objects, userId } =
    options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messageIdCounter = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

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

  // Build the WebSocket URL from the same base as the CRDT server
  const getWsUrl = useCallback(() => {
    const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
    return `${baseUrl}/ai/${boardId}`;
  }, [boardId]);

  // Connect WebSocket
  useEffect(() => {
    if (!boardId) return;

    const url = getWsUrl();
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
        const { actions, assistantMessage } = data as {
          actions: ParsedToolCall[];
          assistantMessage: string;
        };

        const ops: BoardOperations = {
          createObject: createObjectRef.current,
          updateObject: updateObjectRef.current,
          deleteObjects: deleteObjectsRef.current,
          objects: objectsRef.current,
          userId: userIdRef.current,
        };

        let actionSummary = '';
        if (actions && actions.length > 0) {
          const result = executeToolCalls(actions, ops);
          actionSummary = result.summary;
        }

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: assistantMessage,
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
  }, [boardId, getWsUrl]);

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

      setMessages((prev) => {
        const updated = [...prev, userMessage];

        const boardState = summarizeBoardState(objects);
        const conversationHistory = updated.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        ws.send(JSON.stringify({
          message: text,
          boardState,
          conversationHistory,
        }));

        return updated;
      });

      setIsProcessing(true);
    },
    [isProcessing, objects],
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
