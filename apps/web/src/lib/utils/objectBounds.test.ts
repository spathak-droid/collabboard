/**
 * Tests for objectBounds utilities
 */

import { describe, it, expect } from 'vitest';
import { getObjectBounds, pointInBounds, intersectsRect } from './objectBounds';
import type { WhiteboardObject, RectShape, CircleShape } from '@/types/canvas';

describe('objectBounds', () => {
  describe('getObjectBounds', () => {
    it('should calculate bounds for a rectangle', () => {
      const rect: RectShape = {
        id: '1',
        type: 'rect',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const map = new Map<string, WhiteboardObject>([['1', rect]]);
      const bounds = getObjectBounds(rect, map);

      expect(bounds.minX).toBeLessThan(100);
      expect(bounds.minY).toBeLessThan(100);
      expect(bounds.maxX).toBeGreaterThan(300);
      expect(bounds.maxY).toBeGreaterThan(250);
    });

    it('should calculate bounds for a circle', () => {
      const circle: CircleShape = {
        id: '2',
        type: 'circle',
        x: 200,
        y: 200,
        radius: 50,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const map = new Map<string, WhiteboardObject>([['2', circle]]);
      const bounds = getObjectBounds(circle, map);

      expect(bounds.minX).toBeLessThan(150); // x - radius
      expect(bounds.minY).toBeLessThan(150); // y - radius
      expect(bounds.maxX).toBeGreaterThan(250); // x + radius
      expect(bounds.maxY).toBeGreaterThan(250); // y + radius
    });

    it('should account for rotation in bounds calculation', () => {
      const rect: RectShape = {
        id: '3',
        type: 'rect',
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 2,
        rotation: 45,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const map = new Map<string, WhiteboardObject>([['3', rect]]);
      const bounds = getObjectBounds(rect, map);

      // Rotated rectangle should have larger bounds
      expect(bounds.maxX - bounds.minX).toBeGreaterThan(200);
      expect(bounds.maxY - bounds.minY).toBeGreaterThan(100);
    });
  });

  describe('pointInBounds', () => {
    it('should return true for point inside bounds', () => {
      const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      expect(pointInBounds(50, 50, bounds)).toBe(true);
    });

    it('should return false for point outside bounds', () => {
      const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      expect(pointInBounds(150, 150, bounds)).toBe(false);
    });

    it('should respect tolerance', () => {
      const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      // Point just outside but within tolerance
      expect(pointInBounds(105, 50, bounds, 10)).toBe(true);
    });
  });

  describe('intersectsRect', () => {
    it('should detect intersection', () => {
      const rect: RectShape = {
        id: '4',
        type: 'rect',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const map = new Map<string, WhiteboardObject>([['4', rect]]);
      const testRect = { x: 100, y: 100, width: 50, height: 50 };

      expect(intersectsRect(rect, testRect, map)).toBe(true);
    });

    it('should detect no intersection', () => {
      const rect: RectShape = {
        id: '5',
        type: 'rect',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: '#000',
        stroke: '#000',
        strokeWidth: 2,
        rotation: 0,
        zIndex: 0,
        createdBy: 'test',
        createdAt: Date.now(),
      };

      const map = new Map<string, WhiteboardObject>([['5', rect]]);
      const testRect = { x: 200, y: 200, width: 50, height: 50 };

      expect(intersectsRect(rect, testRect, map)).toBe(false);
    });
  });
});
