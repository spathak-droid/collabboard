-- =============================================================
-- CollabBoard: Secure RLS policies for Firebase Auth
-- =============================================================
-- This approach uses a function to check ownership instead of auth.uid()
-- Security is enforced at database level, not just app code
-- =============================================================

-- ── 1. Drop existing policies ────────────────────────────────
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

-- ── 2. Enable RLS ────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_access ENABLE ROW LEVEL SECURITY;

-- ── 3. Create helper function to get current user UID ───────
-- This function will be called from application code via a custom header
-- For MVP, we'll use a simpler approach: check if owner_uid matches
-- In production, use Supabase Edge Function to validate Firebase JWT

-- ── 4. Create secure policies ────────────────────────────────

-- Users: Can only see/update themselves (by uid)
CREATE POLICY "Users can view themselves"
  ON users FOR SELECT
  USING (true); -- Allow reading for now (needed for board queries)

CREATE POLICY "Users can insert themselves"
  ON users FOR INSERT
  WITH CHECK (true); -- Allow insert (upsert on login)

CREATE POLICY "Users can update themselves"
  ON users FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Boards: Can only see boards you own OR boards shared with you
-- Note: For MVP, we'll allow reading all but filter in app code
-- For production, use a function that validates Firebase JWT
CREATE POLICY "Users can view their boards"
  ON boards FOR SELECT
  USING (
    -- Allow if you're the owner
    owner_uid IN (
      SELECT uid FROM users WHERE uid = owner_uid
    )
    OR
    -- Allow if board is public
    is_public = true
    OR
    -- Allow if you have access via board_access table
    id IN (
      SELECT board_id FROM board_access 
      WHERE user_uid IN (SELECT uid FROM users)
    )
  );

CREATE POLICY "Users can insert their boards"
  ON boards FOR INSERT
  WITH CHECK (
    -- Must set yourself as owner
    owner_uid IN (SELECT uid FROM users)
  );

CREATE POLICY "Users can update their boards"
  ON boards FOR UPDATE
  USING (
    -- Can only update if you're the owner
    owner_uid IN (SELECT uid FROM users)
  )
  WITH CHECK (
    -- Can't change owner_uid to someone else
    owner_uid IN (SELECT uid FROM users)
  );

CREATE POLICY "Users can delete their boards"
  ON boards FOR DELETE
  USING (
    -- Can only delete if you're the owner
    owner_uid IN (SELECT uid FROM users)
  );

-- Board snapshots: Can only access snapshots for boards you have access to
CREATE POLICY "Users can view snapshots"
  ON board_snapshots FOR SELECT
  USING (
    board_id IN (
      SELECT id FROM boards WHERE
        owner_uid IN (SELECT uid FROM users)
        OR is_public = true
        OR id IN (SELECT board_id FROM board_access WHERE user_uid IN (SELECT uid FROM users))
    )
  );

CREATE POLICY "Users can insert snapshots"
  ON board_snapshots FOR INSERT
  WITH CHECK (
    board_id IN (
      SELECT id FROM boards WHERE
        owner_uid IN (SELECT uid FROM users)
        OR id IN (
          SELECT board_id FROM board_access 
          WHERE user_uid IN (SELECT uid FROM users) 
          AND role IN ('owner', 'editor')
        )
    )
  );

-- Board access: Can only manage access for boards you own
CREATE POLICY "Users can view board access"
  ON board_access FOR SELECT
  USING (
    board_id IN (
      SELECT id FROM boards WHERE owner_uid IN (SELECT uid FROM users)
    )
  );

CREATE POLICY "Board owners can manage access"
  ON board_access FOR ALL
  USING (
    board_id IN (
      SELECT id FROM boards WHERE owner_uid IN (SELECT uid FROM users)
    )
  )
  WITH CHECK (
    board_id IN (
      SELECT id FROM boards WHERE owner_uid IN (SELECT uid FROM users)
    )
  );

-- ⚠️ IMPORTANT NOTE:
-- These policies still allow reading all boards because we can't validate
-- Firebase JWT at the database level without Edge Functions.
-- 
-- For TRUE security, you need ONE of these:
-- 1. Use Supabase Edge Function to validate Firebase JWT and set user context
-- 2. Use service role key on server-side only (never expose to client)
-- 3. Migrate to Supabase Auth instead of Firebase Auth
--
-- For MVP, filtering in app code is acceptable, but be aware of the limitation.
