/**
 * Multiplayer Cursors Component
 *
 * Subscribes directly to the Yjs awareness protocol and updates cursor
 * positions via direct DOM manipulation. This completely bypasses React's
 * render cycle for cursor movement, keeping everything at 60fps.
 *
 * The parent component only needs to pass the awareness instance once —
 * cursor updates never cause parent re-renders.
 */

'use client';

import { useEffect, useRef, memo } from 'react';

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

export const Cursors = memo(function Cursors({ awareness, currentUserId, scale, position }: CursorsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const positionRef = useRef(position);

  scaleRef.current = scale;
  positionRef.current = position;

  useEffect(() => {
    if (!awareness || !containerRef.current) return;

    const container = containerRef.current;
    const cursorElements = new Map<string, HTMLDivElement>();

    const createCursorEl = (user: CursorUser): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.transition = 'transform 100ms linear, opacity 200ms ease';
      el.style.willChange = 'transform';
      el.style.zIndex = '20';

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

        const x = cursor.x * s + p.x;
        const y = cursor.y * s + p.y;

        el.style.opacity = '1';
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });

      // Remove cursors for users who left
      cursorElements.forEach((el, userId) => {
        if (!activeUserIds.has(userId)) {
          el.remove();
          cursorElements.delete(userId);
        }
      });
    };

    // Listen for awareness changes and update immediately
    awareness.on('change', updateAllCursors);

    // Also run a periodic update for scale/position changes and idle timeout
    const intervalId = setInterval(updateAllCursors, 100);

    // Initial render
    updateAllCursors();

    return () => {
      awareness.off('change', updateAllCursors);
      clearInterval(intervalId);
      cursorElements.forEach((el) => el.remove());
      cursorElements.clear();
    };
  }, [awareness, currentUserId]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 20 }}
    />
  );
});
