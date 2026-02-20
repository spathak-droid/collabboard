/**
 * Zustand store for local canvas UI state (not synced via Yjs)
 */

import { create } from 'zustand';

export interface CanvasStore {
  // Selection
  selectedIds: string[];
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  
  // Canvas view
  scale: number;
  position: { x: number; y: number };
  setScale: (scale: number) => void;
  setPosition: (position: { x: number; y: number }) => void;
  resetView: () => void;
  
  // Active tool
  activeTool: 'select' | 'move' | 'sticky' | 'rect' | 'circle' | 'triangle' | 'star' | 'line' | 'textBubble' | 'text' | 'frame' | null;
  setActiveTool: (tool: CanvasStore['activeTool']) => void;

  // View settings
  gridMode: 'none' | 'line' | 'dot';
  setGridMode: (mode: CanvasStore['gridMode']) => void;
  snapToGrid: boolean;
  setSnapToGrid: (enabled: boolean) => void;
  
  // Drag-to-select rectangle
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  setSelectionRect: (rect: CanvasStore['selectionRect']) => void;
}

export type ActiveTool = CanvasStore['activeTool'];

export const useCanvasStore = create<CanvasStore>((set) => ({
  // Selection
  selectedIds: [],
  setSelected: (ids) => {
    set({ selectedIds: ids });
  },
  toggleSelected: (id) =>
    set((state) => {
      const isSelected = state.selectedIds.includes(id);
      const nextIds = isSelected
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id];
      return { selectedIds: nextIds };
    }),
  clearSelection: () => {
    set({ selectedIds: [] });
  },
  
  // Canvas view
  scale: 1,
  position: { x: 0, y: 0 },
  setScale: (scale) => {
    // Validate scale is a valid number
    const safeScale = typeof scale === 'number' && !isNaN(scale) && isFinite(scale) 
      ? Math.max(0.1, Math.min(5, scale)) 
      : 1;
    set({ scale: safeScale });
  },
  setPosition: (position) => set({ position }),
  resetView: () => set({ scale: 1, position: { x: 0, y: 0 } }),
  
  // Active tool
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  // View settings
  gridMode: 'line',
  setGridMode: (mode) => set({ gridMode: mode }),
  snapToGrid: false,
  setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),
  
  // Drag-to-select rectangle
  selectionRect: null,
  setSelectionRect: (rect) => set({ selectionRect: rect }),
}));
