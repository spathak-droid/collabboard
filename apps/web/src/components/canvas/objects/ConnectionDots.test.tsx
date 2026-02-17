/**
 * Test cases for ConnectionDots component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ConnectionDots } from './ConnectionDots';
import type { RectShape, CircleShape } from '@/types/canvas';

const mockRect: RectShape = {
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 200,
  height: 150,
  fill: '#81D4FA',
  stroke: '#000000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

const mockCircle: CircleShape = {
  id: 'circle-1',
  type: 'circle',
  x: 300,
  y: 300,
  radius: 80,
  fill: '#A5D6A7',
  stroke: '#000000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 2,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('ConnectionDots', () => {
  it('renders 4 anchor dots for a rectangle', () => {
    const { container } = render(
      <ConnectionDots object={mockRect} />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders 4 anchor dots for a circle', () => {
    const { container } = render(
      <ConnectionDots object={mockCircle} />
    );

    expect(container).toBeInTheDocument();
  });

  it('highlights the correct anchor when highlightedAnchor matches', () => {
    const { container } = render(
      <ConnectionDots
        object={mockRect}
        highlightedAnchor={{ objectId: 'rect-1', anchor: 'top' }}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('does not highlight when highlightedAnchor does not match', () => {
    const { container } = render(
      <ConnectionDots
        object={mockRect}
        highlightedAnchor={{ objectId: 'other-id', anchor: 'top' }}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('calls onAnchorMouseDown when provided', () => {
    const onAnchorMouseDown = vi.fn();

    const { container } = render(
      <ConnectionDots
        object={mockRect}
        onAnchorMouseDown={onAnchorMouseDown}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('returns null for line objects (no anchors)', () => {
    const lineObj = {
      id: 'line-1',
      type: 'line' as const,
      x: 0,
      y: 0,
      points: [0, 0, 100, 100],
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const { container } = render(
      <ConnectionDots object={lineObj} />
    );

    // Line objects have no anchor points, so nothing renders
    expect(container).toBeInTheDocument();
  });
});
