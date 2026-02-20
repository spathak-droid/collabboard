# Supabase Setup Guide

## ✅ What You've Done
- [x] Created Supabase project
- [x] Added credentials to `.env.local`
- [x] Ran initial SQL schema

## 🔧 Next Steps

### Step 1: Create Storage Bucket for Snapshots

Snapshots are now stored in **Supabase Storage** (not database) for better performance.

1. **Go to Supabase Dashboard** → Storage
2. **Create new bucket:**
   - Name: `collabBoard`
   - Public: **No** (private bucket)
   - File size limit: 50 MB (default is fine)
3. **Set bucket policies:**

```sql
-- Run this in Supabase SQL Editor to allow authenticated users to read/write snapshots

-- Allow authenticated users to upload snapshots
INSERT INTO storage.policies (name, bucket_id, definition, check, command, owner)
VALUES (
  'Allow authenticated users to upload snapshots',
  'collabBoard',
  '((storage.bucket_id = ''collabBoard''::text) AND (auth.role() = ''authenticated''::text))',
  '((storage.bucket_id = ''collabBoard''::text) AND (auth.role() = ''authenticated''::text))',
  'INSERT',
  (SELECT id FROM auth.users LIMIT 1)
);

-- Allow authenticated users to read snapshots
INSERT INTO storage.policies (name, bucket_id, definition, check, command, owner)
VALUES (
  'Allow authenticated users to read snapshots',
  'collabBoard',
  '((storage.bucket_id = ''collabBoard''::text) AND (auth.role() = ''authenticated''::text))',
  NULL,
  'SELECT',
  (SELECT id FROM auth.users LIMIT 1)
);

-- Allow authenticated users to update snapshots
INSERT INTO storage.policies (name, bucket_id, definition, check, command, owner)
VALUES (
  'Allow authenticated users to update snapshots',
  'collabBoard',
  '((storage.bucket_id = ''collabBoard''::text) AND (auth.role() = ''authenticated''::text))',
  '((storage.bucket_id = ''collabBoard''::text) AND (auth.role() = ''authenticated''::text))',
  'UPDATE',
  (SELECT id FROM auth.users LIMIT 1)
);
```

**OR for MVP, make bucket public (simpler but less secure):**

1. Go to Storage → `collabBoard` bucket
2. Click "Policies" tab
3. Click "New policy" → "For full customization"
4. Add policy:
   - Name: `Allow all operations for authenticated users`
   - Target roles: `authenticated`
   - Allowed operations: `SELECT`, `INSERT`, `UPDATE`

### Step 2: Fix RLS Policies

Since you're using **Firebase Auth** (not Supabase Auth), the RLS policies need to be updated.

**Option A: Disable RLS (Simplest for MVP)**
```sql
-- Run this in Supabase SQL Editor
ALTER TABLE boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

**Option B: Make RLS Permissive (Recommended)**
Run the SQL from `supabase-fix-rls.sql` file in Supabase SQL Editor.

### Step 3: Test Connection

```bash
node test-supabase.js
```

This will verify:
- ✅ Tables exist
- ✅ Connection works
- ✅ Can read/write (after fixing RLS)

### Step 4: Test from App

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Login** to your app

3. **Create a board** - it should save to Supabase

4. **Add objects** to the board - snapshots should save:
   - **Immediately** when first object is added
   - Then every **30 seconds** after changes

5. **Check Supabase Dashboard:**
   - Go to Table Editor → `boards` - should see your board
   - Go to Storage → `collabBoard` → `snapshots/[boardId]/` - should see `latest.yjs` file
   - Go to Table Editor → `board_snapshots` - should see metadata entries

### Step 5: Verify Data Flow

1. **Create board** → Check `boards` table
2. **Add sticky note** → Wait 2 seconds → Check Storage bucket for snapshot
3. **Refresh page** → Board should load instantly from Storage snapshot
4. **Go to dashboard** → Should show "X objects" (not "no snapshot yet")

## 🔍 Troubleshooting

### Error: "permission denied for table boards"
- **Fix:** Run the RLS fix SQL (Step 2)

### Error: "relation does not exist"
- **Fix:** Make sure you ran the initial SQL schema

### Error: "Bucket not found" or "Object not found"
- **Fix:** Create the `collabBoard` bucket (Step 1)
- Verify bucket name matches `.env.local`: `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=collabBoard`

### Snapshots not saving
- Check browser console for errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Check Storage bucket exists and has correct policies
- Check Network tab → Supabase Storage requests should return 200

### Dashboard shows "no snapshot yet"
- **When it happens:** Right after creating a new board (snapshot takes 2 seconds to save)
- **Solution:** Wait 2-5 seconds, then refresh dashboard
- **Or:** Add at least one object to the board (triggers immediate save)

### Can't see data in Supabase
- Check Table Editor → Make sure you're looking at the right project
- Verify RLS is disabled or permissive
- Check if inserts are actually happening (browser console)

## 📊 What Gets Stored in Supabase

### `boards` table
- Board metadata (title, owner, timestamps)
- Created when you create a new board

### Supabase Storage (`collabBoard` bucket)
- **Binary Yjs snapshots** at `snapshots/{boardId}/latest.yjs`
- Auto-saved:
  - **Immediately** when board is opened (after 2 seconds)
  - **Immediately** when first object is added
  - Every **30 seconds** after changes
  - On **page unmount** if unsaved changes exist
- Used for fast board loading on dashboard and board page

### `board_snapshots` table  
- Metadata only (reference to Storage location)
- Tracks when snapshots were saved and by whom

### `users` table
- User info synced from Firebase
- Created when user first logs in

### `board_access` table
- Sharing/permissions (future feature)

## 🚀 Production Notes

For production, you should:
1. Use **service role key** on server-side (bypasses RLS)
2. Keep RLS enabled with proper policies
3. Validate Firebase tokens server-side
4. Set proper Storage bucket policies (not public)
5. Consider adding snapshot versioning (keep last N snapshots)
6. Or migrate to Supabase Auth (better integration)

For now, permissive RLS and simple Storage policies are fine for MVP!
