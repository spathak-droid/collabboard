-- =============================================================
-- CollabBoard: Board Invites Table
-- =============================================================
-- Stores pending invitations to boards. Each invite has a unique
-- token that is emailed to the invitee. When they sign up / log in
-- and visit /invite/<token>, the invite is accepted and they get
-- board_access.
-- =============================================================

-- ── 1. Create board_invites table ─────────────────────────────
CREATE TABLE IF NOT EXISTS board_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- ── 2. Enable RLS (permissive for MVP — Firebase Auth) ────────
ALTER TABLE board_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all invite operations"
  ON board_invites FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 3. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_board_invites_token ON board_invites (token);
CREATE INDEX IF NOT EXISTS idx_board_invites_email ON board_invites (invited_email);
CREATE INDEX IF NOT EXISTS idx_board_invites_board ON board_invites (board_id);
