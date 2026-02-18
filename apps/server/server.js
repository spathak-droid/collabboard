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
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { traceable } from 'langsmith/traceable';
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

// ── AI Assistant WebSocket (path-based, SAME PORT) ──────────
const aiWss = new WebSocketServer({ noServer: true });

const openaiApiKey = process.env.OPENAI_API_KEY || '';
let openai = null;
const langsmithEnabled = process.env.LANGSMITH_TRACING === 'true' && !!process.env.LANGSMITH_API_KEY;
if (openaiApiKey) {
  const rawClient = new OpenAI({ apiKey: openaiApiKey });
  openai = langsmithEnabled ? wrapOpenAI(rawClient) : rawClient;
  console.log(`🤖 OpenAI client initialized${langsmithEnabled ? ' (LangSmith tracing ON)' : ''}`);
} else {
  console.warn('⚠️  No OPENAI_API_KEY — AI Assistant disabled');
}

const AI_SYSTEM_PROMPT = `You are an AI assistant for a collaborative whiteboard application. You help users create, manipulate, and organize objects on their whiteboard by calling the provided tools.

## Canvas Coordinate System
- Origin (0, 0) is the top-left of the canvas.
- Positive X goes right, positive Y goes down.
- Sticky notes are 200x200 px by default.
- When placing multiple objects, space them with ~220px gaps (200px object + 20px padding).

## Color Palette
Sticky note colors: yellow, pink, blue, green, orange.
Shape colors: use hex strings like "#3B82F6" (blue), "#EF4444" (red), "#10B981" (green), "#A855F7" (purple), "#F97316" (orange), "#6366F1" (indigo), "#EC4899" (pink).

## Layout Guidelines
- For grids: calculate positions as (startX + col * spacingX, startY + row * spacingY).
- Default grid spacing: 220px horizontal, 220px vertical (for sticky notes).
- For templates (SWOT, retro, journey maps): create frames first, then place sticky notes inside them.
- When creating templates, use a starting position of x=100, y=100 unless the user specifies otherwise.

## Manipulation Rules
- When asked to move objects, use the objectId from the board state.
- When asked to "move all pink sticky notes", find them in the board state and issue moveObject calls for each.
- When resizing frames to fit contents, calculate the bounding box of contained objects and add 40px padding.

## Response Style
- Execute the user's request by calling the appropriate tools.
- For complex templates, call multiple tools in sequence.
- If the user's request is ambiguous, make reasonable assumptions and proceed.
- Always respond with tool calls — do not just describe what you would do.`;

