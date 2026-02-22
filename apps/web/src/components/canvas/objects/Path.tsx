/**
 * Freehand Path (draw) component - renders a path from points.
 */

'use client';

import { memo } from 'react';
import { Line } from 'react-konva';
import type Konva from 'konva';
import type { PathShape } from '@/types/canvas';

interface PathProps {
  data: PathShape;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<PathShape>) => void;
  onDragMove?: (x: number, y: number) => void;
  isDraggable?: boolean;
}

function PathComponent({ data, isSelected, onSelect, onUpdate, onDragMove, isDraggable = true }: PathProps) {
  const points = data.points.length >= 4 ? data.points : [0, 0, 1, 1];

  return (
    <Line
      x={data.x}
      y={data.y}
      points={points}
      stroke={data.stroke}
      strokeWidth={data.strokeWidth}
      lineCap="round"
      lineJoin="round"
      listening={true}
      hitStrokeWidth={Math.max(16, data.strokeWidth * 2)}
      onClick={onSelect}
      onTap={onSelect}
      draggable={isDraggable}
      onDragMove={
        onDragMove
          ? (e) => {
              const pos = e.target.position();
              onDragMove(pos.x, pos.y);
            }
          : undefined
      }
      onDragEnd={
        isDraggable
          ? (e) => {
              const pos = e.target.position();
              onUpdate({ x: pos.x, y: pos.y });
            }
          : undefined
      }
    />
  );
}

export const Path = memo(PathComponent);
