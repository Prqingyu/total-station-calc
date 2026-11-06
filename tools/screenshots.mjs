/**
 * 生成展示截图（本地服务器需已启动）
 *   node tools/screenshots.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787/';
const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = path.resolve('shots');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function freshPage({ width = 390, height = 844, dark = false, mobile = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? 'dark' : 'light',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  return { context, page };
}

async function loadDemo(page) {
  await page.click('#btn-demo');
  await page.waitForTimeout(1800); // 等提示条消失
}

/* ---------- 手机亮色 ---------- */
{
  const { context, page } = await freshPage();
  await page.screenshot({ path: `${OUT}/final-00-empty.png` });

  await loadDemo(page);
  await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="d"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/final-01-left.png` });

  await page.click('#keypad-hide');
  await page.click('#tab-right');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/final-02-right.png` });

  await page.click('#tab-dist');
  await page.waitForTimeout(200);
  await page.click('#panel-dist .group[data-gindex="0"] .dist-val');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/final-03-distance.png` });

  await page.click('#keypad-hide');
  await page.click('#tab-summary');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/final-04-summary.png` });

  await page.screenshot({ path: `${OUT}/final-05-summary-full.png`, fullPage: true });
  await page.close();
  await context.close();
}

/* ---------- 说明抽屉 ---------- */
{
  const { context, page } = await freshPage();
  await page.click('#btn-help');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/final-06-help.png` });
  await page.close();
  await context.close();
}

/* ---------- 手机深色 ---------- */
{
  const { context, page } = await freshPage({ dark: true });
  await loadDemo(page);
  await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="m"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/final-07-dark-left.png` });
  await page.click('#keypad-hide');
  await page.click('#tab-summary');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/final-08-dark-summary.png` });
  await page.close();
  await context.close();
}

/* ---------- 桌面 ---------- */
{
  const { context, page } = await freshPage({ width: 1280, height: 900, mobile: false });
  await loadDemo(page);
  await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="d"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/final-09-desktop-left.png` });
  await page.click('#keypad-hide');
  await page.click('#tab-summary');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/final-10-desktop-summary.png` });
  await page.close();
  await context.close();
}

await browser.close();
console.log('screenshots written to', OUT);
