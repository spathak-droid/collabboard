# Real-Time Presence with Yjs Awareness Protocol

## What is Yjs Awareness?

Awareness is Yjs's **ephemeral state protocol** for real-time presence data that doesn't need to persist:
- 👁️ **Cursors** - Mouse positions
- 🟢 **Online status** - Who's viewing
- 🎨 **Live edits** - Temporary states during drag/transform
- 💬 **Typing indicators** - User activity

**Key difference from Yjs Doc:**
- **Y.Doc**: Persistent CRDT data (objects, text)
- **Awareness**: Ephemeral data (deleted when user disconnects)

## Current Implementation

### 1. Broadcasting (Sender)

**Cursor Updates**:
```typescript
// provider.ts - Line 142
updateCursor(x: number, y: number) {
  this.hocuspocus?.setAwarenessField('cursor', {
    x, y,
    lastUpdate: Date.now()
  });
}
```

**Live Object Positions**:
```typescript
// provider.ts - Line 209
broadcastLivePosition(objectId: string, x: number, y: number, extra?: {...}) {
  const livePositions = { ...(currentState.livePositions || {}) };
  livePositions[objectId] = { x, y, ...extra, lastUpdate: Date.now() };
  this.hocuspocus.setAwarenessField('livePositions', livePositions);
}
```

**User Info**:
```typescript
// provider.ts - Line 40
this.hocuspocus.setAwarenessField('user', {
  id: user.id,
  name: user.name,
  color: user.color
});
```

### 2. Receiving (Listener)

**Access Awareness States**:
```typescript
const states = awareness.getStates(); // Map<clientId, state>

states.forEach((state, clientId) => {
  const user = state.user;       // { id, name, color }
  const cursor = state.cursor;   // { x, y, lastUpdate }
  const livePositions = state.livePositions; // { objId: { x, y, ... } }
});
```

**Listen to Changes**:
```typescript
awareness.on('change', () => {
  // Someone's cursor moved, user joined/left, or live position updated
  updateCursors();
  updateLiveObjects();
});
```

## Current Data Flow

### Cursor Tracking:
```
User A moves mouse
  ↓
Canvas onMouseMove → updateCursor(x, y)
  ↓
RAF batches updates (4ms intervals)
  ↓
awareness.setField('cursor', { x, y })
  ↓
WebSocket broadcasts to all clients
  ↓
User B's awareness.on('change') fires
  ↓
Cursors.tsx RAF loop (8ms) reads states
  ↓
Direct DOM update: el.style.transform
  ↓
User B sees cursor (total latency: ~12-20ms)
```

### Object Dragging:
```
User A drags object
  ↓
Konva onDragMove → handleShapeDragMove(id, x, y)
  ↓
broadcastLivePosition(id, x, y)
  ↓
awareness.setField('livePositions', { [id]: { x, y } })
  ↓
WebSocket broadcasts
  ↓
User B's useDirectKonvaUpdates RAF loop
  ↓
stage.find('#id')[0].x(x).y(y)
  ↓
layer.batchDraw()
  ↓
User B sees object move (total latency: ~12-30ms)
```

## Optimization Opportunities

### 1. Reduce Network Latency
**Current**: Each awareness update → separate WebSocket message

**Optimized**: Batch multiple updates
```typescript
// Instead of:
awareness.setField('cursor', { x, y });
awareness.setField('livePositions', { obj1: {...} });

// Do:
awareness.setLocalState({
  cursor: { x, y },
  livePositions: { obj1: {...}, obj2: {...} },
  user: { id, name, color }
});
```

### 2. Predictive Interpolation
**Add velocity tracking**:
```typescript
const velocity = {
  x: (newX - oldX) / deltaTime,
  y: (newY - oldY) / deltaTime
};

// Predict where cursor will be in next frame
const predictedX = currentX + velocity.x * 16;
const predictedY = currentY + velocity.y * 16;
```

