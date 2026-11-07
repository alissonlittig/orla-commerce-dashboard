// Pure metric helpers (no DOM) so they can be tested with node:test.
export const DAY = 864e5;
const t = (iso) => Date.parse(iso + 'T00:00:00Z');

export function filter(rows, from, to, channels) {
  const a = t(from), b = t(to);
  return rows.filter((r) => { const x = t(r.d); return x >= a && x <= b && (!channels || channels.includes(r.ch)); });
}

export function totals(rows) {
  const z = rows.reduce((a, r) => ({ s: a.s + r.s, v: a.v + r.v, c: a.c + r.c, k: a.k + r.k, o: a.o + r.o, r: a.r + r.r }), { s: 0, v: 0, c: 0, k: 0, o: 0, r: 0 });
  return { ...z, aov: z.o ? z.r / z.o : 0, conv: z.s ? z.o / z.s : 0 };
}

/** Previous window of identical length, ending the day before `from`. */
export function previousRange(from, to) {
  const len = Math.round((t(to) - t(from)) / DAY) + 1;
  const pTo = new Date(t(from) - DAY), pFrom = new Date(pTo.getTime() - (len - 1) * DAY);
  return [pFrom.toISOString().slice(0, 10), pTo.toISOString().slice(0, 10)];
}

export function bucketKey(iso, grain) {
  if (grain === 'month') return iso.slice(0, 7) + '-01';
  if (grain === 'week') { const d = new Date(t(iso)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
  return iso;
}

export function series(rows, grain) {
  const m = new Map();
  for (const r of rows) {
    const k = bucketKey(r.d, grain);
    const a = m.get(k) ?? { d: k, s: 0, o: 0, r: 0 };
    a.s += r.s; a.o += r.o; a.r += r.r; m.set(k, a);
  }
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d)).map((a) => ({ ...a, aov: a.o ? a.r / a.o : 0 }));
}

export function funnel(rows) {
  const x = totals(rows);
  const steps = [['Sessions', x.s], ['Product views', x.v], ['Add to cart', x.c], ['Checkout', x.k], ['Orders', x.o]];
  return steps.map(([name, n], i) => ({ name, n, ofTop: x.s ? n / x.s : 0, step: i ? (steps[i - 1][1] ? n / steps[i - 1][1] : 0) : 1 }));
}

export function byChannel(rows, channels) {
  return channels.map((ch) => ({ ch, ...totals(rows.filter((r) => r.ch === ch)) }));
}

export const delta = (cur, prev) => (prev ? (cur - prev) / prev : null);
