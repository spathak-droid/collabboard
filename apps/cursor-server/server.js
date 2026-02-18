/**
 * Dedicated Cursor Sync WebSocket Server
 * Ultra-low latency cursor broadcasting
 * 
 * Runs independently from Hocuspocus for maximum performance
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

// ── Cursor rooms management ─────────────────────────────────
const cursorRooms = new Map(); // boardId -> Map<userId, {ws, userName}>

// ── HTTP server for health checks ───────────────────────────
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      rooms: cursorRooms.size,
      totalUsers: Array.from(cursorRooms.values()).reduce((sum, room) => sum + room.size, 0)
    }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Cursor Sync Server\n\nConnect: ws://host/cursor/{boardId}?userId={id}&userName={name}');
});

// ── WebSocket server ────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  // Parse connection parameters
  const pathParts = url.pathname.split('/').filter(Boolean);
  const boardId = pathParts[pathParts.length - 1] || 'default';
  const userId = url.searchParams.get('userId') || `anon-${Date.now()}`;
  const userName = url.searchParams.get('userName') || 'Anonymous';
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    handleConnection(ws, boardId, userId, userName);
  });
});

function handleConnection(ws, boardId, userId, userName) {
  // Add user to room
  if (!cursorRooms.has(boardId)) {
    cursorRooms.set(boardId, new Map());
  }
  
  const room = cursorRooms.get(boardId);
  room.set(userId, { ws, userName });
  
  console.log(`🖱️  ${userName} joined board ${boardId} (${room.size} users)`);
  
  // Handle incoming cursor messages
  ws.on('message', (data) => {
    try {
      const message = data.toString();
      const room = cursorRooms.get(boardId);
      
      if (!room) return;
      
      // Broadcast to all users in room except sender
      room.forEach((client, clientUserId) => {
        if (clientUserId !== userId && client.ws.readyState === 1) {
          client.ws.send(message); // Forward as-is for zero latency
        }
      });
    } catch (err) {
      console.error('Message error:', err);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    const room = cursorRooms.get(boardId);
    if (!room) return;
    
    room.delete(userId);
    console.log(`🖱️  ${userName} left board ${boardId} (${room.size} users)`);
    
    // Notify others of user leaving
    const leaveMsg = JSON.stringify({ type: 'leave', userId });
    room.forEach((client) => {
      if (client.ws.readyState === 1) {
        client.ws.send(leaveMsg);
      }
    });
    
    // Clean up empty rooms
    if (room.size === 0) {
      cursorRooms.delete(boardId);
      console.log(`📦 Room ${boardId} cleaned up`);
    }
  });
  
  // Handle errors
  ws.on('error', (err) => {
    console.error(`⚠️  ${userName} error:`, err.message);
  });
}

// ── Start server ────────────────────────────────────────────
const port = parseInt(process.env.PORT || '3000');

httpServer.listen(port, () => {
  console.log('========================================');
  console.log('🚀 Cursor Sync Server Running');
  console.log(`📡 Port: ${port}`);
  console.log(`🖱️  WebSocket: ws://0.0.0.0:${port}/cursor/{boardId}`);
  console.log(`💚 Health: http://0.0.0.0:${port}/health`);
  console.log('========================================');
});

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close all WebSocket connections
  cursorRooms.forEach((room) => {
    room.forEach((client) => {
      client.ws.close();
    });
  });
  
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}
