/**
 * 绉诲姩绔鍒扮娴嬭瘯锛堟暟瀛楅敭鐩樼増锛? *   node tests/e2e.mjs
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
  if (!condition) errors.push(`${name}${detail ? ` 鈥?${detail}` : ''}`);
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

/* ---------- 绌虹姸鎬侊細閿洏鑷姩鎵撳紑 ---------- */
check('棣栧睆鏁板瓧閿洏鎵撳紑', await page.isVisible('#keypad'));
check(
  '閿洏鏍囬涓虹洏宸︽祴鍥?璇绘暟A',
  (await page.textContent('#keypad-caption')) === '鐩樺乏 路 娴嬪洖 1 路 璇绘暟 A',
  await page.textContent('#keypad-caption'),
);
check(
  '棣栨牸鑷姩閫変腑',
  (await page.getAttribute('#panel-left .reading[data-reading="a"] .cell.active', 'data-part')) === 'd',
);
check('鏃犲皬瀛楄鏄?, (await page.locator('.result-sub, .panel-head, .record').count()) === 0);
await page.screenshot({ path: `${OUT}/${prefix}-01-keypad-empty.png` });

/* ---------- 閿洏杈撳叆 ---------- */
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
  '杈撳畬璇绘暟 A 鑷姩璺冲埌璇绘暟 B',
  (await page.getAttribute('#panel-left .reading[data-reading="b"] .cell.active', 'data-part')) === 'd',
);
await typeReading('left', 0, 'b', 125, 35, 0);
await page.waitForTimeout(120);
check(
  '绗?1 娴嬪洖瑙掑€?125掳14鈥?8鈥?,
  (await page.textContent('#panel-left .round[data-index="0"] .round-angle')) === '125掳14鈥?8鈥?,
  await page.textContent('#panel-left .round[data-index="0"] .round-angle'),
);
check(
  '鐩樺乏骞冲潎 125掳14鈥?8鈥?,
  (await page.textContent('#panel-left .face-display b')) === '125掳14鈥?8鈥?,
  await page.textContent('#panel-left .face-display b'),
);

/* 娣诲姞绗簩娴嬪洖 */
await page.click('[data-add="left"]');
await page.waitForTimeout(120);
check('娣诲姞娴嬪洖鍚庨敭鐩樺畾浣嶅埌鏂版祴鍥?, await page.isVisible('#keypad'));
await typeReading('left', 1, 'a', 90, 11, 36);
await typeReading('left', 1, 'b', 215, 26, 0);
await page.waitForTimeout(150);
check(
  '鐩樺乏涓ゆ祴鍥炲钩鍧?125掳14鈥?1鈥?,
  (await page.textContent('#panel-left .face-display b')) === '125掳14鈥?1鈥?,
  await page.textContent('#panel-left .face-display b'),
);
await page.screenshot({ path: `${OUT}/${prefix}-02-left-keypad.png` });

/* 鏀惰捣 / 閲嶆柊鎵撳紑閿洏 */
await page.click('#keypad-hide');
await page.waitForTimeout(100);
check('鏀惰捣閿洏', !(await page.isVisible('#keypad')));
await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="d"]');
await page.waitForTimeout(100);
check('鐐规牸瀛愰噸鏂版墦寮€閿洏', await page.isVisible('#keypad'));

/* 鐩樺彸 */
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
  '鐩樺彸涓ゆ祴鍥炲钩鍧?125掳14鈥?7鈥?,
  (await page.textContent('#panel-right .face-display b')) === '125掳14鈥?7鈥?,
  await page.textContent('#panel-right .face-display b'),
);
await page.screenshot({ path: `${OUT}/${prefix}-03-right.png` });

/* 鐩存帴杈撹鍊硷紙淇濈暀璇绘暟鏁版嵁涓嶄涪锛?*/
await page.click('#tab-left');
await page.click('#panel-left [data-mode="angles"]');
await page.waitForTimeout(150);
check('鍒囧埌瑙掑€兼ā寮忓悗閿洏鍙敤', await page.isVisible('#keypad'));
await typeReading('left', 0, 'angle', 125, 14, 21);
await typeReading('left', 1, 'angle', 125, 14, 27);
await page.waitForTimeout(150);
check(
  '瑙掑€兼ā寮忓钩鍧?125掳14鈥?4鈥?,
  (await page.textContent('#panel-left .face-display b')) === '125掳14鈥?4鈥?,
  await page.textContent('#panel-left .face-display b'),
);
await page.click('#panel-left [data-mode="readings"]');
await page.waitForTimeout(150);
check(
  '鍒囧洖璇绘暟妯″紡浠嶄负 125掳14鈥?1鈥?,
  (await page.textContent('#panel-left .face-display b')) === '125掳14鈥?1鈥?,
  await page.textContent('#panel-left .face-display b'),
);

