/**
 * Hocuspocus WebSocket Server v3
 * Handles real-time CRDT sync with Yjs
 *
 * OPTIMIZATIONS:
 * - WebSocket compression (perMessageDeflate)
 * - Async snapshot storage (non-blocking)
 * - Path-based cursor routing on SAME PORT (Railway single-port compatible)
 * - Connection pooling for Supabase
 *
 * MVP auth: user info sent as JSON token from @hocuspocus/provider.
 */

import { Hocuspocus } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { createClient } from '@supabase/supabase-js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();

// ── Supabase (for snapshot persistence) ─────────────────────
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    db: {
      pool: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
      },
    },
    global: {
      headers: {
        'X-Client-Info': 'collab-board-server',
      },
    },
  });
  console.log('💾 Supabase client initialized with connection pooling');
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
            .order('created_at', { ascending: false})
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
        
        // Fire and forget - don't block WebSocket thread
        setImmediate(async () => {
          console.log(`📤 [Async] Storing snapshot for board: ${boardId} (${state.length} bytes)`);
          
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
            
            console.log(`   ✅ Snapshot saved (${state.length} bytes)`);
          } catch (err) {
            console.error('   Store failed:', err.message);
          }
        });
        
        // Return immediately - don't await DB operations
      },
    })
  );
}

// ── Lightweight Cursor WebSocket (path-based, SAME PORT) ────
const cursorWss = new WebSocketServer({ noServer: true });
const cursorRooms = new Map(); // boardId -> Map of WebSocket clients

cursorWss.on('connection', (ws, request, boardId, userId, userName) => {
  if (!cursorRooms.has(boardId)) {
    cursorRooms.set(boardId, new Map());
  }
  
  const room = cursorRooms.get(boardId);
  room.set(userId, { ws, userName });
  
  console.log(`🖱️  Cursor: ${userName} joined board ${boardId} (${room.size} users)`);

  ws.on('message', (data) => {
    const room = cursorRooms.get(boardId);
    if (!room) return;
    
    // Broadcast to all clients in room except sender
    room.forEach((client, clientUserId) => {
      if (clientUserId !== userId && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    });
  });

  ws.on('close', () => {
    const room = cursorRooms.get(boardId);
    if (room) {
      room.delete(userId);
      console.log(`🖱️  Cursor: ${userName} left board ${boardId} (${room.size} users)`);
      
      // Notify others of user leaving
      const leaveMsg = JSON.stringify({ type: 'leave', userId });
      room.forEach((client) => {
        if (client.ws.readyState === 1) {
          client.ws.send(leaveMsg);
        }
      });
      
      if (room.size === 0) cursorRooms.delete(boardId);
    }
  });
  
  ws.on('error', (err) => {
    console.error(`🖱️  Cursor error for ${userName}:`, err.message);
  });
});

// ── Hocuspocus server with optimizations ────────────────────
const hocuspocus = new Hocuspocus({
  extensions,
  
  // WebSocket compression for bandwidth reduction
  webSocketOptions: {
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3,
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      threshold: 1024,
    },
  },
  
  timeout: 30000,
  debounce: 2000,
  maxDebounce: 10000,

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
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
    return;
  }
  console.error('⚠️  Uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection (non-fatal):', reason);
});

// ── HTTP server with path-based WebSocket routing ───────────
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CollabBoard WebSocket Server\n\nRoutes:\n- /cursor/{boardId} - Ultra-fast cursor sync\n- / - CRDT object sync (Hocuspocus)');
});

// Create WebSocket server for routing
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // Route: /cursor/{boardId}?userId={userId}&userName={userName}
  if (url.pathname.startsWith('/cursor/')) {
    const boardId = url.pathname.replace('/cursor/', '').replace('/', '');
    const userId = url.searchParams.get('userId') || 'anonymous';
    const userName = url.searchParams.get('userName') || 'Anonymous';
    
    cursorWss.handleUpgrade(request, socket, head, (ws) => {
      cursorWss.emit('connection', ws, request, boardId, userId, userName);
    });
  } else {
    // All other routes go to Hocuspocus
    wss.handleUpgrade(request, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, request);
    });
  }
});

// ── Start HTTP server on SINGLE PORT ────────────────────────
const port = parseInt(process.env.PORT || '1234');

httpServer.listen(port, () => {
  console.log('========================================');
  console.log('🚀 CollabBoard WebSocket Server Running');
  console.log(`📦 CRDT (Hocuspocus): ws://0.0.0.0:${port}/`);
  console.log(`🖱️  Cursors: ws://0.0.0.0:${port}/cursor/{boardId}`);
  console.log(`💾 Supabase: ${supabase ? 'connected' : 'disabled'}`);
  console.log(`🗜️  Compression: enabled`);
  console.log(`✅ Single-port mode (Railway compatible)`);
  console.log('========================================');
});

httpServer.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  httpServer.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  httpServer.close();
  process.exit(0);
});
