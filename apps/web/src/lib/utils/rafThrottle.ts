/**
 * RAF (RequestAnimationFrame) Throttling Utilities
 * 
 * Prevents update storms during pan/zoom by throttling updates to 60 FPS max.
 * This is CRITICAL for smooth performance with many objects.
 */

/**
 * Throttle a function using RAF
 * Ensures the function runs at most once per frame (60 FPS)
 */
export function rafThrottle<T extends (...args: any[]) => void>(
  callback: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs) {
          callback(...lastArgs);
        }
        rafId = null;
        lastArgs = null;
      });
    }
  };
}

/**
 * Cancel a RAF-throttled function
 */
export function cancelRafThrottle(throttledFn: any) {
  // Access the internal rafId if stored
  if (typeof throttledFn._rafId === 'number') {
    cancelAnimationFrame(throttledFn._rafId);
    throttledFn._rafId = null;
  }
}

/**
 * Debounce with RAF
 * Waits for animation frame + additional delay
 */
export function rafDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 16 // ~1 frame
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        callback(...args);
        rafId = null;
        timeoutId = null;
      }, delay);
    });
  };
}
