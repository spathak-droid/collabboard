# Railway Deployment Guide - WebSocket Server

## 🚀 Quick Deploy

### Prerequisites
- Railway account (https://railway.app)
- Railway CLI installed: `npm i -g @railway/cli`

---

## Step 1: Deploy to Railway

### Option A: Using Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Visit https://railway.app/dashboard
   - Click "New Project" → "Deploy from GitHub repo"

2. **Connect Repository**
   - Select your CollabBoard repository
   - Railway will auto-detect the monorepo

3. **Configure Service**
   - Railway should detect `apps/server/package.json`
   - If not, set Root Directory: `apps/server`

4. **Add Environment Variables**
   ```
   PORT=1234
   CURSOR_PORT=1235
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

5. **Configure Networking**
   - Go to Settings → Networking
   - Railway will automatically expose ports 1234 and 1235
   - Copy the public domain (e.g., `your-app.up.railway.app`)

6. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete (~2-3 minutes)

---

### Option B: Using Railway CLI

```bash
# 1. Login to Railway
railway login

# 2. Navigate to server directory
cd apps/server

# 3. Initialize Railway project
railway init

# 4. Link to your project (or create new)
railway link

# 5. Add environment variables
railway variables set PORT=1234
railway variables set CURSOR_PORT=1235
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_ANON_KEY=your_supabase_anon_key_here

# 6. Deploy
railway up

# 7. Get your deployment URL
railway domain
```

---

## Step 2: Verify Deployment

### Check Deployment Logs

**Railway Dashboard:**
- Go to your service → "Deployments" tab
- Click on latest deployment
- Check logs for:
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

**Railway CLI:**
```bash
railway logs
```

### Test WebSocket Connections

```bash
# Install wscat if you don't have it
npm install -g wscat

# Test CRDT connection (port 1234)
wscat -c wss://your-app.up.railway.app:1234/

# Test cursor connection (port 1235)
wscat -c "wss://your-app.up.railway.app:1235/cursor/test-board?userId=test&userName=Test"
```

Expected response: Connection should establish successfully.

---

## Step 3: Update Frontend (Vercel)

### Update Environment Variables in Vercel

1. **Go to Vercel Dashboard**
   - Select your CollabBoard project
   - Go to Settings → Environment Variables

2. **Update WebSocket URL**
   ```
   NEXT_PUBLIC_WS_URL=wss://your-app.up.railway.app:1234
   ```
   
   (The client will automatically use port 1235 for cursors)

3. **Redeploy Frontend**
   - Go to Deployments tab
   - Click "Redeploy" on latest deployment
   - Or push to main branch to trigger auto-deploy

---

## Step 4: Test End-to-End

1. **Open your deployed app** (e.g., `your-app.vercel.app`)
2. **Open a board**
3. **Check browser console** for:
   ```
   🖱️  Connecting to cursor sync: wss://your-app.up.railway.app:1235/cursor/{boardId}
   🖱️  Cursor sync connected
   ```
4. **Open the same board in another browser/tab**
5. **Move your cursor** - should see it instantly on both screens!

---

## 🔍 Troubleshooting

### Ports Not Exposed

**Issue:** Can't connect to port 1235

**Solution:**
- Railway automatically exposes all ports your app listens on
- Verify in Railway logs that both ports are starting:
  ```
  🖱️  Cursor WebSocket listening on port 1235
  Hocuspocus v3.4.4 running at:
  > WebSocket: ws://0.0.0.0:1234
  ```

### Connection Refused

**Issue:** WebSocket connection fails

**Solutions:**
1. Check Railway logs for errors
2. Verify environment variables are set correctly
3. Ensure Railway service is running (not crashed)
4. Try redeploying: `railway up --detach`

### High Latency

**Issue:** Cursor sync still slow

**Solutions:**
1. Check Railway region - deploy closer to your users
2. Verify both ports are connected (check browser console)
3. Test network latency: `ping your-app.up.railway.app`

---

## 📊 Monitoring

### Railway Dashboard

- **Metrics:** CPU, Memory, Network usage
- **Logs:** Real-time logs with search/filter
- **Deployments:** History of all deployments

### Key Metrics to Watch

```
✅ CPU Usage: Should be <30% normally
✅ Memory: Should be <200MB normally
✅ Network: Will spike during active collaboration
```

### Health Check Logs

Look for these in Railway logs:
```
🟢 Connected: {userName} → board-{id}
🖱️  Cursor: {userName} joined board {id}
📥 Fetching snapshot for board: {id}
📤 [Async] Storing snapshot for board: {id}
```

---

## 🔄 Updates & Redeployment

### Auto-Deploy (Recommended)

Railway automatically redeploys when you push to your main branch.

### Manual Deploy

```bash
# Using Railway CLI
cd apps/server
railway up

# Or via Dashboard
# Go to service → Deployments → "Redeploy"
```

---

## 🎯 Production Checklist

- [ ] Railway service deployed and running
- [ ] Both ports (1234, 1235) exposed and accessible
- [ ] Environment variables configured
- [ ] Supabase connection working (check logs)
- [ ] Frontend deployed to Vercel
- [ ] Frontend `NEXT_PUBLIC_WS_URL` updated
- [ ] WebSocket connections successful (test with wscat)
- [ ] Cursor sync working in browser (check console)
- [ ] Multi-user test: Open board in 2+ browsers
- [ ] Monitor Railway logs for errors

---

## 🚨 Important Notes

### Port Configuration

Railway exposes ports dynamically. Your app listens on:
- `PORT` (1234) - Auto-exposed by Railway
- `CURSOR_PORT` (1235) - Auto-exposed by Railway

No additional configuration needed!

### WebSocket URLs

**Client connects to:**
- Objects: `wss://your-app.up.railway.app:1234/`
- Cursors: `wss://your-app.up.railway.app:1235/cursor/{boardId}`

**Railway handles:**
- SSL/TLS termination (wss://)
- Load balancing
- Auto-scaling

---

## 📚 Additional Resources

- [Railway Docs](https://docs.railway.app)
- [WebSocket Best Practices](https://docs.railway.app/guides/websockets)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)

---

## 🎉 Done!

Your ultra-low latency WebSocket server is now deployed and ready for production use!

**Need help?** Check the troubleshooting section or Railway support.
