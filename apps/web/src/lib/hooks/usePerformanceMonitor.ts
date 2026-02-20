/**
 * Performance Monitoring Hook
 * 
 * Tracks FPS, render count, and visible objects for performance debugging
 */

import { useEffect, useRef, useState } from 'react';

export interface PerformanceMetrics {
  fps: number;
  renderCount: number;
  visibleObjects: number;
  totalObjects: number;
  cullingRatio: number; // Percentage of objects culled
}

export function usePerformanceMonitor(
  visibleObjectsCount: number,
  totalObjectsCount: number,
  enabled = false
): PerformanceMetrics {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    renderCount: 0,
    visibleObjects: 0,
    totalObjects: 0,
    cullingRatio: 0,
  });

  const renderCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    renderCountRef.current++;

    // Calculate FPS every second
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    frameCountRef.current++;

    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      const cullingRatio =
        totalObjectsCount > 0
          ? Math.round(
              ((totalObjectsCount - visibleObjectsCount) / totalObjectsCount) * 100
            )
          : 0;

      setMetrics({
        fps,
        renderCount: renderCountRef.current,
        visibleObjects: visibleObjectsCount,
        totalObjects: totalObjectsCount,
        cullingRatio,
      });

      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }
  });

  return metrics;
}
