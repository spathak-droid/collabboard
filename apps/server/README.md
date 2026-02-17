# Hocuspocus WebSocket Server

Real-time CRDT sync server for CollabBoard using Yjs + Hocuspocus.

## Prerequisites

- Node.js 20+
- Firebase Admin SDK credentials
- Supabase project with service key

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env` file:

```bash
# Server
PORT=1234
NODE_ENV=production

# Firebase Admin SDK
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
```

### 3. Firebase Service Account

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Copy the JSON content to `FIREBASE_SERVICE_ACCOUNT` env var (as a single line)

## Development

```bash
npm run dev
```

Server runs on `ws://localhost:1234`

## Production Deployment (Railway)

### Option 1: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set PORT=1234
railway variables set NODE_ENV=production
railway variables set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_SERVICE_KEY=your_service_key

# Deploy
railway up
```

### Option 2: GitHub Integration

1. Push code to GitHub
2. Create new project in [Railway](https://railway.app)
3. Connect GitHub repo
4. Add environment variables in Railway dashboard
5. Deploy

### Option 3: Docker

```bash
# Build
docker build -t whiteboard-server .

# Run
docker run -p 1234:1234 \
  -e FIREBASE_SERVICE_ACCOUNT='...' \
  -e SUPABASE_URL='...' \
  -e SUPABASE_SERVICE_KEY='...' \
  whiteboard-server
```

## Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 1234

CMD ["node", "server.js"]
```

## Testing Connection

```bash
# Install wscat
npm install -g wscat

# Connect to server
wscat -c ws://localhost:1234
```

## Monitoring

### Logs

Railway provides automatic log streaming in the dashboard.

### Health Check

The server is healthy if:
- WebSocket connections are accepted
- No authentication errors in logs
- Supabase queries succeed

### Performance Metrics

- **Latency**: <200ms for sync updates
- **Connections**: Handle 100+ concurrent users
- **Memory**: <512MB RAM usage

## Troubleshooting

### "Authentication failed"

Check that `FIREBASE_SERVICE_ACCOUNT` is valid JSON and has correct permissions.

### "Cannot connect to Supabase"

Verify `SUPABASE_SERVICE_KEY` (not anon key) and URL are correct.

### WebSocket connection refused

Ensure Railway exposes port 1234 and firewall allows WebSocket connections.

### High memory usage

Hocuspocus stores documents in memory. Consider implementing document cleanup for inactive boards.

## Architecture

```
Client (Browser)
    ↓ WebSocket
Hocuspocus Server (Railway)
    ↓ Yjs CRDT
    ↓ Binary State
Supabase (Postgres)
```

## Security

- ✅ Firebase JWT authentication
- ✅ Token verification on connect
- ✅ Board access control (TODO: implement RLS)
- ✅ HTTPS/WSS in production

## Scaling

For >1000 concurrent users:

1. **Horizontal scaling**: Deploy multiple instances behind load balancer
2. **Redis adapter**: Share documents across instances
3. **Document cleanup**: Unload inactive boards from memory

## License

MIT
