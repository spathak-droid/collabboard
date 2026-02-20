# Dedicated Cursor Server - Complete Setup Guide

## What This Solves

**Problem:** Cursor sync was experiencing 100-200ms latency on Railway due to network distance and routing overhead.

**Solution:** Deploy a **dedicated, ultra-lightweight WebSocket server** just for cursor sync.

## Architecture

```
User Browser
    ├─> wss://main-server.railway.app     (Hocuspocus for objects/CRDT)
    └─> wss://cursor-server.railway.app   (Direct WS for cursors only)
```

**Benefits:**
- ✅ Isolated from Hocuspocus (no routing conflicts)
- ✅ Zero overhead (direct passthrough)
- ✅ Independent scaling
- ✅ Simpler debugging
- ✅ Should achieve <50ms latency (vs 100-200ms)

---

## Step 1: Test Locally

```bash
cd apps/cursor-server
npm install
npm run dev
```

Server runs on http://localhost:3000

**Test with wscat:**
```bash
# Terminal 1
wscat -c "ws://localhost:3000/cursor/test?userId=user1&userName=Alice"

# Terminal 2
wscat -c "ws://localhost:3000/cursor/test?userId=user2&userName=Bob"

# Send from Terminal 1:
{"type":"cursor","userId":"user1","userName":"Alice","x":100,"y":200,"timestamp":1234567890}

# Should appear in Terminal 2 instantly!
```

---

## Step 2: Deploy to Railway

### Option A: Railway CLI (Recommended)

```bash
cd apps/cursor-server

# Login to Railway
railway login

# Create new project
railway init

# Deploy
railway up

# Get domain
railway domain
```

Copy the URL (e.g., `cursor-sync-production.up.railway.app`)

### Option B: Railway Dashboard

1. Go to https://railway.app/dashboard
2. Click **New Project** → **Deploy from GitHub**
3. Select your repository
4. **Root Directory:** `apps/cursor-server`
5. Click **Deploy**
6. Go to **Settings** → **Domains** → **Generate Domain**

---

## Step 3: Configure Frontend

### Local Testing

In `apps/web/.env.local`:
```bash
# Test with local cursor server
NEXT_PUBLIC_CURSOR_WS_URL=ws://localhost:3000
```

### Production Deployment

In **Vercel** dashboard:
1. Go to your project settings
2. **Environment Variables** tab
3. Add:
   ```
   NEXT_PUBLIC_CURSOR_WS_URL=wss://cursor-sync-production.up.railway.app
   ```
4. Redeploy

Or update `apps/web/.env.local` and push:
```bash
NEXT_PUBLIC_CURSOR_WS_URL=wss://your-cursor-server.up.railway.app
```

---

## Step 4: Verify

### Check Server Health

```bash
curl https://your-cursor-server.railway.app/health
```

Expected:
```json
{
  "status": "healthy",
  "uptime": 123,
  "rooms": 0,
  "totalUsers": 0
}
```

### Check Browser Console

Open your board, check console:
```
🖱️  Using dedicated cursor server
🖱️  Connecting to: wss://cursor-sync-production.up.railway.app/cursor/...
🖱️  Cursor sync connected
```

### Test Latency

Open board in 2 browsers, check console:
```
🖱️  Cursor latency: XXms
```

**Expected results:**
- Local: <10ms
- Railway (same region): 20-50ms
- Railway (different region): 50-100ms

Should be **50% faster** than before!

---

## Step 5: Rollback Plan

If dedicated server has issues, just remove the env variable:

**Vercel:**
1. Delete `NEXT_PUBLIC_CURSOR_WS_URL` variable
2. Redeploy

**Local:**
```bash
# Comment out in .env.local
# NEXT_PUBLIC_CURSOR_WS_URL=wss://...
```

Frontend will automatically fall back to using main server (`/cursor` path).

---

## Cost Analysis

### Before (Single Server)
- 1 Railway service: ~$5/month

### After (Dedicated Cursor Server)
- Main server: ~$5/month
- Cursor server: ~$5/month
- **Total: ~$10/month**

### Is it worth it?
- ✅ If you need <50ms cursor latency → **Yes**
- ✅ If serving users in multiple regions → **Yes**
- ✅ If cursor sync is critical to UX → **Yes**
- ❌ If budget is tight and 100ms is acceptable → **No** (use main server)

---

## Monitoring

### Server Logs (Railway)

```bash
railway logs --service cursor-server
```

Look for:
```
🖱️  Alice joined board abc123 (2 users)
🖱️  Bob left board abc123 (1 users)
📦 Room abc123 cleaned up
```

### Browser Console

```
🖱️  Sending cursor: {x: 100, y: 200}
🖱️  Cursor latency: 25ms
```

---

## Troubleshooting

### ❌ "Cannot connect to cursor server"

**Check:**
1. Railway service is running: `railway status`
2. Domain is generated: `railway domain`
3. Env variable is correct: `NEXT_PUBLIC_CURSOR_WS_URL=wss://...`
4. No typos in URL (must start with `wss://`)

### ❌ "Still seeing 100-200ms latency"

**Possible causes:**
1. Network distance (check Railway region in dashboard)
2. Browser caching old client (hard refresh: Cmd+Shift+R)
3. Vercel env variable not applied (redeploy after adding)

### ❌ "Cursors disappear after a few seconds"

**Check:**
1. Railway logs for errors: `railway logs`
2. Browser console for disconnect messages
3. Firewall blocking WebSocket connections

---

## Next Steps After Deployment

1. ✅ Deploy cursor server to Railway
2. ✅ Add `NEXT_PUBLIC_CURSOR_WS_URL` to Vercel
3. ✅ Redeploy frontend
4. ✅ Test with 2 browsers
5. ✅ Measure latency (should see 50%+ improvement)
6. ✅ Monitor Railway logs for 24 hours
7. ✅ If stable, celebrate! 🎉

---

## Questions?

- Check Railway logs: `railway logs`
- Check browser console for connection messages
- Test health endpoint: `curl https://your-url/health`
- Verify environment variables in Vercel dashboard

**Performance expectations:**
- Local: <10ms ✅
- Railway (same region): 20-50ms ✅
- Railway (cross-region): 50-100ms ✅
- Previous setup: 100-200ms ❌
