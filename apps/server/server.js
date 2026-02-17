/**
 * Hocuspocus WebSocket Server v3
 * Handles real-time CRDT sync with Yjs
 *
 * MVP auth: user info sent as JSON token from @hocuspocus/provider.
 */

import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ── Supabase (for snapshot persistence) ─────────────────────
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('💾 Supabase client initialized');
} else {
  console.warn('⚠️  No Supabase credentials — running without persistence');
}

// ── Helper: extract board ID from document name ─────────────
const getBoardId = (documentName) => documentName.replace('board-', '');

// ── Build extensions list ───────────────────────────────────
const extensions = [];

if (supabase) {
  extensions.push(
    new Database({
      fetch: async ({ documentName }) => {
        const boardId = getBoardId(documentName);
        console.log(`📥 Fetching snapshot for board: ${boardId}`);

        try {
          const { data, error } = await supabase
            .from('board_snapshots')
            .select('state')
            .eq('board_id', boardId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              console.log(`   No snapshot found (new board)`);
              return null;
            }
            throw error;
          }

          if (!data?.state) return null;

          const bytes = Uint8Array.from(atob(data.state), (c) => c.charCodeAt(0));
          console.log(`   Loaded ${bytes.length} bytes`);
          return bytes;
        } catch (err) {
          console.error('   Fetch failed:', err.message);
          return null;
        }
      },

      store: async ({ documentName, state }) => {
        const boardId = getBoardId(documentName);
        console.log(`📤 Storing snapshot for board: ${boardId} (${state.length} bytes)`);

        try {
          const base64 = btoa(String.fromCharCode(...state));

          const { error } = await supabase.from('board_snapshots').insert({
            board_id: boardId,
            state: base64,
            created_by: null,
          });

          if (error) throw error;

          await supabase
            .from('boards')
            .update({ last_modified: new Date().toISOString() })
            .eq('id', boardId);
        } catch (err) {
          console.error('   Store failed:', err.message);
        }
      },
    })
  );
}

// ── Hocuspocus server (v3 API: new Server) ──────────────────
const server = new Server({
  extensions,

  // Parse user info from the JSON token sent by @hocuspocus/provider
  async onAuthenticate(data) {
    const { token, documentName } = data;
    console.log(`🔑 Auth attempt for: ${documentName}`);

    let userId = 'anonymous';
    let userName = 'Anonymous';

    if (token) {
      try {
        const parsed = JSON.parse(token);
        userId = parsed.userId || userId;
        userName = parsed.userName || userName;
      } catch {
        userId = token;
      }
    }

    console.log(`   ✅ ${userName} (${userId})`);

    return {
      user: { id: userId, name: userName },
    };
  },

  async onConnect(data) {
    const user = data.context?.user || {};
    console.log(`🟢 Connected: ${user.name || 'Unknown'} (${user.id || '?'}) → ${data.documentName}`);
  },

  async onDisconnect(data) {
    const user = data.context?.user || {};
    console.log(`🔴 Disconnected: ${user.name || 'Unknown'} (${user.id || '?'}) → ${data.documentName}`);
  },
});

// ── Catch unhandled errors so they don't crash the server ────
// The ERR_ENCODING_INVALID_ENCODED_DATA error comes from stale clients
// (e.g. y-websocket) sending binary auth tokens that Hocuspocus v3
// tries to decode as UTF-8 inside _readVarStringNative. These are
// harmless — the connection will fail and the client will retry or
// give up. Suppress the spam but log other real errors.
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
    // Silently ignore — stale client sending incompatible binary data
    return;
  }
  console.error('⚠️  Uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection (non-fatal):', reason);
});

// ── Start ───────────────────────────────────────────────────
const port = parseInt(process.env.PORT || '1234');
server.listen(port).then(() => {
  console.log('========================================');
  console.log('🚀 Hocuspocus WebSocket Server Running');
  console.log(`📡 Port: ${port}`);
  console.log(`💾 Supabase: ${supabase ? 'connected' : 'disabled'}`);
  console.log('========================================');
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  server.destroy();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.destroy();
  process.exit(0);
});
