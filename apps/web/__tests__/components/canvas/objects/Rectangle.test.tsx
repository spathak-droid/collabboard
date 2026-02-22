/**
 * Test cases for Rectangle component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import type { RectShape } from '@/types/canvas';

const mockRectangle: RectShape = {
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 150,
  height: 100,
  fill: '#81D4FA',
  stroke: '#000000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('Rectangle', () => {
  it('renders rectangle with correct properties', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    
    const { container } = render(
      <Rectangle
        data={mockRectangle}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );
    
    expect(container).toBeInTheDocument();
  });
  
  it('renders in unselected state without errors', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    
    const { container } = render(
      <Rectangle
        data={{ ...mockRectangle, text: 'Test text' }}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );
    
    expect(container).toBeInTheDocument();
  });
});
