/**
 * Main Canvas Component with infinite pan/zoom
 * TDD approach - tests first
 */

'use client';

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { Stage, Layer, Rect as KonvaRect } from 'react-konva';
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
  stageRef?: React.RefObject<Konva.Stage>;
}

const CanvasComponent = ({ boardId, objects = [], children, onClick, onMouseMove, onObjectDragStart, onObjectDragEnd, theme = 'light', stageRef: externalStageRef }: CanvasProps) => {
  const internalStageRef = useRef<Konva.Stage>(null);
  const stageRef = externalStageRef || internalStageRef;
  // Initialize dimensions immediately to prevent loading state
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1920, height: 1080 }; // Fallback for SSR
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const panStartPos = useRef({ x: 0, y: 0 });
  const isSelecting = useRef(false);
  
  const { scale, position, setScale, setPosition, resetView, gridMode, activeTool, selectionRect, setSelectionRect } = useCanvasStore();
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
  
  // Handle wheel zoom and two-finger pan
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      if (isInlineEditing()) return;
      
      const stage = stageRef.current;
      if (!stage) return;
      
      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      
      // Detect if this is a pinch gesture (smooth, continuous zooming with Ctrl key)
      const isPinch = e.evt.ctrlKey;
      
      // Detect two-finger pan (deltaX or deltaY without Ctrl, not using mouse wheel)
      const isTwoFingerPan = !e.evt.ctrlKey && (Math.abs(e.evt.deltaX) > 0 || Math.abs(e.evt.deltaY) > 0);
      
      if (isTwoFingerPan) {
        // Two-finger pan (trackpad swipe)
        setPosition({
          x: position.x - e.evt.deltaX,
          y: position.y - e.evt.deltaY,
        });
      } else if (isPinch) {
        // Trackpad pinch zoom - smoother, more precise
        const scaleBy = 1 - e.evt.deltaY * 0.01;
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
      }
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
  
  // Handle mouse down - start selection rectangle or panning
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos || !stage) return;
    
    // Start panning if move tool is active and clicking on stage background
    if (activeTool === 'move' && e.target === stage) {
      setIsPanning(true);
      panStartPos.current = { x: pos.x, y: pos.y };
      return;
    }
    
    // Start selection if clicking on stage background and activeTool is 'select' or 'frame'
    if (e.target === stage && (activeTool === 'select' || activeTool === 'frame')) {
      isSelecting.current = true;
      // Convert screen coordinates to canvas coordinates
      const canvasX = (pos.x - position.x) / scale;
      const canvasY = (pos.y - position.y) / scale;
      dragStartPos.current = { x: canvasX, y: canvasY };
      
      // Initialize selection rectangle
      setSelectionRect({
        x: canvasX,
        y: canvasY,
        width: 0,
        height: 0,
      });
    }
  }, [activeTool, position, scale, setSelectionRect]);
  
  // Handle mouse move - update selection rectangle or pan canvas
  const handleMouseMoveInternal = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos || !stage) return;
    
    // Handle panning when move tool is active
    if (isPanning && activeTool === 'move') {
      const deltaX = pos.x - panStartPos.current.x;
      const deltaY = pos.y - panStartPos.current.y;
      setPosition({
        x: position.x + deltaX,
        y: position.y + deltaY,
      });
      panStartPos.current = { x: pos.x, y: pos.y };
      return;
    }
    
    // Update selection rectangle if selecting
    if (isSelecting.current) {
      // Convert screen coordinates to canvas coordinates
      const canvasX = (pos.x - position.x) / scale;
      const canvasY = (pos.y - position.y) / scale;
      
      // Update selection rectangle
      setSelectionRect({
        x: Math.min(dragStartPos.current.x, canvasX),
        y: Math.min(dragStartPos.current.y, canvasY),
        width: Math.abs(canvasX - dragStartPos.current.x),
        height: Math.abs(canvasY - dragStartPos.current.y),
      });
    }
    
    // Call the prop onMouseMove if provided (for selection, etc.)
    if (onMouseMove) {
      onMouseMove(e);
    }
  }, [isPanning, activeTool, position, setPosition, scale, setSelectionRect, onMouseMove]);
  
  // Handle mouse up - finalize selection or panning
  const handleMouseUp = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isInlineEditing()) return;
    
    // Stop panning
    if (isPanning) {
      setIsPanning(false);
    }
    
    if (isSelecting.current) {
      isSelecting.current = false;
      // Clear selectionRect to trigger frame creation in parent
      setSelectionRect(null);
    }
    
    setIsDragging(false);
  }, [isPanning, setSelectionRect]);
  
  // Handle click event
  const handleClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isInlineEditing()) return;
      // Don't trigger click if we were dragging
      if (isDragging) {
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
  
  // Set cursor style based on active tool and panning state
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    
    const container = stage.container();
    if (!container) return;
    
    if (activeTool === 'move') {
      // Show grabbing hand when panning, hand pointer when not
      container.style.cursor = isPanning ? 'grabbing' : 'grab';
    } else if (!activeTool || activeTool === 'select') {
      container.style.cursor = 'default';
    } else {
      // For drawing tools (sticky, rect, circle, triangle, star, line, textBubble, frame), use crosshair
      container.style.cursor = 'crosshair';
    }
  }, [activeTool, isPanning, stageRef]);

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
          
          {/* Selection rectangle */}
          {selectionRect && (
            <KonvaRect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="#3b82f6"
              strokeWidth={2 / scale}
              dash={[10 / scale, 5 / scale]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
};

export const Canvas = memo(CanvasComponent);
