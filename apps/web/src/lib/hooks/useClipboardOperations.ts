/**
 * Hook for clipboard operations (copy/paste/duplicate)
 */

import { useCallback, useRef, useState } from 'react';
import type { WhiteboardObject } from '@/types/canvas';

/**
 * Hook that provides clipboard operations for objects.
 */
export function useClipboardOperations(
  objects: WhiteboardObject[],
  selectedIds: string[],
  createObject: (obj: WhiteboardObject) => void,
  deselectAll: () => void,
  selectObject: (id: string, multi: boolean) => void,
  user: { uid: string } | null,
  getCurrentCanvasCursor: () => { x: number; y: number },
  cloneObjectsAtPoint: (
    source: WhiteboardObject[],
    target: { x: number; y: number },
    userId: string
  ) => WhiteboardObject[]
) {
  const clipboardRef = useRef<WhiteboardObject[]>([]);
  const pasteCountRef = useRef<number>(0);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Show copy toast notification.
   */
  const showCopyToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastVisible(false);
    }, 2000);
  }, []);

  /**
   * Copy selected objects to clipboard.
   */
  const copySelectedObjects = useCallback(async () => {
    const selectedObjects = objects.filter((obj) => selectedIds.includes(obj.id));
    if (selectedObjects.length === 0) return;

    // Store in memory clipboard for internal paste
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 0;

    // Copy to system clipboard using Clipboard API
    try {
      const clipboardData = JSON.stringify(selectedObjects);
      await navigator.clipboard.writeText(clipboardData);
      // Show success toast
      showCopyToast();
    } catch (err) {
      // Fallback: clipboard API might not be available (e.g., non-HTTPS)
      console.warn('Failed to copy to system clipboard:', err);
      // Still show toast even if clipboard API failed (memory clipboard worked)
      showCopyToast();
    }
  }, [selectedIds, objects, showCopyToast]);

  /**
   * Paste objects from clipboard.
   */
  const pasteClipboardObjects = useCallback(async () => {
    if (!user) return;

    // Try to read from system clipboard first
    let objectsToPaste: WhiteboardObject[] = [];
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        try {
          const parsed = JSON.parse(clipboardText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            objectsToPaste = parsed;
          }
        } catch {
          // Not valid JSON, fall back to memory clipboard
        }
      }
    } catch (err) {
      // Clipboard API might not be available, fall back to memory clipboard
    }

    // Fall back to memory clipboard if system clipboard didn't work
    if (objectsToPaste.length === 0 && clipboardRef.current.length > 0) {
      objectsToPaste = clipboardRef.current;
    }

    if (objectsToPaste.length === 0) return;

    // Clone objects at current cursor position
    const cloned = cloneObjectsAtPoint(objectsToPaste, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;

    // Create cloned objects
    cloned.forEach((obj) => createObject(obj));

    // Select the last pasted object
    if (cloned.length > 0) {
      deselectAll();
      selectObject(cloned[cloned.length - 1].id, false);
    }

    pasteCountRef.current += 1;
  }, [
    user,
    cloneObjectsAtPoint,
    getCurrentCanvasCursor,
    createObject,
    deselectAll,
    selectObject,
  ]);

  /**
   * Duplicate selected objects.
   */
  const duplicateSelectedObjects = useCallback(() => {
    const selectedObjects = objects.filter((obj) => selectedIds.includes(obj.id));
    if (selectedObjects.length === 0 || !user) return;
    const cloned = cloneObjectsAtPoint(selectedObjects, getCurrentCanvasCursor(), user.uid);
    if (cloned.length === 0) return;
    cloned.forEach((obj) => createObject(obj));
    clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
    pasteCountRef.current = 1;
    
    // Deselect all, then select the last cloned object (usually the frame if frames were cloned)
    deselectAll();
    if (cloned.length > 0) {
      selectObject(cloned[cloned.length - 1].id, false);
    }
  }, [selectedIds, objects, user, cloneObjectsAtPoint, getCurrentCanvasCursor, createObject, deselectAll, selectObject]);

  return {
    copyToastVisible,
    copySelectedObjects,
    pasteClipboardObjects,
    duplicateSelectedObjects,
  };
}
