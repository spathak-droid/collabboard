/**
 * Triangle Shape Component with text support
 */

'use client';

import { useRef, useEffect, useState } from 'react';
import { Group, Line, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { TriangleShape } from '@/types/canvas';

interface TriangleProps {
  data: TriangleShape;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<TriangleShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const TriangleComponent = ({ data, isSelected, isDraggable = true, onSelect, onUpdate, onDragMove, onTransformMove }: TriangleProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.width, data.height, data.rotation]);

  const resolvedTextSize = Math.max(12, Math.min(data.textSize ?? 16, 44, Math.min(data.width, data.height) * 0.35));
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type text' : '');

  const handleDragStart = () => {
    window.dispatchEvent(new Event('object-drag-start'));
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(data.id, e.target.x(), e.target.y());
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    window.dispatchEvent(new Event('object-drag-end'));
    onUpdate({ x: e.target.x(), y: e.target.y() });
  };

  const handleTransformStart = () => {
    baseDimensionsRef.current = { width: data.width, height: data.height };
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current || !onTransformMove) return;
    onTransformMove(data.id, node.x(), node.y(), node.rotation(), {
      width: baseDimensionsRef.current.width * node.scaleX(),
      height: baseDimensionsRef.current.height * node.scaleY(),
    });
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current) return;

    const newWidth = Math.max(30, baseDimensionsRef.current.width * node.scaleX());
    const newHeight = Math.max(30, baseDimensionsRef.current.height * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);

    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }

    window.dispatchEvent(new Event('object-transform-end'));
    baseDimensionsRef.current = null;
    onUpdate({
      width: newWidth,
      height: newHeight,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
    });
  };

  const handleTextEdit = () => {
    const existingEditor = document.getElementById('inline-shape-editor');
    if (existingEditor) {
      (existingEditor as HTMLTextAreaElement).focus();
      return;
    }

    const stage = groupRef.current?.getStage();
    if (!stage) return;
    const containerRect = stage.container().getBoundingClientRect();
    const stagePos = stage.position();
    const stageScale = stage.scaleX();

    const curX = groupRef.current?.x() ?? data.x;
    const curY = groupRef.current?.y() ?? data.y;

    const editorX = containerRect.left + stagePos.x + (curX + data.width * 0.1) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY + data.height * 0.35) * stageScale;
    const editorWidth = Math.max(80, data.width * 0.8 * stageScale);
    const editorHeight = Math.max(36, data.height * 0.45 * stageScale);

    const textarea = document.createElement('textarea');
    textarea.id = 'inline-shape-editor';
    textarea.value = data.text ?? '';
    textarea.placeholder = 'Type text';
    textarea.style.position = 'fixed';
    textarea.style.left = `${editorX}px`;
    textarea.style.top = `${editorY}px`;
    textarea.style.width = `${editorWidth}px`;
    textarea.style.height = `${editorHeight}px`;
    textarea.style.padding = '0';
    textarea.style.margin = '0';
    textarea.style.border = 'none';
    textarea.style.borderRadius = '0';
    textarea.style.background = 'transparent';
    textarea.style.color = '#111827';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.fontFamily = resolvedTextFamily;
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = '1.25';
    textarea.style.textAlign = 'center';
    textarea.style.zIndex = '10000';

    document.body.appendChild(textarea);
    setIsEditingText(true);
    textarea.focus();
    const textEnd = textarea.value.length;
    textarea.setSelectionRange(textEnd, textEnd);

    const cleanup = () => {
      textarea.removeEventListener('keydown', onKeyDown);
      textarea.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onOutsideClick);
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      setIsEditingText(false);
    };
    const save = () => {
      onUpdate({ text: textarea.value });
      cleanup();
    };
    const cancel = () => cleanup();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        save();
      }
    };
    const onBlur = () => save();
    const onOutsideClick = (event: MouseEvent) => {
      if (event.target !== textarea) save();
    };

    textarea.addEventListener('keydown', onKeyDown);
    textarea.addEventListener('blur', onBlur);
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
        onDblClick={handleTextEdit}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformStart={handleTransformStart}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        <Line
          points={[data.width / 2, 0, data.width, data.height, 0, data.height]}
          closed
          fill={data.fill}
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />

        {displayText && !isEditingText ? (
          <Text
            x={data.width * 0.1}
            y={data.height * 0.35}
            text={displayText}
            fontSize={resolvedTextSize}
            fontFamily={resolvedTextFamily}
            fill={hasRealText ? '#000000' : '#64748b'}
            opacity={hasRealText ? 1 : 0.55}
            align="center"
            verticalAlign="middle"
            listening={false}
            wrap="word"
            width={data.width * 0.8}
            height={data.height * 0.5}
            ellipsis
          />
        ) : null}
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 30 || newBox.height < 30) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const Triangle = TriangleComponent;
