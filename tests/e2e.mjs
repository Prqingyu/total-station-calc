/**
 * 移动端端到端测试（盘左/盘右 + 距离框 + 数字键盘）
 *   node tests/e2e.mjs
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
page.on('dialog', (dialog) => dialog.accept());

const prefix = LIVE ? 'live' : 'local';

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);

/* ---------- 初始状态 ---------- */
check('三个选项卡', (await page.locator('.mode').count()) === 3);
check('首屏数字键盘打开', await page.isVisible('#keypad'));
check(
  '键盘标题为盘左测回1A读数',
  (await page.textContent('#keypad-caption')) === '盘左 · 测回 1 · A 读数',
  await page.textContent('#keypad-caption'),
);
check('默认两个测回', (await page.locator('#panel-left .round').count()) === 2);
check('盘右也有两个测回', (await page.locator('#panel-right .round').count()) === 2);
check(
  '无小字说明',
  (await page.locator('.result-sub, .panel-head, .record, .face-display, .seg').count()) === 0,
);
await page.screenshot({ path: `${OUT}/${prefix}-01-empty.png` });

/* ---------- 数字键盘输入 ---------- */
async function press(key) {
  await page.click(`#keypad [data-key="${key}"]`);
  await page.waitForTimeout(12);
}

async function typeReading(side, roundIndex, target, d, m, s, dist) {
  await page.click(
    `#panel-${side} .round[data-index="${roundIndex}"] .read-row[data-target="${target}"] .cell[data-part="d"]`,
  );
  const degree = String(d);
  for (const char of degree) await press(char);
  if (degree.length < 3) await press('next');
  for (const char of String(m).padStart(2, '0')) await press(char);
  for (const char of String(s).padStart(2, '0')) await press(char);
  for (const char of String(dist)) await press(char === '.' ? 'dot' : char);
  await press('next');
}

/* 第一个读数：秒满后应自动进入距离 */
await page.click('#panel-left .round[data-index="0"] .read-row[data-target="a"] .cell[data-part="d"]');
await press('0');
await press('next');
await press('2');
await press('0');
await press('4');
await press('2');
await page.waitForTimeout(80);
check(
  '秒满自动跳到距离框',
  (await page.textContent('#keypad-caption')) === '盘左 · 测回 1 · A 距离',
  await page.textContent('#keypad-caption'),
);
for (const char of '59.230') await press(char === '.' ? 'dot' : char);
await press('next');
await typeReading('left', 0, 'b', 125, 35, 0, '114.552');
await typeReading('left', 1, 'a', 90, 11, 36, '59.231');
await typeReading('left', 1, 'b', 215, 26, 0, '114.553');
await page.waitForTimeout(150);
const leftValues = await page.evaluate(() => ({
  a: document.querySelector('#panel-left .round[data-index="0"] .read-row[data-target="a"]').innerText,
  dist: document.querySelector('#panel-left .round[data-index="0"] .read-row[data-target="a"] .dist-val').textContent,
}));
check('盘左第 1 测回读数 A 完整', leftValues.a.includes('0') && leftValues.a.includes('20') && leftValues.a.includes('42'), leftValues.a);
check('距离框显示 59.230', leftValues.dist === '59.230', leftValues.dist);
check(
  '盘左第 1 测回半测回角值 125°14′18″',
  (await page.textContent('#panel-left .round[data-index="0"] .round-angle')) === '125°14′18″',
  await page.textContent('#panel-left .round[data-index="0"] .round-angle'),
);
await page.screenshot({ path: `${OUT}/${prefix}-02-left.png` });

/* 盘右 */
await page.click('#tab-right');
await page.waitForTimeout(150);
await typeReading('right', 0, 'a', 180, 21, 12, '59.230');
await typeReading('right', 0, 'b', 305, 35, 36, '114.551');
await typeReading('right', 1, 'a', 270, 11, 42, '59.231');
await typeReading('right', 1, 'b', 35, 26, 12, '114.553');
await page.waitForTimeout(150);
check(
  '盘右第 1 测回半测回角值 125°14′24″',
  (await page.textContent('#panel-right .round[data-index="0"] .round-angle')) === '125°14′24″',
  await page.textContent('#panel-right .round[data-index="0"] .round-angle'),
);
await page.screenshot({ path: `${OUT}/${prefix}-03-right.png` });

