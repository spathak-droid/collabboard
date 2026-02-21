/**
 * Smart Command Router
 * Determines routing priority:
 * 0. Intent Classifier (ULTRA-FAST, <300ms) - Analyzes intent and executes directly
 * 1. Mini-agents (ultra-fast, <500ms) for simple single-operation commands
 * 2. Single worker agents (fast, ~800ms) for moderately complex commands
 * 3. Full orchestration (slower, ~1500ms+) for multi-step operations
 */

import { CREATE_AGENT, MODIFY_AGENT, DELETE_AGENT, ORGANIZE_AGENT, ANALYZE_AGENT } from './agent-system.js';
import { detectMiniAgent, executeMiniAgent, needsComplexSupervisor, executeComplexSupervisor } from './mini-agents.js';
import { classifyUserIntent, executeFromIntent } from './intent-classifier.js';

export { executeMiniAgent, classifyUserIntent, executeFromIntent, needsComplexSupervisor, executeComplexSupervisor }; // Re-export for server.js

/**
 * Detect if command requires multi-step orchestration
 */
export function requiresOrchestration(userMessage) {
  const lower = userMessage.toLowerCase();
  
  // Multi-step patterns that NEED supervisor
  const multiStepPatterns = [
    // Create + Connect patterns
    /create.*connected/i,
    /create.*with.*line/i,
    /create.*with.*connector/i,
    /draw.*connected/i,
    
    // Sequential operations (delete then create, etc.)
    /delete.*and.*create/i,
    /clear.*and.*create/i,
    /remove.*and.*create/i,
    /delete.*then.*create/i,
    /clear.*then.*create/i,
    
    // Complex templates
    /swot/i,
    /retrospective/i,
    /retro.*board/i,
    /journey.*map/i,
    
    // Operations requiring multiple agents
    /create.*and.*arrange/i,
    /create.*and.*space/i,
    // NOTE: /create.*and.*color/i was REMOVED — it's too broad.
    // "create 10 stars with 5 lemon lime color" matched it and got misrouted.
    // The intent classifier handles "create X with Y color" correctly as a single CREATE.
    
    // Very large batches (100+) that benefit from parallelization
    /create\s+(10[0-9]|1[1-9][0-9]|[2-9][0-9][0-9]|[0-9]{4,})/i, // Matches 100+
  ];
  
  return multiStepPatterns.some(pattern => pattern.test(lower));
}

/**
 * Route command to best execution path
 * Returns: { type: 'intent' | 'mini' | 'single' | 'orchestrate', agent?: Agent, intent?: object, reason: string }
 */
export function routeCommand(userMessage, hasSelection = false, useIntentClassifier = true) {
  // CRITICAL: Commands starting with create/add/make/draw ALWAYS go through intent classifier.
  // The classifier decides if it's CREATE, CREATIVE, or MULTI_STEP — never skip it for creation commands.
  // This prevents mini-agents from hijacking "create X with Y color" as a CHANGE_COLOR operation.
  const isCreationCommand = /^\s*(create|add|make|draw|generate)\b/i.test(userMessage);
  
  // Level 0: Try intent classifier (fastest - direct execution)
  // Skip for multi-step commands detected early, UNLESS it's a creation command
  if (useIntentClassifier && (isCreationCommand || !requiresOrchestration(userMessage))) {
    return { type: 'intent', reason: 'Using intent classifier for direct execution' };
  }
  
  // Level 0.5: Try complex supervisor (for domain-specific spatial layouts)
  if (needsComplexSupervisor(userMessage)) {
    return { type: 'complex', reason: 'Complex command requiring domain knowledge and spatial reasoning' };
  }
  
  // Level 1: Try mini-agent (ultra-fast path)
  const miniAgent = detectMiniAgent(userMessage, hasSelection);
  if (miniAgent) {
    return { type: 'mini', agent: miniAgent, reason: `Mini-agent: ${miniAgent.name}` };
  }
  
  // Level 2: Check if needs orchestration
  if (requiresOrchestration(userMessage)) {
    return { type: 'orchestrate', reason: 'Multi-step operation detected' };
  }
  
  // Level 3: Single worker agent (fallback)
  const singleAgent = detectSingleWorkerAgent(userMessage);
  if (singleAgent) {
    return { type: 'single', agent: singleAgent.agent, reason: singleAgent.reason };
  }
  
  // Level 4: Use orchestrator (safest fallback)
  return { type: 'orchestrate', reason: 'No fast path match, using orchestrator' };
}

