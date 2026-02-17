/**
 * Sticky Note Component with optional text
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { Circle, Group, Line, Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { StickyNote as StickyNoteType } from '@/types/canvas';

interface StickyNoteProps {
  data: StickyNoteType;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<StickyNoteType>) => void;
  onDelete?: () => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const StickyNoteComponent = ({
  data,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
  onTransformMove,
}: StickyNoteProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);
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

  const noteWidth = data.width;
  const noteHeight = data.height;
  const foldSize = 34;
  const resolvedTextSize = Math.max(12, Math.min(data.textSize ?? 16, 42, noteHeight * 0.28));
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const displayText = hasRealText ? data.text! : (isSelected ? 'Type text' : '');

  const getGradientStops = (baseColor: string) => {
    const palette: Record<string, [string, string]> = {
      '#FFF59D': ['#FFF9BE', '#FFD84B'],
      '#F48FB1': ['#FFB2CF', '#F472B6'],
      '#81D4FA': ['#B7E9FF', '#38BDF8'],
      '#A5D6A7': ['#CCF0CE', '#4ADE80'],
      '#FFCC80': ['#FFE0B2', '#FB923C'],
    };

    if (palette[baseColor]) {
      return palette[baseColor];
    }

    const normalizeHex = (hex: string) => {
      const cleaned = hex.replace('#', '').trim();
      if (cleaned.length === 3) {
        return cleaned.split('').map((c) => c + c).join('');
      }
      if (cleaned.length === 6) {
        return cleaned;
      }
      return null;
    };

    const adjust = (hex: string, delta: number) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return hex;

      const toChannel = (start: number) =>
        Math.max(0, Math.min(255, parseInt(normalized.slice(start, start + 2), 16) + delta));

      const r = toChannel(0).toString(16).padStart(2, '0');
      const g = toChannel(2).toString(16).padStart(2, '0');
      const b = toChannel(4).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    };

    return [adjust(baseColor, 30), adjust(baseColor, -22)];
  };

  const [startColor, endColor] = getGradientStops(data.color);

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.width, data.height, data.rotation]);

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
    onUpdate({
      x: finalX,
      y: finalY,
      modifiedAt: Date.now(),
    });
  };

  const handleTransformStart = () => {
    const node = groupRef.current;
    if (node) {
      localPosRef.current = { x: node.x(), y: node.y(), rotation: node.rotation() };
    }
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (node && onTransformMove) {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const liveWidth = noteWidth * scaleX;
      const liveHeight = noteHeight * scaleY;
      onTransformMove(data.id, node.x(), node.y(), node.rotation(), { width: liveWidth, height: liveHeight });
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newWidth = Math.max(120, noteWidth * scaleX);
    const newHeight = Math.max(120, noteHeight * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    // Update child node dimensions imperatively so the visual stays correct
    // until React re-renders with the new Yjs data
    const children = node.getChildren();
    for (const child of children) {
      if (child.className === 'Rect') {
        child.width(newWidth);
        child.height(newHeight);
      }
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

    window.dispatchEvent(new Event('object-transform-end'));

    onUpdate({
      x: finalX,
      y: finalY,
      width: newWidth,
      height: newHeight,
      rotation: finalRotation,
      modifiedAt: Date.now(),
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

    const editorX = containerRect.left + stagePos.x + (curX + 14) * stageScale;
    const editorY = containerRect.top + stagePos.y + (curY + 16) * stageScale;
    const editorWidth = Math.max(100, (data.width - 28) * stageScale);
    const editorHeight = Math.max(56, (data.height - 30) * stageScale);

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
    textarea.style.color = '#0f172a';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.fontFamily = resolvedTextFamily;
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = '1.28';
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
      onUpdate({ text: textarea.value, modifiedAt: Date.now() });
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
        draggable={true}
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
          width={noteWidth}
          height={noteHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: noteWidth, y: noteHeight }}
          fillLinearGradientColorStops={[0, startColor, 1, endColor]}
          stroke={isSelected ? '#2196F3' : undefined}
          strokeWidth={isSelected ? 3 : 0}
          shadowColor="black"
          shadowBlur={14}
          shadowOpacity={0.2}
          shadowOffsetX={3}
          shadowOffsetY={4}
          cornerRadius={12}
        />

        <Line
          points={[
            noteWidth - foldSize, noteHeight,
            noteWidth, noteHeight - foldSize,
            noteWidth, noteHeight,
          ]}
          closed
          fill="rgba(0,0,0,0.12)"
        />

        <Circle
          x={noteWidth - 22}
          y={22}
          radius={9}
          fill="#F97316"
          shadowColor="#111827"
          shadowBlur={6}
          shadowOpacity={0.25}
        />

        {displayText && !isEditingText ? (
          <Text
            ref={textRef}
            x={14}
            y={16}
            width={noteWidth - 28}
            height={noteHeight - 30}
            text={displayText}
            fontSize={resolvedTextSize}
            fontFamily={resolvedTextFamily}
            fill={hasRealText ? '#0f172a' : '#475569'}
            opacity={hasRealText ? 1 : 0.6}
            align="left"
            verticalAlign="top"
            wrap="word"
            ellipsis={true}
            listening={false}
          />
        ) : null}
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
            if (newBox.width < 120 || newBox.height < 120) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export const StickyNote = memo(StickyNoteComponent, (prev, next) => {
  return (
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.rotation === next.data.rotation &&
    prev.data.width === next.data.width &&
    prev.data.height === next.data.height &&
    prev.data.text === next.data.text &&
    prev.data.textSize === next.data.textSize &&
    prev.data.textFamily === next.data.textFamily &&
    prev.data.color === next.data.color &&
    prev.isSelected === next.isSelected &&
    prev.onDragMove === next.onDragMove
  );
});
