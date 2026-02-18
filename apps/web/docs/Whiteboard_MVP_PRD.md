# Collaborative Whiteboard Platform - MVP Product Requirements Document

**Version:** 1.0  
**Last Updated:** February 16, 2026  
**Timeline:** Week 1 MVP (80 hours)  
**Target:** Production deployment with bulletproof multiplayer

---

## Executive Summary

This PRD defines the Week 1 MVP for a production-scale collaborative whiteboard platform. The primary goal is **bulletproof multiplayer** over feature richness. All requirements are mandatory for launch.

**Core Principle:** A simple whiteboard with perfect real-time sync beats a feature-rich board with broken collaboration.

---

## Tech Stack Foundation

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 + TypeScript + Konva.js | Canvas rendering, API routes |
| **Authentication** | Firebase Auth | Email/password, Google, GitHub |
| **Real-time Sync** | Yjs + Hocuspocus (Railway) | CRDT conflict resolution, WebSocket |
| **Database** | Supabase Postgres | Metadata, snapshots, audit logs |
| **State Management** | Zustand | Local UI state |
| **API** | tRPC | Type-safe backend communication |
| **Deployment** | Vercel (frontend) + Railway (WebSocket) | CDN + always-on WebSocket server |
| **Monitoring** | Sentry (free tier) | Error tracking |

---

## MVP Hard Requirements (24 Hours Gate)

All items below are **mandatory** to pass Week 1 gate. No feature can be skipped.

### ✅ Checklist

- [ ] **Infinite board with pan/zoom** - Smooth canvas navigation
- [ ] **Sticky notes with editable text** - Create, edit, change colors
- [ ] **At least one shape type** - Rectangle, circle, or line
- [ ] **Create, move, and edit objects** - Core manipulation
- [ ] **Real-time sync between 2+ users** - CRDT-based sync
- [ ] **Multiplayer cursors with name labels** - See others' cursors
- [ ] **Presence awareness** - Who's online indicator
- [ ] **User authentication** - Firebase Auth (email, Google, GitHub)
- [ ] **Deployed and publicly accessible** - Vercel production URL

---

## Feature Specifications

### 1. Workspace (Infinite Canvas)

#### 1.1 Pan & Zoom
**Priority:** P0 (Mandatory)

**Requirements:**
- Infinite canvas (no boundaries)
- Pan: Click and drag background
- Zoom: Mouse wheel (10% increments, 10%-500% range)
- Zoom centering: Zoom toward mouse cursor position
- Reset view: Double-click background returns to origin (0,0) at 100% zoom

**Technical Implementation:**
```typescript
// Konva Stage configuration
<Stage
  width={window.innerWidth}
  height={window.innerHeight}
  draggable={true}
  onWheel={handleWheel}
  scaleX={scale}
  scaleY={scale}
  x={position.x}
  y={position.y}
/>
```

**Acceptance Criteria:**
- Pan is smooth (60fps) with 1000+ objects on board
- Zoom feels natural (logarithmic scaling)
- No jank during pan/zoom operations
- Works on trackpad and mouse

---

### 2. Sticky Notes

#### 2.1 Core Functionality
**Priority:** P0 (Mandatory)

