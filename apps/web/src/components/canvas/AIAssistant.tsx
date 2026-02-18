/**
 * AI Assistant with magical micro-interaction animation
 */

'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

interface AIAssistantProps {
  onSendMessage?: (message: string) => void;
}

export const AIAssistant = ({ onSendMessage }: AIAssistantProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });

  const handleButtonClick = () => {
    if (isAnimating || showChat) return;

    // Get button position for animation origin
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }

    setIsAnimating(true);

    // Show chat after animation completes
    setTimeout(() => {
      setShowChat(true);
      setIsAnimating(false);
    }, 700);
  };

  const handleClose = () => {
    setShowChat(false);
    setMessage('');
  };

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage?.(message);
      setMessage('');
    }
  };

  return (
    <>
      {/* AI Assistant Button */}
      <motion.button
        ref={buttonRef}
        onClick={handleButtonClick}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-50"
        animate={{
          scale: isAnimating ? 0.95 : 1,
          boxShadow: isAnimating
            ? '0 0 30px rgba(99, 102, 241, 0.6), 0 0 60px rgba(139, 92, 246, 0.4)'
            : '0 10px 25px rgba(0, 0, 0, 0.2)',
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 17,
        }}
      >
        <AutoAwesomeIcon className="w-6 h-6" />
        
        {/* Pulsing glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 opacity-0"
          animate={{
            scale: [1, 1.5, 2],
            opacity: [0.5, 0.3, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      </motion.button>

      {/* Energy Particle Animation */}
      <AnimatePresence>
        {isAnimating && (
          <>
            {/* Main energy orb */}
            <motion.div
              className="fixed w-4 h-4 rounded-full pointer-events-none z-[100]"
              style={{
                left: buttonPosition.x - 8,
                top: buttonPosition.y - 8,
                background: 'radial-gradient(circle, rgba(199, 210, 254, 1) 0%, rgba(129, 140, 248, 1) 50%, rgba(99, 102, 241, 0.8) 100%)',
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.8), 0 0 40px rgba(139, 92, 246, 0.6)',
                filter: 'blur(1px)',
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.2, 1, 0.8],
                opacity: [0, 1, 1, 0],
                y: [-50, -80, 200],
                x: [0, 5, -3],
              }}
              transition={{
                duration: 0.7,
                times: [0, 0.2, 0.6, 1],
                ease: [0.34, 1.56, 0.64, 1],
              }}
            />

            {/* Stretching trail effect */}
            <motion.div
              className="fixed w-2 rounded-full pointer-events-none z-[99]"
              style={{
                left: buttonPosition.x - 4,
                top: buttonPosition.y,
                background: 'linear-gradient(to bottom, rgba(139, 92, 246, 0.8), rgba(99, 102, 241, 0.4), transparent)',
                filter: 'blur(2px)',
              }}
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: [0, 80, 150, 100],
                opacity: [0, 0.8, 0.6, 0],
                y: [0, -20, 50, 180],
              }}
              transition={{
                duration: 0.7,
                times: [0, 0.3, 0.6, 1],
                ease: 'easeInOut',
              }}
            />

            {/* Ripple effect at landing point */}
            <motion.div
              className="fixed w-16 h-16 rounded-full border-2 border-indigo-400 pointer-events-none z-[98]"
              style={{
                left: buttonPosition.x - 32,
                top: buttonPosition.y + 180,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 2],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration: 0.5,
                delay: 0.6,
                ease: 'easeOut',
              }}
            />

            {/* Secondary ripple */}
            <motion.div
              className="fixed w-12 h-12 rounded-full border-2 border-purple-400 pointer-events-none z-[98]"
              style={{
                left: buttonPosition.x - 24,
                top: buttonPosition.y + 180,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 1.8],
                opacity: [0, 0.8, 0],
              }}
              transition={{
                duration: 0.4,
                delay: 0.65,
                ease: 'easeOut',
              }}
            />

            {/* Splash particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="fixed w-1.5 h-1.5 rounded-full bg-indigo-400 pointer-events-none z-[98]"
                style={{
                  left: buttonPosition.x,
                  top: buttonPosition.y + 180,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                  x: Math.cos((i * Math.PI * 2) / 6) * 30,
                  y: Math.sin((i * Math.PI * 2) / 6) * 30,
                }}
                transition={{
                  duration: 0.5,
                  delay: 0.65,
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Chat Interface */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-[200] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Chat Box */}
            <motion.div
              className="relative w-[500px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
              initial={{
                scale: 0.8,
                y: 50,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                y: 0,
                opacity: 1,
              }}
              exit={{
                scale: 0.8,
                y: 50,
                opacity: 0,
              }}
              transition={{
                type: 'spring',
                damping: 25,
                stiffness: 300,
              }}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <AutoAwesomeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">AI Assistant</h3>
                    <p className="text-indigo-100 text-sm">How can I help you?</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Chat Content */}
              <div className="p-6 min-h-[300px] max-h-[500px] overflow-y-auto">
                <div className="space-y-4">
                  {/* AI Welcome Message */}
                  <motion.div
                    className="flex gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      <AutoAwesomeIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%]">
                      <p className="text-gray-800">
                        Hi! I'm your AI assistant. I can help you with:
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-gray-600">
                        <li>• Creating and organizing content</li>
                        <li>• Suggesting design improvements</li>
                        <li>• Answering questions about your board</li>
                      </ul>
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask me anything..."
                    className="flex-1 px-4 py-3 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    autoFocus
                  />
                  <motion.button
                    onClick={handleSend}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!message.trim()}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Send
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
