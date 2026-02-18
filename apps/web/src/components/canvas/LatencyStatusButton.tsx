'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

interface ConnectionStatusLike {
  status: 'connected' | 'connecting' | 'disconnected';
}

interface LatencyStatusButtonProps {
  connectionStatus: ConnectionStatusLike;
  awareness: AwarenessLike | null;
  currentUserId: string;
  getBroadcastRate: () => number;
}

interface Stats {
  latency: number;
  receiveRate: number;
  broadcastRate: number;
  fps: number;
  remoteCursors: number;
}

export function LatencyStatusButton({
  connectionStatus,
  awareness,
  currentUserId,
  getBroadcastRate,
}: LatencyStatusButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({
    latency: 0,
    receiveRate: 0,
    broadcastRate: 0,
    fps: 0,
    remoteCursors: 0,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const receiveCountRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastStatsUpdateRef = useRef(performance.now());

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      frameCountRef.current += 1;
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!awareness) return;

    const updateStats = () => {
      receiveCountRef.current += 1;

      const now = Date.now();
      const states = awareness.getStates();
      let totalLatency = 0;
      let latencyCount = 0;

      states.forEach((state) => {
        const user = state.user as { id: string } | undefined;
        const cursor = state.cursor as { lastUpdate: number } | undefined;
        if (!user || user.id === currentUserId || !cursor) return;
        const delta = now - cursor.lastUpdate;
        if (delta >= 0 && delta < 5000) {
          totalLatency += delta;
          latencyCount += 1;
        }
      });

      const elapsedMs = performance.now() - lastStatsUpdateRef.current;
      if (elapsedMs < 500) return;

      const elapsedSec = elapsedMs / 1000;
      setStats({
        latency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
        receiveRate: Math.round(receiveCountRef.current / elapsedSec),
        broadcastRate: getBroadcastRate(),
        fps: Math.round(frameCountRef.current / elapsedSec),
        remoteCursors: latencyCount,
      });

      receiveCountRef.current = 0;
      frameCountRef.current = 0;
      lastStatsUpdateRef.current = performance.now();
    };

    awareness.on('change', updateStats);
    updateStats();

    return () => awareness.off('change', updateStats);
  }, [awareness, currentUserId, getBroadcastRate]);

  const statusLabel = useMemo(() => {
    if (connectionStatus.status === 'connected') return 'Connected';
    if (connectionStatus.status === 'connecting') return 'Checking...';
    return 'Disconnected';
  }, [connectionStatus.status]);

  const statusClasses =
    connectionStatus.status === 'connected'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : connectionStatus.status === 'connecting'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';

  const dotClasses =
    connectionStatus.status === 'connected'
      ? 'bg-emerald-500'
      : connectionStatus.status === 'connecting'
      ? 'animate-pulse bg-blue-500'
      : 'bg-rose-500';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={`Latency check: ${statusLabel}`}
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border ${statusClasses}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.5 12.5a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
          <path d="M10 10.5l2.6-2.1" strokeLinecap="round" />
          <circle cx="10" cy="13.7" r="1.3" fill="currentColor" stroke="none" />
        </svg>
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white ${dotClasses}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Realtime Diagnostics</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                connectionStatus.status === 'connected'
                  ? 'bg-emerald-100 text-emerald-700'
                  : connectionStatus.status === 'connecting'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-gray-700">
            <div className="flex items-center justify-between">
              <span>Latency</span>
              <span className={stats.latency <= 60 ? 'text-emerald-600 font-semibold' : stats.latency <= 150 ? 'text-amber-600 font-semibold' : 'text-rose-600 font-semibold'}>
                {stats.latency} ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Send rate</span>
              <span className="font-semibold text-blue-700">{stats.broadcastRate}/s</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Receive rate</span>
              <span className="font-semibold text-indigo-700">{stats.receiveRate}/s</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Render FPS</span>
              <span className={stats.fps >= 55 ? 'font-semibold text-emerald-600' : stats.fps >= 30 ? 'font-semibold text-amber-600' : 'font-semibold text-rose-600'}>
                {stats.fps}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Remote cursors</span>
              <span className="font-semibold text-cyan-700">{stats.remoteCursors}</span>
            </div>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-2">
            <div className="truncate text-[10px] text-gray-500">
              WS: {process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
