/**
 * Snapshot cache for preloading board snapshots
 * Stores snapshots in memory for fast board loading
 */

import { loadSnapshot } from '@/lib/yjs/sync';

const snapshotCache = new Map<string, { data: Uint8Array; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached snapshot for a board
 */
export function getCachedSnapshot(boardId: string): Uint8Array | null {
  const cached = snapshotCache.get(boardId);
  if (!cached) return null;

  // Check if cache is expired
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    snapshotCache.delete(boardId);
    return null;
  }

  return cached.data;
}

/**
 * Cache a snapshot for a board
 */
export function setCachedSnapshot(boardId: string, snapshot: Uint8Array): void {
  snapshotCache.set(boardId, {
    data: snapshot,
    timestamp: Date.now(),
  });
}

/**
 * Preload snapshots for multiple boards in parallel
 * Returns a map of boardId -> snapshot (or null if not found/failed)
 */
export async function preloadSnapshots(boardIds: string[]): Promise<Map<string, Uint8Array | null>> {
  const results = new Map<string, Uint8Array | null>();

  // Check cache first
  const uncachedIds: string[] = [];
  for (const boardId of boardIds) {
    const cached = getCachedSnapshot(boardId);
    if (cached) {
      results.set(boardId, cached);
    } else {
      uncachedIds.push(boardId);
    }
  }

  // Load uncached snapshots in parallel
  if (uncachedIds.length > 0) {
    const loadPromises = uncachedIds.map(async (boardId) => {
      try {
        const snapshot = await loadSnapshot(boardId);
        if (snapshot) {
          setCachedSnapshot(boardId, snapshot);
        }
        return { boardId, snapshot };
      } catch (error) {
        console.warn(`Failed to preload snapshot for board ${boardId}:`, error);
        return { boardId, snapshot: null };
      }
    });

    const loaded = await Promise.all(loadPromises);
    for (const { boardId, snapshot } of loaded) {
      results.set(boardId, snapshot);
    }
  }

  return results;
}

/**
 * Clear snapshot cache (useful for testing or memory management)
 */
export function clearSnapshotCache(): void {
  snapshotCache.clear();
}

/**
 * Remove a specific board's snapshot from cache
 */
export function removeCachedSnapshot(boardId: string): void {
  snapshotCache.delete(boardId);
}