/* 距离不截断 */
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll('.dist-val')].some((el) => el.scrollWidth > el.clientWidth + 1),
);
check('距离数值不截断', !clipped);

/* 增加/删除测回 */
await page.click('#tab-left');
await page.waitForTimeout(120);
await page.click('[data-add="left"]');
await page.waitForTimeout(150);
check('增加测回', (await page.locator('#panel-left .round').count()) === 3);
check('盘右同步增加', (await page.locator('#panel-right .round').count()) === 3);
await page.click('#panel-left .round[data-index="2"] .btn-del');
await page.waitForTimeout(120);
check('删除测回', (await page.locator('#panel-left .round').count()) === 2);

/* 汇总 */
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '各测回平均 125°14′24″',
  (await page.textContent('#sum-angle')) === '125°14′24″',
  await page.textContent('#sum-angle'),
);
const oneSetRows = await page.locator('#sum-one-sets .stat-row').allInnerTexts();
check(
  '汇总两个一测回角值',
  oneSetRows.length === 2 && oneSetRows[0].includes('125°14′21″') && oneSetRows[1].includes('125°14′27″'),
  JSON.stringify(oneSetRows),
);
check('A 距离均值 59.230 m', (await page.textContent('#sum-dist-a')) === '59.230 m', await page.textContent('#sum-dist-a'));
check('B 距离均值 114.552 m', (await page.textContent('#sum-dist-b')) === '114.552 m', await page.textContent('#sum-dist-b'));
check(
  '汇总不显示限差/复制',
  (await page.locator('text=限差').count()) === 0 && (await page.locator('#btn-copy').count()) === 0,
);
await page.screenshot({ path: `${OUT}/${prefix}-04-summary.png` });

/* 刷新持久化 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '刷新后数据保留',
  (await page.textContent('#sum-angle')) === '125°14′24″',
  await page.textContent('#sum-angle'),
);

/* 新建测站 */
await page.click('#btn-new-station');
await page.waitForTimeout(250);
check('新建测站后回到盘左', (await page.textContent('#tab-left')).includes('盘左') && (await page.getAttribute('#tab-left', 'aria-selected')) === 'true');
check('新建测站后两个空测回', (await page.locator('#panel-left .round').count()) === 2);
const emptyCells = await page.evaluate(() =>
  [...document.querySelectorAll('#panel-left .cell-val')].every((el) => el.textContent.trim() === ''),
);
check('新建测站清空读数', emptyCells);
check('新建测站后键盘打开', await page.isVisible('#keypad'));
await page.click('#tab-summary');
await page.waitForTimeout(120);
check('新建测站清空结果', (await page.textContent('#sum-angle')) === '—');

/* 示例 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check('示例各测回平均 125°14′24″', (await page.textContent('#sum-angle')) === '125°14′24″');
check('示例 A 距离 59.230 m', (await page.textContent('#sum-dist-a')) === '59.230 m');
check('示例 B 距离 114.552 m', (await page.textContent('#sum-dist-b')) === '114.552 m');

/* 说明 */
await page.click('#btn-help');
await page.waitForTimeout(200);
check('说明可打开', await page.isVisible('#help-sheet'));
await page.click('#btn-sheet-close');
await page.waitForTimeout(120);
check('说明可关闭', !(await page.isVisible('#help-sheet')));

/* 布局 */
for (const [width, height] of [
  [360, 800],
  [390, 844],
  [430, 932],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(120);
  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  check(`${width}px 无横向溢出`, layout.scrollWidth <= layout.innerWidth + 1, JSON.stringify(layout));
}

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(150);
const desktop = await page.evaluate(() => ({
  appWidth: document.querySelector('#app').getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
}));
check('桌面不破版', desktop.overflow && desktop.appWidth <= 600, JSON.stringify(desktop));
await page.screenshot({ path: `${OUT}/${prefix}-05-desktop.png` });

await browser.close();

const summary = {
  base: BASE,
  time: new Date().toISOString(),
  checks: results.length,
  failed: results.filter((item) => !item.ok).length,
  errors,
  results,
};
await writeFile(`${OUT}/${prefix}-e2e-result.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
