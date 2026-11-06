/**
 * app.js —— 测回计算器
 * 盘左 / 盘右分开录入，每个读数后面跟一个距离框；汇总页给各测回平均角和水平距离。
 */
import {
  angleFromReadings,
  meanAngles,
  formatAngle,
  formatMeters,
  parseDistance,
  distanceStats,
} from './calc.js';

const STORE_KEY = 'tscalc.v2';
const VERSION = 2;
const TABS = ['left', 'right', 'summary'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- 状态 ---------------- */

function emptyReading() {
  return { d: '', m: '', s: '', dist: '' };
}

function createRound() {
  return {
    left: { a: emptyReading(), b: emptyReading() },
    right: { a: emptyReading(), b: emptyReading() },
  };
}

function defaultState() {
  return {
    version: VERSION,
    rounds: [createRound(), createRound()],
    tab: 'left',
  };
}

function normalizeReading(raw) {
  return {
    d: String(raw?.d ?? ''),
    m: String(raw?.m ?? ''),
    s: String(raw?.s ?? ''),
    dist: String(raw?.dist ?? ''),
  };
}

function normalizeState(raw) {
  if (!raw || raw.version !== VERSION || !Array.isArray(raw.rounds)) return defaultState();
  const rounds = raw.rounds.map((round) => ({
    left: {
      a: normalizeReading(round?.left?.a),
      b: normalizeReading(round?.left?.b),
    },
    right: {
      a: normalizeReading(round?.right?.a),
      b: normalizeReading(round?.right?.b),
    },
  }));
  if (!rounds.length) return defaultState();
  return {
    version: VERSION,
    rounds,
    tab: TABS.includes(raw.tab) ? raw.tab : 'left',
  };
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

function reading(d, m, s, dist) {
  return { d: String(d), m: String(m), s: String(s), dist: String(dist) };
}

function demoState() {
  return {
    version: VERSION,
    rounds: [
      {
        left: {
          a: reading(0, 20, 42, '59.230'),
          b: reading(125, 35, 0, '114.552'),
        },
        right: {
          a: reading(180, 21, 12, '59.230'),
          b: reading(305, 35, 36, '114.551'),
        },
      },
      {
        left: {
          a: reading(90, 11, 36, '59.231'),
          b: reading(215, 26, 0, '114.553'),
        },
        right: {
          a: reading(270, 11, 42, '59.231'),
          b: reading(35, 26, 12, '114.553'),
        },
      },
    ],
    tab: 'left',
  };
}

function hasAnyData() {
  return state.rounds.some((round) =>
    ['left', 'right'].some((side) =>
      ['a', 'b'].some((target) => {
        const item = round[side][target];
        return item.d || item.m || item.s || item.dist;
      }),
    ),
  );
}

/* ---------------- 计算 ---------------- */

function oneSetAngle(round) {
  const left = angleFromReadings(round.left.a, round.left.b);
  const right = angleFromReadings(round.right.a, round.right.b);
  if (left == null || right == null) return null;
  return meanAngles([left, right]);
}

function targetDistance(target) {
  const values = [];
  state.rounds.forEach((round) => {
    ['left', 'right'].forEach((side) => {
      const value = parseDistance(round[side][target].dist);
      if (value != null) values.push(value);
    });
  });
  return distanceStats(values);
}

function computeSummary() {
  const angles = state.rounds.map(oneSetAngle).filter((value) => value != null);
  return {
    angle: meanAngles(angles),
    distA: targetDistance('a'),
    distB: targetDistance('b'),
  };
}

/* ---------------- 键盘槽位 ---------------- */

function getSlots() {
  if (activeTab !== 'left' && activeTab !== 'right') return [];
  const side = activeTab;
  const slots = [];
  state.rounds.forEach((round, roundIndex) => {
    ['a', 'b'].forEach((target) => {
      ['d', 'm', 's'].forEach((part) => {
        slots.push({ kind: 'angle', roundIndex, side, target, part });
      });
      slots.push({ kind: 'dist', roundIndex, side, target });
    });
  });
  return slots;
}

function sameSlot(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'angle') {
    return (
      a.roundIndex === b.roundIndex &&
      a.side === b.side &&
      a.target === b.target &&
      a.part === b.part
    );
  }
  return a.roundIndex === b.roundIndex && a.side === b.side && a.target === b.target;
}

function firstIncompleteSlot() {
  for (const slot of getSlots()) {
    const item = state.rounds[slot.roundIndex][slot.side][slot.target];
    if (slot.kind === 'angle') {
      if (!item[slot.part]) return slot;
    } else if (!String(item.dist ?? '').trim()) {
      return slot;
    }
  }
  return null;
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
  const panel = active.side === 'left' ? '#panel-left' : '#panel-right';
  const row = `${panel} .round[data-index="${active.roundIndex}"] .read-row[data-target="${active.target}"]`;
  if (active.kind === 'angle') {
    return $(`${row} .cell[data-part="${active.part}"]`);
  }
  return $(`${row} .dist-cell`);
}

function syncActive() {
  $$('.cell.active, .dist-cell.active').forEach((el) => el.classList.remove('active'));
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
  const side = active.side === 'left' ? '盘左' : '盘右';
  const tail = active.kind === 'angle' ? '读数' : '距离';
  caption.textContent = `${side} · 测回 ${active.roundIndex + 1} · ${active.target.toUpperCase()} ${tail}`;
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

function refreshReading(roundIndex, side, target) {
  const roundEl = $(`#panel-${side} .round[data-index="${roundIndex}"]`);
  if (!roundEl) return;
  const item = state.rounds[roundIndex][side][target];
  const row = roundEl.querySelector(`.read-row[data-target="${target}"]`);
  if (!row) return;

  ['d', 'm', 's'].forEach((part) => {
    const cell = row.querySelector(`.cell[data-part="${part}"]`);
    if (!cell) return;
    const valueEl = cell.querySelector('.cell-val');
    if (valueEl) valueEl.textContent = cellText(part, item[part]);
    cell.classList.toggle('invalid', item[part] !== '' && !partValid(part, item[part]));
  });
  const distEl = row.querySelector('.dist-val');
  if (distEl) distEl.textContent = item.dist;
  row.querySelector('.dist-cell')?.classList.toggle('invalid', Boolean(item.dist) && parseDistance(item.dist) == null);

  const half = angleFromReadings(
    state.rounds[roundIndex][side].a,
    state.rounds[roundIndex][side].b,
  );
  const angleEl = roundEl.querySelector('.round-angle');
  if (angleEl) angleEl.textContent = half == null ? '' : formatAngle(half);

  renderSummary();
  save();
}

function handleAngleKey(key) {
  if (!active || active.kind !== 'angle') return;
  const item = state.rounds[active.roundIndex][active.side][active.target];

  if (key === 'clear') {
    item.d = '';
    item.m = '';
    item.s = '';
    active.part = 'd';
    refreshReading(active.roundIndex, active.side, active.target);
    selectSlot(active);
    return;
  }

  if (key === 'next') {
    advance();
    return;
  }

  if (key === 'back') {
    if (item[active.part]) {
      item[active.part] = item[active.part].slice(0, -1);
      refreshReading(active.roundIndex, active.side, active.target);
    } else {
      const prev = prevSlot(active);
      if (prev) selectSlot(prev);
    }
    return;
  }

  if (key === 'dot') return;
  if (!/^\d$/.test(key) && key !== '00') return;

  const max = active.part === 'd' ? 3 : 2;
  const current = item[active.part] || '';
  const addition = key === '00' ? '00' : key;
  const nextValue = (current + addition).slice(0, max);
  if (nextValue === current) return;

  item[active.part] = nextValue;
  refreshReading(active.roundIndex, active.side, active.target);

  if (partValid(active.part, nextValue) && nextValue.length >= max) advance();
}

/* ---------------- 距离输入 ---------------- */

function validDistanceText(value) {
  return /^\d{0,5}(?:\.\d{0,4})?$/.test(value);
}

function handleDistKey(key) {
  if (!active || active.kind !== 'dist') return;
  const item = state.rounds[active.roundIndex][active.side][active.target];
  let value = String(item.dist ?? '');

  if (key === 'clear') {
    item.dist = '';
    refreshReading(active.roundIndex, active.side, active.target);
    return;
  }

  if (key === 'next') {
    advance();
    return;
  }

  if (key === 'back') {
    if (value) {
      item.dist = value.slice(0, -1);
      refreshReading(active.roundIndex, active.side, active.target);
    } else {
      const prev = prevSlot(active);
      if (prev) selectSlot(prev);
    }
    return;
  }

  if (key === 'dot') {
    if (!value.includes('.')) {
      const nextValue = value === '' ? '0.' : `${value}.`;
      if (validDistanceText(nextValue)) {
        item.dist = nextValue;
        refreshReading(active.roundIndex, active.side, active.target);
      }
    }
    return;
  }

  if (!/^\d$/.test(key) && key !== '00') return;
  const nextValue = value + (key === '00' ? '00' : key);
  if (validDistanceText(nextValue)) {
    item.dist = nextValue;
    refreshReading(active.roundIndex, active.side, active.target);
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
  else handleDistKey(key);
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
  const half = angleFromReadings(round[side].a, round[side].b);
  node.querySelector('.round-angle').textContent = half == null ? '' : formatAngle(half);

  node.querySelector('.btn-del').addEventListener('click', () => {
    if (state.rounds.length <= 1) state.rounds[0] = createRound();
    else state.rounds.splice(index, 1);
    active = null;
    renderFaces();
    save();
    if (keypadVisible) {
      const first = firstIncompleteSlot();
      if (first) selectSlot(first);
      else closeKeypad();
    }
  });

  ['a', 'b'].forEach((target) => {
    const row = node.querySelector(`.read-row[data-target="${target}"]`);
    const item = round[side][target];
    row.querySelectorAll('.cell').forEach((cell) => {
      const part = cell.dataset.part;
      cell.querySelector('.cell-val').textContent = cellText(part, item[part]);
      cell.classList.toggle('invalid', item[part] !== '' && !partValid(part, item[part]));
      cell.addEventListener('click', () => {
        activateSlot({ kind: 'angle', roundIndex: index, side, target, part });
      });
    });
    const distCell = row.querySelector('.dist-cell');
    distCell.querySelector('.dist-val').textContent = item.dist;
    distCell.classList.toggle('invalid', Boolean(item.dist) && parseDistance(item.dist) == null);
    distCell.addEventListener('click', () => {
      activateSlot({ kind: 'dist', roundIndex: index, side, target });
    });
  });

  return node;
}

function renderFace(side) {
  const list = $(`.round-list[data-face="${side}"]`);
  if (!list) return;
  list.replaceChildren(...state.rounds.map((round, index) => buildRound(side, round, index)));
}

function renderFaces() {
  renderFace('left');
  renderFace('right');
  renderSummary();
}

/* ---------------- 渲染：汇总 ---------------- */

function renderSummary() {
  const summary = computeSummary();

  const oneSets = $('#sum-one-sets');
  oneSets.replaceChildren();
  state.rounds.forEach((round, index) => {
    const angle = oneSetAngle(round);
    const row = document.createElement('div');
    row.className = 'stat-row';
    const label = document.createElement('span');
    label.textContent = `测回 ${index + 1}`;
    const value = document.createElement('b');
    value.textContent = angle != null ? formatAngle(angle) : '—';
    row.append(label, value);
    oneSets.appendChild(row);
  });

  $('#sum-angle').textContent = summary.angle != null ? formatAngle(summary.angle) : '—';
  $('#sum-dist-a').textContent = summary.distA ? `${formatMeters(summary.distA.mean)} m` : '—';
  $('#sum-dist-b').textContent = summary.distB ? `${formatMeters(summary.distB.mean)} m` : '—';
}

/* ---------------- 页面切换 ---------------- */

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

/* ---------------- 动作 ---------------- */

function newStation() {
  state = defaultState();
  active = null;
  activeTab = 'left';
  closeKeypad();
  renderFaces();
  setTab('left');
  const first = getSlots()[0];
  if (first) activateSlot(first);
  save();
  toast('已新建测站');
  window.scrollTo({ top: 0 });
}

function loadDemo() {
  if (hasAnyData() && !confirm('载入示例会覆盖当前数据，继续？')) return;
  state = demoState();
  active = null;
  activeTab = 'left';
  closeKeypad();
  renderFaces();
  setTab('left');
  save();
  toast('已载入示例');
  window.scrollTo({ top: 0 });
}

/* ---------------- 事件 ---------------- */

function bindStatic() {
  $$('.mode').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  $$('[data-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const side = button.dataset.add;
      state.rounds.push(createRound());
      renderFaces();
      save();
      activateSlot({
        kind: 'angle',
        roundIndex: state.rounds.length - 1,
        side,
        target: 'a',
        part: 'd',
      });
    });
  });

  $('#btn-new-station').addEventListener('click', newStation);
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

  bindKeypad();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function init() {
  bindStatic();
  renderFaces();
  setTab(activeTab);
  if (activeTab !== 'summary') {
    const first = firstIncompleteSlot();
    if (first) activateSlot(first);
  }
  registerSW();
}

init();
