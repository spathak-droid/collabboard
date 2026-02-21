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
import { createGeminiClient } from './utils/gemini-adapter.js';
import { routeCommand, executeSingleAgent, executeMiniAgent, classifyUserIntent, executeFromIntent, needsComplexSupervisor, executeComplexSupervisor } from './utils/command-router.js';
import { detectMiniAgent } from './utils/mini-agents.js';
import { executeCreativeComposer } from './utils/creative-composer.js';

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
  
  // Notify new user about existing users (so they can map hashes)
  const joinMessages = [];
  room.forEach((client, existingUserId) => {
    joinMessages.push(JSON.stringify({ 
      type: 'join', 
      userId: existingUserId, 
      userName: client.userName 
    }));
  });
  
  // Send existing users to new user
  joinMessages.forEach(msg => {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  });
  
  // Add new user to room
  room.set(userId, { ws, userName });
  
  console.log(`🖱️  Cursor: ${userName} joined board ${boardId} (${room.size} users)`);
  
  // Notify existing users about new user
  const newUserJoinMsg = JSON.stringify({ 
    type: 'join', 
    userId, 
    userName 
  });
  room.forEach((client, clientUserId) => {
    if (clientUserId !== userId && client.ws.readyState === 1) {
      client.ws.send(newUserJoinMsg);
    }
  });

  ws.on('message', (data) => {
    const room = cursorRooms.get(boardId);
    if (!room) return;
    
    // Convert Buffer to string to ensure consistent text encoding
    // This prevents binary data issues when messages pass through Railway's infrastructure
    const messageText = data.toString('utf8');
    
    // Broadcast to all clients in room except sender
    room.forEach((client, clientUserId) => {
      if (clientUserId !== userId && client.ws.readyState === 1) {
        client.ws.send(messageText);
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

// Check which AI provider is configured
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
let openai = null;
let aiProvider = 'none';

const langsmithEnabled = process.env.LANGSMITH_TRACING === 'true' && !!process.env.LANGSMITH_API_KEY;

if (openaiApiKey) {
  // Use OpenAI (prioritized)
  const rawClient = new OpenAI({ apiKey: openaiApiKey });
  openai = langsmithEnabled ? wrapOpenAI(rawClient) : rawClient;
  aiProvider = 'openai';
  console.log(`🤖 OpenAI client initialized (gpt-4o-mini)${langsmithEnabled ? ' (LangSmith tracing ON)' : ''}`);
} else if (geminiApiKey) {
  // Fall back to Gemini
  openai = createGeminiClient(geminiApiKey, 'gemini-2.5-flash');
  aiProvider = 'gemini';
  console.log(`🤖 Google Gemini client initialized (gemini-2.5-flash)${langsmithEnabled ? ' (LangSmith tracing ON)' : ''}`);
} else {
  console.warn('⚠️  No AI API key found (OPENAI_API_KEY or GOOGLE_GEMINI_API_KEY) — AI Assistant disabled');
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
  
  // Helper to convert hex color to human-readable name
  function hexToColorName(hex) {
    if (!hex || typeof hex !== 'string') return 'gray';
    
    // Normalize hex
    const cleanHex = hex.replace(/^#/, '').toUpperCase();
    
    // Color mapping from common hex values to names
    const colorMap = {
      'FFF59D': 'yellow',  // Sticky yellow
      'F48FB1': 'pink',    // Sticky pink
      '81D4FA': 'blue',    // Sticky blue
      'A5D6A7': 'green',   // Sticky green
      'FFCC80': 'orange',  // Sticky orange
      'EF4444': 'red',
      'EF5444': 'red',
      '3B82F6': 'blue',
      '10B981': 'green',
      'EAB308': 'yellow',
      'F97316': 'orange',
      'EC4899': 'pink',
      'A855F7': 'purple',
      '6B7280': 'gray',
      '000000': 'black',
      'FFFFFF': 'white',
      'FFF': 'white',
      'E5E7EB': 'light gray',
    };
    
    // Direct lookup
    if (colorMap[cleanHex]) {
      return colorMap[cleanHex];
    }
    
    // Convert to RGB for heuristic matching
    let r, g, b;
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
    } else if (cleanHex.length === 6) {
      r = parseInt(cleanHex.slice(0, 2), 16);
      g = parseInt(cleanHex.slice(2, 4), 16);
      b = parseInt(cleanHex.slice(4, 6), 16);
    } else {
      return 'gray';
    }
    
    // Simple heuristic-based color name detection
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    
    // Grayscale detection
    if (max - min < 30) {
      if (max < 50) return 'black';
      if (max > 200) return 'white';
      return 'gray';
    }
    
    // Color detection by dominant channel
    if (r > g && r > b) {
      if (g > b + 30) return 'orange';
      if (b > 100) return 'pink';
      return 'red';
    }
    if (g > r && g > b) {
      if (r > b + 30) return 'yellow';
      return 'green';
    }
    if (b > r && b > g) {
      if (r > 100) return 'purple';
      if (g > 100) return 'cyan';
      return 'blue';
    }
    
    return 'gray';
  }

  for (const obj of objectsToAnalyze) {
    const type = typeMap[obj.type] || obj.type;
    let color = 'none';

    // Get color from object and convert to human-readable name
    if (obj.type === 'sticky' && obj.color) {
      // Sticky notes have named colors
      color = hexToColorName(obj.color);
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
        color = hexToColorName(obj.fill);
      } else if (obj.stroke && obj.stroke !== '#000000' && obj.stroke !== 'black') {
        // Use stroke if fill is white/transparent and stroke is not black (default)
        color = hexToColorName(obj.stroke);
      } else if (obj.fill) {
        // Fallback to fill even if white
        color = hexToColorName(obj.fill);
      } else {
        color = 'gray'; // Default for shapes without color
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
      model: 'gpt-4.1-nano',
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
            // Skip "none" color - just show type
            if (color === 'none') {
              return `${count} ${type}${count !== 1 ? 's' : ''}`;
            }
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
          model: 'gpt-4.1-nano',
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
      // Smart routing: Choose optimal execution path
      const route = routeCommand(message, selectedIds?.length > 0);
      
      if (route.type === 'intent') {
        // Level 0: Intent Classifier (ULTRA-FAST, <300ms, direct execution)
        console.log(`⚡⚡⚡ INTENT CLASSIFIER: ${route.reason}`);
        
        try {
          // Classify intent
          const intent = await classifyUserIntent(openai, message);
          
          // Safety net: "create N objects all/with random/different colors" is NEVER multi-step.
          // The LLM sometimes misclassifies this as multi-step, causing the supervisor to
          // split it into create + changeColor with hallucinated IDs.
          if (intent && intent.isMultiStep) {
            const isSimpleCreateWithColors = /^(create|add|make|draw)\s+\d+\s+\w+.*\b(random|different|varied|various)\s*(color|colours?)\b/i.test(message);
            if (isSimpleCreateWithColors) {
              console.log('⚠️  Safety net: overriding isMultiStep=true for simple create-with-colors command');
              intent.isMultiStep = false;
              if (!intent.color) intent.color = 'random';
              if (!intent.colors || intent.colors.length === 0) {
                intent.colors = ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316'];
              }
            }
          }
          
          // Deterministic multi-color-group parser (ALWAYS runs for CREATE)
          // LLMs are unreliable at generating large repetitive arrays — they truncate.
          // e.g. "create 50 stars, 10 green, 10 purple and 30 red" → LLM returns 31 colors instead of 50.
          // This regex parser is the authoritative source for color groups.
          if (intent && intent.operation === 'CREATE') {
            const colorMap = {
              red: '#EF4444', blue: '#3B82F6', green: '#10B981', yellow: '#EAB308',
              orange: '#F97316', pink: '#EC4899', purple: '#A855F7', cyan: '#06B6D4',
              teal: '#14B8A6', indigo: '#6366F1', lime: '#84CC16', amber: '#F59E0B',
              white: '#FFFFFF', black: '#000000', gray: '#6B7280', grey: '#6B7280',
            };
            
            // Step 1: Try regex to extract color groups deterministically
            const colorGroupPattern = /(\d+)\s+(red|blue|green|yellow|orange|pink|purple|cyan|teal|indigo|lime|amber|white|black|gray|grey)/gi;
            const groups = [];
            let regexMatch;
            while ((regexMatch = colorGroupPattern.exec(message)) !== null) {
              groups.push({ count: parseInt(regexMatch[1], 10), colorName: regexMatch[2].toLowerCase() });
            }
            
            const llmColors = intent.colors || [];
            const llmLen = llmColors.length;
            const targetQty = intent.quantity || 0;
            
            if (groups.length >= 2) {
              // Regex found 2+ color groups — build the deterministic colors array
              const regexColors = [];
              let totalFromGroups = 0;
              for (const g of groups) {
                const hex = colorMap[g.colorName] || '#E5E7EB';
                for (let ci = 0; ci < g.count; ci++) {
                  regexColors.push(hex);
                }
                totalFromGroups += g.count;
              }
              
              // Use regex result if it covers the full quantity, OR if LLM had fewer/no colors
              // Use LLM result (padded) if regex missed colors due to typos and LLM has more unique colors
              const regexUnique = new Set(regexColors).size;
              const llmUnique = new Set(llmColors).size;
              
              if (totalFromGroups >= targetQty || llmLen === 0 || regexUnique >= llmUnique) {
                console.log(`🔧 Deterministic color parser: ${groups.length} groups → ${regexColors.length} colors (LLM had ${llmLen})`);
                intent.colors = regexColors;
                if (targetQty < totalFromGroups) {
                  intent.quantity = totalFromGroups;
                }
              } else {
                // LLM understood more colors (e.g. typos) — pad LLM's array to target quantity
                const padded = [];
                for (let pi = 0; pi < targetQty; pi++) {
                  padded.push(llmColors[pi % llmLen]);
                }
                console.log(`🔧 LLM had more unique colors (${llmUnique} vs regex ${regexUnique}) — padded LLM's ${llmLen} → ${padded.length}`);
                intent.colors = padded;
              }
              intent.isMultiStep = false;
            }
            // Step 2: No regex groups but LLM returned truncated colors array — pad it
            else if (llmLen > 0 && targetQty > 0 && llmLen < targetQty) {
              const padded = [];
              for (let pi = 0; pi < targetQty; pi++) {
                padded.push(llmColors[pi % llmLen]);
              }
              console.log(`🔧 Color array padding: LLM gave ${llmLen}, need ${targetQty} → padded by cycling`);
              intent.colors = padded;
            }
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'963e0f'},body:JSON.stringify({sessionId:'963e0f',location:'server.js:590',message:'Intent classifier result',data:{operation:intent?.operation,isMultiStep:intent?.isMultiStep,objectType:intent?.objectType,shapeType:intent?.shapeType,quantity:intent?.quantity,color:intent?.color,colorsLength:intent?.colors?.length,creativeDescription:intent?.creativeDescription,userMessage:message},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
          // #endregion

          // CREATIVE commands go directly to the creative composer (Planner+Executor)
          if (intent && intent.operation === 'CREATIVE') {
            // #region agent log
            fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'963e0f'},body:JSON.stringify({sessionId:'963e0f',location:'server.js:593',message:'CREATIVE branch taken - routing to Planner+Executor',data:{creativeDescription:intent.creativeDescription,userMessage:message},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log('🎨 Creative command detected, routing to Creative Composer (Planner+Executor)');
            
            let frameInfo = null;
            if (intent.targetFilter?.useSelection && selectedIds?.length > 0) {
              const selectedFrame = boardState?.objects?.find(obj =>
                selectedIds.includes(obj.id) && obj.type === 'frame'
              );
              if (selectedFrame) {
                frameInfo = {
                  id: selectedFrame.id,
                  x: selectedFrame.x,
                  y: selectedFrame.y,
                  width: selectedFrame.width || 800,
                  height: selectedFrame.height || 600,
                };
                console.log(`📦 [Creative Frame Context] Composing inside frame: ${frameInfo.id}`);
              }
            }
            
            try {
              const composerResult = await executeCreativeComposer(
                openai,
                message,
                boardState,
                context,
                intent.creativeDescription,
                frameInfo
              );
              
              // #region agent log
              fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'963e0f'},body:JSON.stringify({sessionId:'963e0f',location:'server.js:620',message:'Creative composer result',data:{toolCallCount:composerResult?.toolCalls?.length,summary:composerResult?.summary,success:composerResult?.success},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              
              result = {
                toolCalls: composerResult.toolCalls || [],
                summary: composerResult.summary || composerResult.message || "I've composed the requested design",
                needsFollowUp: false,
                progressSent: false,
              };
            } catch (creativeError) {
              // #region agent log
              fetch('http://127.0.0.1:7742/ingest/88615bd7-9b92-45ab-a7f3-8f1c82f3db77',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'963e0f'},body:JSON.stringify({sessionId:'963e0f',location:'server.js:632',message:'Creative composer ERROR',data:{error:creativeError?.message},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              console.error('Creative composer failed:', creativeError);
              result = {
                toolCalls: [],
                summary: `Creative composition failed: ${creativeError.message}`,
                needsFollowUp: false,
                progressSent: false,
              };
            }
          } else if (intent && !intent.isMultiStep && intent.operation !== 'CONVERSATION') {
            // Execute directly from intent (bypass all agents!)
            let toolCalls = executeFromIntent(intent, { objects: boardState?.objects || [], selectedIds });
            
            if (toolCalls && toolCalls.length > 0) {
              console.log(`✅ Intent classifier generated ${toolCalls.length} tool calls directly`);
              
              // Generate a proper summary message based on operation and quantity
              let summary = '';
              const quantity = intent.quantity || 1;
              
              if (intent.operation === 'CREATE') {
                // Map object types to human-readable names
                const objectTypeNames = {
                  'shape': intent.shapeType || 'shape',
                  'sticky': 'sticky note',
                  'frame': 'frame',
                  'text': 'text',
                  'textBubble': 'text bubble',
                };
                
                const typeName = objectTypeNames[intent.objectType] || intent.objectType;
                
                if (quantity > 1) {
                  // Plural form
                  const pluralNames = {
                    'circle': 'circles',
                    'rect': 'rectangles',
                    'rectangle': 'rectangles',
                    'triangle': 'triangles',
                    'star': 'stars',
                    'sticky note': 'sticky notes',
                    'frame': 'frames',
                    'text': 'text objects',
                    'text bubble': 'text bubbles',
                  };
                  
                  const pluralName = pluralNames[typeName] || typeName + 's';
                  summary = `I've created ${quantity} ${pluralName}`;
                  
                  // Add grid info if rows/columns specified
                  if (intent.rows && intent.columns) {
                    summary += ` in a ${intent.rows}x${intent.columns} grid`;
                  } else {
                    summary += ' in a grid layout';
                  }
                } else {
                  // Singular form
                  const article = ['a', 'e', 'i', 'o', 'u'].includes(typeName[0]?.toLowerCase()) ? 'an' : 'a';
                  summary = `I've created ${article} ${typeName}`;
                }
              } else if (intent.operation === 'ANALYZE') {
                // Execute analyzeObjects server-side
                const analyzeCall = toolCalls.find(tc => tc.name === 'analyzeObjects');
                if (analyzeCall && executeAnalyzeObjectsServerSide) {
                  console.log('📊 Executing analyzeObjects (intent classifier)');
                  
                  const objectIdsToAnalyze = analyzeCall.arguments.objectIds || [];
                  const analysisResult = executeAnalyzeObjectsServerSide(objectIdsToAnalyze, boardState);
                  
                  // Generate detailed breakdown with color names
                  const breakdown = Object.entries(analysisResult.countByTypeAndColor)
                    .sort((a, b) => b[1] - a[1]) // Sort by count descending
                    .map(([key, count]) => {
                      const [color, ...typeParts] = key.split('_');
                      const type = typeParts.join('_');
                      // Skip "none" color - just show type
                      if (color === 'none') {
                        return `${count} ${type}${count !== 1 ? 's' : ''}`;
                      }
                      return `${count} ${color} ${type}${count !== 1 ? 's' : ''}`;
                    })
                    .join(', ');
                  
                  summary = `Found ${analysisResult.totalObjects} object${analysisResult.totalObjects !== 1 ? 's' : ''}: ${breakdown}`;
                  
                  // Remove analyzeObjects from toolCalls (server-side only)
                  toolCalls = toolCalls.filter(tc => tc.name !== 'analyzeObjects');
                }
              } else if (intent.operation === 'UPDATE') {
                // UPDATE operation summary
                const count = toolCalls.length;
                summary = `I've updated ${count} object${count !== 1 ? 's' : ''}`;
              } else if (intent.operation === 'CHANGE_COLOR') {
                // Color change summary
                const count = toolCalls.length;
                summary = `I've changed the color of ${count} object${count !== 1 ? 's' : ''}`;
              } else if (intent.operation === 'DELETE') {
                // Delete summary
                const deleteCall = toolCalls.find(tc => tc.name === 'deleteObject');
                const count = deleteCall?.arguments?.objectIds?.length || 0;
                summary = `I've deleted ${count} object${count !== 1 ? 's' : ''}`;
              } else if (intent.operation === 'MOVE') {
                // Move summary
                const count = toolCalls.length;
                summary = `I've moved ${count} object${count !== 1 ? 's' : ''}`;
              } else {
                // Fallback for other operations
                summary = `I've ${intent.operation.toLowerCase()}d ${quantity > 1 ? quantity + ' ' : ''}${intent.objectType}${quantity > 1 ? 's' : ''}`;
              }
              
              result = {
                toolCalls,
                summary,
                needsFollowUp: false,
                progressSent: false,
              };
            } else {
              // Intent classifier couldn't handle it - fall through to mini-agent
              console.log('⚠️  Intent classifier returned no tool calls, falling through to mini-agent');
              const miniRoute = { type: 'mini', agent: detectMiniAgent(message, selectedIds?.length > 0) };
              if (miniRoute.agent) {
                result = await executeMiniAgent(
                  openai,
                  miniRoute.agent,
                  message,
                  boardState,
                  context,
                  executeAnalyzeObjectsServerSide
                );
                result = {
                  toolCalls: result.toolCalls || [],
                  summary: result.message || result.summary,
                  needsFollowUp: false,
                  progressSent: false,
                };
              } else {
                // Fall through to orchestration
                result = await orchestrateAgents(
                  openai,
                  message,
                  boardState,
                  context,
                  executeAnalyzeObjectsServerSide,
                  progressCallback
                );
              }
            }
          } else if (intent && intent.isMultiStep) {
            // Multi-step - use orchestrator
            console.log('🎯 Multi-step detected by intent classifier, using orchestrator');
            result = await orchestrateAgents(
              openai,
              message,
              boardState,
              context,
              executeAnalyzeObjectsServerSide,
              progressCallback
            );
          } else if (intent && intent.operation === 'CONVERSATION') {
            // Conversational query - respond naturally without tools
            console.log('💬 Conversational query detected, responding naturally');
            
            const conversationResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a helpful AI assistant for a collaborative whiteboard application. 
                  
You can help users:
- Create and manipulate objects on the whiteboard (sticky notes, shapes, text, frames, connectors)
- Organize and arrange objects
- Analyze the board contents
- Answer questions about the whiteboard features

When users greet you or make conversation, respond naturally and friendly. Keep responses concise and helpful.

Current board context: ${boardState?.objects?.length || 0} objects on the board.`
                },
                { role: 'user', content: message }
              ],
              temperature: 0.7,
            });
            
            const responseMessage = conversationResponse.choices[0]?.message?.content || "I'm here to help! You can ask me to create objects, organize your board, or answer questions.";
            
            result = {
              toolCalls: [],
              summary: responseMessage,
              needsFollowUp: false,
              progressSent: false,
            };
          } else {
            // Classification failed - fall through to mini-agent
            console.log('⚠️  Intent classification failed, falling through');
            const miniRoute = { type: 'mini', agent: detectMiniAgent(message, selectedIds?.length > 0) };
            if (miniRoute.agent) {
              result = await executeMiniAgent(
                openai,
                miniRoute.agent,
                message,
                boardState,
                context,
                executeAnalyzeObjectsServerSide
              );
              result = {
                toolCalls: result.toolCalls || [],
                summary: result.message || result.summary,
                needsFollowUp: false,
                progressSent: false,
              };
            } else {
              result = await orchestrateAgents(
                openai,
                message,
                boardState,
                context,
                executeAnalyzeObjectsServerSide,
                progressCallback
              );
            }
          }
        } catch (error) {
          console.error('❌ Intent classifier error:', error.message);
          // Fall through to mini-agent on error
          const miniRoute = { type: 'mini', agent: detectMiniAgent(message, selectedIds?.length > 0) };
          if (miniRoute.agent) {
            result = await executeMiniAgent(
              openai,
              miniRoute.agent,
              message,
              boardState,
              context,
              executeAnalyzeObjectsServerSide
            );
            result = {
              toolCalls: result.toolCalls || [],
              summary: result.message || result.summary,
              needsFollowUp: false,
              progressSent: false,
            };
          } else {
            result = await orchestrateAgents(
              openai,
              message,
              boardState,
              context,
              executeAnalyzeObjectsServerSide,
              progressCallback
            );
          }
        }
      } else if (route.type === 'mini') {
        // Level 1: Mini-agent (ultra-fast, ~300-500ms)
        console.log(`⚡⚡ MINI-AGENT ROUTE: ${route.reason}`);
        
        result = await executeMiniAgent(
          openai,
          route.agent,
          message,
          boardState,
          context,
          executeAnalyzeObjectsServerSide
        );
        
        // Format result to match orchestrator output
        result = {
          toolCalls: result.toolCalls || [],
          summary: result.message || result.summary,
          needsFollowUp: false,
          progressSent: false,
        };
      } else if (route.type === 'complex') {
        // Level 1.5: Complex Supervisor (uses GPT-4o-mini for reasoning, ~500-800ms)
        console.log(`🧠 COMPLEX SUPERVISOR ROUTE: ${route.reason}`);
        
        result = await executeComplexSupervisor(
          openai,
          message,
          boardState,
          context
        );
        
        // Format result to match orchestrator output
        result = {
          toolCalls: result.toolCalls || [],
          summary: result.message || result.summary,
          needsFollowUp: false,
          progressSent: false,
        };
      } else if (route.type === 'single') {
        // Level 2: Single worker agent (fast, ~800ms)
        console.log(`⚡ FAST PATH: ${route.reason}`);
        
        result = await executeSingleAgent(
          openai,
          route.agent,
          message,
          boardState,
          context,
          executeAnalyzeObjectsServerSide
        );
        
        // Format result to match orchestrator output
        result = {
          toolCalls: result.toolCalls || [],
          summary: result.message || result.summary,
          needsFollowUp: false,
          progressSent: false,
        };
      } else {
        // Level 3: Full orchestration (complex, 1500ms+)
        console.log(`🎯 ORCHESTRATION: ${route.reason}`);
        result = await orchestrateAgents(
          openai,
          message,
          boardState,
          context,
          executeAnalyzeObjectsServerSide,
          progressCallback
        );
      }
    }

    // Send final response only if we didn't send progress updates
    // (if progress was sent, each step already got its own message)
    if (!result.progressSent) {
      const response = {
        type: 'result',
        actions: result.toolCalls || [],
        assistantMessage: result.summary || result.supervisorPlan?.summary || "I've completed the tasks",
        requiresFollowUp: result.needsFollowUp || false,
        remainingTasks: result.remainingTasks || null,
        supervisorPlan: result.supervisorPlan || null,
      };
      
      // DEBUG: Log color changes being sent to client
      const colorChanges = response.actions.filter(a => a.name === 'changeColor');
      if (colorChanges.length > 0) {
        console.log('[SERVER SEND] changeColor actions:', JSON.stringify(colorChanges, null, 2));
      }
      
      // DEBUG: Log createShape with colors being sent to client
      const createShapes = response.actions.filter(a => a.name === 'createShape');
      for (const cs of createShapes) {
        const a = cs.arguments || {};
        console.log(`[SERVER SEND] createShape: type=${a.type}, qty=${a.quantity}, color=${a.color}, colorsLen=${a.colors?.length}`);
      }
      
      ws.send(JSON.stringify(response));
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
  console.log(`🤖 AI Provider: ${aiProvider === 'gemini' ? 'Google Gemini (Flash)' : aiProvider === 'openai' ? 'OpenAI (GPT-4o-mini)' : 'disabled'}`);
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
