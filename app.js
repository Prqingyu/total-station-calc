/**
 * app.js —— 测回计算器交互层
 * 状态保存在 localStorage，输入即算；汇总口径与参考表格一致。
 */
import {
  dmsFilled,
  dmsValid,
  dmsPartsToSeconds,
  formatAngle,
  formatDelta,
  angleFromReadings,
  mean,
  spread,
  formatMeters,
  formatExactMeters,
  formatMm,
  parseDistance,
  distanceStats,
} from './calc.js';

const STORE_KEY = 'tscalc.v1';
const LIMITS = { half: 40, round: 24 }; // DJ6 常用限差，仅作提示
const TABS = ['left', 'right', 'dist', 'summary'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- 状态 ---------------- */

function emptyDms() {
  return { d: '', m: '', s: '' };
}

function createRound() {
  return { a: emptyDms(), b: emptyDms(), angle: emptyDms() };
}

function createGroup() {
  return { name: '', items: [''] };
}

function defaultState() {
  return {
    version: 1,
    meta: { station: '', targetA: '', targetB: '' },
    left: { mode: 'readings', rounds: [createRound()] },
    right: { mode: 'readings', rounds: [createRound()] },
    dist: { groups: [createGroup()] },
    tab: 'left',
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const out = base;
  if (raw.meta && typeof raw.meta === 'object') {
    out.meta = {
      station: String(raw.meta.station ?? ''),
      targetA: String(raw.meta.targetA ?? ''),
      targetB: String(raw.meta.targetB ?? ''),
    };
  }
  for (const side of ['left', 'right']) {
    const src = raw[side] && typeof raw[side] === 'object' ? raw[side] : {};
    const roundsSrc = Array.isArray(src.rounds) && src.rounds.length ? src.rounds : [createRound()];
    out[side] = {
      mode: src.mode === 'angles' ? 'angles' : 'readings',
      rounds: roundsSrc.map((r) => ({
        a: { ...emptyDms(), ...(r && r.a ? r.a : {}) },
        b: { ...emptyDms(), ...(r && r.b ? r.b : {}) },
        angle: { ...emptyDms(), ...(r && r.angle ? r.angle : {}) },
      })),
    };
  }
  if (raw.dist && Array.isArray(raw.dist.groups) && raw.dist.groups.length) {
    out.dist = {
      groups: raw.dist.groups.map((g) => ({
        name: typeof g?.name === 'string' ? g.name : '',
        items: Array.isArray(g?.items) && g.items.length ? g.items.map((v) => String(v ?? '')) : [''],
      })),
    };
  }
  out.tab = TABS.includes(raw.tab) ? raw.tab : 'left';
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state = loadState();
let activeTab = state.tab;
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式等场景忽略 */
    }
  }, 120);
}

/* ---------------- 小工具 ---------------- */

let toastTimer = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function emptyLine(text) {
  const p = document.createElement('p');
  p.className = 'empty-line';
  p.textContent = text;
  return p;
}

function dms(d, m, s) {
  return { d: String(d), m: String(m), s: String(s) };
}

function demoState() {
  return {
    version: 1,
    meta: { station: 'GCP2', targetA: 'GCP1', targetB: 'GCP3' },
    left: {
      mode: 'readings',
      rounds: [
        { a: dms(0, 20, 42), b: dms(125, 35, 0), angle: emptyDms() },
        { a: dms(90, 11, 36), b: dms(215, 26, 0), angle: emptyDms() },
      ],
    },
    right: {
      mode: 'readings',
      rounds: [
        { a: dms(180, 21, 12), b: dms(305, 35, 36), angle: emptyDms() },
        { a: dms(270, 11, 42), b: dms(35, 26, 12), angle: emptyDms() },
      ],
    },
    dist: {
      groups: [
        { name: 'GCP2 → GCP1', items: ['59.230', '59.230', '59.231', '59.231'] },
        { name: 'GCP2 → GCP3', items: ['114.552', '114.551', '114.553', '114.553'] },
      ],
    },
    tab: 'left',
  };
}

