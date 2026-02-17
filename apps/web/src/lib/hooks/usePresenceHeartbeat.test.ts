/**
 * Test cases for usePresenceHeartbeat hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePresenceHeartbeat } from './usePresenceHeartbeat';

// Mock the heartbeatPresence function
vi.mock('@/lib/supabase/client', () => ({
  heartbeatPresence: vi.fn().mockResolvedValue(undefined),
}));

describe('usePresenceHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when userUid is undefined', async () => {
    const { heartbeatPresence } = await import('@/lib/supabase/client');

    renderHook(() => usePresenceHeartbeat(undefined));

    expect(heartbeatPresence).not.toHaveBeenCalled();
  });

  it('sends heartbeat immediately on mount when userUid is provided', async () => {
    const { heartbeatPresence } = await import('@/lib/supabase/client');

    renderHook(() => usePresenceHeartbeat('user-123'));

    expect(heartbeatPresence).toHaveBeenCalledWith('user-123');
    expect(heartbeatPresence).toHaveBeenCalledTimes(1);
  });

  it('sends heartbeat every 60 seconds', async () => {
    const { heartbeatPresence } = await import('@/lib/supabase/client');

    renderHook(() => usePresenceHeartbeat('user-123'));

    // Initial call
    expect(heartbeatPresence).toHaveBeenCalledTimes(1);

    // Advance 60 seconds
    vi.advanceTimersByTime(60_000);
    expect(heartbeatPresence).toHaveBeenCalledTimes(2);

    // Advance another 60 seconds
    vi.advanceTimersByTime(60_000);
    expect(heartbeatPresence).toHaveBeenCalledTimes(3);
  });

  it('clears interval on unmount', async () => {
    const { heartbeatPresence } = await import('@/lib/supabase/client');

    const { unmount } = renderHook(() => usePresenceHeartbeat('user-123'));

    expect(heartbeatPresence).toHaveBeenCalledTimes(1);

    unmount();

    // Advance time — should NOT trigger more heartbeats
    vi.advanceTimersByTime(120_000);
    expect(heartbeatPresence).toHaveBeenCalledTimes(1);
  });

  it('registers beforeunload event listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => usePresenceHeartbeat('user-123'));

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
  });

  it('removes beforeunload event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => usePresenceHeartbeat('user-123'));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    removeSpy.mockRestore();
  });
});
