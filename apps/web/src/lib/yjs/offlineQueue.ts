/**
 * IndexedDB-based offline operation queue for Yjs
 * 
 * OPTIMIZED STRATEGY:
 * - Instead of storing every update, store periodic snapshots
 * - While offline: Update snapshot every 2 seconds (debounced)
 * - On reconnect: Yjs syncs the final state (one operation)
 * - Much more efficient than storing 100+ individual updates
 * 
 * BENEFITS:
 * - Minimal storage (one snapshot vs hundreds of updates)
 * - Faster recovery (apply one snapshot vs replay 100+ updates)
 * - Simpler sync (one state vs accumulated diffs)
 */

const DB_NAME = 'collab-board-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-snapshots'; // Changed from pending-updates

export interface PendingSnapshot {
  id: string; // board ID (one per board)
  boardId: string;
  snapshot: Uint8Array; // Full Yjs state snapshot
  timestamp: number;
  changeCount: number; // How many changes since last sync
  synced: boolean;
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Initialize IndexedDB for offline queue
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineQueue] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        const db = request.result;
        
        // Verify the store exists after opening
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          console.warn('[OfflineQueue] Store missing after open, triggering migration');
          db.close();
          // Force upgrade by deleting and recreating
          const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
          deleteRequest.onsuccess = () => {
            // Retry opening with fresh database
            const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
            retryRequest.onsuccess = () => resolve(retryRequest.result);
            retryRequest.onerror = () => reject(retryRequest.error);
            retryRequest.onupgradeneeded = (event) => {
              handleUpgrade((event.target as IDBOpenDBRequest).result);
            };
          };
          deleteRequest.onerror = () => {
            console.error('[OfflineQueue] Failed to delete database for migration');
            reject(deleteRequest.error);
          };
        } else {
          resolve(db);
        }
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        handleUpgrade(db);
      };
    } catch (error) {
      console.error('[OfflineQueue] IndexedDB not available:', error);
      reject(error);
    }
  });
}

/**
 * Handle database schema upgrade
 */
function handleUpgrade(db: IDBDatabase): void {
  // Delete old store if it exists (migration from updates to snapshots)
  if (db.objectStoreNames.contains('pending-updates')) {
    db.deleteObjectStore('pending-updates');
    console.log('[OfflineQueue] Migrated from pending-updates to pending-snapshots');
  }

  // Create object store if it doesn't exist
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    store.createIndex('boardId', 'boardId', { unique: true }); // One snapshot per board
    store.createIndex('timestamp', 'timestamp', { unique: false });
    store.createIndex('synced', 'synced', { unique: false });
    console.log('[OfflineQueue] IndexedDB initialized with snapshot storage');
  }
}

/**
 * Save/update offline snapshot for a board
 * Replaces any existing snapshot (we only keep the latest state)
 */
