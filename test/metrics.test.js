import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filter, totals, previousRange, series, funnel, delta } from '../src/metrics.js';

const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url)));

test('previousRange has same length and ends the day before', () => {
  assert.deepEqual(previousRange('2026-10-02', '2026-10-31'), ['2026-09-02', '2026-10-01']);
});
test('totals: aov = revenue / orders, conversion = orders / sessions', () => {
  const x = totals(filter(data.rows, '2026-10-01', '2026-10-31'));
  assert.ok(Math.abs(x.aov - x.r / x.o) < 1e-9);
  assert.ok(x.conv > 0.01 && x.conv < 0.1);
});
test('monthly series sums to the total', () => {
  const rows = filter(data.rows, '2025-05-01', '2026-10-31');
  const sum = series(rows, 'month').reduce((a, p) => a + p.r, 0);
  assert.equal(sum, totals(rows).r);
});
test('funnel is monotonically non-increasing', () => {
  const f = funnel(data.rows);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].n <= f[i - 1].n);
});
test('channel filter narrows rows; delta handles zero', () => {
  assert.ok(filter(data.rows, '2026-10-01', '2026-10-31', ['Email']).every((r) => r.ch === 'Email'));
  assert.equal(delta(5, 0), null);
});
test('data is flagged synthetic and cohorts are triangular', () => {
  assert.equal(data.meta.synthetic, true);
  data.cohorts.forEach((c, i) => assert.equal(c.ret.length, data.cohorts.length - i));
});
