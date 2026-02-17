/**
 * Demo Canvas Page - Test MVP features without authentication
 */

'use client';

import { useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSelection } from '@/lib/hooks/useSelection';
import { generateId } from '@/lib/utils/geometry';
import { STICKY_COLORS } from '@/types/canvas';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape } from '@/types/canvas';

export default function DemoPage() {
  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  const { activeTool, setActiveTool, scale, position, snapToGrid, gridMode } = useCanvasStore();
  const { selectedIds, selectObject, deselectAll, isSelected } = useSelection();

  // Handle canvas click to create objects
  const handleCanvasClick = (e: any) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    
    if (!pointerPosition) return;
    
    // Transform pointer position to canvas coordinates
    const rawX = (pointerPosition.x - position.x) / scale;
    const rawY = (pointerPosition.y - position.y) / scale;
    const gridSpacing = gridMode === 'line' ? 40 : 24;
    const x = snapToGrid && gridMode !== 'none' ? Math.round(rawX / gridSpacing) * gridSpacing : rawX;
    const y = snapToGrid && gridMode !== 'none' ? Math.round(rawY / gridSpacing) * gridSpacing : rawY;
    
    // Check if clicking on background
    if (e.target === stage) {
      if (activeTool === 'sticky') {
        // Create sticky note
        const stickyNote: StickyNoteType = {
          id: generateId(),
          type: 'sticky',
          x,
          y,
          width: 200,
          height: 200,
          color: STICKY_COLORS.YELLOW,
          text: '',
          rotation: 0,
          zIndex: objects.length,
          createdBy: 'demo-user',
          createdAt: Date.now(),
        };
        
        setObjects([...objects, stickyNote]);
        setActiveTool('select');
      } else if (activeTool === 'rect') {
        // Create rectangle
        const rect: RectShape = {
          id: generateId(),
          type: 'rect',
          x,
          y,
          width: 150,
          height: 100,
          fill: STICKY_COLORS.BLUE,
          stroke: '#000000',
          strokeWidth: 2,
          rotation: 0,
          zIndex: objects.length,
          createdBy: 'demo-user',
          createdAt: Date.now(),
        };
        
        setObjects([...objects, rect]);
        setActiveTool('select');
      } else {
        // Deselect all when clicking background
        deselectAll();
      }
    }
  };

  const updateObject = (id: string, updates: Partial<WhiteboardObject>) => {
    setObjects(objects.map(obj => 
      obj.id === id ? { ...obj, ...updates } as WhiteboardObject : obj
    ));
  };

  const handleDelete = () => {
    if (selectedIds.length > 0) {
      setObjects(objects.filter(obj => !selectedIds.includes(obj.id)));
      deselectAll();
    }
  };

  return (
    <div className="w-full h-screen relative bg-gray-900">
      {/* Demo Banner */}
      <div className="fixed top-0 left-0 right-0 bg-blue-600 text-white py-2 px-4 text-center text-sm z-50">
        🎨 <strong>DEMO MODE</strong> - Testing MVP Feature #1: Infinite Canvas with Pan/Zoom
        <a href="/" className="ml-4 underline">Back to Home</a>
      </div>

      {/* Instructions */}
      <div className="fixed top-12 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-40">
        <h3 className="font-bold text-gray-900 mb-2">✅ MVP #1: Pan & Zoom</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>🖱️ <strong>Pan:</strong> Click & drag background</li>
          <li>🔍 <strong>Zoom:</strong> Mouse wheel (10%-500%)</li>
          <li>↩️ <strong>Reset:</strong> Double-click background</li>
          <li>📝 <strong>Add Sticky:</strong> Click sticky tool, then canvas</li>
          <li>▭ <strong>Add Rectangle:</strong> Click rect tool, then canvas</li>
          <li>🗑️ <strong>Delete:</strong> Select object, press Delete key</li>
        </ul>
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs text-gray-500">
            Current Zoom: <strong>{Math.round(scale * 100)}%</strong>
          </div>
          <div className="text-xs text-gray-500">
            Objects: <strong>{objects.length}</strong>
          </div>
        </div>
      </div>

      <Toolbar onDelete={handleDelete} />

      <Canvas 
        boardId="demo" 
        objects={objects}
        onClick={handleCanvasClick}
      >
        {objects.map((obj) => {
            if (obj.type === 'sticky') {
              return (
                <StickyNote
                  key={obj.id}
                  data={obj as StickyNoteType}
                  isSelected={isSelected(obj.id)}
                  onSelect={() => selectObject(obj.id)}
                  onUpdate={(updates) => updateObject(obj.id, updates)}
                />
              );
            }
            
            if (obj.type === 'rect') {
              return (
                <Rectangle
                  key={obj.id}
                  data={obj as RectShape}
                  isSelected={isSelected(obj.id)}
                  onSelect={() => selectObject(obj.id)}
                  onUpdate={(updates) => updateObject(obj.id, updates)}
                />
              );
            }
            
          return null;
        })}
      </Canvas>

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs">
        <div className="font-semibold mb-1">⌨️ Shortcuts:</div>
        <div className="text-gray-600">Delete/Backspace - Delete selected</div>
        <div className="text-gray-600">Scroll - Zoom in/out</div>
        <div className="text-gray-600">Click+Drag - Pan canvas</div>
      </div>
    </div>
  );
}
