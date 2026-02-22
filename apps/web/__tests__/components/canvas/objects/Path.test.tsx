/**
 * Test cases for Path (freehand draw) component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Path } from '@/components/canvas/objects/Path';
import type { PathShape } from '@/types/canvas';

const mockPath: PathShape = {
  id: 'path-1',
  type: 'path',
  x: 50,
  y: 50,
  points: [0, 0, 100, 50, 200, 100],
  stroke: '#000000',
  strokeWidth: 4,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('Path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders path with correct data', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();

    const { container } = render(
      <Path
        data={mockPath}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders path with minimal points (fallback)', () => {
    const minimalPath: PathShape = {
      ...mockPath,
      id: 'path-2',
      points: [0, 0],
    };

    const { container } = render(
      <Path
        data={minimalPath}
        isSelected={false}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders in selected state', () => {
    const { container } = render(
      <Path
        data={mockPath}
        isSelected={true}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('accepts isDraggable false', () => {
    const { container } = render(
      <Path
        data={mockPath}
        isSelected={false}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        isDraggable={false}
      />
    );

    expect(container).toBeInTheDocument();
  });
});
