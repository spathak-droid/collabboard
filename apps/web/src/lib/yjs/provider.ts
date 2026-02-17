/**
 * Yjs WebSocket provider — uses @hocuspocus/provider (the native client
 * for Hocuspocus servers). This avoids the binary-token auth issue that
 * y-websocket has when talking to Hocuspocus.
 */

'use client';

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { WhiteboardObject } from '@/types/canvas';
import type { AwarenessState } from '@/types/yjs';

export class YjsProvider {
  public ydoc: Y.Doc;
  public hocuspocus: HocuspocusProvider | null = null;
  public objects: Y.Map<WhiteboardObject>;
  public meta: Y.Map<string>;

  constructor() {
    this.ydoc = new Y.Doc();
    this.objects = this.ydoc.getMap('objects');
    this.meta = this.ydoc.getMap('meta');
  }

  connect(boardId: string, user: { id: string; name: string; color: string }) {
    if (this.hocuspocus) {
      this.disconnect();
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234';

    this.hocuspocus = new HocuspocusProvider({
      url: wsUrl,
      name: `board-${boardId}`,
      document: this.ydoc,
      // Auth token sent via the Hocuspocus auth protocol (not raw binary)
      token: JSON.stringify({ userId: user.id, userName: user.name }),
      onAuthenticated: () => {
        console.log('[Yjs] Authenticated with server');
      },
      onAuthenticationFailed: ({ reason }) => {
        console.error('[Yjs] Auth failed:', reason);
      },
    });

    // Set user awareness (shared with other clients)
    this.hocuspocus.setAwarenessField('user', user);

    return this.hocuspocus;
  }

  disconnect() {
    if (this.hocuspocus) {
      this.hocuspocus.disconnect();
      this.hocuspocus.destroy();
      this.hocuspocus = null;
    }
  }

  // ── CRUD operations on the shared Y.Map ──────────────────

  updateObject(id: string, data: Partial<WhiteboardObject>) {
    const existing = this.objects.get(id);
    if (existing) {
      this.objects.set(id, { ...existing, ...data } as WhiteboardObject);
    }
  }

  createObject(object: WhiteboardObject) {
    this.objects.set(object.id, object);
  }

  deleteObject(id: string) {
    this.objects.delete(id);
  }

  getObject(id: string): WhiteboardObject | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): WhiteboardObject[] {
    return Array.from(this.objects.values());
  }

  // ── Awareness helpers ────────────────────────────────────

  private _cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingCursor: { x: number; y: number } | null = null;

  updateCursor(x: number, y: number) {
    if (!this.hocuspocus) return;

    this._pendingCursor = { x, y };

    if (this._cursorThrottleTimer) return;

    this._cursorThrottleTimer = setTimeout(() => {
      if (this._pendingCursor) {
        this.hocuspocus?.setAwarenessField('cursor', {
          x: this._pendingCursor.x,
          y: this._pendingCursor.y,
          lastUpdate: Date.now(),
        });
        this._pendingCursor = null;
      }
      this._cursorThrottleTimer = null;
    }, 30);
  }

  getAwarenessStates(): Map<number, AwarenessState> {
    if (!this.hocuspocus) return new Map();
    return this.hocuspocus.awareness!.getStates() as Map<number, AwarenessState>;
  }

  onAwarenessChange(callback: () => void) {
    if (!this.hocuspocus) return () => {};
    this.hocuspocus.awareness!.on('change', callback);
    return () => {
      this.hocuspocus?.awareness?.off('change', callback);
    };
  }

  // ── Y.Map observer ──────────────────────────────────────

  onObjectsChange(callback: () => void) {
    this.objects.observe(callback);
    return () => {
      this.objects.unobserve(callback);
    };
  }

  // ── Board metadata (title, etc.) ──────────────────────────

  setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  getMeta(key: string): string | undefined {
    return this.meta.get(key);
  }

  onMetaChange(callback: () => void) {
    this.meta.observe(callback);
    return () => {
      this.meta.unobserve(callback);
    };
  }

  // ── Connection status ────────────────────────────────────

  onStatusChange(callback: (status: { status: 'connected' | 'disconnected' }) => void) {
    if (!this.hocuspocus) return () => {};
    this.hocuspocus.on('status', callback);
    return () => {
      this.hocuspocus?.off('status', callback);
    };
  }
}
