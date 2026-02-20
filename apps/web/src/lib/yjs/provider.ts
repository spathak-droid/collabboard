/**
 * Yjs WebSocket provider — uses @hocuspocus/provider (the native client
 * for Hocuspocus servers). This avoids the binary-token auth issue that
 * y-websocket has when talking to Hocuspocus.
 * 
 * OFFLINE RESILIENCE:
 * - Stores updates in IndexedDB while disconnected
 * - Auto-syncs on reconnect (Yjs CRDT handles conflicts)
 * - Survives page refreshes and browser crashes
 */

'use client';

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { WhiteboardObject } from '@/types/canvas';
import type { AwarenessState } from '@/types/yjs';
import { 
  saveOfflineSnapshot, 
  getPendingSnapshot, 
  markSnapshotSynced, 
  clearSyncedSnapshot,
  hasPendingSnapshotOnStartup,
  getPendingChangeCount
} from './offlineQueue';

export class YjsProvider {
  public ydoc: Y.Doc;
  public hocuspocus: HocuspocusProvider | null = null;
  public objects: Y.Map<WhiteboardObject>;
  public meta: Y.Map<string>;
  
  // Offline resilience
  private boardId: string | null = null;
  private isOnline = false;
  private pendingUpdateCount = 0;

  constructor() {
    this.ydoc = new Y.Doc();
    this.objects = this.ydoc.getMap('objects');
    this.meta = this.ydoc.getMap('meta');
  }