const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'createStickyNote',
      description: 'Create a sticky note on the whiteboard. Use for brainstorming items, ideas, labels, or any text-based card.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content of the sticky note' },
          x: { type: 'number', description: 'X position on canvas in pixels. If omitted, auto-placed.' },
          y: { type: 'number', description: 'Y position on canvas in pixels. If omitted, auto-placed.' },
          color: { type: 'string', enum: ['yellow', 'pink', 'blue', 'green', 'orange'], description: 'Sticky note color. Defaults to yellow.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createShape',
      description: 'Create a geometric shape (rectangle, circle, triangle, or star) on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['rect', 'circle', 'triangle', 'star'], description: 'Shape type' },
          x: { type: 'number', description: 'X position on canvas in pixels' },
          y: { type: 'number', description: 'Y position on canvas in pixels' },
          width: { type: 'number', description: 'Width in pixels (default 150)' },
          height: { type: 'number', description: 'Height in pixels (default 150)' },
          color: { type: 'string', description: 'Fill color as hex string (e.g. "#3B82F6") or color name' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createFrame',
      description: 'Create a frame (grouping container) on the whiteboard. Frames visually group objects and have a title label.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Frame title / label' },
          x: { type: 'number', description: 'X position on canvas in pixels' },
          y: { type: 'number', description: 'Y position on canvas in pixels' },
          width: { type: 'number', description: 'Width in pixels (default 400)' },
          height: { type: 'number', description: 'Height in pixels (default 400)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createConnector',
      description: 'Create a line/connector between two existing objects on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'ID of the source object' },
          toId: { type: 'string', description: 'ID of the target object' },
          style: { type: 'string', enum: ['straight', 'curved'], description: 'Connector style (default straight)' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moveObject',
      description: 'Move an existing object to a new position on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to move' },
          x: { type: 'number', description: 'New X position in pixels' },
          y: { type: 'number', description: 'New Y position in pixels' },
        },
        required: ['objectId', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resizeObject',
      description: 'Resize an existing object on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to resize' },
          width: { type: 'number', description: 'New width in pixels' },
          height: { type: 'number', description: 'New height in pixels' },
        },
        required: ['objectId', 'width', 'height'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateText',
      description: 'Update the text content of an existing sticky note or text element.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to update' },
          newText: { type: 'string', description: 'New text content' },
        },
        required: ['objectId', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeColor',
      description: 'Change the color of an existing object. For sticky notes use color names (yellow, pink, blue, green, orange). For shapes use hex colors.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to recolor' },
          color: { type: 'string', description: 'New color — a name for sticky notes, or a hex string for shapes' },
        },
        required: ['objectId', 'color'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBoardState',
      description: 'Retrieve the current state of all objects on the whiteboard. Use this when you need to know what already exists before making changes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

/**
 * Core LLM call — extracted so LangSmith can trace inputs/outputs.
 * Returns { assistantMessage, toolCalls } or throws on error.
 */
const callOpenAI = traceable(
  async function callOpenAI({ userMessage, boardState, conversationHistory }) {
    let boardContext = 'The board is currently empty.';
    if (boardState && boardState.objectCount > 0) {
      const lines = boardState.objects.map((obj) => {
        const parts = [`id=${obj.id}`, `type=${obj.type}`, `pos=(${obj.x},${obj.y})`];
        if (obj.width !== undefined) parts.push(`w=${obj.width}`);
        if (obj.height !== undefined) parts.push(`h=${obj.height}`);
        if (obj.radius !== undefined) parts.push(`r=${obj.radius}`);
        if (obj.color) parts.push(`color=${obj.color}`);
        if (obj.text) parts.push(`text="${obj.text}"`);
        if (obj.name) parts.push(`name="${obj.name}"`);
        return parts.join(' ');
      });
      boardContext = `Board has ${boardState.objectCount} object(s):\n${lines.join('\n')}`;
    }

    const messages = [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'system', content: `Current board state:\n${boardContext}` },
      ...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userMessage },
    ];

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: AI_TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
    });
    const duration = Date.now() - startTime;

    console.log(`🤖 AI response in ${duration}ms, tokens: ${response.usage?.total_tokens || '?'}`);

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    const assistantMessage = choice.message.content ?? 'Done! I executed the requested changes.';
    const toolCalls = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === 'function') {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args });
        }
      }
    }

    return { assistantMessage, toolCalls };
  },
  { name: 'ai-board-command', run_type: 'chain' }
);

/**
 * Handle a single AI command message from a WebSocket client.
 * Parses the request, calls the traced LLM function, and sends back results.
 */
async function handleAIMessage(ws, data) {
  if (!openai) {
    ws.send(JSON.stringify({ type: 'error', error: 'AI Assistant is not configured (missing OPENAI_API_KEY)' }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
    return;
  }

  const { message, boardState, conversationHistory = [] } = parsed;

  if (!message || typeof message !== 'string') {
    ws.send(JSON.stringify({ type: 'error', error: 'message is required' }));
    return;
  }

  try {
    ws.send(JSON.stringify({ type: 'processing' }));

    const result = await callOpenAI({
      userMessage: message,
      boardState,
      conversationHistory,
    });

    ws.send(JSON.stringify({
      type: 'result',
      actions: result.toolCalls,
      assistantMessage: result.assistantMessage,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown OpenAI error';
    console.error('🤖 AI error:', errorMessage);
    ws.send(JSON.stringify({ type: 'error', error: `OpenAI API error: ${errorMessage}` }));
  }
}

aiWss.on('connection', (ws, request, boardId) => {
  console.log(`🤖 AI: client connected for board ${boardId}`);

  ws.on('message', (data) => {
    handleAIMessage(ws, data.toString());
  });

  ws.on('close', () => {
    console.log(`🤖 AI: client disconnected from board ${boardId}`);
  });

  ws.on('error', (err) => {
    console.error(`🤖 AI error for board ${boardId}:`, err.message);
  });

  ws.send(JSON.stringify({ type: 'connected', boardId }));
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
  res.end('CollabBoard WebSocket Server\n\nRoutes:\n- /cursor/{boardId} - Ultra-fast cursor sync\n- /ai/{boardId} - AI Assistant (OpenAI)\n- / - CRDT object sync (Hocuspocus)');
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
  } else if (url.pathname.startsWith('/ai/')) {
    // Route: /ai/{boardId}
    const boardId = url.pathname.replace('/ai/', '').replace('/', '');
    
    aiWss.handleUpgrade(request, socket, head, (ws) => {
      aiWss.emit('connection', ws, request, boardId);
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
  console.log(`🤖 AI Assistant: ws://0.0.0.0:${port}/ai/{boardId}`);
  console.log(`💾 Supabase: ${supabase ? 'connected' : 'disabled'}`);
  console.log(`🤖 OpenAI: ${openai ? 'enabled' : 'disabled'}`);
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
