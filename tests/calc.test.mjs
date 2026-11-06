import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIRCLE_SEC,
  dmsPartsToSeconds,
  secondsToDms,
  formatAngle,
  formatDelta,
  clockwiseAngleSec,
  angleFromReadings,
  mean,
  spread,
  meanAngles,
  spreadAngles,
  angleSeparationSec,
  roundHalfEven,
  formatMeters,
  formatExactMeters,
  formatDetailedMeters,
  parseDistance,
  distanceStats,
} from '../calc.js';

const dms = (d, m, s) => ({ d: String(d), m: String(m), s: String(s) });
const sec = (d, m, s) => d * 3600 + m * 60 + s;

test('dmsPartsToSeconds 基本解析与校验', () => {
  assert.equal(dmsPartsToSeconds(dms(0, 20, 42)), sec(0, 20, 42));
  assert.equal(dmsPartsToSeconds(dms(125, 35, 0)), sec(125, 35, 0));
  assert.equal(dmsPartsToSeconds(dms(359, 59, 59.99)), sec(359, 59, 59.99));
  assert.equal(dmsPartsToSeconds({ d: '', m: '1', s: '2' }), null);
  assert.equal(dmsPartsToSeconds(dms(0, 60, 0)), null);
  assert.equal(dmsPartsToSeconds(dms(0, 0, 60)), null);
  assert.equal(dmsPartsToSeconds(dms(360, 0, 0)), null);
  assert.equal(dmsPartsToSeconds(dms(0, 0, '4.123')), null);
});

test('secondsToDms / formatAngle / formatDelta', () => {
  assert.deepEqual(secondsToDms(sec(125, 14, 21)), { sign: 1, d: 125, m: 14, s: 21 });
  assert.equal(formatAngle(sec(125, 14, 21)), '125°14′21″');
  assert.equal(formatAngle(sec(0, 5, 3)), '0°05′03″');
  assert.equal(formatAngle(sec(125, 14, 20.5)), '125°14′20.5″');
  assert.equal(formatDelta(6), '6″');
  assert.equal(formatDelta(66), '1′06″');
  // 秒进位：59.999″ → 60.00″ → 下一分
  assert.equal(formatAngle(sec(125, 14, 59.999)), '125°15′00″');
});

test('clockwiseAngleSec 处理跨 0°', () => {
  assert.equal(clockwiseAngleSec(sec(350, 0, 0), sec(10, 0, 0)), sec(20, 0, 0));
  assert.equal(clockwiseAngleSec(sec(0, 20, 42), sec(125, 35, 0)), sec(125, 14, 18));
  assert.equal(clockwiseAngleSec(sec(270, 11, 42), sec(35, 26, 12)), sec(125, 14, 30));
  assert.equal(clockwiseAngleSec(sec(0, 0, 0), sec(0, 0, 0)), 0);
  assert.ok(clockwiseAngleSec(sec(10, 0, 0), sec(10, 0, 0) + CIRCLE_SEC) === 0);
});

test('GCP2 参考表：盘左/盘右半测回角值与平均', () => {
  // 测回1 盘左：GCP1 00°20′42″ → GCP3 125°35′00″
  const l1 = angleFromReadings(dms(0, 20, 42), dms(125, 35, 0));
  // 测回2 盘左：90°11′36″ → 215°26′00″
  const l2 = angleFromReadings(dms(90, 11, 36), dms(215, 26, 0));
  // 测回1 盘右：180°21′12″ → 305°35′36″
  const r1 = angleFromReadings(dms(180, 21, 12), dms(305, 35, 36));
  // 测回2 盘右：270°11′42″ → 35°26′12″
  const r2 = angleFromReadings(dms(270, 11, 42), dms(35, 26, 12));

  assert.equal(formatAngle(l1), '125°14′18″');
  assert.equal(formatAngle(l2), '125°14′24″');
  assert.equal(formatAngle(r1), '125°14′24″');
  assert.equal(formatAngle(r2), '125°14′30″');

  const leftAvg = mean([l1, l2]);
  const rightAvg = mean([r1, r2]);
  assert.equal(formatAngle(leftAvg), '125°14′21″');
  assert.equal(formatAngle(rightAvg), '125°14′27″');

  const oneSet = [mean([l1, r1]), mean([l2, r2])];
  assert.equal(formatAngle(oneSet[0]), '125°14′21″');
  assert.equal(formatAngle(oneSet[1]), '125°14′27″');
  assert.equal(formatAngle(mean(oneSet)), '125°14′24″');
  assert.equal(formatDelta(Math.abs(leftAvg - rightAvg)), '6″');
});

