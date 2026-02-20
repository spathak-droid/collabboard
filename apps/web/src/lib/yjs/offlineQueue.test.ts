/**
 * Tests for IndexedDB offline queue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import {
  saveOfflineUpdate,
  getPendingUpdates,
  markUpdatesSynced,
  clearSyncedUpdates,
  getPendingUpdateCount,
  clearAllUpdates,
  hasPendingUpdatesOnStartup,
} from './offlineQueue';

describe('OfflineQueue', () => {
  const testBoardId = 'test-board-123';

  beforeEach(async () => {
    // Clean up before each test
    await clearAllUpdates(testBoardId);
  });

  it('should save and retrieve offline updates', async () => {
    // Create a Yjs update
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    ymap.set('obj1', { id: 'obj1', type: 'sticky', x: 100, y: 100 });
    const update = Y.encodeStateAsUpdate(ydoc);

    // Save offline update
    await saveOfflineUpdate(testBoardId, update);

    // Retrieve updates
    const updates = await getPendingUpdates(testBoardId);
    expect(updates).toHaveLength(1);
    expect(updates[0].boardId).toBe(testBoardId);
    expect(updates[0].synced).toBe(false);
  });

  it('should maintain operation order by timestamp', async () => {
    // Create multiple updates with delays
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');

    ymap.set('obj1', { id: 'obj1', x: 100 });
    const update1 = Y.encodeStateAsUpdate(ydoc);
    await saveOfflineUpdate(testBoardId, update1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    ymap.set('obj2', { id: 'obj2', x: 200 });
    const update2 = Y.encodeStateAsUpdate(ydoc);
    await saveOfflineUpdate(testBoardId, update2);

    // Retrieve and check order
    const updates = await getPendingUpdates(testBoardId);
    expect(updates).toHaveLength(2);
    expect(updates[0].timestamp).toBeLessThan(updates[1].timestamp);
  });

  it('should mark updates as synced', async () => {
    // Create update
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    ymap.set('obj1', { id: 'obj1' });
    const update = Y.encodeStateAsUpdate(ydoc);
    await saveOfflineUpdate(testBoardId, update);

    // Mark as synced
    await markUpdatesSynced(testBoardId);

    // Verify synced flag
    const updates = await getPendingUpdates(testBoardId);
    expect(updates[0].synced).toBe(true);
  });

  it('should clear synced updates', async () => {
    // Create and sync updates
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    ymap.set('obj1', { id: 'obj1' });
    const update = Y.encodeStateAsUpdate(ydoc);
    await saveOfflineUpdate(testBoardId, update);
    await markUpdatesSynced(testBoardId);

    // Clear synced
    await clearSyncedUpdates(testBoardId);

    // Verify cleared
    const updates = await getPendingUpdates(testBoardId);
    expect(updates).toHaveLength(0);
  });

  it('should count pending updates correctly', async () => {
    // Create multiple updates
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    
    ymap.set('obj1', { id: 'obj1' });
    await saveOfflineUpdate(testBoardId, Y.encodeStateAsUpdate(ydoc));
    
    ymap.set('obj2', { id: 'obj2' });
    await saveOfflineUpdate(testBoardId, Y.encodeStateAsUpdate(ydoc));
    
    ymap.set('obj3', { id: 'obj3' });
    await saveOfflineUpdate(testBoardId, Y.encodeStateAsUpdate(ydoc));

    const count = await getPendingUpdateCount(testBoardId);
    expect(count).toBe(3);

    // Mark one as synced
    await markUpdatesSynced(testBoardId);
    const countAfterSync = await getPendingUpdateCount(testBoardId);
    expect(countAfterSync).toBe(0); // All marked as synced
  });

  it('should detect pending updates on startup', async () => {
    // Create updates
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    ymap.set('obj1', { id: 'obj1' });
    await saveOfflineUpdate(testBoardId, Y.encodeStateAsUpdate(ydoc));

    const hasPending = await hasPendingUpdatesOnStartup(testBoardId);
    expect(hasPending).toBe(true);
  });

  it('should handle multiple boards independently', async () => {
    const board1 = 'board-1';
    const board2 = 'board-2';

    // Create updates for both boards
    const ydoc1 = new Y.Doc();
    ydoc1.getMap('objects').set('obj1', { id: 'obj1' });
    await saveOfflineUpdate(board1, Y.encodeStateAsUpdate(ydoc1));

    const ydoc2 = new Y.Doc();
    ydoc2.getMap('objects').set('obj2', { id: 'obj2' });
    await saveOfflineUpdate(board2, Y.encodeStateAsUpdate(ydoc2));

    // Verify isolation
    const updates1 = await getPendingUpdates(board1);
    const updates2 = await getPendingUpdates(board2);
    
    expect(updates1).toHaveLength(1);
    expect(updates2).toHaveLength(1);
    expect(updates1[0].boardId).toBe(board1);
    expect(updates2[0].boardId).toBe(board2);

    // Cleanup
    await clearAllUpdates(board1);
    await clearAllUpdates(board2);
  });

  it('should survive simulated page refresh', async () => {
    // Simulate: Create updates, "refresh" (close/reopen DB), verify persistence
    const ydoc = new Y.Doc();
    const ymap = ydoc.getMap('objects');
    ymap.set('obj1', { id: 'obj1' });
    await saveOfflineUpdate(testBoardId, Y.encodeStateAsUpdate(ydoc));

    // "Page refresh" - just query again (IndexedDB persists)
    const updates = await getPendingUpdates(testBoardId);
    expect(updates).toHaveLength(1);
    expect(updates[0].boardId).toBe(testBoardId);
  });
});
