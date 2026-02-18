/**
 * Lightweight WebSocket client for ultra-low latency cursor sync
 * 
 * Bypasses Yjs/Hocuspocus CRDT overhead for ephemeral cursor positions.
 * Uses dedicated WebSocket route on server for <10ms latency.
 */

export interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface CursorSyncConfig {
  boardId: string;
  userId: string;
  userName: string;
  serverUrl: string;
  onCursorUpdate: (cursor: CursorPosition) => void;
  onUserLeave: (userId: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class CursorSyncClient {
  private ws: WebSocket | null = null;
  private config: CursorSyncConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(config: CursorSyncConfig) {
    this.config = config;
  }

  connect(): void {
    // Single-port mode: Use same URL/port, different path
    // Path: /cursor/{boardId} on same port as Hocuspocus
    const url = new URL(`/cursor/${this.config.boardId}`, this.config.serverUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('userId', this.config.userId);
    url.searchParams.set('userName', this.config.userName);

    console.log(`🖱️  Connecting to cursor sync: ${url.toString()}`);

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      console.log('🖱️  Cursor sync connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.config.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'leave') {
          this.config.onUserLeave(data.userId);
          return;
        }

        if (data.type === 'cursor') {
          this.config.onCursorUpdate({
            userId: data.userId,
            userName: data.userName,
            x: data.x,
            y: data.y,
            timestamp: data.timestamp,
          });
        }
      } catch (err) {
        console.error('🖱️  Failed to parse cursor message:', err);
      }
    };

    this.ws.onerror = (event) => {
      console.error('🖱️  Cursor sync error:', event);
      this.config.onError?.(new Error('WebSocket error'));
    };

    this.ws.onclose = () => {
      console.log('🖱️  Cursor sync disconnected');
      this.isConnected = false;
      this.stopHeartbeat();
      this.config.onDisconnect?.();
      this.attemptReconnect();
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('🖱️  Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    console.log(`🖱️  Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  sendCursor(x: number, y: number): void {
    if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = JSON.stringify({
      type: 'cursor',
      userId: this.config.userId,
      userName: this.config.userName,
      x,
      y,
      timestamp: Date.now(),
    });

    this.ws.send(message);
  }

  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
  }

  isConnectedState(): boolean {
    return this.isConnected;
  }
}
