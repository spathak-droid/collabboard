# Supabase Setup - Continuation Prompt

## Project Context
I'm building a collaborative whiteboard app (CollabBoard) using:
- **Frontend**: Next.js 14 + TypeScript + Konva.js
- **Auth**: Firebase Auth (Email, Google, GitHub)
- **Real-time Sync**: Yjs + Hocuspocus (WebSocket server on Railway)
- **Database**: Supabase Postgres
- **State**: Zustand

## Current Status

### ✅ Completed
1. Created Supabase project
2. Added credentials to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://ksnarsfklijkgrovdhgp.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. Ran SQL schema in Supabase SQL Editor (created tables: `users`, `boards`, `board_snapshots`, `board_access`)
4. Created test script (`test-supabase.js`) that verifies connection

### ⚠️ Current Issue
- **Problem**: Foreign key constraint error when testing inserts
- **Error**: `insert or update on table "boards" violates foreign key constraint "boards_owner_uid_fkey"`
- **Cause**: Test user doesn't exist in `users` table (expected behavior - foreign keys are working)
- **Status**: Connection works, tables are accessible, but RLS policies need to be fixed

### 📋 What Needs to Be Done

1. **Fix RLS Policies** (Critical)
   - Current policies use `auth.uid()` which is Supabase Auth
   - App uses Firebase Auth, so policies block access
   - Need to either:
     - Disable RLS for MVP (simplest)
     - Or create permissive policies that work with Firebase Auth

2. **Verify Integration**
   - Test creating boards from the app
   - Test saving Yjs snapshots (auto-save every 30 seconds)
   - Test loading board state from Supabase

3. **Database Schema**
   - Tables exist: `users`, `boards`, `board_snapshots`, `board_access`
   - Foreign key constraints are working correctly
   - Need to ensure RLS doesn't block operations

## Files Structure

```
whiteboard-frontend/
├── .env.local                    # Contains Supabase credentials
├── test-supabase.js             # Test script (works, shows FK constraint error)
├── src/lib/supabase/client.ts   # Supabase client setup
├── src/lib/yjs/sync.ts          # Functions: saveSnapshot(), loadSnapshot()
└── supabase-fix-rls.sql         # SQL to fix RLS policies
```

## Key Code Locations

**Supabase Client**: `src/lib/supabase/client.ts`
- Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Exports `supabase` client instance

**Yjs Sync Functions**: `src/lib/yjs/sync.ts`
- `saveSnapshot(boardId, ydoc, userId)` - Saves Yjs state to `board_snapshots`
- `loadSnapshot(boardId)` - Loads latest snapshot from Supabase
- `updateBoardMetadata()` - Updates board title/timestamps

**Board Creation**: `src/app/(dashboard)/page.tsx`
- Currently uses localStorage
- Needs to save to Supabase `boards` table

## Specific Tasks Needed

### Task 1: Fix RLS Policies
Run this SQL in Supabase SQL Editor:
```sql
ALTER TABLE boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_access DISABLE ROW LEVEL SECURITY;
```

### Task 2: Integrate Board Creation with Supabase
- When user creates a board, insert into `boards` table
- Include: `id`, `title`, `owner_uid`, `created_at`, `last_modified`
- Handle user creation in `users` table if needed

### Task 3: Verify Auto-Save Works
- Check if `saveSnapshot()` is being called every 30 seconds
- Verify snapshots are being saved to `board_snapshots` table
- Test loading board state on page refresh

### Task 4: Test End-to-End Flow
1. User logs in (Firebase Auth)
2. User creates board → Saved to Supabase `boards` table
3. User adds objects → Yjs syncs via WebSocket
4. Every 30 seconds → Snapshot saved to `board_snapshots`
5. User refreshes page → Board loads from latest snapshot

## Questions to Answer

1. Should RLS be disabled completely, or should we create permissive policies?
2. How should we handle user creation? (Auto-create on first board creation?)
3. Should board metadata (title, etc.) sync via Supabase Realtime or just on save?
4. What's the best way to handle board loading? (Load snapshot on mount, then connect to WebSocket?)

## Expected Behavior After Fix

- ✅ Can create boards → Saved to Supabase
- ✅ Can add/edit objects → Synced via Yjs WebSocket
- ✅ Auto-save every 30s → Snapshots in `board_snapshots`
- ✅ Refresh page → Board loads from Supabase snapshot
- ✅ Multiple users → Real-time collaboration via Yjs

## Test Commands

```bash
# Test Supabase connection
cd whiteboard-frontend
node test-supabase.js

# Start dev server
npm run dev

# Then test:
# 1. Login
# 2. Create board
# 3. Add objects
# 4. Check Supabase dashboard for data
```

---

**Please help me:**
1. Fix the RLS policies issue
2. Integrate board creation with Supabase
3. Verify the auto-save and load functionality works
4. Test the end-to-end flow
