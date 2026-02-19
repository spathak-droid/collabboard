/**
 * Rectangle Shape Component with text support
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { Group, Rect, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { RectShape } from '@/types/canvas';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

interface RectangleProps {
  data: RectShape;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<RectShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const RectangleComponent = ({ data, isSelected, isDraggable = true, onSelect, onUpdate, onDragMove, onTransformMove }: RectangleProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  
  // Track base dimensions at transform start to prevent compounding scale
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  
  const rectWidth = data.width;
  const rectHeight = data.height;

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, rectWidth, rectHeight, data.rotation]);

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
    const newWidth = Math.max(20, baseDimensionsRef.current.width * scaleX);
    const newHeight = Math.max(20, baseDimensionsRef.current.height * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    const finalX = node.x();
    const finalY = node.y();
    const finalRotation = node.rotation();

    // Force Transformer to recalculate bounding box
    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }

    window.dispatchEvent(new Event('object-transform-end'));
    
    // Clear refs after all updates
    baseDimensionsRef.current = null;

    onUpdate({
      width: newWidth,
      height: newHeight,
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

    const editorX = containerRect.left + stagePos.x + (curX + data.width * 0.05) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY + data.height * 0.1) * stageScale;
    const editorWidth = Math.max(90, data.width * 0.9 * stageScale);
    const editorHeight = Math.max(42, data.height * 0.8 * stageScale);

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
        { minSize: 12, maxSize: 48 }
      );
      textarea.style.fontSize = `${fontSize * stageScale}px`;
    };
    textarea.style.fontFamily = resolvedTextFamily;
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = '1.25';
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

  const textAreaWidth = data.width * 0.9;
  const textAreaHeight = data.height * 0.8;
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const resolvedTextSize = useMemo(() => {
    const text = hasRealText ? data.text! : '';
    return getAutoFitFontSize(text || ' ', textAreaWidth, textAreaHeight, resolvedTextFamily, {
      minSize: 12,
      maxSize: 48,
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
        <Rect
          x={0}
          y={0}
          width={rectWidth}
          height={rectHeight}
          fill={data.fill}
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
        />

        {displayText && !isEditingText ? (
          <Text
            x={data.width * 0.05}
            y={data.height * 0.1}
            text={displayText}
            fontSize={resolvedTextSize}
            fontFamily={resolvedTextFamily}
            fill={hasRealText ? '#000000' : '#64748b'}
            opacity={hasRealText ? 1 : 0.55}
            align="center"
            verticalAlign="middle"
            listening={false}
            wrap="word"
            width={data.width * 0.9}
            height={data.height * 0.8}
            ellipsis={true}
          />
        ) : null}
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const Rectangle = RectangleComponent;
