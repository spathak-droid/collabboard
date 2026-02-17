/**
 * Custom hook for object selection logic
 */

'use client';

import { useCallback } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import type { WhiteboardObject } from '@/types/canvas';
import { doRectsIntersect } from '@/lib/utils/geometry';

export const useSelection = () => {
  const {
    selectedIds,
    setSelected,
    toggleSelected,
    clearSelection,
    selectionRect,
    setSelectionRect,
  } = useCanvasStore();
  
  const selectObject = useCallback((id: string, multiSelect: boolean = false) => {
    if (multiSelect) {
      toggleSelected(id);
    } else {
      setSelected([id]);
    }
  }, [toggleSelected, setSelected]);
  
  const selectMultiple = useCallback((ids: string[]) => {
    setSelected(ids);
  }, [setSelected]);
  
  const deselectAll = useCallback(() => {
    clearSelection();
  }, [clearSelection]);
  
  const isSelected = useCallback((id: string) => {
    return selectedIds.includes(id);
  }, [selectedIds]);
  
  const selectByRect = useCallback(
    (objects: WhiteboardObject[], rect: { x: number; y: number; width: number; height: number }) => {
      const getObjectBounds = (obj: WhiteboardObject) => {
        if (obj.type === 'circle') {
          return {
            x: obj.x - obj.radius,
            y: obj.y - obj.radius,
            width: obj.radius * 2,
            height: obj.radius * 2,
          };
        }

        if (obj.type === 'line') {
          const [x1, y1, x2, y2] = obj.points;
          return {
            x: obj.x + Math.min(x1, x2),
            y: obj.y + Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
          };
        }

        return {
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        };
      };

      const selectedObjects = objects.filter((obj) => {
        return doRectsIntersect(rect, getObjectBounds(obj));
      });
      
      setSelected(selectedObjects.map((obj) => obj.id));
    },
    [setSelected]
  );
  
  return {
    selectedIds,
    selectObject,
    selectMultiple,
    deselectAll,
    isSelected,
    selectByRect,
    selectionRect,
    setSelectionRect,
  };
};
