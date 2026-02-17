-- =============================================================
-- CollabBoard: Fix RLS policies for Firebase Auth (MVP)
-- =============================================================
-- Since we use Firebase Auth (not Supabase Auth), auth.uid()
-- returns NULL for all requests via the anon key. We keep RLS
-- enabled but create fully-permissive policies so the anon key
-- can read/write. Auth is enforced in application code.
-- =============================================================

-- ── 1. Drop all existing restrictive policies ──────────────
DROP POLICY IF EXISTS "Users can view their own boards" ON boards;
DROP POLICY IF EXISTS "Users can insert their own boards" ON boards;
DROP POLICY IF EXISTS "Users can update their own boards" ON boards;
DROP POLICY IF EXISTS "Users can delete their own boards" ON boards;
DROP POLICY IF EXISTS "Allow all board operations" ON boards;

DROP POLICY IF EXISTS "Users can view snapshots of their boards" ON board_snapshots;
DROP POLICY IF EXISTS "Users can insert snapshots for their boards" ON board_snapshots;
DROP POLICY IF EXISTS "Allow all snapshot operations" ON board_snapshots;

DROP POLICY IF EXISTS "Users can view access to their boards" ON board_access;
DROP POLICY IF EXISTS "Board owners can manage access" ON board_access;
DROP POLICY IF EXISTS "Allow all access operations" ON board_access;

DROP POLICY IF EXISTS "Allow all user operations" ON users;
DROP POLICY IF EXISTS "Users can view themselves" ON users;
DROP POLICY IF EXISTS "Users can insert themselves" ON users;
DROP POLICY IF EXISTS "Users can update themselves" ON users;

-- ── 2. Ensure RLS is enabled (keeps Supabase happy) ───────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_access ENABLE ROW LEVEL SECURITY;

-- ── 3. Create permissive policies ──────────────────────────
-- users
CREATE POLICY "Allow all user operations"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);

-- boards
CREATE POLICY "Allow all board operations"
  ON boards FOR ALL
  USING (true)
  WITH CHECK (true);

-- board_snapshots
CREATE POLICY "Allow all snapshot operations"
  ON board_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

-- board_access
CREATE POLICY "Allow all access operations"
  ON board_access FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── 4. Production TODO ─────────────────────────────────────
-- For production, replace these with:
--   1. A Supabase Edge Function that validates Firebase JWTs
--   2. Policies that check a custom claim or user_uid column
--   3. Or migrate to Supabase Auth for tighter integration
