/**
 * Yjs WebSocket provider — uses @hocuspocus/provider (the native client
 * for Hocuspocus servers). This avoids the binary-token auth issue that
 * y-websocket has when talking to Hocuspocus.
 */

'use client';

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { WhiteboardObject } from '@/types/canvas';
import type { AwarenessState } from '@/types/yjs';

export class YjsProvider {
  public ydoc: Y.Doc;
  public hocuspocus: HocuspocusProvider | null = null;
  public objects: Y.Map<WhiteboardObject>;
  public meta: Y.Map<string>;

  constructor() {
    this.ydoc = new Y.Doc();
    this.objects = this.ydoc.getMap('objects');
    this.meta = this.ydoc.getMap('meta');
  }

  connect(boardId: string, user: { id: string; name: string; color: string }) {
    if (this.hocuspocus) {
      this.disconnect();
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

    this.hocuspocus = new HocuspocusProvider({
      url: wsUrl,
      name: `board-${boardId}`,
      document: this.ydoc,
      // Auth token sent via the Hocuspocus auth protocol (not raw binary)
      token: JSON.stringify({ userId: user.id, userName: user.name }),
      onAuthenticated: () => {
      },
      onAuthenticationFailed: ({ reason }) => {
        console.error(`[Yjs] Auth failed for ${wsUrl}:`, reason);
      },
      onConnect: () => {
      },
      onDisconnect: () => {
        console.warn('[Yjs] Disconnected from server');
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') {
          console.error(`[Yjs] Connection failed to ${wsUrl}. Check if the server is running and the URL is correct.`);
        }
      },
    });

    // Set user awareness (shared with other clients)
    this.hocuspocus.setAwarenessField('user', user);

    return this.hocuspocus;
  }

  disconnect() {
    // Cancel any pending cursor updates
    if (this._cursorRAFId !== null) {
      cancelAnimationFrame(this._cursorRAFId);
      this._cursorRAFId = null;
    }
    this._pendingCursor = null;
    this._lastSentCursor = null;
    this._isFirstCursorUpdate = true;

    if (this.hocuspocus) {
      this.hocuspocus.disconnect();
      this.hocuspocus.destroy();
      this.hocuspocus = null;
    }
  }

  // ── CRUD operations on the shared Y.Map ──────────────────

  updateObject(id: string, data: Partial<WhiteboardObject>) {
    const existing = this.objects.get(id);
    if (existing) {
      const updated = { ...existing, ...data } as WhiteboardObject;
      this.objects.set(id, updated);
    } else {
      console.warn('[Yjs Provider] Cannot update - object not found:', id);
    }
  }

  createObject(object: WhiteboardObject) {
    this.objects.set(object.id, object);
  }
  
  /**
   * Create multiple objects in a single atomic transaction
   * This is much more efficient than calling createObject() in a loop
   * @param objects - Array of objects to create
   */
  createObjectsBatch(objects: WhiteboardObject[]) {
    if (objects.length === 0) return;
    
    // Use Yjs transaction to batch all creates into a single update
    // This means: 1 Yjs update + 1 WebSocket broadcast + 1 React render
    // Instead of: N updates + N broadcasts + N renders
    this.ydoc.transact(() => {
      for (const obj of objects) {
        this.objects.set(obj.id, obj);
      }
    });
  }

  deleteObject(id: string) {
    this.objects.delete(id);
  }

  /**
   * Delete multiple objects in a single Yjs transaction.
   * This batches all deletions into one update for optimal performance.
   * 
   * Performance: 100 deletes = 1 Yjs update + 1 WebSocket broadcast + 1 React render
   * Instead of: 100 updates + 100 broadcasts + 100 renders
   */
  deleteObjectsBatch(ids: string[]) {
    if (ids.length === 0) return;
    
    // Use Yjs transaction to batch all deletions into a single update
    this.ydoc.transact(() => {
      for (const id of ids) {
        this.objects.delete(id);
      }
    });
  }

