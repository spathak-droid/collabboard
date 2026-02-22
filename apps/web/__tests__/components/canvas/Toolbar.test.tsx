/**
 * Test cases for Toolbar component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from '@/components/canvas/Toolbar';
import { useCanvasStore } from '@/lib/store/canvas';

describe('Toolbar', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeTool: 'select',
      selectedIds: [],
    });
  });
  
  it('renders main tool buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle('Select')).toBeInTheDocument();
    expect(screen.getByTitle('Sticky Note')).toBeInTheDocument();
    expect(screen.getByTitle('Frame')).toBeInTheDocument();
    expect(screen.getByTitle('Draw')).toBeInTheDocument();
    expect(screen.getByTitle('Shapes')).toBeInTheDocument();
  });
  
  it('highlights active tool', () => {
    useCanvasStore.setState({ activeTool: 'sticky' });
    
    render(<Toolbar />);
    
    const stickyButton = screen.getByTitle('Sticky Note');
    expect(stickyButton).toHaveClass('bg-slate-200');
  });

  it('renders Draw tool', () => {
    render(<Toolbar />);
    expect(screen.getByTitle('Draw')).toBeInTheDocument();
  });
  
  it('switches active tool on click', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    
    await user.click(screen.getByTitle('Draw'));
    
    expect(useCanvasStore.getState().activeTool).toBe('draw');
  });

  it('switches to rect when shapes menu opened and rectangle clicked', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    await user.click(screen.getByTitle('Shapes'));
    await user.click(screen.getByText('Rectangle'));
    expect(useCanvasStore.getState().activeTool).toBe('rect');
  });
});
