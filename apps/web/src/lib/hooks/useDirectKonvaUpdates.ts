/**
 * Direct Konva Updates Hook
 * 
 * Bypasses React for 60fps real-time collaboration.
 * Updates Konva nodes directly from Yjs awareness.
 */

'use client';

import { useEffect, useRef } from 'react';
import type Konva from 'konva';

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

interface DirectKonvaUpdatesProps {
  awareness: AwarenessLike | null;
  currentUserId: string;
  stageRef: React.RefObject<Konva.Stage>;
}

export function useDirectKonvaUpdates({
  awareness,
  currentUserId,
  stageRef,
}: DirectKonvaUpdatesProps) {
  const lastUpdateTime = useRef(performance.now());
  
  // Direct update loop using RAF for 60fps
  useEffect(() => {
    if (!awareness || !stageRef.current) return;

    let rafId: number;

    const applyLiveUpdates = (currentTime: number) => {
      // Target 60fps (16.67ms per frame)
      const elapsed = currentTime - lastUpdateTime.current;

      if (elapsed >= 8) { // ~120fps for ultra-smooth updates
        lastUpdateTime.current = currentTime;

        const stage = stageRef.current;
        if (!stage) {
          rafId = requestAnimationFrame(applyLiveUpdates);
          return;
        }

        const states = awareness.getStates();
        let hasUpdates = false;
        const updatedNodes = new Set<Konva.Node>();

        states.forEach((state) => {
          const userId = (state.user as any)?.id;
          if (userId === currentUserId) return; // Skip own updates

          const livePositions = (state.livePositions || {}) as Record<string, LivePosition>;

          Object.entries(livePositions).forEach(([objectId, livePos]) => {
            // Find node by ID (Konva's built-in find)
            const nodes = stage.find(`#${objectId}`);
            if (nodes.length === 0) return;

            const node = nodes[0];
            if (!node || updatedNodes.has(node)) return;

            // Apply updates directly to Konva node (no React involved!)
            const currentX = node.x();
            const currentY = node.y();

            // Only update if position changed significantly
            if (Math.abs(currentX - livePos.x) > 0.1 || Math.abs(currentY - livePos.y) > 0.1) {
              node.x(livePos.x);
              node.y(livePos.y);
              hasUpdates = true;
              updatedNodes.add(node);
            }

            // Apply rotation if provided
            if (livePos.rotation !== undefined) {
              const currentRotation = node.rotation();
              if (Math.abs(currentRotation - livePos.rotation) > 0.1) {
                node.rotation(livePos.rotation);
                hasUpdates = true;
              }
            }

            // Apply size changes if provided
            if (livePos.width !== undefined) {
              const currentWidth = node.width();
              if (Math.abs(currentWidth - livePos.width) > 0.1) {
                node.width(livePos.width);
                hasUpdates = true;
              }
            }

            if (livePos.height !== undefined) {
              const currentHeight = node.height();
              if (Math.abs(currentHeight - livePos.height) > 0.1) {
                node.height(livePos.height);
                hasUpdates = true;
              }
            }

            // Apply radius for circles
            if (livePos.radius !== undefined && (node as any).radius) {
              const currentRadius = (node as any).radius();
              if (Math.abs(currentRadius - livePos.radius) > 0.1) {
                (node as any).radius(livePos.radius);
                hasUpdates = true;
              }
            }
          });
        });

        // Batch draw only if we had updates (efficient!)
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
  }, [awareness, currentUserId, stageRef]);

  // Hook doesn't need to expose anything - it works automatically!
  return {};
}
