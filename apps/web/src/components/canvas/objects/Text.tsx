/**
 * Text Component - plain text without borders or background
 */

'use client';

import { useRef, useEffect, useState, memo } from 'react';
import { Group, Transformer, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { TextShape } from '@/types/canvas';

interface TextProps {
  data: TextShape;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<TextShape>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number) => void;
}

const TextComponent = ({
  data,
  isSelected,
  isDraggable = true,
  onSelect,
  onUpdate,
  onDragMove,
  onTransformMove,
}: TextProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const textRef = useRef<Konva.Text>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [_editText, setEditText] = useState(data.text || '');

  const localPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const committedPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);

  useEffect(() => {
    if (committedPosRef.current) {
      const c = committedPosRef.current;
      const safeX = typeof data.x === 'number' && !isNaN(data.x) ? data.x : 0;
      const safeY = typeof data.y === 'number' && !isNaN(data.y) ? data.y : 0;
      if (Math.abs(safeX - c.x) < 1 && Math.abs(safeY - c.y) < 1) {
        localPosRef.current = null;
        committedPosRef.current = null;
      }
    }
  }, [data.x, data.y, data.rotation]);

  // Ensure x, y, and rotation are valid numbers (default to 0 if NaN/undefined)
  const safeX = typeof data.x === 'number' && !isNaN(data.x) ? data.x : 0;
  const safeY = typeof data.y === 'number' && !isNaN(data.y) ? data.y : 0;
  const safeRotation = typeof data.rotation === 'number' && !isNaN(data.rotation) ? data.rotation : 0;
  
  const renderX = localPosRef.current?.x ?? safeX;
  const renderY = localPosRef.current?.y ?? safeY;
  const renderRotation = localPosRef.current?.rotation ?? safeRotation;

  const textSize = data.textSize ?? 16;
  const textFamily = data.textFamily ?? 'Inter';
  const hasRealText = typeof data.text === 'string' && data.text.trim().length > 0;
  const textColor = hasRealText ? (data.fill ?? '#000000') : '#64748b';
  // Always show placeholder when no text, so user can see the text object exists
  const displayText = hasRealText ? data.text : 'ENTER TEXT';

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.rotation]);

  const handleDragStart = () => {
    const node = groupRef.current;
    if (node) {
      const startX = node.x();
      const startY = node.y();
      const startRotation = node.rotation();
      // Ensure values are valid numbers
      if (typeof startX === 'number' && !isNaN(startX) && typeof startY === 'number' && !isNaN(startY) && typeof startRotation === 'number' && !isNaN(startRotation)) {
        localPosRef.current = { x: startX, y: startY, rotation: startRotation };
      }
    }
    window.dispatchEvent(new Event('object-drag-start'));
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x();
    const newY = e.target.y();
    // Ensure values are valid numbers
    if (typeof newX === 'number' && !isNaN(newX) && typeof newY === 'number' && !isNaN(newY)) {
      const currentRotation = localPosRef.current?.rotation ?? safeRotation;
      localPosRef.current = {
        x: newX,
        y: newY,
        rotation: currentRotation,
      };
      onDragMove?.(data.id, newX, newY);
    }
  };

  const handleDragEnd = () => {
    const node = groupRef.current;
    if (node && localPosRef.current) {
      const { x, y, rotation } = localPosRef.current;
      // Ensure values are valid numbers before updating
      if (typeof x === 'number' && !isNaN(x) && typeof y === 'number' && !isNaN(y) && typeof rotation === 'number' && !isNaN(rotation)) {
        committedPosRef.current = { x, y, rotation };
        onUpdate({ x, y, rotation });
        localPosRef.current = null;
      }
    }
    window.dispatchEvent(new Event('object-drag-end'));
  };

  const handleTransformStart = () => {
    const node = groupRef.current;
    if (node) {
      const startX = node.x();
      const startY = node.y();
      const startRotation = node.rotation();
      // Ensure values are valid numbers
      if (typeof startX === 'number' && !isNaN(startX) && typeof startY === 'number' && !isNaN(startY) && typeof startRotation === 'number' && !isNaN(startRotation)) {
        localPosRef.current = { x: startX, y: startY, rotation: startRotation };
      }
    }
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (node) {
      const newX = node.x();
      const newY = node.y();
      const newRotation = node.rotation();
      // Ensure values are valid numbers
      if (typeof newX === 'number' && !isNaN(newX) && typeof newY === 'number' && !isNaN(newY) && typeof newRotation === 'number' && !isNaN(newRotation)) {
        localPosRef.current = {
          x: newX,
          y: newY,
          rotation: newRotation,
        };
        onTransformMove?.(data.id, newX, newY, newRotation);
      }
    }
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (node && localPosRef.current) {
      const { x, y, rotation } = localPosRef.current;
      // Ensure values are valid numbers before updating
      if (typeof x === 'number' && !isNaN(x) && typeof y === 'number' && !isNaN(y) && typeof rotation === 'number' && !isNaN(rotation)) {
        committedPosRef.current = { x, y, rotation };
        onUpdate({ x, y, rotation });
        localPosRef.current = null;
      }
    }
  };

  const handleTextEdit = () => {
    if (isSelected && !isEditingText) {
      setIsEditingText(true);
      setEditText(data.text || '');
      setTimeout(() => {
        const textarea = document.createElement('textarea');
        textarea.value = data.text || '';
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const handleBlur = () => {
          const newText = textarea.value;
          onUpdate({ text: newText });
          setIsEditingText(false);
          document.body.removeChild(textarea);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBlur();
          } else if (e.key === 'Escape') {
            setIsEditingText(false);
            document.body.removeChild(textarea);
          }
        };

        textarea.addEventListener('blur', handleBlur);
        textarea.addEventListener('keydown', handleKeyDown);
      }, 0);
    }
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
        <KonvaText
          ref={textRef}
          text={displayText}
          fontSize={textSize}
          fontFamily={textFamily}
          fill={textColor}
          opacity={hasRealText ? 1 : 0.55}
          align="left"
          verticalAlign="top"
          listening={!isEditingText}
        />
      </Group>

      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Allow rotation and position changes, but maintain text size
            return newBox;
          }}
          rotateEnabled={true}
          enabledAnchors={[]}
          borderEnabled={true}
          borderStroke="#2196F3"
          borderStrokeWidth={2}
          anchorFill="#2196F3"
          anchorStroke="#fff"
          anchorStrokeWidth={2}
          anchorSize={8}
        />
      )}
    </>
  );
};

export const Text = memo(TextComponent, (prev, next) => {
  return (
    prev.data.id === next.data.id &&
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.rotation === next.data.rotation &&
    prev.data.text === next.data.text &&
    prev.data.textSize === next.data.textSize &&
    prev.data.textFamily === next.data.textFamily &&
    prev.data.fill === next.data.fill &&
    prev.isSelected === next.isSelected &&
    prev.isDraggable === next.isDraggable
  );
});
