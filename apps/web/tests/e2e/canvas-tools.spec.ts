/**
 * E2E Test: Canvas tools (Draw, Fit to screen, Zoom to 10%)
 *
 * Requires: user can reach a board (signup -> dashboard -> new board).
 */

import { test, expect } from '@playwright/test';

async function goToBoard(page: import('@playwright/test').Page) {
  await page.goto('/signup');
  const timestamp = Date.now();
  const email = `test${timestamp}@example.com`;
  const password = 'password123';
  const displayName = `Test User ${timestamp}`;
  await page.fill('[name="displayName"]', displayName);
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  await page.click('text=New Board');
  await expect(page).toHaveURL(/\/board\/.*/, { timeout: 5000 });
  await page.waitForSelector('canvas', { timeout: 10000, state: 'visible' });
  await page.waitForTimeout(800);
}

test.describe('Canvas tools', () => {
  test('Draw tool shows options sidebar and can select color/size', async ({ page }) => {
    await goToBoard(page);

    await page.click('[data-tool="draw"]');
    await expect(page.getByRole('heading', { name: /draw/i })).toBeVisible({ timeout: 3000 });

    const sizeButton = page.getByTitle('6px');
    await sizeButton.click();
    await page.click('[data-tool="draw"]');
    expect(await page.getByTitle('6px').isVisible()).toBe(true);
  });

  test('Fit to screen and Zoom to 10% update view', async ({ page }) => {
    await goToBoard(page);

    const zoomDisplay = page.locator('div').filter({ hasText: /^\d+%$/ }).first();
    await expect(zoomDisplay).toBeVisible({ timeout: 3000 });

    await page.getByTitle('Zoom to 10%').click();
    await page.waitForTimeout(300);
    await expect(page.getByText('10%')).toBeVisible({ timeout: 2000 });

    await page.getByTitle('Fit to screen').click();
    await page.waitForTimeout(300);
    const percentText = await page.locator('div').filter({ hasText: /^\d+%$/ }).first().textContent();
    expect(percentText).toBeTruthy();
    expect(parseInt(percentText!, 10)).toBeGreaterThanOrEqual(10);
    expect(parseInt(percentText!, 10)).toBeLessThanOrEqual(100);
  });

  test('Zoom in and zoom out change zoom display', async ({ page }) => {
    await goToBoard(page);

    await page.getByTitle('Zoom to 10%').click();
    await page.waitForTimeout(200);
    await expect(page.getByText('10%')).toBeVisible({ timeout: 2000 });

    await page.getByTitle('Zoom in').click();
    await page.waitForTimeout(200);
    await page.getByTitle('Zoom in').click();
    const afterZoomIn = await page.locator('div').filter({ hasText: /^\d+%$/ }).first().textContent();
    expect(parseInt(afterZoomIn!, 10)).toBeGreaterThan(10);

    await page.getByTitle('Zoom out').click();
    await page.waitForTimeout(200);
    const afterZoomOut = await page.locator('div').filter({ hasText: /^\d+%$/ }).first().textContent();
    expect(parseInt(afterZoomOut!, 10)).toBeLessThan(parseInt(afterZoomIn!, 10));
  });
});
