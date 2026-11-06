/**
 * app.js —— 测回计算器（数字键盘版）
 * 盘左 / 盘右 / 距离 / 汇总，输入全部走底部数字键盘。
 */
import {
  dmsFilled,
  dmsPartsToSeconds,
  formatAngle,
  formatDelta,
  angleFromReadings,
  meanAngles,
  spreadAngles,
  angleSeparationSec,
  formatMeters,
  formatMm,
  parseDistance,
  distanceStats,
} from './calc.js';

const STORE_KEY = 'tscalc.v1';
const TABS = ['left', 'right', 'dist', 'summary'];
const LIMITS = { half: 40, round: 24 };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- 状态 ---------------- */

function emptyDms() {
  return { d: '', m: '', s: '' };
}

function createRound() {
  return { a: emptyDms(), b: emptyDms(), angle: emptyDms() };
}

function createGroup(name) {
  return { name: name || '', items: [''] };
}

function defaultState() {
  return {
    version: 1,
    meta: { station: '', targetA: '', targetB: '' },
    left: { mode: 'readings', rounds: [createRound()] },
    right: { mode: 'readings', rounds: [createRound()] },
    dist: { groups: [createGroup('方向 1')] },
    tab: 'left',
  };
}

function normalizeState(raw) {
  const out = defaultState();
  if (!raw || typeof raw !== 'object') return out;
  if (raw.meta && typeof raw.meta === 'object') {
    out.meta = {
      station: String(raw.meta.station ?? ''),
      targetA: String(raw.meta.targetA ?? ''),
      targetB: String(raw.meta.targetB ?? ''),
    };
  }
  for (const side of ['left', 'right']) {
    const src = raw[side] && typeof raw[side] === 'object' ? raw[side] : {};
    const sourceRounds = Array.isArray(src.rounds) && src.rounds.length ? src.rounds : [createRound()];
    out[side] = {
      mode: src.mode === 'angles' ? 'angles' : 'readings',
      rounds: sourceRounds.map((round) => ({
        a: { ...emptyDms(), ...(round && round.a ? round.a : {}) },
        b: { ...emptyDms(), ...(round && round.b ? round.b : {}) },
        angle: { ...emptyDms(), ...(round && round.angle ? round.angle : {}) },
      })),
    };
  }
  if (raw.dist && Array.isArray(raw.dist.groups) && raw.dist.groups.length) {
    out.dist = {
      groups: raw.dist.groups.map((group, index) => ({
        name:
          typeof group?.name === 'string' && group.name.trim()
            ? group.name
            : `方向 ${index + 1}`,
        items:
          Array.isArray(group?.items) && group.items.length
            ? group.items.map((value) => String(value ?? ''))
            : [''],
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
let active = null;
let keypadVisible = false;
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
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
    state[side].rounds.some((round) => ['a', 'b', 'angle'].some((key) => dmsFilled(round[key])));
  const distFilled = state.dist.groups.some((group) =>
    group.items.some((value) => String(value).trim() !== ''),
  );
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
  const leftAngles = state.left.rounds.map((round) => computeRound('left', round));
  const rightAngles = state.right.rounds.map((round) => computeRound('right', round));
  const leftAvg = meanAngles(leftAngles.filter((value) => value != null));
  const rightAvg = meanAngles(rightAngles.filter((value) => value != null));

  const rows = [];
  const count = Math.max(leftAngles.length, rightAngles.length);
  for (let i = 0; i < count; i += 1) {
    const left = leftAngles[i];
    const right = rightAngles[i];
    const hasLeft = left != null;
    const hasRight = right != null;
    if (!hasLeft && !hasRight) continue;
    rows.push({
      index: i,
      left: hasLeft ? left : null,
      right: hasRight ? right : null,
      one: hasLeft && hasRight ? meanAngles([left, right]) : null,
    });
  }

  const oneSets = rows.filter((row) => row.one != null).map((row) => row.one);
  const final = oneSets.length ? meanAngles(oneSets) : (leftAvg ?? rightAvg);
  const faceDiff =
    leftAvg != null && rightAvg != null ? angleSeparationSec(leftAvg, rightAvg) : null;
  const halfDiffs = rows
    .filter((row) => row.left != null && row.right != null)
    .map((row) => angleSeparationSec(row.left, row.right));
  const maxHalfDiff = halfDiffs.length ? Math.max(...halfDiffs) : null;
  const oneSpread = spreadAngles(oneSets);

  return { leftAvg, rightAvg, rows, oneSets, final, faceDiff, maxHalfDiff, oneSpread };
}

/* ---------------- 键盘槽位 ---------------- */

function getSlots() {
  if (activeTab === 'left' || activeTab === 'right') {
    const side = activeTab;
    const roles = state[side].mode === 'angles' ? ['angle'] : ['a', 'b'];
    const slots = [];
    state[side].rounds.forEach((_, roundIndex) => {
      roles.forEach((role) => {
        ['d', 'm', 's'].forEach((part) => {
          slots.push({ kind: 'angle', side, roundIndex, role, part });
        });
      });
    });
    return slots;
  }
  if (activeTab === 'dist') {
    const slots = [];
    state.dist.groups.forEach((group, groupIndex) => {
      group.items.forEach((_, itemIndex) => {
        slots.push({ kind: 'dist', groupIndex, itemIndex });
      });
    });
    return slots;
  }
  return [];
}

function sameSlot(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'angle') {
    return (
      a.side === b.side &&
      a.roundIndex === b.roundIndex &&
      a.role === b.role &&
      a.part === b.part
    );
  }
  return a.groupIndex === b.groupIndex && a.itemIndex === b.itemIndex;
}

function firstIncompleteSlot() {
  for (const slot of getSlots()) {
    if (slot.kind === 'angle') {
      const round = state[slot.side].rounds[slot.roundIndex];
      const obj = round ? round[slot.role] : null;
      if (obj && !obj[slot.part]) return slot;
    } else {
      const group = state.dist.groups[slot.groupIndex];
      const value = group ? group.items[slot.itemIndex] : '';
      if (!String(value ?? '').trim()) return slot;
    }
  }
  return null;
}

function getAngleObj(slot) {
  const round = state[slot.side].rounds[slot.roundIndex];
  return round ? round[slot.role] : null;
}

function prevSlot(slot) {
  const slots = getSlots();
  const index = slots.findIndex((item) => sameSlot(item, slot));
  return index > 0 ? slots[index - 1] : null;
}

function nextSlot(slot) {
  const slots = getSlots();
  const index = slots.findIndex((item) => sameSlot(item, slot));
  return index >= 0 ? slots[index + 1] || null : null;
}

function activeElement() {
  if (!active) return null;
  if (active.kind === 'angle') {
    return $(
      `#panel-${active.side} .round[data-index="${active.roundIndex}"] ` +
        `.reading[data-reading="${active.role}"] .cell[data-part="${active.part}"]`,
    );
  }
  return $(
    `#panel-dist .group[data-gindex="${active.groupIndex}"] ` +
      `.dist-item[data-iindex="${active.itemIndex}"] .dist-val`,
  );
}

function syncActive() {
  $$('.cell.active, .dist-val.active').forEach((el) => el.classList.remove('active'));
  const el = activeElement();
  if (el) el.classList.add('active');
}

function scrollActive() {
  requestAnimationFrame(() => {
    const el = activeElement();
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function selectSlot(slot) {
  active = { ...slot };
  syncActive();
  updateCaption();
  scrollActive();
}

function activateSlot(slot) {
  openKeypad();
  selectSlot(slot);
}

function openKeypad() {
  if (keypadVisible) return;
  keypadVisible = true;
  $('#keypad').hidden = false;
  $('#app').classList.add('keypad-open');
  document.body.classList.add('keypad-open');
}

function closeKeypad() {
  if (!keypadVisible) return;
  keypadVisible = false;
  $('#keypad').hidden = true;
  $('#app').classList.remove('keypad-open');
  document.body.classList.remove('keypad-open');
  active = null;
  syncActive();
}

function updateCaption() {
  const caption = $('#keypad-caption');
  if (!active) {
    caption.textContent = '';
    return;
  }
  if (active.kind === 'angle') {
    const sideLabel = active.side === 'left' ? '盘左' : '盘右';
    const roleLabel = active.role === 'angle' ? '角值' : `读数 ${active.role.toUpperCase()}`;
    caption.textContent = `${sideLabel} · 测回 ${active.roundIndex + 1} · ${roleLabel}`;
  } else {
    const group = state.dist.groups[active.groupIndex];
    const name = group?.name || `方向 ${active.groupIndex + 1}`;
    caption.textContent = `${name} · 第 ${active.itemIndex + 1} 条`;
  }
}

function advance() {
  const next = nextSlot(active);
  if (next) {
    selectSlot(next);
    return;
  }
  const first = firstIncompleteSlot();
  if (first && !sameSlot(first, active)) selectSlot(first);
}

/* ---------------- 角度输入 ---------------- */

function partValid(part, value) {
  if (value === '' || value == null) return true;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return part === 'd' ? number <= 359 : number <= 59;
}

function cellText(part, value) {
  if (value == null || value === '') return '';
  if (part === 'm' || part === 's') return value.padStart(2, '0');
  return value;
}

function refreshAngleReading(side, roundIndex, role) {
  const roundEl = $(`#panel-${side} .round[data-index="${roundIndex}"]`);
  if (!roundEl) return;
  const round = state[side].rounds[roundIndex];
  const obj = round ? round[role] : null;
  if (!obj) return;

  const row = roundEl.querySelector(`.reading[data-reading="${role}"]`);
  if (row) {
    ['d', 'm', 's'].forEach((part) => {
      const cell = row.querySelector(`.cell[data-part="${part}"]`);
      if (!cell) return;
      const valueEl = cell.querySelector('.cell-val');
      if (valueEl) valueEl.textContent = cellText(part, obj[part]);
      cell.classList.toggle('invalid', obj[part] !== '' && !partValid(part, obj[part]));
    });
  }

  if (state[side].mode === 'readings') {
    const angle = computeRound(side, round);
    const angleEl = roundEl.querySelector('.round-angle');
    if (angleEl) {
      angleEl.textContent = angle == null ? '' : formatAngle(angle);
      angleEl.classList.toggle('warn', angle != null && angle > 180 * 3600);
    }
  }

  updateFaceResult(side);
  renderSummary();
  save();
}

function updateFaceResult(side) {
  const panel = $(`#panel-${side}`);
  if (!panel) return;
  const angles = state[side].rounds
    .map((round) => computeRound(side, round))
    .filter((value) => value != null);
  const avg = meanAngles(angles);
  $('.face-display b', panel).textContent = avg == null ? '—' : formatAngle(avg);
}

function handleAngleKey(key) {
  if (!active || active.kind !== 'angle') return;
  const slot = active;
  const obj = getAngleObj(slot);
  if (!obj) return;

  if (key === 'clear') {
    obj.d = '';
    obj.m = '';
    obj.s = '';
    slot.part = 'd';
    refreshAngleReading(slot.side, slot.roundIndex, slot.role);
    selectSlot(slot);
    return;
  }

  if (key === 'next') {
    advance();
    return;
  }

  if (key === 'back') {
    if (obj[slot.part]) {
      obj[slot.part] = obj[slot.part].slice(0, -1);
      refreshAngleReading(slot.side, slot.roundIndex, slot.role);
    } else {
      const prev = prevSlot(slot);
      if (prev) selectSlot(prev);
    }
    return;
  }

  if (key === 'dot') return;
  if (!/^\d$/.test(key) && key !== '00') return;

  const max = slot.part === 'd' ? 3 : 2;
  const current = obj[slot.part] || '';
  const addition = key === '00' ? '00' : key;
  const nextValue = (current + addition).slice(0, max);
  if (nextValue === current) return;

  obj[slot.part] = nextValue;
  refreshAngleReading(slot.side, slot.roundIndex, slot.role);

  if (partValid(slot.part, nextValue) && nextValue.length >= max) {
    advance();
  }
}

/* ---------------- 距离输入 ---------------- */

function validDistanceText(value) {
  return /^\d{0,5}(?:\.\d{0,4})?$/.test(value);
}

function refreshDistItem(groupIndex, itemIndex) {
  const groupEl = $(`#panel-dist .group[data-gindex="${groupIndex}"]`);
  if (!groupEl) return;
  const group = state.dist.groups[groupIndex];
  if (!group) return;
  const itemEl = groupEl.querySelector(`.dist-item[data-iindex="${itemIndex}"]`);
  if (itemEl) {
    const num = itemEl.querySelector('.dist-num');
    if (num) num.textContent = group.items[itemIndex];
  }
  const stats = distanceStats(group.items.map(parseDistance));
  const out = groupEl.querySelector('.dist-out');
  if (out) out.textContent = stats ? formatMeters(stats.mean) : '—';
  renderSummary();
  save();
}

function handleDistKey(key) {
  if (!active || active.kind !== 'dist') return;
  const group = state.dist.groups[active.groupIndex];
  if (!group) return;
  const index = active.itemIndex;
  let value = String(group.items[index] ?? '');

  if (key === 'clear') {
    group.items[index] = '';
    refreshDistItem(active.groupIndex, index);
    return;
  }

  if (key === 'next') {
    advance();
    return;
  }

  if (key === 'back') {
    if (value) {
      group.items[index] = value.slice(0, -1);
      refreshDistItem(active.groupIndex, index);
    } else {
      const prev = prevSlot(active);
      if (prev && prev.kind === 'dist') selectSlot(prev);
    }
    return;
  }

  if (key === 'dot') {
    if (!value.includes('.')) {
      const nextValue = value === '' ? '0.' : `${value}.`;
      if (validDistanceText(nextValue)) {
        group.items[index] = nextValue;
        refreshDistItem(active.groupIndex, index);
      }
    }
    return;
  }

  if (!/^\d$/.test(key) && key !== '00') return;
  const nextValue = value + (key === '00' ? '00' : key);
  if (validDistanceText(nextValue)) {
    group.items[index] = nextValue;
    refreshDistItem(active.groupIndex, index);
  }
}

/* ---------------- 键盘总入口 ---------------- */

function handleKey(key) {
  if (key === 'done') {
    closeKeypad();
    return;
  }
  if (!active) {
    const first = firstIncompleteSlot() || getSlots()[0];
    if (!first) return;
    activateSlot(first);
  }
  if (!active) return;
  if (active.kind === 'angle') handleAngleKey(key);
  else if (active.kind === 'dist') handleDistKey(key);
  syncActive();
  updateCaption();
  save();
}

function bindKeypad() {
  $('.keypad-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    handleKey(button.dataset.key);
  });
  $('#keypad-hide').addEventListener('click', closeKeypad);

  document.addEventListener('keydown', (event) => {
    if (!keypadVisible) return;
    if (event.target.closest('input, textarea')) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      handleKey(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      handleKey('back');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      handleKey('next');
    } else if (event.key === '.') {
      event.preventDefault();
      handleKey('dot');
    } else if (event.key === 'Escape') {
      closeKeypad();
    }
  });
}

/* ---------------- 渲染：测回 ---------------- */

const roundTpl = $('#tpl-round');

function buildRound(side, round, index) {
  const node = roundTpl.content.firstElementChild.cloneNode(true);
  node.dataset.index = String(index);
  node.querySelector('.round-no').textContent = `测回 ${index + 1}`;

  if (state[side].mode === 'readings') {
    const angle = computeRound(side, round);
    const angleEl = node.querySelector('.round-angle');
    angleEl.textContent = angle == null ? '' : formatAngle(angle);
    angleEl.classList.toggle('warn', angle != null && angle > 180 * 3600);
  }

  node.querySelector('.btn-del').addEventListener('click', () => {
    const rounds = state[side].rounds;
    if (rounds.length <= 1) rounds[0] = createRound();
    else rounds.splice(index, 1);
    active = null;
    renderFace(side);
    renderSummary();
    save();
    if (keypadVisible) {
      const first = firstIncompleteSlot();
      if (first) selectSlot(first);
      else closeKeypad();
    }
  });

  ['a', 'b', 'angle'].forEach((role) => {
    const row = node.querySelector(`.reading[data-reading="${role}"]`);
    if (!row) return;
    ['d', 'm', 's'].forEach((part) => {
      const cell = row.querySelector(`.cell[data-part="${part}"]`);
      if (!cell) return;
      const valueEl = cell.querySelector('.cell-val');
      const obj = round[role];
      valueEl.textContent = cellText(part, obj[part]);
      cell.classList.toggle('invalid', obj[part] !== '' && !partValid(part, obj[part]));
      cell.addEventListener('click', () => {
        activateSlot({ kind: 'angle', side, roundIndex: index, role, part });
      });
    });
  });

  return node;
}

function renderFace(side) {
  const panel = $(`#panel-${side}`);
  if (!panel) return;
  panel.classList.toggle('mode-angles', state[side].mode === 'angles');
  $$('[data-mode]', panel).forEach((button) => {
    const on = button.dataset.mode === state[side].mode;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  const list = $('.round-list', panel);
  list.replaceChildren(...state[side].rounds.map((round, index) => buildRound(side, round, index)));
  updateFaceResult(side);
}

/* ---------------- 渲染：距离 ---------------- */

const groupTpl = $('#tpl-group');

function buildDistItem(group, groupIndex, itemIndex) {
  const row = document.createElement('div');
  row.className = 'dist-item';
  row.dataset.iindex = String(itemIndex);
  row.innerHTML =
    '<button type="button" class="dist-val"><span class="dist-num"></span><span class="dist-unit">m</span></button>' +
    '<button type="button" class="btn-x" aria-label="删除该测量"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';

  const value = group.items[itemIndex] ?? '';
  row.querySelector('.dist-num').textContent = value;
  const valueButton = row.querySelector('.dist-val');
  valueButton.addEventListener('click', () => {
    activateSlot({ kind: 'dist', groupIndex, itemIndex });
  });

  row.querySelector('.btn-x').addEventListener('click', () => {
    if (group.items.length <= 1) group.items[0] = '';
    else group.items.splice(itemIndex, 1);
    active = null;
    renderDist();
    save();
    if (keypadVisible) {
      const first = firstIncompleteSlot();
      if (first) selectSlot(first);
      else closeKeypad();
    }
  });

  return row;
}

function updateGroupResult(group, node) {
  const stats = distanceStats(group.items.map(parseDistance));
  const out = node.querySelector('.dist-out');
  if (out) out.textContent = stats ? formatMeters(stats.mean) : '—';
}

function buildGroup(group, index) {
  const node = groupTpl.content.firstElementChild.cloneNode(true);
  node.dataset.gindex = String(index);

  const nameInput = node.querySelector('.group-name');
  nameInput.value = group.name;
  nameInput.addEventListener('focus', () => {
    if (keypadVisible) closeKeypad();
  });
  nameInput.addEventListener('input', () => {
    group.name = nameInput.value;
    updateCaption();
    save();
  });

  node.querySelector('.btn-del-group').addEventListener('click', () => {
    if (state.dist.groups.length <= 1) state.dist.groups[0] = createGroup('方向 1');
    else state.dist.groups.splice(index, 1);
    active = null;
    renderDist();
    save();
    if (keypadVisible) {
      const first = firstIncompleteSlot();
      if (first) selectSlot(first);
      else closeKeypad();
    }
  });

  const list = node.querySelector('.dist-list');
  group.items.forEach((_, itemIndex) => {
    list.appendChild(buildDistItem(group, index, itemIndex));
  });

  node.querySelector('.add-item').addEventListener('click', () => {
    group.items.push('');
    renderDist();
    save();
    activateSlot({ kind: 'dist', groupIndex: index, itemIndex: group.items.length - 1 });
  });

  updateGroupResult(group, node);
  return node;
}

function renderDist() {
  const list = $('.group-list[data-list="dist"]');
  if (!list) return;
  list.replaceChildren(...state.dist.groups.map((group, index) => buildGroup(group, index)));
  renderSummary();
}

/* ---------------- 渲染：汇总 ---------------- */

function buildSummaryRound(row) {
  const node = document.createElement('div');
  node.className = 'sum-round';
  const number = document.createElement('span');
  number.className = 'sr-no';
  number.textContent = `测回 ${row.index + 1}`;
  const cell = (value) => {
    const span = document.createElement('span');
    span.className = 'sr-val';
    span.textContent = value != null ? formatAngle(value) : '—';
    return span;
  };
  node.append(number, cell(row.left), cell(row.right), cell(row.one));
  return node;
}

function renderSummary() {
  const sum = computeSummary();

  $('#sum-final').textContent = sum.final != null ? formatAngle(sum.final) : '—';
  $('#sum-eyebrow').textContent = sum.oneSets.length
    ? '各测回平均'
    : sum.final != null
      ? '单盘平均'
      : '各测回平均';

  const rounds = $('#sum-rounds');
  rounds.replaceChildren();
  if (!sum.rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '—';
    rounds.appendChild(empty);
  } else {
    const head = document.createElement('div');
    head.className = 'sum-head';
    ['', '左', '右', '一'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      head.appendChild(span);
    });
    rounds.appendChild(head);
    sum.rows.forEach((row) => rounds.appendChild(buildSummaryRound(row)));
  }

  const checks = $('#sum-checks');
  checks.replaceChildren();
  const checkItems = [
    { label: '半测回互差', value: sum.maxHalfDiff, limit: LIMITS.half },
    { label: '各测回互差', value: sum.oneSpread, limit: LIMITS.round },
  ];
  checkItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'check';
    const label = document.createElement('span');
    label.textContent = item.label;
    const value = document.createElement('b');
    value.textContent = item.value != null ? formatDelta(item.value) : '—';
    if (item.value != null) value.classList.add(item.value <= item.limit ? 'ok' : 'warn');
    row.append(label, value);
    checks.appendChild(row);
  });

  const dist = $('#sum-dist');
  dist.replaceChildren();
  const groups = state.dist.groups
    .map((group) => ({
      name: group.name,
      stats: distanceStats(group.items.map(parseDistance)),
    }))
    .filter((item) => item.stats);
  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '—';
    dist.appendChild(empty);
  } else {
    groups.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'sum-dist-row';
      const name = document.createElement('span');
      name.className = 'sd-name';
      name.textContent = item.name;
      const value = document.createElement('b');
      value.textContent = `${formatMeters(item.stats.mean)} m`;
      row.append(name, value);
      dist.appendChild(row);
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
    const items = [];
    state[side].rounds.forEach((round, index) => {
      const angle = computeRound(side, round);
      if (angle != null) items.push(`测回${index + 1} ${formatAngle(angle)}`);
    });
    if (!items.length) return null;
    const angles = state[side].rounds
      .map((round) => computeRound(side, round))
      .filter((value) => value != null);
    return `${label}：${items.join('；')}；平均 ${formatAngle(meanAngles(angles))}`;
  };
  const leftLine = faceLine('left', '盘左');
  const rightLine = faceLine('right', '盘右');
  if (leftLine) lines.push(leftLine);
  if (rightLine) lines.push(rightLine);

  if (sum.final != null) {
    if (sum.oneSets.length) {
      lines.push(
        `各测回平均值：${formatAngle(sum.final)}（一测回平均，${sum.oneSets.length} 个测回）`,
      );
    } else {
      const only = sum.leftAvg != null ? '盘左' : '盘右';
      lines.push(`单盘平均：${formatAngle(sum.final)}（仅${only}，未与另一盘配对）`);
    }
  }
  if (sum.maxHalfDiff != null) lines.push(`半测回互差最大值：${formatDelta(sum.maxHalfDiff)}`);

  const distances = state.dist.groups
    .map((group) => {
      const stats = distanceStats(group.items.map(parseDistance));
      if (!stats) return null;
      return `${group.name || '方向'}：${formatMeters(stats.mean)} m（${stats.count} 次，极差 ${formatMm(stats.rangeMm)} mm）`;
    })
    .filter(Boolean);
  if (distances.length) lines.push(`距离：${distances.join('；')}`);
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function copyRecord() {
  try {
    await copyText(buildRecordText());
    toast('已复制');
  } catch {
    toast('复制失败');
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
    toast('已复制');
  } catch {
    toast('分享失败');
  }
}

/* ---------------- 标签页 ---------------- */

function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'left';
  activeTab = tab;
  state.tab = tab;

  $$('.mode').forEach((button) => {
    const on = button.dataset.tab === tab;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', String(on));
  });
  $$('.panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });

  if (tab === 'summary') {
    closeKeypad();
    renderSummary();
  } else if (keypadVisible) {
    const first = firstIncompleteSlot() || getSlots()[0];
    if (first) selectSlot(first);
    else closeKeypad();
  } else {
    active = null;
    syncActive();
  }
  save();
}

/* ---------------- 静态事件 ---------------- */

function syncMetaInputs() {
  $('#meta-station').value = state.meta.station ?? '';
  $('#meta-target-a').value = state.meta.targetA ?? '';
  $('#meta-target-b').value = state.meta.targetB ?? '';
}

function bindMeta() {
  const map = {
    station: $('#meta-station'),
    targetA: $('#meta-target-a'),
    targetB: $('#meta-target-b'),
  };
  Object.entries(map).forEach(([key, input]) => {
    input.value = state.meta[key] ?? '';
    input.addEventListener('input', () => {
      state.meta[key] = input.value;
      save();
    });
  });
}

function loadDemo() {
  if (hasAnyData() && !confirm('载入示例会覆盖当前数据，继续？')) return;
  state = demoState();
  activeTab = 'left';
  active = null;
  closeKeypad();
  syncMetaInputs();
  renderFace('left');
  renderFace('right');
  renderDist();
  renderSummary();
  setTab('left');
  save();
  toast('已载入示例');
}

function bindStatic() {
  bindMeta();

  $$('.mode').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  $$('[data-mode-group]').forEach((group) => {
    const side = group.dataset.modeGroup;
    $$('[data-mode]', group).forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        if (state[side].mode === mode) return;
        state[side].mode = mode;
        active = null;
        renderFace(side);
        renderSummary();
        save();
        if (keypadVisible) {
          const first = firstIncompleteSlot();
          if (first) selectSlot(first);
          else closeKeypad();
        }
      });
    });
  });

  $$('[data-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const side = button.dataset.add;
      state[side].rounds.push(createRound());
      renderFace(side);
      renderSummary();
      save();
      const roundIndex = state[side].rounds.length - 1;
      const role = state[side].mode === 'angles' ? 'angle' : 'a';
      activateSlot({ kind: 'angle', side, roundIndex, role, part: 'd' });
    });
  });

  $$('[data-clear]').forEach((button) => {
    button.addEventListener('click', () => {
      const which = button.dataset.clear;
      const label = which === 'left' ? '盘左' : which === 'right' ? '盘右' : '距离';
      if (!confirm(`清空${label}？`)) return;
      if (which === 'dist') state.dist = { groups: [createGroup('方向 1')] };
      else state[which] = { ...state[which], rounds: [createRound()] };
      active = null;
      if (which === 'dist') renderDist();
      else renderFace(which);
      renderSummary();
      save();
      const first = firstIncompleteSlot();
      if (first) activateSlot(first);
      else closeKeypad();
    });
  });

  $('#btn-add-group').addEventListener('click', () => {
    const index = state.dist.groups.length;
    state.dist.groups.push(createGroup(`方向 ${index + 1}`));
    renderDist();
    save();
    activateSlot({ kind: 'dist', groupIndex: index, itemIndex: 0 });
  });

  $('#btn-demo').addEventListener('click', loadDemo);
  $('#btn-help').addEventListener('click', () => {
    $('#help-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  });
  $('#btn-sheet-close').addEventListener('click', () => {
    $('#help-sheet').hidden = true;
    document.body.style.overflow = '';
  });
  $('#help-sheet').addEventListener('click', (event) => {
    if (event.target === $('#help-sheet')) {
      $('#help-sheet').hidden = true;
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#help-sheet').hidden) {
      $('#help-sheet').hidden = true;
      document.body.style.overflow = '';
    }
  });

  $('#btn-copy').addEventListener('click', copyRecord);
  $('#btn-share').addEventListener('click', shareRecord);

  bindKeypad();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function syncTopbarHeight() {
  const topbar = $('.topbar');
  if (topbar) document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
}

function init() {
  bindStatic();
  syncMetaInputs();
  renderFace('left');
  renderFace('right');
  renderDist();
  renderSummary();
  setTab(activeTab);
  if (activeTab !== 'summary') {
    const first = firstIncompleteSlot();
    if (first) activateSlot(first);
  }
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  registerSW();
}

init();
