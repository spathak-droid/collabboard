/**
 * Gemini Adapter - Makes Google Gemini API compatible with OpenAI interface
 * Used by the agent orchestrator to support multiple LLM providers
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Create a Gemini client that mimics OpenAI's interface
 */
export function createGeminiClient(apiKey, model = 'gemini-2.5-flash') {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  return {
    chat: {
      completions: {
        create: async (params) => {
          const geminiModel = genAI.getGenerativeModel({ 
            model: params.model || model,
          });

          // Convert OpenAI messages to Gemini format
          const contents = convertMessagesToGemini(params.messages);
          
          // Handle tools (function calling)
          const generationConfig = {
            temperature: params.temperature ?? 0.3,
          };
          
          // Add response format for JSON mode
          if (params.response_format?.type === 'json_object') {
            generationConfig.responseMimeType = 'application/json';
          }

          let tools = undefined;
          if (params.tools && params.tools.length > 0) {
            tools = convertToolsToGemini(params.tools);
          }

          const chatParams = {
            contents,
            generationConfig,
          };
          
          if (tools) {
            chatParams.tools = tools;
          }

          // Call Gemini API
          const result = await geminiModel.generateContent(chatParams);
          const response = result.response;
          
          // Convert Gemini response to OpenAI format
          return convertGeminiResponse(response);
        },
      },
    },
  };
}

/**
 * Convert OpenAI messages format to Gemini contents format
 */
function convertMessagesToGemini(messages) {
  const contents = [];
  let systemInstruction = '';
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini doesn't have system role - prepend to first user message
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      const content = systemInstruction 
        ? `${systemInstruction}\n\n${msg.content}`
        : msg.content;
      systemInstruction = ''; // Only add once
      contents.push({
        role: 'user',
        parts: [{ text: content }],
      });
    } else if (msg.role === 'assistant') {
      const parts = [];
      
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      
      if (msg.tool_calls) {
        for (const toolCall of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments),
            },
          });
        }
      }
      
      contents.push({
        role: 'model',
        parts,
      });
    } else if (msg.role === 'tool') {
      // Tool response
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name,
            response: {
              content: msg.content,
            },
          },
        }],
      });
    }
  }
  
  return contents;
}

/**
 * Convert OpenAI tools format to Gemini function declarations
 */
function convertToolsToGemini(tools) {
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    })),
  }];
}

/**
 * Convert Gemini response to OpenAI format
 */
function convertGeminiResponse(geminiResponse) {
  const candidate = geminiResponse.candidates?.[0];
  if (!candidate) {
    return {
      choices: [],
      usage: {},
    };
  }

  const content = candidate.content;
  const parts = content.parts || [];
  
  // Extract text and function calls
  let textContent = '';
  const toolCalls = [];
  
  for (const part of parts) {
    if (part.text) {
      textContent += part.text;
    } else if (part.functionCall) {
      toolCalls.push({
        id: `call_${Math.random().toString(36).substring(7)}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      });
    }
  }
  
  const message = {
    role: 'assistant',
    content: textContent || null,
  };
  
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  
  return {
    choices: [{
      index: 0,
      message,
      finish_reason: candidate.finishReason === 'STOP' ? 'stop' : 'tool_calls',
    }],
    usage: {
      prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
    },
  };
}
