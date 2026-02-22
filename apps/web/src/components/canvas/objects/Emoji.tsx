/**
 * Emoji sticker component with resize + rotate support
 */

'use client';

import { useRef, useEffect } from 'react';
import { Group, Rect, Transformer, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { EmojiObject } from '@/types/canvas';

interface EmojiProps {
  data: EmojiObject;
  isSelected: boolean;
  isDraggable?: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<EmojiObject>) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onTransformMove?: (id: string, x: number, y: number, rotation: number, dimensions?: { width?: number; height?: number }) => void;
}

const EMOJI_FONT_FAMILY = 'AppleColorEmoji, Segoe UI Emoji, Noto Color Emoji, sans-serif';

export const Emoji = ({
  data,
  isSelected,
  isDraggable = true,
  onSelect,
  onUpdate,
  onDragMove,
  onTransformMove,
}: EmojiProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const baseDimensionsRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, data.x, data.y, data.rotation, data.width, data.height]);

  const fontSize = Math.max(24, Math.min(data.width, data.height));

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
    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba7bb2'},body:JSON.stringify({sessionId:'ba7bb2',location:'Emoji.tsx:handleTransformStart',message:'Transform start',data:{id:data.id,width:data.width,height:data.height},timestamp:Date.now(),hypothesisId:'T1'})}).catch(()=>{});
    // #endregion
    window.dispatchEvent(new Event('object-transform-start'));
  };

  const handleTransform = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current || !onTransformMove) return;
    onTransformMove(data.id, node.x(), node.y(), node.rotation(), {
      width: Math.max(24, baseDimensionsRef.current.width * node.scaleX()),
      height: Math.max(24, baseDimensionsRef.current.height * node.scaleY()),
    });
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    if (!node || !baseDimensionsRef.current) return;

    const newWidth = Math.max(24, baseDimensionsRef.current.width * node.scaleX());
    const newHeight = Math.max(24, baseDimensionsRef.current.height * node.scaleY());
    node.scaleX(1);
    node.scaleY(1);

    if (transformerRef.current) {
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }

    window.dispatchEvent(new Event('object-transform-end'));
    baseDimensionsRef.current = null;
    // #region agent log
    fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba7bb2'},body:JSON.stringify({sessionId:'ba7bb2',location:'Emoji.tsx:handleTransformEnd',message:'Transform end',data:{id:data.id,newWidth,newHeight,x:node.x(),y:node.y(),rotation:node.rotation()},timestamp:Date.now(),hypothesisId:'T2'})}).catch(()=>{});
    // #endregion
    onUpdate({
      width: newWidth,
      height: newHeight,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
    });
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={data.x}
        y={data.y}
        rotation={data.rotation}
        draggable={isDraggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformStart={handleTransformStart}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        {/* Hit area: Group needs a listening child for Konva hit detection (Text has listening={false}) */}
        <Rect x={0} y={0} width={data.width} height={data.height} fill="transparent" listening />
        <KonvaText
          text={data.emoji}
          width={data.width}
          height={data.height}
          fontSize={fontSize}
          align="center"
          verticalAlign="middle"
          listening={false}
          fontFamily={EMOJI_FONT_FAMILY}
        />
      </Group>
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) {
              return oldBox;
            }
            return newBox;
          }}
          anchorSize={8}
          anchorStrokeWidth={2}
        />
      )}
    </>
  );
};
