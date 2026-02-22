/**
 * Test cases for DrawOptionsSidebar component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawOptionsSidebar } from '@/components/canvas/DrawOptionsSidebar';
import { useCanvasStore } from '@/lib/store/canvas';

describe('DrawOptionsSidebar', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      drawColor: '#000000',
      drawSize: 4,
    });
  });

  it('renders Draw header', () => {
    render(<DrawOptionsSidebar />);
    expect(screen.getByRole('heading', { name: /draw/i })).toBeInTheDocument();
  });

  it('renders color and size sections', () => {
    render(<DrawOptionsSidebar />);
    expect(screen.getByText(/color/i)).toBeInTheDocument();
    expect(screen.getByText(/size/i)).toBeInTheDocument();
  });

  it('renders color swatches', () => {
    render(<DrawOptionsSidebar />);
    const swatches = screen.getAllByRole('button', { name: /select color/i });
    expect(swatches.length).toBeGreaterThanOrEqual(5);
  });

  it('renders size slider and preset size buttons', () => {
    render(<DrawOptionsSidebar />);
    const slider = document.querySelector('input[type="range"]');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '24');
    expect(screen.getByTitle('2px')).toBeInTheDocument();
    expect(screen.getByTitle('4px')).toBeInTheDocument();
  });

  it('updates store when color is selected', async () => {
    const user = userEvent.setup();
    render(<DrawOptionsSidebar />);
    const swatches = screen.getAllByRole('button', { name: /select color/i });
    const initialColor = useCanvasStore.getState().drawColor;
    await user.click(swatches[1]);
    const newColor = useCanvasStore.getState().drawColor;
    expect(newColor).not.toBe(initialColor);
    expect(typeof newColor).toBe('string');
    expect(newColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('updates store when size preset is clicked', async () => {
    const user = userEvent.setup();
    render(<DrawOptionsSidebar />);
    await user.click(screen.getByTitle('8px'));
    expect(useCanvasStore.getState().drawSize).toBe(8);
  });

  it('updates store when size slider is changed', () => {
    render(<DrawOptionsSidebar />);
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '12' } });
    expect(useCanvasStore.getState().drawSize).toBe(12);
  });
});
