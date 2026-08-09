/* =============================================================================
 * tab-stav.js – přehled budov, zásob a vyslání (read-only HUD)
 *
 * Nejdůležitější údaj na kartě je odpověď na „musím dokupovat materiál?“.
 * Hra ji z části řekne sama („Máš dost ingrediencí na 679 sudů“), takže se
 * bere přednostně její číslo a dopočítá se, jak dlouho zásoba vydrží.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, tile, row, meter, badge, btn, numField, section, grid, note, errorBox } = NS.ui;
  const F = NS.fmt;

  const recipeFor = kind => (NS.store.get().econ.recipes || []).find(r => r.kind === kind);

  /* ---- zásoby materiálu --------------------------------------------------- */

  /**
   * Kolik jednotek zásoby pokryjí. Přednost má číslo ze hry (`enough`), protože
   * bere v úvahu i to, co my nevidíme; jinak se spočítá z poměrů surovin.
   */
  function coverage(b) {
    const m = b.metrics || {};
    if (m.enough != null) return { units: m.enough, from: 'hra' };
    const calc = NS.econ.unitsCovered(b.inputs);
    return calc ? { units: calc.units, from: 'výpočet', limiting: calc.limiting } : null;
  }

  function supplyBlock(b, spec) {
    const m = b.metrics || {};
    const r = recipeFor(b.kind);
    if (!r || !b.inputs || !b.inputs.length) return null;

    const cov = coverage(b);
    if (!cov) return null;

    const forms = b.unitForms || r.unitForms;
    const box = h('div', { class: 'cmc-supply' });

    // 1) pokrývá zásoba celou volnou kapacitu?
    const free = m.free;
    if (free != null) {
      if (cov.units >= free && free > 0) {
        box.appendChild(h('div', { class: 'cmc-supply-ok', text: '→ Materiál pokryje všech ' + F.count(free, ...forms) + ', které máš volné.' }));
      } else if (free > 0) {
        const short = NS.econ.restockAll(b.inputs, free).filter(i => i.missing > 0);
        const list = short.map(i => `${F.num(i.missing)} ${i.unit} ${i.of}`).join(' a ');
        const cost = short.reduce((s, i) => s + i.cost, 0);
        box.appendChild(h('div', { class: 'cmc-supply-warn' },
          h('strong', { text: '⚠ Materiál nestačí. ' }),
          `Zásoba pokryje ${F.count(cov.units, ...forms)} z ${F.num(free)} volných – na zbytek dokup ${list} ≈ ${F.kc(cost)}.`));
      } else {
        box.appendChild(h('div', { class: 'cmc-supply-ok', text: '→ Nic volného – všechno běží. Zásoba by pokryla ' + F.count(cov.units, ...forms) + '.' }));
      }
    }

    // 2) na kolik plných naplnění budovy zásoba vystačí (a kolik je to výroby)
    const cap = m.capacity != null ? m.capacity : (spec && spec.capacity > 0 ? +spec.capacity : null);
    if (cap > 0) {
      const s = NS.econ.batchesFromStock({ inputs: b.inputs, capacity: cap, hours: r.hours });
      if (s) {
        const per = s.perBatch.map(i => `${F.num(i.needPerBatch)} ${i.unit} ${i.of}`).join(' + ');
        box.appendChild(h('div', { class: 'cmc-supply-head', text: `Plné vytížení: ${F.count(cap, ...forms)} = ${per}` }));
        const dur = s.hoursOfWork ? ' (~' + F.hours(s.hoursOfWork) + ' výroby)' : '';
        box.appendChild(h('div', {
          class: s.batches <= 2 ? 'cmc-supply-warn' : 'cmc-supply-ok',
          text: (s.batches <= 2 ? '⚠ ' : '→ ') +
            `Zásoba vystačí na ${F.count(s.batches, 'plné naplnění', 'plná naplnění', 'plných naplnění')}${dur}` +
            (s.batches <= 2 ? ' – materiál brzy dokup.' : '.')
        }));
      }
    } else if (m.free != null) {
      box.appendChild(note('Celkovou kapacitu nelze přečíst (nic se právě nevyrábí) – doplň ji v nastavení a uvidíš, na kolik plných dávek zásoba vydrží.'));
    }

    // 3) která surovina je úzké hrdlo (u víc surovin)
    if (b.inputs.length > 1) {
      const calc = NS.econ.unitsCovered(b.inputs);
      if (calc && calc.limiting) {
        box.appendChild(note('Úzké hrdlo: ' + calc.limiting.label.toLowerCase() +
          ' (pokryje ' + F.num(calc.units) + ', ostatní víc).'));
      }
    }
    return box;
  }

  /* ---- karty ------------------------------------------------------------- */

  function bankCard(b) {
    const m = b.metrics || {};
    return h('div', { class: 'cmc-card' },
      h('div', { class: 'cmc-card-head' },
        h('span', { class: 'cmc-card-title', text: b.label }),
        h('span', { class: 'cmc-card-id', text: '#' + b.id })),
      row('V bance', F.kc(m.bank)),
      row('Čisté peníze', F.kc(m.clean)),
      row('Špinavé peníze', F.kc(m.dirty)),
      m.launderLimit != null ? note('Vyprat lze ' + F.kc(m.launderLimit) + ' (kurz 100 → 70 Kč).') : null);
  }

  function buildingCard(b, spec) {
    if (b.error) {
      return h('div', { class: 'cmc-card cmc-card-err' },
        h('div', { class: 'cmc-card-head' },
          h('span', { class: 'cmc-card-title', text: b.label }),
          b.id > 0 ? h('span', { class: 'cmc-card-id', text: '#' + b.id }) : null),
        errorBox(b.error));
    }
    if (b.isBank) return bankCard(b);

    const ready = b.harvestReady || b.percent === 100;
    const head = h('div', { class: 'cmc-card-head' },
      h('span', { class: 'cmc-card-title', text: b.label }),
      h('span', { class: 'cmc-card-id', text: '#' + b.id }),
      ready ? badge('✓ k sebrání', 'ready') : null);

    const progressLine = h('div', { class: 'cmc-progress' },
      meter(b.percent, { ready }),
      h('span', { class: 'cmc-progress-num', text: b.percent == null ? '?' : b.percent + ' %' }));

    const facts = h('div', { class: 'cmc-facts' },
      (b.fields || []).filter(f => f.v != null).map(f =>
        h('span', { class: 'cmc-fact' },
          h('span', { class: 'cmc-fact-k', text: f.k }),
          h('span', { class: 'cmc-fact-v', text: F.num(f.v) + (f.unit ? ' ' + f.unit : '') }))));

    const eta = b.remainingSec != null && !ready
      ? note('Do dokončení ' + F.dur(b.remainingSec) + ' → ' + F.time(Date.now() + b.remainingSec * 1000))
      : null;

    const unmatched = b.unmatched
      ? note('Popisky tohoto typu se nepodařilo poznat – níž je, co se z fragmentu přečíst dalo.')
      : null;

    return h('div', { class: 'cmc-card' + (ready ? ' cmc-card-ready' : '') },
      head, progressLine, facts, eta, supplyBlock(b, spec), unmatched);
  }

  /* ---- vyslání ----------------------------------------------------------- */

  function stockFor(f, buildings) {
    if (f.sourceBuildingId) {
      const b = buildings.find(x => x.id === +f.sourceBuildingId && !x.error);
      const v = b && b.metrics ? b.metrics[f.sourceMetric || 'stock'] : null;
      if (v != null) return { value: v, from: b.label };
    }
    return { value: f.stock, from: null };
  }

  async function saveFleet(id, partial) {
    const fleet = NS.store.get().fleet.map(f => (f.id === id ? { ...f, ...partial } : f));
    await NS.store.put('fleet', fleet);
  }

  function fleetCard(f, buildings, redraw) {
    const src = stockFor(f, buildings);
    const d = NS.econ.dispatch({ stock: src.value, capacity: f.capacity, count: f.count, cost: f.cost });

    const head = h('div', { class: 'cmc-card-head' },
      h('span', { class: 'cmc-card-title', text: f.name }),
      h('span', {
        class: 'cmc-card-id',
        text: 'kapacita ' + F.num(f.capacity) + (f.count > 0 ? ' · ' + F.num(f.count) + ' ks' : '')
      }));

    const stockInput = numField(
      src.from ? 'Zásoba – zdroj: ' + src.from : 'Zásoba k odeslání',
      src.value,
      async v => { await saveFleet(f.id, { stock: v, sourceBuildingId: null }); redraw(); },
      { min: 0, hint: src.from ? 'přepsáním se odpojí od budovy' : null });

    let verdict;
    if (d.trips == null) verdict = note('Zadej kapacitu jednoho vyslání.');
    else if (src.value == null) verdict = note('Zadej zásobu, nebo prostředek napoj na budovu v nastavení.');
    else if (d.trips === 0) verdict = note(`Na jedno plné vyslání chybí ${F.num(d.missingForNext)}.`);
    else {
      const parts = [F.count(d.trips, 'plné vyslání', 'plná vyslání', 'plných vyslání')];
      if (f.count > 0 && d.trips > f.count) {
        parts.push(`hned vypravíš ${F.num(d.now)}`);
        parts.push(F.count(d.waves, 'vlna', 'vlny', 'vln'));
      }
      if (d.leftover > 0) parts.push(`zbyde ${F.num(d.leftover)} (na další chybí ${F.num(d.missingForNext)})`);
      if (d.cost > 0) parts.push('poplatky ' + F.kc(d.cost));
      verdict = h('div', { class: 'cmc-verdict', text: '→ ' + parts.join(' · ') });
    }

    return h('div', { class: 'cmc-card' }, head, grid(stockInput), verdict);
  }

  /* ---- celá záložka ------------------------------------------------------ */

  function render(root, ctx) {
    const cfg = NS.store.get();
    const st = ctx.state;

    const moneyTile = tile('Majetek', '–', '');
    const valueEl = moneyTile.querySelector('.cmc-tile-value');
    const subEl = moneyTile.querySelector('.cmc-tile-sub');

    function paintMoney() {
      const parts = [];
      let total = null;
      const add = (v, label) => {
        if (v == null) return;
        total = (total || 0) + v;
        parts.push(label + ' ' + F.kc(v, { short: true }));
      };
      add(st.cash, 'hotovost');
      add(st.bank, 'banka');
      if (cfg.read.countDirty) add(st.dirty, 'špinavé');

      valueEl.textContent = total == null ? '–' : F.kc(total, { short: true });
      valueEl.title = total == null ? '' : F.kc(total);
      subEl.textContent = parts.length
        ? parts.join(' + ')
        : (st.lastRead ? 'nepodařilo se přečíst' : 'zatím nenačteno');
    }
    paintMoney();

    const live = st.buildings.filter(b => !b.error && !b.isBank);
    const readyCount = live.filter(b => b.harvestReady || b.percent === 100).length;
    // diamanty jsou jiná valuta – vlastní dlaždice, nikdy ne v součtu s Kč
    const gemsTile = tile('Diamanty',
      st.gems == null ? '–' : F.gems(st.gems),
      st.gems == null ? 'HUD hry není vidět' : 'premiová valuta');

    root.appendChild(grid(moneyTile, gemsTile,
      tile('K sebrání', readyCount + ' / ' + live.length,
        readyCount ? 'něco čeká' : 'nic nečeká')));

    // hodnoty z minulého čtení – ať je jasné, že nejsou z téhle chvíle
    if (st.stale && st.lastRead) {
      root.appendChild(note('Hodnoty jsou z posledního čtení (' + F.ago(st.lastRead) +
        '). Klikni na „Načíst stav“ pro aktuální.'));
    }

    // špinavé peníze jsou majetek jen napůl (praní bere 30 %) – ať jde vypnout
    if (st.dirty != null) {
      root.appendChild(h('label', { class: 'cmc-check' },
        h('input', {
          type: 'checkbox',
          checked: cfg.read.countDirty || null,
          on: {
            change: async ev => {
              await NS.store.patch('read', { countDirty: ev.target.checked });
              ctx.rerender();
            }
          }
        }),
        h('span', { text: 'Počítat špinavé peníze do majetku' })));
    }

    // diamanty jde zadat ručně (HUD chybí např. na samostatné stránce budovy)
    if (st.gems == null) {
      root.appendChild(grid(numField('Diamanty', cfg.read.gemsManual,
        v => { st.gems = v; NS.store.patch('read', { gemsManual: v }); },
        { min: 0, hint: 'z HUD hry se načtou samy' })));
    }

    // ruční zůstatek jen když ho nemáme odjinud
    if (st.bank == null || st.bankFrom === 'ručně') {
      root.appendChild(grid(numField('Zůstatek v bance (Kč)', cfg.read.bankManual,
        v => {
          st.bank = v;
          paintMoney();
          NS.store.patch('read', { bankManual: v });
        },
        { min: 0, hint: 'sleduj budovu Banka a načte se sám' })));
    }

    root.appendChild(h('div', { class: 'cmc-actions' },
      btn(st.busy ? ('Načítám… ' + (st.progress || '')) : '↻ Načíst stav',
        ctx.refresh, { kind: 'primary', disabled: st.busy })));

    root.appendChild(h('label', { class: 'cmc-check' },
      h('input', {
        type: 'checkbox',
        checked: cfg.read.autoRefresh || null,
        on: {
          change: async ev => {
            await NS.store.patch('read', { autoRefresh: ev.target.checked });
            ctx.rescheduleAuto();
          }
        }
      }),
      h('span', { text: `Načítat samo každých ${Math.round(cfg.read.refreshSeconds / 60)} min` })));

    if (st.error) root.appendChild(errorBox(st.error));

    if (!st.buildings.length) {
      root.appendChild(note('Klikni na „Načíst stav“. Rozšíření si stáhne stránky budov (jen čtení) a vypíše, jak na tom jsou.'));
    } else {
      const specOf = id => cfg.read.buildings.find(s => s.id === id);
      root.appendChild(section(null, st.buildings.map(b => buildingCard(b, specOf(b.id)))));
    }

    if (cfg.fleet && cfg.fleet.length) {
      const fleetBox = h('div');
      const drawFleet = () => {
        NS.ui.clear(fleetBox);
        NS.store.get().fleet.forEach(f => fleetBox.appendChild(fleetCard(f, st.buildings, drawFleet)));
      };
      drawFleet();
      root.appendChild(section('Kolik ještě vyšleš', fleetBox,
        note('Prostředky a jejich kapacitu nastavíš v ikoně rozšíření.')));
    }

    root.appendChild(note('Sledované budovy a interval nastavíš v ikoně rozšíření. ID slotu najdeš v URL hry: /map/building/show/{id}.'));
  }

  (NS.tabs || (NS.tabs = {})).stav = { label: 'Stav', render };
})();
