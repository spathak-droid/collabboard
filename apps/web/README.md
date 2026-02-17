# CollabBoard - Collaborative Whiteboard MVP

A production-scale collaborative whiteboard platform with **bulletproof multiplayer** using real-time CRDT sync.

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Konva.js
- **Authentication**: Firebase Auth (Email, Google, GitHub)
- **Real-time Sync**: Yjs + Hocuspocus (Railway)
- **Database**: Supabase Postgres
- **State Management**: Zustand
- **Testing**: Vitest + Playwright
- **Deployment**: Vercel (frontend) + Railway (WebSocket)

## Features ✅

- ✅ Infinite canvas with pan/zoom (60fps, 10%-500% range)
- ✅ Sticky notes with editable text (200x200px, 5 colors)
- ✅ Shape types (Rectangle with more coming)
- ✅ Create, move, resize, rotate objects
- ✅ Real-time CRDT sync (<200ms latency)
- ✅ Multiplayer cursors with name labels
- ✅ Presence awareness (online users list)
- ✅ Firebase Auth (Email, Google, GitHub)
- ✅ Auto-save every 30 seconds
- ✅ Disconnect/reconnect handling
- ✅ Test-driven development (TDD)

## Project Structure

```
whiteboard-frontend/
├── src/app/                    # Next.js app router
│   ├── (auth)/                 # Auth routes (login, signup)
│   ├── (dashboard)/            # Dashboard (board list)
│   ├── board/[id]/             # Whiteboard canvas page
│   └── api/                    # API routes
├── components/
│   ├── canvas/                 # Canvas components
│   │   ├── Canvas.tsx          # Main Konva Stage
│   │   ├── Toolbar.tsx         # Tool selection
│   │   ├── Presence.tsx        # Online users panel
│   │   ├── Cursors.tsx         # Multiplayer cursors
│   │   └── objects/            # Canvas objects
│   │       ├── StickyNote.tsx
│   │       └── Rectangle.tsx
│   └── auth/                   # Auth components
├── lib/
│   ├── firebase/               # Firebase config & auth
│   ├── supabase/               # Supabase client
│   ├── yjs/                    # Yjs provider & sync
│   ├── hooks/                  # Custom React hooks
│   ├── store/                  # Zustand store
│   └── utils/                  # Utility functions
├── types/                      # TypeScript types
└── tests/e2e/                  # Playwright E2E tests
```

## Prerequisites

- Node.js 20+
- npm or yarn
- Firebase project (with Auth enabled)
- Supabase project (with database)
- Railway account (for WebSocket server)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd whiteboard-frontend
npm install --legacy-peer-deps
```

### 2. Environment Variables

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Fill in your credentials:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Hocuspocus WebSocket (update after Railway deployment)
NEXT_PUBLIC_WS_URL=wss://your-app.railway.app
```

### 3. Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication:
   - Email/Password
   - Google
   - GitHub
3. Get your Firebase config from Project Settings

### 4. Supabase Setup

Run this SQL in your Supabase SQL editor:

```sql
-- Users table
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
  thumbnail TEXT,
  is_public BOOLEAN DEFAULT FALSE
);

-- Board snapshots (Yjs state)
CREATE TABLE board_snapshots (
  id BIGSERIAL PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT REFERENCES users(uid)
);

-- Board access permissions
CREATE TABLE board_access (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES users(uid),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (board_id, user_uid)
);

-- Enable Row Level Security
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

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

### Unit & Component Tests

```bash
npm test              # Run tests
npm run test:ui       # Run with UI
npm run test:coverage # Run with coverage
```

### E2E Tests

```bash
npm run e2e           # Run E2E tests
npm run e2e:ui        # Run with UI
```

## Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

OR use CLI:

```bash
npm install -g vercel
vercel login
vercel --prod
```

### WebSocket Server (Railway)

See `/server/README.md` for Hocuspocus deployment instructions.

## Performance Requirements

- ✅ Canvas: 60fps with 1000+ objects
- ✅ Sync latency: <200ms
- ✅ Page load: <3 seconds (TTI)
- ✅ Memory: <200MB after 30 min session

## Browser Support

- Chrome 120+ ✅
- Firefox 120+ ✅
- Safari 17+ ✅
- Edge 120+ ✅

## Development Guidelines

### Test-Driven Development

Every component MUST have test cases:

```typescript
// Component.tsx
export const Component = () => { ... }

// Component.test.tsx
describe('Component', () => {
  it('renders correctly', () => { ... });
});
```

### Code Quality

- TypeScript strict mode (no `any`)
- Functional components only
- Konva.js for canvas rendering
- Yjs for real-time sync
- Handle disconnects gracefully

## Troubleshooting

### "Cannot find module" errors

```bash
npm install --legacy-peer-deps
```

### Firebase Auth not working

Check that auth providers are enabled in Firebase Console.

### Yjs sync not working

Ensure Hocuspocus server is running and `NEXT_PUBLIC_WS_URL` is correct.

### Canvas not rendering

Check browser console for Konva errors. Ensure React 18+ compatibility.

## Contributing

This is an MVP project. See `Whiteboard_MVP_PRD.md` for full requirements.

## License

MIT
