/**
 * Test cases for connector utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getAnchorPoints,
  getAnchorPosition,
  findNearestAnchor,
  resolveLinePoints,
} from '@/lib/utils/connectors';
import type { RectShape, CircleShape, LineShape, WhiteboardObject } from '@/types/canvas';

const mockRect: RectShape = {
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#81D4FA',
  stroke: '#000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 1,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

const mockCircle: CircleShape = {
  id: 'circle-1',
  type: 'circle',
  x: 500,
  y: 300,
  radius: 50,
  fill: '#A5D6A7',
  stroke: '#000',
  strokeWidth: 2,
  rotation: 0,
  zIndex: 2,
  createdBy: 'user-1',
  createdAt: Date.now(),
};

describe('getAnchorPoints', () => {
  it('returns 4 anchor points for a rectangle', () => {
    const anchors = getAnchorPoints(mockRect);
    expect(anchors).toHaveLength(4);

    const anchorNames = anchors.map((a) => a.anchor);
    expect(anchorNames).toContain('top');
    expect(anchorNames).toContain('right');
    expect(anchorNames).toContain('bottom');
    expect(anchorNames).toContain('left');
  });

  it('computes correct positions for a rectangle', () => {
    const anchors = getAnchorPoints(mockRect);
    const top = anchors.find((a) => a.anchor === 'top')!;
    const right = anchors.find((a) => a.anchor === 'right')!;
    const bottom = anchors.find((a) => a.anchor === 'bottom')!;
    const left = anchors.find((a) => a.anchor === 'left')!;

    // rect at (100, 100) with width=200, height=100
    expect(top).toEqual({ objectId: 'rect-1', anchor: 'top', x: 200, y: 100 });
    expect(right).toEqual({ objectId: 'rect-1', anchor: 'right', x: 300, y: 150 });
    expect(bottom).toEqual({ objectId: 'rect-1', anchor: 'bottom', x: 200, y: 200 });
    expect(left).toEqual({ objectId: 'rect-1', anchor: 'left', x: 100, y: 150 });
  });

  it('returns 4 anchor points for a circle', () => {
    const anchors = getAnchorPoints(mockCircle);
    expect(anchors).toHaveLength(4);
  });

  it('computes correct positions for a circle', () => {
    const anchors = getAnchorPoints(mockCircle);
    const top = anchors.find((a) => a.anchor === 'top')!;
    const right = anchors.find((a) => a.anchor === 'right')!;
    const bottom = anchors.find((a) => a.anchor === 'bottom')!;
    const left = anchors.find((a) => a.anchor === 'left')!;

    // circle at (500, 300) with radius=50
    expect(top).toEqual({ objectId: 'circle-1', anchor: 'top', x: 500, y: 250 });
    expect(right).toEqual({ objectId: 'circle-1', anchor: 'right', x: 550, y: 300 });
    expect(bottom).toEqual({ objectId: 'circle-1', anchor: 'bottom', x: 500, y: 350 });
    expect(left).toEqual({ objectId: 'circle-1', anchor: 'left', x: 450, y: 300 });
  });

  it('returns empty array for line objects', () => {
    const line: LineShape = {
      id: 'line-1',
      type: 'line',
      x: 0,
      y: 0,
      points: [0, 0, 100, 100],
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };
    expect(getAnchorPoints(line)).toHaveLength(0);
  });

  it('accounts for rotation when computing rectangle anchor positions', () => {
    const rotatedRect: RectShape = {
      ...mockRect,
      rotation: 90, // 90 degrees
    };

    const anchors = getAnchorPoints(rotatedRect);
    const top = anchors.find((a) => a.anchor === 'top')!;
    const right = anchors.find((a) => a.anchor === 'right')!;
    const bottom = anchors.find((a) => a.anchor === 'bottom')!;
    const left = anchors.find((a) => a.anchor === 'left')!;

    // Rectangle: x=100, y=100, width=200, height=100, rotation=90°
    // Rotation is around top-left (100, 100)
    // Top center (local): (100, 0) → rotated 90°: (0, 100) → global: (100, 200)
    expect(top.x).toBeCloseTo(100, 0);
    expect(top.y).toBeCloseTo(200, 0);

    // Right center (local): (200, 50) → rotated 90°: (-50, 200) → global: (50, 300)
    expect(right.x).toBeCloseTo(50, 0);
    expect(right.y).toBeCloseTo(300, 0);

    // Bottom center (local): (100, 100) → rotated 90°: (-100, 100) → global: (0, 200)
    expect(bottom.x).toBeCloseTo(0, 0);
    expect(bottom.y).toBeCloseTo(200, 0);

    // Left center (local): (0, 50) → rotated 90°: (-50, 0) → global: (50, 100)
    expect(left.x).toBeCloseTo(50, 0);
    expect(left.y).toBeCloseTo(100, 0);
  });

  it('accounts for rotation when computing circle anchor positions', () => {
    const rotatedCircle: CircleShape = {
      ...mockCircle,
      rotation: 45, // 45 degrees
    };

    const anchors = getAnchorPoints(rotatedCircle);
    
    // Circle at (500, 300) with radius=50, rotation=45°
    // Top anchor (0, -50) rotates 45° around center
    const top = anchors.find((a) => a.anchor === 'top')!;
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    // (0, -50) rotated: (0 * cos45 - (-50) * sin45, 0 * sin45 + (-50) * cos45)
    // = (50 * sin45, -50 * cos45) = (35.36, -35.36)
    expect(top.x).toBeCloseTo(500 + 50 * sin45, 0);
    expect(top.y).toBeCloseTo(300 - 50 * cos45, 0);
  });
});

describe('getAnchorPosition', () => {
  it('returns correct position for a specific anchor', () => {
    const pos = getAnchorPosition(mockRect, 'top');
    expect(pos).toEqual({ x: 200, y: 100 });
  });

  it('returns null for line objects', () => {
    const line: LineShape = {
      id: 'line-1',
      type: 'line',
      x: 0,
      y: 0,
      points: [0, 0, 100, 100],
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };
    expect(getAnchorPosition(line, 'top')).toBeNull();
  });
});

describe('findNearestAnchor', () => {
  const objects: WhiteboardObject[] = [mockRect, mockCircle];

  it('finds nearest anchor within snap distance', () => {
    // rect top anchor is at (200, 100) — search near it
    const result = findNearestAnchor(205, 105, objects);
    expect(result).not.toBeNull();
    expect(result!.objectId).toBe('rect-1');
    expect(result!.anchor).toBe('top');
  });

  it('returns null when no anchor is within snap distance', () => {
    const result = findNearestAnchor(0, 0, objects);
    expect(result).toBeNull();
  });

  it('excludes specified object IDs', () => {
    // Search near rect's top anchor but exclude rect-1
    const result = findNearestAnchor(200, 100, objects, ['rect-1']);
    // Should not find rect-1's anchor
    if (result) {
      expect(result.objectId).not.toBe('rect-1');
    }
  });

  it('ignores line objects', () => {
    const line: LineShape = {
      id: 'line-1',
      type: 'line',
      x: 0,
      y: 0,
      points: [200, 100, 500, 300],
      stroke: '#000',
      strokeWidth: 2,
      rotation: 0,
      zIndex: 1,
      createdBy: 'user-1',
      createdAt: Date.now(),
    };
    const result = findNearestAnchor(200, 100, [...objects, line]);
    // Should still find rect's anchor, not be confused by the line
    expect(result).not.toBeNull();
    expect(result!.objectId).toBe('rect-1');
  });
});

describe('resolveLinePoints', () => {
  const objectsMap = new Map<string, WhiteboardObject>([
    ['rect-1', mockRect],
    ['circle-1', mockCircle],
  ]);

  it('returns raw points for a free line (no anchors)', () => {
    const line = {
      x: 10,
      y: 20,
      points: [0, 0, 100, 100],
    };
    const [x1, y1, x2, y2] = resolveLinePoints(line, objectsMap);
    expect(x1).toBe(10);
    expect(y1).toBe(20);
    expect(x2).toBe(110);
    expect(y2).toBe(120);
  });

  it('resolves start anchor to shape position', () => {
    const line = {
      x: 0,
      y: 0,
      points: [0, 0, 400, 400],
      startAnchor: { objectId: 'rect-1' as string, anchor: 'right' as const },
    };
    const [x1, y1, x2, y2] = resolveLinePoints(line, objectsMap);
    // rect right anchor is at (300, 150)
    expect(x1).toBe(300);
    expect(y1).toBe(150);
    expect(x2).toBe(400);
    expect(y2).toBe(400);
  });

  it('resolves both anchors to shape positions', () => {
    const line = {
      x: 0,
      y: 0,
      points: [0, 0, 0, 0],
      startAnchor: { objectId: 'rect-1' as string, anchor: 'right' as const },
      endAnchor: { objectId: 'circle-1' as string, anchor: 'left' as const },
    };
    const [x1, y1, x2, y2] = resolveLinePoints(line, objectsMap);
    // rect right: (300, 150), circle left: (450, 300)
    expect(x1).toBe(300);
    expect(y1).toBe(150);
    expect(x2).toBe(450);
    expect(y2).toBe(300);
  });

  it('falls back to raw points if anchor object not found', () => {
    const line = {
      x: 0,
      y: 0,
      points: [50, 50, 200, 200],
      startAnchor: { objectId: 'nonexistent' as string, anchor: 'top' as const },
    };
    const [x1, y1, x2, y2] = resolveLinePoints(line, objectsMap);
    expect(x1).toBe(50);
    expect(y1).toBe(50);
    expect(x2).toBe(200);
    expect(y2).toBe(200);
  });
});
