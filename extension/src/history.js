/* =============================================================================
 * history.js – snapshoty stavu v čase
 *
 * Každé načtení stavu (ruční nebo z auto-refreshe) uloží jeden bod. Sleduje se
 * hotovost, zůstatek v bance a jejich součet – tedy skutečný majetek, ne jen
 * to, co máš právě v kapse. Z bodů se počítá přírůstek za hodinu.
 *
 * Bod: { t, cash, bank, dirty, total, gems, b: { "<id>": { p, ready, m:{…} } } }
 * `gems` (diamanty) je jiná valuta, takže se NIKDY nepřičítá k `total`.
 * Body z dřívějších verzí mají jen `cash`; `totalOf()` je bere jako celek.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const MAX_POINTS = 1500;      // ~10 dní při refreshi 10 min
  const MIN_GAP_MS = 45 * 1000; // hustší body nemají informační hodnotu

  const isNum = v => v != null && Number.isFinite(+v);

  /**
   * Celkový majetek bodu. `total` je uložený už spočítaný (respektuje volbu,
   * jestli se počítají špinavé peníze); jinak se sečte, co bod má.
   */
  function totalOf(p) {
    if (!p) return null;
    if (isNum(p.total)) return +p.total;
    if (!isNum(p.cash) && !isNum(p.bank) && !isNum(p.dirty)) return null;
    return (isNum(p.cash) ? +p.cash : 0) + (isNum(p.bank) ? +p.bank : 0) +
      (isNum(p.dirty) ? +p.dirty : 0);
  }

  /**
   * Přidá snapshot. Když je poslední bod mladší než MIN_GAP_MS, přepíše ho.
   * @param {number|null} cash
   * @param {number|null} bank
   * @param {Array<object>} buildings výstupy parse.readBuilding()
   */
  async function push(cash, bank, buildings, extra = {}) {
    const store = NS.store;
    const hist = store.get().history.slice();
    const point = {
      t: Date.now(),
      cash: isNum(cash) ? Math.round(cash) : null,
      bank: isNum(bank) ? Math.round(bank) : null,
      dirty: isNum(extra.dirty) ? Math.round(extra.dirty) : null,
      gems: isNum(extra.gems) ? Math.round(extra.gems) : null,
      b: {}
    };
    point.total = isNum(extra.total)
      ? Math.round(extra.total)
      : (totalOf({ ...point, total: null }) == null ? null : Math.round(totalOf({ ...point, total: null })));

    for (const b of buildings || []) {
      point.b[b.id] = { p: b.percent, ready: !!b.harvestReady, m: b.metrics || {} };
    }

    const last = hist[hist.length - 1];
    if (last && point.t - last.t < MIN_GAP_MS) hist[hist.length - 1] = point;
    else hist.push(point);

    while (hist.length > MAX_POINTS) hist.shift();
    await store.put('history', hist);
    return point;
  }

  /** Ruční zápis majetku (když parser hodnoty nenajde). */
  async function pushManual(cash, bank, dirty, gems) {
    return push(cash, bank, [], { dirty, gems });
  }

  const all = () => NS.store.get().history;

  const from = hours => (hours ? Date.now() - hours * 3600e3 : 0);

  /**
   * Řada majetku jako [{t, v, rows}], kde `rows` je rozpad pro tooltip.
   * @param {'total'|'cash'|'bank'} field
   */
  function series(field = 'total', hours = 0) {
    const since = from(hours);
    const F = NS.fmt;
    const out = [];
    for (const p of all()) {
      if (p.t < since) continue;
      const v = field === 'total' ? totalOf(p) : (isNum(p[field]) ? +p[field] : null);
      if (v == null) continue;
      const rows = [];
      if (field === 'total') {
        rows.push(['Celkem', F.kc(v)]);
        if (isNum(p.cash)) rows.push(['Hotovost', F.kc(p.cash)]);
        if (isNum(p.bank)) rows.push(['V bance', F.kc(p.bank)]);
        if (isNum(p.dirty)) rows.push(['Špinavé', F.kc(p.dirty)]);
      }
      out.push({ t: p.t, v, rows: rows.length > 1 ? rows : null });
    }
    return out;
  }

  /** Zpětně kompatibilní zkratky. */
  const totalSeries = hours => series('total', hours);
  const cashSeries = hours => series('cash', hours);
  const bankSeries = hours => series('bank', hours);
  const dirtySeries = hours => series('dirty', hours);
  const gemsSeries = hours => series('gems', hours);

  /** Má historie vůbec nějaký záznam o bance? */
  const hasBank = () => all().some(p => isNum(p.bank));
  const hasDirty = () => all().some(p => isNum(p.dirty));
  const hasGems = () => all().some(p => isNum(p.gems));

  /** Časová řada jedné metriky budovy, např. metricSeries(24, 'stock'). */
  function metricSeries(buildingId, metric, hours = 0) {
    const since = from(hours);
    return all()
      .filter(p => p.t >= since && p.b[buildingId] && p.b[buildingId].m[metric] != null)
      .map(p => ({ t: p.t, v: p.b[buildingId].m[metric] }));
  }

  /**
   * Přírůstek za hodinu proložením přímky (odolnější než rozdíl krajních bodů).
   * @returns {{perHour:number, spanHours:number, points:number, first:number, last:number}|null}
   */
  function ratePerHour(points) {
    if (!points || points.length < 2) return null;
    const t0 = points[0].t;
    const xs = points.map(p => (p.t - t0) / 3600e3);
    const ys = points.map(p => p.v);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    if (!sxx) return null;
    return {
      perHour: sxy / sxx,
      spanHours: xs[n - 1],
      points: n,
      first: ys[0],
      last: ys[n - 1]
    };
  }

  /** CSV se všemi body (majetek + metriky budov ve sloupcích). */
  function toCsv() {
    const hist = all();
    const metricCols = new Set();
    for (const p of hist) {
      for (const id in p.b) for (const m in p.b[id].m) metricCols.add(id + '.' + m);
    }
    const cols = ['cas', 'hotovost', 'banka', 'spinave', 'celkem', 'diamanty', ...Array.from(metricCols).sort()];
    const lines = [cols.join(';')];
    for (const p of hist) {
      const row = [new Date(p.t).toISOString(), p.cash ?? '', p.bank ?? '', p.dirty ?? '',
        totalOf(p) ?? '', p.gems ?? ''];
      for (const c of cols.slice(6)) {
        const [id, m] = c.split('.');
        row.push(p.b[id] && p.b[id].m[m] != null ? p.b[id].m[m] : '');
      }
      lines.push(row.join(';'));
    }
    return lines.join('\n');
  }

  async function clear() {
    await NS.store.put('history', []);
  }

  NS.history = {
    push, pushManual, all, totalOf, series, totalSeries, cashSeries, bankSeries,
    dirtySeries, gemsSeries, hasBank, hasDirty, hasGems, metricSeries, ratePerHour, toCsv, clear, MAX_POINTS
  };
})();
