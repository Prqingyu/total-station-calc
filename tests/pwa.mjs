/**
 * 线上 PWA / 离线 / 剪贴板 / 边界提示测试
 *   node tests/pwa.mjs
 */
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const URL_ = process.env.BASE_URL || 'https://prqingyu.github.io/total-station-calc/';
const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) errors.push(name + (detail ? ` — ${detail}` : ''));
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'allow',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(URL_, { waitUntil: 'networkidle' });

/* service worker */
const swState = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  for (let i = 0; i < 50; i += 1) {
    if (reg.active && reg.active.state === 'activated') return 'activated';
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return reg.active ? reg.active.state : 'no-active';
});
check('Service Worker 激活', swState === 'activated', String(swState));

/* 等控制器接管后刷新一次，确保离线缓存完整 */
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

/* 示例数据 + 复制结果 */
await page.click('#btn-demo');
await page.waitForTimeout(400);
await page.click('#tab-summary');
await page.waitForTimeout(300);
await page.click('#btn-copy');
await page.waitForTimeout(400);
const clip = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    return `ERROR:${error}`;
  }
});
check(
  '复制文本含各测回平均值 125°14′24″',
  clip.includes('125°14′24″'),
  clip.slice(0, 200),
);
check('复制文本含盘左/盘右', clip.includes('盘左') && clip.includes('盘右'));
check('复制文本含距离 59.230', clip.includes('59.230'));

/* 离线刷新 */
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const offlineOk = await page.evaluate(() => {
  const title = document.title;
  const tabs = document.querySelectorAll('.tab').length;
  return { title, tabs, body: document.body.innerText.length };
});
check('离线后页面仍可打开', offlineOk.tabs === 4 && offlineOk.body > 200, JSON.stringify(offlineOk));
await page.click('#tab-left');
await page.waitForTimeout(200);
const offlineCalc = await page.textContent('#panel-left .result-value');
check('离线后计算仍可用', offlineCalc === '125°14′21″', offlineCalc);
await context.setOffline(false);

/* 边界：非法输入 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.click('#tab-left');
const round1 = page.locator('#panel-left .round').nth(0);
const inputs = round1.locator('.reading[data-reading="a"] input');
await inputs.nth(0).fill('0');
await inputs.nth(1).fill('0');
await inputs.nth(2).fill('0');
const bInputs = round1.locator('.reading[data-reading="b"] input');
await bInputs.nth(0).fill('0');
await bInputs.nth(1).fill('60');
await bInputs.nth(2).fill('0');
await page.waitForTimeout(250);
check(
  '分=60 被判为非法（标红/角值 —）',
  (await round1.locator('.reading[data-reading="b"].invalid').count()) === 1,
  await page.textContent('#panel-left .result-value'),
);

/* 边界：角值 >180° 提示 */
await bInputs.nth(1).fill('0');
await bInputs.nth(0).fill('200');
await page.waitForTimeout(250);
check(
  '角值 >180° 显示提示',
  await round1.locator('.round-warn').isVisible(),
  await round1.locator('.round-foot output').innerText(),
);

/* 桌面/小屏布局 */
for (const width of [360, 430, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(`${width}px 无横向溢出`, overflow);
}

/* PWA 静态资源状态 */
const assets = await page.evaluate(async () => {
  const list = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'sw.js'];
  const out = {};
  for (const item of list) {
    try {
      const res = await fetch(item);
      out[item] = res.status;
    } catch (error) {
      out[item] = String(error);
    }
  }
  return out;
});
check(
  'PWA 清单与资源可访问',
  Object.values(assets).every((status) => status === 200),
  JSON.stringify(assets),
);

await browser.close();
const summary = {
  url: URL_,
  time: new Date().toISOString(),
  checks: results.length,
  failed: results.filter((item) => !item.ok).length,
  errors,
  results,
};
await writeFile('shots/pwa-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