function hasAnyData() {
  const roundsFilled = (side) =>
    state[side].rounds.some((r) => ['a', 'b', 'angle'].some((key) => dmsFilled(r[key])));
  const distFilled = state.dist.groups.some((g) => g.items.some((v) => String(v).trim() !== ''));
  return (
    roundsFilled('left') ||
    roundsFilled('right') ||
    distFilled ||
    Boolean(state.meta.station || state.meta.targetA || state.meta.targetB)
  );
}

/* ---------------- 计算 ---------------- */

function computeRound(side, round) {
  if (state[side].mode === 'angles') return dmsPartsToSeconds(round.angle);
  return angleFromReadings(round.a, round.b);
}

function computeSummary() {
  const leftAngles = state.left.rounds.map((r) => computeRound('left', r));
  const rightAngles = state.right.rounds.map((r) => computeRound('right', r));
  const leftAvg = mean(leftAngles.filter((v) => v != null));
  const rightAvg = mean(rightAngles.filter((v) => v != null));

  const rows = [];
  const n = Math.max(leftAngles.length, rightAngles.length);
  for (let i = 0; i < n; i += 1) {
    const l = leftAngles[i];
    const r = rightAngles[i];
    const hasLeft = l != null;
    const hasRight = r != null;
    if (!hasLeft && !hasRight) continue;
    const one = hasLeft && hasRight ? (l + r) / 2 : null;
    const diff = hasLeft && hasRight ? Math.abs(l - r) : null;
    rows.push({ index: i, left: hasLeft ? l : null, right: hasRight ? r : null, one, diff });
  }

  const paired = rows.filter((row) => row.one != null);
  const oneSets = paired.map((row) => row.one);
  const final = oneSets.length ? mean(oneSets) : (leftAvg ?? rightAvg);
  const faceDiff = leftAvg != null && rightAvg != null ? Math.abs(leftAvg - rightAvg) : null;
  const maxHalfDiff = paired.length ? Math.max(...paired.map((row) => row.diff)) : null;
  const oneSpread = spread(oneSets);

  return { leftAvg, rightAvg, rows, paired, oneSets, final, faceDiff, maxHalfDiff, oneSpread };
}

/* ---------------- 输入处理 ---------------- */

function sanitizePart(raw, part) {
  let v = String(raw).replace(/[^\d.]/g, '');
  if (part !== 's') return v.replace(/\./g, '').slice(0, part === 'd' ? 3 : 2);
  const [intPart, ...rest] = v.split('.');
  let out = intPart.slice(0, 2);
  if (v.includes('.')) out += '.' + rest.join('').slice(0, 2);
  if (out.startsWith('.')) out = '0' + out;
  return out.slice(0, 5);
}

function normalizePart(value, part) {
  const v = String(value).trim();
  if (!v) return '';
  if (part === 's') {
    const num = Number(v.replace(',', '.'));
    return Number.isFinite(num) ? String(num) : v;
  }
  const num = Number(v);
  return Number.isFinite(num) ? String(num) : v;
}

function sanitizeDistance(raw) {
  let v = String(raw).replace(/[^\d.]/g, '');
  const [intPart, ...rest] = v.split('.');
  let out = intPart.slice(0, 5);
  if (v.includes('.')) out += '.' + rest.join('').slice(0, 4);
  if (out.startsWith('.')) out = '0' + out;
  return out.slice(0, 10);
}

