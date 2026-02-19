/**
 * Frame Component - Container for grouping objects
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import { Group, Rect, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { Frame as FrameType } from '@/types/canvas';

interface FrameProps {
  data: FrameType;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<FrameType>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

export const Frame = ({
  data,
  isSelected,
  isDraggable = true,
  onSelect,
  onUpdate,
  onDragMove,
  onTransformMove,
}: FrameProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameText, setNameText] = useState(data.name || 'frame1');
  const textRef = useRef<Konva.Text>(null);
  
  // Update name text when data.name changes
  useEffect(() => {
    setNameText(data.name || 'frame1');
  }, [data.name]);

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.width, data.height, data.rotation]);

  const handleDragStart = () => {
    window.dispatchEvent(new Event('object-drag-start'));
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(data.id, e.target.x(), e.target.y());
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const finalX = e.target.x();
    const finalY = e.target.y();
    window.dispatchEvent(new Event('object-drag-end'));
    onUpdate({
      x: finalX,
      y: finalY,
      modifiedAt: Date.now(),
    });
  };

  const handleTransformStart = () => {
    baseDimensionsRef.current = { width: data.width, height: data.height };
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (node && onTransformMove && baseDimensionsRef.current) {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const liveWidth = baseDimensionsRef.current.width * scaleX;
      const liveHeight = baseDimensionsRef.current.height * scaleY;
      onTransformMove(data.id, node.x(), node.y(), node.rotation(), { width: liveWidth, height: liveHeight });
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newWidth = Math.max(50, baseDimensionsRef.current.width * scaleX);
    const newHeight = Math.max(50, baseDimensionsRef.current.height * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    const finalX = node.x();
    const finalY = node.y();
    const finalRotation = node.rotation();

    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }

    window.dispatchEvent(new Event('object-transform-end'));
    baseDimensionsRef.current = null;

    onUpdate({
      x: finalX,
      y: finalY,
      width: newWidth,
      height: newHeight,
      rotation: finalRotation,
      modifiedAt: Date.now(),
    });
  };

  const handleNameDoubleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    
    const existingEditor = document.getElementById('inline-frame-name-editor');
    if (existingEditor) {
      (existingEditor as HTMLInputElement).focus();
      return;
    }

    const stage = groupRef.current?.getStage();
    if (!stage) return;

    const containerRect = stage.container().getBoundingClientRect();
    const stagePos = stage.position();
    const stageScale = stage.scaleX();

    const curX = groupRef.current?.x() ?? data.x;
    const curY = groupRef.current?.y() ?? data.y;

    // Calculate position accounting for rotation
    const cos = Math.cos((data.rotation * Math.PI) / 180);
    const sin = Math.sin((data.rotation * Math.PI) / 180);
    const rotatedX = curX + 8 * cos + 18 * sin;
    const rotatedY = curY + 8 * sin - 18 * cos;
    
    const editorX = containerRect.left + stagePos.x + rotatedX * stageScale;
    const editorY = containerRect.top + stagePos.y + rotatedY * stageScale;
    const editorWidth = Math.max(100, (nameText.length + 5) * 8 * stageScale);
    const editorHeight = 20 * stageScale;

    const input = document.createElement('input');
    input.id = 'inline-frame-name-editor';
    input.type = 'text';
    input.value = nameText;
    input.style.position = 'fixed';
    input.style.left = `${editorX}px`;
    input.style.top = `${editorY}px`;
    input.style.width = `${editorWidth}px`;
    input.style.height = `${editorHeight}px`;
    input.style.padding = '2px 6px';
    input.style.margin = '0';
    input.style.border = '1px solid #3b82f6';
    input.style.borderRadius = '2px';
    input.style.background = 'white';
    input.style.color = '#3b82f6';
    input.style.outline = 'none';
    input.style.boxShadow = 'none';
    input.style.fontFamily = 'Inter, sans-serif';
    input.style.fontSize = `${14 * stageScale}px`;
    input.style.fontWeight = 'bold';
    input.style.zIndex = '10000';

    document.body.appendChild(input);
    setIsEditingName(true);
    input.focus();
    input.select();

    const cleanup = () => {
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onOutsideClick);
      if (input.parentNode) input.parentNode.removeChild(input);
      setIsEditingName(false);
    };
    
    const save = () => {
      const newName = input.value.trim() || 'frame1';
      setNameText(newName);
      onUpdate({
        name: newName,
        modifiedAt: Date.now(),
      });
      cleanup();
    };
    
    const cancel = () => {
      cleanup();
    };
    
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
      }
    };
    
    const onBlur = () => save();
    const onOutsideClick = (event: MouseEvent) => {
      if (event.target !== input) save();
    };

    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur);
    window.setTimeout(() => {
      window.addEventListener('mousedown', onOutsideClick);
    }, 0);
  };

  return (
    <>
      <Group
        ref={groupRef}
        id={data.id}
        x={data.x}
        y={data.y}
        rotation={data.rotation}
        draggable={isDraggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformStart={handleTransformStart}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        <Rect
          width={data.width}
          height={data.height}
          fill={data.fill || '#FFFFFF'}
          stroke={data.stroke || '#3b82f6'}
          strokeWidth={data.strokeWidth ?? 2}
          dash={[8, 4]}
          cornerRadius={4}
          perfectDrawEnabled={false}
        />
        {/* Frame name at the top */}
        <Text
          ref={textRef}
          x={8}
          y={-18}
          text={nameText}
          fontSize={14}
          fontFamily="Inter, sans-serif"
          fill="#3b82f6"
          fontStyle="bold"
          rotation={0}
          offsetX={0}
          offsetY={0}
          onDblClick={handleNameDoubleClick}
          onClick={(e) => {
            e.cancelBubble = true;
          }}
          perfectDrawEnabled={false}
        />
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          keepRatio={false}
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'top-center',
            'middle-right',
            'bottom-center',
            'middle-left',
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};
