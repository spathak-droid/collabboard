/**
 * Test cases for Toolbar component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from './Toolbar';
import { useCanvasStore } from '@/lib/store/canvas';

describe('Toolbar', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeTool: 'select',
      selectedIds: [],
    });
  });
  
  it('renders all tool buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle('Select')).toBeInTheDocument();
    expect(screen.getByTitle('Sticky Note')).toBeInTheDocument();
    expect(screen.getByTitle('Rectangle')).toBeInTheDocument();
    expect(screen.getByTitle('Circle')).toBeInTheDocument();
    expect(screen.getByTitle('Line')).toBeInTheDocument();
  });
  
  it('highlights active tool', () => {
    useCanvasStore.setState({ activeTool: 'sticky' });
    
    render(<Toolbar />);
    
    const stickyButton = screen.getByTitle('Sticky Note');
    expect(stickyButton).toHaveClass('bg-blue-500');
  });
  
  it('switches active tool on click', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    
    await user.click(screen.getByTitle('Rectangle'));
    
    expect(useCanvasStore.getState().activeTool).toBe('rect');
  });
  
  it('shows delete button when objects selected', () => {
    useCanvasStore.setState({ selectedIds: ['obj1'] });
    
    const onDelete = vi.fn();
    render(<Toolbar onDelete={onDelete} />);
    
    expect(screen.getByTitle(/delete/i)).toBeInTheDocument();
  });
  
  it('calls onDelete when delete button clicked', async () => {
    const user = userEvent.setup();
    useCanvasStore.setState({ selectedIds: ['obj1'] });
    
    const onDelete = vi.fn();
    render(<Toolbar onDelete={onDelete} />);
    
    await user.click(screen.getByTitle(/delete/i));
    
    expect(onDelete).toHaveBeenCalled();
  });
  
  it('hides delete button when no selection', () => {
    useCanvasStore.setState({ selectedIds: [] });
    
    const onDelete = vi.fn();
    render(<Toolbar onDelete={onDelete} />);
    
    expect(screen.queryByTitle(/delete/i)).not.toBeInTheDocument();
  });
  
  it('displays current zoom level', () => {
    useCanvasStore.setState({ scale: 1.5 });
    
    render(<Toolbar />);
    
    expect(screen.getByText(/zoom: 150%/i)).toBeInTheDocument();
  });
});
