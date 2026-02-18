/**
 * SelectionArea Component - Draggable selection rectangle
 * Allows dragging the selection area to move all selected objects together
 */

'use client';

import { useRef, useEffect } from 'react';
import { Group, Rect } from 'react-konva';
import type Konva from 'konva';
import type { WhiteboardObject, LineShape } from '@/types/canvas';

interface SelectionAreaProps {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  selectedObjects: WhiteboardObject[];
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: () => void;
}

export const SelectionArea = ({
  x,
  y,
  width,
  height,
  scale,
  selectedObjects,
  onDragMove,
  onDragEnd,
}: SelectionAreaProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Store initial positions when drag starts
  const handleDragStart = () => {
    const node = groupRef.current;
    if (!node) return;

    dragStartPos.current = { x: node.x(), y: node.y() };
    window.dispatchEvent(new Event('object-drag-start'));
  };

  const handleDragMove = () => {
    const node = groupRef.current;
    if (!node || !dragStartPos.current) return;

    const currentX = node.x();
    const currentY = node.y();
    // Always calculate delta from the initial drag start position
    const dx = currentX - dragStartPos.current.x;
    const dy = currentY - dragStartPos.current.y;

    if (dx !== 0 || dy !== 0) {
      onDragMove(dx, dy);
    }
  };

  const handleDragEnd = () => {
    dragStartPos.current = null;
    window.dispatchEvent(new Event('object-drag-end'));
    onDragEnd();
  };

  // Reset position when selection area changes (but not during drag)
  useEffect(() => {
    const node = groupRef.current;
    if (node && !dragStartPos.current) {
      // Only update if position actually changed to avoid unnecessary updates
      const currentX = node.x();
      const currentY = node.y();
      if (Math.abs(currentX - x) > 0.1 || Math.abs(currentY - y) > 0.1) {
        node.x(x);
        node.y(y);
        // Update drag start position if we're resetting
        if (dragStartPos.current) {
          dragStartPos.current = { x, y };
        }
      }
    }
  }, [x, y]);

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable={true}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(59, 130, 246, 0.15)"
        stroke="#3b82f6"
        strokeWidth={2 / scale}
        dash={[10 / scale, 5 / scale]}
        perfectDrawEnabled={false}
      />
    </Group>
  );
};
