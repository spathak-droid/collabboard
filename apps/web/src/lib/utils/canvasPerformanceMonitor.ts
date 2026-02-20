/**
 * Performance Monitoring Utility for Canvas
 * 
 * Console logger for tracking render cycles, re-renders, and performance bottlenecks.
 */

export class CanvasPerformanceMonitor {
  private static renderCounts = new Map<string, number>();
  private static lastLogTime = Date.now();
  private static enabled = false;

  static enable() {
    this.enabled = true;
  }

  static disable() {
    this.enabled = false;
  }

  static logRender(componentName: string) {
    if (!this.enabled) return;

    const count = (this.renderCounts.get(componentName) || 0) + 1;
    this.renderCounts.set(componentName, count);

    // Log every 5 seconds
    const now = Date.now();
    if (now - this.lastLogTime > 5000) {
      this.printStats();
      this.lastLogTime = now;
    }
  }

  static printStats() {
    if (!this.enabled || this.renderCounts.size === 0) return;

    const sorted = Array.from(this.renderCounts.entries()).sort((a, b) => b[1] - a[1]);
    
    for (const [component, count] of sorted) {
      // Performance stats logged (disabled)
    }
    
    this.renderCounts.clear();
  }

  static reset() {
    this.renderCounts.clear();
    this.lastLogTime = Date.now();
  }
}

// Enable with: CanvasPerformanceMonitor.enable()
// (window as any).CanvasPerformanceMonitor = CanvasPerformanceMonitor;
