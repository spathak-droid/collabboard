/**
 * Text Bubble Component - message bubble shape with editable text
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useRef, useEffect, useState, memo } from 'react';
import { Group, Shape, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { TextBubbleShape } from '@/types/canvas';

interface TextBubbleProps {
  data: TextBubbleShape;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<TextBubbleShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
}

const TAIL_HEIGHT_RATIO = 0.12;
const BUBBLE_RADIUS = 16;

const TextBubbleComponent = ({
  data,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
}: TextBubbleProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);

  const localPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const committedPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);

  useEffect(() => {
    if (committedPosRef.current) {
      const c = committedPosRef.current;
      if (Math.abs(data.x - c.x) < 1 && Math.abs(data.y - c.y) < 1) {
        localPosRef.current = null;
        committedPosRef.current = null;
      }
    }
  }, [data.x, data.y, data.rotation]);

  const renderX = localPosRef.current?.x ?? data.x;
  const renderY = localPosRef.current?.y ?? data.y;
  const renderRotation = localPosRef.current?.rotation ?? data.rotation;

  const totalWidth = data.width;
  const totalHeight = data.height;
  const tailHeight = Math.max(8, Math.min(totalHeight * TAIL_HEIGHT_RATIO, 20));
  const bodyHeight = totalHeight - tailHeight;

  const resolvedTextSize = Math.max(
    12,
    Math.min(data.textSize ?? 16, 48, bodyHeight * 0.4)
  );
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type here...' : '');

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, totalWidth, totalHeight, data.x, data.y, data.rotation]);

  const handleDragStart = () => {
    const node = groupRef.current;
    if (node) {
      localPosRef.current = { x: node.x(), y: node.y(), rotation: node.rotation() };
    }
    window.dispatchEvent(new Event('object-drag-start'));
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    localPosRef.current = {
      x: e.target.x(),
      y: e.target.y(),
      rotation: localPosRef.current?.rotation ?? data.rotation,
    };
    onDragMove?.(data.id, e.target.x(), e.target.y());
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const finalX = e.target.x();
    const finalY = e.target.y();
    localPosRef.current = { x: finalX, y: finalY, rotation: localPosRef.current?.rotation ?? data.rotation };
    committedPosRef.current = { x: finalX, y: finalY, rotation: localPosRef.current.rotation };
    window.dispatchEvent(new Event('object-drag-end'));
    onUpdate({ x: finalX, y: finalY });
  };

  const handleTransformStart = () => {
    const node = groupRef.current;
    if (node) {
      localPosRef.current = { x: node.x(), y: node.y(), rotation: node.rotation() };
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth = Math.max(80, data.width * scaleX);
    const newHeight = Math.max(60, data.height * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    // Update child Shape dimensions imperatively
    const shapeNode = node.findOne('Shape');
    if (shapeNode) {
      shapeNode.width(newWidth);
      shapeNode.height(newHeight);
    }

    const finalX = node.x();
    const finalY = node.y();
    const finalRotation = node.rotation();

    localPosRef.current = { x: finalX, y: finalY, rotation: finalRotation };
    committedPosRef.current = { x: finalX, y: finalY, rotation: finalRotation };

    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }

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

    const padding = 12;
    const editorX = containerRect.left + stagePos.x + (curX + padding) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY + padding) * stageScale;
    const editorWidth = Math.max(60, (totalWidth - padding * 2) * stageScale);
    const editorHeight = Math.max(30, (bodyHeight - padding * 2) * stageScale);

    const textarea = document.createElement('textarea');
    textarea.id = 'inline-shape-editor';
    textarea.value = data.text ?? '';
    textarea.placeholder = 'Type here...';
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
    textarea.style.color = '#1e293b';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.fontFamily = resolvedTextFamily;
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = '1.35';
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

  return (
    <>
      <Group
        ref={groupRef}
        x={renderX}
        y={renderY}
        rotation={renderRotation}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleTextEdit}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformStart={handleTransformStart}
        onTransformEnd={handleTransformEnd}
      >
        <Shape
          width={totalWidth}
          height={totalHeight}
          sceneFunc={(context, shape) => {
            const w = shape.width();
            const h = shape.height();
            const th = Math.max(8, Math.min(h * TAIL_HEIGHT_RATIO, 20));
            const bh = h - th;
            const r = Math.min(BUBBLE_RADIUS, bh / 2, w / 2);
            const tw = Math.max(10, Math.min(w * 0.08, 18));

            context.beginPath();
            context.moveTo(r, 0);
            context.lineTo(w - r, 0);
            context.arcTo(w, 0, w, r, r);
            context.lineTo(w, bh - r);
            context.arcTo(w, bh, w - r, bh, r);
            context.lineTo(tw + tw * 0.8, bh);
            context.lineTo(tw * 0.4, bh + th);
            context.lineTo(tw * 0.7, bh);
            context.lineTo(r, bh);
            context.arcTo(0, bh, 0, bh - r, r);
            context.lineTo(0, r);
            context.arcTo(0, 0, r, 0, r);
            context.closePath();

            context.fillStrokeShape(shape);
          }}
          fill="#ffffff"
          stroke="#94a3b8"
          strokeWidth={1.5}
          shadowColor="rgba(0,0,0,0.06)"
          shadowBlur={8}
          shadowOffsetY={2}
          perfectDrawEnabled={false}
        />

        {displayText && !isEditingText ? (
          <Text
            x={12}
            y={12}
            text={displayText}
            fontSize={resolvedTextSize}
            fontFamily={resolvedTextFamily}
            fill={hasRealText ? '#1e293b' : '#94a3b8'}
            opacity={hasRealText ? 1 : 0.6}
            align="left"
            verticalAlign="top"
            listening={false}
            wrap="word"
            width={totalWidth - 24}
            height={bodyHeight - 24}
            ellipsis={true}
            lineHeight={1.35}
          />
        ) : null}
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 80 || newBox.height < 60) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const TextBubble = memo(TextBubbleComponent, (prev, next) => {
  return (
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.width === next.data.width &&
    prev.data.height === next.data.height &&
    prev.data.rotation === next.data.rotation &&
    prev.data.text === next.data.text &&
    prev.data.textSize === next.data.textSize &&
    prev.data.textFamily === next.data.textFamily &&
    prev.isSelected === next.isSelected &&
    prev.onDragMove === next.onDragMove
  );
});
