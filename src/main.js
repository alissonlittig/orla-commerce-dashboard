import * as d3 from 'd3';
import './style.css';
import { filter, totals, previousRange, series, funnel, byChannel, delta, DAY } from './metrics.js';

const COLORS = { Search: '#0f5c55', Social: '#e4572e', Email: '#d9a21b', Direct: '#3b4a6b', Referral: '#8a8577' };
const RANGES = [['30D', 30, 'day'], ['90D', 90, 'day'], ['6M', 182, 'week'], ['All', 0, 'month']];
const usd = d3.format('$,.0f'), usd2 = d3.format('$,.2f'), pct = d3.format('.1%'), int = d3.format(',');
const compact = (v) => d3.format('$.3~s')(v).replace('G', 'B');
const fmtDay = d3.utcFormat('%b %-d'), fmtMon = d3.utcFormat("%b '%y");
const parse = (iso) => new Date(iso + 'T00:00:00Z');
const $ = (id) => document.getElementById(id);
const tip = $('tip');

const state = { rangeIdx: 1, channels: [], data: null };

function showTip(ev, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, x = Math.min(ev.clientX + 14, innerWidth - w - 8);
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = ev.clientY + 16 + 'px';
}
const hideTip = () => { tip.hidden = true; };

function bounds() {
  const { from: dFrom, to } = state.data.meta, days = RANGES[state.rangeIdx][1];
  const from = days ? new Date(parse(to).getTime() - (days - 1) * DAY).toISOString().slice(0, 10) : dFrom;
  const [pf, pt] = previousRange(from, to);
  return { from, to, pf, pt, hasPrev: pf >= dFrom };
}

function render() {
  const { rows, channels: allCh } = state.data, b = bounds(), grain = RANGES[state.rangeIdx][2];
  const cur = filter(rows, b.from, b.to, state.channels), prev = b.hasPrev ? filter(rows, b.pf, b.pt, state.channels) : [];
  const T = totals(cur), P = b.hasPrev ? totals(prev) : null;
  const sc = series(cur, grain), sp = series(prev, grain);
  $('period').textContent = `${fmtDay(parse(b.from))} – ${fmtDay(parse(b.to))}, ${parse(b.to).getUTCFullYear()}${b.hasPrev ? '' : ' (no earlier period to compare)'}.`;

  kpis(T, P, sc);
  lineChart('c-rev', sc, sp, 'r', compact, (p) => usd(p.r), grain, '#e4572e');
  lineChart('c-aov', sc, [], 'aov', (v) => '$' + Math.round(v), (p) => usd2(p.aov), grain, '#0f5c55', true);
  funnelChart(funnel(cur));
  categoryChart(b);
  channelTable(cur, allCh);
}

function kpis(T, P, sc) {
  const defs = [
    ['Revenue', usd(T.r), delta(T.r, P?.r), 'r', '#e4572e'],
    ['Orders', int(T.o), delta(T.o, P?.o), 'o', '#3b4a6b'],
    ['Avg. order value', usd2(T.aov), delta(T.aov, P?.aov), 'aov', '#0f5c55'],
    ['Conversion', pct(T.conv), P ? T.conv - P.conv : null, 'conv', '#d9a21b'],
  ];
  $('kpis').innerHTML = defs.map(([n, v, dl], i) => {
    const isPt = n === 'Conversion', up = dl > 0;
    const dtxt = dl == null ? '<span class="d"><small>No comparison</small></span>'
      : `<span class="d ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${isPt ? (Math.abs(dl) * 100).toFixed(2) + ' pts' : pct(Math.abs(dl))} <small>vs. previous</small></span>`;
    return `<div class="kpi"><h3>${n}</h3><div class="v">${v}</div>${dtxt}<svg id="sp${i}" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true"></svg></div>`;
  }).join('');
  defs.forEach(([, , , k, c], i) => {
    const vals = sc.map((p) => (k === 'conv' ? (p.s ? p.o / p.s : 0) : p[k]));
    if (vals.length < 2) return;
    const x = d3.scaleLinear([0, vals.length - 1], [2, 198]), y = d3.scaleLinear(d3.extent(vals), [30, 4]);
    d3.select('#sp' + i).append('path').attr('d', d3.line().x((_, j) => x(j)).y((v) => y(v)).curve(d3.curveMonotoneX)(vals))
      .attr('fill', 'none').attr('stroke', c).attr('stroke-width', 1.8).attr('vector-effect', 'non-scaling-stroke');
  });
}

const chartH = (el) => (el.clientWidth < 520 ? 210 : 260);
const widthOf = (el) => Math.max(260, el.clientWidth);