  getObject(id: string): WhiteboardObject | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): WhiteboardObject[] {
    return Array.from(this.objects.values());
  }

  // ── Awareness helpers ────────────────────────────────────

  /**
   * Broadcast live drag/transform position for instant visual feedback across users
   * This creates seamless, same-millisecond sync without persisting to Yjs
   * 
   * Used during object dragging/transforming to show real-time updates to other users
   * before the final state is committed on dragEnd/transformEnd
   */
  broadcastLiveDrag(objectId: string, x: number, y: number, extra?: { rotation?: number; width?: number; height?: number; radius?: number }) {
    if (!this.hocuspocus) return;
    
    const livePositions = this.hocuspocus.awareness?.getLocalState()?.livePositions || {};
    this.hocuspocus.setAwarenessField('livePositions', {
      ...livePositions,
      [objectId]: { x, y, ...extra, timestamp: Date.now() },
    });
  }

  /**
   * Clear live drag broadcast when drag ends
   */
  clearLiveDrag(objectId: string) {
    if (!this.hocuspocus) return;
    
    const livePositions = this.hocuspocus.awareness?.getLocalState()?.livePositions || {};
    const { [objectId]: _, ...rest } = livePositions;
    this.hocuspocus.setAwarenessField('livePositions', rest);
  }

  private _cursorRAFId: number | null = null;
  private _pendingCursor: { x: number; y: number } | null = null;
  private _lastSentCursor: { x: number; y: number; timestamp: number } | null = null;
  private readonly _CURSOR_SYNC_INTERVAL = 4; // ~240fps - maximum smoothness
  private _isFirstCursorUpdate = true;
  
  // Broadcast tracking for performance monitoring
  public broadcastCount = 0;
  private _lastBroadcastReset = Date.now();

  /**
   * Update cursor position with instant real-time sync
   * 
   * Optimized for zero-latency cursor sync.
   * 
   * Strategy:
   * - Send every cursor update immediately (no batching)
   * - No RAF delays
   * - No distance thresholds
   * - WebSocket broadcasts instantly via awareness
   */
  updateCursor(x: number, y: number) {
    if (!this.hocuspocus) return;

    const now = Date.now();
    
    // Throttle to max 250fps (4ms interval) to prevent network spam
    if (this._lastSentCursor && (now - this._lastSentCursor.timestamp) < 4) {
      return;
    }

    // Send immediately - no RAF, no threshold
    this.hocuspocus.setAwarenessField('cursor', {
      x,
      y,
      lastUpdate: now,
    });
    
    this._lastSentCursor = { x, y, timestamp: now };
    this.broadcastCount++;
  }
  
  /**
   * Get broadcast rate (calls per second) for performance monitoring
   */
  getBroadcastRate(): number {
    const now = Date.now();
    const elapsed = (now - this._lastBroadcastReset) / 1000;
    const rate = this.broadcastCount / elapsed;
    
    // Reset counter every second
    if (elapsed >= 1) {
      this.broadcastCount = 0;
      this._lastBroadcastReset = now;
    }
    
    return Math.round(rate);
  }

  getAwarenessStates(): Map<number, AwarenessState> {
    if (!this.hocuspocus) return new Map();
    return this.hocuspocus.awareness!.getStates() as Map<number, AwarenessState>;
  }

  onAwarenessChange(callback: () => void) {
    if (!this.hocuspocus) return () => {};
    this.hocuspocus.awareness!.on('change', callback);
    return () => {
      this.hocuspocus?.awareness?.off('change', callback);
    };
  }

  // ── Live Position Broadcasting (60fps) ───────────────────
  
  /**
   * Broadcast live object position for real-time collaboration
   * Updates awareness immediately for 60fps sync
   */
  broadcastLivePosition(objectId: string, x: number, y: number, extra?: {
    rotation?: number;
    width?: number;
    height?: number;
    radius?: number;
  }) {
    if (!this.hocuspocus) return;

    const currentState = this.hocuspocus.awareness!.getLocalState() || {};
    const livePositions = { ...(currentState.livePositions || {}) };
    
    livePositions[objectId] = {
      x,
      y,
      ...extra,
      lastUpdate: Date.now(),
    };

    this.hocuspocus.setAwarenessField('livePositions', livePositions);
  }

  /**
   * Clear live position for an object (drag/transform ended)
   */
  clearLivePosition(objectId: string) {
    if (!this.hocuspocus) return;

    const currentState = this.hocuspocus.awareness!.getLocalState() || {};
    const livePositions = { ...(currentState.livePositions || {}) };
    
    delete livePositions[objectId];

    this.hocuspocus.setAwarenessField('livePositions', livePositions);
  }

  /**
   * Clear all live positions (e.g., on unmount)
   */
  clearAllLivePositions() {
    if (!this.hocuspocus) return;
    this.hocuspocus.setAwarenessField('livePositions', {});
  }

  // ── Y.Map observer ──────────────────────────────────────

  onObjectsChange(callback: () => void) {
    // Use observeDeep to catch changes to map entries, not just key add/remove
    this.objects.observeDeep(callback);
    return () => {
      this.objects.unobserveDeep(callback);
    };
  }

  // ── Board metadata (title, etc.) ──────────────────────────

  setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  getMeta(key: string): string | undefined {
    return this.meta.get(key);
  }

  onMetaChange(callback: () => void) {
    this.meta.observe(callback);
    return () => {
      this.meta.unobserve(callback);
    };
  }

  // ── Connection status ────────────────────────────────────

  onStatusChange(callback: (status: { status: 'connected' | 'disconnected' }) => void) {
    if (!this.hocuspocus) return () => {};
    this.hocuspocus.on('status', callback);
    return () => {
      this.hocuspocus?.off('status', callback);
    };
  }
}
