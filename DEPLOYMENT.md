# CollabBoard - Deployment Guide

Complete step-by-step guide to deploy the Whiteboard MVP to production.

## Prerequisites Checklist

- [ ] GitHub account
- [ ] Vercel account (free tier)
- [ ] Railway account (hobby plan $5/month)
- [ ] Firebase project
- [ ] Supabase project
- [ ] Node.js 20+ installed locally

## Part 1: Database Setup (Supabase)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and region
4. Set database password (save it!)
5. Wait for project to initialize (~2 minutes)

### 1.2 Run Database Migrations

1. Go to SQL Editor
2. Copy SQL from `whiteboard-frontend/README.md` (Database Setup section)
3. Click "Run"
4. Verify tables created in Table Editor

### 1.3 Get API Keys

1. Go to Project Settings → API
2. Copy `URL` and `anon public` key
3. Save for later use

## Part 2: Authentication Setup (Firebase)

### 2.1 Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click "Add Project"
3. Name: `collabboard-prod`
4. Disable Google Analytics (optional)
5. Create project

### 2.2 Enable Authentication

1. Go to Authentication → Get Started
2. Enable Email/Password
3. Enable Google:
   - Add project support email
   - No additional setup needed
4. Enable GitHub:
   - Go to GitHub Settings → Developer Settings → OAuth Apps
   - Create new OAuth app
   - Homepage URL: `https://collabboard-prod.firebaseapp.com`
   - Callback URL: `https://collabboard-prod.firebaseapp.com/__/auth/handler`
   - Copy Client ID and Secret to Firebase

### 2.3 Get Firebase Config

1. Go to Project Settings → General
2. Scroll to "Your apps"
3. Click Web icon (</>) to add web app
4. Register app (name: `collabboard-web`)
5. Copy `firebaseConfig` object
6. Save all values

### 2.4 Generate Service Account (for WebSocket server)

1. Go to Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download JSON file
4. Save for Railway deployment

## Part 3: WebSocket Server Deployment (Railway)

### 3.1 Prepare Server Code

```bash
cd whiteboard-server
npm install
```

### 3.2 Deploy to Railway

**Option A: Railway CLI (Recommended)**

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init

# Deploy
railway up
```

**Option B: GitHub + Railway Dashboard**

1. Push server code to GitHub repo
2. Go to [railway.app](https://railway.app)
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repo
6. Click "Deploy Now"

### 3.3 Configure Environment Variables

In Railway dashboard or CLI:

```bash
# Server config
railway variables set PORT=1234
railway variables set NODE_ENV=production

# Firebase (paste your service account JSON as ONE LINE)
railway variables set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Supabase
railway variables set SUPABASE_URL=https://xxxxx.supabase.co
railway variables set SUPABASE_SERVICE_KEY=eyJhbGc...
```

### 3.4 Get WebSocket URL

1. Go to Railway project → Settings
2. Under "Domains", you'll see: `your-app.railway.app`
3. Your WebSocket URL is: `wss://your-app.railway.app`
4. Save this URL for Vercel deployment

### 3.5 Test WebSocket Server

```bash
# Install wscat
npm install -g wscat

# Test connection (replace with your Railway URL)
wscat -c wss://your-app.railway.app
```

Expected: Connection successful

## Part 4: Frontend Deployment (Vercel)

### 4.1 Prepare Frontend

```bash
cd whiteboard-frontend

# Verify build works locally
npm run build
```

### 4.2 Deploy to Vercel

**Option A: Vercel CLI**

```bash
# Install CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Option B: GitHub + Vercel Dashboard**

1. Push frontend code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repo
5. Vercel auto-detects Next.js
6. Click "Deploy"

### 4.3 Configure Environment Variables

In Vercel dashboard:

1. Go to Project → Settings → Environment Variables
2. Add ALL variables from `.env.example`:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=collabboard-prod.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=collabboard-prod
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=collabboard-prod.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# WebSocket (USE YOUR RAILWAY URL)
NEXT_PUBLIC_WS_URL=wss://your-app.railway.app
```

3. Click "Save"
4. Trigger redeployment

### 4.4 Update Firebase Authorized Domains

1. Go to Firebase Console → Authentication → Settings
2. Click "Authorized domains"
3. Add your Vercel domain: `your-app.vercel.app`

## Part 5: Verification & Testing

