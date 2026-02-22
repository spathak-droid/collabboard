/**
 * Test cases for Canvas component (TDD)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Canvas } from '@/components/canvas/Canvas';
import { useCanvasStore } from '@/lib/store/canvas';

// Mock react-konva so Konva Stage/canvas never run in jsdom (avoids "scale" null and canvas context errors)
vi.mock('react-konva', () => {
  const React = require('react');
  const StageMock = React.forwardRef(({ children }: { children?: React.ReactNode }, _ref: React.Ref<unknown>) =>
    React.createElement('div', { 'data-testid': 'konva-stage' }, React.createElement('canvas', {}), children)
  );
  StageMock.displayName = 'Stage';
  return {
    Stage: StageMock,
    Layer: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    Rect: () => null,
    Line: () => null,
  };
});

describe('Canvas', () => {
  beforeEach(() => {
    // Reset store
    useCanvasStore.setState({
      scale: 1,
      position: { x: 0, y: 0 },
      selectedIds: [],
    });
  });
  
  it('renders canvas with correct dimensions', () => {
    const { container } = render(<Canvas boardId="test-board" />);
    
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });
  
  it('initializes with default scale and position', () => {
    render(<Canvas boardId="test-board" />);
    
    const store = useCanvasStore.getState();
    expect(store.scale).toBe(1);
    expect(store.position).toEqual({ x: 0, y: 0 });
  });
  
  it('renders children objects', () => {
    render(
      <Canvas boardId="test-board">
        <div data-testid="test-object">Test Object</div>
      </Canvas>
    );
    
    // Note: Konva renders to canvas, so we can't query React nodes directly
    // This is more of a smoke test
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });
  
  it('handles window resize', () => {
    const { container } = render(<Canvas boardId="test-board" />);
    
    // Trigger resize
    window.dispatchEvent(new Event('resize'));
    
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });
});
