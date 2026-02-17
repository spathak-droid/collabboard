/**
 * Disconnect Banner Component
 */

'use client';

import { useState, useEffect } from 'react';
import type { ConnectionStatus } from '@/types/yjs';

interface DisconnectBannerProps {
  status: ConnectionStatus;
}

export const DisconnectBanner = ({ status }: DisconnectBannerProps) => {
  // Only render after hydration to avoid SSR/client mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || status.status === 'connected') {
    return null;
  }
  
  return (
    <div
      className={`fixed top-0 left-0 right-0 p-3 text-center text-white z-50 ${
        status.status === 'disconnected' ? 'bg-yellow-500' : 'bg-blue-500'
      }`}
    >
      {status.status === 'disconnected' && (
        <>
          ⚠️ Disconnected from server. Reconnecting...
          {status.message && <span className="ml-2 text-sm">({status.message})</span>}
        </>
      )}
      {status.status === 'connecting' && '🔄 Connecting to server...'}
    </div>
  );
};
