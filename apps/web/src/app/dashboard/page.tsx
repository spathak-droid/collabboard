/**
 * Dashboard Page - Boards persisted in Supabase
 */

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { signOut } from '@/lib/firebase/auth';
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
  type BoardWithOwner,
  type BoardMember,
} from '@/lib/supabase/client';
import { getUserColor } from '@/lib/utils/colors';
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
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<BoardVisibilityFilter>('all');
  const [sortBy, setSortBy] = useState<BoardSort>('last_modified');
  const [boards, setBoards] = useState<BoardWithOwner[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardMembersMap, setBoardMembersMap] = useState<Record<string, BoardMember[]>>({});
  const [globalOnlineUids, setGlobalOnlineUids] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ id: string; title: string } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);

  // Send heartbeat every 60s so other users know we're online
  usePresenceHeartbeat(user?.uid);

  // Tick every 30s so relative timestamps stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Redirect to login if not authenticated, or to verify-email if unverified
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.emailVerified) {
      router.push('/verify-email');
    }
  }, [user, authLoading, router]);

  // Ensure user exists in Supabase & fetch boards
  useEffect(() => {
    if (!user) return;

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
            if (!cancelled) setGlobalOnlineUids(onlineSet);
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
    return () => { cancelled = true; };
  }, [user]);

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
        setBoards((prev) => [boardWithOwner, ...prev]);
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
    (boardId: string) => {
      // Navigate immediately — fire-and-forget the timestamp update
      router.push(`/board/${boardId}`);
      updateBoardInDb(boardId, {
        last_modified: new Date().toISOString(),
      }).catch(console.error);
    },
    [router]
  );

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      await deleteBoardFromDb(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    },
    []
  );

  const allBoards = useMemo<BoardRow[]>(() => {
    const currentUserUid = user?.uid || 'unknown-user';

    return boards.map((board) => {
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

  if (authLoading || !user || !user.emailVerified || boardsLoading) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden">
        <div className="neon-orb left-[-3rem] top-6 h-64 w-64 bg-cyan-300/45" />
        <div className="neon-orb right-[-3rem] top-20 h-80 w-80 bg-blue-300/40" />
        <div className="neon-orb bottom-[-5rem] left-[40%] h-72 w-72 bg-emerald-300/35" />
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-6 py-4 text-lg font-medium text-slate-700">Loading workspace...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="neon-orb left-[-3rem] top-6 h-64 w-64 bg-cyan-300/45" />
      <div className="neon-orb right-[-3rem] top-20 h-80 w-80 bg-blue-300/40" />
      <div className="neon-orb bottom-[-5rem] left-[40%] h-72 w-72 bg-emerald-300/35" />

      <header className="relative z-20 mx-auto w-full max-w-[1320px] pb-5">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-transparent px-5 py-4 shadow-[0_20px_60px_-38px_rgba(0,67,156,0.3)]">
          <BrandLogo size="xl" showText={false} logoClassName="h-24 w-auto drop-shadow-none" />
          <div className="flex items-center gap-3">
            {/* TODO: Uncomment when Resend domain is verified
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite Members
            </button>
            */}
            <UserMenu displayName={user.displayName} email={user.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1320px]">
        <section className="rounded-2xl border border-slate-200 bg-transparent p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-3xl font-semibold text-slate-900">Boards</h2>
            <button
              onClick={() => setShowNewBoardModal(true)}
              disabled={creating}
              className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Create New
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-5 grid gap-3 lg:grid-cols-[1.5fr_auto_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search boards, owners..."
              className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-cyan-500"
            />
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value as BoardVisibilityFilter)}
              className="rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-cyan-500"
            >
              <option value="all">All boards</option>
              <option value="owned">Owned by me</option>
              <option value="shared">Shared with me</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as BoardSort)}
              className="rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-slate-700 outline-none transition-colors focus:border-cyan-500"
            >
              <option value="last_modified">Last modified</option>
              <option value="created">Last created</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-transparent">
            <div className="grid grid-cols-12 border-b border-slate-200 bg-transparent px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="col-span-4">Board</div>
              <div className="col-span-3">Collaborators</div>
              <div className="col-span-2">Last Modified</div>
              <div className="col-span-2">Owner</div>
              <div className="col-span-1"></div>
            </div>

            {visibleBoards.length === 0 ? (
              <div className="bg-transparent px-5 py-10 text-center text-slate-500">
                {boards.length === 0
                  ? 'No boards yet. Click "+ Create New" to get started!'
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
                    className="grid w-full grid-cols-12 items-center border-b border-slate-200/60 bg-transparent px-5 py-4 text-left transition-colors hover:bg-cyan-50/40 last:border-b-0"
                  >
                    <button
                      onClick={() => handleOpenBoard(board.id)}
                      className="col-span-4 text-left"
                    >
                      <p className="text-lg font-semibold text-slate-900">{board.title}</p>
                    </button>
                    <div className="col-span-3">
                      {board.collaborators.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center">
                          <div className="flex -space-x-2">
                            {visibleCollabs.map((c, i) => (
                              <div
                                key={c.uid}
                                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-sm"
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
                                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[11px] font-bold text-gray-600 shadow-sm"
                                style={{ zIndex: 0 }}
                              >
                                +{overflow}
                              </div>
                            )}
                          </div>
                          <span className="ml-2 text-xs text-slate-500">
                            {board.collaborators.length}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-sm text-slate-500">{timeAgo(board.lastModified)}</div>
                    <div className="col-span-2 text-sm text-slate-700">{board.ownerName}</div>
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      {board.ownerUid === user?.uid ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: board.id, title: board.title });
                            }}
                            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            title="Delete board"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                          Collab
                        </span>
                      )}
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
