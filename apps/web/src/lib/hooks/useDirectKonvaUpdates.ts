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

interface DirectKonvaUpdatesProps {
  awareness: AwarenessLike | null;
  currentUserId: string;
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Optional: live positions from cursor server (ultra-low latency when used) */
  cursorServerLivePositions?: React.RefObject<Map<string, CursorServerLivePosition>>;
}

export function useDirectKonvaUpdates({
  awareness,
  currentUserId,
  stageRef,
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
    if (livePos.radius !== undefined && (node as any).radius) {
      const currentRadius = (node as any).radius();
      if (Math.abs(currentRadius - livePos.radius) > 0.1) {
        (node as any).radius(livePos.radius);
        hasUpdates = true;
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

        // Apply from Yjs awareness
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
  }, [awareness, currentUserId, stageRef, cursorServerLivePositions]);

  // Hook doesn't need to expose anything - it works automatically!
  return {};
}
