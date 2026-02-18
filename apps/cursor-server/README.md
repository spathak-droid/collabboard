# Cursor Sync Server

Ultra-low latency WebSocket server dedicated to cursor position broadcasting.

## Features

- ⚡ Zero overhead - direct WebSocket passthrough
- 🎯 Sub-10ms latency for cursor updates
- 📦 Room-based isolation per board
- 💚 Health check endpoint
- 🔄 Automatic reconnection support

## Local Development

```bash
npm install
npm run dev
```

Server runs on port 3000 by default.

## Deployment (Railway)

1. Create new Railway service
2. Connect to this folder: `apps/cursor-server`
3. Railway will auto-detect and deploy
4. Set environment variable: `PORT=3000` (optional, Railway sets this)

## Environment Variables

- `PORT` - Server port (default: 3000, Railway sets this automatically)

## Endpoints

- **WebSocket:** `ws://host/cursor/{boardId}?userId={id}&userName={name}`
- **Health Check:** `GET /health`

## Client Connection

```typescript
const ws = new WebSocket(
  `wss://cursor-server.railway.app/cursor/${boardId}?userId=${userId}&userName=${userName}`
);
```

## Performance

- **Latency:** <10ms (local network)
- **Throughput:** 1000+ messages/second per room
- **Scalability:** Handles 100+ concurrent users per board

## Monitoring

Check server health:
```bash
curl https://cursor-server.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 12345,
  "rooms": 5,
  "totalUsers": 23
}
```
