/**
 * POST /api/ai/commands
 *
 * Accepts a natural-language board command + current board state,
 * calls OpenAI with function-calling tools, and returns the parsed
 * tool calls for the client to execute against Yjs.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { AI_TOOLS } from '@/lib/ai/tools';
import type { ParsedToolCall, ToolName } from '@/lib/ai/tools';
import type { BoardStateSummary } from '@/lib/ai/boardState';
import { boardStateToPromptString } from '@/lib/ai/boardState';

const SYSTEM_PROMPT = `You are an AI assistant for a collaborative whiteboard application. You help users create, manipulate, and organize objects on their whiteboard by calling the provided tools.

## Canvas Coordinate System
- Origin (0, 0) is the top-left of the canvas.
- Positive X goes right, positive Y goes down.
- Sticky notes are 200×200 px by default.
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
- When asked to "move all pink sticky notes", first call getBoardState to find them, then issue moveObject calls for each.
- When resizing frames to fit contents, calculate the bounding box of contained objects and add 40px padding.

## Response Style
- Execute the user's request by calling the appropriate tools.
- For complex templates, call multiple tools in sequence.
- If the user's request is ambiguous, make reasonable assumptions and proceed.
- Always respond with tool calls — do not just describe what you would do.`;

interface RequestBody {
  message: string;
  boardState: BoardStateSummary;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { message, boardState, conversationHistory = [] } = body;

  if (!message || typeof message !== 'string') {
    return NextResponse.json(
      { error: 'message is required' },
      { status: 400 },
    );
  }

  const openai = new OpenAI({ apiKey });

  const boardContext = boardStateToPromptString(boardState);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Current board state (JSON). Use the exact id values from the objects array in your tool calls:\n${boardContext}`,
    },
    ...conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: message },
  ];

  try {
    const requestId = crypto.randomUUID();

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: AI_TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
    });
    const duration = Date.now() - startTime;

    const choice = response.choices[0];
    if (!choice) {
      return NextResponse.json(
        { error: 'No response from OpenAI' },
        { status: 502 },
      );
    }

    const assistantMessage =
      choice.message.content ?? 'Done! I executed the requested changes.';

    const toolCalls: ParsedToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === 'function') {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name as ToolName,
            arguments: args as ParsedToolCall['arguments'],
          });
        }
      }
    }

    return NextResponse.json({
      actions: toolCalls,
      assistantMessage,
    });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown OpenAI error';
    console.error('[AI Commands] OpenAI error:', {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
      request: message.substring(0, 100),
    });
    return NextResponse.json(
      { error: `OpenAI API error: ${errorMessage}` },
      { status: 502 },
    );
  }
}
