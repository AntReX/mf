/* =============================================================================
 * tab-historie.js – vývoj majetku v čase
 *
 * Majetek = hotovost + zůstatek v bance + špinavé peníze. Graf i přírůstek za
 * hodinu počítají z celku, aby přesun peněz do banky nevypadal jako ztráta.
 * Diamanty se sledují zvlášť – je to jiná valuta, sčítat je s korunami by
 * nedávalo smysl.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, btn, confirmBtn, numField, section, grid, note } = NS.ui;
  const F = NS.fmt;

  const ui = { hours: 24, records: 'hotovost', manualCash: null, manualBank: null,
    manualDirty: null, manualGems: null };
  const RANGES = [[6, '6 h'], [24, '24 h'], [168, '7 dní'], [0, 'vše']];

  function rangeSwitch(onPick) {
    return h('div', { class: 'cmc-tabs cmc-tabs-sub' },
      RANGES.map(([hrs, label]) => h('button', {
        class: 'cmc-tab' + (ui.hours === hrs ? ' cmc-tab-on' : ''),
        type: 'button',
        text: label,
        on: { click: () => { ui.hours = hrs; onPick(); } }
      })));
  }

  /*
   * Poslední záznamy mají tři pohledy, protože v jedné tabulce by se pět
   * sloupců do 340px panelu nevešlo čitelně:
   *   hotovost  … čisté peníze + banka + jejich součet (likvidní peníze)
   *   spinave   … špinavé peníze a jejich změna
   *   diamanty  … diamanty a jejich změna
   */
  const RECORDS = [
    { key: 'hotovost', label: 'Hotovost' },
    { key: 'spinave', label: 'Špinavé' },
    { key: 'diamanty', label: 'Diamanty' }
  ];

  function recordsSwitch(onPick) {
    return h('div', { class: 'cmc-tabs cmc-tabs-sub' },
      RECORDS.map(r => h('button', {
        class: 'cmc-tab' + (ui.records === r.key ? ' cmc-tab-on' : ''),
        type: 'button',
        text: r.label,
        on: { click: () => { ui.records = r.key; onPick(); } }
      })));
  }

  const table = rows => h('div', { class: 'cmc-table' }, rows);
  const th = labels => h('div', { class: 'cmc-tr cmc-th' }, labels.map(x => h('span', { text: x })));

  /** Buňka se změnou proti předchozímu bodu. */
  function deltaCell(now, prev, unit) {
    const d = (now != null && prev != null) ? now - prev : null;
    return h('span', {
      class: d == null ? '' : (d >= 0 ? 'cmc-good' : 'cmc-bad'),
      text: d == null ? '–' : F.signed(d, unit)
    });
  }

  function historyTable(hours, which) {
    const from = hours ? Date.now() - hours * 3600e3 : 0;
    const all = NS.history.all().filter(p => p.t >= from);

    // v každém pohledu jen body, které danou hodnotu vůbec mají
    const field = which === 'spinave' ? 'dirty' : which === 'diamanty' ? 'gems' : 'cash';
    const points = all
      .filter(p => (which === 'hotovost' ? (p.cash != null || p.bank != null) : p[field] != null))
      .slice(-12)
      .reverse();

    if (!points.length) {
      if (which === 'diamanty') return note('Diamanty se zatím nezaznamenaly – načti stav na stránce, kde je vidět HUD hry.');
      if (which === 'spinave') return note('Špinavé peníze se zatím nezaznamenaly.');
      return note('Žádné body.');
    }

    if (which === 'hotovost') {
      const rows = [th(['Čas', 'Hotovost', 'Banka', 'Dohromady'])];
      for (const p of points) {
        const sum = (p.cash || 0) + (p.bank || 0);
        rows.push(h('div', { class: 'cmc-tr' },
          h('span', { text: F.stamp(p.t) }),
          h('span', { text: p.cash == null ? '–' : F.kc(p.cash, { short: true }) }),
          h('span', { text: p.bank == null ? '–' : F.kc(p.bank, { short: true }) }),
          h('span', { class: 'cmc-strong-cell', text: F.kc(sum, { short: true }) })));
      }
      return table(rows);
    }

    if (which === 'spinave') {
      const rows = [th(['Čas', 'Špinavé', 'Změna'])];
      points.forEach((p, i) => {
        const prev = points[i + 1];
        rows.push(h('div', { class: 'cmc-tr' },
          h('span', { text: F.stamp(p.t) }),
          h('span', { class: 'cmc-strong-cell', text: F.kc(p.dirty, { short: true }) }),
          deltaCell(p.dirty, prev ? prev.dirty : null, 'Kč')));
      });
      return table(rows);
    }

    const rows = [th(['Čas', 'Diamanty', 'Změna'])];
    points.forEach((p, i) => {
      const prev = points[i + 1];
      rows.push(h('div', { class: 'cmc-tr' },
        h('span', { text: F.stamp(p.t) }),
        h('span', { class: 'cmc-strong-cell', text: F.num(p.gems) }),
        deltaCell(p.gems, prev ? prev.gems : null, '')));
    });
    return table(rows);
  }

  /** Rozpad posledního bodu čísly – ať je vidět, kolik je v bance. */
  function lastBreakdown() {
    const pts = NS.history.all();
    const p = pts[pts.length - 1];
    if (!p) return null;
    const parts = [];
    if (p.cash != null) parts.push('hotovost ' + F.kc(p.cash, { short: true }));
    if (p.bank != null) parts.push('banka ' + F.kc(p.bank, { short: true }));
    if (p.dirty != null) parts.push('špinavé ' + F.kc(p.dirty, { short: true }));
    return parts.join(' + ') || null;
  }

  function render(root, ctx) {
    const body = h('div');
    root.appendChild(body);

    function draw() {
      NS.ui.clear(body);
      const withBank = NS.history.hasBank();
      const total = NS.history.totalSeries(ui.hours);
      const rate = NS.history.ratePerHour(total);
      const points = NS.history.all().length;

      body.appendChild(grid(
        tile('Přírůstek', rate ? F.signed(Math.round(rate.perHour)) + '/h' : '–',
          rate ? `z ${rate.points} bodů za ${F.hours(rate.spanHours)}` : 'potřeba aspoň 2 body'),
        tile('Majetek nyní', total.length ? F.kc(total[total.length - 1].v, { short: true }) : '–',
          lastBreakdown() || 'jen hotovost')));

      // diamanty mají vlastní dlaždici – jsou to jiné jednotky než majetek
      const gems = NS.history.gemsSeries(ui.hours);
      if (gems.length) {
        const gRate = NS.history.ratePerHour(gems);
        body.appendChild(grid(
          tile('Diamanty', F.gems(gems[gems.length - 1].v),
            gRate && Math.abs(gRate.perHour) >= 0.5
              ? (gRate.perHour > 0 ? '+' : '') + F.num(Math.round(gRate.perHour * 24)) + ' / den'
              : 'bez pohybu')));
      }

      body.appendChild(rangeSwitch(draw));

      body.appendChild(NS.chart.line(total, {
        title: withBank ? 'Majetek v čase (s bankou)' : 'Majetek v čase',
        note: ui.hours ? 'posledních ' + (RANGES.find(r => r[0] === ui.hours) || [])[1] : 'celá historie',
        format: v => F.kc(v),
        empty: 'Zatím málo bodů. Každé načtení stavu v záložce Stav přidá jeden.'
      }));

      if (rate && rate.perHour !== 0) {
        const dir = rate.perHour > 0 ? 'rosteš o ' : 'ztrácíš ';
        body.appendChild(note('V tomto okně ' + dir + F.kc(Math.abs(Math.round(rate.perHour))) +
          ' za hodinu, tedy ' + F.kc(Math.abs(Math.round(rate.perHour * 24))) + ' za den.'));
      }

      if (!withBank) {
        body.appendChild(note('Zůstatek v bance se zatím nezaznamenal – sleduj budovu Banka (typ „banka“ v nastavení) a doplní se sám, včetně špinavých peněz.'));
      }

      body.appendChild(section('Poslední záznamy',
        recordsSwitch(draw),
        historyTable(ui.hours, ui.records)));

      if (gems.length > 1) {
        body.appendChild(NS.chart.line(gems, {
          title: 'Diamanty v čase',
          color: NS.chart.SERIES[2],
          format: v => F.gems(v)
        }));
      }

      // zásoby vstupů u sledovaných budov
      const cfg = NS.store.get();
      for (const b of cfg.read.buildings) {
        if (!(b.id > 0)) continue;
        const s = NS.history.metricSeries(b.id, 'stock', ui.hours);
        if (s.length < 2) continue;
        const r = (cfg.econ.recipes || []).find(x => x.kind === b.kind);
        const inp = r && r.inputs && r.inputs[0];
        body.appendChild(NS.chart.line(s, {
          title: b.label + (inp ? ' – zásoba ' + inp.of : ' – zásoba vstupu'),
          color: NS.chart.SERIES[1],
          format: v => F.num(v) + (inp && inp.unit ? ' ' + inp.unit : '')
        }));
      }

      // ruční zápis, když se hodnoty nedají přečíst
      body.appendChild(section('Zapsat majetek ručně',
        grid(
          numField('Hotovost (Kč)', ui.manualCash, v => { ui.manualCash = v; }, { min: 0 }),
          numField('V bance (Kč)', ui.manualBank, v => { ui.manualBank = v; }, { min: 0 }),
          numField('Špinavé (Kč)', ui.manualDirty, v => { ui.manualDirty = v; }, { min: 0 }),
          numField('Diamanty', ui.manualGems, v => { ui.manualGems = v; }, { min: 0 })),
        h('div', { class: 'cmc-actions' },
          btn('Zapsat bod', async () => {
            if (ui.manualCash == null && ui.manualBank == null &&
                ui.manualDirty == null && ui.manualGems == null) return;
            await NS.history.pushManual(ui.manualCash, ui.manualBank, ui.manualDirty, ui.manualGems);
            ui.manualCash = null;
            ui.manualBank = null;
            ui.manualDirty = null;
            ui.manualGems = null;
            draw();
          }, { kind: 'primary' })),
        note('Prázdné pole se uloží jako „neznámo“, ne jako nula.')));

      // kasino – vlastní bilance, protože jde o peníze, které si sám vsadíš
      if (NS.casino) {
        const c = NS.casino.stats();
        if (c.plays > 0) {
          const sek = section('Kasino „Šťastný tip“',
            row('vloženo', F.kc(c.staked)),
            row('vyhráno (vráceno hrou)', F.kc(c.won)),
            row('bilance', F.signed(c.net), 'cmc-strong ' + (c.net >= 0 ? 'cmc-good' : 'cmc-bad')),
            row('sázek', F.num(c.plays) + '× · uhodnuto ' + F.num(c.wins)),
            row('úspěšnost', (c.rate != null ? F.pct(c.rate, 1) : '–')
              + ' (teoreticky ' + F.pct(c.expected, 1) + ')'));

          // rekord nepovedených pokusů – u martingale to je to číslo, které bolí
          if (c.maxLossRun > 0) {
            sek.appendChild(row('nejvíc proher v řadě',
              F.num(c.maxLossRun) + '× · šance '
              + (NS.casino.pctText ? NS.casino.pctText(c.maxLossRunChance) : F.pct(c.maxLossRunChance, 1)),
              c.maxLossRun >= (c.next ? c.next.pokusy : 6) ? 'cmc-bad' : ''));
          }
          if (c.lossRun > 0) sek.appendChild(row('právě proher v řadě', F.num(c.lossRun) + '×'));
          if (c.busts > 0) {
            sek.appendChild(row('vzdaných sérií', F.num(c.busts) + '×',
              'cmc-bad'));
          }

          // po tvarech – ne že by na tvaru záleželo, ale je vidět rozptyl
          for (const s of c.shapes) {
            sek.appendChild(row(s.label + ' ' + s.name,
              F.num(s.plays) + '× · ' + F.signed(s.net)
              + (s.rate != null ? ' · ' + F.pct(s.rate, 0) : '')));
          }

          sek.appendChild(note('Hra má tři tvary a platí trojnásobek bez poplatků, '
            + 'takže očekávaná hodnota je přesně nula – dlouhodobě to nevydělává ani '
            + 'neprodělává. Bilance se počítá z výsledků, ne z peněz v HUD (ty se mění '
            + 'i z jiných zdrojů).'));

          if (c.last && c.last.length) {
            const tab = h('div', { class: 'cmc-subsection' });
            for (const s of c.last.slice(0, 10)) {
              tab.appendChild(row(F.time(s.at) + ' · ' + s.tip + ' za ' + F.kc(s.amount),
                s.win ? '🎉 ' + F.signed(s.delta) : F.signed(s.delta) + ' (padlo ' + s.winner + ')',
                s.win ? 'cmc-good' : 'cmc-bad'));
            }
            sek.appendChild(tab);
          }

          sek.appendChild(h('div', { class: 'cmc-actions' },
            btn('⬇ CSV sázek', () => NS.ui.download('czechmafie-kasino.csv',
              casinoCsv(c), 'text/csv;charset=utf-8')),
            confirmBtn('Smazat bilanci', 'Opravdu smazat?', async () => {
              // reset patří modulu – seznam klíčů se rozrůstá a tady by zůstal starý
              await NS.casino.reset();
              draw();
            })));
          body.appendChild(sek);
        }
      }

      body.appendChild(h('div', { class: 'cmc-actions' },
        btn('⬇ Export CSV', () => NS.ui.download('czechmafie-historie.csv', NS.history.toCsv(), 'text/csv;charset=utf-8')),
        confirmBtn('Smazat historii', 'Opravdu smazat?', async () => { await NS.history.clear(); draw(); })));

      body.appendChild(note(`Bodů celkem: ${points} (maximum ${NS.history.MAX_POINTS}, pak se nejstarší zahazují).`));
    }

    draw();
  }

  /** CSV sázek: řádek na sázku, ať jde bilance přepočítat po svém. */
  function casinoCsv(c) {
    const hlavicka = ['cas', 'tip', 'vsazeno', 'vysledek', 'padlo', 'zmena'];
    const radky = (c.last || []).map(s => [
      new Date(s.at).toISOString(), s.tip, s.amount,
      s.win ? 'vyhra' : 'prohra', s.winner, s.delta
    ]);
    return [hlavicka, ...radky]
      .map(r => r.map(v => (/[";,\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','))
      .join('\n');
  }

  (NS.tabs || (NS.tabs = {})).historie = { label: 'Historie', render };
})();
