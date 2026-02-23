/**
 * Custom hook for Yjs real-time sync with auto-save
 *
 * Creates a fresh YjsProvider per mount (per board). The Hocuspocus Database
 * extension on the server loads/stores snapshots — the client doesn't load
 * snapshots itself, which avoids stale/corrupt data issues.
 * 
 * However, we can preload snapshots from the dashboard for faster initial rendering.
 * The preloaded snapshot is applied before connecting, allowing instant display
 * while the server syncs any differences.
 * 
 * AUTO-SAVE: Snapshots are automatically saved to Supabase Storage every 30 seconds
 * to ensure persistence and enable fast board loading.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { YjsProvider } from '@/lib/yjs/provider';
import { getUserColor } from '@/lib/utils/colors';
import { getCachedSnapshot } from '@/lib/utils/snapshotCache';
import { saveSnapshot } from '@/lib/yjs/sync';
import type { WhiteboardObject } from '@/types/canvas';
import type { ConnectionStatus, AwarenessState } from '@/types/yjs';

interface UseYjsOptions {
  boardId: string;
  userId: string;
  userName: string;
  preloadedSnapshot?: Uint8Array | null;
}

export const useYjs = ({ boardId, userId, userName, preloadedSnapshot }: UseYjsOptions) => {
  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'connecting',
  });
  const [onlineUsers, setOnlineUsers] = useState<AwarenessState[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [boardTitle, setBoardTitleState] = useState<string>('');
  const [canvasBackgroundColor, setCanvasBackgroundColorState] = useState<string | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [awareness, setAwareness] = useState<any>(null);

  // One provider per hook lifecycle (fresh Y.Doc each time)
  const providerRef = useRef<YjsProvider | null>(null);

  // Keep userName in a ref so changes don't tear down the WS connection.
  // The awareness field is updated separately below.
  const userNameRef = useRef(userName);
  userNameRef.current = userName;

  // ── Connect / disconnect ────────────────────────────────
  // Only reconnect when boardId or userId changes (not userName).
  useEffect(() => {
    if (!boardId || !userId) return;

    const provider = new YjsProvider();
    providerRef.current = provider;

    // Clear awareness on tab close so other clients see us offline immediately (avoids ~30s timeout)
    const handleUnload = () => providerRef.current?.clearAwareness?.();
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    // Store unsubscribe functions and interval for stale check
    let unsubObjects: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;
    let unsubAwareness: (() => void) | null = null;
    let unsubMeta: (() => void) | null = null;
    let staleCheckInterval: ReturnType<typeof setInterval> | null = null;

    // --- object change listener ---
    unsubObjects = provider.onObjectsChange(() => {
      const newObjects = provider.getAllObjects();
      setObjects(newObjects);
      setHasUnsavedChanges(true);
    });

    // Get snapshot from cache if not provided as prop
    const snapshot = preloadedSnapshot ?? getCachedSnapshot(boardId);

    // Connect — Async to handle pending offline updates
    // Preloaded snapshot is applied before connecting for instant rendering
    const userColor = getUserColor(userId);
    
    // --- AUTO-SAVE: Save snapshot every 30 seconds (per PRD requirement) ---
    let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let initialSaveTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasChanges = false;
    let hasSavedInitial = false;

    // Save initial snapshot immediately if objects exist (ensures dashboard can preload)
    // This prevents "no snapshot yet" errors when users create boards
    const saveInitialSnapshot = async () => {
      if (hasSavedInitial) return;
      
      try {
        await saveSnapshot(boardId, provider.ydoc, userId);
        hasSavedInitial = true;
        console.log(`[Yjs Auto-save] Initial snapshot saved for board ${boardId}`);
      } catch (error) {
        console.error('[Yjs Auto-save] Failed to save initial snapshot:', error);
      }
    };

    // Mark changes when objects change
    const markChanges = () => {
      hasChanges = true;
      // If this is the first change and we haven't saved yet, save immediately
      if (!hasSavedInitial) {
        saveInitialSnapshot();
      }
    };
    provider.onObjectsChange(markChanges);

    const scheduleSave = () => {
      saveTimeoutId = setTimeout(async () => {
        if (hasChanges && provider.ydoc) {
          try {
            await saveSnapshot(boardId, provider.ydoc, userId);
            hasChanges = false;
            setHasUnsavedChanges(false);
            console.log(`[Yjs Auto-save] Snapshot saved for board ${boardId}`);
          } catch (error) {
            console.error('[Yjs Auto-save] Failed to save snapshot:', error);
          }
        }
        // Schedule next save
        scheduleSave();
      }, 30000); // 30 seconds
    };
    
    // Use async IIFE to handle await inside useEffect
    (async () => {
      try {
        await provider.connect(boardId, { id: userId, name: userNameRef.current, color: userColor }, snapshot);
        
        // Setup listeners after connection
        // --- connection status listener (needs hocuspocus instance) ---
        unsubStatus = provider.onStatusChange(({ status }) => {
          setConnectionStatus({ status });
        });

        // --- expose awareness instance for Cursors component ---
        if (provider.hocuspocus?.awareness) {
          setAwareness(provider.hocuspocus.awareness);
        }

        // --- awareness (online users) listener ---
        // Everyone sends a lastPing heartbeat every 2s; remove from list if no update in STALE_DISPLAY_MS
        const STALE_DISPLAY_MS = 3500; // ~1.5s after last 2s heartbeat = remove within ~3.5–4s of disconnect
        const lastSeenByUserId = new Map<string, number>();
        let lastUserIds = '';
        let lastFilterRun = 0;
        const THROTTLE_MS = 400;

        type AwarenessStateWithPing = AwarenessState & { lastPing?: number; cursor?: { lastUpdate?: number } };

        const applyStaleFilterAndUpdate = () => {
          const states = provider.getAwarenessStates();
          const now = Date.now();
          const users: AwarenessState[] = [];
          states.forEach((state) => {
            if (state.user) {
              const s = state as AwarenessStateWithPing;
              const lastSeen = s.lastPing ?? s.cursor?.lastUpdate ?? now;
              lastSeenByUserId.set(state.user.id, lastSeen);
              if (now - lastSeen < STALE_DISPLAY_MS) {
                users.push(state as AwarenessState);
              }
            }
          });
          const currentUserIds = users.map((u) => u.user.id).sort().join(',');
          if (currentUserIds !== lastUserIds) {
            lastUserIds = currentUserIds;
            flushSync(() => setOnlineUsers(users));
          }
        };

        const updateOnlineUsers = () => {
          const states = provider.getAwarenessStates();
          const now = Date.now();
          states.forEach((state) => {
            if (state.user) {
              const s = state as AwarenessStateWithPing;
              const lastSeen = s.lastPing ?? s.cursor?.lastUpdate ?? now;
              lastSeenByUserId.set(state.user.id, lastSeen);
            }
          });
          const since = now - lastFilterRun;
          if (since >= THROTTLE_MS) {
            lastFilterRun = now;
            applyStaleFilterAndUpdate();
          }
        };

        unsubAwareness = provider.onAwarenessChange(updateOnlineUsers);
        applyStaleFilterAndUpdate();

        // Re-check every 500ms so we remove stale users from the list soon after disconnect
        staleCheckInterval = setInterval(applyStaleFilterAndUpdate, 500);

        // --- board metadata (title, backgroundColor) listener ---
        unsubMeta = provider.onMetaChange(() => {
          const title = provider.getMeta('title');
          if (title !== undefined) {
            setBoardTitleState(title);
          }
          const bg = provider.getMeta('backgroundColor');
          setCanvasBackgroundColorState(bg ?? undefined);
        });
        // Load initial title and background if already in the Y.Doc
        const initialTitle = provider.getMeta('title');
        if (initialTitle !== undefined) {
          setBoardTitleState(initialTitle);
        }
        const initialBg = provider.getMeta('backgroundColor');
        setCanvasBackgroundColorState(initialBg ?? undefined);

        // Load initial objects (may be empty until server syncs the snapshot)
        setObjects(provider.getAllObjects());
        
        // Save initial snapshot after a short delay (allow server sync to complete first)
        initialSaveTimeout = setTimeout(() => {
          saveInitialSnapshot();
        }, 2000); // 2 seconds after connection

        // Start auto-save cycle
        scheduleSave();
      } catch (error) {
        console.error('[Yjs] Failed to connect:', error);
        setConnectionStatus({ status: 'disconnected', message: 'Connection failed' });
      }
    })();

    return () => {
      if (staleCheckInterval) clearInterval(staleCheckInterval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (initialSaveTimeout) {
        clearTimeout(initialSaveTimeout);
      }
      if (saveTimeoutId) {
        clearTimeout(saveTimeoutId);
      }
      // Save one final time on unmount if there are unsaved changes
      if (hasChanges && provider.ydoc) {
        saveSnapshot(boardId, provider.ydoc, userId).catch((error) => {
          console.error('[Yjs Auto-save] Failed to save final snapshot on unmount:', error);
        });
      }
      if (unsubObjects) unsubObjects();
      if (unsubStatus) unsubStatus();
      if (unsubAwareness) unsubAwareness();
      if (unsubMeta) unsubMeta();
      provider.disconnect();
      providerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, userId]);

  // ── CRUD helpers (always use latest providerRef) ────────
  const createObject = useCallback((object: WhiteboardObject) => {
    providerRef.current?.createObject(object);
  }, []);
  
  const createObjectsBatch = useCallback((objects: WhiteboardObject[]) => {
    providerRef.current?.createObjectsBatch(objects);
  }, []);

  const updateObject = useCallback((id: string, data: Partial<WhiteboardObject>) => {
    providerRef.current?.updateObject(id, data);
  }, []);

  const deleteObject = useCallback((id: string) => {
    providerRef.current?.deleteObject(id);
  }, []);

  const deleteObjects = useCallback((ids: string[]) => {
    providerRef.current?.deleteObjectsBatch(ids);
  }, []);

  const clearObjects = useCallback(() => {
    providerRef.current?.clearObjects();
  }, []);

  const updateCursor = useCallback((x: number, y: number) => {
    providerRef.current?.updateCursor(x, y);
  }, []);

  const broadcastLiveDrag = useCallback((objectId: string, x: number, y: number, extra?: { rotation?: number; width?: number; height?: number; radius?: number }) => {
    providerRef.current?.broadcastLiveDrag(objectId, x, y, extra);
  }, []);

  const clearLiveDrag = useCallback((objectId: string) => {
    providerRef.current?.clearLiveDrag(objectId);
  }, []);

  const broadcastLivePosition = useCallback((objectId: string, x: number, y: number, extra?: { rotation?: number; width?: number; height?: number; radius?: number }) => {
    providerRef.current?.broadcastLivePosition(objectId, x, y, extra);
  }, []);

  const clearLivePosition = useCallback((objectId: string) => {
    providerRef.current?.clearLivePosition(objectId);
  }, []);

  const broadcastSelectionTransform = useCallback((selectedIds: string[], dx: number, dy: number) => {
    providerRef.current?.broadcastSelectionTransform(selectedIds, dx, dy);
  }, []);

  const clearSelectionTransform = useCallback(() => {
    providerRef.current?.clearSelectionTransform();
  }, []);

  const updateObjectsBatch = useCallback((updates: Array<{ id: string; data: Partial<WhiteboardObject> }>) => {
    providerRef.current?.updateObjectsBatch(updates);
  }, []);

  const setBoardTitle = useCallback((title: string) => {
    providerRef.current?.setMeta('title', title);
  }, []);

  const setCanvasBackgroundColor = useCallback((color: string) => {
    providerRef.current?.setMeta('backgroundColor', color);
    setCanvasBackgroundColorState(color);
  }, []);

  const getBroadcastRate = useCallback(() => {
    return providerRef.current?.getBroadcastRate() || 0;
  }, []);

  return {
    objects,
    connectionStatus,
    onlineUsers,
    awareness,
    hasUnsavedChanges,
    boardTitle,
    canvasBackgroundColor,
    setCanvasBackgroundColor,
    createObject,
    createObjectsBatch,
    updateObject,
    updateObjectsBatch,
    deleteObject,
    deleteObjects,
    updateCursor,
    broadcastLiveDrag,
    clearLiveDrag,
    broadcastLivePosition,
    clearLivePosition,
    broadcastSelectionTransform,
    clearSelectionTransform,
    setBoardTitle,
    getBroadcastRate,
    clearObjects,
  };
};
