# 🚀 Deploy to Vercel - Quick Guide

## Prerequisites
- ✅ Code is committed and pushed to GitHub
- ✅ Build passes locally (`npm run build`)
- ✅ Railway WebSocket servers are running

## Option 1: Deploy via Vercel Dashboard (Recommended)

### Step 1: Connect Repository
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"New Project"**
3. Import your GitHub repository: `spathak-droid/collabboard`
4. Vercel will auto-detect Next.js

### Step 2: Configure Project Settings
- **Root Directory**: `apps/web`
- **Framework Preset**: Next.js
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `.next` (auto-detected)
- **Install Command**: `npm ci` (auto-detected)

### Step 3: Set Environment Variables
Go to **Settings → Environment Variables** and add:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDgTSz5aGILOl-Z01ZI4YG7gEoZYQ65pbQ
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=collabboard-9d2ca.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=collabboard-9d2ca
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=collabboard-9d2ca.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=106192948970
NEXT_PUBLIC_FIREBASE_APP_ID=1:106192948970:web:b35866c382ab3a6338d193

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ksnarsfklijkgrovdhgp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzbmFyc2ZrbGlqa2dyb3ZkaGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODI0MjksImV4cCI6MjA4Njg1ODQyOX0.uwLMMOH1bwomECVna-NXCfltTghL3KBoAf38iQzEkZg

# WebSocket URLs (IMPORTANT: Include port numbers!)
NEXT_PUBLIC_WS_URL=wss://collabboard-server-production.up.railway.app:1234
NEXT_PUBLIC_CURSOR_WS_URL=wss://keen-exploration-production.up.railway.app:1235

# Resend (Email invites)
RESEND_API_KEY=re_cV36FHqg_CdduyfWtrZE3HvdojWF5Co6M
RESEND_FROM_EMAIL=Collabry <onboarding@resend.dev>

# App URL (update after deployment)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Important:** 
- Set all variables for **Production**, **Preview**, and **Development** environments
- After deployment, update `NEXT_PUBLIC_APP_URL` with your actual Vercel URL

### Step 4: Deploy
1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Your app will be live at `https://your-project.vercel.app`

---

## Option 2: Deploy via Vercel CLI

### Step 1: Login
```bash
cd apps/web
vercel login
```

### Step 2: Link Project (if not already linked)
```bash
vercel link
```
- Select your Vercel account
- Select existing project or create new one

### Step 3: Set Environment Variables
```bash
# Set each variable (repeat for all)
vercel env add NEXT_PUBLIC_WS_URL production
# Paste: wss://collabboard-server-production.up.railway.app:1234

vercel env add NEXT_PUBLIC_CURSOR_WS_URL production
# Paste: wss://collabboard-server-production.up.railway.app:1235

# ... repeat for all other variables
```

Or set them all at once via dashboard (easier).

### Step 4: Deploy
```bash
vercel --prod
```

---

## Post-Deployment Checklist

### ✅ 1. Update Firebase Authorized Domains
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: `collabboard-9d2ca`
3. Go to **Authentication → Settings → Authorized domains**
4. Add your Vercel domain: `your-project.vercel.app`

### ✅ 2. Update NEXT_PUBLIC_APP_URL
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL
3. Redeploy (or wait for next deployment)

### ✅ 3. Test Deployment
1. Open your deployed app: `https://your-project.vercel.app`
2. Sign up / Login
3. Create a new board
4. Check browser console for:
   - `[Yjs] Connecting to wss://collabboard-server-production.up.railway.app:1234...`
   - `🖱️ Connecting to cursor sync: wss://keen-exploration-production.up.railway.app:1235/...`
   - `[Yjs] Authenticated with server`
   - `🖱️ Cursor sync connected`

### ✅ 4. Test Multiplayer
1. Open board in 2 different browsers (or incognito)
2. Login as different users
3. Add objects - should sync in real-time
4. Move cursor - should appear on other screen

---

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Verify all environment variables are set
- Ensure `apps/web` is the root directory

### WebSocket Connection Fails
- Verify Railway servers are running: `railway logs`
- Check WebSocket URLs include port numbers (`:1234`, `:1235`)
- Test WebSocket connections manually:
  ```bash
  wscat -c wss://collabboard-server-production.up.railway.app:1234/
  wscat -c "wss://keen-exploration-production.up.railway.app:1235/cursor/test?userId=test&userName=Test"
  ```

### Environment Variables Not Working
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding/changing variables
- Check variable names match exactly (case-sensitive)

---

## Next Steps

After successful deployment:
1. ✅ Set up custom domain (optional)
2. ✅ Enable Vercel Analytics (optional)
3. ✅ Configure auto-deployments from `main` branch
4. ✅ Set up monitoring and alerts

---

**Need help?** Check Vercel docs: https://vercel.com/docs
