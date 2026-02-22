/**
 * Dashboard Page - Boards persisted in Supabase
 */

'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { signOut } from '@/lib/firebase/auth';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { NewBoardModal } from '@/components/ui/NewBoardModal';
import { InviteModal } from '@/components/ui/InviteModal';
import { InviteAppModal } from '@/components/ui/InviteAppModal';
import {
  ensureUser,
  createBoard as createBoardInDb,
  fetchAllBoards,
  updateBoard as updateBoardInDb,
  deleteBoard as deleteBoardFromDb,
  fetchBoardMembers,
  fetchOnlineUserUids,
  subscribeToBoardsChanges,
  type BoardsChangePayload,
  type BoardWithOwner,
  type BoardMember,
} from '@/lib/supabase/client';
import { getUserColor } from '@/lib/utils/colors';
import { getCachedBoards, setCachedBoards } from '@/lib/utils/boardsCache';
import { getCachedSnapshot, preloadSnapshots } from '@/lib/utils/snapshotCache';
import { usePresenceHeartbeat } from '@/lib/hooks/usePresenceHeartbeat';

type BoardVisibilityFilter = 'all' | 'owned' | 'shared';
type BoardSort = 'last_modified' | 'created' | 'alphabetical';

type CollabInfo = {
  uid: string;
  name: string;
  color: string;
  isOnline: boolean; // globally online (heartbeat within 2 min)
};

type BoardRow = {
  id: string;
  title: string;
  ownerName: string;
  ownerUid: string;
  collaborators: CollabInfo[];
  createdAt: number;
  lastModified: number;
  sharedWithMe: boolean;
  thumbnail?: string;
  isLocked: boolean;
};

const timeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 10) return 'a few seconds ago';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<BoardVisibilityFilter>('all');
  const [sortBy, setSortBy] = useState<BoardSort>('last_modified');
  const [boards, setBoards] = useState<BoardWithOwner[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true); // Track collaborators loading
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardMembersMap, setBoardMembersMap] = useState<Record<string, BoardMember[]>>({});
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ id: string; title: string } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [openCollaboratorsDropdown, setOpenCollaboratorsDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const collaboratorsDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [visibilityToast, setVisibilityToast] = useState<string | null>(null);
  const visibilityToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Send heartbeat every 60s so other users know we're online
  usePresenceHeartbeat(user?.uid);

  // Tick every 30s so relative timestamps stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Calculate dropdown position when it opens or window resizes
  const calculateDropdownPosition = useCallback(() => {
    if (openCollaboratorsDropdown) {
      const ref = collaboratorsDropdownRefs.current[openCollaboratorsDropdown];
      if (ref) {
        const rect = ref.getBoundingClientRect();
        const dropdownWidth = 220; // min-w-[220px]
        const dropdownMaxHeight = 240; // max-h-60 = 240px
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 16; // 16px padding from viewport edges
        
        let left = rect.left;
        // If dropdown would overflow on the right, align to right edge of button
        if (left + dropdownWidth > viewportWidth - padding) {
          left = rect.right - dropdownWidth;
        }
        // Ensure it doesn't go off-screen on the left
        if (left < padding) {
          left = padding;
        }
        
        let top = rect.bottom + 8; // mt-2 = 8px
        // If dropdown would overflow at bottom, show above instead
        if (top + dropdownMaxHeight > viewportHeight - padding) {
          top = rect.top - dropdownMaxHeight - 8;
          // If still doesn't fit, position at top of viewport
          if (top < padding) {
            top = padding;
          }
        }
        
        setDropdownPosition({ top, left });
      }
    }
  }, [openCollaboratorsDropdown]);

  useEffect(() => {
    calculateDropdownPosition();
  }, [calculateDropdownPosition]);

  // Recalculate on window resize
  useEffect(() => {
    if (openCollaboratorsDropdown) {
      const handleResize = () => calculateDropdownPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleResize, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleResize, true);
      };
    }
  }, [openCollaboratorsDropdown, calculateDropdownPosition]);

  // Close collaborators dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openCollaboratorsDropdown) {
        const ref = collaboratorsDropdownRefs.current[openCollaboratorsDropdown];
        const dropdown = document.querySelector('[data-collaborators-dropdown]');
        if (ref && !ref.contains(e.target as Node) && dropdown && !dropdown.contains(e.target as Node)) {
          setOpenCollaboratorsDropdown(null);
        }
      }
    };
    if (openCollaboratorsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openCollaboratorsDropdown]);

  // Redirect to login if not authenticated, or to verify-email if unverified (skip for guests)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.emailVerified && !user.isAnonymous) {
      router.push('/verify-email');
    }
  }, [user, authLoading, router]);

  // Ensure user exists in Supabase & fetch boards
  useEffect(() => {
    if (!user) return;

    // Load cached boards immediately for instant display
    const cachedBoards = getCachedBoards(user.uid);
    if (cachedBoards && cachedBoards.length > 0) {
      setBoards(cachedBoards);
      setBoardsLoading(false);
      // Keep membersLoading true until we fetch fresh member data
    }

    let cancelled = false;

    const init = async () => {
      try {
        // Run in parallel — ensureUser and fetchAllBoards are independent
        const [, data] = await Promise.all([
          ensureUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL ?? null,
          }),
          fetchAllBoards(),
        ]);

        if (!cancelled) {
          setBoards(data);
          setError(null);
          
          // Cache the fresh data
          setCachedBoards(user.uid, data);

          // Preload snapshots for all boards in parallel (non-blocking)
          // This allows instant rendering when user clicks on a board
          const boardIds = data.map((b) => b.id);
          preloadSnapshots(boardIds).catch((err) => {
            console.warn('Failed to preload some snapshots:', err);
            // Non-critical - boards will still load, just slower
          });

          // Fetch collaborators for each board in parallel (non-blocking)
          Promise.all(
            data.map(async (b) => {
              const members = await fetchBoardMembers(b.id).catch(() => [] as BoardMember[]);
              return { id: b.id, members };
            })
          ).then(async (results) => {
            if (cancelled) return;
            const map: Record<string, BoardMember[]> = {};
            const allUids = new Set<string>();
            for (const r of results) {
              map[r.id] = r.members;
              for (const m of r.members) allUids.add(m.uid);
            }
            setBoardMembersMap(map);

            // Check which of these users are globally online
            const onlineSet = await fetchOnlineUserUids(Array.from(allUids));
            if (!cancelled) {
              setGlobalOnlineUids(onlineSet);
              setMembersLoading(false); // Members fully loaded
            }
          }).catch((err) => {
            console.error('Failed to load board members:', err);
            if (!cancelled) setMembersLoading(false); // Still hide skeleton on error
          });
        }
      } catch (err) {
        console.error('Failed to load boards:', err);
        if (!cancelled) {
          setError('Failed to load boards. Check your Supabase connection.');
        }
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    };

    init();

    // Realtime: when any user creates/updates/deletes a board, refetch so list stays in sync.
    // Also poll as fallback if Realtime replication is not enabled.
    const refetchBoards = () => {
      if (cancelled || !user) return;
      fetchAllBoards()
        .then((data) => {
          if (cancelled) return;
          setBoards(data);
          setCachedBoards(user.uid, data);
        })
        .catch((err) => {
          console.error('Realtime/polling board refresh failed:', err);
        });
    };

    const applyBoardsUpdatePayload = (payload: BoardsChangePayload): boolean => {
      if (payload.eventType !== 'UPDATE' || !payload.new) return false;

      const updatedId = payload.new.id as string | undefined;
      if (!updatedId) return false;

      setBoards((prev) => {
        const next = prev.map((b) => {
          if (b.id !== updatedId) return b;
          return {
            ...b,
            title: (payload.new?.title as string | undefined) ?? b.title,
            owner_uid: (payload.new?.owner_uid as string | undefined) ?? b.owner_uid,
            last_modified: (payload.new?.last_modified as string | undefined) ?? b.last_modified,
            thumbnail: (payload.new?.thumbnail as string | undefined) ?? b.thumbnail,
            is_locked: (payload.new?.is_locked as boolean | undefined) ?? b.is_locked,
          };
        });
        setCachedBoards(user.uid, next);
        return next;
      });
      return true;
    };

    const unsubscribeRealtime = subscribeToBoardsChanges((payload) => {
      if (cancelled || !user) return;
      // Fast path: apply UPDATE payload instantly (e.g. lock/unlock).
      const handled = applyBoardsUpdatePayload(payload);
      if (!handled) {
        refetchBoards();
      }
    });

    const pollingInterval = window.setInterval(refetchBoards, 8_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollingInterval);
      unsubscribeRealtime();
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (visibilityToastTimer.current) {
        clearTimeout(visibilityToastTimer.current);
      }
    };
  }, []);

  const showVisibilityToast = useCallback((message: string) => {
    setVisibilityToast(message);
    if (visibilityToastTimer.current) {
      clearTimeout(visibilityToastTimer.current);
    }
    visibilityToastTimer.current = setTimeout(() => setVisibilityToast(null), 1800);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleCreateBoard = useCallback(async (boardName: string) => {
    if (!user || creating) return;

    setCreating(true);
    setError(null);
    try {
      const title = boardName || `Untitled Board ${boards.length + 1}`;

      const created = await createBoardInDb({
        title,
        owner_uid: user.uid,
      });

      if (created) {
        const boardWithOwner = {
          ...created,
          owner_name: user.displayName,
          owner_email: user.email,
        };
        setBoards((prev) => {
          const updated = [boardWithOwner, ...prev];
          setCachedBoards(user.uid, updated); // Update cache
          return updated;
        });
        setShowNewBoardModal(false);
        router.push(`/board/${created.id}`);
      } else {
        setError('Failed to create board. Check the browser console for details.');
      }
    } catch (err) {
      console.error('Board creation error:', err);
      setError('Failed to create board. Check the browser console for details.');
    } finally {
      setCreating(false);
    }
  }, [user, creating, boards.length, router]);

  const handleOpenBoard = useCallback(
    (boardId: string, isLocked: boolean, ownerUid: string) => {
      if (user && isLocked && ownerUid !== user.uid) {
        setError('This board is locked by the owner.');
        return;
      }

      // Attempt to pass preloaded snapshot indicator to board page for instant loading
      try {
        const cachedSnapshot = getCachedSnapshot(boardId);
        if (cachedSnapshot) {
          // Store indicator in sessionStorage (temporary, cleared after board reads it)
          // This signals to the board page that snapshot is already cached
          sessionStorage.setItem(`board_preload_${boardId}`, 'ready');
        }
      } catch (err) {
        // Ignore errors - board will load normally via network
        console.warn('Failed to prepare snapshot indicator for instant load:', err);
      }
      
      // Navigate immediately — fire-and-forget the timestamp update
      router.push(`/board/${boardId}`);
      updateBoardInDb(boardId, {
        last_modified: new Date().toISOString(),
      }).catch(console.error);
    },
    [router, user]
  );

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      await deleteBoardFromDb(boardId);
      setBoards((prev) => {
        const updated = prev.filter((b) => b.id !== boardId);
        if (user) setCachedBoards(user.uid, updated); // Update cache
        return updated;
      });
    },
    [user]
  );

  const handleToggleLock = useCallback(
    async (boardId: string, currentlyLocked: boolean) => {
      const nextLocked = !currentlyLocked;
      setError(null);
      try {
        await updateBoardInDb(boardId, { is_locked: nextLocked });
        setBoards((prev) => {
          const updated = prev.map((b) =>
            b.id === boardId ? { ...b, is_locked: nextLocked } : b
          );
          if (user) setCachedBoards(user.uid, updated);
          return updated;
        });
        showVisibilityToast(nextLocked ? 'Visibility off' : 'Visibility on');
      } catch (err) {
        console.error('Failed to toggle board lock:', err);
        setError(
          'Failed to save board lock in database. Ensure `is_locked` exists and your Supabase update policy allows this action.'
        );
      }
    },
    [user, showVisibilityToast]
  );

  const allBoards = useMemo<BoardRow[]>(() => {
    const currentUserUid = user?.uid || 'unknown-user';

    // Owners see all their boards; non-owners do not see locked boards
    const visibleBoardsRaw = boards.filter(
      (board) =>
        board.owner_uid === currentUserUid || !(board.is_locked ?? false)
    );

    return visibleBoardsRaw.map((board) => {
      const isOwner = board.owner_uid === currentUserUid;
      const ownerLabel =
        board.owner_name ||
        board.owner_email?.split('@')[0] ||
        (isOwner ? 'You' : 'Unknown');

      const members = boardMembersMap[board.id] || [];
      const collabs: CollabInfo[] = members.map((m) => ({
        uid: m.uid,
        name: m.displayName || m.email?.split('@')[0] || 'Unknown',
        color: getUserColor(m.uid),
        isOnline: globalOnlineUids.has(m.uid),
      }));

      return {
        id: board.id,
        title: board.title || 'Untitled Board',
        ownerName: isOwner ? `${ownerLabel} (You)` : ownerLabel,
        ownerUid: board.owner_uid,
        collaborators: collabs,
        createdAt: new Date(board.created_at).getTime(),
        lastModified: new Date(board.last_modified).getTime(),
        sharedWithMe: !isOwner,
        thumbnail: board.thumbnail,
        isLocked: board.is_locked ?? false,
      };
    });
  }, [boards, user?.uid, boardMembersMap, globalOnlineUids]);

  const visibleBoards = useMemo(() => {
    const filteredByScope = allBoards.filter((board) => {
      if (visibilityFilter === 'owned') return board.ownerUid === user?.uid;
      if (visibilityFilter === 'shared') return board.sharedWithMe;
      return true;
    });

    const searchTerm = search.trim().toLowerCase();
    const filtered = filteredByScope.filter((board) => {
      if (!searchTerm) return true;
      return (
        board.title.toLowerCase().includes(searchTerm) ||
        board.ownerName.toLowerCase().includes(searchTerm)
      );
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'alphabetical') return left.title.localeCompare(right.title);
      if (sortBy === 'created') return right.createdAt - left.createdAt;
      return right.lastModified - left.lastModified;
    });
  }, [allBoards, search, sortBy, user?.uid, visibilityFilter]);

  // Preload snapshots for visible boards when they change (filter/search)
  useEffect(() => {
    if (visibleBoards.length === 0) return;
    
    const visibleBoardIds = visibleBoards.map((b) => b.id);
    // Preload in background - don't block UI
    preloadSnapshots(visibleBoardIds).catch((err) => {
      console.warn('Failed to preload visible board snapshots:', err);
    });
  }, [visibleBoards]);

  if (!mounted || authLoading || !user || (!user.emailVerified && !user.isAnonymous)) {
    return (
      <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8 hide-scrollbar overflow-y-auto">
        <div className="neon-orb left-[-3rem] top-6 h-64 w-64 bg-cyan-300/45" />
        <div className="neon-orb right-[-3rem] top-20 h-80 w-80 bg-blue-300/40" />
        <div className="neon-orb bottom-[-5rem] left-[40%] h-72 w-72 bg-emerald-300/35" />

        {/* Real Header */}
        <header className="relative z-20 mx-auto flex w-full max-w-[1200px] items-center justify-between rounded-3xl border border-slate-200/70 bg-white/90 px-6 py-4 shadow-[0_25px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur-3xl">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText={false} logoClassName="h-14 w-auto drop-shadow-none" />
            <div>
              <p className="text-lg font-semibold text-slate-900">Collabry</p>
              <p className="text-xs text-slate-500">Your workspace</p>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="relative w-full max-w-xs">
              <input
                value=""
                onChange={() => {}}
                placeholder="Search boards or collaborators..."
                disabled
                className="w-full rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-2.5 pr-10 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35m1.45-5.65a6 6 0 11-12 0 6 6 0 0112 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-500 text-xs font-bold tracking-wide text-white shadow-md shadow-cyan-200">
              U
            </div>
          </div>
        </header>

        {/* Main Content - Only Board Cards Skeleton */}
        <main className="relative z-10 mx-auto w-full max-w-[1200px]">
          <section className="mt-8 space-y-6 rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_35px_120px_-45px_rgba(15,23,42,0.65)]">
            {/* Real Title and Button */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/70 pb-4">
              <div>
                <p className="text-3xl font-semibold text-slate-900">Your Boards</p>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  Collaborate, brainstorm, and organize your ideas in real-time.
                </p>
              </div>
              <button
                disabled
                className="rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200 opacity-60 cursor-not-allowed"
              >
                + New Board
              </button>
            </div>

            {/* Real Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Filter</span>
                  <select
                    disabled
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white opacity-60 cursor-not-allowed"
                  >
                    <option value="all">All boards</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Sort</span>
                  <select
                    disabled
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white opacity-60 cursor-not-allowed"
                  >
                    <option value="last_modified">Last modified</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Loading boards...
              </p>
            </div>

            {/* ONLY Board Cards Skeleton */}
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex animate-pulse flex-col gap-4 rounded-[26px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.45)]"
                >
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="h-5 w-1/2 rounded-full bg-slate-200/70" />
                      <div className="h-3 w-1/3 rounded-full bg-slate-200/70" />
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Collaborator avatars skeleton */}
                      <div className="flex -space-x-1.5">
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                      </div>
                      <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8 hide-scrollbar overflow-y-auto">
      <div className="neon-orb left-[-3rem] top-6 h-64 w-64 bg-cyan-300/45" />
      <div className="neon-orb right-[-3rem] top-20 h-80 w-80 bg-blue-300/40" />
      <div className="neon-orb bottom-[-5rem] left-[40%] h-72 w-72 bg-emerald-300/35" />

      {visibilityToast && (
        <div className="fixed left-1/2 top-6 z-40 -translate-x-1/2 rounded-full border border-white bg-black/80 px-5 py-2 text-sm font-semibold text-white shadow-lg">
          {visibilityToast}
        </div>
      )}

      <header className="relative z-20 mx-auto flex w-full max-w-[1200px] items-center justify-between rounded-3xl border border-slate-200/70 bg-white/90 px-6 py-4 shadow-[0_25px_80px_-40px_rgba(15,23,42,0.55)] backdrop-blur-3xl">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" showText={false} logoClassName="h-14 w-auto drop-shadow-none" />
          <div>
            <p className="text-lg font-semibold text-slate-900">Collabry</p>
            <p className="text-xs text-slate-500">Your workspace</p>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          <div className="relative w-full max-w-xs">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search boards or collaborators..."
              className="w-full rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-2.5 pr-10 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35m1.45-5.65a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
            </span>
          </div>
          <UserMenu displayName={user.displayName} email={user.email} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1200px]">
        <section className="mt-8 space-y-6 rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_35px_120px_-45px_rgba(15,23,42,0.65)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/70 pb-4">
            <div>
              <p className="text-3xl font-semibold text-slate-900">Your Boards</p>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Collaborate, brainstorm, and organize your ideas in real-time.
              </p>
            </div>
            <button
              onClick={() => setShowNewBoardModal(true)}
              disabled={creating}
              className="rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + New Board
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Filter</span>
                <select
                  value={visibilityFilter}
                  onChange={(event) => setVisibilityFilter(event.target.value as BoardVisibilityFilter)}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white"
                >
                  <option value="all">All boards</option>
                  <option value="owned">Owned by me</option>
                  <option value="shared">Shared with me</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Sort</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as BoardSort)}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white"
                >
                  <option value="last_modified">Last modified</option>
                  <option value="created">Last created</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Showing {visibleBoards.length} of {allBoards.length} boards
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {boardsLoading || membersLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex animate-pulse flex-col gap-4 rounded-[26px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.45)]"
                >
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="h-5 w-1/2 rounded-full bg-slate-200/70" />
                      <div className="h-3 w-1/3 rounded-full bg-slate-200/70" />
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Collaborator avatars skeleton */}
                      <div className="flex -space-x-1.5">
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                        <div className="h-7 w-7 rounded-full bg-slate-200/70 border-2 border-white" />
                      </div>
                      <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                    </div>
                  </div>
                </div>
              ))
            ) : visibleBoards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/70 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
                {boards.length === 0
                  ? 'No boards yet. Create one to save a snapshot of your canvas.'
                  : 'No boards match your current filters.'}
              </div>
            ) : (
              visibleBoards.map((board) => {
                const MAX_AVATARS = 4;
                const visibleCollabs = board.collaborators.slice(0, MAX_AVATARS);
                const overflow = board.collaborators.length - MAX_AVATARS;

                return (
                  <div
                    key={board.id}
                    className={`group relative overflow-hidden flex flex-col gap-4 rounded-[26px] border bg-white/90 p-4 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.45)] transition hover:shadow-[0_30px_100px_-40px_rgba(15,23,42,0.55)] ${
                      board.isLocked ? 'border-red-300' : 'border-slate-200/70'
                    }`}
                  >
                    <div className="relative z-10 flex flex-1 flex-col justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            onClick={() => handleOpenBoard(board.id, board.isLocked, board.ownerUid)}
                            className="text-left"
                          >
                            <p className="text-lg font-semibold text-slate-900">{board.title}</p>
                          </button>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                            {timeAgo(board.lastModified)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">
                          Owned by {board.ownerName}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <div
                            className="relative"
                            ref={(el) => {
                              collaboratorsDropdownRefs.current[board.id] = el;
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenCollaboratorsDropdown(
                                  openCollaboratorsDropdown === board.id ? null : board.id
                                );
                              }}
                              className="flex items-center gap-2 transition hover:opacity-80"
                            >
                              <div className="flex -space-x-1.5">
                                {visibleCollabs.map((c, i) => (
                                  <div
                                    key={c.uid}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-sm"
                                    style={{
                                      backgroundColor: c.color,
                                      zIndex: MAX_AVATARS - i,
                                    }}
                                    title={c.name}
                                  >
                                    {c.name.charAt(0).toUpperCase()}
                                  </div>
                                ))}
                                {overflow > 0 && (
                                  <div
                                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[10px] font-semibold text-gray-600 shadow-sm"
                                    style={{ zIndex: 0 }}
                                  >
                                    +{overflow}
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500">
                                {board.collaborators.length} collaborators
                              </span>
                            </button>
                          </div>

                          {/* Collaborators Dropdown */}
                          {openCollaboratorsDropdown === board.id && dropdownPosition && (
                            <div
                              data-collaborators-dropdown
                              className="fixed z-[100] w-[220px] rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
                              style={{
                                top: `${dropdownPosition.top}px`,
                                left: `${dropdownPosition.left}px`,
                              }}
                            >
                              <div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                                Collaborators — {board.collaborators.length}
                              </div>
                              <div className="max-h-60 overflow-y-auto">
                                {board.collaborators.map((c) => (
                                  <div
                                    key={c.uid}
                                    className="flex items-center gap-2 px-3 py-2 transition hover:bg-gray-50"
                                  >
                                    <div
                                      className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                      style={{ backgroundColor: c.color }}
                                    >
                                      {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-sm font-semibold text-slate-700 truncate">
                                        {c.name}
                                      </span>
                                      {c.isOnline && (
                                        <span className="text-[11px] text-emerald-500">
                                          Online
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {board.ownerUid === user?.uid ? (
                            <>
                              <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleLock(board.id, board.isLocked);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                aria-label={board.isLocked ? 'Visibility off' : 'Visibility on'}
                                title={board.isLocked ? 'Visibility off' : 'Visibility on'}
                            >
                                {board.isLocked ? (
                                  <VisibilityOff className="h-4 w-4" />
                                ) : (
                                  <Visibility className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ id: board.id, title: board.title });
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 transition hover:border-red-300 hover:text-red-600"
                                aria-label={`Delete ${board.title}`}
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-600">
                              Collab
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      <NewBoardModal
        open={showNewBoardModal}
        loading={creating}
        onConfirm={handleCreateBoard}
        onClose={() => setShowNewBoardModal(false)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Board?"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.title}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={true}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDeleteBoard(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      <InviteModal
        open={!!inviteTarget}
        boardId={inviteTarget?.id ?? ''}
        boardTitle={inviteTarget?.title ?? ''}
        inviterName={user?.displayName ?? 'Someone'}
        inviterUid={user?.uid ?? ''}
        onClose={() => setInviteTarget(null)}
      />

      <InviteAppModal
        open={showInviteModal}
        inviterName={user?.displayName ?? 'Someone'}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
}
