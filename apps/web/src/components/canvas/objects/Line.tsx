/**
 * Line Shape Component with arrowhead support for connectors
 * Supports draggable endpoint handles for re-routing connections.
 *
 * Position is managed with a local override ref to prevent snap-back during
 * drag/transform. The override is only cleared once Yjs data catches up.
 */

'use client';

import { useRef, useEffect, memo } from 'react';
import { Arrow, Transformer, Circle } from 'react-konva';
import type Konva from 'konva';
import type { LineShape, AnchorPosition } from '@/types/canvas';

interface LineProps {
  data: LineShape;
  resolvedPoints?: [number, number, number, number] | null;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onUpdate: (updates: Partial<LineShape>) => void;
  onEndpointDrag?: (
    lineId: string,
    endpoint: 'start' | 'end',
    canvasX: number,
    canvasY: number
  ) => { objectId: string; anchor: AnchorPosition; x: number; y: number } | null;
  onEndpointDragEnd?: (
    lineId: string,
    endpoint: 'start' | 'end',
    canvasX: number,
    canvasY: number
  ) => void;
}

const HANDLE_RADIUS = 7;
const HANDLE_FILL = '#3B82F6';
const HANDLE_STROKE = '#fff';

const LineComponent = ({
  data,
  resolvedPoints,
  isSelected,
  onSelect,
  onUpdate,
  onEndpointDrag,
  onEndpointDragEnd,
}: LineProps) => {
  const shapeRef = useRef<Konva.Arrow>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const localPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);
  const committedPosRef = useRef<{ x: number; y: number; rotation: number } | null>(null);

  const isConnected = !!(data.startAnchor || data.endAnchor);

  const drawX = isConnected && resolvedPoints ? 0 : data.x;
  const drawY = isConnected && resolvedPoints ? 0 : data.y;
  const drawPoints =
    isConnected && resolvedPoints
      ? [resolvedPoints[0], resolvedPoints[1], resolvedPoints[2], resolvedPoints[3]]
      : data.points;

  useEffect(() => {
    if (committedPosRef.current) {
      const c = committedPosRef.current;
      if (Math.abs(drawX - c.x) < 1 && Math.abs(drawY - c.y) < 1) {
        localPosRef.current = null;
        committedPosRef.current = null;
      }
    }
  }, [drawX, drawY, data.rotation]);

  const renderX = localPosRef.current?.x ?? drawX;
  const renderY = localPosRef.current?.y ?? drawY;
  const renderRotation = localPosRef.current?.rotation ?? (isConnected ? 0 : data.rotation);

  useEffect(() => {
    if (isSelected && !isConnected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, isConnected, drawX, drawY, data.rotation]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (isConnected) {
      e.target.x(0);
      e.target.y(0);
      localPosRef.current = null;
      committedPosRef.current = null;
      window.dispatchEvent(new Event('object-drag-end'));
      return;
    }
    const finalX = e.target.x();
    const finalY = e.target.y();
    localPosRef.current = { x: finalX, y: finalY, rotation: localPosRef.current?.rotation ?? data.rotation };
    committedPosRef.current = { x: finalX, y: finalY, rotation: localPosRef.current.rotation };
    window.dispatchEvent(new Event('object-drag-end'));
    onUpdate({ x: finalX, y: finalY });
  };

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;

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
      x: finalX,
      y: finalY,
      rotation: finalRotation,
    });
  };

  // Endpoint handle positions (absolute canvas coords, accounting for rotation)
  const rotationRad = (renderRotation * Math.PI) / 180;
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);

  // Transform start point through rotation
  const startXLocal = drawPoints[0];
  const startYLocal = drawPoints[1];
  const startX = drawX + startXLocal * cosR - startYLocal * sinR;
  const startY = drawY + startXLocal * sinR + startYLocal * cosR;

  // Transform end point through rotation
  const endXLocal = drawPoints[2];
  const endYLocal = drawPoints[3];
  const endX = drawX + endXLocal * cosR - endYLocal * sinR;
  const endY = drawY + endXLocal * sinR + endYLocal * cosR;

  const handleEndpointDragMove = (endpoint: 'start' | 'end') => (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;
    const cx = node.x();
    const cy = node.y();

    const snap = onEndpointDrag?.(data.id, endpoint, cx, cy);

    const snapX = snap ? snap.x : cx;
    const snapY = snap ? snap.y : cy;

    if (snap) {
      node.x(snapX);
      node.y(snapY);
    }

    // If line is rotated, we need to transform the other endpoint too
    const otherEndpointX = endpoint === 'start' ? endX : startX;
    const otherEndpointY = endpoint === 'start' ? endY : startY;

    if (endpoint === 'start') {
      onUpdate({
        points: [snapX, snapY, otherEndpointX, otherEndpointY],
        x: 0,
        y: 0,
        rotation: 0, // Reset rotation when detaching
        startAnchor: undefined,
      });
    } else {
      onUpdate({
        points: [otherEndpointX, otherEndpointY, snapX, snapY],
        x: 0,
        y: 0,
        rotation: 0, // Reset rotation when detaching
        endAnchor: undefined,
      });
    }
  };

  const handleEndpointDragEnd = (endpoint: 'start' | 'end') => (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;
    const cx = node.x();
    const cy = node.y();
    onEndpointDragEnd?.(data.id, endpoint, cx, cy);
  };

  const commonProps = {
    id: data.id,
    ref: shapeRef,
    x: renderX,
    y: renderY,
    points: drawPoints,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    rotation: renderRotation,
    draggable: !isConnected,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: () => {
      const node = shapeRef.current;
      if (node) {
        localPosRef.current = { x: node.x(), y: node.y(), rotation: node.rotation() };
      }
      window.dispatchEvent(new Event('object-drag-start'));
    },
    onDragEnd: handleDragEnd,
    onTransformStart: () => {
      const node = shapeRef.current;
      if (node) {
        localPosRef.current = { x: node.x(), y: node.y(), rotation: node.rotation() };
      }
    },
    onTransformEnd: handleTransformEnd,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    hitStrokeWidth: 15,
  };

  return (
    <>
      <Arrow
        {...commonProps}
        pointerLength={12}
        pointerWidth={10}
        fill={data.stroke}
      />

      {isSelected && !isConnected && (
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

      {isSelected && (
        <>
          <Circle
            x={startX}
            y={startY}
            radius={HANDLE_RADIUS}
            fill={data.startAnchor ? '#10B981' : HANDLE_FILL}
            stroke={HANDLE_STROKE}
            strokeWidth={2}
            draggable
            onDragStart={(e) => { e.cancelBubble = true; }}
            onDragMove={handleEndpointDragMove('start')}
            onDragEnd={handleEndpointDragEnd('start')}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grab';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
          <Circle
            x={endX}
            y={endY}
            radius={HANDLE_RADIUS}
            fill={data.endAnchor ? '#10B981' : HANDLE_FILL}
            stroke={HANDLE_STROKE}
            strokeWidth={2}
            draggable
            onDragStart={(e) => { e.cancelBubble = true; }}
            onDragMove={handleEndpointDragMove('end')}
            onDragEnd={handleEndpointDragEnd('end')}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'grab';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
        </>
      )}
    </>
  );
};

export const Line = memo(LineComponent, (prev, next) => {
  return (
    prev.data.x === next.data.x &&
    prev.data.y === next.data.y &&
    prev.data.points === next.data.points &&
    prev.data.stroke === next.data.stroke &&
    prev.data.strokeWidth === next.data.strokeWidth &&
    prev.data.rotation === next.data.rotation &&
    prev.data.startAnchor?.objectId === next.data.startAnchor?.objectId &&
    prev.data.startAnchor?.anchor === next.data.startAnchor?.anchor &&
    prev.data.endAnchor?.objectId === next.data.endAnchor?.objectId &&
    prev.data.endAnchor?.anchor === next.data.endAnchor?.anchor &&
    prev.resolvedPoints?.[0] === next.resolvedPoints?.[0] &&
    prev.resolvedPoints?.[1] === next.resolvedPoints?.[1] &&
    prev.resolvedPoints?.[2] === next.resolvedPoints?.[2] &&
    prev.resolvedPoints?.[3] === next.resolvedPoints?.[3] &&
    prev.isSelected === next.isSelected &&
    prev.onEndpointDrag === next.onEndpointDrag &&
    prev.onEndpointDragEnd === next.onEndpointDragEnd
  );
});
