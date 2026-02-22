/**
 * Minimap - Small overview of the entire board using a separate HTML5 canvas.
 *
 * - Uses imperative 2D drawing (no extra React/Konva nodes).
 * - Reads Zustand state via getState() in the draw loop (no hook-driven re-renders).
 * - Throttled redraw at ~100ms (~10 FPS) to keep CPU low.
 * - Draws simplified shapes (rects, ellipses, lines) at minimap scale.
 */

'use client';

import { useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { getObjectBounds } from '@/lib/utils/viewportCulling';
import { resolveLinePoints } from '@/lib/utils/connectors';
import type { WhiteboardObject, CircleShape, LineShape, PathShape } from '@/types/canvas';

const THROTTLE_MS = 100;
const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const WORLD_PADDING = 200;
const DEFAULT_WORLD = { minX: 0, minY: 0, maxX: 2000, maxY: 1500 };
const LINE_GRID_SPACING = 10;
const LINE_STROKE = '#64748b';
const LINE_OPACITY = 0.5;
const MINIMAP_BG_NONE = '#94a3b8';
const MINIMAP_BG_GRID = '#94a3b8';
const MINIMAP_STAR_RADIUS_MIN = 3;
const MINIMAP_STAR_MAX_RADIUS = 8;
const MINIMAP_STAR_SCALE_FACTOR = 0.2;

function getWorldBounds(objects: WhiteboardObject[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (objects.length === 0) return DEFAULT_WORLD;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    const b = getObjectBounds(obj);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const pad = WORLD_PADDING;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function drawStarPath(ctx: CanvasRenderingContext2D, radius: number) {
  const outerRadius = Math.max(10, radius);
  const innerRadius = outerRadius * 0.45;
  const steps = 5;
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const outerAngle = (-90 + i * (360 / steps)) * (Math.PI / 180);
    const innerAngle = outerAngle + (360 / (steps * 2)) * (Math.PI / 180);
    const outerX = outerRadius * Math.cos(outerAngle);
    const outerY = outerRadius * Math.sin(outerAngle);
    const innerX = innerRadius * Math.cos(innerAngle);
    const innerY = innerRadius * Math.sin(innerAngle);
    if (i === 0) {
      ctx.moveTo(outerX, outerY);
    } else {
      ctx.lineTo(outerX, outerY);
    }
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
}

function drawTrianglePath(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: WhiteboardObject,
  scale: number,
  offsetX: number,
  offsetY: number,
  strokeStyle: string,
  objectsMap: Map<string, WhiteboardObject>
) {
  if (obj.type === 'circle') {
    const c = obj as CircleShape;
    const r = (c.radius ?? 50) * scale;
    const cx = (obj.x - offsetX) * scale;
    const cy = (obj.y - offsetY) * scale;
    ctx.fillStyle = c.fill ?? '#ccc';
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (obj.type === 'line') {
    const line = obj as LineShape;
    let x1: number, y1: number, x2: number, y2: number;
    if (line.startAnchor || line.endAnchor) {
      const [ax1, ay1, ax2, ay2] = resolveLinePoints(line, objectsMap);
      x1 = ax1;
      y1 = ay1;
      x2 = ax2;
      y2 = ay2;
    } else {
      const pts = line.points ?? [0, 0, 100, 100];
      x1 = line.x + pts[0];
      y1 = line.y + pts[1];
      x2 = line.x + pts[2];
      y2 = line.y + pts[3];
    }
    ctx.strokeStyle = line.stroke ?? '#333';
    ctx.lineWidth = Math.max(1, (line.strokeWidth ?? 2) * scale);
    ctx.beginPath();
    ctx.moveTo((x1 - offsetX) * scale, (y1 - offsetY) * scale);
    ctx.lineTo((x2 - offsetX) * scale, (y2 - offsetY) * scale);
    ctx.stroke();
    return;
  }


  if (obj.type === 'path') {
    const pathShape = obj as PathShape;
    const pts = pathShape.points;
    if (!pts || pts.length < 4) return;
    const rotation = ((obj.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const mapPoint = (px: number, py: number) => {
      const rotatedX = px * cos - py * sin;
      const rotatedY = px * sin + py * cos;
      const worldX = obj.x + rotatedX;
      const worldY = obj.y + rotatedY;
      return { x: (worldX - offsetX) * scale, y: (worldY - offsetY) * scale };
    };
    ctx.strokeStyle = pathShape.stroke ?? '#333';
    ctx.lineWidth = Math.max(1, (pathShape.strokeWidth ?? 2) * scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const start = mapPoint(pts[0], pts[1]);
    ctx.moveTo(start.x, start.y);
    for (let i = 2; i < pts.length; i += 2) {
      const point = mapPoint(pts[i], pts[i + 1]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    return;
  }
  const width = (obj as { width?: number }).width ?? 100;
  const height = (obj as { height?: number }).height ?? 100;
  const x = (obj.x - offsetX) * scale;
  const y = (obj.y - offsetY) * scale;
  const w = width * scale;
  const h = height * scale;
  const rotation = ((obj.rotation ?? 0) * Math.PI) / 180;

  if (obj.type === 'star') {
    const scaledRadius = Math.min(w, h) * MINIMAP_STAR_SCALE_FACTOR;
    const effectiveRadius = Math.min(
      MINIMAP_STAR_MAX_RADIUS,
      Math.max(MINIMAP_STAR_RADIUS_MIN, scaledRadius)
    );
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.fillStyle = (obj as { fill?: string; color?: string }).fill ?? (obj as { color?: string }).color ?? '#e5e7eb';
    ctx.strokeStyle = strokeStyle;
    drawStarPath(ctx, effectiveRadius);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = (obj as { fill?: string; color?: string }).fill ?? (obj as { color?: string }).color ?? '#e5e7eb';
  ctx.strokeStyle = strokeStyle;
  if (obj.type === 'triangle') {
    drawTrianglePath(ctx, w, h);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(0, 0, w, h);
    ctx.strokeRect(0, 0, w, h);
  }
  ctx.restore();
}

interface MinimapProps {
  objects: WhiteboardObject[];
}

export function Minimap({ objects }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectsRef = useRef<WhiteboardObject[]>(objects);
  const throttleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  objectsRef.current = objects;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const objs = objectsRef.current;
    const world = getWorldBounds(objs);
    const objectMap = new Map<string, WhiteboardObject>();
    for (const obj of objs) {
      objectMap.set(obj.id, obj);
    }
    const worldW = world.maxX - world.minX || 1;
    const worldH = world.maxY - world.minY || 1;
    const scaleX = MINIMAP_WIDTH / worldW;
    const scaleY = MINIMAP_HEIGHT / worldH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = world.minX;
    const offsetY = world.minY;

    const { gridMode } = useCanvasStore.getState();
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    ctx.fillStyle = gridMode === 'none' ? MINIMAP_BG_NONE : MINIMAP_BG_GRID;
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    if (gridMode === 'line') {
      ctx.strokeStyle = LINE_STROKE;
      ctx.globalAlpha = LINE_OPACITY;
      ctx.lineWidth = 1;
      for (let x = 0; x <= MINIMAP_WIDTH; x += LINE_GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MINIMAP_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= MINIMAP_HEIGHT; y += LINE_GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MINIMAP_WIDTH, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const obj of objs) {
      drawObject(ctx, obj, scale, offsetX, offsetY, 'rgba(255,255,255,0.35)', objectMap);
    }
  }, []);

  useLayoutEffect(() => {
    draw();
    throttleRef.current = setInterval(draw, THROTTLE_MS);
    return () => {
      if (throttleRef.current) {
        clearInterval(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = MINIMAP_WIDTH;
    canvas.height = MINIMAP_HEIGHT;
    draw();
  }, [draw]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const state = useCanvasStore.getState();
      const { position, scale: viewScale, setPosition } = state;
      const stageWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const stageHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const objs = objectsRef.current;
    const world = getWorldBounds(objs);
    const worldW = world.maxX - world.minX || 1;
    const worldH = world.maxY - world.minY || 1;
    const scaleX = MINIMAP_WIDTH / worldW;
    const scaleY = MINIMAP_HEIGHT / worldH;
    const rawScale = Math.min(scaleX, scaleY);
    const maxScale = 0.25;
    const scale = Math.min(rawScale, maxScale);
      const offsetX = world.minX;
      const offsetY = world.minY;
      const canvasX = offsetX + mx / scale;
      const canvasY = offsetY + my / scale;
      const newPosX = -canvasX * viewScale + (stageWidth / 2);
      const newPosY = -canvasY * viewScale + (stageHeight / 2);
      setPosition({ x: newPosX, y: newPosY });
    },
    []
  );

  return (
    <div
      className="fixed bottom-4 right-4 z-30 rounded-xl border border-slate-500/50 bg-slate-400 shadow-[0_4px_6px_rgba(0,0,0,0.15),0_10px_25px_rgba(0,0,0,0.25),0_20px_50px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.15)] overflow-hidden"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        onPointerDown={handlePointerDown}
        className="block w-full h-full cursor-pointer"
        title="Minimap – click to pan"
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      />
    </div>
  );
}
