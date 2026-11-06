/**
 * 绾夸笂 PWA / 绂荤嚎 / 鍓创鏉?/ 杈圭晫鎻愮ず娴嬭瘯锛堟暟瀛楅敭鐩樼増锛? *   node tests/pwa.mjs
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
  if (!ok) errors.push(name + (detail ? ` 鈥?${detail}` : ''));
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
page.on('dialog', (dialog) => dialog.accept());

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
check('Service Worker 婵€娲?, swState === 'activated', String(swState));

/* 绛夋帶鍒跺櫒鎺ョ鍚庡埛鏂颁竴娆?*/
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(350);

/* 绀轰緥 + 澶嶅埗 */
await page.click('#btn-demo');
await page.waitForTimeout(300);
await page.click('#tab-summary');
await page.waitForTimeout(200);
await page.click('#btn-copy');
await page.waitForTimeout(350);
const clip = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    return `ERROR:${error}`;
  }
});
check('澶嶅埗鏂囨湰鍚悇娴嬪洖骞冲潎鍊?, clip.includes('鍚勬祴鍥炲钩鍧囧€?) && clip.includes('125掳14鈥?4鈥?), clip.slice(0, 160));
check('澶嶅埗鏂囨湰鍚洏宸?鐩樺彸', clip.includes('鐩樺乏') && clip.includes('鐩樺彸'));
check('澶嶅埗鏂囨湰鍚窛绂?59.230', clip.includes('59.230'));

/* 绂荤嚎 */
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const offline = await page.evaluate(() => ({
  title: document.title,
  tabs: document.querySelectorAll('.mode').length,
  body: document.body.innerText.length,
  keypad: !document.querySelector('#keypad')?.hidden,
}));
check('绂荤嚎鍚庝粛鍙墦寮€', offline.tabs === 4 && offline.body > 120, JSON.stringify(offline));
await page.click('#tab-left');
await page.waitForTimeout(150);
const offlineValue = await page.textContent('#panel-left .face-display b');
check('绂荤嚎鍚庢暟鎹笌璁＄畻浠嶅彲鐢?, offlineValue === '125掳14鈥?1鈥?, offlineValue);
check('绂荤嚎鍚庨敭鐩樺彲鐢?, offline.keypad);
await context.setOffline(false);

/* 娓呯┖鍚庢祴杈圭晫锛氶潪娉曞垎 */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('娓呯┖鍚庨敭鐩樿嚜鍔ㄦ墦寮€', await page.isVisible('#keypad'));
await page.click('#panel-left .reading[data-reading="a"] .cell[data-part="d"]');
await press('0');
await press('next');
await press('6');
await press('0');
await page.waitForTimeout(120);
check(
  '鍒?60 鏍囩孩涓斾笉鍙備笌璁＄畻',
  (await page.locator('#panel-left .cell.invalid').count()) >= 1,
  String(await page.locator('#panel-left .cell.invalid').count()),
);

/* 瑙掑€?>180掳 */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await typeReading('left', 0, 'a', 0, 0, 0);
await typeReading('left', 0, 'b', 200, 0, 0);
await page.waitForTimeout(150);
const warn = await page.evaluate(() => {
  const el = document.querySelector('#panel-left .round[data-index="0"] .round-angle');
  return { text: el?.textContent, warn: el?.classList.contains('warn') };
});
check('瑙掑€?>180掳 鏍囩孩鎻愮ず', warn.warn === true, JSON.stringify(warn));

/* 甯冨眬 */
for (const width of [360, 430, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(`${width}px 鏃犳í鍚戞孩鍑篳, overflow);
}

/* 璧勬簮 */
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
  'PWA 娓呭崟涓庤祫婧愬彲璁块棶',
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

