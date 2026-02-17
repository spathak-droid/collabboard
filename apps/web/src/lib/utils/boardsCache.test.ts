/**
 * Test cases for boards cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedBoards, setCachedBoards, clearBoardsCache } from './boardsCache';
import type { BoardWithOwner } from '@/lib/supabase/client';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const mockBoards: BoardWithOwner[] = [
  {
    id: 'board-1',
    title: 'Test Board',
    owner_uid: 'user-1',
    owner_name: 'Test User',
    owner_email: 'test@example.com',
    created_at: new Date().toISOString(),
    last_modified: new Date().toISOString(),
  },
];

describe('boardsCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns null when no cache exists', () => {
    expect(getCachedBoards('user-1')).toBeNull();
  });

  it('caches and retrieves boards', () => {
    setCachedBoards('user-1', mockBoards);
    const cached = getCachedBoards('user-1');
    
    expect(cached).toBeTruthy();
    expect(cached).toHaveLength(1);
    expect(cached![0].id).toBe('board-1');
  });

  it('returns null for different user', () => {
    setCachedBoards('user-1', mockBoards);
    expect(getCachedBoards('user-2')).toBeNull();
  });

  it('clears cache', () => {
    setCachedBoards('user-1', mockBoards);
    clearBoardsCache();
    expect(getCachedBoards('user-1')).toBeNull();
  });

  it('expires cache after 7 days', () => {
    // Mock Date.now to return a time 8 days ago
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValueOnce(eightDaysAgo);
    
    setCachedBoards('user-1', mockBoards);
    
    // Restore real Date.now
    vi.restoreAllMocks();
    
    // Should return null (expired)
    expect(getCachedBoards('user-1')).toBeNull();
  });

  it('handles invalid cache data gracefully', () => {
    localStorageMock.setItem('collabboard_boards_cache', 'invalid json');
    expect(getCachedBoards('user-1')).toBeNull();
  });

  it('handles localStorage errors gracefully', () => {
    // Mock localStorage to throw
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage full');
    });

    // Should not throw
    expect(() => setCachedBoards('user-1', mockBoards)).not.toThrow();
    
    vi.restoreAllMocks();
  });
});
