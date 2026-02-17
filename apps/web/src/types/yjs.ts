/**
 * Yjs and real-time sync types
 */

import type { WhiteboardObject } from './canvas';

export interface YjsDocument {
  objects: Map<string, WhiteboardObject>;
}

export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: {
    x: number;
    y: number;
    lastUpdate: number;
  };
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'connecting';
  message?: string;
}
