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
import { ShareBoardModal } from '@/components/ui/ShareBoardModal';
import { JoinWithKeyModal } from '@/components/ui/JoinWithKeyModal';
import { BoardCard, type BoardRow, type CollabInfo } from '@/components/dashboard/BoardCard';
import {
  ensureUser,
  createBoard as createBoardInDb,
  fetchAllBoards,
  fetchBoardIdsWithAccess,
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

type BoardSort = 'last_modified' | 'created' | 'alphabetical';
type BoardSection = 'all' | 'your' | 'shared' | 'public';

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
  const [sortBy, setSortBy] = useState<BoardSort>('last_modified');
  const [boards, setBoards] = useState<BoardWithOwner[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true); // Track collaborators loading
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardMembersMap, setBoardMembersMap] = useState<Record<string, BoardMember[]>>({});
  const [boardIdsWithAccess, setBoardIdsWithAccess] = useState<Set<string>>(new Set());
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ id: string; title: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null);
  const [showJoinKeyModal, setShowJoinKeyModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [activeSection, setActiveSection] = useState<BoardSection>('your');
  const refetchBoardsRef = useRef<() => void>(() => {});
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
        // Run in parallel — ensureUser, fetchAllBoards, and board access list
        const [, data, accessIds] = await Promise.all([
          ensureUser({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL ?? null,
          }),
          fetchAllBoards(),
          fetchBoardIdsWithAccess(user.uid),
        ]);

        if (!cancelled) {
          setBoards(data);
          setBoardIdsWithAccess(new Set(accessIds));
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
      Promise.all([fetchAllBoards(), fetchBoardIdsWithAccess(user.uid)])
        .then(([data, accessIds]) => {
          if (cancelled) return;
          setBoards(data);
          setBoardIdsWithAccess(new Set(accessIds));
          setCachedBoards(user.uid, data);
        })
        .catch((err) => {
          console.error('Realtime/polling board refresh failed:', err);
        });
    };

    refetchBoardsRef.current = refetchBoards;

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
      if (user && isLocked && ownerUid !== user.uid && !boardIdsWithAccess.has(boardId)) {
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
    [router, user, boardIdsWithAccess]
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

    // Owners see their boards; non-owners see unlocked boards or boards they joined (via key or invite)
    const visibleBoardsRaw = boards.filter(
      (board) =>
        board.owner_uid === currentUserUid ||
        !(board.is_locked ?? false) ||
        boardIdsWithAccess.has(board.id)
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
  }, [boards, user?.uid, boardMembersMap, boardIdsWithAccess, globalOnlineUids]);

  const { yourBoards, sharedBoards, publicBoards } = useMemo(() => {
    const currentUserUid = user?.uid;
    const your = allBoards.filter((board) => board.ownerUid === currentUserUid);
    const shared = allBoards.filter(
      (board) => board.ownerUid !== currentUserUid && boardIdsWithAccess.has(board.id)
    );
    // Public = non-owned, unlocked, no explicit access (invite/key). Viewing a public board does not grant access.
    const publicB = allBoards.filter(
      (board) =>
        board.ownerUid !== currentUserUid &&
        !boardIdsWithAccess.has(board.id) &&
        !board.isLocked
    );
    return { yourBoards: your, sharedBoards: shared, publicBoards: publicB };
  }, [allBoards, user?.uid, boardIdsWithAccess]);

  const applySearchAndSort = useCallback(
    (list: BoardRow[]) => {
      const searchTerm = search.trim().toLowerCase();
      const filtered = searchTerm
        ? list.filter(
            (board) =>
              board.title.toLowerCase().includes(searchTerm) ||
              board.ownerName.toLowerCase().includes(searchTerm)
          )
        : list;
      return [...filtered].sort((left, right) => {
        if (sortBy === 'alphabetical') return left.title.localeCompare(right.title);
        if (sortBy === 'created') return right.createdAt - left.createdAt;
        return right.lastModified - left.lastModified;
      });
    },
    [search, sortBy]
  );

  const visibleYourBoards = useMemo(
    () => applySearchAndSort(yourBoards),
    [yourBoards, applySearchAndSort]
  );
  const visibleSharedBoards = useMemo(
    () => applySearchAndSort(sharedBoards),
    [sharedBoards, applySearchAndSort]
  );
  const visiblePublicBoards = useMemo(
    () => applySearchAndSort(publicBoards),
    [publicBoards, applySearchAndSort]
  );
  const visibleBoards = useMemo(
    () => [...visibleYourBoards, ...visibleSharedBoards, ...visiblePublicBoards],
    [visibleYourBoards, visibleSharedBoards, visiblePublicBoards]
  );

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
        <header className="relative z-20 mx-auto flex w-full max-w-[1200px] items-center justify-between rounded-3xl border-2 border-slate-200 bg-white px-6 py-4 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.12),0_4px_12px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.05)] backdrop-blur-sm">
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
          <section className="mt-8 space-y-6 rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_4px_16px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)]">
            {/* Real Title and Button */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-200 pb-4">
              <div>
                <p className="text-3xl font-semibold text-slate-900">Boards</p>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  Collaborate, brainstorm, and organize your ideas in real-time.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2.5 text-sm font-medium text-slate-400 opacity-60 cursor-not-allowed"
                >
                  Join with key
                </button>
                <button
                  disabled
                  className="rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200 opacity-60 cursor-not-allowed"
                >
                  + New Board
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Filter</span>
                  <select disabled className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 opacity-60 cursor-not-allowed">
                    <option value="all">All boards</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Sort</span>
                  <select disabled className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 opacity-60 cursor-not-allowed">
                    <option value="last_modified">Last modified</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">Loading boards...</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {['All boards', 'Your boards', 'Shared with me', 'Public boards'].map((label, i) => (
                <span
                  key={label}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-400 bg-slate-100/80 animate-pulse"
                >
                  {label} (—)
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex animate-pulse flex-col gap-2 rounded-xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_4px_14px_0_rgba(0,0,0,0.08),0_2px_6px_0_rgba(0,0,0,0.04)] aspect-[3/2] min-w-0"
                >
                  <div className="h-4 w-2/3 rounded bg-slate-200/70" />
                  <div className="h-3 w-1/2 rounded bg-slate-200/70" />
                  <div className="flex items-center gap-2 mt-1 flex-1">
                    <div className="h-6 w-6 rounded-full bg-slate-200/70" />
                    <div className="h-3 w-12 rounded bg-slate-200/70" />
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

      <header className="relative z-20 mx-auto flex w-full max-w-[1200px] items-center justify-between rounded-3xl border-2 border-slate-200 bg-white px-6 py-4 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.12),0_4px_12px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.05)] backdrop-blur-sm">
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
        <section className="mt-8 space-y-6 rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_4px_16px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-200 pb-4">
            <div>
              <p className="text-3xl font-semibold text-slate-900">Boards</p>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Collaborate, brainstorm, and organize your ideas in real-time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowJoinKeyModal(true)}
                className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-slate-50"
              >
                Join with key
              </button>
              <button
                onClick={() => setShowNewBoardModal(true)}
                disabled={creating}
                className="rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                + New Board
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-b border-slate-200 pb-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-[0.3em] text-slate-400">Filter</span>
                <select
                  value={activeSection}
                  onChange={(event) => setActiveSection(event.target.value as BoardSection)}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white"
                >
                  <option value="all">All boards</option>
                  <option value="your">Your boards</option>
                  <option value="shared">Shared with me</option>
                  <option value="public">Public boards</option>
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
          </div>

          {/* Tabs: Your boards | Shared with me | Public boards (synced with Filter) */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all' as const, label: 'All boards', count: visibleBoards.length },
                { id: 'your' as const, label: 'Your boards', count: visibleYourBoards.length },
                { id: 'shared' as const, label: 'Shared with me', count: visibleSharedBoards.length },
                { id: 'public' as const, label: 'Public boards', count: visiblePublicBoards.length },
              ] as const
            ).map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  activeSection === id
                    ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {boardsLoading || membersLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex animate-pulse flex-col gap-2 rounded-xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_4px_14px_0_rgba(0,0,0,0.08),0_2px_6px_0_rgba(0,0,0,0.04)] aspect-[3/2] min-w-0"
                >
                  <div className="h-4 w-2/3 rounded bg-slate-200/70" />
                  <div className="h-3 w-1/2 rounded bg-slate-200/70" />
                  <div className="flex items-center gap-2 mt-1 flex-1">
                    <div className="h-6 w-6 rounded-full bg-slate-200/70" />
                    <div className="h-3 w-12 rounded bg-slate-200/70" />
                  </div>
                </div>
              ))
            ) : activeSection === 'all' ? (
              visibleBoards.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                  {allBoards.length === 0
                    ? 'No boards yet. Create one with + New Board or join one with a key.'
                    : 'No boards match your search.'}
                </div>
              ) : (
                visibleBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    user={user ? { uid: user.uid } : null}
                    openCollaboratorsDropdown={openCollaboratorsDropdown}
                    setOpenCollaboratorsDropdown={setOpenCollaboratorsDropdown}
                    collaboratorsDropdownRefs={collaboratorsDropdownRefs}
                    dropdownPosition={dropdownPosition}
                    onOpenBoard={handleOpenBoard}
                    onShare={() => setShareTarget({ id: board.id, title: board.title })}
                    onToggleLock={() => handleToggleLock(board.id, board.isLocked)}
                    onDelete={() => setDeleteTarget({ id: board.id, title: board.title })}
                    timeAgo={timeAgo}
                  />
                ))
              )
            ) : activeSection === 'your' ? (
              visibleYourBoards.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                  {yourBoards.length === 0
                    ? 'No boards yet. Create one with + New Board.'
                    : 'No boards match your search.'}
                </div>
              ) : (
                visibleYourBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    user={user ? { uid: user.uid } : null}
                    openCollaboratorsDropdown={openCollaboratorsDropdown}
                    setOpenCollaboratorsDropdown={setOpenCollaboratorsDropdown}
                    collaboratorsDropdownRefs={collaboratorsDropdownRefs}
                    dropdownPosition={dropdownPosition}
                    onOpenBoard={handleOpenBoard}
                    onShare={() => setShareTarget({ id: board.id, title: board.title })}
                    onToggleLock={() => handleToggleLock(board.id, board.isLocked)}
                    onDelete={() => setDeleteTarget({ id: board.id, title: board.title })}
                    timeAgo={timeAgo}
                  />
                ))
              )
            ) : activeSection === 'shared' ? (
              visibleSharedBoards.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                  {sharedBoards.length === 0
                    ? 'Boards shared with you (via key or invite) will appear here.'
                    : 'No boards match your search.'}
                </div>
              ) : (
                visibleSharedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    user={user ? { uid: user.uid } : null}
                    openCollaboratorsDropdown={openCollaboratorsDropdown}
                    setOpenCollaboratorsDropdown={setOpenCollaboratorsDropdown}
                    collaboratorsDropdownRefs={collaboratorsDropdownRefs}
                    dropdownPosition={dropdownPosition}
                    onOpenBoard={handleOpenBoard}
                    onShare={() => setShareTarget({ id: board.id, title: board.title })}
                    onToggleLock={() => handleToggleLock(board.id, board.isLocked)}
                    onDelete={() => setDeleteTarget({ id: board.id, title: board.title })}
                    timeAgo={timeAgo}
                  />
                ))
              )
            ) : visiblePublicBoards.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200/70 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                {publicBoards.length === 0
                  ? 'No public boards right now. Unlocked boards from others will appear here.'
                  : 'No boards match your search.'}
              </div>
            ) : (
              visiblePublicBoards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  user={user ? { uid: user.uid } : null}
                  openCollaboratorsDropdown={openCollaboratorsDropdown}
                  setOpenCollaboratorsDropdown={setOpenCollaboratorsDropdown}
                  collaboratorsDropdownRefs={collaboratorsDropdownRefs}
                  dropdownPosition={dropdownPosition}
                  onOpenBoard={handleOpenBoard}
                  onShare={() => setShareTarget({ id: board.id, title: board.title })}
                  onToggleLock={() => handleToggleLock(board.id, board.isLocked)}
                  onDelete={() => setDeleteTarget({ id: board.id, title: board.title })}
                  timeAgo={timeAgo}
                />
              ))
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

      <ShareBoardModal
        open={!!shareTarget}
        boardId={shareTarget?.id ?? ''}
        boardTitle={shareTarget?.title ?? ''}
        ownerUid={user?.uid ?? ''}
        onClose={() => setShareTarget(null)}
      />

      <JoinWithKeyModal
        open={showJoinKeyModal}
        userUid={user?.uid ?? ''}
        onClose={() => setShowJoinKeyModal(false)}
        onJoined={() => refetchBoardsRef.current?.()}
      />
    </div>
  );
}
