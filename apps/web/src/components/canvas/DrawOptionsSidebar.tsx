/**
 * Draw Options Sidebar - Color and brush size when Draw tool is active.
 * Shown on the right when the user selects the Draw tool.
 */

'use client';

import { useCanvasStore } from '@/lib/store/canvas';
import { DRAW_COLORS } from '@/types/canvas';

const BRUSH_SIZES = [2, 4, 6, 8, 12, 16, 20];

export function DrawOptionsSidebar() {
  const { drawColor, drawSize, setDrawColor, setDrawSize } = useCanvasStore();

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 w-56 max-h-[60vh] bg-white rounded-[12px] shadow-[-6px_0_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] z-40 flex flex-col overflow-hidden">
      <div className="p-2.5 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-900 text-center">Draw</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3">
        {/* Color */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Color
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {DRAW_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDrawColor(color)}
                className={`h-7 w-7 rounded-md border-2 transition-transform hover:scale-105 ${
                  drawColor === color ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'
                }`}
                style={{ backgroundColor: color }}
                title={color}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
        {/* Size */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Size
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={24}
              value={drawSize}
              onChange={(e) => setDrawSize(Number(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none bg-slate-200 accent-slate-900"
            />
            <span className="text-xs font-mono text-slate-600 w-6">{drawSize}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setDrawSize(size)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  drawSize === size
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
                title={`${size}px`}
              >
                <span className="text-[10px] font-medium leading-none">{size}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
