# CollabBoard - Collaborative Whiteboard Platform

A production-scale collaborative whiteboard platform with **bulletproof multiplayer** using real-time CRDT sync.

## 🎯 Overview

CollabBoard is a real-time collaborative whiteboard application where multiple users can simultaneously create, edit, and manipulate objects (sticky notes, shapes) on an infinite canvas. All changes sync instantly across all connected users using Yjs CRDT technology.

**Core Principle:** A simple whiteboard with perfect real-time sync beats a feature-rich board with broken collaboration.

---

## 📁 Project Structure

This is a **monorepo** containing two main applications:

```
CollabBoard/
├── apps/
│   ├── web/                    # Frontend: Next.js 14 Application
│   │   ├── src/
│   │   │   ├── app/            # Next.js app router (pages)
│   │   │   ├── components/    # React components
│   │   │   ├── lib/           # Core logic & utilities
│   │   │   └── types/         # TypeScript types
│   │   └── package.json
│   │
│   └── server/                 # Backend: Hocuspocus WebSocket Server
│       ├── server.js          # Main server file
│       ├── Dockerfile         # Docker configuration
│       └── package.json
│
├── package.json                # Monorepo root scripts
├── README.md                   # This file
├── DEPLOYMENT.md              # Deployment guide
├── QUICK_START.md             # Quick setup checklist
└── Whiteboard_MVP_PRD.md      # Full product requirements
```

---

## 🏗️ Architecture

### Frontend (`apps/web/`)

**Technology Stack:**
- **Framework**: Next.js 14 (App Router) + TypeScript
- **Canvas Rendering**: Konva.js + react-konva
- **Real-time Sync**: Yjs + @hocuspocus/provider
- **Authentication**: Firebase Auth
- **Database Client**: Supabase JS
- **State Management**: Zustand (local UI state only)
- **API**: tRPC (type-safe)
- **Testing**: Vitest + Playwright

**Purpose:**
- Renders the infinite canvas using Konva.js
- Handles user interactions (pan, zoom, create, edit objects)
- Connects to WebSocket server for real-time sync
- Manages authentication and user sessions
- Provides UI for dashboard, board list, and canvas

### Backend (`apps/server/`)

**Technology Stack:**
- **Runtime**: Node.js 20+
- **WebSocket Server**: Hocuspocus v3
- **CRDT Engine**: Yjs
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Firebase Admin SDK

**Purpose:**
- WebSocket server for real-time document synchronization
- Manages Yjs documents (one per board)
- Handles CRDT conflict resolution automatically
- Persists board snapshots to Supabase every 30 seconds
- Authenticates WebSocket connections using Firebase JWT tokens

---

## 🔄 How It Works (Flow)

### 1. User Authentication Flow

```
User → Login Page → Firebase Auth → JWT Token → Session Storage
```

1. User visits `/login` or `/signup`
2. Authenticates via Firebase (Email/Password, Google, or GitHub)
3. Frontend receives Firebase JWT token
4. Token stored in browser session
5. User redirected to dashboard

### 2. Board Access Flow

```
User → Dashboard → Select Board → /board/[id] → Yjs Provider → WebSocket Connection
```

1. User navigates to `/board/[id]` route
2. Frontend creates a new Yjs document (`Y.Doc`)
3. `YjsProvider` connects to Hocuspocus server via WebSocket
4. Server authenticates connection using Firebase token
5. Server loads board snapshot from Supabase (if exists)
6. Yjs document syncs with server state
7. Canvas renders all objects from Yjs Map

### 3. Real-Time Sync Flow

```
User Action → Yjs Map Update → WebSocket Message → Server → Other Clients → UI Update
```

1. User creates/moves/edits an object on canvas
2. Change stored in Yjs Map: `ydoc.getMap('objects').set(objectId, objectData)`
3. Yjs CRDT automatically generates sync update
4. Update sent via WebSocket to Hocuspocus server
5. Server broadcasts to all connected clients on same board
6. Other users receive update in <200ms
7. Their Yjs documents merge the change automatically
8. React components re-render with new state

### 4. Persistence Flow

```
Yjs Document → Server → Database Extension → Supabase → PostgreSQL
```

1. Every 30 seconds, server auto-saves board state
2. Yjs document converted to binary format (Uint8Array)
3. Binary data base64-encoded
4. Stored in `board_snapshots` table in Supabase
5. On board load, server fetches latest snapshot
6. Snapshot loaded into Yjs document
7. All clients sync to same state

### 5. Multiplayer Features

**Awareness (Presence):**
- Each user's presence tracked via Yjs awareness
- User info (id, name, color) shared across clients
- Online users list displayed in UI

**Cursors:**
- Cursor position tracked via awareness
- Real-time cursor positions shared across clients
- Cursors rendered with user names and colors

---

