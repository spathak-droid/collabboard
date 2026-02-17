/**
 * ConnectionDots — renders 4 anchor dots (top, right, bottom, left) on a shape.
 * Shown when the shape is hovered or the line tool is active.
 */

'use client';

import { memo } from 'react';
import { Circle } from 'react-konva';
import type { WhiteboardObject } from '@/types/canvas';
import { getAnchorPoints } from '@/lib/utils/connectors';

interface ConnectionDotsProps {
  object: WhiteboardObject;
  highlightedAnchor?: { objectId: string; anchor: string } | null;
  onAnchorMouseDown?: (objectId: string, anchor: string, x: number, y: number) => void;
}

const DOT_RADIUS = 6;
const DOT_FILL = '#3B82F6';
const DOT_FILL_HIGHLIGHT = '#10B981';
const DOT_STROKE = '#FFFFFF';

const ConnectionDotsComponent = ({ object, highlightedAnchor, onAnchorMouseDown }: ConnectionDotsProps) => {
  const anchors = getAnchorPoints(object);

  if (anchors.length === 0) return null;

  return (
    <>
      {anchors.map((anchor) => {
        const isHighlighted =
          highlightedAnchor?.objectId === anchor.objectId &&
          highlightedAnchor?.anchor === anchor.anchor;

        return (
          <Circle
            key={`${anchor.objectId}-${anchor.anchor}`}
            x={anchor.x}
            y={anchor.y}
            radius={isHighlighted ? DOT_RADIUS + 2 : DOT_RADIUS}
            fill={isHighlighted ? DOT_FILL_HIGHLIGHT : DOT_FILL}
            stroke={DOT_STROKE}
            strokeWidth={2}
            hitStrokeWidth={12}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              onAnchorMouseDown?.(anchor.objectId, anchor.anchor, anchor.x, anchor.y);
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'crosshair';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
        );
      })}
    </>
  );
};

export const ConnectionDots = memo(ConnectionDotsComponent);
