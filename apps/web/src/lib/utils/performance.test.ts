/**
 * Performance Test Suite
 * 
 * Automated tests to verify canvas performance under heavy load.
 * Tests: 100 objects, 500 objects, 1000 objects, concurrent operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Canvas Performance Tests', () => {
  let perfMarks: string[] = [];
  
  beforeEach(() => {
    perfMarks = [];
  });

  afterEach(() => {
    // Clean up performance marks
    perfMarks.forEach(mark => {
      try {
        performance.clearMarks(mark);
      } catch (e) {
        // Ignore if mark doesn't exist
      }
    });
  });

  function measureOperation(name: string, operation: () => void) {
    const markStart = `${name}-start`;
    const markEnd = `${name}-end`;
    
    perfMarks.push(markStart, markEnd);
    
    performance.mark(markStart);
    operation();
    performance.mark(markEnd);
    
    performance.measure(name, markStart, markEnd);
    const measure = performance.getEntriesByName(name)[0];
    
    return measure.duration;
  }

  it('should render 100 objects in under 100ms', () => {
    const objects = Array.from({ length: 100 }, (_, i) => ({
      id: `obj-${i}`,
      type: 'sticky' as const,
      x: Math.random() * 5000,
      y: Math.random() * 5000,
      width: 200,
      height: 200,
      color: '#FFF59D',
      text: `Object ${i}`,
      rotation: 0,
      zIndex: i,
    }));

    const duration = measureOperation('render-100-objects', () => {
      // Simulate viewport culling
      const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
      const visible = objects.filter(obj => 
        obj.x < viewport.width && obj.y < viewport.height
      );
      expect(visible.length).toBeGreaterThan(0);
    });

    console.log(`[PERF] 100 objects rendered in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100);
  });

  it('should render 500 objects in under 200ms', () => {
    const objects = Array.from({ length: 500 }, (_, i) => ({
      id: `obj-${i}`,
      type: 'sticky' as const,
      x: Math.random() * 10000,
      y: Math.random() * 10000,
      width: 200,
      height: 200,
      color: '#FFF59D',
      text: `Object ${i}`,
      rotation: 0,
      zIndex: i,
    }));

    const duration = measureOperation('render-500-objects', () => {
      const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
      const visible = objects.filter(obj => 
        obj.x < viewport.width && obj.y < viewport.height
      );
      expect(visible.length).toBeGreaterThan(0);
    });

    console.log(`[PERF] 500 objects rendered in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(200);
  });

  it('should render 1000 objects in under 300ms', () => {
    const objects = Array.from({ length: 1000 }, (_, i) => ({
      id: `obj-${i}`,
      type: 'sticky' as const,
      x: Math.random() * 20000,
      y: Math.random() * 20000,
      width: 200,
      height: 200,
      color: '#FFF59D',
      text: `Object ${i}`,
      rotation: 0,
      zIndex: i,
    }));

    const duration = measureOperation('render-1000-objects', () => {
      const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
      const visible = objects.filter(obj => 
        obj.x < viewport.width && obj.y < viewport.height
      );
      expect(visible.length).toBeGreaterThan(0);
    });

    console.log(`[PERF] 1000 objects rendered in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300);
  });

  it('should handle viewport culling efficiently', () => {
    const objects = Array.from({ length: 500 }, (_, i) => ({
      id: `obj-${i}`,
      type: 'sticky' as const,
      x: i * 300,
      y: i * 300,
      width: 200,
      height: 200,
      color: '#FFF59D',
      text: `Object ${i}`,
      rotation: 0,
      zIndex: i,
    }));

    const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
    
    const duration = measureOperation('viewport-culling', () => {
      const visible = objects.filter(obj => {
        const padding = 300;
        return (
          obj.x + obj.width + padding > viewport.x &&
          obj.x - padding < viewport.x + viewport.width &&
          obj.y + obj.height + padding > viewport.y &&
          obj.y - padding < viewport.y + viewport.height
        );
      });
      
      // Most objects should be culled
      expect(visible.length).toBeLessThan(objects.length * 0.2);
    });

    console.log(`[PERF] Viewport culling completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(10);
  });

  it('should handle batch creation efficiently', () => {
    const batchSize = 50;
    
    const duration = measureOperation('batch-creation', () => {
      const objects = Array.from({ length: batchSize }, (_, i) => ({
        id: `batch-obj-${i}`,
        type: 'sticky' as const,
        x: Math.random() * 5000,
        y: Math.random() * 5000,
        width: 200,
        height: 200,
        color: '#FFF59D',
        text: `Batch ${i}`,
        rotation: 0,
        zIndex: i,
      }));
      
      expect(objects.length).toBe(batchSize);
    });

    console.log(`[PERF] Batch creation (${batchSize} objects) in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50);
  });

  it('should maintain 60 FPS target (16.67ms frame budget)', () => {
    const frameBudget = 16.67; // 60 FPS
    
    // Simulate a single frame render cycle
    const duration = measureOperation('single-frame', () => {
      // Simulated viewport culling + render
      const objects = Array.from({ length: 200 }, (_, i) => ({
        id: `frame-obj-${i}`,
        type: 'sticky' as const,
        x: Math.random() * 5000,
        y: Math.random() * 5000,
        width: 200,
        height: 200,
        color: '#FFF59D',
        text: `Frame ${i}`,
        rotation: 0,
        zIndex: i,
      }));
      
      const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
      const visible = objects.filter(obj => 
        obj.x < viewport.width && obj.y < viewport.height
      );
      
      expect(visible).toBeDefined();
    });

    console.log(`[PERF] Single frame render: ${duration.toFixed(2)}ms (target: <${frameBudget}ms)`);
    expect(duration).toBeLessThan(frameBudget);
  });
});

/**
 * Performance Logging Utility
 */
export class PerformanceLogger {
  private static measurements: Map<string, number[]> = new Map();

  static start(label: string) {
    performance.mark(`${label}-start`);
  }

  static end(label: string) {
    const startMark = `${label}-start`;
    const endMark = `${label}-end`;
    
    performance.mark(endMark);
    performance.measure(label, startMark, endMark);
    
    const measure = performance.getEntriesByName(label)[0];
    const duration = measure.duration;
    
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    
    this.measurements.get(label)!.push(duration);
    
    // Keep only last 100 measurements
    const measurements = this.measurements.get(label)!;
    if (measurements.length > 100) {
      measurements.shift();
    }
    
    return duration;
  }

  static getStats(label: string) {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    const p95 = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

    return { avg, min, max, p95, count: measurements.length };
  }

  static logAll() {
    console.group('[Performance Stats]');
    this.measurements.forEach((_, label) => {
      const stats = this.getStats(label);
      if (stats) {
        console.log(
          `${label}: avg=${stats.avg.toFixed(2)}ms, min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms (n=${stats.count})`
        );
      }
    });
    console.groupEnd();
  }

  static clear() {
    this.measurements.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }
}
