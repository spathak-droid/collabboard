/**
 * Yjs sync utilities for Supabase Database persistence
 * 
 * Stores snapshots in board_snapshots table as base64 encoded strings.
 * This is the same format used by the Hocuspocus server.
 */

import * as Y from 'yjs';
import { supabase } from '@/lib/supabase/client';

export const encodeYjsState = (ydoc: Y.Doc): Uint8Array => {
  return Y.encodeStateAsUpdate(ydoc);
};

export const decodeYjsState = (bytes: Uint8Array): Uint8Array => {
  return bytes;
};

/**
 * Save Yjs document snapshot to Supabase Database
 * Stores as base64 in board_snapshots table
 */
export const saveSnapshot = async (
  boardId: string,
  ydoc: Y.Doc,
  userId: string
): Promise<void> => {
  try {
    const state = encodeYjsState(ydoc);
    
    // Convert Uint8Array to base64
    let binary = '';
    for (let i = 0; i < state.length; i++) {
      binary += String.fromCharCode(state[i]);
    }
    const base64 = btoa(binary);
    
    // Insert into board_snapshots table
    const { error } = await supabase
      .from('board_snapshots')
      .insert({
        board_id: boardId,
        state: base64,
        created_by: userId,
      });
    
    if (error) {
      console.error('[Yjs Sync] Failed to save snapshot to database:', error);
      throw error;
    }
    
    // Update board last_modified timestamp
    await supabase
      .from('boards')
      .update({ last_modified: new Date().toISOString() })
      .eq('id', boardId);
    
    console.log(`[Yjs Sync] Snapshot saved to database for board ${boardId} (${state.length} bytes)`);
  } catch (error) {
    console.error('[Yjs Sync] saveSnapshot error:', error);
    throw error;
  }
};

/**
 * Load Yjs document snapshot from Supabase Database
 * Snapshots are stored in board_snapshots table as base64
 */
export const loadSnapshot = async (boardId: string): Promise<Uint8Array | null> => {
  try {
    console.log(`[Yjs Sync] Loading snapshot for board ${boardId} from database...`);
    
    // Load from board_snapshots table
    const { data, error } = await supabase
      .from('board_snapshots')
      .select('state')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log(`[Yjs Sync] No snapshot found for board ${boardId} (new board)`);
        return null;
      }
      console.error('[Yjs Sync] Failed to load snapshot from database:', error);
      return null;
    }
    
    if (!data?.state) {
      console.log(`[Yjs Sync] No snapshot data for board ${boardId}`);
      return null;
    }
    
    // Decode base64 to Uint8Array
    const base64 = data.state;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log(`[Yjs Sync] Snapshot loaded from database for board ${boardId} (${bytes.length} bytes)`);
    return bytes;
  } catch (error) {
    console.error('[Yjs Sync] loadSnapshot error:', error);
    return null;
  }
};
