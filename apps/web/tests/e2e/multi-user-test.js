/**
 * Multi-user collaboration test script
 * Opens multiple browser windows to test real-time sync
 * 
 * Usage:
 *   node tests/e2e/multi-user-test.js
 *   USERS=4 URL=http://localhost:3000/board/your-board-id node tests/e2e/multi-user-test.js
 */

const { chromium } = require('playwright');

const URL = process.env.URL || "http://localhost:3000";
const USERS = Number(process.env.USERS || 6);

// Window positioning helper (offset each window so they don't overlap)
const getWindowPosition = (index, total) => {
  const screenWidth = 1920;
  const screenHeight = 1080;
  const windowWidth = 1200;
  const windowHeight = 800;
  
  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  const offsetX = col * Math.floor(screenWidth / cols);
  const offsetY = row * Math.floor(screenHeight / rows);
  
  return {
    x: offsetX,
    y: offsetY,
    width: Math.min(windowWidth, Math.floor(screenWidth / cols)),
    height: Math.min(windowHeight, Math.floor(screenHeight / rows)),
  };
};

(async () => {
  console.log(`🚀 Launching ${USERS} browser windows...`);
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized'],
  });

  const contexts = [];
  const pages = [];

  for (let i = 0; i < USERS; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 800 },
    });
    const page = await ctx.newPage();

    // Navigate to the board
    console.log(`  👤 User ${i + 1}: Opening ${URL}...`);
    await page.goto(URL, { waitUntil: "networkidle" });

    // Set title to identify each user
    await page.evaluate((n) => {
      document.title = `👤 User ${n} - ` + document.title;
    }, i + 1);

    // Wait for canvas to be fully initialized
    try {
      await page.waitForSelector('canvas', { timeout: 10000, state: 'visible' });
      
      // Give the canvas a moment to properly size itself
      await page.waitForTimeout(500);
      
      // Debug: Check canvas and window dimensions
      const dimensions = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return {
          canvasWidth: canvas?.width || 0,
          canvasHeight: canvas?.height || 0,
          canvasStyleWidth: canvas?.style.width || 'none',
          canvasStyleHeight: canvas?.style.height || 'none',
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
        };
      });
      
      console.log(`    ✓ User ${i + 1}: Canvas loaded`);
      console.log(`       Canvas: ${dimensions.canvasWidth}x${dimensions.canvasHeight}`);
      console.log(`       Window: ${dimensions.windowInnerWidth}x${dimensions.windowInnerHeight}`);
      
      // Check if canvas is too small (indicates a problem)
      if (dimensions.canvasWidth < 800 || dimensions.canvasHeight < 500) {
        console.log(`    ⚠️  Warning: Canvas seems too small!`);
      }
      
    } catch (err) {
      console.log(`    ❌ User ${i + 1}: Canvas failed to load - ${err.message}`);
    }

    contexts.push(ctx);
    pages.push(page);
  }

  console.log(`\n✅ ${USERS} user windows ready!`);
  console.log(`📍 All users are at: ${URL}`);
  console.log(`\n💡 Tips:`);
  console.log(`   - Click any window to control it`);
  console.log(`   - Try creating objects in one window and watch them appear in others`);
  console.log(`   - Use scroll wheel to zoom in/out`);
  console.log(`   - Press Ctrl+C to close all windows and exit\n`);

  // Keep the script running until manually stopped
  await new Promise(() => {});
})();