## 🏛️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Next.js Frontend (apps/web/)             │   │
│  │                                                   │   │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │   │
│  │  │   Konva.js   │  │      Yjs Document        │ │   │
│  │  │   Canvas     │◄─┤   (ydoc.getMap('objects'))│ │   │
│  │  │   Rendering  │  │                           │ │   │
│  │  └──────────────┘  └───────────┬────────────────┘ │   │
│  │                                │                    │   │
│  │  ┌─────────────────────────────▼──────────────┐   │   │
│  │  │    YjsProvider (@hocuspocus/provider)      │   │   │
│  │  │    - Connects to WebSocket                 │   │   │
│  │  │    - Sends/receives CRDT updates          │   │   │
│  │  │    - Manages awareness (cursors, presence) │   │   │
│  │  └───────────────┬────────────────────────────┘   │   │
│  └──────────────────┼─────────────────────────────────┘   │
│                     │ WebSocket (WSS)                      │
│                     │ Firebase JWT Token                  │
└─────────────────────┼─────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│      Hocuspocus WebSocket Server (apps/server/)         │
│                    (Railway)                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Hocuspocus Server                      │   │
│  │                                                   │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │      Yjs Document Manager                 │   │   │
│  │  │  - One document per board                 │   │   │
│  │  │  - CRDT conflict resolution                │   │   │
│  │  │  - Broadcasts updates to all clients      │   │   │
│  │  └──────────────┬─────────────────────────────┘   │   │
│  │                 │                                   │   │
│  │  ┌──────────────▼──────────────────────────────┐   │   │
│  │  │    Database Extension                       │   │   │
│  │  │    - Auto-saves every 30s                   │   │   │
│  │  │    - Loads snapshots on connect             │   │   │
│  │  └──────────────┬──────────────────────────────┘   │   │
│  └────────────────┼────────────────────────────────────┘   │
│                   │ PostgreSQL                             │
└───────────────────┼────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL)                       │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   boards         │  │   board_snapshots            │  │
│  │   - id           │  │   - board_id                 │  │
│  │   - title        │  │   - state (base64 Yjs)       │  │
│  │   - owner_uid    │  │   - created_at               │  │
│  │   - created_at   │  └──────────────────────────────┘  │
│  └──────────────────┘                                      │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   users          │  │   board_access                │  │
│  │   - uid          │  │   - board_id                  │  │
│  │   - email        │  │   - user_uid                  │  │
│  │   - display_name │  │   - role                       │  │
│  └──────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** (`node --version`)
- **npm** or **yarn**
- **Firebase project** (for authentication)
- **Supabase project** (for database)
- **Railway account** (for WebSocket server deployment) - optional for local dev

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd CollabBoard
```

2. **Install root dependencies:**
```bash
npm install
```

3. **Install frontend dependencies:**
```bash
cd apps/web
npm install --legacy-peer-deps
```

4. **Install server dependencies:**
```bash
cd ../server
npm install
```

### Environment Setup

#### Frontend (`apps/web/.env.local`)

Create `.env.local` file in `apps/web/`:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# WebSocket Server (local dev)
NEXT_PUBLIC_WS_URL=ws://localhost:1234
```

#### Backend (`apps/server/.env`)

Create `.env` file in `apps/server/`:

```bash
# Server
PORT=1234
NODE_ENV=development

# Firebase Admin SDK (Service Account JSON as single line)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}

# Supabase (Service Role Key - NOT anon key)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

### Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication providers:
   - Email/Password
   - Google
   - GitHub
3. Copy Firebase config values to frontend `.env.local`
4. Generate Service Account JSON:
   - Go to Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Copy the entire JSON content to `FIREBASE_SERVICE_ACCOUNT` env var (as a single line)

### Supabase Setup

1. Create a Supabase project at [Supabase](https://supabase.com)
2. Run SQL migrations (see `apps/web/SUPABASE_SETUP.md` or `SUPABASE_SETUP_PROMPT.md`)
3. Copy credentials:
   - **Anon Key** → Frontend `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service Role Key** → Backend `SUPABASE_SERVICE_KEY` (⚠️ NOT anon key)

---

## 🏃 Running the Application

### Development Mode

**Terminal 1 - Start WebSocket Server:**
```bash
npm run dev:server
# OR
cd apps/server && npm run dev
```

✅ Expected output: `🚀 Hocuspocus WebSocket Server Running on ws://localhost:1234`

**Terminal 2 - Start Frontend:**
```bash
npm run dev:web
# OR
cd apps/web && npm run dev
```

✅ Expected output: `Ready on http://localhost:3000`

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

**Build Frontend:**
```bash
npm run build:web
cd apps/web && npm start
```

**Start Server:**
```bash
npm run start:server
cd apps/server && npm start
```

---

## 🧪 Testing

### Unit & Component Tests

```bash
cd apps/web
npm test              # Run tests
npm run test:ui       # Run with UI
npm run test:coverage # Run with coverage
```

### E2E Tests

```bash
cd apps/web
npm run e2e           # Run E2E tests
npm run e2e:ui        # Run with UI (requires dev server running)
```

---

