/**
 * Circle Shape Component with text support
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { Group, Circle as KonvaCircle, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { CircleShape } from '@/types/canvas';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

interface CircleProps {
  data: CircleShape;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<CircleShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { radius?: number }) => void;
}

const CircleComponent = ({ data, isSelected, isDraggable = true, onSelect, onUpdate, onDragMove, onTransformMove }: CircleProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  
  // Track base radius at transform start to prevent compounding scale
  const baseRadiusRef = useRef<number | null>(null);
  
  const circleRadius = data.radius;

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, circleRadius, data.rotation]);

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
    onUpdate({ x: finalX, y: finalY });
  };

  const handleTransformStart = () => {
    baseRadiusRef.current = data.radius;
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (node && onTransformMove && baseRadiusRef.current !== null) {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const liveRadius = baseRadiusRef.current * Math.max(scaleX, scaleY);
      onTransformMove(data.id, node.x(), node.y(), node.rotation(), { radius: liveRadius });
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node || baseRadiusRef.current === null) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newRadius = Math.max(5, baseRadiusRef.current * Math.max(scaleX, scaleY));

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
    
    // Clear refs after all updates
    baseRadiusRef.current = null;

    onUpdate({
      radius: newRadius,
      x: finalX,
      y: finalY,
      rotation: finalRotation,
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

    const editorX = containerRect.left + stagePos.x + (curX - data.radius * 0.9) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY - data.radius * 0.55) * stageScale;
    const editorWidth = Math.max(90, data.radius * 1.8 * stageScale);
    const editorHeight = Math.max(42, data.radius * 1.1 * stageScale);

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
    const updateFontSize = () => {
      const fontSize = getAutoFitFontSize(
        textarea.value || ' ',
        textAreaWidth,
        textAreaHeight,
        resolvedTextFamily,
        { minSize: 12, maxSize: 44 }
      );
      textarea.style.fontSize = `${fontSize * stageScale}px`;
    };
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

    textarea.addEventListener('input', updateFontSize);
    updateFontSize();

    const cleanup = () => {
      textarea.removeEventListener('input', updateFontSize);
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

    const cancel = () => {
      cleanup();
    };

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

  const textAreaWidth = data.radius * 1.8;
  const textAreaHeight = data.radius * 1.1;
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const resolvedTextSize = useMemo(() => {
    const text = hasRealText ? data.text! : '';
    return getAutoFitFontSize(text || ' ', textAreaWidth, textAreaHeight, resolvedTextFamily, {
      minSize: 12,
      maxSize: 44,
    });
  }, [data.text, textAreaWidth, textAreaHeight, resolvedTextFamily, hasRealText]);
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type text' : '');

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
        <KonvaCircle
          x={0}
          y={0}
          radius={circleRadius}
          fill={data.fill}
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />

        {displayText && !isEditingText ? (
          <Text
            x={-data.radius * 0.9}
            y={-data.radius * 0.55}
            text={displayText}
            fontSize={resolvedTextSize}
            fontFamily={resolvedTextFamily}
            fill={hasRealText ? '#000000' : '#64748b'}
            opacity={hasRealText ? 1 : 0.55}
            align="center"
            verticalAlign="middle"
            listening={false}
            wrap="word"
            width={data.radius * 1.8}
            height={data.radius * 1.1}
            ellipsis={true}
          />
        ) : null}
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 10 || newBox.height < 10) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const Circle = CircleComponent;
