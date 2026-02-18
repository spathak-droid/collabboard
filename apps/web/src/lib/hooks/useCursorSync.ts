/**
 * React hook for ultra-low latency cursor sync
 * 
 * Uses dedicated WebSocket (bypasses Yjs) for <10ms cursor updates.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { CursorSyncClient, CursorPosition } from '../websocket/cursor-sync';

interface UseCursorSyncOptions {
  boardId: string;
  userId: string;
  userName: string;
  serverUrl?: string;
  enabled?: boolean;
}

export function useCursorSync(options: UseCursorSyncOptions) {
  const { boardId, userId, userName, enabled = true } = options;
  const serverUrl = options.serverUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';
  
  const clientRef = useRef<CursorSyncClient | null>(null);
  const cursorsRef = useRef<Map<string, CursorPosition>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  
  // Throttle cursor updates to prevent excessive re-renders
  const lastSentRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const SEND_INTERVAL = 8; // 8ms = ~120fps

  const handleCursorUpdate = useCallback((cursor: CursorPosition) => {
    cursorsRef.current.set(cursor.userId, cursor);
    setCursors(new Map(cursorsRef.current));
  }, []);

  const handleUserLeave = useCallback((userId: string) => {
    cursorsRef.current.delete(userId);
    setCursors(new Map(cursorsRef.current));
  }, []);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    cursorsRef.current.clear();
    setCursors(new Map());
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

  return {
    cursors,
    isConnected,
    sendCursor,
  };
}
