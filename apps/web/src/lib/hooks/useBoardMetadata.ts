/**
 * Hook for board metadata management
 */

import { useState, useEffect, useRef } from 'react';
import { supabase, fetchBoardMembers, ensureBoardAccess, fetchOnlineUserUids, type BoardMember } from '@/lib/supabase/client';

/**
 * Hook that manages board metadata (title, owner, members, presence).
 */
export function useBoardMetadata(boardId: string | undefined, user: { uid: string } | null, onlineUsersCount: number) {
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  
  const boardMetaLoaded = useRef(false);
  const prevOnlineCountRef = useRef(0);

  // Load board metadata from Supabase (non-blocking)
  useEffect(() => {
    if (!boardId || !user || boardMetaLoaded.current) return;
    boardMetaLoaded.current = true;

    supabase
      .from('boards')
      .select('title, owner_uid')
      .eq('id', boardId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading board meta:', error);
          return;
        }
        if (data?.title) setBoardTitle(data.title);
        if (data?.owner_uid) setOwnerUid(data.owner_uid);
      });

    // Register this user as a collaborator, then fetch all known members
    ensureBoardAccess(boardId, user.uid)
      .then(() => fetchBoardMembers(boardId))
      .then((members) => {
        setBoardMembers(members);
        const uids = members.map((m) => m.uid);
        fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
      })
      .catch(console.error);
  }, [boardId, user]);

  // Re-fetch board members & global presence whenever someone disconnects
  useEffect(() => {
    const currentCount = onlineUsersCount;
    if (prevOnlineCountRef.current > currentCount && boardId) {
      fetchBoardMembers(boardId).then((members) => {
        setBoardMembers(members);
        const uids = members.map((m) => m.uid);
        fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
      }).catch(console.error);
    }
    prevOnlineCountRef.current = currentCount;
  }, [onlineUsersCount, boardId]);

  // Poll global presence every 30s so we detect when users go online/offline
  useEffect(() => {
    if (boardMembers.length === 0) return;
    const poll = () => {
      const uids = boardMembers.map((m) => m.uid);
      fetchOnlineUserUids(uids).then(setGlobalOnlineUids).catch(() => {});
    };
    poll(); // immediate
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [boardMembers]);

  const isOwner = ownerUid !== null && user?.uid === ownerUid;

  return {
    boardTitle,
    setBoardTitle,
    ownerUid,
    boardMembers,
    globalOnlineUids,
    isOwner,
  };
}
