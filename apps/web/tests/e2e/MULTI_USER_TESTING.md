# Multi-User Playwright Testing

## The "Half Visible" Issue

When running Playwright tests with multiple windows, you might see the canvas appearing small with lots of white space. This happens because:

1. **Auto-fit zoom**: The board automatically zooms to fit all objects. If objects are spread far apart, the zoom becomes very small (zoomed way out)
2. **Canvas initialization timing**: The canvas might not fully size itself before Playwright takes control
3. **Window sizing**: Multiple windows might not get proper viewport dimensions

## Solution

Use the improved `multi-user-test.js` script which:

- ✅ Sets proper viewport size (1200x800)
- ✅ Waits for canvas to be fully loaded (`networkidle`)
- ✅ Adds a 500ms delay for canvas to size itself
- ✅ Debugs canvas dimensions to identify issues
- ✅ Warns if canvas is too small

## Usage

```bash
# Run from apps/web directory
node tests/e2e/multi-user-test.js

# Customize number of users
USERS=4 node tests/e2e/multi-user-test.js

# Test specific board
URL=http://localhost:3000/board/abc-123 node tests/e2e/multi-user-test.js
```

## Troubleshooting

### Canvas is too small
**Problem**: Canvas shows as 300x150 or other small dimensions
**Cause**: Canvas not initialized before Playwright takes control
**Fix**: The script already adds waits. If still failing, increase timeout in line 58

### Objects appear tiny (zoomed out)
**Problem**: You see objects but they're very small with lots of white space
**Cause**: Auto-fit feature is zooming out to fit all objects
**Solution**: 
- Use scroll wheel to zoom in manually
- Create objects closer together
- Consider disabling auto-fit for tests (see below)

### Windows overlap
**Problem**: All windows stack on top of each other
**Cause**: OS window management doesn't support positioning
**Fix**: Manually tile the windows after they open (not much we can do programmatically)

## Disabling Auto-Fit for Tests (Optional)

If you want the board to always start at a fixed zoom level for tests:

1. Add a query parameter check in `apps/web/src/app/board/[id]/page.tsx`:

```typescript
// Around line 249, modify the auto-fit useEffect:
useEffect(() => {
  if (hasAutoFittedRef.current || !mounted) return;
  
  // Check if auto-fit is disabled (useful for tests)
  const params = new URLSearchParams(window.location.search);
  const disableAutoFit = params.get('noAutoFit') === 'true';
  
  if (disableAutoFit) {
    setScale(1.0);  // Fixed zoom level
    setPosition({ x: 0, y: 0 });
    hasAutoFittedRef.current = true;
    return;
  }
  
  // ... rest of auto-fit logic
}, [objects.length, mounted, setScale, setPosition]);
```

2. Then use: `URL=http://localhost:3000/board/abc-123?noAutoFit=true node tests/e2e/multi-user-test.js`

## Updated Playwright Config

The `playwright.config.ts` now includes:
- Explicit viewport size: 1920x1080
- Longer webServer timeout: 120s
- Screenshots on failure

## Tips for Better Testing

1. **Start with an empty board**: Create a fresh board before running multi-user tests
2. **Use smaller zoom levels**: If objects appear tiny, manually zoom in (scroll wheel)
3. **Place objects near center**: Create objects near (0, 0) so auto-fit doesn't zoom out too much
4. **Wait for sync**: After creating objects, wait ~200ms for them to sync to other users
5. **Check console**: Each user window will log canvas dimensions - check if they're correct
