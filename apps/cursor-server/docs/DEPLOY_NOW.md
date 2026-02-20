# 🚀 Deploy Cursor Server to Railway

## Step 1: Open Terminal in Cursor Server Directory

```bash
cd apps/cursor-server
```

## Step 2: Create New Railway Project

Run this command and follow the interactive prompts:

```bash
railway init
```

**When prompted:**
- Select: **"Create new project"**
- Name it: **"cursor-sync"** (or any name you like)

## Step 3: Deploy

```bash
railway up
```

This will:
- Build your server
- Deploy to Railway
- Show deployment logs

Wait for: `✅ Deployment successful`

## Step 4: Generate Public Domain

```bash
railway domain
```

This will give you a URL like:
```
cursor-sync-production.up.railway.app
```

**Copy this URL!** You'll need it for the next step.

## Step 5: Check Deployment

```bash
# View logs
railway logs

# Check status
railway status

# Test health endpoint
curl https://cursor-sync-production.up.railway.app/health
```

Should return:
```json
{"status":"healthy","uptime":123,"rooms":0,"totalUsers":0}
```

## Step 6: Update Vercel Environment Variable

Go to your Vercel project:
1. **Settings** → **Environment Variables**
2. Add new variable:
   ```
   Name: NEXT_PUBLIC_CURSOR_WS_URL
   Value: wss://cursor-sync-production.up.railway.app
   ```
3. Apply to: **Production**, **Preview**, **Development**
4. Click **Save**

## Step 7: Redeploy Frontend

In Vercel dashboard:
- Go to **Deployments**
- Click **"..."** on latest deployment
- Click **"Redeploy"**

Or push a commit:
```bash
git add .
git commit -m "Add dedicated cursor server URL"
git push
```

## Step 8: Test Production

1. Open your production board in 2 browsers
2. Move cursor in one browser
3. Check console for:
   ```
   🖱️  Connecting to cursor sync: wss://cursor-sync-production.up.railway.app/...
   🖱️  Cursor sync connected
   ```
4. Watch cursor movement - should be smooth!

## Expected Performance

- **Same region:** 40-60ms ⭐⭐⭐⭐
- **Cross-region:** 80-120ms ⭐⭐⭐
- **Far away:** 150-200ms ⭐⭐

---

## Troubleshooting

### Can't connect to Railway
```bash
railway login
# Opens browser for authentication
```

### Deployment failed
```bash
railway logs
# Check for errors
```

### Health check fails
```bash
# Check if service is running
railway status

# View recent logs
railway logs --tail 50
```

### Frontend not connecting
1. Check Vercel env variable is set
2. Hard refresh browser (Cmd+Shift+R)
3. Check browser console for WebSocket URL

---

## Cost

- **Railway Free Tier:** 500 hours/month
- **Paid:** ~$5/month if you exceed free tier
- **Total (main + cursor):** ~$10/month

---

## Next Steps After Deployment

1. ✅ Monitor Railway logs for 1 hour
2. ✅ Test with real users
3. ✅ Check latency from different locations
4. ✅ If satisfied, you're done! 🎉

---

## Useful Commands

```bash
# View logs in real-time
railway logs --follow

# Restart service
railway restart

# View all services
railway list

# SSH into container
railway run bash

# Delete project (careful!)
railway delete
```
