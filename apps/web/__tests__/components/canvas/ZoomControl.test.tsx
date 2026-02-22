/**
 * Test cases for ZoomControl component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControl } from '@/components/canvas/ZoomControl';
import { useCanvasStore } from '@/lib/store/canvas';

describe('ZoomControl', () => {
  beforeEach(() => {
    useCanvasStore.setState({ scale: 1, position: { x: 0, y: 0 } });
  });

  it('renders zoom controls', () => {
    render(<ZoomControl />);
    expect(screen.getByTitle('Fit to screen')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom to 10%')).toBeInTheDocument();
  });

  it('displays current zoom percentage', () => {
    useCanvasStore.setState({ scale: 1 });
    render(<ZoomControl />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('calls onFitToContent when Fit to screen is clicked', async () => {
    const onFitToContent = vi.fn();
    const user = userEvent.setup();
    render(<ZoomControl onFitToContent={onFitToContent} />);
    await user.click(screen.getByTitle('Fit to screen'));
    expect(onFitToContent).toHaveBeenCalledTimes(1);
  });

  it('resets view when Fit to screen is clicked without onFitToContent', async () => {
    const user = userEvent.setup();
    useCanvasStore.setState({ scale: 0.5, position: { x: 100, y: 100 } });
    render(<ZoomControl />);
    await user.click(screen.getByTitle('Fit to screen'));
    const state = useCanvasStore.getState();
    expect(state.scale).toBe(1);
    expect(state.position).toEqual({ x: 0, y: 0 });
  });

  it('calls onZoomOut with new scale when Zoom out is clicked', async () => {
    const onZoomOut = vi.fn();
    const user = userEvent.setup();
    useCanvasStore.setState({ scale: 1 });
    render(<ZoomControl onZoomOut={onZoomOut} />);
    await user.click(screen.getByTitle('Zoom out'));
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledWith(expect.any(Number));
    expect(onZoomOut.mock.calls[0][0]).toBeLessThan(1);
  });

  it('calls onZoomOut with 0.1 when Zoom to 10% is clicked', async () => {
    const onZoomOut = vi.fn();
    const user = userEvent.setup();
    useCanvasStore.setState({ scale: 1 });
    render(<ZoomControl onZoomOut={onZoomOut} />);
    await user.click(screen.getByTitle('Zoom to 10%'));
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledWith(0.1);
  });

  it('updates scale when Zoom in is clicked', async () => {
    const user = userEvent.setup();
    useCanvasStore.setState({ scale: 1 });
    render(<ZoomControl />);
    await user.click(screen.getByTitle('Zoom in'));
    expect(useCanvasStore.getState().scale).toBeGreaterThan(1);
  });
});
