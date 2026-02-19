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
import { createClient } from '@supabase/supabase-js';
import { createDatabaseExtension } from './utils/database-extension.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { traceable } from 'langsmith/traceable';
import dotenv from 'dotenv';
import { AI_SYSTEM_PROMPT, AI_TOOLS, buildAIContext } from './utils/ai-tools.js';
import { orchestrateAgents, continueOrchestration } from './utils/agent-orchestrator.js';

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

// ── Build extensions list ───────────────────────────────────
const extensions = [];
if (supabase) {
  extensions.push(createDatabaseExtension(supabase));
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

/**
 * Execute analyzeObjects tool server-side and return results.
 * This allows the AI to see the results and generate a proper response.
 */
function executeAnalyzeObjectsServerSide(objectIds, boardState) {
  const objects = boardState?.objects || [];
  const objectsToAnalyze = objectIds && objectIds.length > 0
    ? objectIds.map((id) => objects.find((o) => o.id === id)).filter((o) => o != null)
    : objects;

  if (objectsToAnalyze.length === 0) {
    return { totalObjects: 0, countByType: {}, countByColor: {}, countByTypeAndColor: {} };
  }

  const countByType = {};
  const countByColor = {};
  const countByTypeAndColor = {};

  const typeMap = {
    sticky: 'sticky note',
    rect: 'rectangle',
    circle: 'circle',
    triangle: 'triangle',
    star: 'star',
    line: 'connector',
    frame: 'frame',
  };

  for (const obj of objectsToAnalyze) {
    const type = typeMap[obj.type] || obj.type;
    let color = 'none';

    // Get color from object - use raw values, let AI interpret
    if (obj.type === 'sticky' && obj.color) {
      color = obj.color;
    } else if (obj.type === 'circle' || obj.type === 'rect' || obj.type === 'triangle' || obj.type === 'star') {
      // For shapes, check both fill and stroke
      // Use fill if it's a visible color (not white/transparent), otherwise use stroke
      const isFillVisible = obj.fill && 
        obj.fill !== '#FFFFFF' && 
        obj.fill !== '#ffffff' && 
        obj.fill !== 'transparent' && 
        obj.fill !== 'rgba(255,255,255,0)' && 
        obj.fill !== 'white' &&
        obj.fill !== '#FFF' &&
        obj.fill !== '#fff';
      
      if (isFillVisible) {
        color = obj.fill;
      } else if (obj.stroke) {
        // Use stroke if fill is white/transparent or missing
        color = obj.stroke;
      } else if (obj.fill) {
        // Fallback to fill even if white
        color = obj.fill;
      }
    } else if (obj.type === 'frame' || obj.type === 'line') {
      color = 'none';
    }

    console.log(`  📊 Analyzing: ${obj.type} (${type}) with fill=${obj.fill || 'none'}, stroke=${obj.stroke || 'none'}, detected color=${color}`);

    countByType[type] = (countByType[type] || 0) + 1;
    countByColor[color] = (countByColor[color] || 0) + 1;
    countByTypeAndColor[`${color}_${type}`] = (countByTypeAndColor[`${color}_${type}`] || 0) + 1;
  }

  console.log(`  📊 Analysis complete: ${objectsToAnalyze.length} objects`);
  console.log(`  📊 By type:`, countByType);
  console.log(`  📊 By color:`, countByColor);
  console.log(`  📊 By type+color:`, countByTypeAndColor);

  return {
    totalObjects: objectsToAnalyze.length,
    countByType,
    countByColor,
    countByTypeAndColor,
  };
}

/**
 * Core LLM call with two-step tool execution support.
 * If requiresFollowUp is true, the client should execute tools, send results back,
 * and we'll make a second LLM call with the updated board state.
 * 
 * Returns { assistantMessage, toolCalls, requiresFollowUp } or throws on error.
 */
const callOpenAI = traceable(
  async function callOpenAI({ userMessage, boardState, conversationHistory, selectedIds = [], selectionArea = null, toolExecutionResults = null }) {
    const context = buildAIContext(boardState, selectedIds, selectionArea);

    const messages = [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'system', content: `Current board state:\n${context}` },
      ...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
    ];

    // If this is a follow-up call with tool execution results, add them to the conversation
    if (toolExecutionResults) {
      messages.push({ role: 'user', content: userMessage });
      messages.push({
        role: 'assistant',
        content: `I executed the following actions:\n${toolExecutionResults.summary}\n\nCreated object IDs: ${toolExecutionResults.createdIds.join(', ')}\n\nNow I can see the updated board state above. What should I do next?`,
      });
      messages.push({
        role: 'user',
        content: 'Based on my original request and the actions you just completed, continue with any remaining steps needed.',
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

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

    let assistantMessage = choice.message.content ?? "I've made the changes you requested.";
    const toolCalls = [];
    let requiresFollowUp = false;

    if (choice.message.tool_calls) {
      // Check if analyzeObjects is being called
      const analyzeCall = choice.message.tool_calls.find(tc => tc.function.name === 'analyzeObjects');
      
      if (analyzeCall) {
        // Execute analyzeObjects server-side and send results back to AI
        let args;
        try { args = JSON.parse(analyzeCall.function.arguments); } catch { args = {}; }
        
        const objectIdsToAnalyze = (args.objectIds && args.objectIds.length > 0) 
          ? args.objectIds 
          : (selectedIds && selectedIds.length > 0 ? selectedIds : []);
        
        const analysisResult = executeAnalyzeObjectsServerSide(objectIdsToAnalyze, boardState);
        
        const breakdown = Object.entries(analysisResult.countByTypeAndColor)
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => {
            const [color, ...typeParts] = key.split('_');
            const type = typeParts.join('_');
            return `${count} ${color} ${type}${count !== 1 ? 's' : ''}`;
          })
          .join(', ');
        
        const resultString = JSON.stringify({
          totalObjects: analysisResult.totalObjects,
          breakdown: breakdown,
          countByType: analysisResult.countByType,
          countByColor: analysisResult.countByColor,
          countByTypeAndColor: analysisResult.countByTypeAndColor,
        });

        const messages2 = [
          ...messages,
          choice.message,
          {
            role: 'tool',
            tool_call_id: analyzeCall.id,
            content: resultString,
          },
        ];

        const response2 = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages2,
          temperature: 0.3,
        });

        const choice2 = response2.choices[0];
        if (choice2?.message?.content) {
          assistantMessage = choice2.message.content;
        }

        console.log(`🤖 AI follow-up response generated after tool execution`);
      }

      // Collect all tool calls for client execution
      for (const tc of choice.message.tool_calls) {
        if (tc.type === 'function') {
          let args;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        }
      }

      // Check if we need a follow-up call after these tools execute
      // This happens when the AI needs to see the results before continuing
      const needsFollowUp = detectNeedsFollowUp(toolCalls, userMessage);
      if (needsFollowUp && !toolExecutionResults) {
        requiresFollowUp = true;
        assistantMessage = "Executing actions..."; // Temporary message
      }
    }

    return { assistantMessage, toolCalls, requiresFollowUp };
  },
  { name: 'callOpenAI' }
);

