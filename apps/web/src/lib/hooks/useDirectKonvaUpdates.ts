/**
 * Direct Konva Updates Hook
 * 
 * Bypasses React for 60fps real-time collaboration.
 * Updates Konva nodes directly from Yjs awareness.
 */

'use client';

import { useEffect, useRef } from 'react';
import type Konva from 'konva';
import { getAutoFitFontSize } from '@/lib/utils/autoFitText';

interface LivePosition {
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
  radius?: number;
}

interface AwarenessLike {
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
}

interface CursorServerLivePosition {
  objectId: string;
  userId: string;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
}

interface WhiteboardObject {
  id: string;
  type: string;
  x: number;
  y: number;
  [key: string]: any;
}

interface DirectKonvaUpdatesProps {
  awareness: AwarenessLike | null;
  currentUserId: string;
  stageRef: React.RefObject<Konva.Stage | null>;
  objectsMap: Map<string, WhiteboardObject>;
  /** Optional: live positions from cursor server (ultra-low latency when used) */
  cursorServerLivePositions?: React.RefObject<Map<string, CursorServerLivePosition>>;
}

export function useDirectKonvaUpdates({
  awareness,
  currentUserId,
  stageRef,
  objectsMap,
  cursorServerLivePositions,
}: DirectKonvaUpdatesProps) {
  const lastUpdateTime = useRef(performance.now());
  
  const applyPositionToNode = (
    node: Konva.Node,
    livePos: { x: number; y: number; rotation?: number; width?: number; height?: number; radius?: number; points?: number[] },
    updatedNodes: Set<Konva.Node>
  ): boolean => {
    let hasUpdates = false;
    const currentX = node.x();
    const currentY = node.y();

    if (Math.abs(currentX - livePos.x) > 0.1 || Math.abs(currentY - livePos.y) > 0.1) {
      node.x(livePos.x);
      node.y(livePos.y);
      hasUpdates = true;
      updatedNodes.add(node);
    }
    if (livePos.rotation !== undefined) {
      const currentRotation = node.rotation();
      if (Math.abs(currentRotation - livePos.rotation) > 0.1) {
        node.rotation(livePos.rotation);
        hasUpdates = true;
      }
    }
    
    // For Groups (Rectangle/Circle components), find the actual shape child and update it
    const isGroup = node.getType() === 'Group';
    const targetNode = isGroup ? (node as any).findOne('Rect') || (node as any).findOne('Circle') || node : node;
    
    if (livePos.width !== undefined) {
      const currentWidth = targetNode.width();
      if (Math.abs(currentWidth - livePos.width) > 0.1) {
        targetNode.width(livePos.width);
        hasUpdates = true;
        
        // Update Text component font size for Rectangle shapes
        if (isGroup && livePos.height !== undefined) {
          const textNode = (node as any).findOne('Text');
          if (textNode) {
            // Calculate text area dimensions (matching Rectangle.tsx logic)
            const textAreaWidth = livePos.width * 0.9;
            const textAreaHeight = livePos.height * 0.8;
            const textContent = textNode.text() || ' ';
            const fontFamily = textNode.fontFamily() || 'Inter';
            
            // Use the same auto-fit logic as Rectangle component
            const fontSize = getAutoFitFontSize(textContent, textAreaWidth, textAreaHeight, fontFamily, {
              minSize: 12,
              maxSize: 48,
            });
            
            textNode.fontSize(fontSize);
            textNode.width(textAreaWidth);
            textNode.height(textAreaHeight);
            textNode.x(livePos.width * 0.05);
            textNode.y(livePos.height * 0.1);
          }
        }
      }
    }
    if (livePos.height !== undefined) {
      const currentHeight = targetNode.height();
      if (Math.abs(currentHeight - livePos.height) > 0.1) {
        targetNode.height(livePos.height);
        hasUpdates = true;
        
        // Update Text component font size for Rectangle shapes (if width was already updated)
        if (isGroup && livePos.width !== undefined) {
          const textNode = (node as any).findOne('Text');
          if (textNode) {
            // Calculate text area dimensions (matching Rectangle.tsx logic)
            const textAreaWidth = livePos.width * 0.9;
            const textAreaHeight = livePos.height * 0.8;
            const textContent = textNode.text() || ' ';
            const fontFamily = textNode.fontFamily() || 'Inter';
            
            // Use the same auto-fit logic as Rectangle component
            const fontSize = getAutoFitFontSize(textContent, textAreaWidth, textAreaHeight, fontFamily, {
              minSize: 12,
              maxSize: 48,
            });
            
            textNode.fontSize(fontSize);
            textNode.width(textAreaWidth);
            textNode.height(textAreaHeight);
            textNode.x(livePos.width * 0.05);
            textNode.y(livePos.height * 0.1);
          }
        }
      }
    }

    if (node.getType() === 'Line' && livePos.points?.length === 4) {
      const currentPoints = (node as Konva.Line).points();
      const [n1, n2, n3, n4] = livePos.points;
      if (currentPoints.length !== 4 || n1 !== currentPoints[0] || n2 !== currentPoints[1] || n3 !== currentPoints[2] || n4 !== currentPoints[3]) {
        (node as Konva.Line).points(livePos.points);
        hasUpdates = true;
      }
    }
    if (livePos.radius !== undefined && (targetNode as any).radius) {
      const currentRadius = (targetNode as any).radius();
      if (Math.abs(currentRadius - livePos.radius) > 0.1) {
        (targetNode as any).radius(livePos.radius);
        hasUpdates = true;
        
        // Update Text component font size for Circle shapes
        if (isGroup) {
          const textNode = (node as any).findOne('Text');
          if (textNode) {
            // Calculate text area dimensions (matching Circle.tsx logic)
            const textAreaWidth = livePos.radius * 1.8;
            const textAreaHeight = livePos.radius * 1.1;
            const textContent = textNode.text() || ' ';
            const fontFamily = textNode.fontFamily() || 'Inter';
            
            // Use the same auto-fit logic as Circle component
            const fontSize = getAutoFitFontSize(textContent, textAreaWidth, textAreaHeight, fontFamily, {
              minSize: 12,
              maxSize: 44,
            });
            
            textNode.fontSize(fontSize);
            textNode.width(textAreaWidth);
            textNode.height(textAreaHeight);
            textNode.x(-livePos.radius * 0.9);
            textNode.y(-livePos.radius * 0.55);
          }
        }
      }
    }
    if (livePos.points !== undefined && livePos.points.length >= 4) {
      const lineNode = node as unknown as { points: (p?: number[]) => number[]; x: (v?: number) => number; y: (v?: number) => number };
      const currentPoints = lineNode.points();
      const newPoints = livePos.points;
      const changed =
        !currentPoints ||
        currentPoints.length !== newPoints.length ||
        currentPoints.some((p, i) => Math.abs(p - newPoints[i]) > 0.1);
      if (changed) {
        lineNode.points(newPoints);
        lineNode.x(livePos.x);
        lineNode.y(livePos.y);
        hasUpdates = true;
        updatedNodes.add(node);
      }
    }
    return hasUpdates;
  };

  // Direct update loop using RAF for 60fps
  useEffect(() => {
    if (!stageRef.current) return;

    let rafId: number;

    const applyLiveUpdates = (currentTime: number) => {
      const elapsed = currentTime - lastUpdateTime.current;

      if (elapsed >= 4) {
        lastUpdateTime.current = currentTime;

        const stage = stageRef.current;
        if (!stage) {
          rafId = requestAnimationFrame(applyLiveUpdates);
          return;
        }

        let hasUpdates = false;
        const updatedNodes = new Set<Konva.Node>();

        // Priority 1: Apply selection transforms (for multi-object moves with 10+ objects)
        // This dramatically reduces network overhead by applying a single transform to all selected objects
        if (awareness) {
          const states = awareness.getStates();
          states.forEach((state) => {
            const userId = (state.user as any)?.id;
            if (userId === currentUserId) return;

            const selTransform = (state as any).selectionTransform;
            if (selTransform && selTransform.selectedIds?.length > 0) {
              selTransform.selectedIds.forEach((objectId: string) => {
                const nodes = stage.find(`#${objectId}`);
                if (nodes.length === 0) return;
                const node = nodes[0];
                if (!node || updatedNodes.has(node)) return;
                
                // Get base position from Yjs CRDT
                const baseObj = objectsMap.get(objectId);
                if (!baseObj) return;
                
                // Apply math transform: finalPos = basePos + delta
                const transformedPos = {
                  x: baseObj.x + selTransform.dx,
                  y: baseObj.y + selTransform.dy,
                };
                
                if (applyPositionToNode(node, transformedPos, updatedNodes)) {
                  hasUpdates = true;
                }
              });
            }
          });
        }

        // Priority 2: Apply individual live positions (for small selections <10 objects)
        // Skip nodes already updated by selection transform
        if (awareness) {
          const states = awareness.getStates();
          states.forEach((state) => {
            const userId = (state.user as any)?.id;
            if (userId === currentUserId) return;

            const livePositions = (state.livePositions || {}) as Record<string, LivePosition>;
            Object.entries(livePositions).forEach(([objectId, livePos]) => {
              const nodes = stage.find(`#${objectId}`);
              if (nodes.length === 0) return;
              const node = nodes[0];
              if (!node || updatedNodes.has(node)) return;
              if (applyPositionToNode(node, livePos, updatedNodes)) hasUpdates = true;
            });
          });
        }

        // Apply from cursor server (ultra-low latency when dedicated cursor server is used)
        const cursorServerMap = cursorServerLivePositions?.current;
        if (cursorServerMap && cursorServerMap.size > 0) {
          cursorServerMap.forEach((livePos, objectId) => {
            const nodes = stage.find(`#${objectId}`);
            if (nodes.length === 0) return;
            const node = nodes[0];
            if (!node || updatedNodes.has(node)) return;
            if (applyPositionToNode(node, livePos, updatedNodes)) hasUpdates = true;
          });
        }

        if (hasUpdates) {
          const layers = stage.getLayers();
          layers.forEach(layer => layer.batchDraw());
        }
      }

      rafId = requestAnimationFrame(applyLiveUpdates);
    };

    rafId = requestAnimationFrame(applyLiveUpdates);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [awareness, currentUserId, stageRef, objectsMap, cursorServerLivePositions]);

  // Hook doesn't need to expose anything - it works automatically!
  return {};
}
