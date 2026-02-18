/**
 * Performance Monitor - Real-time FPS and Latency Display
 * 
 * Shows:
 * - Local FPS (rendering performance)
 * - Cursor broadcast rate (how often we send)
 * - Cursor receive rate (how often we get updates)
 * - Network latency (roundtrip time)
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

interface PerformanceMonitorProps {
  awareness: AwarenessLike | null;
  currentUserId: string;
  getBroadcastRate: () => number;
}

interface Stats {
  fps: number;
  broadcastRate: number;
  receiveRate: number;
  latency: number;
  remoteCursors: number;
}

export function PerformanceMonitor({ awareness, currentUserId, getBroadcastRate }: PerformanceMonitorProps) {
  const [stats, setStats] = useState<Stats>({
    fps: 0,
    broadcastRate: 0,
    receiveRate: 0,
    latency: 0,
    remoteCursors: 0,
  });

  const frameCountRef = useRef(0);
  const broadcastCountRef = useRef(0);
  const receiveCountRef = useRef(0);
  const lastAwarenessUpdateRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!awareness) return;

    let frameId: number;
    let lastFrameTime = performance.now();
    let lastStatsUpdate = performance.now();

    // Track FPS
    const measureFPS = (currentTime: number) => {
      frameCountRef.current++;
      frameId = requestAnimationFrame(measureFPS);
    };
    frameId = requestAnimationFrame(measureFPS);

    // Track awareness changes (cursor receives)
    const handleAwarenessChange = () => {
      receiveCountRef.current++;

      // Calculate latency by checking cursor timestamps
      const states = awareness.getStates();
      const now = Date.now();
      let totalLatency = 0;
      let latencyCount = 0;

      states.forEach((state, clientId) => {
        const user = state.user as { id: string } | undefined;
        const cursor = state.cursor as { lastUpdate: number } | undefined;

        if (!user || user.id === currentUserId || !cursor) return;

        const latency = now - cursor.lastUpdate;
        if (latency < 5000) { // Ignore stale cursors
          totalLatency += latency;
          latencyCount++;
        }
      });

      // Update stats every 500ms
      if (now - lastStatsUpdate >= 500) {
        const elapsed = (now - lastStatsUpdate) / 1000;
        
        setStats({
          fps: Math.round(frameCountRef.current / elapsed),
          broadcastRate: getBroadcastRate(),
          receiveRate: Math.round(receiveCountRef.current / elapsed),
          latency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
          remoteCursors: latencyCount,
        });

        frameCountRef.current = 0;
        receiveCountRef.current = 0;
        lastStatsUpdate = now;
      }
    };

    awareness.on('change', handleAwarenessChange);

    return () => {
      awareness.off('change', handleAwarenessChange);
      cancelAnimationFrame(frameId);
    };
  }, [awareness, currentUserId, getBroadcastRate]);

  // Track local cursor broadcasts
  useEffect(() => {
    const interval = setInterval(() => {
      // This is a rough estimate - actual broadcasts happen on mouse move
      // We'll update this with actual broadcast tracking
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed top-4 right-4 bg-black/80 text-white p-4 rounded-lg font-mono text-xs space-y-1 z-50 backdrop-blur-sm">
      <div className="font-bold text-sm mb-2">Performance Monitor</div>
      
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">FPS:</span>
        <span className={stats.fps >= 55 ? 'text-green-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
          {stats.fps}
        </span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Broadcast:</span>
        <span className="text-blue-400">{stats.broadcastRate}/s</span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Receive:</span>
        <span className="text-purple-400">{stats.receiveRate}/s</span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Latency:</span>
        <span className={stats.latency < 50 ? 'text-green-400' : stats.latency < 100 ? 'text-yellow-400' : 'text-red-400'}>
          {stats.latency}ms
        </span>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Cursors:</span>
        <span className="text-cyan-400">{stats.remoteCursors}</span>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-600 text-[10px] text-gray-500">
        <div>✅ Target: &lt;50ms latency</div>
        <div>✅ Target: 60fps</div>
      </div>
    </div>
  );
}
