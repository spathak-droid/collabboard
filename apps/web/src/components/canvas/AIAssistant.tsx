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
  onSendMessage: (message: string) => void;
}

// ── Component ───────────────────────────────────────────────

export const AIAssistant = ({
  messages,
  isProcessing,
  onSendMessage,
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
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-50"
        animate={{
          scale: 1,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <AutoAwesomeIcon className="w-6 h-6" />
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 opacity-0"
          animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.3, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      </motion.button>

      {/* Energy particle animation (preserved from original) */}
      {/* Chat panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            className="fixed bottom-28 right-8 z-[200] pointer-events-auto"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="w-[420px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[600px]">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <AutoAwesomeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm">
                      AI Assistant
                    </h3>
                    <p className="text-indigo-200 text-xs">
                      {isProcessing ? 'Thinking...' : 'Ask me to create or organize'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-white/80 hover:text-white transition-colors p-1"
                >
                  <svg
                    className="w-5 h-5"
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[380px]">
                {/* Welcome message (always shown) */}
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AutoAwesomeIcon
                      style={{ fontSize: 14 }}
                      className="text-white"
                    />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-gray-800 text-sm">
                      Hi! I can help you create and organize your whiteboard.
                      Try a command or pick a suggestion below.
                    </p>
                  </div>
                </div>

                {/* Suggestion chips (shown when no messages yet) */}
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-9">
                    {SUGGESTED_COMMANDS.map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => handleSuggestionClick(cmd)}
                        disabled={isProcessing}
                        className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AutoAwesomeIcon
                        style={{ fontSize: 14 }}
                        className="text-white"
                      />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-gray-200 p-3 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isProcessing
                        ? 'Processing...'
                        : 'Type a command...'
                    }
                    disabled={isProcessing}
                    className="flex-1 px-3.5 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-60"
                  />
                  <motion.button
                    onClick={handleSend}
                    className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!inputValue.trim() || isProcessing}
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
        <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%]">
          <p className="text-sm">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex gap-2.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-0.5">
        <AutoAwesomeIcon style={{ fontSize: 14 }} className="text-white" />
      </div>
      <div className="max-w-[85%] space-y-1.5">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
          <p className="text-sm text-gray-800">{message.content}</p>
        </div>
        {message.actionSummary && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <p className="text-xs text-green-700 font-medium">
              {message.actionSummary}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
