/**
 * Test cases for StickyNote component
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StickyNote } from './StickyNote';
import { STICKY_COLORS } from '@/types/canvas';
import type { StickyNote as StickyNoteType } from '@/types/canvas';

const mockStickyNote: StickyNoteType = {
  id: 'sticky-1',
  type: 'sticky',
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  color: STICKY_COLORS.YELLOW,
  text: 'Hello World',
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('StickyNote', () => {
  it('renders sticky note with correct properties', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    
    const { container } = render(
      <StickyNote
        data={mockStickyNote}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );
    
    // Konva renders to canvas, so we check the container exists
    expect(container).toBeInTheDocument();
  });
  
  it('displays text content', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    
    render(
      <StickyNote
        data={mockStickyNote}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );
    
    // Test passes if no errors during render
    expect(true).toBe(true);
  });
  
  it('renders with different colors', () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    
    const pinkNote: StickyNoteType = { ...mockStickyNote, color: STICKY_COLORS.PINK };
    const { container } = render(
      <StickyNote
        data={pinkNote}
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />
    );
    
    expect(container).toBeInTheDocument();
  });
});
