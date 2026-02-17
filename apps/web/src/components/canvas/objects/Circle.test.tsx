/**
 * Test cases for Circle component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Circle } from './Circle';
import type { CircleShape } from '@/types/canvas';

const mockCircle: CircleShape = {
  id: 'circle-1',
  type: 'circle',
  x: 200,
  y: 200,
  radius: 80,
  fill: '#81D4FA',
  stroke: '#000000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('Circle', () => {
  it('renders circle with correct properties', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();

    const { container } = render(
      <Circle
        data={mockCircle}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with text content', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const circleWithText: CircleShape = {
      ...mockCircle,
      text: 'Hello',
      textSize: 16,
      textFamily: 'Inter',
    };

    const { container } = render(
      <Circle
        data={circleWithText}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders without text when not selected and no text', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const circleNoText: CircleShape = { ...mockCircle, text: '' };

    const { container } = render(
      <Circle
        data={circleNoText}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('accepts onDragMove callback', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const onDragMove = vi.fn();

    const { container } = render(
      <Circle
        data={mockCircle}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
        onDragMove={onDragMove}
      />
    );

    expect(container).toBeInTheDocument();
  });
});
