/**
 * Tests for viewport culling utilities (minimap and visibility)
 */

import { describe, it, expect } from 'vitest';
import { getObjectBounds, isObjectVisible, getViewport } from '@/lib/utils/viewportCulling';
import type { PathShape, RectShape } from '@/types/canvas';

describe('viewportCulling', () => {
  describe('getObjectBounds', () => {
    it('returns bounds for path with multiple points', () => {
      const path: PathShape = {
        id: 'p1',
        type: 'path',
        x: 10,
        y: 20,
        points: [0, 0, 50, 100, 80, 30],
        stroke: '#000',
        strokeWidth: 4,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const bounds = getObjectBounds(path);
      expect(bounds.minX).toBe(10);
      expect(bounds.minY).toBe(20);
      expect(bounds.maxX).toBe(90);
      expect(bounds.maxY).toBe(120);
    });

    it('returns degenerate bounds for path with fewer than 2 points', () => {
      const path: PathShape = {
        id: 'p2',
        type: 'path',
        x: 5,
        y: 5,
        points: [1, 1],
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const bounds = getObjectBounds(path);
      expect(bounds.minX).toBe(6);
      expect(bounds.minY).toBe(6);
      expect(bounds.maxX).toBe(6);
      expect(bounds.maxY).toBe(6);
    });
  });

  describe('isObjectVisible', () => {
    it('returns true when path is inside viewport', () => {
      const path: PathShape = {
        id: 'p3',
        type: 'path',
        x: 100,
        y: 100,
        points: [0, 0, 50, 50],
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const viewport = getViewport(
        { x: 0, y: 0 },
        1,
        { width: 1920, height: 1080 }
      );

      expect(isObjectVisible(path, viewport, 50)).toBe(true);
    });

    it('returns false when path is outside viewport', () => {
      const path: PathShape = {
        id: 'p4',
        type: 'path',
        x: 5000,
        y: 5000,
        points: [0, 0, 10, 10],
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const viewport = getViewport(
        { x: 0, y: 0 },
        1,
        { width: 1920, height: 1080 }
      );

      expect(isObjectVisible(path, viewport, 0)).toBe(false);
    });
  });
});
