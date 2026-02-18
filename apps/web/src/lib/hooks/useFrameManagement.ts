/**
 * Hook for frame management — containment checks, warnings, etc.
 */

import { useCallback, useRef, useState } from 'react';
import type { WhiteboardObject, Frame as FrameType } from '@/types/canvas';
import { findContainingFrame, isObjectWithinFrame } from '@/lib/utils/frameUtils';
import { useObjectBounds } from './useObjectBounds';

/**
 * Hook that provides frame management functions.
 */
export function useFrameManagement(objects: WhiteboardObject[]) {
  const { getObjectBounds } = useObjectBounds();
  const [frameWarningVisible, setFrameWarningVisible] = useState(false);
  const frameWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Show frame boundary warning for 3 seconds.
   */
  const showFrameWarning = useCallback(() => {
    setFrameWarningVisible(true);
    if (frameWarningTimeoutRef.current) {
      clearTimeout(frameWarningTimeoutRef.current);
    }
    frameWarningTimeoutRef.current = setTimeout(() => {
      setFrameWarningVisible(false);
    }, 3000);
  }, []);

  /**
   * Find which frame contains an object (if any).
   */
  const findContainingFrameForObject = useCallback(
    (objectId: string): FrameType | null => {
      return findContainingFrame(objectId, objects);
    },
    [objects]
  );

  /**
   * Check if object bounds are within frame bounds.
   * Optionally test with different position/points for drag preview.
   */
  const checkObjectWithinFrame = useCallback(
    (
      obj: WhiteboardObject,
      frame: FrameType,
      objX?: number,
      objY?: number,
      objPoints?: number[]
    ): boolean => {
      return isObjectWithinFrame(obj, frame, objects, objX, objY, objPoints);
    },
    [objects]
  );

  return {
    frameWarningVisible,
    showFrameWarning,
    findContainingFrame: findContainingFrameForObject,
    isObjectWithinFrame: checkObjectWithinFrame,
  };
}
