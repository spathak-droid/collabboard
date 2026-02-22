/**
 * Triangle Shape Component with text support
 */

'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { Group, Line, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { TriangleShape } from '@/types/canvas';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

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

  const textAreaWidth = data.width * 0.5;
  const textAreaHeight = data.height * 0.3;
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
    const rotation = groupRef.current?.rotation() ?? data.rotation ?? 0;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const localLeft = data.width * 0.25;
    const localTop = data.height * 0.6;
    const localW = data.width * 0.5;
    const localH = data.height * 0.3;
    const localCx = localLeft + localW / 2;
    const localCy = localTop + localH / 2;
    const stageCx = curX + localCx * cos - localCy * sin;
    const stageCy = curY + localCx * sin + localCy * cos;
    const editorWidth = Math.max(60, data.width * 0.5 * stageScale);
    const editorHeight = Math.max(32, data.height * 0.3 * stageScale);
    const screenCx = containerRect.left + stagePos.x + stageCx * stageScale;
    const screenCy = containerRect.top + stagePos.y + stageCy * stageScale;
    const editorX = screenCx - editorWidth / 2;
    const editorY = screenCy - editorHeight / 2;

    const textarea = document.createElement('textarea');
    textarea.id = 'inline-shape-editor';
    textarea.value = data.text ?? '';
    textarea.placeholder = 'Type text';
    textarea.style.position = 'fixed';
    textarea.style.left = `${editorX}px`;
    textarea.style.top = `${editorY}px`;
    textarea.style.transform = `rotate(${rotation}deg)`;
    textarea.style.transformOrigin = '50% 50%';
    textarea.style.width = `${editorWidth}px`;
    textarea.style.height = `${editorHeight}px`;
    textarea.style.paddingLeft = '0';
    textarea.style.paddingRight = '0';
    textarea.style.margin = '0';
    textarea.style.border = 'none';
    textarea.style.borderRadius = '0';
    textarea.style.background = 'transparent';
    textarea.style.color = '#111827';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'auto';
    textarea.style.wordBreak = 'break-word';
    textarea.style.overflowWrap = 'break-word';
    textarea.style.textAlign = 'center';
    const LINE_HEIGHT_MULTIPLIER = 1.25;
    const applyVerticalCenterPadding = () => {
      const fs = parseFloat(textarea.style.fontSize) || resolvedTextSize * stageScale;
      const lineHeightPx = fs * LINE_HEIGHT_MULTIPLIER;
      const padding = Math.max(0, (editorHeight - lineHeightPx) / 2);
      textarea.style.paddingTop = `${padding}px`;
      textarea.style.paddingBottom = `${padding}px`;
    };
    const updateFontSize = () => {
      const fontSize = getAutoFitFontSize(
        textarea.value || ' ',
        textAreaWidth,
        textAreaHeight,
        resolvedTextFamily,
        { minSize: 12, maxSize: 44 }
      );
      textarea.style.fontSize = `${fontSize * stageScale}px`;
      applyVerticalCenterPadding();
    };
    textarea.style.fontFamily = resolvedTextFamily;
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = String(LINE_HEIGHT_MULTIPLIER);
    textarea.style.zIndex = '10000';
    applyVerticalCenterPadding();

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
            x={data.width * 0.25}
            y={data.height * 0.6}
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
            height={data.height * 0.3}
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