/**
 * Detect which single worker agent should handle this command
 * Used as fallback when mini-agent doesn't match
 */
function detectSingleWorkerAgent(userMessage) {
  const lower = userMessage.toLowerCase();
  
  // CREATE patterns (most common)
  if (/^(create|add|draw|make)\s+\d+/.test(lower) || /^(create|add)\s+(a |an |one )?[a-z]+/i.test(lower)) {
    // Check if it's under 100 objects (single agent territory)
    const match = lower.match(/^(create|add|draw|make)\s+(\d+)/);
    if (match) {
      const count = parseInt(match[2], 10);
      if (count < 100) {
        return { agent: CREATE_AGENT, reason: `Simple creation: ${count} objects` };
      }
    } else {
      // Single object creation (no number specified)
      return { agent: CREATE_AGENT, reason: 'Single object creation' };
    }
  }
  
  // MODIFY patterns
  if (/^(move|resize|rotate|change|update)/.test(lower) && !/\s+and\s+/.test(lower)) {
    // Simple modification without "and" (multi-step indicator)
    return { agent: MODIFY_AGENT, reason: 'Simple modification' };
  }
  
  // Color change patterns
  if (/(color|make).*all.*(?:red|blue|green|yellow|orange|pink|purple)/i.test(lower)) {
    return { agent: MODIFY_AGENT, reason: 'Bulk color change' };
  }
  
  // DELETE patterns
  if (/^(delete|remove|clear)/.test(lower) && !/\s+and\s+/.test(lower)) {
    return { agent: DELETE_AGENT, reason: 'Simple deletion' };
  }
  
  // ORGANIZE patterns
  if (/(arrange|space|organize|grid)/.test(lower) && !/create/i.test(lower)) {
    return { agent: ORGANIZE_AGENT, reason: 'Simple organization' };
  }
  
  // ANALYZE patterns
  if (/^(how many|count|analyze|what|show|list)/.test(lower)) {
    return { agent: ANALYZE_AGENT, reason: 'Simple analysis' };
  }
  
  return null; // Needs orchestration
}

/**
 * Execute a command with a single worker agent (fast path)
 */
export async function executeSingleAgent(openai, agent, userMessage, boardState, context, executeAnalyzeObjectsServerSide) {
  console.log(`⚡ Fast path: ${agent.name} handling request directly`);
  
  const messages = [
    { 
      role: 'system', 
      content: agent.systemPrompt,
    },
    { role: 'user', content: `Current board state:\n${context}\n\nYour task: ${userMessage}` },
  ];

  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-nano',
    messages,
    tools: agent.tools,
    tool_choice: 'auto',
    temperature: 0.3,
  });
  const duration = Date.now() - startTime;

  console.log(`⚡ ${agent.name} responded in ${duration}ms`);

  const choice = response.choices[0];
  if (!choice) {
    throw new Error(`No response from ${agent.name}`);
  }

  const toolCalls = [];
  let analysisMessage = choice.message.content;
  
  // Handle analyzeObjects server-side execution
  if (choice.message.tool_calls) {
    const analyzeCall = choice.message.tool_calls.find(tc => tc.function.name === 'analyzeObjects');
    
    if (analyzeCall && executeAnalyzeObjectsServerSide) {
      console.log('📊 Executing analyzeObjects server-side (fast path)');
      
      let args;
      try { args = JSON.parse(analyzeCall.function.arguments); } catch { args = {}; }
      
      const objectIdsToAnalyze = args.objectIds || [];
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
        analysisMessage = choice2.message.content;
      }

      console.log('✅ Analysis complete (fast path)');
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
  }

  console.log(`✅ ${agent.name} returned ${toolCalls.length} tool calls (fast path)`);

  return {
    success: true,
    agentName: agent.name,
    toolCalls,
    message: analysisMessage,
    summary: analysisMessage || `${agent.name} completed the task`,
  };
}
