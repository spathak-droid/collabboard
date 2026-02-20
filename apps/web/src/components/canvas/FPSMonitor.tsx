/**
 * Real-time FPS Monitor Component
 * 
 * Shows live FPS, object count, and performance metrics.
 * CRITICAL for debugging performance issues.
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface FPSMonitorProps {
  visibleObjects: number;
  totalObjects: number;
  enabled?: boolean;
}

export function FPSMonitor({
  visibleObjects,
  totalObjects,
  enabled = false,
}: FPSMonitorProps) {
  const [fps, setFps] = useState(60);
  const [avgFps, setAvgFps] = useState(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let rafId: number;
    
    const measureFrame = () => {
      frameCountRef.current++;
      
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);
        
        // Track history for average
        fpsHistoryRef.current.push(currentFps);
        if (fpsHistoryRef.current.length > 10) {
          fpsHistoryRef.current.shift();
        }
        
        const avg = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length
        );
        setAvgFps(avg);

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      rafId = requestAnimationFrame(measureFrame);
    };

    rafId = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  if (!enabled) return null;

  const getFpsColor = () => {
    if (fps >= 55) return 'text-green-500';
    if (fps >= 30) return 'text-yellow-500';
    return 'text-red-500';
  };

  const cullingRatio = totalObjects > 0 
    ? Math.round(((totalObjects - visibleObjects) / totalObjects) * 100)
    : 0;

  return (
    <div className="fixed top-20 right-4 bg-black/80 backdrop-blur-sm rounded-lg shadow-2xl p-4 text-xs z-50 font-mono min-w-[200px]">
      <div className="text-white font-bold mb-2 flex items-center gap-2">
        <span className="text-green-400">⚡</span> Performance Monitor
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-400">FPS:</span>
          <span className={`font-bold ${getFpsColor()}`}>{fps}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">Avg FPS:</span>
          <span className="text-white font-bold">{avgFps}</span>
        </div>
        
        <div className="h-px bg-gray-700 my-2" />
        
        <div className="flex justify-between">
          <span className="text-gray-400">Rendered:</span>
          <span className="text-cyan-400 font-bold">{visibleObjects}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-400">Total:</span>
          <span className="text-white">{totalObjects}</span>
        </div>
        
        {cullingRatio > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Culled:</span>
            <span className="text-purple-400 font-bold">{cullingRatio}%</span>
          </div>
        )}
        
        <div className="h-px bg-gray-700 my-2" />
        
        <div className="text-gray-500 text-[10px]">
          {fps >= 55 && '✅ Excellent'}
          {fps >= 30 && fps < 55 && '⚠️ Degraded'}
          {fps < 30 && '❌ Poor'}
        </div>
      </div>
    </div>
  );
}
