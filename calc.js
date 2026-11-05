/**
 * calc.js —— 全站仪测回计算核心（纯函数，浏览器 / Node 共用）
 *
 * 角度内部统一用“秒”作单位：1° = 3600″，整圆 = 1 296 000″。
 * 距离以米（m）存储，展示时按“四舍六入五成双”取至毫米。
 */

export const CIRCLE_SEC = 360 * 3600;
export const ARCMIN_SEC = 60;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 三个输入框是否都已填写 */
export function dmsFilled(parts) {
  if (!parts) return false;
  return (
    String(parts.d ?? '').trim() !== '' &&
    String(parts.m ?? '').trim() !== '' &&
    String(parts.s ?? '').trim() !== ''
  );
}

/** 度分秒三个输入框 → 总秒数；非法或未填完返回 null */
export function dmsPartsToSeconds(parts) {
  if (!dmsFilled(parts)) return null;
  const dStr = String(parts.d).trim();
  const mStr = String(parts.m).trim();
  const sStr = String(parts.s).trim().replace(',', '.');
  if (!/^\d{1,3}$/.test(dStr)) return null;
  if (!/^\d{1,2}$/.test(mStr)) return null;
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(sStr)) return null;
  const d = Number(dStr);
  const m = Number(mStr);
  const s = Number(sStr);
  if (d > 359 || m > 59 || s >= 60) return null;
  return d * 3600 + m * 60 + s;
}

/** 三个输入框是否填满且合法 */
export function dmsValid(parts) {
  return dmsFilled(parts) && dmsPartsToSeconds(parts) !== null;
}

/** 总秒数 → {d, m, s}，秒保留两位小数并处理进位 */
export function secondsToDms(totalSec) {
  if (!Number.isFinite(totalSec)) return { sign: 1, d: 0, m: 0, s: 0 };
  const sign = totalSec < 0 ? -1 : 1;
  let t = Math.abs(totalSec);
  t = Math.round(t * 100) / 100;
  if (t >= CIRCLE_SEC) t %= CIRCLE_SEC;
  let d = Math.floor(t / 3600);
  let rem = t - d * 3600;
  let m = Math.floor(rem / 60);
  let s = Math.round((rem - m * 60) * 100) / 100;
  if (s >= 60) {
    s -= 60;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  if (d >= 360) d = 0;
  return { sign, d, m, s };
}

function secText(s, pad = true) {
  const r = Math.round(s * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-9) {
    const v = Math.round(r);
    return pad ? pad2(v) : String(v);
  }
  let str = r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (pad && r < 10) str = '0' + str;
  return str;
}

/** 格式化角度：125°14′21″；秒不是整数时保留小数，如 20.5″ */
export function formatAngle(totalSec) {
  if (!Number.isFinite(totalSec)) return '—';
  const p = secondsToDms(totalSec);
  return `${p.d}°${pad2(p.m)}′${secText(p.s, true)}″`;
}

/** 格式化小差值（互差、较差）：6″、1′06″ */
export function formatDelta(totalSec) {
  if (!Number.isFinite(totalSec)) return '—';
  const p = secondsToDms(totalSec);
  if (p.d > 0) return `${p.d}°${pad2(p.m)}′${secText(p.s, true)}″`;
  if (p.m > 0) return `${p.m}′${secText(p.s, true)}″`;
  return `${secText(p.s, false)}″`;
}

/** 顺时针（读数增大方向）从 from 转到 to 的角值，范围 [0, 360) */
export function clockwiseAngleSec(fromSec, toSec) {
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) return null;
  let diff = (toSec - fromSec) % CIRCLE_SEC;
  if (diff < 0) diff += CIRCLE_SEC;
  return diff;
}

/** 由两个目标的水平度盘读数求半测回角值 */
export function angleFromReadings(aParts, bParts) {
  const a = dmsPartsToSeconds(aParts);
  const b = dmsPartsToSeconds(bParts);
  if (a === null || b === null) return null;
  return clockwiseAngleSec(a, b);
}

/** 算术平均；忽略 null / 非数字 */
export function mean(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (list.length === 0) return null;
  return list.reduce((sum, v) => sum + v, 0) / list.length;
}

/** 极差（最大值 - 最小值） */
export function spread(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (list.length < 2) return null;
  return Math.max(...list) - Math.min(...list);
}

/**
 * 四舍六入五成双（GB/T 8170 数值修约）。
 * 59.2305 → 59.230；114.5515 → 114.552
 */
export function roundHalfEven(value, decimals = 0) {
  if (!Number.isFinite(value)) return NaN;
  const f = 10 ** decimals;
  const scaled = value * f;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const eps = 1e-7 * Math.max(1, Math.abs(scaled));
  if (Math.abs(frac - 0.5) <= eps) {
    return (floor % 2 === 0 ? floor : floor + 1) / f;
  }
  return Math.round(scaled) / f;
}

/** 距离均值 → 三位小数（毫米）字符串 */
export function formatMeters(value) {
  if (!Number.isFinite(value)) return '—';
  return roundHalfEven(value, 3).toFixed(3);
}

/** 距离均值 → 最多四位小数的字符串（至少三位，用于显示精确均值） */
export function formatExactMeters(value) {
  if (!Number.isFinite(value)) return '—';
  let s = value.toFixed(4);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  const dot = s.indexOf('.');
  const dec = dot === -1 ? 0 : s.length - dot - 1;
  if (dec < 3) s += (dot === -1 ? '.' : '') + '0'.repeat(3 - dec);
  return s;
}

/** 毫米数格式化（最多一位小数） */
export function formatMm(mm) {
  if (!Number.isFinite(mm)) return '—';
  const r = roundHalfEven(mm, 1);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 解析距离输入（米）；非法返回 null */
export function parseDistance(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^\d{1,5}(?:\.\d{1,4})?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 距离统计：次数、均值、最小、最大、极差（mm） */
export function distanceStats(values) {
  const list = (values || []).filter((v) => Number.isFinite(v) && v > 0);
  if (list.length === 0) return null;
  const meanValue = list.reduce((sum, v) => sum + v, 0) / list.length;
  const min = Math.min(...list);
  const max = Math.max(...list);
  return {
    count: list.length,
    mean: meanValue,
    min,
    max,
    rangeMm: (max - min) * 1000,
  };
}