### 5.1 Smoke Test

1. Open `https://your-app.vercel.app`
2. Click "Sign Up"
3. Create account with email/password
4. Should redirect to dashboard
5. Click "New Board"
6. Should open whiteboard canvas

### 5.2 Multiplayer Test

1. Open board in Chrome
2. Open same board URL in Firefox (or incognito)
3. Login as different user
4. Add sticky note in Chrome
5. Verify it appears in Firefox within 200ms

### 5.3 Persistence Test

1. Add 5 objects to board
2. Close all browser tabs
3. Reopen board URL
4. Verify all objects are still there

### 5.4 Disconnect Test

1. Open browser DevTools → Network
2. Throttle to "Offline"
3. Add objects (should work locally)
4. Turn network back online
5. Verify objects sync to server

## Part 6: Production Checklist

- [ ] Frontend deploys successfully
- [ ] WebSocket server is running
- [ ] Can sign up with email/password
- [ ] Can sign in with Google
- [ ] Can sign in with GitHub
- [ ] Can create new board
- [ ] Can add sticky notes
- [ ] Can add rectangles
- [ ] Can move/resize/rotate objects
- [ ] Can delete objects
- [ ] Two users see real-time updates
- [ ] Cursors are visible
- [ ] Online users panel shows all users
- [ ] Disconnect banner appears when offline
- [ ] Board state persists after refresh
- [ ] All tests pass (`npm test`)

## Part 7: Monitoring

### Vercel (Frontend)

- Dashboard → Analytics (free)
- Shows: Page views, visitors, performance
- Real User Monitoring (RUM)

### Railway (WebSocket)

- Dashboard → Metrics (free)
- Shows: CPU, memory, network
- Logs tab for debugging

### Supabase (Database)

- Dashboard → Database → Logs
- Monitor query performance
- Check table sizes

### Firebase (Auth)

- Console → Authentication → Usage
- Monitor sign-ups and active users

## Part 8: Post-Deployment

### Custom Domain (Optional)

**Vercel:**
1. Go to Project → Settings → Domains
2. Add custom domain
3. Update DNS records
4. SSL auto-configured

**Railway:**
1. Go to Project → Settings → Domains
2. Add custom domain
3. Update DNS CNAME record

### Performance Optimization

1. Enable Vercel Analytics
2. Monitor Core Web Vitals
3. Check Lighthouse scores (target: >90)
4. Optimize images if needed

### Security Hardening

1. Review Firebase Security Rules
2. Enable Supabase RLS policies
3. Set up rate limiting (Vercel Edge Config)
4. Add CORS headers if needed

### Backup Strategy

1. Supabase: Enable point-in-time recovery
2. Export board snapshots weekly
3. Store Firebase config in secure vault

## Troubleshooting

### Issue: Frontend loads but can't connect to WebSocket

- Check `NEXT_PUBLIC_WS_URL` is correct
- Verify Railway server is running
- Check Railway logs for errors
- Test WebSocket connection with `wscat`

### Issue: Authentication fails

- Verify Firebase API keys are correct
- Check Firebase Authorized Domains includes Vercel domain
- Ensure OAuth providers are enabled

### Issue: Objects don't sync between users

- Check Railway logs for Yjs errors
- Verify Supabase connection string
- Test with browser DevTools Network tab
- Ensure Firebase token is valid

### Issue: Board state not persisting

- Check Supabase `board_snapshots` table has rows
- Verify RLS policies allow inserts
- Check Railway logs for store errors

## Cost Estimate

- **Vercel**: Free (Hobby tier)
- **Railway**: $5/month (Hobby tier, 512MB RAM)
- **Supabase**: Free (up to 500MB database)
- **Firebase**: Free (up to 10k MAU for auth)

**Total: ~$5/month** for MVP

## Next Steps

After successful deployment:

1. Share public URL with team
2. Gather user feedback
3. Monitor error logs (Sentry recommended)
4. Plan Week 2 features (see PRD)
5. Set up CI/CD (GitHub Actions)

## Support

If you encounter issues:

1. Check logs: Vercel, Railway, Supabase, Firebase
2. Review PRD requirements
3. Test locally first with `npm run dev`
4. Verify all environment variables are set
5. Check browser console for client errors

---

**Congratulations! Your Whiteboard MVP is now live! 🚀**

Share your board URL and start collaborating in real-time.
