# Testing the Offline System - Step by Step Guide

## 🎯 Goal
Test that offline editing + page refresh works correctly

## ⚠️ Important: Service Worker Requires Initial Online Visit

**The service worker MUST be registered while online before offline mode works.**

This is how ALL web apps work (Gmail, Google Docs, etc.). You can't access a website you've never visited before while offline.

## 📝 Testing Steps

### Step 1: Clear Everything (Fresh Start)
```
1. Open Chrome DevTools (F12)
2. Go to Application tab
3. Clear Storage:
   - Click "Clear site data" button
   - This removes old service workers and cache
4. Close DevTools
5. Refresh page (Ctrl+R or Cmd+R)
```

### Step 2: First Visit (Online) - Register Service Worker
```
1. Make sure you're ONLINE
2. Go to: http://localhost:3000/board/[your-board-id]
3. Open Console (F12 → Console tab)
4. Wait for these logs:
   ✓ [SW] Service worker registered: /
   ✓ [SW] Caching app shell
5. Let the page fully load (wait 3-5 seconds)
```

**✅ Service worker is now active and page is cached!**

### Step 3: Test Offline Editing
```
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox (top of Network tab)
4. Verify you're offline:
   - Yellow banner should appear if connection was active
   - Network tab shows "Offline" in red
5. Create 2-3 objects on canvas:
   - Add sticky notes
   - Draw shapes
   - Move objects around
6. Check Console for these logs:
   ✓ [OfflineQueue] Saved update for board xxx (123 bytes)
   ✓ [OfflineQueue] Saved update for board xxx (456 bytes)
```

**✅ Your edits are saved to IndexedDB!**

### Step 4: Test Page Refresh While Offline (KEY TEST)
```
1. Still offline (checkbox still checked)
2. Press F5 or Ctrl+R (Cmd+R on Mac) to refresh
3. Page should load successfully (from service worker cache)
4. Check Console for recovery logs:
   ✓ [SW] Fetch from cache: /board/...
   ✓ [OfflineQueue] Found 3 pending updates from previous session
   ✓ [Yjs] Applied pending update from 10:15:23 AM
   ✓ [Yjs] Applied pending update from 10:15:24 AM
5. Check for recovery banner at top:
   🔄 Recovering 3 unsaved changes from previous session
6. Verify objects are still on canvas
```

**✅ Page loaded offline! Edits recovered!**

### Step 5: Test Reconnect & Sync
```
1. Uncheck "Offline" in Network tab
2. You're now online again
3. Check Console for sync logs:
   ✓ [Yjs] Reconnected - syncing 3 pending updates
   ✓ [OfflineQueue] Marked updates as synced for board xxx
   ✓ [OfflineQueue] Cleared synced updates for board xxx
   ✓ [Yjs] All pending updates synced and cleared
4. Check for success banner:
   ✅ All changes synced successfully!
5. Refresh page (F5) - objects should persist
```

**✅ All changes synced to server!**

## 🚨 Troubleshooting

### Problem: "ERR_INTERNET_DISCONNECTED" when refreshing offline

**Cause:** You went offline BEFORE visiting the page online (Step 2 skipped)

**Solution:** 
1. Go back online
2. Visit the board (Step 2)
3. Wait for service worker to register
4. Then go offline and try again

### Problem: Service worker not registering

**Check:**
```javascript
// In browser console:
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs);
});
```

**If empty array:**
- Service worker failed to register
- Check Console for errors
- Make sure you're on http://localhost:3000 (not a different port)

**Fix:**
1. Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
2. Check /sw.js is accessible: http://localhost:3000/sw.js
3. Check Console for [SW] registration logs

### Problem: Edits not recovered after refresh

**Check IndexedDB:**
```
1. DevTools → Application tab
2. IndexedDB → collab-board-offline → pending-updates
3. Should see entries for your board
```

**If empty:**
- Edits weren't saved (check Console for errors)
- Run test again from Step 3

**If has entries but not recovered:**
- Check Console for errors during page load
- Look for "[OfflineQueue] Failed to apply pending update"

### Problem: Changes not syncing when going online

**Check:**
1. Console should show "[Yjs] Reconnected"
2. If not, check WebSocket connection
3. Make sure server is running (npm run dev in server folder)

## ✅ Success Criteria

Your offline system works if:
- ✅ Page loads offline after initial online visit
- ✅ Edits made offline are visible after refresh
- ✅ Recovery banner shows correct count
- ✅ Changes sync automatically when reconnecting
- ✅ No errors in Console

## 📊 Expected Console Output

### On First Visit (Online)
```
[SW] Service worker registered: /
[SW] Caching app shell
[Yjs] Applied preloaded snapshot for board xxx
[Yjs] Connected successfully
```

### While Offline (Making Edits)
```
[OfflineQueue] Saved update for board xxx (234 bytes)
[OfflineQueue] Saved update for board xxx (567 bytes)
[OfflineQueue] Saved update for board xxx (123 bytes)
```

### After Refresh (Still Offline)
```
[SW] Fetch from cache: /board/...
[OfflineQueue] Found 3 pending updates from previous session
[Yjs] Applied pending update from 10:15:23 AM
[Yjs] Applied pending update from 10:15:24 AM
[Yjs] Applied pending update from 10:15:25 AM
```

### When Reconnecting
```
[Yjs] Reconnected - syncing 3 pending updates
[OfflineQueue] Marked updates as synced for board xxx
[OfflineQueue] Cleared synced updates for board xxx
[Yjs] All pending updates synced and cleared
```

## 🎓 Understanding What's Happening

1. **Service Worker** = Caches the HTML/JS/CSS so page loads offline
2. **IndexedDB** = Stores your edits (the actual changes you made)
3. **Recovery** = Applies saved edits from IndexedDB when page loads
4. **Sync** = Sends accumulated edits to server when reconnected

All four pieces work together to give you seamless offline editing!

## 🔄 Quick Test Commands (Browser Console)

```javascript
// Check service worker status
navigator.serviceWorker.getRegistrations().then(r => console.log('SW:', r));

// Check pending updates count
indexedDB.open('collab-board-offline', 1).onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('pending-updates', 'readonly');
  const count = tx.objectStore('pending-updates').count();
  count.onsuccess = () => console.log('Pending updates:', count.result);
};

// Clear all offline data (reset)
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => r.unregister());
  indexedDB.deleteDatabase('collab-board-offline');
  console.log('Cleared all offline data');
});
```
