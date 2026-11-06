/**
 * 移动端端到端测试（数字键盘版）
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

/* ---------- 空状态：键盘自动打开 ---------- */
check('首屏数字键盘打开', await page.isVisible('#keypad'));
check(
  '键盘标题为盘左测回1读数A',
  (await page.textContent('#keypad-caption')) === '盘左 · 测回 1 · 读数 A',
  await page.textContent('#keypad-caption'),
);
check(
  '首格自动选中',
  (await page.getAttribute('#panel-left .reading[data-reading="a"] .cell.active', 'data-part')) === 'd',
);
check('无小字说明', (await page.locator('.result-sub, .panel-head, .record').count()) === 0);
await page.screenshot({ path: `${OUT}/${prefix}-01-keypad-empty.png` });

/* ---------- 键盘输入 ---------- */
async function press(key) {
  await page.click(`#keypad [data-key="${key}"]`);
  await page.waitForTimeout(15);
}

async function typeReading(side, roundIndex, role, d, m, s) {
  await page.click(
    `#panel-${side} .round[data-index="${roundIndex}"] .reading[data-reading="${role}"] .cell[data-part="d"]`,
  );
  const degree = String(d);
  for (const char of degree) await press(char);
  if (degree.length < 3) await press('next');
  for (const char of String(m).padStart(2, '0')) await press(char);
  for (const char of String(s).padStart(2, '0')) await press(char);
}

await typeReading('left', 0, 'a', 0, 20, 42);
await page.waitForTimeout(80);
check(
  '输完读数 A 自动跳到读数 B',
  (await page.getAttribute('#panel-left .reading[data-reading="b"] .cell.active', 'data-part')) === 'd',
);
await typeReading('left', 0, 'b', 125, 35, 0);
await page.waitForTimeout(120);
check(
  '第 1 测回角值 125°14′18″',
  (await page.textContent('#panel-left .round[data-index="0"] .round-angle')) === '125°14′18″',
  await page.textContent('#panel-left .round[data-index="0"] .round-angle'),
);
check(
  '盘左平均 125°14′18″',
  (await page.textContent('#panel-left .face-display b')) === '125°14′18″',
  await page.textContent('#panel-left .face-display b'),
);

/* 添加第二测回 */
await page.click('[data-add="left"]');
await page.waitForTimeout(120);
check('添加测回后键盘定位到新测回', await page.isVisible('#keypad'));
await typeReading('left', 1, 'a', 90, 11, 36);
await typeReading('left', 1, 'b', 215, 26, 0);
await page.waitForTimeout(150);
check(
  '盘左两测回平均 125°14′21″',
  (await page.textContent('#panel-left .face-display b')) === '125°14′21″',
  await page.textContent('#panel-left .face-display b'),
);
await page.screenshot({ path: `${OUT}/${prefix}-02-left-keypad.png` });

/* 收起 / 重新打开键盘 */
await page.click('#keypad-hide');
await page.waitForTimeout(100);
check('收起键盘', !(await page.isVisible('#keypad')));
await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="d"]');
await page.waitForTimeout(100);
check('点格子重新打开键盘', await page.isVisible('#keypad'));

/* 盘右 */
await page.click('#tab-right');
await page.waitForTimeout(150);
await typeReading('right', 0, 'a', 180, 21, 12);
await typeReading('right', 0, 'b', 305, 35, 36);
await page.click('[data-add="right"]');
await page.waitForTimeout(120);
await typeReading('right', 1, 'a', 270, 11, 42);
await typeReading('right', 1, 'b', 35, 26, 12);
await page.waitForTimeout(150);
check(
  '盘右两测回平均 125°14′27″',
  (await page.textContent('#panel-right .face-display b')) === '125°14′27″',
  await page.textContent('#panel-right .face-display b'),
);
await page.screenshot({ path: `${OUT}/${prefix}-03-right.png` });

/* 直接输角值（保留读数数据不丢） */
await page.click('#tab-left');
await page.click('#panel-left [data-mode="angles"]');
await page.waitForTimeout(150);
check('切到角值模式后键盘可用', await page.isVisible('#keypad'));
await typeReading('left', 0, 'angle', 125, 14, 21);
await typeReading('left', 1, 'angle', 125, 14, 27);
await page.waitForTimeout(150);
check(
  '角值模式平均 125°14′24″',
  (await page.textContent('#panel-left .face-display b')) === '125°14′24″',
  await page.textContent('#panel-left .face-display b'),
);
await page.click('#panel-left [data-mode="readings"]');
await page.waitForTimeout(150);
check(
  '切回读数模式仍为 125°14′21″',
  (await page.textContent('#panel-left .face-display b')) === '125°14′21″',
  await page.textContent('#panel-left .face-display b'),
);

/* 汇总 */
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '汇总各测回平均 125°14′24″',
  (await page.textContent('#sum-final')) === '125°14′24″',
  await page.textContent('#sum-final'),
);
const roundRows = await page.locator('#sum-rounds .sum-round').count();
check('汇总测回明细 2 行', roundRows === 2, String(roundRows));
const checkTexts = await page.locator('#sum-checks .check').allInnerTexts();
check(
  '限差显示半测回互差 6″',
  checkTexts[0]?.includes('6″'),
  JSON.stringify(checkTexts),
);
await page.screenshot({ path: `${OUT}/${prefix}-04-summary.png` });

/* 距离 */
await page.click('#tab-dist');
await page.waitForTimeout(120);
check('汇总页收起键盘', !(await page.isVisible('#keypad')));
await page.click('#panel-dist .group[data-gindex="0"] .dist-val');
await page.waitForTimeout(100);
check('点距离格打开键盘', await page.isVisible('#keypad'));
for (const key of ['5', '9', 'dot', '2', '3', '0']) await press(key);
await page.click('#panel-dist .group[data-gindex="0"] .add-item');
await page.waitForTimeout(120);
for (const key of ['5', '9', 'dot', '2', '3', '1']) await press(key);
await page.waitForTimeout(150);
check(
  '距离均值 59.230（五成双）',
  (await page.textContent('#panel-dist .group[data-gindex="0"] .dist-out')) === '59.230',
  await page.textContent('#panel-dist .group[data-gindex="0"] .dist-out'),
);
await page.screenshot({ path: `${OUT}/${prefix}-05-distance.png` });

/* 刷新持久化 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '刷新后数据保留',
  (await page.textContent('#sum-final')) === '125°14′24″',
  await page.textContent('#sum-final'),
);

/* 示例数据 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '示例载入后各测回平均 125°14′24″',
  (await page.textContent('#sum-final')) === '125°14′24″',
  await page.textContent('#sum-final'),
);
const demoDist = await page.locator('#sum-dist .sum-dist-row').allInnerTexts();
check('示例距离两行', demoDist.length === 2, JSON.stringify(demoDist));
check('示例距离 59.230', demoDist[0]?.includes('59.230'), demoDist[0]);
check('示例距离 114.552', demoDist[1]?.includes('114.552'), demoDist[1]);

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
await page.screenshot({ path: `${OUT}/${prefix}-06-desktop.png` });

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
