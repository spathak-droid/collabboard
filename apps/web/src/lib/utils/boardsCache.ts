/**
 * Boards cache for optimistic dashboard rendering
 * Stores boards in localStorage for instant display while refreshing in background
 */

import type { BoardWithOwner } from '@/lib/supabase/client';

const CACHE_KEY = 'collabboard_boards_cache';
const CACHE_VERSION = 1;

interface CachedData {
  version: number;
  userId: string;
  boards: BoardWithOwner[];
  timestamp: number;
}

/**
 * Get cached boards for a user
 */
export function getCachedBoards(userId: string): BoardWithOwner[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data: CachedData = JSON.parse(cached);
    
    // Validate version and user
    if (data.version !== CACHE_VERSION || data.userId !== userId) {
      return null;
    }

    // Expire after 7 days
    const age = Date.now() - data.timestamp;
    if (age > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data.boards;
  } catch {
    // Invalid cache data
    return null;
  }
}

/**
 * Save boards to cache
 */
export function setCachedBoards(userId: string, boards: BoardWithOwner[]): void {
  try {
    const data: CachedData = {
      version: CACHE_VERSION,
      userId,
      boards,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    // localStorage might be full or disabled - silently fail
    console.warn('Failed to cache boards:', err);
  }
}

/**
 * Clear boards cache
 */
export function clearBoardsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore errors
  }
}
