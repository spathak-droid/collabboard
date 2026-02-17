/**
 * Canvas Page - Demo/Quick Start Canvas
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { signOut } from '@/lib/firebase/auth';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { StickyNote } from '@/components/canvas/objects/StickyNote';
import { Rectangle } from '@/components/canvas/objects/Rectangle';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSelection } from '@/lib/hooks/useSelection';
import { generateId } from '@/lib/utils/geometry';
import { STICKY_COLORS } from '@/types/canvas';
import type { WhiteboardObject, StickyNote as StickyNoteType, RectShape } from '@/types/canvas';

export default function DemoCanvasPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  
  const { activeTool, setActiveTool, scale, position, snapToGrid, gridMode } = useCanvasStore();
  const { selectedIds, selectObject, deselectAll, isSelected } = useSelection();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);
  
  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };
  
  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };
  
  // Handle canvas click to create objects
  const handleCanvasClick = useCallback(
    (e: any) => {
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
            createdBy: user?.uid || 'demo-user',
            createdAt: Date.now(),
          };
          
          setObjects([...objects, stickyNote]);
          setActiveTool('select');
        } else if (activeTool === 'rect') {
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
            createdBy: user?.uid || 'demo-user',
            createdAt: Date.now(),
          };
          
          setObjects([...objects, rect]);
          setActiveTool('select');
        } else {
          deselectAll();
        }
      }
    },
    [activeTool, objects.length, user, position, scale, snapToGrid, gridMode, setActiveTool, deselectAll]
  );

  const updateObject = (id: string, updates: Partial<WhiteboardObject>) => {
    setObjects(objects.map(obj => 
      obj.id === id ? { ...obj, ...updates } as WhiteboardObject : obj
    ));
  };

  const handleDelete = useCallback(() => {
    if (selectedIds.length > 0) {
      setObjects(objects.filter(obj => !selectedIds.includes(obj.id)));
      deselectAll();
    }
  }, [selectedIds, deselectAll, objects]);
  
  // Handle delete key (only Delete, not Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete') {
        if (selectedIds.length > 0) {
          setObjects(prev => prev.filter(obj => !selectedIds.includes(obj.id)));
          deselectAll();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, deselectAll]);
  
  if (authLoading || !user) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen relative" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      {/* Top Header Bar */}
      <div className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 py-2.5 px-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToDashboard}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="text-lg font-bold text-gray-900">Untitled Board</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500">
            Zoom: <strong>{Math.round(scale * 100)}%</strong>
          </div>
          <span className="text-gray-300">|</span>
          <div className="text-xs text-gray-500">
            Objects: <strong>{objects.length}</strong>
          </div>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-600">{user.displayName || user.email}</span>
        </div>
      </div>

      <Toolbar onDelete={handleDelete} selectedCount={selectedIds.length} />

      <Canvas 
        boardId="demo-canvas" 
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
      <div className="fixed bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs z-30">
        <div className="font-semibold mb-1 text-gray-900">⌨️ Controls:</div>
        <div className="text-gray-600">Delete key - Delete selected</div>
        <div className="text-gray-600">Scroll/Swipe - Zoom in/out</div>
        <div className="text-gray-600">Click+Drag - Pan canvas</div>
      </div>
    </div>
  );
}
