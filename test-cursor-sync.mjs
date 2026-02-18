/**
 * Test script for cursor sync WebSocket
 * Tests the Railway deployed cursor sync endpoint
 */

import { WebSocket } from 'ws';

const SERVER_URL = 'wss://collabboard-server-production.up.railway.app';
const BOARD_ID = 'test-board-123';
const USER1 = { id: 'user1', name: 'Test User 1' };
const USER2 = { id: 'user2', name: 'Test User 2' };

console.log('🧪 Testing Cursor Sync WebSocket...\n');

// Test 1: Single connection
function testSingleConnection() {
  return new Promise((resolve, reject) => {
    console.log('Test 1: Single connection');
    const url = `${SERVER_URL}/cursor/${BOARD_ID}?userId=${USER1.id}&userName=${encodeURIComponent(USER1.name)}`;
    const ws = new WebSocket(url);
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ Connection established');
      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Test 2: Two users messaging
function testTwoUsers() {
  return new Promise((resolve, reject) => {
    console.log('\nTest 2: Two users cursor exchange');
    
    const url1 = `${SERVER_URL}/cursor/${BOARD_ID}?userId=${USER1.id}&userName=${encodeURIComponent(USER1.name)}`;
    const url2 = `${SERVER_URL}/cursor/${BOARD_ID}?userId=${USER2.id}&userName=${encodeURIComponent(USER2.name)}`;
    
    const ws1 = new WebSocket(url1);
    const ws2 = new WebSocket(url2);
    
    let ws1Ready = false;
    let ws2Ready = false;
    let messageReceived = false;
    
    const timeout = setTimeout(() => {
      ws1.close();
      ws2.close();
      reject(new Error('Test timeout'));
    }, 10000);

    ws1.on('open', () => {
      console.log('✅ User 1 connected');
      ws1Ready = true;
      checkAndSend();
    });

    ws2.on('open', () => {
      console.log('✅ User 2 connected');
      ws2Ready = true;
      checkAndSend();
    });

    function checkAndSend() {
      if (ws1Ready && ws2Ready) {
        // User 1 sends cursor position
        const cursorData = {
          type: 'cursor',
          userId: USER1.id,
          userName: USER1.name,
          x: 100,
          y: 200,
          timestamp: Date.now()
        };
        console.log('📤 User 1 sending cursor position:', cursorData);
        ws1.send(JSON.stringify(cursorData));
      }
    }

    ws2.on('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());
      console.log('📥 User 2 received:', message);
      
      if (message.type === 'cursor' && message.userId === USER1.id) {
        messageReceived = true;
        console.log('✅ Cursor sync working! User 2 received User 1\'s cursor');
        ws1.close();
        ws2.close();
        resolve(true);
      }
    });

    ws1.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ User 1 error:', err.message);
      ws1.close();
      ws2.close();
      reject(err);
    });

    ws2.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ User 2 error:', err.message);
      ws1.close();
      ws2.close();
      reject(err);
    });
  });
}

// Test 3: User disconnect notification
function testUserDisconnect() {
  return new Promise((resolve, reject) => {
    console.log('\nTest 3: User disconnect notification');
    
    const url1 = `${SERVER_URL}/cursor/${BOARD_ID}?userId=${USER1.id}&userName=${encodeURIComponent(USER1.name)}`;
    const url2 = `${SERVER_URL}/cursor/${BOARD_ID}?userId=${USER2.id}&userName=${encodeURIComponent(USER2.name)}`;
    
    const ws1 = new WebSocket(url1);
    const ws2 = new WebSocket(url2);
    
    let ws1Ready = false;
    let ws2Ready = false;
    
    const timeout = setTimeout(() => {
      ws1.close();
      ws2.close();
      reject(new Error('Test timeout'));
    }, 10000);

    ws1.on('open', () => {
      console.log('✅ User 1 connected');
      ws1Ready = true;
      checkAndDisconnect();
    });

    ws2.on('open', () => {
      console.log('✅ User 2 connected');
      ws2Ready = true;
      checkAndDisconnect();
    });

    function checkAndDisconnect() {
      if (ws1Ready && ws2Ready) {
        setTimeout(() => {
          console.log('🔌 User 1 disconnecting...');
          ws1.close();
        }, 500);
      }
    }

    ws2.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📥 User 2 received:', message);
      
      if (message.type === 'leave' && message.userId === USER1.id) {
        clearTimeout(timeout);
        console.log('✅ Leave notification working!');
        ws2.close();
        resolve(true);
      }
    });

    ws1.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ User 1 error:', err.message);
      ws2.close();
      reject(err);
    });

    ws2.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ User 2 error:', err.message);
      ws1.close();
      reject(err);
    });
  });
}

// Run all tests
async function runTests() {
  try {
    await testSingleConnection();
    await testTwoUsers();
    await testUserDisconnect();
    
    console.log('\n🎉 All tests passed!');
    console.log('\n✅ Cursor sync is working correctly on Railway');
    console.log('   - Single connections: OK');
    console.log('   - Message broadcasting: OK');
    console.log('   - User leave notifications: OK');
    console.log('   - Latency: Should be <10ms');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
