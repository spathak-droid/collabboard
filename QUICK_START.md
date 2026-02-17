# CollabBoard - Quick Start Checklist

Use this checklist to get your Whiteboard MVP running locally and deployed to production.

## Local Development Setup

### ☐ Step 1: Prerequisites
- [ ] Node.js 20+ installed (`node --version`)
- [ ] Git installed
- [ ] Code editor (VS Code recommended)

### ☐ Step 2: Frontend Setup
```bash
cd whiteboard-frontend
npm install --legacy-peer-deps
```

### ☐ Step 3: Server Setup
```bash
cd ../whiteboard-server
npm install
```

### ☐ Step 4: Firebase Project
- [ ] Create project at console.firebase.google.com
- [ ] Enable Email/Password auth
- [ ] Enable Google auth
- [ ] Enable GitHub auth
- [ ] Copy Firebase config
- [ ] Generate service account JSON

### ☐ Step 5: Supabase Project
- [ ] Create project at supabase.com
- [ ] Run SQL migrations (see README.md)
- [ ] Copy Supabase URL and anon key
- [ ] Copy service role key (for server)

### ☐ Step 6: Configure Frontend Environment
```bash
cd whiteboard-frontend
cp .env.example .env.local
# Edit .env.local with your credentials
```

Add:
- Firebase config (6 variables)
- Supabase URL and anon key
- WebSocket URL (use `ws://localhost:1234` for local dev)

### ☐ Step 7: Configure Server Environment
```bash
cd ../whiteboard-server
cp .env.example .env
# Edit .env with your credentials
```

Add:
- Firebase service account JSON (one line)
- Supabase URL and service key
- PORT=1234

### ☐ Step 8: Start Development Servers

**Terminal 1 - WebSocket Server:**
```bash
cd whiteboard-server
npm run dev
```
✅ Should see: "🚀 Hocuspocus WebSocket Server Running"

**Terminal 2 - Frontend:**
```bash
cd whiteboard-frontend
npm run dev
```
✅ Should see: "Ready on http://localhost:3000"

### ☐ Step 9: Test Locally
- [ ] Open http://localhost:3000
- [ ] Click "Sign Up"
- [ ] Create account
- [ ] Create new board
- [ ] Add sticky note
- [ ] Add rectangle
- [ ] Open board in incognito mode
- [ ] Verify real-time sync works

### ☐ Step 10: Run Tests
```bash
cd whiteboard-frontend
npm test              # Unit tests
npm run e2e          # E2E tests (requires dev server running)
```

---

## Production Deployment

### ☐ Step 11: Deploy WebSocket Server (Railway)

**Option A: CLI**
```bash
cd whiteboard-server
railway login
railway init
railway up
```

**Option B: GitHub**
- [ ] Push to GitHub
- [ ] Connect to Railway
- [ ] Auto-deploy

- [ ] Add environment variables in Railway dashboard
- [ ] Get WebSocket URL: `wss://your-app.railway.app`
- [ ] Test connection with `wscat -c wss://your-app.railway.app`

### ☐ Step 12: Deploy Frontend (Vercel)

**Option A: CLI**
```bash
cd whiteboard-frontend
vercel login
vercel --prod
```

**Option B: GitHub**
- [ ] Push to GitHub
- [ ] Import to Vercel
- [ ] Auto-deploy

- [ ] Add ALL environment variables
- [ ] Update `NEXT_PUBLIC_WS_URL` to Railway URL
- [ ] Redeploy

### ☐ Step 13: Update Firebase Authorized Domains
- [ ] Go to Firebase Console → Authentication → Settings
- [ ] Add your Vercel domain to "Authorized domains"

### ☐ Step 14: Production Testing
- [ ] Open your Vercel URL
- [ ] Sign up with email
- [ ] Sign in with Google
- [ ] Sign in with GitHub
- [ ] Create board
- [ ] Add objects
- [ ] Test with 2 users
- [ ] Test disconnect/reconnect
- [ ] Test persistence (refresh page)

---

## MVP Acceptance Criteria

### ☐ Functional Requirements
- [ ] Infinite canvas with smooth pan/zoom
- [ ] Sticky notes with editable text (5 colors)
- [ ] Rectangle shapes
- [ ] Move, resize, rotate objects
- [ ] Delete with keyboard (Del/Backspace)
- [ ] Multi-select with Shift-click
- [ ] Drag-to-select rectangle

### ☐ Real-Time Collaboration
- [ ] Changes sync in <200ms
- [ ] Multiplayer cursors visible
- [ ] User names shown on cursors
- [ ] Online users panel shows all users
- [ ] Disconnect banner appears when offline
- [ ] Auto-reconnect works

### ☐ Authentication
- [ ] Email/password signup works
- [ ] Email/password login works
- [ ] Google OAuth works
- [ ] GitHub OAuth works
- [ ] Protected routes redirect to login
- [ ] Logout clears session

### ☐ Persistence
- [ ] Auto-save every 30 seconds
- [ ] Board state loads on open
- [ ] All objects present after refresh
- [ ] Multiple boards can be created
- [ ] Dashboard shows all user boards

### ☐ Performance
- [ ] Canvas runs at 60fps
- [ ] No lag with 100+ objects
- [ ] Page loads in <3 seconds
- [ ] No memory leaks

### ☐ Testing
- [ ] All unit tests pass (`npm test`)
- [ ] E2E tests pass (`npm run e2e`)
- [ ] No TypeScript errors (`npm run build`)
- [ ] No ESLint errors (`npm run lint`)

---

## Troubleshooting

### Frontend won't start
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Server won't connect
- Check Firebase service account JSON is valid
- Verify Supabase credentials
- Ensure port 1234 is not in use

### Auth not working
- Check Firebase authorized domains
- Verify all Firebase env vars are set
- Try clearing browser cache

### Sync not working
- Check WebSocket URL is correct
- Verify Railway server is running
- Test with `wscat -c wss://your-url`
- Check browser console for errors

### Database errors
- Verify Supabase migrations ran successfully
- Check RLS policies are enabled
- Ensure service key (not anon key) for server

---

## Post-Deployment Monitoring

### Daily
- [ ] Check Railway logs for errors
- [ ] Monitor Vercel analytics
- [ ] Review Firebase auth usage

### Weekly
- [ ] Check Supabase database size
- [ ] Review error logs
- [ ] Test critical user flows
- [ ] Backup database snapshots

---

## Next Steps After MVP

See `Whiteboard_MVP_PRD.md` for Week 2 features:
1. Undo/redo
2. Copy/paste
3. Additional shapes (Circle, Line)
4. Export to PNG
5. Board permissions

---

## Support Resources

- **Frontend README**: `whiteboard-frontend/README.md`
- **Server README**: `whiteboard-server/README.md`
- **Deployment Guide**: `DEPLOYMENT.md`
- **Full PRD**: `Whiteboard_MVP_PRD.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`

---

## Success! 🎉

When you can:
- ✅ Sign up and log in
- ✅ Create boards
- ✅ Add sticky notes and shapes
- ✅ See changes from other users in real-time
- ✅ Have cursors follow other users
- ✅ Refresh and see all objects persist

**Your CollabBoard MVP is complete and ready to share!**

Share your board URL with team members and start collaborating.

---

**Estimated Time:**
- Local setup: 30-60 minutes
- Production deployment: 2-3 hours
- Total: 3-4 hours to live app
