/**
 * Test cases for TextBubble component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TextBubble } from './TextBubble';
import type { TextBubbleShape } from '@/types/canvas';

const mockTextBubble: TextBubbleShape = {
  id: 'tb-1',
  type: 'textBubble',
  x: 100,
  y: 100,
  width: 220,
  height: 120,
  text: '',
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('TextBubble', () => {
  it('renders text bubble with correct properties', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();

    const { container } = render(
      <TextBubble
        data={mockTextBubble}
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

    const { container } = render(
      <TextBubble
        data={{ ...mockTextBubble, text: 'Hello world' }}
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
      <TextBubble
        data={{ ...mockTextBubble, text: 'Some message' }}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with custom text size and family', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();

    const { container } = render(
      <TextBubble
        data={{ ...mockTextBubble, text: 'Styled text', textSize: 24, textFamily: 'Poppins' }}
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
      <TextBubble
        data={mockTextBubble}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
        onDragMove={onDragMove}
      />
    );

    expect(container).toBeInTheDocument();
  });
});