test('GCP3 参考表（按 153°/333° 读数）：盘左/盘右与一测回', () => {
  const l1 = angleFromReadings(dms(0, 2, 6), dms(63, 23, 18));
  const r1 = angleFromReadings(dms(180, 2, 12), dms(243, 23, 30));
  const l2 = angleFromReadings(dms(90, 7, 30), dms(153, 28, 54));
  const r2 = angleFromReadings(dms(270, 7, 42), dms(333, 28, 48));
  assert.equal(formatAngle(l1), '63°21′12″');
  assert.equal(formatAngle(r1), '63°21′18″');
  assert.equal(formatAngle(l2), '63°21′24″');
  assert.equal(formatAngle(r2), '63°21′06″');
  assert.equal(formatAngle(mean([l1, l2])), '63°21′18″');
  assert.equal(formatAngle(mean([r1, r2])), '63°21′12″');
  assert.equal(formatAngle(mean([mean([l1, r1]), mean([l2, r2])])), '63°21′15″');
});

test('四舍六入五成双：与参考表距离均值一致', () => {
  assert.equal(roundHalfEven(59.2305, 3), 59.23);
  assert.equal(roundHalfEven(114.5515, 3), 114.552);
  assert.equal(roundHalfEven(55.26975, 3), 55.27);
  assert.equal(roundHalfEven(2.5, 0), 2);
  assert.equal(roundHalfEven(3.5, 0), 4);
  assert.equal(roundHalfEven(0.125, 2), 0.12);
  assert.equal(formatMeters(114.55225), '114.552');
  assert.equal(formatExactMeters(59.2305), '59.2305');
  assert.equal(formatExactMeters(114.55225), '114.5523');
  // 大数时不能把 0.666… 误判为 0.5
  assert.equal(roundHalfEven(6000.000666666667, 3), 6000.001);
  assert.equal(formatMeters(distanceStats([6000.0, 6000.001, 6000.001]).mean), '6000.001');
});

test('距离统计：GCP2 两个方向', () => {
  const d1 = distanceStats([59.23, 59.23, 59.231, 59.231]);
  assert.equal(d1.count, 4);
  assert.equal(formatMeters(d1.mean), '59.230');
  assert.equal(formatExactMeters(d1.mean), '59.2305');
  assert.equal(formatMeters(distanceStats([114.552, 114.551, 114.553, 114.553]).mean), '114.552');

  const d2 = distanceStats([114.548, 114.548, 114.55, 114.55]);
  assert.equal(formatMeters(d2.mean), '114.549');
  const d3 = distanceStats([55.269, 55.269, 55.271, 55.27]);
  assert.equal(formatMeters(d3.mean), '55.270');
  assert.equal(distanceStats([]), null);
});

test('parseDistance 解析', () => {
  assert.equal(parseDistance('59.230'), 59.23);
  assert.equal(parseDistance(' 114.552 '), 114.552);
  assert.equal(parseDistance('59,23'), 59.23);
  assert.equal(parseDistance('0'), null);
  assert.equal(parseDistance('-1'), null);
  assert.equal(parseDistance('abc'), null);
});

test('跨 0°/360° 的环形平均与较差', () => {
  const a = sec(359, 59, 50);
  const b = sec(0, 0, 10);
  assert.equal(formatAngle(meanAngles([a, b])), '0°00′00″');
  assert.equal(spreadAngles([a, b]), 20);
  assert.equal(formatDelta(spreadAngles([a, b])), '20″');
  assert.equal(angleSeparationSec(a, b), 20);
  // 350° 与 10° 的平均为 0°
  assert.equal(formatAngle(meanAngles([sec(350, 0, 0), sec(10, 0, 0)])), '0°00′00″');
  // 普通角度不受影响
  assert.equal(formatAngle(meanAngles([sec(125, 14, 18), sec(125, 14, 24)])), '125°14′21″');
  assert.equal(spreadAngles([sec(125, 14, 18), sec(125, 14, 24)]), 6);
});

test('formatDetailedMeters 保留未取整到毫米的均值', () => {
  assert.equal(formatDetailedMeters(114.55225), '114.55225');
  assert.equal(formatDetailedMeters(59.2305), '59.2305');
  assert.equal(formatDetailedMeters(59.23), '59.230');
  assert.equal(formatDetailedMeters(distanceStats([55.269, 55.269, 55.271, 55.27]).mean), '55.26975');
});