/* 姹囨€?*/
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '姹囨€诲悇娴嬪洖骞冲潎 125掳14鈥?4鈥?,
  (await page.textContent('#sum-final')) === '125掳14鈥?4鈥?,
  await page.textContent('#sum-final'),
);
const roundRows = await page.locator('#sum-rounds .sum-round').count();
check('姹囨€绘祴鍥炴槑缁?2 琛?, roundRows === 2, String(roundRows));
const checkTexts = await page.locator('#sum-checks .check').allInnerTexts();
check(
  '闄愬樊鏄剧ず鍗婃祴鍥炰簰宸?6鈥?,
  checkTexts[0]?.includes('6鈥?),
  JSON.stringify(checkTexts),
);
await page.screenshot({ path: `${OUT}/${prefix}-04-summary.png` });

/* 璺濈 */
await page.click('#tab-dist');
await page.waitForTimeout(120);
check('姹囨€婚〉鏀惰捣閿洏', !(await page.isVisible('#keypad')));
await page.click('#panel-dist .group[data-gindex="0"] .dist-val');
await page.waitForTimeout(100);
check('鐐硅窛绂绘牸鎵撳紑閿洏', await page.isVisible('#keypad'));
for (const key of ['5', '9', 'dot', '2', '3', '0']) await press(key);
await page.click('#panel-dist .group[data-gindex="0"] .add-item');
await page.waitForTimeout(120);
for (const key of ['5', '9', 'dot', '2', '3', '1']) await press(key);
await page.waitForTimeout(150);
check(
  '璺濈鍧囧€?59.230锛堜簲鎴愬弻锛?,
  (await page.textContent('#panel-dist .group[data-gindex="0"] .dist-out')) === '59.230',
  await page.textContent('#panel-dist .group[data-gindex="0"] .dist-out'),
);
await page.screenshot({ path: `${OUT}/${prefix}-05-distance.png` });

/* 鍒锋柊鎸佷箙鍖?*/
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '鍒锋柊鍚庢暟鎹繚鐣?,
  (await page.textContent('#sum-final')) === '125掳14鈥?4鈥?,
  await page.textContent('#sum-final'),
);

/* 绀轰緥鏁版嵁 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(150);
check(
  '绀轰緥杞藉叆鍚庡悇娴嬪洖骞冲潎 125掳14鈥?4鈥?,
  (await page.textContent('#sum-final')) === '125掳14鈥?4鈥?,
  await page.textContent('#sum-final'),
);
const demoDist = await page.locator('#sum-dist .sum-dist-row').allInnerTexts();
check('绀轰緥璺濈涓よ', demoDist.length === 2, JSON.stringify(demoDist));
check('绀轰緥璺濈 59.230', demoDist[0]?.includes('59.230'), demoDist[0]);
check('绀轰緥璺濈 114.552', demoDist[1]?.includes('114.552'), demoDist[1]);

/* 璇存槑 */
await page.click('#btn-help');
await page.waitForTimeout(200);
check('璇存槑鍙墦寮€', await page.isVisible('#help-sheet'));
await page.click('#btn-sheet-close');
await page.waitForTimeout(120);
check('璇存槑鍙叧闂?, !(await page.isVisible('#help-sheet')));

/* 甯冨眬 */
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
    keypad: (() => {
      const el = document.querySelector('#keypad');
      if (!el || el.hidden) return null;
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })(),
  }));
  check(`${width}px 鏃犳í鍚戞孩鍑篳, layout.scrollWidth <= layout.innerWidth + 1, JSON.stringify(layout));
}

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(150);
const desktop = await page.evaluate(() => ({
  appWidth: document.querySelector('#app').getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
}));
check('妗岄潰涓嶇牬鐗?, desktop.overflow && desktop.appWidth <= 600, JSON.stringify(desktop));
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

