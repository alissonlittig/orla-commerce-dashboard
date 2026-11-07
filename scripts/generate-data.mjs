// Deterministic synthetic data for the fictional store "Vela". No real customers or orders.
import { writeFileSync } from 'node:fs';

let s = 20261107;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = (a) => 1 + (rnd() - 0.5) * 2 * a;

const channels = {
  Search:   { share: 0.34, conv: 0.031, aov: 148 },
  Social:   { share: 0.24, conv: 0.016, aov: 118 },
  Email:    { share: 0.14, conv: 0.052, aov: 163 },
  Direct:   { share: 0.19, conv: 0.038, aov: 156 },
  Referral: { share: 0.09, conv: 0.024, aov: 131 },
};
const categories = { Home: 0.31, Apparel: 0.26, Beauty: 0.19, Outdoor: 0.14, Gifts: 0.10 };
const start = new Date(Date.UTC(2025, 4, 1)), end = new Date(Date.UTC(2026, 9, 31));
const rows = [];
for (let d = new Date(start), i = 0; d <= end; d = new Date(d.getTime() + 864e5), i++) {
  const iso = d.toISOString().slice(0, 10), dow = d.getUTCDay(), m = d.getUTCMonth(), day = d.getUTCDate();
  const growth = 1 + i / 540;
  const week = [0.92, 0.98, 1.04, 1.02, 1.0, 0.96, 0.9][dow];
  let season = 1;
  if (m === 10 && day >= 20) season = day >= 26 && day <= 30 ? 2.4 : 1.5; // Nov peak
  if (m === 11 && day <= 22) season = 1.35;
  if (m === 0 || m === 1 && day < 10) season = 0.88;
  for (const [ch, c] of Object.entries(channels)) {
    const bump = ch === 'Email' && dow === 2 ? 1.5 : 1;
    const sessions = Math.round(1750 * c.share * growth * week * season * bump * noise(0.1));
    const views = Math.round(sessions * 0.62 * noise(0.04));
    const cart = Math.round(views * 0.2 * noise(0.06));
    const checkout = Math.round(cart * 0.52 * noise(0.05));
    const orders = Math.round(Math.min(checkout * 0.74, sessions * c.conv * season ** 0.2 * (1 + i / 900) * noise(0.12)));
    const revenue = Math.round(orders * c.aov * (1 + i / 1500) * noise(0.07));
    rows.push({ d: iso, ch, s: sessions, v: views, c: cart, k: checkout, o: orders, r: revenue });
  }
}

// category revenue share per month
const months = [...new Set(rows.map((r) => r.d.slice(0, 7)))];
const catByMonth = months.map((m) => {
  const total = rows.filter((r) => r.d.startsWith(m)).reduce((a, r) => a + r.r, 0);
  let w = Object.values(categories).map((v) => v * noise(0.08));
  const sum = w.reduce((a, b) => a + b, 0);
  return { m, ...Object.fromEntries(Object.keys(categories).map((k, i) => [k, Math.round((total * w[i]) / sum)])) };
});

// cohorts: retention (% of cohort ordering again in month n) and size
const decay = [100, 21, 14.5, 11.5, 9.8, 8.6, 7.8, 7.1, 6.6, 6.2, 5.9, 5.6, 5.4, 5.2, 5.0, 4.9, 4.8, 4.7];
const cohorts = months.map((m, i) => {
  const size = Math.round(1350 * (1 + i / 30) * noise(0.1) * (m.endsWith('-11') ? 1.5 : 1));
  const quality = noise(0.1) * (1 + i / 120);
  const ret = Array.from({ length: months.length - i }, (_, n) => n === 0 ? 100 : +(decay[n] * quality * noise(0.06)).toFixed(1));
  return { m, size, ret };
});

writeFileSync(new URL('../public/data.json', import.meta.url), JSON.stringify({
  meta: { store: 'Vela', currency: 'USD', synthetic: true, from: rows[0].d, to: rows.at(-1).d },
  channels: Object.keys(channels), categories: Object.keys(categories), rows, catByMonth, cohorts,
}));
console.log(`rows=${rows.length} cohorts=${cohorts.length}`);
