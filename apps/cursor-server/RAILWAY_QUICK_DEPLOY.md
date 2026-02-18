# Quick Railway Deployment Commands

## Deploy Cursor Server to Railway

```bash
# 1. Navigate to cursor server folder
cd apps/cursor-server

# 2. Login to Railway (if not already)
railway login

# 3. Initialize new Railway project
railway init
# Select: "Create new project"
# Name it: "cursor-sync" (or whatever you prefer)

# 4. Deploy
railway up

# 5. Generate public domain
railway domain
# Copy the URL (e.g., cursor-sync-production.up.railway.app)

# 6. Check logs
railway logs
# Should see: "🚀 Cursor Sync Server Running"

# 7. Test health endpoint
curl https://your-domain.up.railway.app/health
# Should return: {"status":"healthy",...}
```

## Update Vercel Environment

```bash
# Option A: Vercel CLI
vercel env add NEXT_PUBLIC_CURSOR_WS_URL production
# Paste: wss://your-domain.up.railway.app

# Option B: Vercel Dashboard
# 1. Go to project → Settings → Environment Variables
# 2. Add: NEXT_PUBLIC_CURSOR_WS_URL = wss://your-domain.up.railway.app
# 3. Redeploy
```

## Verify Deployment

```bash
# 1. Check Railway service status
railway status

# 2. Check health endpoint
curl https://your-domain.up.railway.app/health

# 3. Check Railway logs
railway logs --follow

# 4. Open your board, check browser console:
# Should see: "🖱️  Using dedicated cursor server"
# Should see: "🖱️  Cursor latency: XXms" (should be <50ms)
```

## Rollback (If Needed)

```bash
# Option A: Delete env variable in Vercel
vercel env rm NEXT_PUBLIC_CURSOR_WS_URL production

# Option B: Stop Railway service
railway down

# Frontend will automatically fall back to main server
```

## Cost

- Railway Free Tier: 500 hours/month
- Estimated: ~$5/month if you exceed free tier
- Total (main + cursor): ~$10/month

## Performance Expectations

- Local: <10ms ✅
- Railway (same region): 20-50ms ✅  
- Railway (different region): 50-100ms ✅
- Previous setup: 100-200ms ❌

**Expected improvement: 50%+ faster cursor sync**

## Troubleshooting

### Can't connect to cursor server
```bash
# Check if service is running
railway status

# Check logs for errors
railway logs

# Verify domain is generated
railway domain
```

### Still seeing 100-200ms latency
```bash
# 1. Hard refresh browser (Cmd+Shift+R)
# 2. Check Vercel env variable is set
# 3. Redeploy Vercel after adding env variable
# 4. Check browser console for connection URL
```

### Cursors not visible
```bash
# 1. Check Railway logs for connection messages
railway logs --follow

# 2. Check browser console for errors
# 3. Verify WebSocket URL in console:
# Should be: wss://your-domain.up.railway.app/cursor/...
```

## Useful Commands

```bash
# View all Railway services
railway list

# SSH into Railway container
railway run bash

# View environment variables
railway variables

# Stop service
railway down

# Restart service
railway up

# Delete project (careful!)
railway delete
```

## Next: After Deployment

1. ✅ Test with 2 browsers
2. ✅ Check latency in console
3. ✅ Monitor Railway logs for 1 hour
4. ✅ If stable, you're done! 🎉
