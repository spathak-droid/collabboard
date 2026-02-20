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

    // --- object change listener ---
    const unsubObjects = provider.onObjectsChange(() => {
      const newObjects = provider.getAllObjects();
      setObjects(newObjects);
      setHasUnsavedChanges(true);
    });

    // Get snapshot from cache if not provided as prop
    const snapshot = preloadedSnapshot ?? getCachedSnapshot(boardId);

    // Connect — HocuspocusProvider connects synchronously in the constructor
    // Preloaded snapshot is applied before connecting for instant rendering
    const userColor = getUserColor(userId);
    provider.connect(boardId, { id: userId, name: userNameRef.current, color: userColor }, snapshot);

    // --- connection status listener (needs hocuspocus instance) ---
    const unsubStatus = provider.onStatusChange(({ status }) => {
      setConnectionStatus({ status });
    });

    // --- expose awareness instance for Cursors component ---
    if (provider.hocuspocus?.awareness) {
      setAwareness(provider.hocuspocus.awareness);
    }

    // --- awareness (online users) listener ---
    // Only update React state when user list changes (join/leave),
    // NOT on every cursor move. This prevents full-page re-renders.
    let lastUserIds = '';
    const updateOnlineUsers = () => {
      const states = provider.getAwarenessStates();
      const users: AwarenessState[] = [];
      states.forEach((state) => {
        if (state.user) {
          users.push(state as AwarenessState);
        }
      });

      // Only trigger React re-render if user list changed
      const currentUserIds = users.map((u) => u.user.id).sort().join(',');
      if (currentUserIds !== lastUserIds) {
        lastUserIds = currentUserIds;
        setOnlineUsers(users);
      }
    };

    const unsubAwareness = provider.onAwarenessChange(updateOnlineUsers);
    updateOnlineUsers();

    // --- board metadata (title) listener ---
    const unsubMeta = provider.onMetaChange(() => {
      const title = provider.getMeta('title');
      if (title !== undefined) {
        setBoardTitleState(title);
      }
    });
    // Load initial title if already in the Y.Doc
    const initialTitle = provider.getMeta('title');
    if (initialTitle !== undefined) {
      setBoardTitleState(initialTitle);
    }

    // Load initial objects (may be empty until server syncs the snapshot)
    setObjects(provider.getAllObjects());

    // --- AUTO-SAVE: Save snapshot every 30 seconds (per PRD requirement) ---
    let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
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

    // Save initial snapshot after a short delay (allow server sync to complete first)
    const initialSaveTimeout = setTimeout(() => {
      saveInitialSnapshot();
    }, 2000); // 2 seconds after connection

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

    // Start auto-save cycle
    scheduleSave();

    return () => {
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
      unsubObjects();
      unsubStatus();
      unsubAwareness();
      unsubMeta();
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

  const setBoardTitle = useCallback((title: string) => {
    providerRef.current?.setMeta('title', title);
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
    createObject,
    createObjectsBatch,
    updateObject,
    deleteObject,
    deleteObjects,
    updateCursor,
    broadcastLiveDrag,
    clearLiveDrag,
    broadcastLivePosition,
    clearLivePosition,
    setBoardTitle,
    getBroadcastRate,
  };
};