function lineChart(id, cur, prev, key, yfmt, tfmt, grain, color, zeroless) {
  const el = $(id); el.innerHTML = '';
  const w = widthOf(el), h = chartH(el), m = { t: 8, r: 8, b: 24, l: 46 };
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
  if (!cur.length) return;
  const x = d3.scaleUtc(d3.extent(cur, (p) => parse(p.d)), [m.l, w - m.r]);
  const all = [...cur.map((p) => p[key]), ...prev.map((p) => p[key])];
  const y = d3.scaleLinear([zeroless ? d3.min(all) * 0.92 : 0, d3.max(all) * 1.08], [h - m.b, m.t]).nice(4);
  svg.append('g').attr('class', 'axis grid-l').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat(yfmt));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 420 ? 3 : 6).tickSizeOuter(0).tickFormat(grain === 'month' ? fmtMon : fmtDay));
  if (!zeroless) svg.append('path').attr('d', d3.area().x((p) => x(parse(p.d))).y0(y(0)).y1((p) => y(p[key])).curve(d3.curveMonotoneX)(cur)).attr('fill', color).attr('opacity', 0.09);
  if (prev.length) {
    const shift = parse(cur[0].d) - parse(prev[0].d);
    svg.append('path').attr('d', d3.line().x((p) => x(new Date(parse(p.d).getTime() + shift))).y((p) => y(p[key])).curve(d3.curveMonotoneX)(prev))
      .attr('fill', 'none').attr('stroke', '#9a9486').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
  }
  svg.append('path').attr('d', d3.line().x((p) => x(parse(p.d))).y((p) => y(p[key])).curve(d3.curveMonotoneX)(cur))
    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.4).attr('stroke-linejoin', 'round');
  const dot = svg.append('circle').attr('r', 5).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2).attr('display', 'none');
  const bis = d3.bisector((p) => parse(p.d)).center;
  svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', w - m.l - m.r).attr('height', h - m.b).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const i = bis(cur, x.invert(d3.pointer(ev)[0])), p = cur[i], q = prev[i];
      dot.attr('display', null).attr('cx', x(parse(p.d))).attr('cy', y(p[key]));
      const when = grain === 'week' ? 'Week of ' + fmtDay(parse(p.d)) : grain === 'month' ? fmtMon(parse(p.d)) : fmtDay(parse(p.d));
      showTip(ev, `<span>${when}</span><br><b>${tfmt(p)}</b>${q ? `<br><span>Previous: ${tfmt(q)}</span>` : ''}`);
    }).on('pointerleave', () => { dot.attr('display', 'none'); hideTip(); });
}

function funnelChart(f) {
  const el = $('c-fun'); el.innerHTML = '';
  const w = widthOf(el), rowH = 46, h = rowH * f.length, lab = w < 400 ? 92 : 108;
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
  const x = d3.scaleLinear([0, 1], [0, w - lab - 4]), fill = d3.interpolateRgb('#e4572e', '#0f5c55');
  f.forEach((s, i) => {
    const g = svg.append('g').attr('transform', `translate(0,${i * rowH})`);
    g.append('text').attr('y', 20).attr('font-size', 13).attr('font-weight', 600).attr('fill', '#1b1a17').text(s.name);
    g.append('text').attr('y', 36).attr('font-size', 11.5).attr('fill', '#6b675d').text(int(s.n));
    g.append('rect').attr('x', lab).attr('y', 6).attr('width', x(1)).attr('height', 26).attr('rx', 6).attr('fill', '#ece8dc');
    g.append('rect').attr('x', lab).attr('y', 6).attr('width', Math.max(3, x(s.ofTop))).attr('height', 26).attr('rx', 6).attr('fill', fill(i / (f.length - 1)));
    const inside = x(s.ofTop) > 150;
    g.append('text').attr('x', lab + (inside ? x(s.ofTop) - 8 : x(s.ofTop) + 8)).attr('y', 24).attr('text-anchor', inside ? 'end' : 'start')
      .attr('font-size', 12.5).attr('font-weight', 600).attr('fill', inside ? '#fff' : '#1b1a17')
      .text(pct(s.ofTop) + (i && inside && pct(s.step) !== pct(s.ofTop) ? ` · ${pct(s.step)} of prev.` : ''));
  });
}

