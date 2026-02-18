# Railway Deployment Guide - Cursor Sync Server

## Quick Deploy to Railway

### 1. Install Dependencies

```bash
cd apps/cursor-server
npm install
```

### 2. Test Locally

```bash
npm run dev
```

Server runs on http://localhost:3000

Test WebSocket:
```bash
wscat -c "ws://localhost:3000/cursor/test?userId=user1&userName=Test"
```

### 3. Deploy to Railway

**Option A: Railway CLI**
```bash
cd apps/cursor-server
railway init
railway up
railway domain  # Get your URL
```

**Option B: Railway Dashboard**
1. Go to https://railway.app/dashboard
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Set Root Directory: `apps/cursor-server`
5. Click "Deploy"

### 4. Get Deployment URL

Railway will give you a URL like:
```
https://cursor-sync-production.up.railway.app
```

### 5. Update Frontend Environment

In `apps/web/.env.local`:
```bash
# Add new environment variable for cursor server
NEXT_PUBLIC_CURSOR_WS_URL=wss://cursor-sync-production.up.railway.app
```

### 6. Update Client Code

The client will automatically use the cursor server URL if set, otherwise falls back to main server.

---

## Environment Variables (Railway)

Railway sets `PORT` automatically. No other variables needed!

---

## Verify Deployment

```bash
# Health check
curl https://your-cursor-server.railway.app/health

# Expected response:
# {"status":"healthy","uptime":123,"rooms":0,"totalUsers":0}
```

---

## Cost

- Railway Free Tier: 500 hours/month
- Estimated usage: ~$5/month if you exceed free tier
- Can share with main server if needed

---

## Benefits of Separate Deployment

✅ **Isolated from Hocuspocus** - No routing conflicts
✅ **Simpler debugging** - Clear separation of concerns  
✅ **Independent scaling** - Scale cursor sync separately if needed
✅ **Ultra-low latency** - Direct WebSocket, zero overhead
✅ **Easy monitoring** - Dedicated health endpoint

---

## Next Steps

After deploying:
1. Get your Railway URL
2. Add `NEXT_PUBLIC_CURSOR_WS_URL` to Vercel
3. Re-enable fast cursor sync in the client
4. Test with 2 browsers - should see <10-50ms latency!
