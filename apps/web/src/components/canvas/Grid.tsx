/**
 * Infinite Grid Component — supports line grid, dot grid, or none
 */

'use client';

import { useMemo, memo } from 'react';
import { Line, Circle } from 'react-konva';

interface GridProps {
  scale: number;
  position: { x: number; y: number };
  width: number;
  height: number;
  theme?: 'light' | 'dark';
  gridMode?: 'none' | 'line' | 'dot';
}

const GridComponent = ({ scale, position, width, height, theme = 'light', gridMode = 'line' }: GridProps) => {
  const gridConfig = useMemo(() => {
    const baseGridSize = 50;
    const startX = -position.x / scale;
    const startY = -position.y / scale;
    const endX = (width - position.x) / scale;
    const endY = (height - position.y) / scale;

    // Use smaller grid for dots, larger for lines
    const gridSize = gridMode === 'dot' ? baseGridSize : baseGridSize * 2;

    return {
      gridSize,
      startX: Math.floor(startX / gridSize) * gridSize,
      startY: Math.floor(startY / gridSize) * gridSize,
      endX: Math.ceil(endX / gridSize) * gridSize,
      endY: Math.ceil(endY / gridSize) * gridSize,
    };
  }, [scale, position, width, height, gridMode]);

  const elements = useMemo(() => {
    if (gridMode === 'none') return [];

    const { startX, startY, endX, endY, gridSize } = gridConfig;

    if (gridMode === 'dot') {
      const dots: React.ReactElement[] = [];
      const dotColor = theme === 'dark' ? '#475569' : '#cbd5e1';
      const dotRadius = Math.max(1, 1.5 / scale);

      for (let x = startX; x <= endX; x += gridSize) {
        for (let y = startY; y <= endY; y += gridSize) {
          dots.push(
            <Circle
              key={`d-${x}-${y}`}
              x={x}
              y={y}
              radius={dotRadius}
              fill={dotColor}
              listening={false}
              perfectDrawEnabled={false}
            />
          );
        }
      }
      return dots;
    }

    // Line grid
    const lines: React.ReactElement[] = [];
    const strokeColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const lineOpacity = theme === 'dark' ? 0.7 : 0.5;
    const strokeWidth = 1 / scale;

    for (let x = startX; x <= endX; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, startY - 500, x, endY + 500]}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={lineOpacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }

    for (let y = startY; y <= endY; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[startX - 500, y, endX + 500, y]}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          opacity={lineOpacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }

    return lines;
  }, [gridConfig, scale, theme, gridMode]);

  if (gridMode === 'none') return null;

  return <>{elements}</>;
};

export const Grid = memo(GridComponent, (prev, next) => {
  const scaleChanged = Math.abs(prev.scale - next.scale) > 0.05;
  const posChanged = Math.abs(prev.position.x - next.position.x) > 50 ||
                      Math.abs(prev.position.y - next.position.y) > 50;
  const sizeChanged = prev.width !== next.width || prev.height !== next.height;
  const themeChanged = prev.theme !== next.theme;
  const modeChanged = prev.gridMode !== next.gridMode;

  return !scaleChanged && !posChanged && !sizeChanged && !themeChanged && !modeChanged;
});
