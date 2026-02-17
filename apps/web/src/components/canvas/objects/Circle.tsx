/**
 * Circle Shape Component with text support
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useRef, useEffect, useState, memo } from 'react';
import { Group, Circle as KonvaCircle, Transformer, Text } from 'react-konva';
import type Konva from 'konva';
import type { CircleShape } from '@/types/canvas';

interface CircleProps {
  data: CircleShape;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<CircleShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
}

const CircleComponent = ({ data, isSelected, onSelect, onUpdate, onDragMove }: CircleProps) => {
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

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.radius, data.rotation]);

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
    const newRadius = Math.max(5, data.radius * Math.max(scaleX, scaleY));

    node.scaleX(1);
    node.scaleY(1);

    // Update child Circle radius imperatively
    const circleNode = node.findOne('Circle');
    if (circleNode) {
      (circleNode as Konva.Circle).radius(newRadius);
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

  const resolvedTextSize = Math.max(12, Math.min(data.textSize ?? 16, 44, data.radius * 0.9));
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type text' : '');

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
        <KonvaCircle
          x={0}
          y={0}
          radius={data.radius}
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

export const Circle = memo(CircleComponent, (prev, next) => {
  return (
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.radius === next.data.radius &&
    prev.data.fill === next.data.fill &&
    prev.data.stroke === next.data.stroke &&
    prev.data.rotation === next.data.rotation &&
    prev.data.text === next.data.text &&
    prev.data.textSize === next.data.textSize &&
    prev.data.textFamily === next.data.textFamily &&
    prev.isSelected === next.isSelected &&
    prev.onDragMove === next.onDragMove
  );
});
