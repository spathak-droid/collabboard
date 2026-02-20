/**
 * React hook for ultra-low latency cursor sync
 * 
 * Uses dedicated WebSocket (bypasses Yjs) for <10ms cursor updates.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { CursorSyncClient, CursorPosition, LiveDragPosition } from '../websocket/cursor-sync';

interface UseCursorSyncOptions {
  boardId: string;
  userId: string;
  userName: string;
  serverUrl?: string;
  enabled?: boolean;
}

export function useCursorSync(options: UseCursorSyncOptions) {
  const { boardId, userId, userName, enabled = true } = options;
  
  // Read the dedicated cursor server URL, fallback to main Hocuspocus server
  const cursorServerUrl = process.env.NEXT_PUBLIC_CURSOR_WS_URL;
  const mainServerUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
  
  // Use dedicated cursor server if available, otherwise fall back to main server
  const serverUrl = options.serverUrl || cursorServerUrl || mainServerUrl;
  
  const clientRef = useRef<CursorSyncClient | null>(null);
  const cursorsRef = useRef<Map<string, CursorPosition>>(new Map());
  const livePositionsRef = useRef<Map<string, LiveDragPosition>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  
  // Ultra-low latency cursor throttle
  const lastSentRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const SEND_INTERVAL = 8; // 8ms = ~120fps (optimal for cursor smoothness)

  // Throttle live drag per object (avoid flooding during drag)
  const lastLiveDragRef = useRef<Map<string, { x: number; y: number; time: number }>>(new Map());

  const handleCursorUpdate = useCallback((cursor: CursorPosition) => {
    // Measure latency (temporary - will remove after testing)
    const now = Date.now();
    const latency = now - cursor.timestamp;
    
    
    // Update ref only - no React re-render
    cursorsRef.current.set(cursor.userId, cursor);
  }, []);

  const handleUserLeave = useCallback((userId: string) => {
    cursorsRef.current.delete(userId);
    // Clear live drags from this user
    livePositionsRef.current.forEach((pos, objectId) => {
      if (pos.userId === userId) {
        livePositionsRef.current.delete(objectId);
      }
    });
  }, []);

  const handleLiveDragUpdate = useCallback((position: LiveDragPosition) => {
    livePositionsRef.current.set(position.objectId, position);
  }, []);

  const handleLiveDragEnd = useCallback((objectId: string, _userId?: string) => {
    livePositionsRef.current.delete(objectId);
  }, []);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    cursorsRef.current.clear();
    livePositionsRef.current.clear();
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('🖱️  Cursor sync error:', error);
  }, []);

  useEffect(() => {
    if (!enabled || !boardId || !userId) {
      return;
    }

    clientRef.current = new CursorSyncClient({
      boardId,
      userId,
      userName,
      serverUrl,
      onCursorUpdate: handleCursorUpdate,
      onUserLeave: handleUserLeave,
      onLiveDragUpdate: handleLiveDragUpdate,
      onLiveDragEnd: handleLiveDragEnd,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
    });

    clientRef.current.connect();

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [
    boardId,
    userId,
    userName,
    serverUrl,
    enabled,
    handleCursorUpdate,
    handleUserLeave,
    handleLiveDragUpdate,
    handleLiveDragEnd,
    handleConnect,
    handleDisconnect,
    handleError,
  ]);

  const sendCursor = useCallback((x: number, y: number) => {
    if (!clientRef.current || !enabled) {
      return;
    }

    const now = Date.now();
    const lastSent = lastSentRef.current;
    
    // Throttle: only send if moved >0.5px or 8ms elapsed
    const dx = Math.abs(x - lastSent.x);
    const dy = Math.abs(y - lastSent.y);
    const dt = now - lastSent.time;

    if ((dx > 0.5 || dy > 0.5) && dt >= SEND_INTERVAL) {
      clientRef.current.sendCursor(x, y);
      lastSentRef.current = { x, y, time: now };
    }
  }, [enabled]);

  const sendLiveDrag = useCallback(
    (
      objectId: string,
      x: number,
      y: number,
      extra?: {
        rotation?: number;
        width?: number;
        height?: number;
        radius?: number;
        points?: number[];
      }
    ) => {
      if (!clientRef.current || !enabled) return;

      const last = lastLiveDragRef.current.get(objectId);
      const now = Date.now();
      if (last && now - last.time < SEND_INTERVAL) {
        const dx = Math.abs(x - last.x);
        const dy = Math.abs(y - last.y);
        if (dx < 0.5 && dy < 0.5) return;
      }
      lastLiveDragRef.current.set(objectId, { x, y, time: now });

      clientRef.current.sendLiveDrag(objectId, x, y, extra);
    },
    [enabled]
  );

  const clearLiveDrag = useCallback((objectId: string) => {
    lastLiveDragRef.current.delete(objectId);
    clientRef.current?.sendLiveDragEnd(objectId);
  }, []);

  return {
    cursors: cursorsRef,
    livePositions: livePositionsRef,
    isConnected,
    sendCursor,
    sendLiveDrag,
    clearLiveDrag,
  };
}
