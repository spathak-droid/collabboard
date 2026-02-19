/**
 * Agent Orchestrator - Coordinates the hierarchical agent system
 * 
 * Flow:
 * 1. User request → Supervisor Agent (creates plan)
 * 2. For each task in plan:
 *    - Route to appropriate worker agent
 *    - Execute task
 *    - If waitForPrevious, send updated board state to next agent
 * 3. Aggregate results and respond to user
 */

import { SUPERVISOR_AGENT, WORKER_AGENTS, getAgentTools } from './agent-system.js';

/**
 * Call the Supervisor Agent to create an execution plan
 */
export async function createExecutionPlan(openai, userMessage, boardState, context) {
  const messages = [
    { 
      role: 'system', 
      content: SUPERVISOR_AGENT.systemPrompt,
      // Enable prompt caching for system prompt (remains constant)
      cache_control: { type: 'ephemeral' }
    },
    { role: 'system', content: `Current board state:\n${context}` },
    { role: 'user', content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error('No plan from Supervisor');
  }

  try {
    const plan = JSON.parse(choice.message.content);
    console.log('📋 Supervisor created plan:', JSON.stringify(plan, null, 2));
    return plan;
  } catch (err) {
    console.error('Failed to parse supervisor plan:', choice.message.content);
    throw new Error('Supervisor returned invalid JSON');
  }
}

/**
 * Execute a single task using the appropriate worker agent
 */
export async function executeTask(openai, task, boardState, context, previousResults = [], executeAnalyzeObjectsServerSide = null) {
  const agentName = task.agent;
  const agent = WORKER_AGENTS[agentName];
  
  if (!agent) {
    console.error(`Unknown agent: ${agentName}`);
    return {
      success: false,
      error: `Unknown agent: ${agentName}`,
      toolCalls: [],
    };
  }

  console.log(`🤖 ${agentName} executing: ${task.task}`);

  // Build context for the worker agent
  let taskContext = `Current board state:\n${context}\n\nYour task: ${task.task}`;
  
  // If this task depends on previous results, include them
  if (task.waitForPrevious && previousResults.length > 0) {
    const lastResult = previousResults[previousResults.length - 1];
    if (lastResult.createdIds && lastResult.createdIds.length > 0) {
      taskContext += `\n\nNewly created object IDs from previous task: ${lastResult.createdIds.join(', ')}`;
      taskContext += `\nUse these IDs for your task.`;
    }
  }

  const messages = [
    { 
      role: 'system', 
      content: agent.systemPrompt,
      // Cache agent's system prompt (constant across requests)
      cache_control: { type: 'ephemeral' }
    },
    { role: 'user', content: taskContext },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools: agent.tools,
    tool_choice: 'auto',
    temperature: 0.3,
  });

  const choice = response.choices[0];
  if (!choice) {
    return {
      success: false,
      error: 'No response from worker agent',
      toolCalls: [],
    };
  }

  const toolCalls = [];
  let analysisMessage = choice.message.content;
  
  if (choice.message.tool_calls) {
    // Check if this is an analyzeObjects call that needs server-side execution
    const analyzeCall = choice.message.tool_calls.find(tc => tc.function.name === 'analyzeObjects');
    
    if (analyzeCall && executeAnalyzeObjectsServerSide) {
      console.log('📊 Executing analyzeObjects server-side');
      
      let args;
      try { args = JSON.parse(analyzeCall.function.arguments); } catch { args = {}; }
      
      const objectIdsToAnalyze = args.objectIds || [];
      const analysisResult = executeAnalyzeObjectsServerSide(objectIdsToAnalyze, boardState);
      
      // Format the analysis result
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
      });

      // Send the analysis result back to the agent for natural language response
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
        analysisMessage = choice2.message.content;
      }

      console.log('✅ Analysis complete, natural language response generated');
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

  console.log(`✅ ${agentName} returned ${toolCalls.length} tool calls`);

  return {
    success: true,
    agentName,
    task: task.task,
    toolCalls,
    message: analysisMessage,
  };
}

/**
 * Orchestrate the entire multi-agent execution with streaming progress updates
 */
