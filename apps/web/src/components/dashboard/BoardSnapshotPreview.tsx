'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { getCachedSnapshot, setCachedSnapshot } from '@/lib/utils/snapshotCache';
import { loadSnapshot } from '@/lib/yjs/sync';
import type { WhiteboardObject } from '@/types/canvas';

const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 180;
type SnapshotState = 'loading' | 'ready' | 'empty' | 'error';

const extractBounds = (objects: WhiteboardObject[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  objects.forEach((obj) => {
    const { x, y, width, height } = getBounds(obj);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
    };
  }

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
};

const getBounds = (obj: WhiteboardObject) => {
  switch (obj.type) {
    case 'circle': {
      const diameter = obj.radius * 2;
      return {
        x: obj.x - obj.radius,
        y: obj.y - obj.radius,
        width: diameter,
        height: diameter,
      };
    }
    case 'line': {
      const [x1, y1, x2, y2] = obj.points;
      const minX = Math.min(x1, x2) + obj.x;
      const maxX = Math.max(x1, x2) + obj.x;
      const minY = Math.min(y1, y2) + obj.y;
      const maxY = Math.max(y1, y2) + obj.y;
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 2),
        height: Math.max(maxY - minY, 2),
      };
    }
    case 'text': {
      const width = Math.max(obj.text.length * 6, 60);
      const height = (obj.textSize ?? 12) + 8;
      return {
        x: obj.x,
        y: obj.y,
        width,
        height,
      };
    }
    case 'sticky':
    case 'rect':
    case 'triangle':
    case 'star':
    case 'textBubble':
    case 'frame': {
      const width = ('width' in obj && typeof obj.width === 'number' ? obj.width : 60);
      const height = ('height' in obj && typeof obj.height === 'number' ? obj.height : 40);
      return { x: obj.x, y: obj.y, width, height };
    }
    default: {
      const unknownObj = obj as { x: number; y: number };
      return { x: unknownObj.x, y: unknownObj.y, width: 32, height: 32 };
    }
  }
};

const drawShape = (ctx: CanvasRenderingContext2D, obj: WhiteboardObject) => {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';

  const solidFill = (color?: string, fallback = '#e2e8f0') => {
    ctx.fillStyle = color ?? fallback;
  };

  const drawRect = (width: number, height: number, fillColor?: string) => {
    solidFill(fillColor);
    ctx.fillRect(obj.x, obj.y, width, height);
    ctx.strokeRect(obj.x, obj.y, width, height);
  };

  switch (obj.type) {
    case 'sticky':
      drawRect(obj.width, obj.height, obj.color);
      break;
    case 'triangle': {
      const width = obj.width ?? 60;
      const height = obj.height ?? 50;
      solidFill(obj.fill ?? undefined);
      ctx.beginPath();
      ctx.moveTo(obj.x + width / 2, obj.y);
      ctx.lineTo(obj.x + width, obj.y + height);
      ctx.lineTo(obj.x, obj.y + height);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'circle':
      solidFill(obj.fill ?? undefined);
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'line':
      ctx.strokeStyle = obj.stroke ?? '#94a3b8';
      ctx.lineWidth = Math.max(obj.strokeWidth ?? 1.5, 1.5);
      ctx.beginPath();
      ctx.moveTo(obj.x + obj.points[0], obj.y + obj.points[1]);
      ctx.lineTo(obj.x + obj.points[2], obj.y + obj.points[3]);
      ctx.stroke();
      break;
    case 'frame':
      drawRect(obj.width ?? 120, obj.height ?? 80, obj.fill ?? undefined);
      break;
    case 'textBubble': {
      const width = ('width' in obj && typeof obj.width === 'number' ? obj.width : 60);
      const height = ('height' in obj && typeof obj.height === 'number' ? obj.height : 40);
      drawRect(width, height, '#fff1f2');
      break;
    }
    case 'rect':
    case 'star': {
      const width = ('width' in obj && typeof obj.width === 'number' ? obj.width : 60);
      const height = ('height' in obj && typeof obj.height === 'number' ? obj.height : 40);
      drawRect(width, height, obj.fill ?? undefined);
      break;
    }
    case 'text': {
      const textWidth = Math.max(obj.text.length * 6, 60);
      const textHeight = (obj.textSize ?? 12) + 8;
      drawRect(textWidth, textHeight, '#e0f2fe');
      break;
    }
    default:
      drawRect(40, 32);
  }

  ctx.restore();
};

export const BoardSnapshotPreview = ({ boardId }: { boardId: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<SnapshotState>('loading');

  useEffect(() => {
    let cancelled = false;

    const drawObjectsOnCanvas = (objects: WhiteboardObject[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const bounds = extractBounds(objects);
      const padding = 12;
      const availableWidth = CANVAS_WIDTH - padding * 2;
      const availableHeight = CANVAS_HEIGHT - padding * 2;
      const scale = Math.min(
        availableWidth / Math.max(bounds.width, 1),
        availableHeight / Math.max(bounds.height, 1)
      );
      const offsetX =
        padding +
        (availableWidth - bounds.width * scale) / 2 -
        bounds.minX * scale;
      const offsetY =
        padding +
        (availableHeight - bounds.height * scale) / 2 -
        bounds.minY * scale;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      objects.forEach((obj) => drawShape(ctx, obj));
      ctx.restore();
    };

    const renderSnapshot = async () => {
      setState('loading');
      console.log(`[BoardSnapshotPreview] Loading snapshot for board: ${boardId}`);
      try {
        let snapshot = getCachedSnapshot(boardId);
        if (!snapshot) {
          console.log(`[BoardSnapshotPreview] No cached snapshot, loading from storage...`);
          snapshot = await loadSnapshot(boardId);
          if (snapshot) {
            console.log(`[BoardSnapshotPreview] Loaded snapshot (${snapshot.length} bytes), caching...`);
            setCachedSnapshot(boardId, snapshot);
          }
        } else {
          console.log(`[BoardSnapshotPreview] Using cached snapshot (${snapshot.length} bytes)`);
        }
        if (!snapshot) {
          console.log(`[BoardSnapshotPreview] No snapshot found, showing empty state`);
          if (!cancelled) setState('empty');
          return;
        }

        if (cancelled) return;
        const doc = new Y.Doc();
        Y.applyUpdate(doc, snapshot);
        const objectsMap = doc.getMap('objects');
        const objects: WhiteboardObject[] = [];
        objectsMap.forEach((value) => {
          objects.push(value as WhiteboardObject);
        });
        doc.destroy();

        console.log(`[BoardSnapshotPreview] Parsed ${objects.length} objects from snapshot`);

        if (objects.length === 0) {
          console.log(`[BoardSnapshotPreview] No objects in snapshot, showing empty state`);
          if (!cancelled) setState('empty');
          return;
        }

        drawObjectsOnCanvas(objects);
        console.log(`[BoardSnapshotPreview] Successfully rendered snapshot`);
        if (!cancelled) setState('ready');
      } catch (error) {
        console.error('[BoardSnapshotPreview] Error:', error);
        if (!cancelled) setState('error');
      }
    };

    renderSnapshot();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
        aria-hidden="true"
      />
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Loading...
            </span>
          </div>
        </div>
      )}
      {state === 'empty' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-2">
          <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Empty Board
          </span>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Preview Error
        </div>
      )}
    </div>
  );
};
