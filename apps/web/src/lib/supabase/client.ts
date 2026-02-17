/**
 * Supabase client configuration & helpers
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Database row types ──────────────────────────────────────

export interface DbUser {
  uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface Board {
  id: string;
  title: string;
  owner_uid: string;
  created_at: string;
  last_modified: string;
  thumbnail?: string;
  is_public: boolean;
}

export interface BoardSnapshot {
  id: number;
  board_id: string;
  state: string; // base64 encoded Yjs state
  created_at: string;
  created_by: string;
}

export interface BoardAccess {
  board_id: string;
  user_uid: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

// ── User helpers ────────────────────────────────────────────

/**
 * Ensure a Firebase user exists in the Supabase `users` table.
 * Uses upsert so it's safe to call on every login / board action.
 */
export const ensureUser = async (user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<void> => {
  const { error } = await supabase.from('users').upsert(
    {
      uid: user.uid,
      email: user.email ?? '',
      display_name: user.displayName,
      photo_url: user.photoURL,
    },
    { onConflict: 'uid' }
  );

  if (error) {
    console.error('[supabase] ensureUser failed:', error);
  }
};

// ── Board CRUD ──────────────────────────────────────────────

export const createBoard = async (board: {
  title: string;
  owner_uid: string;
}): Promise<Board | null> => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('boards')
    .insert({
      title: board.title,
      owner_uid: board.owner_uid,
      created_at: now,
      last_modified: now,
    })
    .select()
    .single();

  if (error) {
    console.error('[supabase] createBoard failed:', error);
    return null;
  }

  return data;
};

export interface BoardWithOwner extends Board {
  owner_name: string | null;
  owner_email: string | null;
}

/**
 * Fetch ALL boards (visible to every logged-in user) with owner info.
 */
export const fetchAllBoards = async (): Promise<BoardWithOwner[]> => {
  const { data, error } = await supabase
    .from('boards')
    .select('*, users!boards_owner_uid_fkey(display_name, email)')
    .order('last_modified', { ascending: false });

  if (error) {
    console.error('[supabase] fetchAllBoards failed:', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const users = row.users as { display_name: string | null; email: string | null } | null;
    return {
      id: row.id as string,
      title: row.title as string,
      owner_uid: row.owner_uid as string,
      created_at: row.created_at as string,
      last_modified: row.last_modified as string,
      thumbnail: row.thumbnail as string | undefined,
      is_public: row.is_public as boolean,
      owner_name: users?.display_name ?? null,
      owner_email: users?.email ?? null,
    };
  });
};

export const updateBoard = async (
  boardId: string,
  updates: Partial<Pick<Board, 'title' | 'last_modified' | 'thumbnail'>>
): Promise<void> => {
  const { error } = await supabase
    .from('boards')
    .update(updates)
    .eq('id', boardId);

  if (error) {
    console.error('[supabase] updateBoard failed:', error);
  }
};

// ── Board members ────────────────────────────────────────────

export interface BoardMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: 'owner' | 'editor' | 'viewer';
}

/**
 * Fetch all members who have access to a board (from board_access + owner).
 * Returns the owner first, then other members sorted by role.
 */
export const fetchBoardMembers = async (boardId: string): Promise<BoardMember[]> => {
  // Fetch board owner
  const { data: board } = await supabase
    .from('boards')
    .select('owner_uid, users!boards_owner_uid_fkey(display_name, email)')
    .eq('id', boardId)
    .single();

  // Fetch collaborators from board_access
  const { data: accessRows } = await supabase
    .from('board_access')
    .select('user_uid, role, users!board_access_user_uid_fkey(display_name, email)')
    .eq('board_id', boardId);

  const members: BoardMember[] = [];

  // Add owner
  if (board) {
    const usersData = board.users as unknown;
    const ownerUser = (Array.isArray(usersData) ? usersData[0] : usersData) as { display_name: string | null; email: string | null } | null;
    members.push({
      uid: board.owner_uid as string,
      displayName: ownerUser?.display_name ?? null,
      email: ownerUser?.email ?? null,
      role: 'owner',
    });
  }

  // Add collaborators (skip if they're the owner — avoid duplicates)
  if (accessRows) {
    for (const row of accessRows) {
      const r = row as Record<string, unknown>;
      const uid = r.user_uid as string;
      if (board && uid === (board.owner_uid as string)) continue;
      const u = r.users as { display_name: string | null; email: string | null } | null;
      members.push({
        uid,
        displayName: u?.display_name ?? null,
        email: u?.email ?? null,
        role: r.role as 'owner' | 'editor' | 'viewer',
      });
    }
  }

  return members;
};

/**
 * Ensure a user has a row in board_access for a given board.
 * Called when a user opens a board so they persist as a known collaborator
 * even after they disconnect. Checks for existing row first to avoid
 * duplicate key errors (works regardless of unique constraints).
 * The board owner is skipped (they're already shown via the boards table).
 */
