/**
 * Star Shape Component with text support
 */

'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { Group, Star as KonvaStar, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { StarShape } from '@/types/canvas';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

interface StarProps {
  data: StarShape;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<StarShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const StarComponent = ({ data, isSelected, isDraggable = true, onSelect, onUpdate, onDragMove, onTransformMove }: StarProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  const outerRadius = Math.max(20, Math.min(data.width, data.height) / 2);
  const innerRadius = outerRadius * 0.45;
  const textAreaWidth = data.width * 0.5;
  const textAreaHeight = data.height * 0.35;
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const resolvedTextSize = useMemo(() => {
    const text = hasRealText ? data.text! : '';
    return getAutoFitFontSize(text || ' ', textAreaWidth, textAreaHeight, resolvedTextFamily, {
      minSize: 12,
      maxSize: 40,
    });
  }, [data.text, textAreaWidth, textAreaHeight, resolvedTextFamily, hasRealText]);
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type text' : '');

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.width, data.height, data.rotation]);

  const handleDragStart = () => window.dispatchEvent(new Event('object-drag-start'));
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
    const newWidth = Math.max(40, baseDimensionsRef.current.width * node.scaleX());
    const newHeight = Math.max(40, baseDimensionsRef.current.height * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }
    window.dispatchEvent(new Event('object-transform-end'));
    baseDimensionsRef.current = null;
    onUpdate({ width: newWidth, height: newHeight, x: node.x(), y: node.y(), rotation: node.rotation() });
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

    const editorX = containerRect.left + stagePos.x + (curX + data.width * 0.25) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY + data.height * 0.35) * stageScale;
    const editorWidth = Math.max(80, data.width * 0.5 * stageScale);
    const editorHeight = Math.max(36, data.height * 0.35 * stageScale);

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
        { minSize: 12, maxSize: 40 }
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
        <KonvaStar
          x={data.width / 2}
          y={data.height / 2}
          numPoints={5}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          fill={data.fill}
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />

        {displayText && !isEditingText ? (
          <Text
            x={data.width * 0.25}
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
            width={data.width * 0.5}
            height={data.height * 0.35}
            ellipsis
          />
        ) : null}
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 40 || newBox.height < 40) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const Star = StarComponent;