/**
 * Detect if the user's request requires a two-step execution.
 * Examples:
 * - "delete everything and create 2 stars"
 * - "clear the board and draw a workflow"  
 * - "create 2 stars connected by a line" (needs to create shapes first, then connector)
 */
function detectNeedsFollowUp(toolCalls, userMessage) {
  const lowerMessage = userMessage.toLowerCase();
  
  // Pattern 1: "delete/clear X and create/add Y"
  const hasClearAndCreate = 
    (lowerMessage.includes('delete') || lowerMessage.includes('clear') || lowerMessage.includes('remove')) &&
    (lowerMessage.includes('and') || lowerMessage.includes('then')) &&
    (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('draw'));
  
  // Pattern 2: "create X connected by/with Y"
  const hasConnectedShapes = 
    (lowerMessage.includes('connected') || lowerMessage.includes('with connector') || lowerMessage.includes('with line')) &&
    (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('draw'));
  
  // Pattern 3: Multiple create operations followed by operations that need IDs
  const hasCreateShapes = toolCalls.some(tc => tc.name === 'createShape' || tc.name === 'createStickyNote' || tc.name === 'createFrame');
  const hasConnector = toolCalls.some(tc => tc.name === 'createConnector');
  const needsIdsFromCreation = hasCreateShapes && hasConnector;
  
  return hasClearAndCreate || hasConnectedShapes || needsIdsFromCreation;
}

/**
 * Handle a single AI command message from a WebSocket client.
 * Uses hierarchical agent system: Supervisor → Worker Agents
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

  const { 
    message, 
    boardState, 
    conversationHistory = [], 
    selectedIds = [], 
    selectionArea,
    toolExecutionResults = null,
    remainingTasks = null,
  } = parsed;

  if (!message || typeof message !== 'string') {
    ws.send(JSON.stringify({ type: 'error', error: 'message is required' }));
    return;
  }

  try {
    ws.send(JSON.stringify({ type: 'processing' }));

    const context = buildAIContext(boardState, selectedIds, selectionArea);

    let result;
    
    // Progress callback to send incremental updates
    const progressCallback = (progressData) => {
      ws.send(JSON.stringify(progressData));
    };
    
    // If continuing from a previous task batch
    if (remainingTasks && toolExecutionResults) {
      console.log('🔄 Continuing multi-agent orchestration');
      result = await continueOrchestration(
        openai,
        remainingTasks,
        boardState,
        context,
        [toolExecutionResults],
        executeAnalyzeObjectsServerSide
      );
    } else {
      // Start new orchestration
      console.log('🎯 Starting multi-agent orchestration');
      result = await orchestrateAgents(
        openai,
        message,
        boardState,
        context,
        executeAnalyzeObjectsServerSide,
        progressCallback  // Pass the callback
      );
    }

    // Send final response only if we didn't send progress updates
    // (if progress was sent, each step already got its own message)
    if (!result.progressSent) {
      ws.send(JSON.stringify({
        type: 'result',
        actions: result.toolCalls || [],
        assistantMessage: result.summary || result.supervisorPlan?.summary || "I've completed the tasks",
        requiresFollowUp: result.needsFollowUp || false,
        remainingTasks: result.remainingTasks || null,
        supervisorPlan: result.supervisorPlan || null,
      }));
    } else {
      // Progress updates were sent, just send completion signal
      ws.send(JSON.stringify({
        type: 'complete',
        message: 'All tasks completed',
      }));
    }
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
