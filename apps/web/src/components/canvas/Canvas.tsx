/**
 * Main Canvas Component with infinite pan/zoom
 * TDD approach - tests first
 */

'use client';

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import { useCanvasStore } from '@/lib/store/canvas';
import { Grid } from './Grid';

interface CanvasProps {
  boardId: string;
  objects?: any[];
  children?: React.ReactNode;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseMove?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onObjectDragStart?: () => void;
  onObjectDragEnd?: () => void;
  theme?: 'light' | 'dark';
}

const CanvasComponent = ({ boardId, objects = [], children, onClick, onMouseMove, onObjectDragStart, onObjectDragEnd, theme = 'light' }: CanvasProps) => {
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastPinchDistance = useRef<number | null>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  
  const { scale, position, setScale, setPosition, resetView, gridMode } = useCanvasStore();
  const isInlineEditing = () => typeof document !== 'undefined' && !!document.getElementById('inline-shape-editor');
  
  // Set canvas dimensions
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Prevent browser back/forward swipe gestures
  useEffect(() => {
    const preventSwipeNavigation = (e: WheelEvent) => {
      // Prevent horizontal swipe navigation
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
      }
    };
    
    const preventTouchNavigation = (e: TouchEvent) => {
      // Prevent touch-based navigation
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };
    
    // Add listeners to prevent browser navigation
    document.addEventListener('wheel', preventSwipeNavigation, { passive: false });
    document.addEventListener('touchmove', preventTouchNavigation, { passive: false });
    
    return () => {
      document.removeEventListener('wheel', preventSwipeNavigation);
      document.removeEventListener('touchmove', preventTouchNavigation);
    };
  }, []);
  
  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      if (isInlineEditing()) return;
      
      const stage = stageRef.current;
      if (!stage) return;
      
      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      
      // Detect if this is a pinch gesture (smooth, continuous zooming)
      const isPinch = e.evt.ctrlKey;
      
      // Calculate zoom factor
      let scaleBy;
      if (isPinch) {
        // Trackpad pinch - smoother, more precise
        scaleBy = 1 - e.evt.deltaY * 0.01;
      } else {
        // Mouse wheel or two-finger scroll - zoom based on direction
        scaleBy = e.evt.deltaY < 0 ? 1.05 : 0.95;
      }
      
      const newScale = Math.max(0.1, Math.min(5, oldScale * scaleBy));
      
      // Calculate new position to zoom toward cursor
      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / oldScale,
      };
      
      const newPosition = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      
      setScale(newScale);
      setPosition(newPosition);
    },
    [scale, position, setScale, setPosition]
  );
  
  // Handle double-click to reset view
  const handleDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isInlineEditing()) return;
      // Only reset if clicking on background (not on objects)
      if (e.target === e.target.getStage()) {
        resetView();
      }
    },
    [resetView]
  );
  
  // Handle mouse down for manual panning
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    // Only start panning if clicking on the stage background
    if (e.target === e.target.getStage()) {
      isPanning.current = true;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (pos) {
        lastMousePos.current = { x: pos.x, y: pos.y };
        dragStartPos.current = { x: pos.x, y: pos.y };
      }
    }
  }, []);
  
  // Handle mouse move for manual panning
  const handleMouseMoveInternal = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    if (isPanning.current) {
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (pos) {
        const dx = pos.x - lastMousePos.current.x;
        const dy = pos.y - lastMousePos.current.y;
        
        setPosition({
          x: position.x + dx,
          y: position.y + dy,
        });
        
        lastMousePos.current = { x: pos.x, y: pos.y };
      }
    }
    
    // Call the prop onMouseMove if provided
    if (onMouseMove) {
      onMouseMove(e);
    }
  }, [position, setPosition, onMouseMove]);
  
  // Handle mouse up to stop panning
  const handleMouseUp = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    if (isPanning.current) {
      // Check if we actually panned (moved more than 5 pixels)
      const stage = stageRef.current;
      const pos = stage?.getPointerPosition();
      if (pos) {
        const dx = Math.abs(pos.x - dragStartPos.current.x);
        const dy = Math.abs(pos.y - dragStartPos.current.y);
        setIsDragging(dx > 5 || dy > 5);
      }
    }
    isPanning.current = false;
    setTimeout(() => setIsDragging(false), 50);
  }, []);
  
  // Handle click event - only fire if not dragging or panning
  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isInlineEditing()) return;
      // Don't trigger click if we were dragging or panning
      if (isDragging || isPanning.current) {
        return;
      }
      
      if (onClick) {
        onClick(e);
      }
    },
    [isDragging, onClick]
  );
  
  // Handle drag start - track position to detect actual drag vs click
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) {
      dragStartPos.current = { x: pos.x, y: pos.y };
    }
  }, []);
  
  // Handle drag end (update position)
  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const pos = e.target.getStage()?.getPointerPosition();
      
      // Check if we actually dragged (moved more than 5 pixels)
      if (pos) {
        const dx = Math.abs(pos.x - dragStartPos.current.x);
        const dy = Math.abs(pos.y - dragStartPos.current.y);
        const didDrag = dx > 5 || dy > 5;
        setIsDragging(didDrag);
      }
      
      setPosition({
        x: e.target.x(),
        y: e.target.y(),
      });
      
      // Reset dragging flag after a short delay
      setTimeout(() => setIsDragging(false), 100);
    },
    [setPosition]
  );
  
  return (
    <div 
      className="w-full h-screen overflow-hidden"
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        draggable={false}
        onWheel={handleWheel}
        onDblClick={handleDblClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveInternal}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        className={theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}
        listening={true}
        perfectDrawEnabled={false}
      >
        <Layer listening={true} perfectDrawEnabled={false}>
          {/* Multi-level grid */}
          <Grid 
            scale={scale}
            position={position}
            width={dimensions.width}
            height={dimensions.height}
            theme={theme}
            gridMode={gridMode}
          />
          
          {/* Canvas objects will be rendered here */}
          {children}
        </Layer>
      </Stage>
    </div>
  );
};

export const Canvas = memo(CanvasComponent);
