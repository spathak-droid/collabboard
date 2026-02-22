/**
 * Custom hook for object selection logic
 */

'use client';

import { useCallback } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import type { WhiteboardObject, PathShape } from '@/types/canvas';
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

        if (obj.type === 'text') {
          // TextShape doesn't have width/height, use default size
          return {
            x: obj.x,
            y: obj.y,
            width: 100,
            height: 30,
          };
        }

        if (obj.type === 'path') {
          const path = obj as PathShape;
          const pts = path.points;
          if (pts.length < 4) {
            const w = Math.max(1, (path.strokeWidth ?? 2) * 2);
            return { x: path.x, y: path.y, width: w, height: w };
          }
          let minX = path.x + pts[0];
          let minY = path.y + pts[1];
          let maxX = minX;
          let maxY = minY;
          for (let i = 2; i < pts.length; i += 2) {
            const px = path.x + pts[i];
            const py = path.y + pts[i + 1];
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
          const padding = Math.max(1, (path.strokeWidth ?? 2) / 2);
          return {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
          };
        }
        
        // All other types have width/height
        const objWithDimensions = obj as WhiteboardObject & { width: number; height: number };
        return {
          x: obj.x,
          y: obj.y,
          width: objWithDimensions.width,
          height: objWithDimensions.height,
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
