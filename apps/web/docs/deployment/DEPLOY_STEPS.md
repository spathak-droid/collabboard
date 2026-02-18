# 🚀 Quick Railway Deployment - Manual Steps

Since Railway CLI requires interactive input, follow these steps:

## Step 1: Link Project (Interactive)

```bash
cd apps/server
railway link
```

**When prompted:**
- Select workspace: `Sandesh Pathak's Projects`
- Select project: `collabboard-ws`

## Step 2: Set Environment Variables

```bash
railway variables set PORT=1234
railway variables set CURSOR_PORT=1235
railway variables set SUPABASE_URL=https://ksnarsfklijkgrovdhgp.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzbmFyc2ZrbGlqa2dyb3ZkaGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODI0MjksImV4cCI6MjA4Njg1ODQyOX0.uwLMMOH1bwomECVna-NXCfltTghL3KBoAf38iQzEkZg
```

## Step 3: Deploy

```bash
railway up --detach
```

This will:
- Build your server code
- Deploy to Railway
- Start both WebSocket servers (ports 1234 and 1235)

## Step 4: Get Deployment URL

```bash
railway domain
```

Copy the URL (e.g., `collabboard-ws.up.railway.app`)

## Step 5: Check Deployment

### View Logs
```bash
railway logs
```

**Look for:**
```
🖱️  Cursor WebSocket listening on port 1235
========================================
🚀 CollabBoard WebSocket Server Running
📦 CRDT (Hocuspocus): ws://0.0.0.0:1234/
🖱️  Cursors: ws://0.0.0.0:1235/cursor/{boardId}
💾 Supabase: connected
🗜️  Compression: enabled
========================================
```

### Check Status
```bash
railway status
```

## Step 6: Test WebSocket Connections

```bash
# Install wscat (if not installed)
npm install -g wscat

# Test CRDT connection (replace with your Railway domain)
wscat -c wss://collabboard-ws.up.railway.app:1234/

# Test cursor connection
wscat -c "wss://collabboard-ws.up.railway.app:1235/cursor/test?userId=test&userName=Test"
```

Expected: Both connections should succeed

## Step 7: Update Frontend (Vercel)

1. Go to your Vercel dashboard
2. Select your CollabBoard project
3. Settings → Environment Variables
4. Update:
   ```
   NEXT_PUBLIC_WS_URL=wss://collabboard-ws.up.railway.app:1234
   ```
5. Redeploy frontend

## ✅ Done!

Your WebSocket server is now live with:
- ⚡ Ultra-fast cursor sync on port 1235
- 📦 CRDT object sync on port 1234
- 🗜️ Compression enabled
- 💾 Supabase persistence

---

## 🔧 Alternative: Railway Dashboard

If CLI doesn't work, use the Railway Dashboard:

1. Go to https://railway.app/dashboard
2. Select `collabboard-ws` project
3. Click "New Deployment" → "From Source"
4. Set Root Directory: `apps/server`
5. Add environment variables (see Step 2 above)
6. Deploy

Railway will automatically detect and expose both ports!
