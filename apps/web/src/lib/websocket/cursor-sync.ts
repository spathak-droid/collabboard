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
  private isDisconnecting = false;

  constructor(config: CursorSyncConfig) {
    this.config = config;
  }

  connect(): void {
    // The serverUrl is already determined by the hook
    // Just use it directly to connect to /cursor/{boardId} path
    const baseUrl = this.config.serverUrl;
    const isSecure = baseUrl.startsWith('https://') || baseUrl.startsWith('wss://');
    const wsProtocol = isSecure ? 'wss:' : 'ws:';
    
    // Handle URLs that already have protocol
    let host: string;
    if (baseUrl.startsWith('ws://') || baseUrl.startsWith('wss://')) {
      const urlObj = new URL(baseUrl);
      host = urlObj.host;
    } else {
      // Assume it's a plain host or http/https URL
      const urlObj = new URL(baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`);
      host = urlObj.host;
    }
    
    const wsUrl = `${wsProtocol}//${host}/cursor/${this.config.boardId}?userId=${encodeURIComponent(this.config.userId)}&userName=${encodeURIComponent(this.config.userName)}`;
    
    console.log('🖱️  Connecting to cursor sync:', wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Reset disconnecting flag on successful connection
      this.isDisconnecting = false;
      console.log('🖱️  Cursor sync connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.config.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      // Skip processing if we're disconnecting or WebSocket is closing
      if (this.isDisconnecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        // Handle both text and binary (Blob) messages
        if (event.data instanceof Blob) {
          // Convert Blob to text - check connection state before processing
          event.data.text()
            .then((text) => {
              // Double-check connection is still open before processing
              if (!this.isDisconnecting && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.processMessage(text);
              }
            })
            .catch((err) => {
              // Only log if not disconnecting (to avoid noise during cleanup)
              if (!this.isDisconnecting) {
                console.error('🖱️  Failed to read Blob:', err);
              }
            });
          return;
        } else {
          // String message - process immediately
          this.processMessage(event.data);
        }
      } catch (err) {
        // Only log if not disconnecting
        if (!this.isDisconnecting) {
          console.error('🖱️  Failed to parse cursor message:', err);
        }
      }
    };

    this.ws.onerror = (event) => {
      const errorMsg = `WebSocket connection failed to ${wsUrl}. Check if the server is running and the URL is correct.`;
      console.error('🖱️  Cursor sync error:', errorMsg, event);
      this.config.onError?.(new Error(errorMsg));
    };

    this.ws.onclose = (event) => {
      // Only attempt reconnect if we're not intentionally disconnecting
      if (!this.isDisconnecting) {
        const closeReason = event.code === 1006 ? 'Connection closed abnormally (check server status)' : `Connection closed (code: ${event.code})`;
        console.log(`🖱️  Cursor sync disconnected: ${closeReason}`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.config.onDisconnect?.();
        this.attemptReconnect();
      } else {
        // Intentional disconnect - just clean up
        this.isConnected = false;
        this.stopHeartbeat();
        this.config.onDisconnect?.();
      }
    };
  }

  private processMessage(messageText: string): void {
    try {
      const data = JSON.parse(messageText);

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
    // Set flag to prevent processing pending messages
    this.isDisconnecting = true;
    
    this.stopHeartbeat();
    
    if (this.ws) {
      // Remove all event listeners to prevent callbacks after disconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      
      // Close the connection
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    
    this.isConnected = false;
  }

  isConnectedState(): boolean {
    return this.isConnected;
  }
}
