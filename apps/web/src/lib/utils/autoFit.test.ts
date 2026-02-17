/**
 * Test cases for auto-fit utilities
 */

import { describe, it, expect } from 'vitest';
import { calculateBoundingBox, calculateAutoFit } from './autoFit';
import type { RectShape, CircleShape, LineShape } from '@/types/canvas';

describe('calculateBoundingBox', () => {
  it('returns null for empty array', () => {
    expect(calculateBoundingBox([])).toBeNull();
  });

  it('calculates bbox for single rectangle', () => {
    const rect: RectShape = {
      id: '1',
      type: 'rect',
      x: 100,
      y: 200,
      width: 300,
      height: 150,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const bbox = calculateBoundingBox([rect]);
    expect(bbox).toEqual({
      minX: 100,
      minY: 200,
      maxX: 400,
      maxY: 350,
      width: 300,
      height: 150,
      centerX: 250,
      centerY: 275,
    });
  });

  it('calculates bbox for circle', () => {
    const circle: CircleShape = {
      id: '1',
      type: 'circle',
      x: 500,
      y: 500,
      radius: 50,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const bbox = calculateBoundingBox([circle]);
    expect(bbox).toEqual({
      minX: 450,
      minY: 450,
      maxX: 550,
      maxY: 550,
      width: 100,
      height: 100,
      centerX: 500,
      centerY: 500,
    });
  });

  it('calculates bbox for line', () => {
    const line: LineShape = {
      id: '1',
      type: 'line',
      x: 0,
      y: 0,
      points: [100, 100, 300, 400],
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const bbox = calculateBoundingBox([line]);
    expect(bbox).toEqual({
      minX: 100,
      minY: 100,
      maxX: 300,
      maxY: 400,
      width: 200,
      height: 300,
      centerX: 200,
      centerY: 250,
    });
  });

  it('calculates bbox for multiple objects', () => {
    const rect: RectShape = {
      id: '1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const circle: CircleShape = {
      id: '2',
      type: 'circle',
      x: 500,
      y: 500,
      radius: 50,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 2,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const bbox = calculateBoundingBox([rect, circle]);
    expect(bbox?.minX).toBe(0);
    expect(bbox?.minY).toBe(0);
    expect(bbox?.maxX).toBe(550);
    expect(bbox?.maxY).toBe(550);
  });
});

describe('calculateAutoFit', () => {
  it('returns null for empty array', () => {
    expect(calculateAutoFit([], 1920, 1080)).toBeNull();
  });

  it('calculates zoom to fit single object', () => {
    const rect: RectShape = {
      id: '1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const result = calculateAutoFit([rect], 1920, 1080, 100);
    expect(result).toBeTruthy();
    expect(result!.scale).toBeGreaterThan(0.1);
    expect(result!.scale).toBeLessThanOrEqual(1);
  });

  it('increases zoom for few objects even if calculated zoom is low', () => {
    const rect: RectShape = {
      id: '1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 5000,
      height: 5000,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const result = calculateAutoFit([rect], 1920, 1080, 100);
    expect(result).toBeTruthy();
    // Even though object is huge, with only 1 object, zoom should be at least adjusted
    expect(result!.scale).toBeGreaterThanOrEqual(0.1);
  });

  it('clamps scale between 0.1 and 1', () => {
    const tiny: RectShape = {
      id: '1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: '#fff',
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };

    const result = calculateAutoFit([tiny], 1920, 1080);
    expect(result!.scale).toBeLessThanOrEqual(1);
    expect(result!.scale).toBeGreaterThanOrEqual(0.1);
  });
});
