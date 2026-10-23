import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:3250 ...');
  await page.goto('http://127.0.0.1:3250', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Main Kiosk View
  console.log('Capturing 01-main-kiosk.png ...');
  await page.screenshot({ path: path.join(outDir, '01-main-kiosk.png') });

  // 2. Open Settings Drawer
  console.log('Opening settings ...');
  const gearBtn = page.locator('.settings-toggle').first();
  await gearBtn.click();
  await page.waitForTimeout(700);

  console.log('Capturing 02-settings-drawer-top.png ...');
  await page.screenshot({ path: path.join(outDir, '02-settings-drawer-top.png') });

  // Scroll settings drawer to bottom
  await page.evaluate(() => {
    const el = document.querySelector('#library-content');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(600);
  console.log('Capturing 03-settings-drawer-bottom.png ...');
  await page.screenshot({ path: path.join(outDir, '03-settings-drawer-bottom.png') });

  // 3. Open Presentation Mode by selecting the presentation
  console.log('Selecting deck via "Open presentation" ...');
  await page.evaluate(() => {
    const el = document.querySelector('#library-content');
    if (el) el.scrollTop = 200;
  });
  await page.waitForTimeout(400);

  const openPresentationBtn = page.locator('button:has-text("Open presentation")').first();
  if (await openPresentationBtn.isVisible()) {
    await openPresentationBtn.click();
    await page.waitForTimeout(1200);
  } else {
    // If already in presentation mode, close dialog
    const closeBtn = page.locator('button[aria-label="Close settings"]').first();
    await closeBtn.click();
    await page.waitForTimeout(500);
    const slidesBtn = page.locator('button:has-text("Slides")').first();
    if (await slidesBtn.isVisible()) {
      await slidesBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // 4. Capture Presentation Mode
  console.log('Capturing 04-presentation-mode.png ...');
  await page.screenshot({ path: path.join(outDir, '04-presentation-mode.png') });

  // 5. Open Script Editor
  console.log('Opening Script Editor ...');
  const viewScriptBtn = page.locator('[data-testid="view-script"]').first();
  if (await viewScriptBtn.isVisible()) {
    await viewScriptBtn.click();
    await page.waitForTimeout(1200);
    console.log('Capturing 05-script-editor.png ...');
    await page.screenshot({ path: path.join(outDir, '05-script-editor.png') });

    const closeScriptBtn = page.locator('button[aria-label="Close script editor"]').first();
    if (await closeScriptBtn.isVisible()) {
      await closeScriptBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
  } else {
    console.warn('View script button not visible');
  }

  // 6. Presentation Ask a Question Overlay
  console.log('Opening Ask a question overlay ...');
  const askBtn = page.locator('[data-testid="presentation-question"]').first();
  if (await askBtn.isVisible()) {
    await askBtn.click();
    await page.waitForTimeout(800);
    console.log('Capturing 06-presentation-ask-overlay.png ...');
    await page.screenshot({ path: path.join(outDir, '06-presentation-ask-overlay.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 7. Mobile View
  console.log('Capturing mobile view ...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://127.0.0.1:3250', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1000);
  console.log('Capturing 07-mobile-kiosk.png ...');
  await mobilePage.screenshot({ path: path.join(outDir, '07-mobile-kiosk.png') });

  await browser.close();
  console.log('All screenshots captured successfully.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
