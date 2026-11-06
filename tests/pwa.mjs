/**
 * 线上 PWA / 离线 / 边界测试（盘左/盘右 + 距离框）
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
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('dialog', (dialog) => dialog.accept());

async function press(key) {
  await page.click(`#keypad [data-key="${key}"]`);
  await page.waitForTimeout(12);
}

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);

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

await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);

/* 示例 + 汇总 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(200);
check(
  '示例各测回平均 125°14′24″',
  (await page.textContent('#sum-angle')) === '125°14′24″',
  await page.textContent('#sum-angle'),
);
const pwaOneSets = await page.locator('#sum-one-sets .stat-row').allInnerTexts();
check(
  '示例两个一测回角值',
  pwaOneSets.length === 2 && pwaOneSets[0].includes('125°14′21″') && pwaOneSets[1].includes('125°14′27″'),
  JSON.stringify(pwaOneSets),
);
check('示例 A 距离 59.230 m', (await page.textContent('#sum-dist-a')) === '59.230 m');
check('示例 B 距离 114.552 m', (await page.textContent('#sum-dist-b')) === '114.552 m');

/* 离线 */
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const offline = await page.evaluate(() => ({
  title: document.title,
  tabs: document.querySelectorAll('.mode').length,
  body: document.body.innerText.length,
}));
check('离线后仍可打开', offline.tabs === 3 && offline.body > 40, JSON.stringify(offline));
await page.click('#tab-summary');
await page.waitForTimeout(200);
const offlineAngle = await page.textContent('#sum-angle');
const offlineA = await page.textContent('#sum-dist-a');
check('离线后汇总仍可用', offlineAngle === '125°14′24″' && offlineA === '59.230 m', `${offlineAngle} / ${offlineA}`);
await page.click('#tab-left');
await page.waitForTimeout(120);
await page.click('#panel-left .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
await page.waitForTimeout(120);
check('离线后键盘可用', await page.isVisible('#keypad'));
await context.setOffline(false);

/* 边界：非法分 */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('清空后键盘自动打开', await page.isVisible('#keypad'));
await page.click('#panel-left .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
await press('0');
await press('next');
await press('6');
await press('0');
await page.waitForTimeout(120);
check(
  '分=60 标红且不参与计算',
  (await page.locator('#panel-left .cell.invalid').count()) >= 1,
  String(await page.locator('#panel-left .cell.invalid').count()),
);

/* 布局 */
for (const width of [360, 430, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(`${width}px 无横向溢出`, overflow);
}

/* 资源 */
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