  async connect(boardId: string, user: { id: string; name: string; color: string }, preloadedSnapshot?: Uint8Array | null) {
    if (this.hocuspocus) {
      this.disconnect();
    }
    
    this.boardId = boardId;

    // Check for pending updates from previous session (page refresh recovery)
    // This must complete before connecting to ensure offline edits are loaded
    await this.checkPendingUpdatesOnStartup(boardId);

    // Apply preloaded snapshot if available (before connecting to server)
    // This allows instant rendering while server syncs any differences
    if (preloadedSnapshot) {
      try {
        Y.applyUpdate(this.ydoc, preloadedSnapshot);
        console.log(`[Yjs] Applied preloaded snapshot for board ${boardId} (${preloadedSnapshot.length} bytes)`);
      } catch (error) {
        console.warn(`[Yjs] Failed to apply preloaded snapshot for board ${boardId}:`, error);
        // Continue anyway - server will sync the correct state
      }
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
        this.handleReconnect();
      },
      onDisconnect: () => {
        console.warn('[Yjs] Disconnected from server');
        this.handleDisconnect();
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') {
          console.error(`[Yjs] Connection failed to ${wsUrl}. Check if the server is running and the URL is correct.`);
          this.isOnline = false;
        } else if (status === 'connected') {
          this.isOnline = true;
        }
      },
    });
    
    // Setup offline update capture
    this.setupOfflineUpdateCapture();

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
    
    // Cancel any pending offline snapshot saves
    if (this.offlineSnapshotTimeout) {
      clearTimeout(this.offlineSnapshotTimeout);
      this.offlineSnapshotTimeout = null;
    }

    if (this.hocuspocus) {
      this.hocuspocus.disconnect();
      this.hocuspocus.destroy();
      this.hocuspocus = null;
    }
    
    // Destroy Y.Doc to prevent "Yjs was already imported" warnings
    // This is critical for proper cleanup during Fast Refresh
    if (this.ydoc) {
      this.ydoc.destroy();
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

  /**
   * Update multiple objects in a single Yjs transaction.
   * This batches all updates into one update for optimal performance.
   * 
   * Performance: 50 updates = 1 Yjs update + 1 WebSocket broadcast + 1 React render
   * Instead of: 50 updates + 50 broadcasts + 50 renders
   * 
   * @param updates - Array of {id, data} pairs to update
   */
  updateObjectsBatch(updates: Array<{ id: string; data: Partial<WhiteboardObject> }>) {
    if (updates.length === 0) return;
    
    // Use Yjs transaction to batch all updates into a single update
    this.ydoc.transact(() => {
      for (const { id, data } of updates) {
        const existing = this.objects.get(id);
        if (existing) {
          const updated = { ...existing, ...data } as WhiteboardObject;
          this.objects.set(id, updated);
        }
      }
    });
  }

  getObject(id: string): WhiteboardObject | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): WhiteboardObject[] {
    return Array.from(this.objects.values());
  }

  clearObjects() {
    this.ydoc.transact(() => {
      this.objects.clear();
    });
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

  /**
   * Broadcast selection transform for multi-object moves (10+ objects)
   * This dramatically reduces network overhead by sending one transform
   * instead of N individual position updates
   * 
   * @param selectedIds - Array of selected object IDs
   * @param dx - Delta X from original positions
   * @param dy - Delta Y from original positions
   */
  broadcastSelectionTransform(selectedIds: string[], dx: number, dy: number) {
    if (!this.hocuspocus || selectedIds.length === 0) return;
    
    this.hocuspocus.setAwarenessField('selectionTransform', {
      selectedIds,
      dx,
      dy,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear selection transform (on drag end)
   */
  clearSelectionTransform() {
    if (!this.hocuspocus) return;
    this.hocuspocus.setAwarenessField('selectionTransform', null);
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
  
  // ── OFFLINE RESILIENCE ───────────────────────────────────────
  
  private offlineSnapshotTimeout: ReturnType<typeof setTimeout> | null = null;
  private offlineChangesPending = false;
  
  /**
   * Setup offline snapshot capture (debounced)
   * Instead of saving every update, save a full snapshot every 2 seconds
   * This is MUCH more efficient than storing hundreds of individual updates
   */
  private setupOfflineUpdateCapture() {
    // Listen to all Y.Doc updates
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // Only track changes if offline and not from sync/recovery
      if (!this.isOnline && origin !== 'sync' && origin !== 'recovery' && this.boardId) {
        this.offlineChangesPending = true;
        this.pendingUpdateCount++;
        
        // Debounce snapshot saves (save at most once every 2 seconds)
        if (this.offlineSnapshotTimeout) {
          clearTimeout(this.offlineSnapshotTimeout);
        }
        
        this.offlineSnapshotTimeout = setTimeout(async () => {
          if (this.offlineChangesPending && this.boardId) {
            try {
              // Save full Y.Doc state as snapshot (not individual update)
              const snapshot = Y.encodeStateAsUpdate(this.ydoc);
              await saveOfflineSnapshot(this.boardId, snapshot, this.pendingUpdateCount);
              this.offlineChangesPending = false;
              
              // Emit event for UI feedback
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('yjs:offline-change', {
                  detail: { 
                    boardId: this.boardId,
                    pendingCount: this.pendingUpdateCount
                  }
                }));
              }
              
              console.log(`[Yjs] Saved offline snapshot (${this.pendingUpdateCount} changes accumulated)`);
            } catch (error) {
              console.error('[Yjs] Failed to save offline snapshot:', error);
            }
          }
        }, 2000); // Debounce: Save at most once every 2 seconds
      }
    });
  }
  
  /**
   * Check for pending snapshot from previous session (page refresh recovery)
   */
  private async checkPendingUpdatesOnStartup(boardId: string) {
    try {
      const hasPending = await hasPendingSnapshotOnStartup(boardId);
      
      if (hasPending) {
        const snapshot = await getPendingSnapshot(boardId);
        
        if (snapshot) {
          this.pendingUpdateCount = snapshot.changeCount;
          
          console.log(`[Yjs] Found pending snapshot from previous session (${snapshot.changeCount} changes)`);
          
          // Emit event for UI feedback
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yjs:pending-recovery', {
              detail: { 
                boardId,
                pendingCount: snapshot.changeCount,
                message: `Recovering ${snapshot.changeCount} unsaved change${snapshot.changeCount !== 1 ? 's' : ''} from previous session`
              }
            }));
          }
          
          // Apply snapshot to Y.Doc
          Y.applyUpdate(this.ydoc, snapshot.snapshot, 'recovery');
          console.log(`[Yjs] Applied pending snapshot from ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
        }
      }
    } catch (error) {
      console.error('[Yjs] Failed to check pending snapshot on startup:', error);
    }
  }
  
  /**
   * Handle disconnect event
   */
  private handleDisconnect() {
    this.isOnline = false;
    
    // Emit event for UI feedback
    if (typeof window !== 'undefined' && this.pendingUpdateCount > 0) {
      window.dispatchEvent(new CustomEvent('yjs:offline', {
        detail: { 
          boardId: this.boardId,
          message: 'Disconnected. Your changes are being saved locally and will sync when reconnected.'
        }
      }));
    }
  }
  
  /**
   * Handle reconnect event
   */
  private async handleReconnect() {
    this.isOnline = true;
    
    if (!this.boardId) return;
    
    const pendingCount = this.pendingUpdateCount;
    
    if (pendingCount > 0) {
      console.log(`[Yjs] Reconnected - syncing ${pendingCount} pending changes`);
      
      // Emit syncing event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('yjs:syncing', {
          detail: { 
            boardId: this.boardId,
            pendingCount,
            message: `Syncing ${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}...`
          }
        }));
      }
      
      // Yjs automatically syncs the Y.Doc state to server
      // Just wait for sync to complete, then clean up IndexedDB
      setTimeout(async () => {
        try {
          await markSnapshotSynced(this.boardId!);
          
          // Wait a bit more to ensure server has persisted
          setTimeout(async () => {
            await clearSyncedSnapshot(this.boardId!);
            this.pendingUpdateCount = 0;
            
            // Emit success event
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('yjs:synced', {
                detail: { 
                  boardId: this.boardId,
                  message: `✅ All changes synced successfully!`
                }
              }));
            }
            
            console.log('[Yjs] Offline snapshot synced and cleared');
          }, 2000);
        } catch (error) {
          console.error('[Yjs] Failed to clear synced snapshot:', error);
        }
      }, 1000);
    } else {
      console.log('[Yjs] Reconnected (no pending changes)');
    }
  }
  
  /**
   * Get current pending update count
   */
  public getPendingUpdateCount(): number {
    return this.pendingUpdateCount;
  }
}