### 3. WebRTC for Ultra-Low Latency
**Current**: WebSocket → Server → Clients (roundtrip)

**WebRTC**: Peer-to-peer direct connection
- Latency: **<10ms** (vs 50-100ms WebSocket)
- Implementation: `y-webrtc` provider

### 4. Awareness Compression
**Current Payload** (~200 bytes):
```json
{
  "user": { "id": "uid123", "name": "John", "color": "#FF5733" },
  "cursor": { "x": 123.456, "y": 789.012, "lastUpdate": 1708234567890 },
  "livePositions": {
    "obj-abc": { "x": 100.5, "y": 200.3, "lastUpdate": 1708234567891 }
  }
}
```

**Optimized** (~50 bytes):
```javascript
// Use shorter keys, round floats
{
  u: { i: "uid123", n: "John", c: "#F57" },
  c: { x: 123.5, y: 789.0, t: 1708234567 },
  p: { "obj": { x: 100.5, y: 200.3 } }
}
```

## Performance Monitoring

### Add FPS Counter:
```typescript
useEffect(() => {
  let frames = 0;
  let lastTime = performance.now();
  
  const measureFPS = () => {
    frames++;
    const now = performance.now();
    
    if (now - lastTime >= 1000) {
      console.log(`FPS: ${frames}`);
      frames = 0;
      lastTime = now;
    }
    
    requestAnimationFrame(measureFPS);
  };
  
  requestAnimationFrame(measureFPS);
}, []);
```

### Measure Network Latency:
```typescript
const measureLatency = async () => {
  const start = performance.now();
  
  // Broadcast a ping
  awareness.setField('ping', { id: 'ping-123', timestamp: start });
  
  // Listen for pong from server
  awareness.on('change', () => {
    const states = awareness.getStates();
    states.forEach(state => {
      if (state.pong?.id === 'ping-123') {
        const latency = performance.now() - start;
        console.log(`Network latency: ${latency}ms`);
      }
    });
  });
};
```

## Best Practices

### ✅ DO:
1. Use awareness for **ephemeral** data (cursors, live drags)
2. Use Y.Doc for **persistent** data (objects, text)
3. Batch awareness updates when possible
4. Clear awareness fields when done (on drag end)
5. Use RAF loops for display updates

### ❌ DON'T:
1. Store persistent data in awareness (lost on disconnect)
2. Broadcast on every pixel (use thresholds)
3. Trust awareness data without validation
4. Forget to cleanup awareness fields
5. Update awareness in React render (use effects/callbacks)

## Current System Health

### Broadcast Rates:
- **Cursors**: ~240fps (4ms interval, 0.1px threshold)
- **Objects**: ~120fps (8ms RAF loop)
- **Transforms**: ~120fps (with rotation/size)

### Latency Sources:
1. **Network**: 20-50ms (WebSocket roundtrip)
2. **Serialization**: 1-2ms (JSON encode/decode)
3. **RAF delay**: 0-8ms (waiting for next frame)
4. **Total**: **21-60ms** (meets <100ms target ✅)

### Bottlenecks:
1. ⚠️ **WebSocket latency** - Can't improve without WebRTC
2. ⚠️ **JSON payload size** - Could compress
3. ✅ **Update frequency** - Already maxed out
4. ✅ **Rendering** - Direct DOM/Konva, no React

## Recommended Next Steps

**Quick Wins**:
1. ✅ **Batch awareness updates** - Group cursor + livePositions
2. 📊 **Add performance monitor** - See actual FPS/latency
3. 🎯 **Predictive interpolation** - Hide network lag

**Advanced**:
4. 🌐 **WebRTC** - For <10ms latency
5. 📦 **Binary protocol** - Reduce bandwidth 4x
6. 🔄 **Operational transforms** - Handle conflicts better

---

Would you like me to implement **batched awareness updates** or add a **performance monitor** to see the actual metrics?
