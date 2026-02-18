# Railway Port 1235 Configuration Guide

## Issue

Cursors not showing because Railway doesn't have port 1235 exposed yet.

## ✅ Immediate Fix Applied

**Temporarily disabled fast cursor sync** and reverted to Yjs awareness:
- Cursors will work now via Yjs (still fast, ~15-20ms)
- Changed in `apps/web/src/app/board/[id]/page.tsx`

## 🔧 Proper Railway Setup (To Enable Ultra-Fast Cursors)

### Option 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - https://railway.app/dashboard
   - Select `collabboard-ws` project

2. **Add Environment Variables**
   - Go to Settings → Variables
   - Add: `CURSOR_PORT=1235`
   - (PORT should already be 1234, SUPABASE variables should be set)

3. **Redeploy**
   - Go to Deployments tab
   - Click "Redeploy" on latest deployment
   
4. **Wait for deployment** (~2-3 minutes)

5. **Check logs for:**
   ```
   🖱️  Cursor WebSocket listening on port 1235
   ```

### Option 2: Railway CLI

```bash
cd apps/server
railway link  # Select collabboard-ws
railway variables set CURSOR_PORT=1235
railway up --detach
```

### Verify Both Ports Are Exposed

Railway should automatically expose any port your app listens on.

**Test connections:**
```bash
# Test CRDT (port 1234)
wscat -c wss://collabboard-server-production.up.railway.app:1234/

# Test cursor (port 1235)  
wscat -c "wss://collabboard-server-production.up.railway.app:1235/cursor/test?userId=test&userName=Test"
```

Both should connect successfully.

---

## 🚀 Re-Enable Fast Cursor Sync (After Railway Setup)

Once Railway is configured and both ports are working:

### 1. Update Client Code

In `apps/web/src/app/board/[id]/page.tsx`:

```typescript
// Change from:
enabled: false, // Disabled until Railway is configured

// To:
enabled: !!user && !!boardId,
```

```typescript
// Change from:
updateCursor(x, y);
// sendFastCursor(x, y); // Will enable after Railway setup

// To:
sendFastCursor(x, y);
```

```typescript
// Change from:
[position, scale, updateCursor, isDrawingLine, drawingLineId, objectsMap, objects, updateObject]

// To:
[position, scale, sendFastCursor, isDrawingLine, drawingLineId, objectsMap, objects, updateObject]
```

### 2. Test Locally

```bash
# Start local server with both ports
cd apps/server
npm run dev

# In another terminal, start frontend
cd apps/web
npm run dev
```

Open browser and check console for:
```
🖱️  Connecting to cursor sync: ws://localhost:1235/cursor/{boardId}
🖱️  Cursor sync connected
```

### 3. Deploy to Production

```bash
git add .
git commit -m "Re-enable fast cursor sync after Railway port configuration"
git push origin main
```

---

## 🧪 Testing Fast Cursor Sync

Once enabled:

1. Open board in 2+ browsers
2. Check browser console for connection messages
3. Move cursor - should see it instantly on other screens (<10ms)
4. Compare to previous latency - should feel noticeably snappier

---

## 📊 Expected Performance

### With Yjs Awareness (Current - Temporary)
- Cursor latency: ~15-20ms
- ✅ Works now
- ✅ No configuration needed

### With Fast Cursor Sync (After Railway Setup)
- Cursor latency: <10ms
- ⚡ 2x faster
- 🔧 Requires Railway port 1235

---

## 🔍 Troubleshooting

### Port 1235 not accessible

**Check Railway logs:**
```bash
railway logs
```

**Should see:**
```
🖱️  Cursor WebSocket listening on port 1235
```

**If not:** Environment variable `CURSOR_PORT=1235` is missing

### Cursors still not working with fast sync enabled

1. Check browser console for errors
2. Verify both WebSocket connections are established
3. Test with wscat to confirm ports are open
4. Check Railway networking settings

---

## 💡 Alternative: Use Same Port with Path Routing

If Railway port configuration is difficult, we can modify the server to use path-based routing on a single port (1234):

- `/` → Hocuspocus CRDT
- `/cursor/{boardId}` → Cursor sync

This would require modifying the server code but avoids multi-port configuration.

**Trade-off:** Slightly more complex server routing, but easier deployment.

Let me know if you want this approach instead!
