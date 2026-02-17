/**
 * Yjs sync utilities for Supabase persistence
 */

import * as Y from 'yjs';
import { supabase } from '@/lib/supabase/client';

export const encodeYjsState = (ydoc: Y.Doc): string => {
  const state = Y.encodeStateAsUpdate(ydoc);
  let binary = '';
  const bytes = new Uint8Array(state);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decodeYjsState = (base64State: string): Uint8Array => {
  return Uint8Array.from(atob(base64State), (c) => c.charCodeAt(0));
};

export const saveSnapshot = async (
  boardId: string,
  ydoc: Y.Doc,
  userId: string
): Promise<void> => {
  const state = encodeYjsState(ydoc);
  
  const { error } = await supabase.from('board_snapshots').insert({
    board_id: boardId,
    state,
    created_by: userId,
  });
  
  if (error) {
    console.error('Failed to save snapshot:', error);
    throw error;
  }
};

export const loadSnapshot = async (boardId: string): Promise<Uint8Array | null> => {
  const { data, error } = await supabase
    .from('board_snapshots')
    .select('state')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No snapshot found
      return null;
    }
    console.error('Failed to load snapshot:', error);
    throw error;
  }
  
  if (!data?.state) {
    return null;
  }
  
  return decodeYjsState(data.state);
};

export const updateBoardMetadata = async (
  boardId: string,
  updates: { title?: string; last_modified?: string; thumbnail?: string }
): Promise<void> => {
  const { error } = await supabase
    .from('boards')
    .update(updates)
    .eq('id', boardId);
  
  if (error) {
    console.error('Failed to update board metadata:', error);
    throw error;
  }
};
