/**
 * Disconnect Banner Component
 * 
 * Shows connection status and offline sync progress:
 * - Disconnected: Yellow banner with pending changes count
 * - Syncing: Blue banner with progress
 * - Synced: Green banner with success message (briefly)
 */

'use client';

import { useState, useEffect } from 'react';
import type { ConnectionStatus } from '@/types/yjs';

interface DisconnectBannerProps {
  status: ConnectionStatus;
}

type BannerState = 
  | { type: 'hidden' }
  | { type: 'connecting' }
  | { type: 'disconnected'; pendingCount: number }
  | { type: 'syncing'; pendingCount: number }
  | { type: 'synced'; message: string }
  | { type: 'recovery'; pendingCount: number; message: string };

export const DisconnectBanner = ({ status }: DisconnectBannerProps) => {
  // Only render after hydration to avoid SSR/client mismatch
  const [mounted, setMounted] = useState(false);
  const [bannerState, setBannerState] = useState<BannerState>({ type: 'hidden' });
  
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Listen to offline events
    const handleOffline = (event: Event) => {
      const customEvent = event as CustomEvent;
      setBannerState({ 
        type: 'disconnected', 
        pendingCount: customEvent.detail?.pendingCount || 0 
      });
    };

    const handleOfflineChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setBannerState({ 
        type: 'disconnected', 
        pendingCount: customEvent.detail?.pendingCount || 0 
      });
    };

    const handleSyncing = (event: Event) => {
      const customEvent = event as CustomEvent;
      setBannerState({ 
        type: 'syncing', 
        pendingCount: customEvent.detail?.pendingCount || 0 
      });
    };

    const handleSynced = (event: Event) => {
      const customEvent = event as CustomEvent;
      setBannerState({ 
        type: 'synced', 
        message: customEvent.detail?.message || 'All changes synced!' 
      });
      
      // Hide success banner after 3 seconds
      setTimeout(() => {
        setBannerState({ type: 'hidden' });
      }, 3000);
    };
    
    const handleRecovery = (event: Event) => {
      const customEvent = event as CustomEvent;
      setBannerState({ 
        type: 'recovery', 
        pendingCount: customEvent.detail?.pendingCount || 0,
        message: customEvent.detail?.message || 'Recovering unsaved changes...'
      });
      
      // Hide recovery banner after 5 seconds
      setTimeout(() => {
        setBannerState({ type: 'hidden' });
      }, 5000);
    };

    window.addEventListener('yjs:offline', handleOffline);
    window.addEventListener('yjs:offline-change', handleOfflineChange);
    window.addEventListener('yjs:syncing', handleSyncing);
    window.addEventListener('yjs:synced', handleSynced);
    window.addEventListener('yjs:pending-recovery', handleRecovery);

    return () => {
      window.removeEventListener('yjs:offline', handleOffline);
      window.removeEventListener('yjs:offline-change', handleOfflineChange);
      window.removeEventListener('yjs:syncing', handleSyncing);
      window.removeEventListener('yjs:synced', handleSynced);
      window.removeEventListener('yjs:pending-recovery', handleRecovery);
    };
  }, []);

  // Sync banner state with connection status
  useEffect(() => {
    if (status.status === 'connecting') {
      setBannerState({ type: 'connecting' });
    } else if (status.status === 'disconnected' && bannerState.type !== 'syncing' && bannerState.type !== 'synced') {
      setBannerState({ type: 'disconnected', pendingCount: 0 });
    } else if (status.status === 'connected' && (bannerState.type === 'disconnected' || bannerState.type === 'connecting')) {
      setBannerState({ type: 'hidden' });
    }
  }, [status.status, bannerState.type]);

  if (!mounted) {
    return null;
  }
  
  // Connecting banner
  if (bannerState.type === 'connecting') {
    return (
      <div className="fixed top-0 left-0 right-0 p-3 text-center text-white z-50 bg-blue-500">
        Connecting to server...
      </div>
    );
  }

  // Recovery banner (page refresh with pending changes)
  if (bannerState.type === 'recovery') {
    return (
      <div className="fixed top-0 left-0 right-0 p-3 text-center text-white z-50 bg-blue-600">
        🔄 {bannerState.message}
      </div>
    );
  }
  
  // Disconnected banner
  if (bannerState.type === 'disconnected') {
    return (
      <div className="fixed top-0 left-0 right-0 p-3 text-center text-white z-50 bg-yellow-500">
        ⚠️ Disconnected from server. Reconnecting...
        {bannerState.pendingCount > 0 && (
          <span className="ml-2 text-sm">
            ({bannerState.pendingCount} change{bannerState.pendingCount !== 1 ? 's' : ''} saved locally)
          </span>
        )}
        <div className="text-xs mt-1 opacity-90">
          {status.message ?? 'Your changes are being saved locally and will sync when reconnected'}
        </div>
      </div>
    );
  }
  
  // Syncing banner
  if (bannerState.type === 'syncing') {
    return (
      <div className="fixed top-0 left-0 right-0 p-3 text-center text-white z-50 bg-blue-500">
        <div className="flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          <span>
            Syncing {bannerState.pendingCount} change{bannerState.pendingCount !== 1 ? 's' : ''}...
          </span>
        </div>
      </div>
    );
  }
  
  // Success banner
  if (bannerState.type === 'synced') {
    return (
      <div className="fixed top-0 left-0 right-0 p-3 text-center text-white z-50 bg-green-500">
        ✅ {bannerState.message}
      </div>
    );
  }
  
  return null;
};
