/**
 * Sticky Note Component with optional text
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Circle, Group, Line, Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { StickyNote as StickyNoteType } from '@/types/canvas';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

interface StickyNoteProps {
  data: StickyNoteType;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<StickyNoteType>) => void;
  onDelete?: () => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const StickyNoteComponent = ({
  data,
  isSelected,
  isDraggable = true,
  onSelect,
  onUpdate,
  onDragMove,
  onTransformMove,
}: StickyNoteProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  
  // Track base dimensions at transform start to prevent compounding scale
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  // Use data dimensions directly - Konva's scale will handle the visual sizing during transform
  const noteWidth = data.width;
  const noteHeight = data.height;
  const foldSize = 34;
  const textAreaWidth = noteWidth - 28;
  const textAreaHeight = noteHeight - 30;
  const resolvedTextFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const resolvedTextSize = useMemo(() => {
    const text = hasRealText ? data.text! : '';
    return getAutoFitFontSize(text || ' ', textAreaWidth, textAreaHeight, resolvedTextFamily, {
      minSize: 12,
      maxSize: 42,
    });
  }, [data.text, textAreaWidth, textAreaHeight, resolvedTextFamily, hasRealText]);
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
      // Invalid hex length - log error and return fallback
      console.error(`[StickyNote] Invalid hex color length: "${hex}" (length: ${cleaned.length})`);
      return null;
    };

    const adjust = (hex: string, delta: number) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return '#FFF59D'; // Fallback to yellow if invalid

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
  }, [isSelected, data.x, data.y, noteWidth, noteHeight, data.rotation]);

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
    // Capture base dimensions before transform starts
    baseDimensionsRef.current = { width: data.width, height: data.height };
    setIsTransforming(true);
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (node && onTransformMove && baseDimensionsRef.current) {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const liveWidth = baseDimensionsRef.current.width * scaleX;
      const liveHeight = baseDimensionsRef.current.height * scaleY;
      
      // During transform, let Konva handle the visual scaling
      // We only need to broadcast the dimensions for multiplayer sync
      onTransformMove(data.id, node.x(), node.y(), node.rotation(), { width: liveWidth, height: liveHeight });
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newWidth = Math.max(120, baseDimensionsRef.current.width * scaleX);
    const newHeight = Math.max(120, baseDimensionsRef.current.height * scaleY);

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
    
    // Clear refs and state after all updates
    baseDimensionsRef.current = null;
    setIsTransforming(false);

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
    const updateFontSize = () => {
      const fontSize = getAutoFitFontSize(
        textarea.value || ' ',
        textAreaWidth,
        textAreaHeight,
        resolvedTextFamily,
        { minSize: 12, maxSize: 42 }
      );
      textarea.style.fontSize = `${fontSize * stageScale}px`;
    };
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = '1.28';
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
          width={noteWidth}
          height={noteHeight}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: noteWidth, y: noteHeight }}
          fillLinearGradientColorStops={[0, startColor, 1, endColor]}
          stroke={isSelected ? '#2196F3' : undefined}
          strokeWidth={isSelected ? 3 : 0}
          shadowColor={isTransforming ? undefined : "black"}
          shadowBlur={isTransforming ? 0 : 14}
          shadowOpacity={isTransforming ? 0 : 0.2}
          shadowOffsetX={isTransforming ? 0 : 3}
          shadowOffsetY={isTransforming ? 0 : 4}
          cornerRadius={12}
          perfectDrawEnabled={false}
        />

        <Line
          points={[
            noteWidth - foldSize, noteHeight,
            noteWidth, noteHeight - foldSize,
            noteWidth, noteHeight,
          ]}
          closed
          fill="rgba(0,0,0,0.12)"
          perfectDrawEnabled={false}
        />

        <Circle
          x={noteWidth - 22}
          y={22}
          radius={9}
          fill="#F97316"
          shadowColor={isTransforming ? undefined : "#111827"}
          shadowBlur={isTransforming ? 0 : 6}
          shadowOpacity={isTransforming ? 0 : 0.25}
          perfectDrawEnabled={false}
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
            align="center"
            verticalAlign="middle"
            wrap="word"
            ellipsis={true}
            listening={false}
            perfectDrawEnabled={false}
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

export const StickyNote = StickyNoteComponent;
