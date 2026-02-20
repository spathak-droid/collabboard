/**
 * Multiplayer Cursors Component
 *
 * Zero-latency cursor tracking with dedicated WebSocket support:
 * - Direct cursor sync via custom WebSocket (<10ms latency)
 * - Fallback to Yjs awareness if cursor sync not available
 * - Direct DOM manipulation (no React re-renders)
 * - GPU-accelerated transforms
 * - Immediate visual feedback
 */

'use client';

import { useEffect, useRef, memo, useState } from 'react';
import type { CursorPosition } from '@/lib/websocket/cursor-sync';

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

interface CursorsProps {
  awareness: AwarenessLike | null;
  currentUserId: string;
  scale: number;
  position: { x: number; y: number };
  cursors?: React.MutableRefObject<Map<string, CursorPosition>>; // Ref to cursor map (stable)
  useFastCursors?: boolean; // If true, use custom cursor sync instead of awareness
}

interface CursorUser {
  id: string;
  name: string;
  color: string;
}

interface CursorData {
  x: number;
  y: number;
  lastUpdate: number;
}

const IDLE_TIMEOUT = 5000;

// Generate consistent color for user
function getUserColor(userId: string): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  ];
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export const Cursors = memo(function Cursors({ 
  awareness, 
  currentUserId, 
  scale, 
  position,
  cursors: fastCursors,
  useFastCursors = true,
}: CursorsProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const positionRef = useRef(position);

  // Only render on client to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  scaleRef.current = scale;
  positionRef.current = position;

  // Effect for fast cursor sync (dedicated WebSocket)
  useEffect(() => {
    if (!useFastCursors || !fastCursors || !containerRef.current) return;

    const container = containerRef.current;
    const cursorElements = new Map<string, HTMLDivElement>();

    const createCursorEl = (userId: string, userName: string): HTMLDivElement => {
      const color = getUserColor(userId);
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.transition = 'opacity 150ms ease';
      el.style.willChange = 'transform';
      el.style.zIndex = '20';
      el.style.transform = 'translate3d(0, 0, 0)';
      el.style.backfaceVisibility = 'hidden';

      el.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.65376 12.3673L13.5778 20.2913L17.0818 13.2833L23.9998 11.2173L5.65376 12.3673Z"
            fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <div style="position:absolute;top:24px;left:8px;padding:2px 8px;border-radius:4px;color:white;font-size:11px;font-weight:500;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);background:${color}">
          ${userName}
        </div>
      `;

      container.appendChild(el);
      return el;
    };

    const updateAllFastCursors = () => {
      const now = Date.now();
      const s = scaleRef.current;
      const p = positionRef.current;
      const activeUserIds = new Set<string>();

      // Read from ref.current (the Map)
      fastCursors.current.forEach((cursor) => {
        if (cursor.userId === currentUserId) return;

        activeUserIds.add(cursor.userId);

        let el = cursorElements.get(cursor.userId);
        if (!el) {
          el = createCursorEl(cursor.userId, cursor.userName);
          cursorElements.set(cursor.userId, el);
        }

        const idle = now - cursor.timestamp;
        if (idle > IDLE_TIMEOUT) {
          el.style.opacity = '0';
          return;
        }

        // Calculate screen position and apply INSTANTLY
        const screenX = cursor.x * s + p.x;
        const screenY = cursor.y * s + p.y;

        el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
        el.style.opacity = '1';
      });

      // Remove cursors for users who left
      cursorElements.forEach((el, userId) => {
        if (!activeUserIds.has(userId)) {
          el.remove();
          cursorElements.delete(userId);
        }
      });
    };

    // Poll for updates at 8ms intervals (~120fps)
    const interval = setInterval(updateAllFastCursors, 8);

    return () => {
      clearInterval(interval);
      cursorElements.forEach((el) => el.remove());
      cursorElements.clear();
    };
  }, [useFastCursors, fastCursors, currentUserId]);

  // Effect for Yjs awareness fallback
  useEffect(() => {
    if (useFastCursors || !awareness || !containerRef.current) return;

    const container = containerRef.current;
    const cursorElements = new Map<string, HTMLDivElement>();

    const createCursorEl = (user: CursorUser): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.transition = 'opacity 150ms ease';
      el.style.willChange = 'transform';
      el.style.zIndex = '20';
      // GPU acceleration for instant transforms
      el.style.transform = 'translate3d(0, 0, 0)';
      el.style.backfaceVisibility = 'hidden';

      el.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.65376 12.3673L13.5778 20.2913L17.0818 13.2833L23.9998 11.2173L5.65376 12.3673Z"
            fill="${user.color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <div style="position:absolute;top:24px;left:8px;padding:2px 8px;border-radius:4px;color:white;font-size:11px;font-weight:500;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);background:${user.color}">
          ${user.name}
        </div>
      `;

      container.appendChild(el);
      return el;
    };

    const updateAllCursors = () => {
      const now = Date.now();
      const s = scaleRef.current;
      const p = positionRef.current;
      const states = awareness.getStates();
      const activeUserIds = new Set<string>();

      states.forEach((state) => {
        const user = state.user as CursorUser | undefined;
        const cursor = state.cursor as CursorData | undefined;

        if (!user || user.id === currentUserId || !cursor) return;

        activeUserIds.add(user.id);

        let el = cursorElements.get(user.id);
        if (!el) {
          el = createCursorEl(user);
          cursorElements.set(user.id, el);
        }

        const idle = now - cursor.lastUpdate;
        if (idle > IDLE_TIMEOUT) {
          el.style.opacity = '0';
          return;
        }

        // Calculate screen position and apply INSTANTLY (no interpolation)
        const screenX = cursor.x * s + p.x;
        const screenY = cursor.y * s + p.y;

        // Direct transform - no delay, no smoothing
        el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
        el.style.opacity = '1';
      });

      // Remove cursors for users who left
      cursorElements.forEach((el, userId) => {
        if (!activeUserIds.has(userId)) {
          el.remove();
          cursorElements.delete(userId);
        }
      });
    };

    // Listen for awareness changes - immediate response
    const handleAwarenessChange = () => {
      updateAllCursors();
    };

    awareness.on('change', handleAwarenessChange);

    // Initial render
    updateAllCursors();

    return () => {
      awareness.off('change', handleAwarenessChange);
      cursorElements.forEach((el) => el.remove());
      cursorElements.clear();
    };
  }, [useFastCursors, awareness, currentUserId]);

  // Don't render container until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 20 }}
    />
  );
});
