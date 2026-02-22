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
import { useCanvasStore } from '@/lib/store/canvas';

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

const MIN_STICKY_SIZE = 50;

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
  const localTransformRef = useRef<{ x: number; y: number; width: number; height: number; rotation: number } | null>(null);
  const committedTransformRef = useRef<{ x: number; y: number; width: number; height: number; rotation: number } | null>(null);
  
  // Track base dimensions at transform start to prevent compounding scale
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const committed = committedTransformRef.current;
    if (!committed) return;
    const matches =
      Math.abs(data.x - committed.x) < 1 &&
      Math.abs(data.y - committed.y) < 1 &&
      Math.abs(data.width - committed.width) < 1 &&
      Math.abs(data.height - committed.height) < 1 &&
      Math.abs(data.rotation - committed.rotation) < 1;
    if (matches) {
      localTransformRef.current = null;
      committedTransformRef.current = null;
    }
  }, [data.x, data.y, data.width, data.height, data.rotation]);

  // Use data dimensions directly - Konva's scale will handle the visual sizing during transform
  const renderX = localTransformRef.current?.x ?? data.x;
  const renderY = localTransformRef.current?.y ?? data.y;
  const renderRotation = localTransformRef.current?.rotation ?? data.rotation;
  const noteWidth = localTransformRef.current?.width ?? data.width;
  const noteHeight = localTransformRef.current?.height ?? data.height;
  const scale = useCanvasStore((state) => state.scale);
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
    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'StickyNote.tsx:useEffect-transformer',message:'Transformer attach effect',data:{id:data.id,isSelected,hasTransformer:!!transformerRef.current,hasGroup:!!groupRef.current},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'StickyNote.tsx:handleTransformStart',message:'Transform START',data:{id:data.id,width:data.width,height:data.height,rotation:data.rotation},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    localTransformRef.current = null;
    committedTransformRef.current = null;
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
      console.log('[StickyNote] transform live', {
        scale,
        id: data.id,
        liveWidth,
        liveHeight,
        base: baseDimensionsRef.current,
      });
      
      // During transform, let Konva handle the visual scaling
      // We only need to broadcast the dimensions for multiplayer sync
      onTransformMove(data.id, node.x(), node.y(), node.rotation(), { width: liveWidth, height: liveHeight });
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'StickyNote.tsx:handleTransformEnd',message:'Transform END',data:{id:data.id,hasNode:!!node,baseDims:baseDimensionsRef.current,scaleX:node?.scaleX(),scaleY:node?.scaleY(),rotation:node?.rotation()},timestamp:Date.now(),hypothesisId:'AC'})}).catch(()=>{});
    // #endregion
    if (!node || !baseDimensionsRef.current) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newWidth = Math.max(MIN_STICKY_SIZE, baseDimensionsRef.current.width * scaleX);
    const newHeight = Math.max(MIN_STICKY_SIZE, baseDimensionsRef.current.height * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    const finalX = node.x();
    const finalY = node.y();
    const finalRotation = node.rotation();

    const committed = {
      x: finalX,
      y: finalY,
      width: newWidth,
      height: newHeight,
      rotation: finalRotation,
    };
    localTransformRef.current = committed;
    committedTransformRef.current = committed;

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
    const rotation = groupRef.current?.rotation() ?? data.rotation ?? 0;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const textAreaW = noteWidth - 28;
    const textAreaH = noteHeight - 30;
    const localCx = 14 + textAreaW / 2;
    const localCy = 16 + textAreaH / 2;
    const stageCx = curX + localCx * cos - localCy * sin;
    const stageCy = curY + localCx * sin + localCy * cos;
    const editorWidth = Math.max(100, (data.width - 28) * stageScale);
    const editorHeight = Math.max(56, (data.height - 30) * stageScale);
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
    textarea.style.color = '#0f172a';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.fontFamily = resolvedTextFamily;
    const LINE_HEIGHT_MULTIPLIER = 1.28;
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
        { minSize: 12, maxSize: 42 }
      );
      const scaledFontSize = fontSize * stageScale;
      textarea.style.fontSize = `${scaledFontSize}px`;
      applyVerticalCenterPadding();
    };
    textarea.style.fontSize = `${resolvedTextSize * stageScale}px`;
    textarea.style.lineHeight = String(LINE_HEIGHT_MULTIPLIER);
    textarea.style.textAlign = 'center';
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
        x={renderX}
        y={renderY}
        rotation={renderRotation}
        draggable={isDraggable}
      onClick={(e) => {
        // #region agent log
        fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'859e57'},body:JSON.stringify({sessionId:'859e57',location:'StickyNote.tsx:onClick',message:'StickyNote clicked',data:{id:data.id,isSelected},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.log('[StickyNote] clicked', {
          id: data.id,
          width: data.width,
          height: data.height,
          scale: useCanvasStore.getState().scale,
        });
        onSelect(e);
      }}
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
            const minSize = MIN_STICKY_SIZE;
            const needsWidthClamp = newBox.width < minSize;
            const needsHeightClamp = newBox.height < minSize;
            console.log('[StickyNote] boundBox', {
              scale,
              id: data.id,
              newWidth: newBox.width,
              newHeight: newBox.height,
              minSize,
              clampWidth: needsWidthClamp,
              clampHeight: needsHeightClamp,
              activeAnchor: transformerRef.current?.getActiveAnchor(),
            });
            if (!needsWidthClamp && !needsHeightClamp) {
              return newBox;
            }

            const activeAnchor = transformerRef.current?.getActiveAnchor() ?? '';
            const width = Math.max(minSize, newBox.width);
            const height = Math.max(minSize, newBox.height);
            let x = newBox.x;
            let y = newBox.y;

            if (needsWidthClamp) {
              if (activeAnchor.includes('left')) {
                x = oldBox.x + (oldBox.width - width);
              } else if (activeAnchor.includes('right')) {
                x = oldBox.x;
              }
            }

            if (needsHeightClamp) {
              if (activeAnchor.includes('top')) {
                y = oldBox.y + (oldBox.height - height);
              } else if (activeAnchor.includes('bottom')) {
                y = oldBox.y;
              }
            }

            return { ...newBox, x, y, width, height };
          }}
        />
      )}
    </>
  );
};

export const StickyNote = StickyNoteComponent;
