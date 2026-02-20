/**
 * Custom hook for Yjs real-time sync
 *
 * Creates a fresh YjsProvider per mount (per board). The Hocuspocus Database
 * extension on the server loads/stores snapshots — the client doesn't load
 * snapshots itself, which avoids stale/corrupt data issues.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { YjsProvider } from '@/lib/yjs/provider';
import { getUserColor } from '@/lib/utils/colors';
import type { WhiteboardObject } from '@/types/canvas';
import type { ConnectionStatus, AwarenessState } from '@/types/yjs';

interface UseYjsOptions {
  boardId: string;
  userId: string;
  userName: string;
}

export const useYjs = ({ boardId, userId, userName }: UseYjsOptions) => {
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
      console.log('[useYjs] Objects changed, updating React state. Frame object:', 
        newObjects.find(o => o.type === 'frame')
      );
      setObjects(newObjects);
      setHasUnsavedChanges(true);
    });

    // Connect — HocuspocusProvider connects synchronously in the constructor
    const userColor = getUserColor(userId);
    provider.connect(boardId, { id: userId, name: userNameRef.current, color: userColor });

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

    return () => {
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
