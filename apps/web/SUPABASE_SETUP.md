# Supabase Setup Guide

## ✅ What You've Done
- [x] Created Supabase project
- [x] Added credentials to `.env.local`
- [x] Ran initial SQL schema

## 🔧 Next Steps

### Step 1: Fix RLS Policies

Since you're using **Firebase Auth** (not Supabase Auth), the RLS policies need to be updated.

**Option A: Disable RLS (Simplest for MVP)**
```sql
-- Run this in Supabase SQL Editor
ALTER TABLE boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE board_access DISABLE ROW LEVEL SECURITY;
```

**Option B: Make RLS Permissive (Recommended)**
Run the SQL from `supabase-fix-rls.sql` file in Supabase SQL Editor.

### Step 2: Test Connection

```bash
node test-supabase.js
```

This will verify:
- ✅ Tables exist
- ✅ Connection works
- ✅ Can read/write (after fixing RLS)

### Step 3: Test from App

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Login** to your app

3. **Create a board** - it should save to Supabase

4. **Add objects** to the board - snapshots should save every 30 seconds

5. **Check Supabase Dashboard:**
   - Go to Table Editor → `boards` - should see your board
   - Go to `board_snapshots` - should see snapshots being created

### Step 4: Verify Data Flow

1. **Create board** → Check `boards` table
2. **Add sticky note** → Wait 30 seconds → Check `board_snapshots` table
3. **Refresh page** → Board should load from Supabase snapshot

## 🔍 Troubleshooting

### Error: "permission denied for table boards"
- **Fix:** Run the RLS fix SQL (Step 1)

### Error: "relation does not exist"
- **Fix:** Make sure you ran the initial SQL schema

### Snapshots not saving
- Check browser console for errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Check Network tab → Supabase requests should return 200

### Can't see data in Supabase
- Check Table Editor → Make sure you're looking at the right project
- Verify RLS is disabled or permissive
- Check if inserts are actually happening (browser console)

## 📊 What Gets Stored in Supabase

### `boards` table
- Board metadata (title, owner, timestamps)
- Created when you create a new board

### `board_snapshots` table  
- Yjs document state (base64 encoded)
- Auto-saved every 30 seconds
- Used to restore board state on page load

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
4. Or migrate to Supabase Auth (better integration)

For now, permissive RLS is fine for MVP!
