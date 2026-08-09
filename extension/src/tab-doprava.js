/* =============================================================================
 * tab-doprava.js – kolik která loď a letadlo doopravdy vydělalo
 *
 * Hra nikde nesčítá, co ti co přineslo: u prostředku vidíš jen poslední částku,
 * a jak ji sebereš, zmizí. Evidence se proto plní při každém sebrání peněz
 * z lišty (`fleet.logCollect`) a drží se per prostředek – zvlášť Grasswing,
 * zvlášť Marvella.
 *
 * Sebrané peníze samy neříkají, z čeho jsou – sběr je jiná událost než odeslání.
 * Proto se při vypravení zapamatuje náklad (`pending`) a při sběru se mu peníze
 * připíšou. Z toho pak jde spočítat i **náklad na materiál**: recepty vědí, kolik
 * čeho jde na jednotku a za kolik (whisky 8 kg pšenice × 2,50 Kč na sud, ze sudu
 * 30 l → 0,67 Kč/l), takže `zisk = výnos − materiál`.
 *
 * Kromě výdělku se vede i `lost`: kolik odteklo pozdním sběrem. Hra strhává
 * 3 % za každých 10 minut, takže je to jediné číslo, které jde vlastním
 * chováním dostat na nulu – a proto stojí za to ho vidět.
 *
 * Sbírá se jen to, co proběhne přes lištu. Co sebereš ručně v herním okně,
 * rozšíření nevidí (nemá jak – hra o tom nikde nepíše), a tabulka to říká
 * nahlas, aby čísla nevypadala kompletnější, než jsou.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, grid, section, note, btn, confirmBtn } = NS.ui;
  const F = NS.fmt;

  const ui = { sort: 'total' };

  const SORTS = [
    { key: 'total', label: 'výdělek' },
    { key: 'perRun', label: 'na jízdu' },
    { key: 'runs', label: 'počet jízd' },
    { key: 'label', label: 'označení' }
  ];

  function sorted(rows) {
    const r = rows.slice();
    if (ui.sort === 'label') {
      r.sort((a, b) => a.kind.localeCompare(b.kind) || a.n - b.n);
    } else {
      r.sort((a, b) => (b[ui.sort] || 0) - (a[ui.sort] || 0));
    }
    return r;
  }

  /** Jeden prostředek: označení, jméno, počet jízd, výdělek, průměr na jízdu. */
  function unitCard(r) {
    const head = h('div', { class: 'cmc-card-head' },
      h('span', { class: 'cmc-card-title', text: r.label + ' ' + r.name }),
      h('span', { class: 'cmc-card-total', text: F.kc(r.total, { short: true }) }));

    const karta = h('div', { class: 'cmc-card' + (r.lost > 0 ? ' cmc-card-err' : '') }, head,
      h('div', { class: 'cmc-facts' },
        h('div', { class: 'cmc-fact' },
          h('span', { class: 'cmc-fact-k', text: 'jízd' }),
          h('span', { class: 'cmc-fact-v', text: F.num(r.runs) })),
        h('div', { class: 'cmc-fact' },
          h('span', { class: 'cmc-fact-k', text: 'na jízdu' }),
          h('span', { class: 'cmc-fact-v', text: F.kc(r.perRun) })),
        h('div', { class: 'cmc-fact' },
          h('span', { class: 'cmc-fact-k', text: 'naposled' }),
          h('span', { class: 'cmc-fact-v', text: r.last ? F.ago(r.last) : '–' }))));

    // čím ten kus vozil – u lodí se náklad mění podle zásoby pervitinu
    if (r.cargo && r.cargo.length) {
      karta.appendChild(note('vozilo: ' + r.cargo
        .map(c => (c.label || c.id) + ' ' + F.num(c.runs) + '× (' + F.kc(c.total) + ')')
        .join(' · ')));
    }
    if (r.pending) {
      karta.appendChild(note('právě veze ' + (r.pending.label || r.pending.id)
        + (r.pending.amount ? ' ' + F.num(r.pending.amount) : '')
        + ' – po sebrání se to připíše do rozpadu'));
    }
    if (r.lost > 0) {
      karta.appendChild(note('⚠ pozdním sběrem odteklo ' + F.kc(r.lost)
        + ' (hra strhává 3 % za každých 10 minut)'));
    }
    return karta;
  }

  const podnadpis = text => h('div', { class: 'cmc-subsection' },
    h('div', { class: 'cmc-section-title', text }));

  /** „pšenice 643 kg × 2,50 Kč = 1 608 Kč“ */
  const inputRow = i => row(i.of || i.label,
    F.num(i.qty) + ' ' + (i.unit || '') + ' × ' + F.kc(i.price) + ' = ' + F.kc(i.cost));

  /**
   * Jedna surovina rozepsaná: nejdřív na jednu jízdu (to je ta otázka „co se
   * vyplatí vozit“), pak celkem, pak spotřeba vstupů a cena za jednotku.
   */
  function cargoCard(c) {
    const karta = h('div', { class: 'cmc-card' },
      h('div', { class: 'cmc-card-head' },
        h('span', { class: 'cmc-card-title', text: c.label || c.id }),
        h('span', {
          class: 'cmc-card-total',
          text: c.profitPerRun != null ? F.kc(c.profitPerRun) + ' / jízda' : F.kc(c.total, { short: true })
        })));

    /*
     * Kolik by za to dal prodejce. Materiál se spotřebuje stejně tak i tak, takže
     * rozdíl ve výnosu = rozdíl v zisku – proto se srovnává výnos a nemusí se to
     * počítat dvakrát.
     */
    const prodej = mnozstvi => (c.market != null ? c.market * mnozstvi : null);
    const rozdilRow = (dopravou, prodejem) => {
      const d = dopravou - prodejem;
      return row(d >= 0 ? 'doprava lepší o' : 'prodej lepší o',
        F.kc(Math.abs(d)), d >= 0 ? 'cmc-good' : 'cmc-bad');
    };

    // ---- na jednu jízdu ----
    if (c.runs > 0) {
      karta.appendChild(podnadpis('Na jednu jízdu'));
      karta.appendChild(row('vypraveno', F.num(c.amountPerRun) + (c.unit ? ' ' + c.unit : '')));
      karta.appendChild(row('výnos dopravou', F.kc(c.totalPerRun)));
      if (c.costPerRun != null) {
        karta.appendChild(row('materiál', '− ' + F.kc(c.costPerRun), 'cmc-bad'));
        karta.appendChild(row('čistý zisk', F.kc(c.profitPerRun), 'cmc-strong cmc-good'));
      }
      const pj = prodej(c.amountPerRun);
      if (pj != null) {
        karta.appendChild(row('u prodejce by bylo', F.kc(pj)));
        karta.appendChild(rozdilRow(c.totalPerRun, pj));
      }
      if (c.inputsPerRun && c.inputsPerRun.length) {
        for (const i of c.inputsPerRun) karta.appendChild(inputRow(i));
      }
    }

    // ---- celkem ----
    karta.appendChild(podnadpis('Celkem – ' + F.num(c.runs) + '× '
      + F.plural(c.runs, 'jízda', 'jízdy', 'jízd')));
    karta.appendChild(row('vypraveno', F.num(c.amount) + (c.unit ? ' ' + c.unit : '')));
    karta.appendChild(row('výnos dopravou', F.kc(c.total)));
    if (c.cost != null) {
      karta.appendChild(row('materiál', '− ' + F.kc(c.cost), 'cmc-bad'));
      karta.appendChild(row('čistý zisk', F.kc(c.profit), 'cmc-strong cmc-good'));
      if (c.margin != null) karta.appendChild(row('marže', F.pct(c.margin, 1)));
    }
    if (c.ifSold != null) {
      karta.appendChild(row('u prodejce by bylo', F.kc(c.ifSold)));
      karta.appendChild(rozdilRow(c.total, c.ifSold));
    }

    // ---- za jednotku ----
    if (c.perUnit != null) {
      karta.appendChild(podnadpis('Za jednu ' + (c.unit || 'jednotku')));
      karta.appendChild(row('dopravou', F.kc(c.perUnit)));
      if (c.market != null) karta.appendChild(row('u prodejce', F.kc(c.market)));
      if (c.unitCost != null) {
        karta.appendChild(row('materiál', '− ' + F.kc(c.unitCost), 'cmc-bad'));
        karta.appendChild(row('čistý zisk dopravou', F.kc(c.unitProfit), 'cmc-good'));
        if (c.market != null) {
          karta.appendChild(row('čistý zisk prodejem', F.kc(c.market - c.unitCost)));
        }
      }
    }
    if (c.ifSold != null) {
      const lepsi = c.total - c.ifSold;
      karta.appendChild(note((lepsi >= 0 ? '✓ vozit se vyplatí – o ' : '⚠ prodat se vyplatí víc – o ')
        + F.kc(Math.abs(lepsi)) + ' proti prodeji u prodejce'
        + (c.market != null ? ' (' + F.kc(c.market) + '/' + (c.unit || 'ks') + ')' : '')));
    }
    return karta;
  }

  /**
   * Srovnání surovin na jednu jízdu. Pozor: číslo na jízdu závisí i na tom, čím
   * se vozilo (velká loď unese víc), takže se vedle ukazuje i zisk na jednotku –
   * ten je na prostředku nezávislý, a tedy poctivé srovnání.
   */
  function cargoRanking(byCargo) {
    const dle = byCargo.filter(c => c.profitPerRun != null)
      .slice().sort((a, b) => b.profitPerRun - a.profitPerRun);
    if (dle.length < 2) return null;
    return section('Co se vyplatí vozit – na jednu jízdu',
      dle.map((c, i) => row((i + 1) + '. ' + (c.label || c.id),
        F.kc(c.profitPerRun) + (c.unitProfit != null ? '  (' + F.kc(c.unitProfit) + '/' + (c.unit || 'ks') + ')' : ''),
        i === 0 ? 'cmc-good' : '')),
      note('V závorce je zisk na jednotku – ten nezávisí na tom, čím se vozilo, '
        + 'takže je to poctivější srovnání než částka na jízdu (velký prostředek unese víc).'));
  }

  function cargoSection(byCargo) {
    if (!byCargo.length) return null;
    return section('Podle suroviny', byCargo.map(cargoCard),
      note('Materiál se počítá z receptů (spotřeba × cena vstupu ÷ výnos), '
        + 'takže se dopočítává z aktuálních cen – ne ze zamrazených.'));
  }

  /**
   * Když jsou zapsané výdělky, ale žádná surovina, není to porucha: rozpad umí
   * jen jízdy, u kterých rozšíření vidělo I ODESLÁNÍ. Sebrané peníze samy
   * neříkají, z čeho jsou, takže starší záznamy a jízdy odeslané ručně v herním
   * okně náklad nemají. Bez tohohle vysvětlení to vypadá, že se rozpad nedělá.
   */
  const cargoMissing = () => section('Podle suroviny',
    note('Zatím tu není co rozepsat. Rozpad podle suroviny a náklad na materiál '
      + 'umí jen jízdy, u kterých rozšíření vidělo i odeslání – potřebuje celý cyklus '
      + 'přes lištu: odeslat tlačítkem (tam se zapamatuje náklad) a po návratu sebrat '
      + 'tlačítkem (tam se mu peníze připíšou).'),
    note('Záznamy z dřívějška a jízdy odeslané ručně v herním okně proto mají jen '
      + 'výdělek, bez materiálu a zisku.'));

  function render(body, ctx) {
    const e = NS.fleet ? NS.fleet.earnings()
      : { rows: [], byCargo: [], total: 0, cost: null, profit: null, lost: 0, runs: 0 };

    /*
     * Celý výsledovkový řádek na jednom místě: hrubý výnos → materiál → čistý
     * zisk → co odteklo pozdním sběrem. Hrubý i čistý jsou vedle sebe schválně,
     * ať je vidět, kolik z toho spolkl materiál.
     */
    const marze = e.profit != null && e.total > 0 ? (e.profit / e.total) * 100 : null;
    body.appendChild(grid(
      tile('Hrubý výnos', F.kc(e.total, { short: true }),
        F.num(e.runs) + '× ' + F.plural(e.runs, 'sebráno', 'sebrání', 'sebrání')),
      tile('Materiál', e.cost != null ? '− ' + F.kc(e.cost, { short: true }) : '–',
        e.cost != null && e.total > 0
          ? F.pct((e.cost / e.total) * 100, 1) + ' z výnosu'
          : 'zatím neznámý'),
      tile('Čistý zisk', e.profit != null ? F.kc(e.profit, { short: true }) : '–',
        marze != null ? 'marže ' + F.pct(marze, 1) : 'chybí rozpad podle suroviny'),
      tile('Odteklo pozdním sběrem', F.kc(e.lost, { short: true }),
        e.total > 0 ? F.pct((e.lost / (e.total + e.lost)) * 100, 1) + ' z možného' : 'nic')));

    if (!e.rows.length) {
      body.appendChild(note('Ještě není co počítat. Eviduje se každé sebrání peněz, '
        + 'které uděláš tlačítkem v liště dole – zkus L1 / S1, jakmile zezelená.'));
      return;
    }

    const zebricek = cargoRanking(e.byCargo);
    if (zebricek) body.appendChild(zebricek);

    body.appendChild(cargoSection(e.byCargo) || cargoMissing());

    // řazení
    body.appendChild(h('div', { class: 'cmc-tabs cmc-tabs-sub' },
      SORTS.map(s => h('button', {
        class: 'cmc-tab' + (s.key === ui.sort ? ' cmc-tab-on' : ''),
        text: s.label,
        on: { click: () => { ui.sort = s.key; ctx.rerender(); } }
      }))));

    for (const kind of ['plane', 'boat']) {
      const skupina = sorted(e.rows).filter(r => r.kind === kind);
      if (!skupina.length) continue;
      const nazev = kind === 'plane' ? 'Letadla' : 'Lodě';
      const soucet = skupina.reduce((s, r) => s + r.total, 0);
      body.appendChild(section(nazev + ' – ' + F.kc(soucet, { short: true }),
        skupina.map(unitCard)));
    }

    // nejlepší a nejhorší kus – to je ta odpověď na „vyplatí se ta loď?“
    const dle = sorted(e.rows).filter(r => r.runs > 0);
    if (dle.length > 1) {
      const naJizdu = dle.slice().sort((a, b) => b.perRun - a.perRun);
      body.appendChild(section('Na jednu jízdu',
        row('nejvíc', naJizdu[0].label + ' ' + naJizdu[0].name + ' – ' + F.kc(naJizdu[0].perRun)),
        row('nejmíň', naJizdu[naJizdu.length - 1].label + ' ' + naJizdu[naJizdu.length - 1].name
          + ' – ' + F.kc(naJizdu[naJizdu.length - 1].perRun))));
    }

    body.appendChild(h('div', { class: 'cmc-actions' },
      btn('⬇ Export CSV', () => NS.ui.download('czechmafie-doprava.csv', toCsv(e), 'text/csv;charset=utf-8')),
      confirmBtn('Smazat evidenci', 'Opravdu smazat?', async () => {
        await NS.store.put('fleetLog', { plane: {}, boat: {} });
        ctx.rerender();
      })));

    body.appendChild(note('Počítá se jen to, co sebereš tlačítkem v liště. '
      + 'Sběr ručně v herním okně rozšíření nevidí, takže čísla jsou „co prošlo lištou“, '
      + 'ne celoživotní výdělek prostředku.'));
  }

  const dvě = v => (v == null ? '' : Math.round(v * 100) / 100);

  function toCsv(e) {
    const hlavicka = ['druh', 'oznaceni', 'jmeno', 'naklad', 'jizd', 'vypraveno',
      'vynos', 'material', 'zisk', 'zisk_na_jizdu', 'zisk_na_jednotku',
      'na_jizdu', 'odteklo', 'prvni', 'posledni'];
    const radky = [];
    for (const r of e.rows) {
      // řádek za prostředek a pak po nákladu, ať jde sečíst v tabulce jakkoli
      radky.push([r.kind, r.label, r.name, '(vše)', r.runs, '',
        dvě(r.total), '', '', '', '', dvě(r.perRun), dvě(r.lost),
        r.first ? new Date(r.first).toISOString() : '',
        r.last ? new Date(r.last).toISOString() : '']);
      for (const c of (r.cargo || [])) {
        const g = e.byCargo.find(x => x.id === c.id) || {};
        const material = g.unitCost != null ? g.unitCost * c.amount : null;
        const zisk = material != null ? c.total - material : null;
        radky.push([r.kind, r.label, r.name, c.label || c.id, c.runs, dvě(c.amount),
          dvě(c.total), dvě(material), dvě(zisk),
          zisk != null && c.runs ? dvě(zisk / c.runs) : '',
          g.unitProfit != null ? Math.round(g.unitProfit * 100000) / 100000 : '',
          c.runs ? dvě(c.total / c.runs) : '', '', '', '']);
      }
    }
    return [hlavicka, ...radky]
      .map(r => r.map(v => (/[";,\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(','))
      .join('\n');
  }

  (NS.tabs || (NS.tabs = {})).doprava = { label: 'Doprava', render };
})();