function categoryChart(b) {
  const el = $('c-cat'); el.innerHTML = '';
  const { categories, catByMonth, channels } = state.data;
  const inR = catByMonth.filter((r) => r.m >= b.from.slice(0, 7) && r.m <= b.to.slice(0, 7));
  const chShare = state.channels.length / channels.length; // shortcut: even split across channels, refine if per-channel category data is added
  const data = categories.map((c) => ({ c, v: d3.sum(inR, (r) => r[c]) * chShare })).sort((a, z) => z.v - a.v);
  const w = widthOf(el), rowH = 40, lab = 76, tot = d3.sum(data, (d) => d.v);
  const x = d3.scaleLinear([0, d3.max(data, (d) => d.v) || 1], [0, w - lab - 96]);
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', rowH * data.length);
  data.forEach((d, i) => {
    const g = svg.append('g').attr('transform', `translate(0,${i * rowH})`);
    g.append('text').attr('y', 24).attr('font-size', 13).attr('font-weight', 600).text(d.c);
    g.append('rect').attr('x', lab).attr('y', 8).attr('width', Math.max(2, x(d.v))).attr('height', 22).attr('rx', 5).attr('fill', i === 0 ? '#e4572e' : '#cfc9b8');
    g.append('text').attr('x', lab + x(d.v) + 8).attr('y', 24).attr('font-size', 12.5).attr('fill', '#1b1a17').text(`${compact(d.v)} · ${tot ? Math.round((d.v / tot) * 100) : 0}%`);
  });
}

function channelTable(rows, channels) {
  const data = byChannel(rows, channels).filter((d) => state.channels.includes(d.ch)).sort((a, z) => z.r - a.r), max = d3.max(data, (d) => d.r) || 1;
  $('c-ch').innerHTML = `<table class="ch"><thead><tr><th>Channel</th><th>Revenue</th><th>Conv.</th><th>AOV</th></tr></thead><tbody>${data.map((d) =>
    `<tr style="--c:${COLORS[d.ch]}"><td>${d.ch}<i class="bar" style="width:${(d.r / max) * 100}%"></i></td><td>${compact(d.r)}</td><td>${pct(d.conv)}</td><td>${usd(d.aov)}</td></tr>`).join('')}</tbody></table>`;
}

function cohortChart() {
  const el = $('c-coh'); el.innerHTML = '';
  const co = state.data.cohorts, n = co.length, cw = 42, ch = 26, lab = 74, top = 22;
  const color = d3.scaleSequentialSqrt([0, 25], d3.interpolateRgb('#f6efe0', '#0f5c55')).clamp(true);
  const svg = d3.select(el).append('svg').attr('width', lab + n * cw).attr('height', top + n * ch);
  for (let j = 0; j < n; j++) svg.append('text').attr('x', lab + j * cw + cw / 2).attr('y', 13).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#6b675d').text('M' + j);
  co.forEach((c, i) => {
    const g = svg.append('g').attr('transform', `translate(0,${top + i * ch})`);
    g.append('text').attr('y', 17).attr('font-size', 11.5).attr('fill', '#1b1a17').text(fmtMon(parse(c.m + '-01')));
    c.ret.forEach((v, j) => {
      const dark = j === 0 || v > 11;
      g.append('rect').attr('x', lab + j * cw + 1).attr('width', cw - 2).attr('height', ch - 2).attr('rx', 4).attr('fill', j === 0 ? '#1b1a17' : color(v))
        .on('pointermove', (ev) => showTip(ev, `<span>${d3.utcFormat('%B %Y')(parse(c.m + '-01'))} cohort · ${int(c.size)} customers</span><br><b>${v}%</b> ordered in month ${j}`)).on('pointerleave', hideTip);
      g.append('text').attr('x', lab + j * cw + cw / 2).attr('y', 16).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('pointer-events', 'none')
        .attr('fill', dark ? '#fff' : '#3d3a32').text(j === 0 ? int(c.size) : Math.round(v));
    });
  });
}

function controls() {
  $('range').innerHTML = RANGES.map(([l], i) => `<button type="button" aria-pressed="${i === state.rangeIdx}" data-i="${i}">${l}</button>`).join('');
  $('range').onclick = (e) => { const i = e.target.dataset.i; if (i == null) return; state.rangeIdx = +i; controls(); render(); };
  $('chips').innerHTML = state.data.channels.map((c) => `<button type="button" aria-pressed="${state.channels.includes(c)}" data-c="${c}" style="--c:${COLORS[c]}"><i></i>${c}</button>`).join('');
  $('chips').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const c = b.dataset.c, on = state.channels.includes(c);
    if (on && state.channels.length === 1) return; // keep at least one channel
    state.channels = on ? state.channels.filter((x) => x !== c) : [...state.channels, c];
    controls(); render();
  };
}

state.data = await (await fetch(import.meta.env.BASE_URL + 'data.json')).json();
state.channels = [...state.data.channels];
controls(); render(); cohortChart();
let last = innerWidth;
addEventListener('resize', () => { if (Math.abs(innerWidth - last) > 4) { last = innerWidth; render(); } });