export const ensureBoardAccess = async (
  boardId: string,
  userUid: string,
  role: 'editor' | 'viewer' = 'editor'
): Promise<void> => {
  // Check if this user is the board owner — owners don't need a board_access row
  const { data: board } = await supabase
    .from('boards')
    .select('owner_uid')
    .eq('id', boardId)
    .single();

  if (board?.owner_uid === userUid) return;

  // Check if row already exists
  const { data: existing } = await supabase
    .from('board_access')
    .select('board_id')
    .eq('board_id', boardId)
    .eq('user_uid', userUid)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('board_access').insert({
    board_id: boardId,
    user_uid: userUid,
    role,
  });

  if (error) {
    console.error('[supabase] ensureBoardAccess failed:', error);
  }
};

// ── User Presence (heartbeat) ────────────────────────────────

const PRESENCE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Remove a user's presence row so they immediately appear offline.
 * Called on sign-out and when the heartbeat hook unmounts.
 */
export const clearPresence = async (userUid: string): Promise<void> => {
  await supabase.from('user_presence').delete().eq('user_uid', userUid);
};

/**
 * Upsert the current user's heartbeat in user_presence.
 * Called every 60s while the user is logged in.
 */
export const heartbeatPresence = async (userUid: string): Promise<void> => {
  const { error } = await supabase.from('user_presence').upsert(
    { user_uid: userUid, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_uid' }
  );
  if (error) {
    // Table may not exist yet — fail silently
    if (!error.message?.includes('user_presence')) {
      console.error('[supabase] heartbeatPresence failed:', error);
    }
  }
};

/**
 * Fetch presence status for a list of user UIDs.
 * Returns a Set of UIDs that are considered "online" (seen within PRESENCE_TIMEOUT_MS).
 */
export const fetchOnlineUserUids = async (userUids: string[]): Promise<Set<string>> => {
  if (userUids.length === 0) return new Set();

  const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString();
  const { data, error } = await supabase
    .from('user_presence')
    .select('user_uid')
    .in('user_uid', userUids)
    .gte('last_seen_at', cutoff);

  if (error) {
    // Table may not exist yet — return empty
    return new Set();
  }

  return new Set((data ?? []).map((r: Record<string, unknown>) => r.user_uid as string));
};

// ── Board Invites ────────────────────────────────────────────

export interface BoardInvite {
  id: string;
  board_id: string;
  invited_email: string;
  invited_by: string;
  role: 'editor' | 'viewer';
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
  expires_at: string;
}

/**
 * Create a board invite and return the generated token.
 */
export const createBoardInvite = async (invite: {
  board_id: string;
  invited_email: string;
  invited_by: string;
  role: 'editor' | 'viewer';
}): Promise<BoardInvite | null> => {
  const { data, error } = await supabase
    .from('board_invites')
    .insert({
      board_id: invite.board_id,
      invited_email: invite.invited_email.toLowerCase().trim(),
      invited_by: invite.invited_by,
      role: invite.role,
    })
    .select()
    .single();

  if (error) {
    console.error('[supabase] createBoardInvite failed:', error);
    return null;
  }

  return data as BoardInvite;
};

/**
 * Fetch a board invite by its token. Returns null if not found or expired.
 */
export const fetchInviteByToken = async (token: string): Promise<(BoardInvite & { board_title: string; inviter_name: string | null }) | null> => {
  const { data, error } = await supabase
    .from('board_invites')
    .select('*, boards!board_invites_board_id_fkey(title), users!board_invites_invited_by_fkey(display_name)')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const board = row.boards as { title: string } | null;
  const inviter = row.users as { display_name: string | null } | null;

  return {
    ...(row as unknown as BoardInvite),
    board_title: board?.title ?? 'Untitled Board',
    inviter_name: inviter?.display_name ?? null,
  };
};

/**
 * Accept a board invite: mark it as accepted and create board_access for the user.
 */
export const acceptBoardInvite = async (token: string, userUid: string): Promise<{ boardId: string } | null> => {
  // Fetch the invite
  const { data: invite, error: fetchErr } = await supabase
    .from('board_invites')
    .select('id, board_id, role, status, expires_at')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (fetchErr || !invite) return null;

  // Check expiry
  if (new Date(invite.expires_at as string) < new Date()) {
    await supabase.from('board_invites').update({ status: 'expired' }).eq('id', invite.id);
    return null;
  }

  // Create board_access
  await ensureBoardAccess(invite.board_id as string, userUid, invite.role as 'editor' | 'viewer');

  // Mark invite as accepted
  await supabase.from('board_invites').update({ status: 'accepted' }).eq('id', invite.id);

  return { boardId: invite.board_id as string };
};

/**
 * Fetch pending invites for a board (for showing in the invite modal).
 */
export const fetchPendingInvites = async (boardId: string): Promise<BoardInvite[]> => {
  const { data, error } = await supabase
    .from('board_invites')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[supabase] fetchPendingInvites failed:', error);
    return [];
  }

  return (data ?? []) as BoardInvite[];
};

export const deleteBoard = async (boardId: string): Promise<void> => {
  // Delete snapshots first (FK constraint)
  await supabase.from('board_snapshots').delete().eq('board_id', boardId);
  await supabase.from('board_access').delete().eq('board_id', boardId);

  const { error } = await supabase.from('boards').delete().eq('id', boardId);
  if (error) {
    console.error('[supabase] deleteBoard failed:', error);
  }
};
