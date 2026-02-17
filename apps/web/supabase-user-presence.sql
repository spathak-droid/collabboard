-- =============================================================
-- CollabBoard: User Presence Table
-- =============================================================
-- Tracks when users are online (logged in anywhere in the app).
-- A heartbeat updates last_seen_at every 60 seconds.
-- Users with last_seen_at within 2 minutes are considered "online".
-- =============================================================

-- ── 1. Create user_presence table ──────────────────────────────
CREATE TABLE IF NOT EXISTS user_presence (
  user_uid TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Enable RLS (permissive for MVP — Firebase Auth) ─────────
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all presence operations"
  ON user_presence FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 3. Index for fast lookups ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen
  ON user_presence (last_seen_at DESC);
