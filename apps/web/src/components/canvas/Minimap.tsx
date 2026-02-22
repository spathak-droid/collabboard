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
import type { WhiteboardObject, CircleShape, LineShape } from '@/types/canvas';

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

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: WhiteboardObject,
  scale: number,
  offsetX: number,
  offsetY: number,
  strokeStyle: string
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
    const pts = line.points ?? [0, 0, 100, 100];
    const x1 = (obj.x + pts[0] - offsetX) * scale;
    const y1 = (obj.y + pts[1] - offsetY) * scale;
    const x2 = (obj.x + pts[2] - offsetX) * scale;
    const y2 = (obj.y + pts[3] - offsetY) * scale;
    ctx.strokeStyle = line.stroke ?? '#333';
    ctx.lineWidth = Math.max(1, (line.strokeWidth ?? 2) * scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }
  const width = (obj as { width?: number }).width ?? 100;
  const height = (obj as { height?: number }).height ?? 100;
  const x = (obj.x - offsetX) * scale;
  const y = (obj.y - offsetY) * scale;
  const w = width * scale;
  const h = height * scale;
  ctx.fillStyle = (obj as { fill?: string; color?: string }).fill ?? (obj as { color?: string }).color ?? '#e5e7eb';
  ctx.strokeStyle = strokeStyle;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
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
      drawObject(ctx, obj, scale, offsetX, offsetY, 'rgba(255,255,255,0.35)');
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
      const scale = Math.min(scaleX, scaleY);
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
