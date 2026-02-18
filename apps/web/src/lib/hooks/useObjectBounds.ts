/**
 * Hook for object bounds calculations
 */

import { useCallback } from 'react';
import type { WhiteboardObject } from '@/types/canvas';
import {
  getObjectBounds as getBoundsUtil,
  getConnectedObjectIds as getConnectedUtil,
  intersectsRect as intersectsRectUtil,
  type Bounds,
} from '@/lib/utils/objectBounds';

/**
 * Hook that provides object bounds calculation functions.
 * Memoizes the functions to prevent unnecessary re-renders.
 */
export function useObjectBounds() {
  /**
   * Calculate the bounding box for an object.
   */
  const getObjectBounds = useCallback(
    (obj: WhiteboardObject, map: Map<string, WhiteboardObject>): Bounds => {
      return getBoundsUtil(obj, map);
    },
    []
  );

  /**
   * Get all object IDs connected to seed IDs through lines and intersections.
   */
  const getConnectedObjectIds = useCallback(
    (seedIds: string[], allObjects: WhiteboardObject[]): string[] => {
      return getConnectedUtil(seedIds, allObjects, getBoundsUtil);
    },
    []
  );

  /**
   * Check if an object's bounds intersect with a rectangle.
   */
  const intersectsRect = useCallback(
    (
      obj: WhiteboardObject,
      rect: { x: number; y: number; width: number; height: number },
      map: Map<string, WhiteboardObject>
    ): boolean => {
      return intersectsRectUtil(obj, rect, map);
    },
    []
  );

  return {
    getObjectBounds,
    getConnectedObjectIds,
    intersectsRect,
  };
}
