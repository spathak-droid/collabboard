/**
 * usePresenceHeartbeat — sends a heartbeat to user_presence every 60s
 * while the user is logged in. Clears presence only on tab close.
 * Sign-out cleanup is handled separately in auth.ts.
 */

import { useEffect, useRef } from 'react';
import { heartbeatPresence } from '@/lib/supabase/client';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

export const usePresenceHeartbeat = (userUid: string | undefined) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uidRef = useRef(userUid);
  uidRef.current = userUid;

  useEffect(() => {
    if (!userUid) return;

    // Send immediately on mount
    heartbeatPresence(userUid);

    // Then every 60s
    intervalRef.current = setInterval(() => {
      heartbeatPresence(userUid);
    }, HEARTBEAT_INTERVAL_MS);

    // Clear presence when tab/window is actually closed (not navigation)
    const handleBeforeUnload = () => {
      if (uidRef.current) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_presence?user_uid=eq.${uidRef.current}`;
        const headers = {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
          Prefer: 'return=minimal',
        };
        fetch(url, { method: 'DELETE', headers, keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Do NOT clear presence on unmount — page navigation triggers unmount
      // but the user is still logged in. Sign-out is handled in auth.ts.
    };
  }, [userUid]);
};