## 📦 Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Add all environment variables from `.env.local`
4. Update `NEXT_PUBLIC_WS_URL` to your Railway WebSocket URL
5. Deploy

**OR use CLI:**
```bash
cd apps/web
npm install -g vercel
vercel login
vercel --prod
```

### Backend (Railway)

See `apps/server/README.md` for detailed instructions.

**Quick CLI method:**
```bash
cd apps/server
npm install -g @railway/cli
railway login
railway init
railway up
```

Add environment variables in Railway dashboard, then get your WebSocket URL: `wss://your-app.railway.app`

For detailed deployment instructions, see `DEPLOYMENT.md`.

---

## ✨ Features

### ✅ Implemented

- ✅ **Infinite canvas** with pan/zoom (10%-500% range, 60fps)
- ✅ **Sticky notes** with editable text (200x200px, 5 colors)
- ✅ **Shapes** (Rectangle, Circle, Line)
- ✅ **Object manipulation**: create, move, resize, rotate, delete
- ✅ **Selection system**: single select, multi-select (Shift), drag-to-select
- ✅ **Real-time CRDT sync** (<200ms latency)
- ✅ **Multiplayer cursors** with name labels
- ✅ **Presence awareness** (online users list)
- ✅ **Firebase Auth** (Email/Password, Google, GitHub)
- ✅ **Auto-save** every 30 seconds
- ✅ **Disconnect/reconnect** handling
- ✅ **Test-driven development** (TDD)

---

## 🔑 Key Concepts

### Yjs CRDT

**Conflict-free Replicated Data Type** ensures all users see the same state:
- **Automatic Merging**: No conflicts even with simultaneous edits
- **Binary Protocol**: Efficient sync over WebSocket
- **Eventual Consistency**: All clients converge to same state

### Hocuspocus

**WebSocket Server** for Yjs document synchronization:
- **Document-based**: Each board = one Yjs document (`board-{id}`)
- **Persistence**: Auto-saves to Supabase via Database extension
- **Scalable**: Handles 100+ concurrent users per board

### Konva.js

**2D Canvas Library** for high-performance rendering:
- **React Integration**: `react-konva` for React components
- **60fps Target**: Optimized for smooth interactions
- **Event Handling**: Mouse, touch, keyboard events

---

## 📊 Performance Targets

- **Canvas Rendering**: 60fps with 1000+ objects
- **Sync Latency**: <200ms between users
- **Page Load**: <3 seconds (TTI - Time to Interactive)
- **Memory**: <512MB RAM per server instance
- **Concurrent Users**: 100+ per board

---

## 🐛 Troubleshooting

### WebSocket Connection Failed

- Ensure server is running on port 1234
- Check `NEXT_PUBLIC_WS_URL` matches server URL
- Verify firewall allows WebSocket connections
- Test with: `wscat -c ws://localhost:1234`

### Authentication Errors

- Verify Firebase config in `.env.local`
- Check Service Account JSON format (must be single line)
- Ensure Firebase Auth providers are enabled
- Check Firebase authorized domains include your domain

### Database Errors

- Verify Supabase URL and keys
- Check database migrations are applied
- Ensure Service Role Key (not anon key) in server `.env`
- Check Row Level Security (RLS) policies

### Sync Not Working

- Check browser console for Yjs errors
- Verify WebSocket connection status (should show "connected")
- Ensure both users are on same board ID
- Check server logs for errors

### Canvas Not Rendering

- Check browser console for Konva errors
- Ensure React 18+ compatibility
- Verify Konva components are wrapped correctly
- Check for CSS conflicts

---

## 📚 Additional Documentation

- **Quick Start Guide**: `QUICK_START.md` - Step-by-step setup checklist
- **Deployment Guide**: `DEPLOYMENT.md` - Production deployment instructions
- **Product Requirements**: `Whiteboard_MVP_PRD.md` - Full MVP specifications
- **Frontend README**: `apps/web/README.md` - Frontend-specific details
- **Server README**: `apps/server/README.md` - Server-specific details
- **Supabase Setup**: `SUPABASE_SETUP_PROMPT.md` - Database setup guide

---

## 🤝 Contributing

This project follows **Test-Driven Development (TDD)**:

1. Write tests first (Red)
2. Implement minimum code to pass (Green)
3. Refactor while keeping tests green

**Rules:**
- Every component MUST have test cases
- TypeScript strict mode (no `any` types)
- Functional components only
- All tests must pass before merging

---

## 📄 License

MIT

---

## 🎉 Success Checklist

Your CollabBoard is working when you can:

- ✅ Sign up and log in (Email, Google, GitHub)
- ✅ Create new boards
- ✅ Add sticky notes and shapes
- ✅ Move, resize, rotate objects
- ✅ See changes from other users in real-time (<200ms)
- ✅ See multiplayer cursors with names
- ✅ See online users list
- ✅ Refresh page and see all objects persist
- ✅ Handle disconnect/reconnect gracefully

**Share your board URL with team members and start collaborating!** 🚀