export async function saveOfflineSnapshot(
  boardId: string,
  snapshot: Uint8Array,
  changeCount: number = 1
): Promise<void> {
  if (!isIndexedDBAvailable()) {
    console.warn('[OfflineQueue] IndexedDB not available, skipping offline save');
    return;
  }
  
  try {
    const db = await openDB();
    
    // Verify the store exists
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.warn('[OfflineQueue] Store not found during save, skipping');
      db.close();
      return;
    }
    
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Check if snapshot already exists for this board
    const existing = await new Promise<PendingSnapshot | undefined>((resolve) => {
      const request = store.get(boardId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });

    const pendingSnapshot: PendingSnapshot = {
      id: boardId, // Use boardId as primary key (one snapshot per board)
      boardId,
      snapshot,
      timestamp: Date.now(),
      changeCount: existing ? existing.changeCount + changeCount : changeCount,
      synced: false,
    };

    // Use put() instead of add() to replace existing snapshot
    await new Promise<void>((resolve, reject) => {
      const request = store.put(pendingSnapshot);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log(`[OfflineQueue] Updated snapshot for board ${boardId} (${snapshot.length} bytes, ${pendingSnapshot.changeCount} changes)`);
  } catch (error) {
    console.error('[OfflineQueue] Failed to save offline snapshot:', error);
    // Don't throw - failing to save to IndexedDB shouldn't break the app
  }
}

/**
 * Get pending snapshot for a board
 */
export async function getPendingSnapshot(boardId: string): Promise<PendingSnapshot | null> {
  if (!isIndexedDBAvailable()) {
    return null;
  }
  
  try {
    const db = await openDB();
    
    // Verify the store exists before trying to access it
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.warn('[OfflineQueue] Store not found, reinitializing database');
      db.close();
      // Delete and recreate the database
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
      // Try again with fresh database
      return await getPendingSnapshot(boardId);
    }
    
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(boardId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[OfflineQueue] Failed to get pending snapshot:', error);
    // If there's a schema error, clear the database
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      console.warn('[OfflineQueue] Clearing corrupted database');
      try {
        await new Promise<void>((resolve) => {
          const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => resolve(); // Ignore delete errors
        });
      } catch (deleteError) {
        console.error('[OfflineQueue] Failed to delete corrupted database:', deleteError);
      }
    }
    return null;
  }
}

/**
 * Mark snapshot as synced for a board
 */
export async function markSnapshotSynced(boardId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const snapshot = await new Promise<PendingSnapshot | undefined>((resolve) => {
      const request = store.get(boardId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });

    if (snapshot) {
      snapshot.synced = true;
      await new Promise<void>((resolve, reject) => {
        const request = store.put(snapshot);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      console.log(`[OfflineQueue] Marked snapshot as synced for board ${boardId}`);
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to mark snapshot as synced:', error);
  }
}

/**
 * Clear synced snapshot for a board
 */
export async function clearSyncedSnapshot(boardId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const snapshot = await new Promise<PendingSnapshot | undefined>((resolve) => {
      const request = store.get(boardId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });

    if (snapshot && snapshot.synced) {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(boardId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      console.log(`[OfflineQueue] Cleared synced snapshot for board ${boardId}`);
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear synced snapshot:', error);
  }
}

/**
 * Get change count for a board
 */
export async function getPendingChangeCount(boardId: string): Promise<number> {
  if (!isIndexedDBAvailable()) {
    return 0;
  }
  
  try {
    const snapshot = await getPendingSnapshot(boardId);
    return snapshot && !snapshot.synced ? snapshot.changeCount : 0;
  } catch (error) {
    console.error('[OfflineQueue] Failed to get pending count:', error);
    return 0;
  }
}

/**
 * Clear all data for a board (emergency cleanup)
 */
export async function clearAllData(boardId: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(boardId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log(`[OfflineQueue] Cleared all data for board ${boardId}`);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear all data:', error);
  }
}

/**
 * Check if there's a pending snapshot on startup (page refresh recovery)
 */
export async function hasPendingSnapshotOnStartup(boardId: string): Promise<boolean> {
  if (!isIndexedDBAvailable()) {
    return false;
  }
  
  try {
    const snapshot = await getPendingSnapshot(boardId);
    
    if (snapshot && !snapshot.synced) {
      console.log(`[OfflineQueue] Found pending snapshot from previous session (${snapshot.changeCount} changes)`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[OfflineQueue] Failed to check pending snapshot:', error);
    return false;
  }
}

// Deprecated function names for backwards compatibility
export const saveOfflineUpdate = saveOfflineSnapshot;
export const getPendingUpdates = async (boardId: string) => {
  const snapshot = await getPendingSnapshot(boardId);
  return snapshot ? [snapshot as any] : [];
};
export const markUpdatesSynced = markSnapshotSynced;
export const clearSyncedUpdates = clearSyncedSnapshot;
export const getPendingUpdateCount = getPendingChangeCount;
export const clearAllUpdates = clearAllData;
export const hasPendingUpdatesOnStartup = hasPendingSnapshotOnStartup;
