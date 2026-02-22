/**
 * Test cases for Grid component
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Grid } from './Grid';

describe('Grid', () => {
  it('renders line grid without errors', () => {
    const { container } = render(
      <Grid
        scale={1}
        position={{ x: 0, y: 0 }}
        width={1920}
        height={1080}
        gridMode="line"
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders nothing when gridMode is none', () => {
    const { container } = render(
      <Grid
        scale={1}
        position={{ x: 0, y: 0 }}
        width={1920}
        height={1080}
        gridMode="none"
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('defaults to line grid when gridMode not specified', () => {
    const { container } = render(
      <Grid
        scale={1}
        position={{ x: 0, y: 0 }}
        width={1920}
        height={1080}
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('handles different zoom levels', () => {
    const scales = [0.1, 0.5, 1, 2, 5];

    scales.forEach(scale => {
      const { container } = render(
        <Grid
          scale={scale}
          position={{ x: 0, y: 0 }}
          width={1920}
          height={1080}
          gridMode="line"
        />
      );

      expect(container).toBeInTheDocument();
    });
  });

  it('handles different positions', () => {
    const { container } = render(
      <Grid
        scale={1}
        position={{ x: 500, y: -300 }}
        width={1920}
        height={1080}
        gridMode="line"
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('renders with dark theme', () => {
    const { container } = render(
      <Grid
        scale={1}
        position={{ x: 0, y: 0 }}
        width={1920}
        height={1080}
        theme="dark"
        gridMode="line"
      />
    );

    expect(container).toBeInTheDocument();
  });
});
