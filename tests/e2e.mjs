/**
 * 移动端端到端测试（本地 / 线上均可）
 *   node tests/e2e.mjs                 # 默认本地 http://127.0.0.1:8787/
 *   BASE_URL=https://... node tests/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787/';
const EDGE =
  process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = path.resolve('shots');
const LIVE = Boolean(process.env.BASE_URL);

await mkdir(OUT, { recursive: true });

const results = [];
const errors = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) errors.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  isMobile: true,
  hasTouch: true,
  serviceWorkers: LIVE ? 'allow' : 'block',
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

check('标题正确', (await page.title()).includes('测回计算器'));
check('三个模式 + 汇总导航可见', (await page.locator('.tab').count()) === 4);

await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-01-left-empty.png` });

/* ---------- 示例数据 ---------- */
await page.click('#btn-demo');
await page.waitForTimeout(250);

check(
  '盘左平均 = 125°14′21″',
  (await page.textContent('#panel-left .result-value')) === '125°14′21″',
  await page.textContent('#panel-left .result-value'),
);
check(
  '盘左第 1 测回半测回 = 125°14′18″',
  (await page.textContent('#panel-left .round:nth-child(1) .round-foot output')) === '125°14′18″',
  await page.textContent('#panel-left .round:nth-child(1) .round-foot output'),
);
check(
  '盘左第 2 测回半测回 = 125°14′24″',
  (await page.textContent('#panel-left .round:nth-child(2) .round-foot output')) === '125°14′24″',
);

await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-02-left-demo.png` });

await page.click('#tab-right');
await page.waitForTimeout(180);
check(
  '盘右平均 = 125°14′27″',
  (await page.textContent('#panel-right .result-value')) === '125°14′27″',
  await page.textContent('#panel-right .result-value'),
);
await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-03-right-demo.png` });

await page.click('#tab-summary');
await page.waitForTimeout(180);
check(
  '汇总各测回平均 = 125°14′24″',
  (await page.textContent('#sum-final')) === '125°14′24″',
  await page.textContent('#sum-final'),
);
check('半测回互差 = 6″', (await page.textContent('#sum-diff')) === '6″', await page.textContent('#sum-diff'));
check('盘左/盘右平均', (await page.textContent('#sum-left')) === '125°14′21″' && (await page.textContent('#sum-right')) === '125°14′27″');
const distTexts = await page.locator('#sum-dist .sum-dist-row').allInnerTexts();
check('距离均值行数 = 2', distTexts.length === 2, JSON.stringify(distTexts));
check('GCP2→GCP1 均值 59.230 m', distTexts[0]?.includes('59.230 m'), distTexts[0]);
check('GCP2→GCP3 均值 114.552 m', distTexts[1]?.includes('114.552 m'), distTexts[1]);
await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-04-summary.png`, fullPage: true });

/* ---------- 距离模式 ---------- */
await page.click('#tab-dist');
await page.waitForTimeout(180);
const distOut = await page.textContent('#panel-dist .group:nth-child(1) .dist-out');
check('距离模式第一组均值 59.230', distOut === '59.230', distOut);
// 追加一条 59.232 → 五条平均 59.2308 → 取整 59.231
await page.click('#panel-dist .group:nth-child(1) .add-item');
const lastItem = page.locator('#panel-dist .group:nth-child(1) .dist-item input').last();
await lastItem.fill('59.232');
await page.waitForTimeout(150);
check(
  '距离追加后均值 59.231（四舍六入五成双/就近）',
  (await page.textContent('#panel-dist .group:nth-child(1) .dist-out')) === '59.231',
  await page.textContent('#panel-dist .group:nth-child(1) .dist-out'),
);
await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-05-distance.png` });

/* ---------- 直接输角值模式 ---------- */
await page.click('#tab-left');
await page.click('#panel-left [data-mode="angles"]');
await page.waitForTimeout(150);
const angleInputs = page.locator('#panel-left .reading[data-reading="angle"] input');
await angleInputs.nth(0).fill('125');
await angleInputs.nth(1).fill('14');
await angleInputs.nth(2).fill('21');
const round2 = page.locator('#panel-left .round').nth(1);
await round2.locator('.reading[data-reading="angle"] input').nth(0).fill('125');
await round2.locator('.reading[data-reading="angle"] input').nth(1).fill('14');
await round2.locator('.reading[data-reading="angle"] input').nth(2).fill('27');
await page.waitForTimeout(150);
check(
  '直接输角值平均 = 125°14′24″',
  (await page.textContent('#panel-left .result-value')) === '125°14′24″',
  await page.textContent('#panel-left .result-value'),
);
await page.click('#panel-left [data-mode="readings"]');
await page.waitForTimeout(150);
check(
  '切回读数模式仍为 125°14′21″',
  (await page.textContent('#panel-left .result-value')) === '125°14′21″',
  await page.textContent('#panel-left .result-value'),
);

/* ---------- 刷新持久化 ---------- */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(180);
check(
  '刷新后数据保留，各测回平均仍为 125°14′24″',
  (await page.textContent('#sum-final')) === '125°14′24″',
  await page.textContent('#sum-final'),
);

/* ---------- 说明抽屉 ---------- */
await page.click('#btn-help');
await page.waitForTimeout(200);
check('说明抽屉可打开', await page.isVisible('#help-sheet'));
await page.screenshot({ path: `${OUT}/${LIVE ? 'live' : 'local'}-06-help.png` });
await page.click('#btn-sheet-close');
await page.waitForTimeout(150);
check('说明抽屉可关闭', !(await page.isVisible('#help-sheet')));

/* ---------- 布局与静态资源 ---------- */
const layout = await page.evaluate(() => ({
  innerWidth: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
}));
check('无横向溢出', layout.scrollWidth <= layout.innerWidth + 1, JSON.stringify(layout));

const assetStatus = await page.evaluate(async () => {
  const urls = [
    'manifest.webmanifest',
    'style.css',
    'app.js',
    'calc.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/icon-180.png',
    'sw.js',
  ];
  const out = {};
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      out[url] = res.status;
    } catch (error) {
      out[url] = String(error);
    }
  }
  return out;
});
check(
  '静态资源均可访问',
  Object.values(assetStatus).every((status) => status === 200),
  JSON.stringify(assetStatus),
);

/* ---------- 小屏 / 大屏不溢出 ---------- */
for (const [width, height] of [
  [360, 800],
  [430, 932],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(`${width}px 宽度无横向溢出`, overflow);
}

await browser.close();

const summary = {
  base: BASE,
  time: new Date().toISOString(),
  checks: results.length,
  failed: results.filter((item) => !item.ok).length,
  errors,
  results,
};
await writeFile(`${OUT}/${LIVE ? 'live' : 'local'}-e2e-result.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
