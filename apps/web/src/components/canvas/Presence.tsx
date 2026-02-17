/**
 * Presence Panel - Shows online users
 */

'use client';

import type { AwarenessState } from '@/types/yjs';

interface PresenceProps {
  onlineUsers: AwarenessState[];
  currentUserId: string;
}

export const Presence = ({ onlineUsers, currentUserId }: PresenceProps) => {
  const displayLimit = 15;
  const visibleUsers = onlineUsers.slice(0, displayLimit);
  const remainingCount = Math.max(0, onlineUsers.length - displayLimit);
  
  return (
    <div className="fixed top-4 right-4 bg-white rounded-lg shadow-lg p-4 min-w-[200px] z-10">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
        <span className="text-lg">👥</span>
        <span className="font-semibold">Online ({onlineUsers.length})</span>
      </div>
      
      <div className="space-y-2">
        {visibleUsers.map((state) => {
          const isCurrentUser = state.user.id === currentUserId;
          
          return (
            <div
              key={state.user.id}
              className="flex items-center gap-2"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: state.user.color }}
              />
              <span className="text-sm truncate">
                {state.user.name}
                {isCurrentUser && <span className="text-gray-500 ml-1">(You)</span>}
              </span>
            </div>
          );
        })}
        
        {remainingCount > 0 && (
          <div className="text-sm text-gray-500 pt-2 border-t">
            ... and {remainingCount} more
          </div>
        )}
      </div>
    </div>
  );
};