function parseDmsText(text) {
  if (!text) return null;
  const normalized = String(text)
    .replace(/[°度]/g, ' ')
    .replace(/[′'’分]/g, ' ')
    .replace(/[″"”秒]/g, ' ')
    .replace(/[，,：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nums = normalized.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  if (nums.length >= 3) {
    return { d: nums[0], m: nums[1], s: nums[2] };
  }
  if (nums.length === 1 && nums[0].includes('.')) {
    const v = Number(nums[0]);
    if (!Number.isFinite(v) || v < 0 || v >= 360) return null;
    const d = Math.floor(v);
    const mf = (v - d) * 60;
    const m = Math.floor(mf);
    const s = Math.round((mf - m) * 60 * 100) / 100;
    return { d: String(d), m: String(m), s: String(s) };
  }
  return null;
}

function autoAdvance(inp, part) {
  const dmsEl = inp.closest('.dms');
  if (!dmsEl) return;
  const inputs = $$('input', dmsEl);
  const idx = inputs.indexOf(inp);
  if (part === 'd' && inp.value.length >= 3) inputs[idx + 1]?.focus();
  else if (part === 'm' && inp.value.length >= 2) inputs[idx + 1]?.focus();
}

function focusNextInput(inp, node) {
  const inputs = $$('input', node).filter((el) => el.offsetParent !== null);
  const idx = inputs.indexOf(inp);
  const next = inputs[idx + 1] ?? inputs[0];
  next?.focus();
}

function refreshReading(row, obj) {
  row.classList.toggle('invalid', dmsFilled(obj) && !dmsValid(obj));
}

function refreshRoundAngle(side, round, node) {
  const out = $('.round-foot output', node);
  if (!out) return;
  const angle = computeRound(side, round);
  out.textContent = angle == null ? '—' : formatAngle(angle);
  out.classList.toggle('empty', angle == null);
  const warn = $('.round-warn', node);
  if (warn) warn.hidden = !(angle != null && angle > 180 * 3600);
}

/* ---------------- 测回卡片 ---------------- */

const roundTpl = $('#tpl-round');

function bindDmsInput(inp, ctx) {
  const { side, round, obj, row, node } = ctx;
  const part = inp.dataset.part;
  inp.value = obj[part] ?? '';

  inp.addEventListener('input', () => {
    inp.value = sanitizePart(inp.value, part);
    obj[part] = inp.value;
    refreshReading(row, obj);
    refreshRoundAngle(side, round, node);
    updateFaceResult(side);
    renderSummary();
    save();
    autoAdvance(inp, part);
  });

  inp.addEventListener('blur', () => {
    inp.value = normalizePart(inp.value, part);
    obj[part] = inp.value;
    refreshReading(row, obj);
    refreshRoundAngle(side, round, node);
    updateFaceResult(side);
    renderSummary();
    save();
  });

  inp.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      focusNextInput(inp, node);
    }
  });

  inp.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text') ?? '';
    const parsed = parseDmsText(text);
    if (!parsed) return;
    event.preventDefault();
    obj.d = parsed.d;
    obj.m = parsed.m;
    obj.s = parsed.s;
    const inputs = $$('input', row);
    inputs[0].value = obj.d;
    inputs[1].value = obj.m;
    inputs[2].value = obj.s;
    refreshReading(row, obj);
    refreshRoundAngle(side, round, node);
    updateFaceResult(side);
    renderSummary();
    save();
  });
}

function buildRound(side, round, index) {
  const node = roundTpl.content.firstElementChild.cloneNode(true);
  $('.round-no', node).textContent = `测回 ${index + 1}`;

  $('.btn-del', node).addEventListener('click', () => {
    const rounds = state[side].rounds;
    if (rounds.length <= 1) rounds[0] = createRound();
    else rounds.splice(index, 1);
    renderFace(side);
    renderSummary();
    save();
  });

  for (const role of ['a', 'b', 'angle']) {
    const row = $(`.reading[data-reading="${role}"]`, node);
    const obj = round[role];
    $$('input', row).forEach((inp) => bindDmsInput(inp, { side, round, obj, row, node, role }));
    refreshReading(row, obj);
  }
  refreshRoundAngle(side, round, node);
  return node;
}

function renderFace(side) {
  const panel = $(`#panel-${side}`);
  if (!panel) return;
  panel.classList.toggle('mode-angles', state[side].mode === 'angles');
  $$('[data-mode]', panel).forEach((btn) => {
    const on = btn.dataset.mode === state[side].mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  const list = $('.round-list', panel);
  list.replaceChildren(...state[side].rounds.map((round, i) => buildRound(side, round, i)));
  updateFaceResult(side);
}

function updateFaceResult(side) {
  const panel = $(`#panel-${side}`);
  if (!panel) return;
  const angles = state[side].rounds.map((round) => computeRound(side, round)).filter((v) => v != null);
  const avg = mean(angles);

  $('.result-value', panel).textContent = avg == null ? '—' : formatAngle(avg);

  const total = state[side].rounds.length;
  const missing = total - angles.length;
  const bits = [];
  if (angles.length === 0) {
    bits.push(state[side].mode === 'angles' ? '输入角值后自动平均' : '输入读数后自动计算');
  } else {
    bits.push(`共 ${angles.length} 测回${missing > 0 ? `，${missing} 个未填完` : ''}`);
    if (angles.length > 1) {
      const range = spread(angles);
      if (range != null) bits.push(`测回间较差 ${formatDelta(range)}`);
    }
  }
  $('.result-sub', panel).textContent = bits.join(' · ');

  const label = side === 'left' ? '盘左' : '盘右';
  $('.result-eyebrow', panel).textContent =
    state[side].mode === 'angles' ? `${label}角值直接平均` : `${label}平均角值`;
}

/* ---------------- 距离分组 ---------------- */

const groupTpl = $('#tpl-group');

function buildDistItem(group, index, groupNode) {
  const row = document.createElement('div');
  row.className = 'dist-item';
  row.innerHTML =
    '<label class="dist-box"><input inputmode="decimal" placeholder="如 59.230" aria-label="水平距离（米）" /><span>m</span></label>' +
    '<button type="button" class="btn-x" aria-label="删除该测量"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
  const input = $('input', row);
  input.value = group.items[index] ?? '';

  input.addEventListener('input', () => {
    input.value = sanitizeDistance(input.value);
    group.items[index] = input.value;
    updateGroupResult(group, groupNode);
    renderSummary();
    save();
  });

  input.addEventListener('blur', () => {
    input.value = input.value.trim();
    group.items[index] = input.value;
    updateGroupResult(group, groupNode);
    renderSummary();
    save();
  });

  $('.btn-x', row).addEventListener('click', () => {
    group.items[index] = input.value;
    if (group.items.length <= 1) group.items[0] = '';
    else group.items.splice(index, 1);
    renderDist();
    save();
  });

  return row;
}

function updateGroupResult(group, node) {
  const stats = distanceStats(group.items.map(parseDistance));
  const out = $('.dist-out', node);
  const sub = $('.group-sub', node);
  if (!stats) {
    out.textContent = '—';
    sub.textContent = '输入后自动平均';
    return;
  }
  const shown = formatMeters(stats.mean);
  out.textContent = shown;
  const exact = formatExactMeters(stats.mean);
  const bits = [`${stats.count} 次`];
  if (stats.count > 1) bits.push(`极差 ${formatMm(stats.rangeMm)} mm`);
  if (exact !== shown) bits.push(`精确 ${exact} m`);
  sub.textContent = bits.join(' · ');
}

function buildGroup(group, index) {
  const node = groupTpl.content.firstElementChild.cloneNode(true);
  const nameInput = $('.group-name', node);
  nameInput.value = group.name;
  nameInput.addEventListener('input', () => {
    group.name = nameInput.value;
    renderSummary();
    save();
  });

  $('.btn-del-group', node).addEventListener('click', () => {
    if (state.dist.groups.length <= 1) state.dist.groups[0] = createGroup();
    else state.dist.groups.splice(index, 1);
    renderDist();
    save();
  });

  const list = $('.dist-list', node);
  group.items.forEach((_, j) => list.appendChild(buildDistItem(group, j, node)));

  $('.add-item', node).addEventListener('click', () => {
    group.items.push('');
    list.appendChild(buildDistItem(group, group.items.length - 1, node));
    save();
    const inputs = $$('input', list);
    inputs[inputs.length - 1]?.focus();
  });

  updateGroupResult(group, node);
  return node;
}

function renderDist() {
  const list = $('.group-list[data-list="dist"]');
  if (!list) return;
  list.replaceChildren(...state.dist.groups.map((group, i) => buildGroup(group, i)));
  renderSummary();
}

/* ---------------- 汇总 ---------------- */

function buildSummaryRound(row) {
  const box = document.createElement('div');
  box.className = 'sum-round';

  const head = document.createElement('div');
  head.className = 'sr-head';
  const title = document.createElement('span');
  title.textContent = `测回 ${row.index + 1}`;
  head.appendChild(title);
  if (row.diff != null) {
    const em = document.createElement('em');
    em.textContent = `互差 ${formatDelta(row.diff)}`;
    head.appendChild(em);
  }

  const grid = document.createElement('div');
  grid.className = 'sr-grid';
  const cell = (label, value) => {
    const wrap = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    wrap.append(span, b);
    return wrap;
  };
  grid.append(
    cell('盘左', row.left != null ? formatAngle(row.left) : '—'),
    cell('盘右', row.right != null ? formatAngle(row.right) : '—'),
    cell('一测回', row.one != null ? formatAngle(row.one) : '—'),
  );

  box.append(head, grid);
  return box;
}

function checkRow(label, value, status, badgeText) {
  const row = document.createElement('div');
  row.className = 'check';
  const left = document.createElement('span');
  left.className = 'check-label';
  left.textContent = label;
  const right = document.createElement('span');
  right.className = 'check-value';
  const val = document.createElement('span');
  val.textContent = value;
  const badge = document.createElement('span');
  badge.className = status === 'ok' ? 'badge-ok' : status === 'bad' ? 'badge-bad' : 'badge-na';
  badge.textContent = badgeText;
  right.append(val, badge);
  row.append(left, right);
  return row;
}

function renderSummary() {
  const sum = computeSummary();

  $('#sum-final').textContent = sum.final != null ? formatAngle(sum.final) : '—';
  let sub;
  if (sum.oneSets.length) {
    sub = `由 ${sum.oneSets.length} 个一测回平均`;
    if (state.left.rounds.length !== state.right.rounds.length) {
      sub += `（盘左 ${state.left.rounds.length} / 盘右 ${state.right.rounds.length} 测回，仅按已配对测回计算）`;
    }
  } else if (sum.leftAvg != null || sum.rightAvg != null) {
    sub = '缺少另一盘数据，暂按单盘平均';
  } else {
    sub = '先在盘左、盘右中输入读数';
  }
  $('#sum-final-sub').textContent = sub;

  $('#sum-left').textContent = sum.leftAvg != null ? formatAngle(sum.leftAvg) : '—';
  $('#sum-right').textContent = sum.rightAvg != null ? formatAngle(sum.rightAvg) : '—';
  $('#sum-diff').textContent = sum.faceDiff != null ? formatDelta(sum.faceDiff) : '—';

  const roundsWrap = $('#sum-rounds');
  roundsWrap.replaceChildren();
  if (!sum.rows.length) {
    roundsWrap.appendChild(emptyLine('还没有测回数据。在盘左或盘右里输入读数后，这里会按测回列出。'));
  } else {
    sum.rows.forEach((row) => roundsWrap.appendChild(buildSummaryRound(row)));
  }

  const checks = $('#sum-checks');
  checks.replaceChildren();
  checks.appendChild(
    checkRow(
      `半测回互差最大值（≤${LIMITS.half}″）`,
      sum.maxHalfDiff != null ? formatDelta(sum.maxHalfDiff) : '—',
      sum.maxHalfDiff == null ? 'na' : sum.maxHalfDiff <= LIMITS.half ? 'ok' : 'bad',
      sum.maxHalfDiff == null ? '—' : sum.maxHalfDiff <= LIMITS.half ? '通过' : '注意',
    ),
  );
  checks.appendChild(
    checkRow(
      `各测回互差（≤${LIMITS.round}″）`,
      sum.oneSpread != null ? formatDelta(sum.oneSpread) : '—',
      sum.oneSpread == null ? 'na' : sum.oneSpread <= LIMITS.round ? 'ok' : 'bad',
      sum.oneSpread == null ? '—' : sum.oneSpread <= LIMITS.round ? '通过' : '注意',
    ),
  );
  const countsMatch = state.left.rounds.length === state.right.rounds.length;
  checks.appendChild(
    checkRow(
      '盘左 / 盘右测回数',
      `${state.left.rounds.length} / ${state.right.rounds.length}`,
      countsMatch ? 'ok' : 'bad',
      countsMatch ? '一致' : '不一致',
    ),
  );

  const distWrap = $('#sum-dist');
  distWrap.replaceChildren();
  const groups = state.dist.groups
    .map((group) => ({ name: group.name.trim(), stats: distanceStats(group.items.map(parseDistance)) }))
    .filter((item) => item.stats);
  if (!groups.length) {
    distWrap.appendChild(emptyLine('还没有距离数据。到“距离”模式按方向分组填入。'));
  } else {
    groups.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'sum-dist-row';
      const name = document.createElement('span');
      name.className = 'sd-name';
      name.textContent = item.name || `方向 ${i + 1}`;
      const value = document.createElement('b');
      value.textContent = `${formatMeters(item.stats.mean)} m`;
      const count = document.createElement('em');
      count.textContent = `${item.stats.count} 次`;
      row.append(name, value, count);
      distWrap.appendChild(row);
    });
  }
}

/* ---------------- 记录文本 ---------------- */

function buildRecordText() {
  const sum = computeSummary();
  const lines = ['全站仪测回记录'];
  const info = [];
  if (state.meta.station.trim()) info.push(`测站：${state.meta.station.trim()}`);
  if (state.meta.targetA.trim() || state.meta.targetB.trim()) {
    info.push(`目标：${state.meta.targetA.trim() || 'A'} ↔ ${state.meta.targetB.trim() || 'B'}`);
  }
  if (info.length) lines.push(info.join('　'));

  const faceLine = (side, label) => {
    const angles = state[side].rounds.map((round) => computeRound(side, round)).filter((v) => v != null);
    if (!angles.length) return null;
    const items = angles.map((value, i) => `测回${i + 1} ${formatAngle(value)}`).join('；');
    return `${label}：${items}；平均 ${formatAngle(mean(angles))}`;
  };
  const leftLine = faceLine('left', '盘左');
  const rightLine = faceLine('right', '盘右');
  if (leftLine) lines.push(leftLine);
  if (rightLine) lines.push(rightLine);
  if (sum.final != null) {
    let line = `各测回平均值：${formatAngle(sum.final)}`;
    if (sum.oneSets.length) line += `（一测回平均，${sum.oneSets.length} 个测回）`;
    lines.push(line);
  }
  if (sum.maxHalfDiff != null) lines.push(`半测回互差最大值：${formatDelta(sum.maxHalfDiff)}`);

  const dists = state.dist.groups
    .map((group, i) => {
      const stats = distanceStats(group.items.map(parseDistance));
      if (!stats) return null;
      const name = group.name.trim() || `方向${i + 1}`;
      return `${name}：${formatMeters(stats.mean)} m（${stats.count} 次，极差 ${formatMm(stats.rangeMm)} mm）`;
    })
    .filter(Boolean);
  if (dists.length) lines.push(`距离：${dists.join('；')}`);
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

async function copyRecord() {
  try {
    await copyText(buildRecordText());
    toast('记录已复制');
  } catch {
    toast('复制失败，请长按选择文本');
  }
}

async function shareRecord() {
  const text = buildRecordText();
  if (navigator.share) {
    try {
      await navigator.share({ title: '全站仪测回记录', text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  try {
    await copyText(text);
    toast('已复制，可粘贴分享');
  } catch {
    toast('分享失败');
  }
}

/* ---------------- 说明抽屉 ---------------- */

function openSheet() {
  const wrap = $('#help-sheet');
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  const wrap = $('#help-sheet');
  wrap.hidden = true;
  document.body.style.overflow = '';
}

/* ---------------- 标签页 ---------------- */

function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'left';
  activeTab = tab;
  state.tab = tab;
  $$('.tab').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  $$('.panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });
  if (tab === 'summary') renderSummary();
  save();
}

/* ---------------- 事件绑定 ---------------- */

function bindMeta() {
  const map = {
    station: $('#meta-station'),
    targetA: $('#meta-target-a'),
    targetB: $('#meta-target-b'),
  };
  for (const [key, input] of Object.entries(map)) {
    input.value = state.meta[key] ?? '';
    input.addEventListener('input', () => {
      state.meta[key] = input.value;
      updateRecordBrief();
      save();
    });
  }
}

function updateRecordBrief() {
  const parts = [];
  if (state.meta.station.trim()) parts.push(state.meta.station.trim());
  const a = state.meta.targetA.trim();
  const b = state.meta.targetB.trim();
  if (a || b) parts.push(`${a || 'A'}—${b || 'B'}`);
  $('#record-brief').textContent = parts.length ? parts.join(' · ') : '测站 / 目标（可选）';
  $('#record').classList.toggle('has-value', parts.length > 0);
}

function syncMetaInputs() {
  $('#meta-station').value = state.meta.station ?? '';
  $('#meta-target-a').value = state.meta.targetA ?? '';
  $('#meta-target-b').value = state.meta.targetB ?? '';
}

function loadDemo() {
  if (hasAnyData() && !confirm('载入示例会覆盖当前输入，继续？')) return;
  state = demoState();
  activeTab = 'left';
  syncMetaInputs();
  updateRecordBrief();
  renderFace('left');
  renderFace('right');
  renderDist();
  setTab('left');
  save();
  toast('已载入参考表 GCP2 示例');
}

function bindStatic() {
  bindMeta();

  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  $$('[data-mode-group]').forEach((group) => {
    const side = group.dataset.modeGroup;
    $$('[data-mode]', group).forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (state[side].mode === mode) return;
        state[side].mode = mode;
        renderFace(side);
        renderSummary();
        save();
      });
    });
  });

  $$('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.add;
      state[side].rounds.push(createRound());
      renderFace(side);
      renderSummary();
      save();
      const list = $(`.round-list[data-list="${side}"]`);
      const card = list?.lastElementChild;
      if (card) {
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => card.querySelector('input')?.focus({ preventScroll: true }), 80);
      }
    });
  });

  $$('[data-clear]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.clear;
      const label = which === 'left' ? '盘左' : which === 'right' ? '盘右' : '距离';
      if (!confirm(`清空${label}数据？`)) return;
      if (which === 'dist') state.dist = { groups: [createGroup()] };
      else state[which] = { ...state[which], rounds: [createRound()] };
      if (which === 'dist') renderDist();
      else renderFace(which);
      renderSummary();
      save();
      toast(`已清空${label}`);
    });
  });

  $('#btn-add-group').addEventListener('click', () => {
    state.dist.groups.push(createGroup());
    renderDist();
    save();
    const groups = $$('.group-list .group');
    const last = groups[groups.length - 1];
    if (last) {
      last.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => last.querySelector('input')?.focus({ preventScroll: true }), 80);
    }
  });

  $('#btn-demo').addEventListener('click', loadDemo);
  $('#btn-help').addEventListener('click', openSheet);
  $('#btn-sheet-close').addEventListener('click', closeSheet);
  $('#help-sheet').addEventListener('click', (event) => {
    if (event.target === $('#help-sheet')) closeSheet();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  $('#btn-copy').addEventListener('click', copyRecord);
  $('#btn-share').addEventListener('click', shareRecord);
}

/* ---------------- 启动 ---------------- */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function init() {
  bindStatic();
  updateRecordBrief();
  renderFace('left');
  renderFace('right');
  renderDist();
  renderSummary();
  setTab(activeTab);
  registerSW();
}

init();
