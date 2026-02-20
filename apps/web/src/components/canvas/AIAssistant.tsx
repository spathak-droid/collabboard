/**
 * AI Assistant — chat panel for natural-language board commands.
 *
 * Renders a floating button that opens a chat interface. Messages are
 * processed by the useAICommands hook which calls the OpenAI-backed
 * API route and executes the returned tool calls against Yjs.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { ChatMessage } from '@/lib/hooks/useAICommands';

// ── Suggested command chips ─────────────────────────────────

const SUGGESTED_COMMANDS = [
  'Create a SWOT analysis template',
  'Add a yellow sticky note that says "Ideas"',
  'Create a 2x3 grid of sticky notes',
  'Set up a retrospective board',
  'Build a user journey map with 5 stages',
  'Arrange sticky notes in a grid',
];

// ── Props ───────────────────────────────────────────────────

interface AIAssistantProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  onSendMessage: (message: string) => void;
  onReconnect: () => void;
}

// ── Component ───────────────────────────────────────────────

export const AIAssistant = ({
  messages,
  isProcessing,
  isConnected,
  isReconnecting,
  onSendMessage,
  onReconnect,
}: AIAssistantProps) => {
  const [showChat, setShowChat] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    if (showChat) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showChat]);

  const handleButtonClick = () => {
    if (showChat) return;
    setShowChat(true);
  };

  const handleClose = () => {
    setShowChat(false);
    setInputValue('');
  };

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isProcessing) return;
    onSendMessage(trimmed);
    setInputValue('');
  }, [inputValue, isProcessing, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestionClick = useCallback(
    (command: string) => {
      if (isProcessing) return;
      onSendMessage(command);
    },
    [isProcessing, onSendMessage],
  );

  return (
    <>
      {/* Floating trigger button */}
        <motion.button
          ref={buttonRef}
          onClick={handleButtonClick}
          className="fixed bottom-6 left-6 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-[6px_-6px_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] hover:shadow-[8px_-8px_24px_rgba(0,0,0,0.2),0_6px_16px_rgba(0,0,0,0.12),0_16px_40px_rgba(0,0,0,0.1)] transition-shadow flex items-center justify-center z-50"
          animate={{
            scale: 1,
            boxShadow: '6px -6px 20px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1), 0 12px 32px rgba(0, 0, 0, 0.08)',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <AutoAwesomeIcon className="w-5 h-5" />
        </motion.button>

      {/* Energy particle animation (preserved from original) */}
      {/* Chat panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            className="fixed bottom-[88px] left-6 z-[200] pointer-events-auto"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="w-[300px] max-w-[90vw] bg-white rounded-xl shadow-[6px_-6px_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col max-h-[400px]">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <AutoAwesomeIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-white font-semibold text-xs">
                        AI Assistant
                      </h3>
                      {/* Connection status indicator */}
                      <span className="text-[10px]">
                        {isConnected ? (
                          <span className="text-green-300" title="Connected">🟢</span>
                        ) : isReconnecting ? (
                          <span className="text-yellow-300 animate-pulse" title="Reconnecting">🟡</span>
                        ) : (
                          <span className="text-red-300" title="Disconnected">🔴</span>
                        )}
                      </span>
                    </div>
                    <p className="text-indigo-200 text-[10px]">
                      {isProcessing
                        ? 'Thinking...'
                        : !isConnected && !isReconnecting
                        ? 'Disconnected'
                        : isReconnecting
                        ? 'Reconnecting...'
                        : 'Ask me to create or organize'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-white/80 hover:text-white transition-colors p-0.5"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-[120px] max-h-[240px]">
                {/* Welcome message (always shown) */}
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AutoAwesomeIcon
                      style={{ fontSize: 12 }}
                      className="text-white"
                    />
                  </div>
                  <div className="bg-gray-100 rounded-xl rounded-tl-sm px-2.5 py-2 max-w-[85%]">
                    <p className="text-gray-800 text-xs">
                      Hi! I can help you create and organize your whiteboard.
                      Try a command or pick a suggestion below.
                    </p>
                  </div>
                </div>

                {/* Suggestion chips (shown when no messages yet) */}
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-1 pl-8">
                    {SUGGESTED_COMMANDS.map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => handleSuggestionClick(cmd)}
                        disabled={isProcessing}
                        className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat messages */}
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}

                {/* Processing indicator */}
                {isProcessing && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AutoAwesomeIcon
                        style={{ fontSize: 12 }}
                        className="text-white"
                      />
                    </div>
                    <div className="bg-gray-100 rounded-xl rounded-tl-sm px-2.5 py-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-gray-200 p-2 flex-shrink-0">
                {/* Reconnect button (shown when disconnected and not auto-reconnecting) */}
                {!isConnected && !isReconnecting && (
                  <div className="mb-2">
                    <button
                      onClick={onReconnect}
                      className="w-full px-2.5 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Reconnect
                    </button>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isProcessing
                        ? 'Processing...'
                        : !isConnected
                        ? 'Disconnected...'
                        : 'Type a command...'
                    }
                    disabled={isProcessing || !isConnected}
                    className="flex-1 px-2.5 py-2 bg-gray-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-60"
                  />
                  <motion.button
                    onClick={handleSend}
                    className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!inputValue.trim() || isProcessing || !isConnected}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Send
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ── Message bubble sub-component ────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div
        className="flex justify-end"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="bg-indigo-600 text-white rounded-xl rounded-tr-sm px-2.5 py-2 max-w-[85%]">
          <p className="text-xs">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
        <AutoAwesomeIcon style={{ fontSize: 12 }} className="text-white" />
      </div>
      <div className="max-w-[85%] space-y-1">
        <div className="bg-gray-100 rounded-xl rounded-tl-sm px-2.5 py-2">
          <p className="text-xs text-gray-800">{message.content}</p>
        </div>
      </div>
    </motion.div>
  );
}