export async function orchestrateAgents(openai, userMessage, boardState, context, executeAnalyzeObjectsServerSide, progressCallback = null) {
  console.log('🎯 Starting agent orchestration');
  
  // Step 1: Supervisor creates execution plan
  const plan = await createExecutionPlan(openai, userMessage, boardState, context);
  
  if (!plan.plan || !Array.isArray(plan.plan)) {
    throw new Error('Invalid plan structure from Supervisor');
  }

  // Step 2: Execute tasks sequentially with progress updates
  const results = [];
  const allToolCalls = [];
  
  for (let i = 0; i < plan.plan.length; i++) {
    const task = plan.plan[i];
    
    // If task needs to wait for previous task, we need updated board state
    // This will be handled by the client in the two-step flow
    if (task.waitForPrevious && i > 0) {
      console.log(`⏸️  Task ${i + 1} needs results from previous task - marking for follow-up`);
      // Return what we have so far and signal need for follow-up
      return {
        partialResults: results,
        toolCalls: allToolCalls,
        needsFollowUp: true,
        remainingTasks: plan.plan.slice(i),
        supervisorPlan: plan,
      };
    }
    
    // Execute the task
    const result = await executeTask(openai, task, boardState, context, results, executeAnalyzeObjectsServerSide);
    results.push(result);
    
    if (result.success && result.toolCalls) {
      allToolCalls.push(...result.toolCalls);
      
      // Send progress update after each task
      if (progressCallback && result.toolCalls.length > 0) {
        const clientToolCalls = result.toolCalls.filter(tc => tc.name !== 'analyzeObjects');
        if (clientToolCalls.length > 0) {
          progressCallback({
            type: 'progress',
            step: i + 1,
            totalSteps: plan.plan.length,
            task: task.task,
            actions: clientToolCalls,
            message: result.message,
          });
        }
      }
    }
  }

  console.log('✨ Agent orchestration complete');

  // Filter out analyzeObjects from tool calls (it's server-side only, shouldn't execute on client)
  const clientToolCalls = allToolCalls.filter(tc => tc.name !== 'analyzeObjects');

  // Build final message
  let finalMessage = plan.summary || 'Tasks completed';
  
  // If there are any analysis results, use their messages
  const analysisResults = results.filter(r => r.agentName === 'AnalyzeAgent' && r.message);
  if (analysisResults.length > 0) {
    const analysisMessage = analysisResults.map(r => r.message).join(' ');
    
    // If there are also client actions, let the client-side Response Agent combine them
    // Just pass the analysis message and let it be combined with action description
    finalMessage = analysisMessage;
  }

  return {
    supervisorPlan: plan,
    results,
    toolCalls: clientToolCalls,
    needsFollowUp: false,
    summary: finalMessage,
    progressSent: progressCallback ? true : false, // Track if we sent progress updates
  };
}

/**
 * Continue orchestration after client executed first batch
 */
export async function continueOrchestration(openai, remainingTasks, boardState, context, previousResults, executeAnalyzeObjectsServerSide) {
  console.log('🔄 Continuing agent orchestration');
  
  const results = [];
  const allToolCalls = [];
  
  for (let i = 0; i < remainingTasks.length; i++) {
    const task = remainingTasks[i];
    
    // Check if this task also needs to wait
    if (task.waitForPrevious && i > 0) {
      return {
        partialResults: results,
        toolCalls: allToolCalls,
        needsFollowUp: true,
        remainingTasks: remainingTasks.slice(i),
      };
    }
    
    const result = await executeTask(openai, task, boardState, context, previousResults, executeAnalyzeObjectsServerSide);
    results.push(result);
    
    if (result.success && result.toolCalls) {
      allToolCalls.push(...result.toolCalls);
    }
  }

  console.log('✨ Orchestration continuation complete');

  // Filter out analyzeObjects from tool calls (it's server-side only, shouldn't execute on client)
  const clientToolCalls = allToolCalls.filter(tc => tc.name !== 'analyzeObjects');

  return {
    results,
    toolCalls: clientToolCalls,
    needsFollowUp: false,
  };
}
