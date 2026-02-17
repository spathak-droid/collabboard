/**
 * Test cases for Line component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Line } from './Line';
import type { LineShape } from '@/types/canvas';

const mockLine: LineShape = {
  id: 'line-1',
  type: 'line',
  x: 0,
  y: 0,
  points: [100, 100, 300, 300],
  stroke: '#000000',
  strokeWidth: 3,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

const mockConnectedLine: LineShape = {
  ...mockLine,
  id: 'line-2',
  startAnchor: { objectId: 'rect-1', anchor: 'right' },
  endAnchor: { objectId: 'rect-2', anchor: 'left' },
};

describe('Line', () => {
  it('renders a free line with arrowhead', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();

    const { container } = render(
      <Line
        data={mockLine}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders a connected line with resolvedPoints', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const resolved: [number, number, number, number] = [150, 200, 350, 200];

    const { container } = render(
      <Line
        data={mockConnectedLine}
        resolvedPoints={resolved}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with only start anchor (free end shows arrow)', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const halfConnected: LineShape = {
      ...mockLine,
      id: 'line-3',
      startAnchor: { objectId: 'rect-1', anchor: 'bottom' },
    };

    const { container } = render(
      <Line
        data={halfConnected}
        resolvedPoints={[150, 250, 300, 400]}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });
});
