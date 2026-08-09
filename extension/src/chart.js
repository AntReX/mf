/* =============================================================================
 * chart.js – malé SVG grafy do panelu (bez knihoven)
 *
 * Paleta: kategoriální slot 1–3 v dark verzi, zvalidované proti povrchu panelu
 * (#1c110e) – lightness band, chroma, CVD separace i kontrast prošly, takže
 * barvy zůstávají rozlišitelné i pro barvosleposti.
 *
 * Pravidla, která tu kód drží:
 *  - tenké značky: linka 2 px, marker 8 px, zakulacený jen datový konec baru
 *  - 2 px mezera povrchem mezi sousedními výplněmi
 *  - hodnoty a popisky nesou textovou barvu, ne barvu série
 *  - hover vrstva (crosshair + tooltip) je součástí grafu, ne extra funkce
 *  - jedna série = bez legendy (název nese titulek grafu)
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const SVG = 'http://www.w3.org/2000/svg';

  const SERIES = ['#3987e5', '#d95926', '#199e70'];
  const NEGATIVE = '#e66767';   // opačný pól k modré – jen pro znaménko, ne pro identitu
  const GRID = 'rgba(244, 233, 216, 0.12)';

  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  const div = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  };

  function frame(title, note) {
    const wrap = div('cmc-chart');
    if (title) {
      const head = div('cmc-chart-head');
      head.appendChild(div('cmc-chart-title', title));
      if (note) head.appendChild(div('cmc-chart-note', note));
      wrap.appendChild(head);
    }
    return wrap;
  }

  function emptyState(title, msg) {
    const wrap = frame(title);
    wrap.appendChild(div('cmc-chart-empty', msg));
    return wrap;
  }

  /** Zakulacený jen pravý (datový) konec – levý sedí na základní ose. */
  function barPath(x, y, w, h, r) {
    const rr = Math.min(r, Math.max(0, w), h / 2);
    if (w <= rr) return `M${x} ${y}h${w}v${h}h${-w}z`;
    return `M${x} ${y}h${w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - rr)}z`;
  }

  // ---- tooltip -------------------------------------------------------------
  function attachTooltip(wrap, svg, hit) {
    const tip = div('cmc-tip');
    tip.hidden = true;
    wrap.appendChild(tip);

    const show = (html, x, y) => {
      tip.textContent = '';
      tip.appendChild(html);
      tip.hidden = false;
      const box = wrap.getBoundingClientRect();
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(2, Math.min(box.width - tw - 2, x - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
    };

    svg.addEventListener('mousemove', ev => {
      const box = svg.getBoundingClientRect();
      const res = hit(ev.clientX - box.left, ev.clientY - box.top, box);
      if (!res) { tip.hidden = true; return; }
      show(res.node, res.x, res.y);
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; if (hit.onLeave) hit.onLeave(); });
    return tip;
  }

  function tipContent(lines) {
    const box = document.createElement('div');
    for (const [k, v] of lines) {
      const row = div('cmc-tip-row');
      row.appendChild(div('cmc-tip-k', k));
      row.appendChild(div('cmc-tip-v', v));
      box.appendChild(row);
    }
    return box;
  }

  /**
   * Spojnicový graf jedné série v čase, s crosshairem a tooltipem.
   * @param {Array<{t:number,v:number}>} series
   * @param {object} o { title, note, height, color, format, empty }
   */
  function line(series, o = {}) {
    const fmt = o.format || NS.fmt.num;
    const title = o.title || '';
    if (!series || series.length < 2) {
      return emptyState(title, o.empty || 'Zatím málo dat – graf se objeví po druhém načtení stavu.');
    }

    const W = 300, H = o.height || 92;
    const PAD = { t: 10, r: 8, b: 16, l: 8 };
    const color = o.color || SERIES[0];

    const xs = series.map(p => p.t);
    const ys = series.map(p => p.v);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y0 === y1) { y0 -= 1; y1 += 1; }          // plochá řada ať není na hraně
    const px = t => PAD.l + ((t - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
    const py = v => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);

    const wrap = frame(title, o.note);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmc-svg', preserveAspectRatio: 'none' });

    // recesivní osa a horní vodicí linka
    svg.appendChild(el('line', { x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b, stroke: GRID, 'stroke-width': 1 }));
    svg.appendChild(el('line', { x1: PAD.l, y1: PAD.t, x2: W - PAD.r, y2: PAD.t, stroke: GRID, 'stroke-width': 1, 'stroke-dasharray': '2 3' }));

    const d = series.map((p, i) => (i ? 'L' : 'M') + px(p.t).toFixed(1) + ' ' + py(p.v).toFixed(1)).join(' ');
    svg.appendChild(el('path', {
      d, fill: 'none', stroke: color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // poslední bod: marker 8 px s 2px prstencem povrchu
    const last = series[series.length - 1];
    svg.appendChild(el('circle', { cx: px(last.t), cy: py(last.v), r: 4, fill: color, stroke: '#1c110e', 'stroke-width': 2 }));

    const cross = el('line', { y1: PAD.t, y2: H - PAD.b, stroke: GRID, 'stroke-width': 1, visibility: 'hidden' });
    const dot = el('circle', { r: 4, fill: color, stroke: '#1c110e', 'stroke-width': 2, visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(dot);

    wrap.appendChild(svg);

    // krajní časy jako popisky pod osou (jen dva – ne číslo u každého bodu)
    const axis = div('cmc-axis');
    axis.appendChild(div('cmc-axis-l', NS.fmt.stamp(x0)));
    axis.appendChild(div('cmc-axis-r', NS.fmt.stamp(x1)));
    wrap.appendChild(axis);

    const hit = (mx, my, box) => {
      const t = x0 + (mx / box.width * W - PAD.l) / (W - PAD.l - PAD.r) * (x1 - x0);
      let best = series[0];
      for (const p of series) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const sx = px(best.t), sy = py(best.v);
      cross.setAttribute('x1', sx); cross.setAttribute('x2', sx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('visibility', 'visible');
      // bod může nést vlastní rozpad (např. hotovost + banka), jinak jen hodnotu
      const lines = best.rows && best.rows.length
        ? [[NS.fmt.stamp(best.t), '']].concat(best.rows)
        : [[NS.fmt.stamp(best.t), fmt(best.v)]];
      return {
        node: tipContent(lines),
        x: sx / W * box.width,
        y: sy / H * box.height
      };
    };
    hit.onLeave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
    attachTooltip(wrap, svg, hit);

    return wrap;
  }

  /**
   * Vodorovné pruhy pro srovnání kategorií. Popisek i hodnota jsou přímo
   * u pruhu, takže identita nikdy nestojí jen na barvě.
   * @param {Array<{label:string,value:number,color?:string}>} rows
   */
  function bars(rows, o = {}) {
    const fmt = o.format || NS.fmt.num;
    const title = o.title || '';
    const data = (rows || []).filter(r => r && Number.isFinite(+r.value));
    if (!data.length) return emptyState(title, o.empty || 'Není co srovnávat.');

    const wrap = frame(title, o.note);
    const table = div('cmc-bars');
    const max = Math.max(...data.map(r => Math.abs(r.value)), 1);

    data.forEach((r, i) => {
      const row = div('cmc-bar-row');
      row.appendChild(div('cmc-bar-label', r.label));

      const track = div('cmc-bar-track');
      const W = 100, H = 12;
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmc-bar-svg', preserveAspectRatio: 'none' });
      const w = (Math.abs(r.value) / max) * W;
      // jedna měřená hodnota = jedna barva (identitu nese popisek u pruhu);
      // znaménko je polarita, takže ztráta dostane opačný pól, ne další slot
      const color = r.color || (r.value < 0 ? NEGATIVE : SERIES[0]);
      svg.appendChild(el('path', {
        d: barPath(0, 1, Math.max(2, w), H - 2, 4),
        fill: color
      }));
      track.appendChild(svg);
      row.appendChild(track);

      row.appendChild(div('cmc-bar-value', fmt(r.value)));
      row.title = r.label + ': ' + fmt(r.value);
      table.appendChild(row);
    });

    wrap.appendChild(table);
    return wrap;
  }

  NS.chart = { line, bars, SERIES, NEGATIVE, emptyState };
})();