**Requirements:**
- **Create:** Click "Sticky Note" tool, then click canvas to place
- **Default size:** 200x200 pixels
- **Default color:** Yellow (#FFF59D)
- **Text editing:** Double-click to enter edit mode
- **Edit mode UI:** 
  - Blinking cursor
  - Text wraps at note boundaries
  - Escape key or click outside to exit
- **Font:** 16px, sans-serif, black text
- **Max text:** 500 characters (soft limit, no enforcement Week 1)

#### 2.2 Color Picker
**Priority:** P0 (Mandatory)

**Available colors:**
- Yellow (#FFF59D)
- Pink (#F48FB1)
- Blue (#81D4FA)
- Green (#A5D6A7)
- Orange (#FFCC80)

**UI:** Color palette appears when sticky note is selected (bottom of selection indicator)

**Yjs Sync:**
```typescript
// Sticky note data structure
{
  id: string,
  type: 'sticky',
  x: number,
  y: number,
  width: 200,
  height: 200,
  color: string,
  text: string,
  rotation: 0,
  zIndex: number,
  createdBy: string,
  createdAt: number,
  modifiedBy: string,
  modifiedAt: number
}
```

**Acceptance Criteria:**
- Double-click opens edit mode within 100ms
- Text changes sync to all users within 200ms (Yjs handles this)
- Color changes sync instantly
- No text loss during concurrent editing (CRDT guarantees)

---

### 3. Shapes

#### 3.1 Shape Types (Week 1)
**Priority:** P0 (Mandatory - at least 1 type)

**Minimum requirement:** Implement at least ONE of:
- **Rectangle:** 150x100px default
- **Circle:** 100px diameter default
- **Line:** 200px length default

**Recommended:** Implement all three for better UX

#### 3.2 Shape Properties
**Priority:** P0 (Mandatory)

**Properties:**
- Fill color: Solid color (same palette as sticky notes)
- Stroke color: Black by default
- Stroke width: 2px
- No transparency (Week 1)
- No gradients (Week 1)

#### 3.3 Creation Flow
1. User clicks shape tool in toolbar
2. User clicks canvas to place shape at default size
3. Shape appears at cursor position
4. Shape is immediately selected (transform handles visible)

**Yjs Sync:**
```typescript
// Shape data structure
{
  id: string,
  type: 'rect' | 'circle' | 'line',
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  rotation: number,
  zIndex: number,
  // Line-specific
  points?: [x1, y1, x2, y2],
  createdBy: string,
  createdAt: number
}
```

**Acceptance Criteria:**
- Shape creation is instant (no lag)
- All users see shape within 200ms
- Fill color changes sync immediately

---

### 4. Object Manipulation

#### 4.1 Move (Drag)
**Priority:** P0 (Mandatory)

**Requirements:**
- Click and drag any object to move
- Smooth dragging (no stuttering)
- Drag multiple selected objects together
- Snap to grid: OFF (Week 1)

**Technical:**
```typescript
// Konva draggable
<Rect
  draggable={true}
  onDragMove={handleDragMove}
  onDragEnd={handleDragEnd}
/>

// Sync on drag end (not every move)
const handleDragEnd = (e) => {
  updateObject(objectId, {
    x: e.target.x(),
    y: e.target.y(),
    modifiedBy: currentUser.uid,
    modifiedAt: Date.now()
  });
};
```

#### 4.2 Resize & Rotate
**Priority:** P0 (Mandatory)

**Requirements:**
- **Transform handles:** Appear when object is selected
- **Resize:** Drag corner handles (maintain aspect ratio with Shift key)
- **Rotate:** Drag rotation handle at top
- **Minimum size:** 20x20 pixels (prevent invisible objects)

**Technical:**
```typescript
// Konva Transformer
<Transformer
  ref={transformerRef}
  boundBoxFunc={(oldBox, newBox) => {
    // Prevent tiny objects
    if (newBox.width < 20 || newBox.height < 20) {
      return oldBox;
    }
    return newBox;
  }}
/>
```

**Acceptance Criteria:**
- Transform handles are visible and clickable
- Resize/rotate feels smooth (60fps)
- Changes sync to all users on transform end (not during)
- No flickering during transforms

---

### 5. Selection System

#### 5.1 Single Select
**Priority:** P0 (Mandatory)

**Requirements:**
- Click any object to select it
- Selected object shows transform handles (8 handles + rotation)
- Selection indicator: 2px blue border
- Clicking background deselects all

#### 5.2 Multi-Select
**Priority:** P0 (Mandatory)

**Requirements:**
- **Shift-click:** Add/remove objects from selection
- **Drag-to-select:** Click and drag on background creates selection rectangle
  - Blue semi-transparent rectangle (#2196F3 with 20% opacity)
  - Objects fully or partially inside rectangle are selected
  - Release mouse to finalize selection
- **All selected objects:**
  - Move together when dragging
  - Single transform applies to all (resize/rotate group)
  
**Edge Cases:**
- Shift-click already selected object = deselect it
- Drag-to-select on empty area = clear previous selection

**Technical:**
```typescript
// Zustand local state (not synced)
interface SelectionState {
  selectedIds: string[];
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
}
```

**Acceptance Criteria:**
- Shift-click adds to selection immediately
- Drag-to-select rectangle is visible during drag
- Multi-selected objects move together smoothly
- Selection state is local (other users don't see your selection)

---

### 6. Operations

#### 6.1 Delete
**Priority:** P0 (Mandatory)

**Requirements:**
- Keyboard: Delete or Backspace key
- UI: Delete button in toolbar (when objects selected)
- Confirmation: None (can implement undo in Week 2)
- Syncs deletion to all users immediately

**Technical:**
```typescript
// Yjs deletion
const deleteObjects = (ids: string[]) => {
  ids.forEach(id => {
    yObjects.delete(id);
  });
};
```

#### 6.2 Duplicate
**Priority:** P1 (Recommended for Week 1, not blocking)

**Requirements:**
- Keyboard: Cmd/Ctrl + D
- UI: Duplicate button when objects selected
- Duplicated object appears 20px down and 20px right
- Duplicated object is auto-selected

**Skip if time-constrained in Week 1**

#### 6.3 Copy/Paste
**Priority:** P2 (Week 2)

**Skip for Week 1 MVP** - Requires clipboard management complexity

---

### 7. Real-Time Collaboration

#### 7.1 CRDT Sync (Yjs)
**Priority:** P0 (Mandatory)

**Requirements:**
- **Conflict Resolution:** Yjs CRDT handles all conflicts automatically
- **Approach:** Last-write-wins for object properties (position, size, color)
- **Text editing:** Yjs Text type for concurrent text editing (no conflicts)
- **Sync frequency:** Immediate (WebSocket push)
- **Latency:** <200ms for updates to appear on other clients

**Technical Architecture:**
```typescript
// Yjs document structure
const ydoc = new Y.Doc();
const yObjects = ydoc.getMap('objects'); // All whiteboard objects
const awareness = wsProvider.awareness; // Presence (cursors, users online)

// WebSocket provider (Hocuspocus)
const wsProvider = new WebsocketProvider(
  'wss://whiteboard-ws.railway.app',
  'board-{boardId}',
  ydoc
);
```

**Data Flow:**
1. User action (e.g., move object) → Update local Yjs state
2. Yjs generates update (binary diff)
3. WebSocket sends update to Hocuspocus server
4. Server broadcasts to all connected clients
5. Other clients apply update to their Yjs doc
6. React components re-render with new state

**Acceptance Criteria:**
- 2 users can edit simultaneously without data loss
- Updates appear on remote clients within 200ms
- Disconnected client can reconnect and see all changes
- No "last edit wins" data loss (CRDT guarantees)

#### 7.2 Multiplayer Cursors
**Priority:** P0 (Mandatory)

**Requirements:**
- **Display:** SVG cursor with user's name label
- **Position:** Real-time tracking (updates on mouse move)
- **Throttle:** Max 60 updates/second per user
- **Color:** Each user assigned a color from palette (deterministic based on userId)
- **Label:** User's display name (from Firebase Auth)
- **Hide when idle:** Cursor disappears after 5 seconds of no movement

**Technical:**
```typescript
// Yjs awareness (ephemeral state)
awareness.setLocalStateField('cursor', { 
  x: mouseX, 
  y: mouseY,
  lastUpdate: Date.now()
});

awareness.setLocalStateField('user', {
  id: currentUser.uid,
  name: currentUser.displayName,
  color: getUserColor(currentUser.uid)
});

// Listen to others
awareness.on('change', () => {
  const states = awareness.getStates();
  states.forEach((state, clientId) => {
    if (clientId !== awareness.clientID) {
      renderCursor(state.cursor, state.user);
    }
  });
});
```

**Cursor Colors (Deterministic):**
```typescript
const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', 
  '#FFA07A', '#98D8C8', '#F7DC6F'
];

const getUserColor = (userId: string) => {
  const hash = userId.split('').reduce((acc, char) => 
    acc + char.charCodeAt(0), 0);
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
};
```

**Acceptance Criteria:**
- See other users' cursors within 100ms of their movement
- Cursor label shows correct user name
- No flickering or stuttering
- Cursors disappear when user disconnects

#### 7.3 Presence Awareness
**Priority:** P0 (Mandatory)

**Requirements:**
- **User list:** Fixed panel showing all online users
- **Location:** Top-right corner of screen
- **Display:** User avatar (first letter of name), name, colored indicator
- **Update:** Real-time (users appear/disappear immediately)
- **Capacity:** Display up to 15 users, then "... and 5 more"

**UI Design:**
```
┌─────────────────────────┐
│  👥 Online (3)          │
├─────────────────────────┤
│  🔴 Alice (You)         │
│  🟢 Bob                 │
│  🟡 Charlie             │
└─────────────────────────┘
```

**Technical:**
```typescript
// Yjs awareness
const onlineUsers = Array.from(awareness.getStates().values())
  .map(state => state.user)
  .filter(user => user); // Remove undefined

// Subscribe to changes
awareness.on('change', ({ added, updated, removed }) => {
  updateUserList();
});
```

**Acceptance Criteria:**
- User list updates within 500ms of user join/leave
- Current user is clearly marked ("You")
- List persists across page refreshes (after reconnect)
- Shows accurate count even with 50+ users (displays first 15 + count)

#### 7.4 Disconnect/Reconnect Handling
**Priority:** P0 (Mandatory)

**Requirements:**
- **Visual indicator:** Yellow banner at top when disconnected
  - "Disconnected from server. Reconnecting..."
- **Auto-reconnect:** Attempt reconnect every 2 seconds (exponential backoff)
- **Offline mode:** User can still edit locally (syncs when reconnected)
- **Conflict resolution:** Yjs merges offline changes automatically on reconnect
- **Max offline time:** 5 minutes (after that, require page refresh)

**Technical:**
```typescript
wsProvider.on('status', ({ status }) => {
  if (status === 'disconnected') {
    showDisconnectBanner();
    startReconnectTimer();
  } else if (status === 'connected') {
    hideDisconnectBanner();
    clearReconnectTimer();
  }
});
```

**Acceptance Criteria:**
- User sees disconnect banner within 2 seconds of losing connection
- Reconnect is automatic (no manual refresh needed)
- Offline edits are preserved and merged on reconnect
- No data loss during disconnect/reconnect cycle

---

### 8. Persistence

#### 8.1 Auto-Save to Supabase
**Priority:** P0 (Mandatory)

**Requirements:**
- **Frequency:** Every 30 seconds (if changes detected)
- **Trigger:** Also save on:
  - User exits board (unmount)
  - User closes browser tab (beforeunload)
  - Manual "Save" button (optional UI element)
- **Data stored:** Full Yjs document state (binary encoded)
- **Metadata:** Board title, last modified timestamp, thumbnail (base64 PNG, 200x150px)

**Technical:**
```typescript
// Auto-save interval
useEffect(() => {
  const interval = setInterval(() => {
    if (hasUnsavedChanges) {
      saveSnapshot();
    }
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}, [hasUnsavedChanges]);

// Save snapshot
const saveSnapshot = async () => {
  const state = Y.encodeStateAsUpdate(ydoc);
  const base64State = btoa(String.fromCharCode(...state));
  
  await supabase
    .from('board_snapshots')
    .insert({
      board_id: boardId,
      state: base64State,
      created_at: new Date().toISOString(),
      created_by: currentUser.uid
    });
  
  setHasUnsavedChanges(false);
};
```

#### 8.2 Load Board State
**Priority:** P0 (Mandatory)

**Requirements:**
- **On board open:** Fetch latest snapshot from Supabase
- **Apply to Yjs:** Decode and apply state to ydoc
- **Show loading:** Skeleton UI while loading (max 2 seconds)
- **Empty board:** If no snapshot exists, start with empty ydoc

**Technical:**
```typescript
// Load on mount
useEffect(() => {
  const loadBoard = async () => {
    const { data } = await supabase
      .from('board_snapshots')
      .select('state')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data?.state) {
      const binaryState = Uint8Array.from(atob(data.state), c => c.charCodeAt(0));
      Y.applyUpdate(ydoc, binaryState);
    }
    
    setLoading(false);
  };
  
  loadBoard();
}, [boardId]);
```

**Acceptance Criteria:**
- Board loads within 2 seconds
- All objects from last session are present
- Board state survives all users leaving (can return hours later)
- No data loss between sessions

---

### 9. User Authentication

#### 9.1 Firebase Auth Integration
**Priority:** P0 (Mandatory)

**Requirements:**
- **Providers:** Email/password, Google, GitHub
- **Sign up flow:** Email + password with email verification (skip verification for Week 1)
- **Login flow:** Email + password OR social login (Google/GitHub)
- **Logout:** Clear Firebase session, redirect to login
- **Protected routes:** Board pages require authentication

**UI Flow:**
1. User lands on `/` → Redirects to `/login` if not authenticated
2. User completes login/signup
3. Redirect to `/dashboard` (board list)
4. User clicks board → Opens `/board/[boardId]`

**Technical:**
```typescript
// Firebase config
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // ...
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Auth context
export const useAuth = () => {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return unsubscribe;
  }, []);
  
  return { user, auth };
};
```

**Acceptance Criteria:**
- User can sign up with email/password
- User can login with Google (one-click)
- User can login with GitHub (one-click)
- Protected routes redirect to login if not authenticated
- User session persists across page refreshes
- Logout clears session completely

#### 9.2 Hocuspocus Authentication
**Priority:** P0 (Mandatory)

**Requirements:**
- WebSocket connection requires valid Firebase JWT token
- Hocuspocus server verifies token before allowing board access
- Token refresh: Handle token expiration gracefully (60-minute tokens)

**Technical:**
```typescript
// Client: Send token in WebSocket connection
const wsProvider = new WebsocketProvider(
  'wss://whiteboard-ws.railway.app',
  `board-${boardId}`,
  ydoc,
  {
    params: {
      token: await auth.currentUser.getIdToken()
    }
  }
);

// Server: Hocuspocus authentication hook
import { Server } from '@hocuspocus/server';
import admin from 'firebase-admin';

const server = Server.configure({
  async onAuthenticate({ token, documentName }) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Check if user has access to board
      const hasAccess = await checkBoardAccess(decodedToken.uid, documentName);
      
      if (!hasAccess) {
        throw new Error('Unauthorized');
      }
      
      return {
        user: {
          id: decodedToken.uid,
          name: decodedToken.name
        }
      };
    } catch (error) {
      throw new Error('Authentication failed');
    }
  }
});
```

**Acceptance Criteria:**
- Unauthenticated user cannot connect to WebSocket
- Invalid token is rejected with clear error message
- Token expiration triggers re-authentication (no disconnect)
- User without board access is blocked

---

### 10. Deployment

#### 10.1 Vercel (Frontend)
**Priority:** P0 (Mandatory)

**Requirements:**
- **Deploy:** Next.js app to Vercel
- **Domain:** Free Vercel subdomain (e.g., whiteboard-mvp.vercel.app)
- **Environment variables:** 
  - Firebase config
  - Supabase URL + anon key
  - Hocuspocus WebSocket URL
- **Build:** TypeScript strict mode, no errors
- **Deployment:** Auto-deploy on push to `main` branch

**Technical:**
```bash
# Vercel CLI
npm install -g vercel
vercel login
vercel --prod

# GitHub integration (recommended)
# Connect GitHub repo in Vercel dashboard
# Auto-deploys on push to main
```

**Environment Variables (Vercel):**
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_WS_URL=wss://whiteboard-ws.railway.app
```

#### 10.2 Railway (Hocuspocus WebSocket)
**Priority:** P0 (Mandatory)

**Requirements:**
- **Deploy:** Docker container running Hocuspocus server
- **Port:** Expose WebSocket on port 1234
- **Environment variables:**
  - Firebase service account (for admin SDK)
  - Supabase connection string (for persistence)
- **Monitoring:** Railway dashboard for logs and metrics
- **Cost:** Hobby plan ($5/month, 512MB RAM)

**Technical:**
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 1234
CMD ["node", "server.js"]
```

```javascript
// server.js (Hocuspocus)
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import admin from 'firebase-admin';

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
});

const server = Server.configure({
  port: 1234,
  
  extensions: [
    new Database({
      // Fetch board state from Supabase on document load
      fetch: async ({ documentName }) => {
        const boardId = documentName.replace('board-', '');
        const { data } = await supabase
          .from('board_snapshots')
          .select('state')
          .eq('board_id', boardId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data?.state) {
          return Uint8Array.from(atob(data.state), c => c.charCodeAt(0));
        }
        return null;
      },
      
      // Save board state to Supabase periodically
      store: async ({ documentName, state }) => {
        const boardId = documentName.replace('board-', '');
        const base64State = btoa(String.fromCharCode(...state));
        
        await supabase.from('board_snapshots').insert({
          board_id: boardId,
          state: base64State,
          created_at: new Date().toISOString()
        });
      }
    })
  ],
  
  async onAuthenticate({ token, documentName }) {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { user: { id: decodedToken.uid, name: decodedToken.name } };
  }
});

server.listen();
```

**Railway Deployment:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Acceptance Criteria:**
- WebSocket server is publicly accessible via wss://
- Connection is stable (no random disconnects)
- Server handles 20+ concurrent connections
- Logs are accessible via Railway dashboard
- Server auto-restarts on crash

---

## Non-Functional Requirements

### Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time to Interactive (TTI)** | < 3 seconds | Lighthouse |
| **Canvas FPS** | 60 fps with 1000 objects | Chrome DevTools Performance |
| **WebSocket latency** | < 200ms update propagation | Manual testing |
| **Memory usage** | < 200MB after 30 min session | Chrome DevTools Memory |
| **Bundle size** | < 500KB gzipped | Webpack Bundle Analyzer |

### Browser Support

**Supported (Week 1):**
- Chrome 120+ (primary)
- Firefox 120+
- Safari 17+
- Edge 120+

**Not Supported:**
- IE11 (dead)
- Mobile browsers (Week 2+)

### Accessibility

**Week 1 (Minimal):**
- Keyboard navigation: Tab through UI elements
- Focus indicators: Visible focus rings
- Screen reader: Skip for Week 1 (canvas is complex)

**Week 2+:**
- ARIA labels
- Keyboard shortcuts
- High contrast mode

### Security

**Week 1 Requirements:**
- HTTPS only (Vercel enforces)
- Firebase Auth tokens (short-lived, 60 min)
- Supabase RLS: Users can only access their boards
- No XSS: DOMPurify for user text input
- Rate limiting: 100 requests/minute per user (Next.js middleware)

---

## Success Metrics (Week 1)

**Technical Metrics:**
- [ ] 0 critical bugs blocking usage
- [ ] < 3 seconds page load time
- [ ] Real-time sync works flawlessly for 2+ users
- [ ] 100% uptime during Week 1 testing

**User Experience Metrics:**
- [ ] User can create account in < 60 seconds
- [ ] User can create first board in < 30 seconds
- [ ] User can invite collaborator and see real-time sync in < 2 minutes
- [ ] No data loss during 8-hour collaboration session

---

## Out of Scope (Week 1)

These features are explicitly **NOT** included in Week 1 MVP:

- ❌ Connectors/arrows between objects
- ❌ Frames (grouping)
- ❌ Text elements (standalone, outside sticky notes)
- ❌ Copy/paste
- ❌ Undo/redo
- ❌ Templates
- ❌ Export (PNG, PDF, SVG)
- ❌ Comments
- ❌ Version history beyond latest snapshot
- ❌ Permissions (viewer/editor roles)
- ❌ Team/workspace management
- ❌ AI agent features
- ❌ Mobile app
- ❌ Offline mode
- ❌ Search/filtering boards

**Week 2 Priority:**
1. Enterprise SSO (Auth0)
2. Audit logs (full history)
3. Undo/redo
4. Copy/paste
5. Export to PNG

---

## Testing Strategy (Week 1)

### Manual Testing Checklist

**Pre-Deployment (Day 7):**
- [ ] Test signup flow (email, Google, GitHub)
- [ ] Test login flow
- [ ] Create board, add 50+ objects (performance test)
- [ ] Open board in 3 browser tabs (multiplayer test)
- [ ] Disconnect WiFi, edit, reconnect (resilience test)
- [ ] Close all tabs, reopen board (persistence test)
- [ ] Test on Chrome, Firefox, Safari
- [ ] Invite external tester, verify they see real-time updates

### Automated Testing (E2E)

**Playwright Tests (3 critical flows):**

1. **User signup → Create board → Add objects → Real-time sync**
```typescript
test('full collaboration flow', async ({ page, context }) => {
  // User 1: Sign up and create board
  await page.goto('/signup');
  await page.fill('[name="email"]', 'user1@test.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  await page.click('text=Create Board');
  const boardUrl = page.url();
  
  // Add sticky note
  await page.click('[data-tool="sticky-note"]');
  await page.click('canvas', { position: { x: 100, y: 100 } });
  await page.dblclick('canvas', { position: { x: 100, y: 100 } });
  await page.keyboard.type('Hello from User 1');
  await page.keyboard.press('Escape');
  
  // User 2: Open same board in new tab
  const page2 = await context.newPage();
  await page2.goto(boardUrl);
  
  // Verify User 2 sees User 1's sticky note
  await expect(page2.locator('text=Hello from User 1')).toBeVisible({ timeout: 5000 });
  
  // User 2 adds object
  await page2.click('[data-tool="rectangle"]');
  await page2.click('canvas', { position: { x: 300, y: 100 } });
  
  // Verify User 1 sees User 2's rectangle
  await expect(page.locator('[data-type="rect"]')).toBeVisible({ timeout: 5000 });
});
```

2. **Disconnect/reconnect test**
3. **Persistence test** (close all tabs, reopen)

---

## Rollout Plan

### Day 7: Production Deployment

**Pre-Launch Checklist:**
- [ ] All MVP features implemented and tested
- [ ] Vercel deployment successful (green build)
- [ ] Railway WebSocket server running
- [ ] Firebase Auth configured with all providers
- [ ] Supabase database migrated
- [ ] Environment variables set correctly
- [ ] SSL certificates valid (Vercel auto)
- [ ] Manual testing completed (all browsers)
- [ ] E2E tests passing
- [ ] Sentry error tracking configured
- [ ] Production URL shared with team

**Launch Day:**
1. Final smoke test on production URL
2. Share URL publicly (Twitter, HN, personal network)
3. Monitor Sentry for errors (first 24 hours)
4. Check Railway logs for WebSocket issues
5. Respond to user feedback (bug reports)

**Success Criteria:**
- Public URL accessible
- At least 2 external users test real-time collaboration successfully
- No critical bugs reported in first 24 hours
- Uptime > 99% in first 24 hours

---

## Appendix

### A. Database Schema (Supabase)

```sql
-- Users table (auto-created by Firebase, synced to Supabase)
CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Boards table
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL DEFAULT 'Untitled Board',
  owner_uid TEXT NOT NULL REFERENCES users(uid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  thumbnail TEXT, -- base64 PNG
  is_public BOOLEAN DEFAULT FALSE
);

-- Board snapshots (Yjs state)
CREATE TABLE board_snapshots (
  id BIGSERIAL PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  state TEXT NOT NULL, -- base64 encoded Yjs state
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT REFERENCES users(uid)
);

-- Board access (permissions)
CREATE TABLE board_access (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES users(uid),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (board_id, user_uid)
);

-- Row Level Security (RLS)
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_access ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own boards"
  ON boards FOR SELECT
  USING (
    owner_uid = auth.uid() OR
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM board_access
      WHERE board_access.board_id = boards.id
        AND board_access.user_uid = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own boards"
  ON boards FOR INSERT
  WITH CHECK (owner_uid = auth.uid());

CREATE POLICY "Users can view snapshots of their boards"
  ON board_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_snapshots.board_id
        AND (
          boards.owner_uid = auth.uid() OR
          EXISTS (
            SELECT 1 FROM board_access
            WHERE board_access.board_id = boards.id
              AND board_access.user_uid = auth.uid()
          )
        )
    )
  );
```

### B. Folder Structure

```
whiteboard-app/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── page.tsx              # Board list
│   ├── board/
│   │   └── [id]/
│   │       └── page.tsx          # Whiteboard canvas
│   ├── api/
│   │   └── trpc/
│   │       └── [trpc]/
│   │           └── route.ts      # tRPC router
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── canvas/
│   │   ├── Canvas.tsx            # Main Konva Stage
│   │   ├── objects/
│   │   │   ├── StickyNote.tsx
│   │   │   ├── Rectangle.tsx
│   │   │   ├── Circle.tsx
│   │   │   └── Line.tsx
│   │   ├── Toolbar.tsx
│   │   ├── Cursors.tsx           # Multiplayer cursors
│   │   ├── Presence.tsx          # Online users list
│   │   └── SelectionRect.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── SignupForm.tsx
│   └── ui/                        # Shadcn components
│       ├── button.tsx
│       ├── input.tsx
│       └── ...
├── lib/
│   ├── firebase/
│   │   ├── config.ts
│   │   └── auth.ts
│   ├── supabase/
│   │   └── client.ts
│   ├── yjs/
│   │   ├── provider.ts
│   │   └── sync.ts
│   ├── trpc/
│   │   ├── server.ts
│   │   └── client.ts
│   ├── hooks/
│   │   ├── useCanvas.ts
│   │   ├── useSelection.ts
│   │   └── useYjs.ts
│   ├── store/
│   │   └── canvas.ts             # Zustand store
│   └── utils/
│       ├── colors.ts
│       └── geometry.ts
├── types/
│   ├── canvas.ts
│   ├── yjs.ts
│   └── user.ts
├── server/                        # Hocuspocus server (separate repo)
│   ├── server.js
│   ├── Dockerfile
│   └── package.json
├── public/
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.ts
```

### C. Environment Variables Checklist

**Vercel (.env.local):**
```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Hocuspocus WebSocket
NEXT_PUBLIC_WS_URL=wss://whiteboard-ws.railway.app

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
```

**Railway (Hocuspocus server):**
```bash
# Firebase Admin
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Server
PORT=1234
NODE_ENV=production
```

---

## Sign-Off

**Product Owner:** [Your Name]  
**Tech Lead:** [Your Name]  
**Timeline:** Week 1 (80 hours)  
**Launch Target:** Day 7, 12:00 PM UTC

**Approval:**
- [ ] All MVP requirements reviewed
- [ ] Technical feasibility confirmed
- [ ] Timeline realistic (80 hours available)
- [ ] Ready to start Day 1 implementation

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026  
**Next Review:** Day 3 (mid-week check-in)
