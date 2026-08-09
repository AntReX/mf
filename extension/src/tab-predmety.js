/* =============================================================================
 * tab-predmety.js – co tě předmět celkově stál
 *
 * Ke každému předmětu se eviduje pořízení (aukce / obchod / výroba / dar…) a
 * pak každý upgrade zvlášť. Celková cena = pořízení + všechny upgrady. Po
 * prodeji se dopočítá, jestli jsi na tom vydělal, nebo dotoval.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, badge, btn, confirmBtn, numField, textField, selectField,
    section, grid, note } = NS.ui;
  const F = NS.fmt;
  const I = () => NS.items;

  const ui = {
    query: '',
    sort: 'total',
    showSold: true,
    open: {},                     // id → rozbalený detail
    addOpen: false,
    draft: null,                  // rozpracovaný nový předmět
    upDraft: {}                   // id → rozpracovaný upgrade
  };

  const emptyDraft = () => ({
    name: '', category: 'jiné', source: 'aukce',
    acquiredAt: NS.items.today(), acquirePrice: null, note: ''
  });

  const SORTS = [
    { value: 'total', label: 'nejdražší' },
    { value: 'upgrades', label: 'nejvíc upgradů' },
    { value: 'date', label: 'nejnovější' },
    { value: 'name', label: 'podle názvu' }
  ];

  // ---- formulář nového předmětu -------------------------------------------
  function addForm(redraw) {
    if (!ui.draft) ui.draft = emptyDraft();
    const d = ui.draft;
    const nameF = textField('Název', d.name, v => { d.name = v; }, { placeholder: 'např. Colt 1911' });
    const err = h('div');

    return section(null,
      grid(
        nameF.wrap,
        selectField('Kategorie', d.category, I().CATEGORIES, v => { d.category = v; }),
        selectField('Jak získáno', d.source, I().SOURCES, v => { d.source = v; }),
        textField('Datum', d.acquiredAt, v => { d.acquiredAt = v; }, { type: 'date' }).wrap,
        numField('Cena pořízení (Kč)', d.acquirePrice, v => { d.acquirePrice = v; }, { min: 0, hint: 'u daru nebo úkolu nech 0' }),
        textField('Poznámka', d.note, v => { d.note = v; }, { placeholder: 'nepovinné' }).wrap),
      err,
      h('div', { class: 'cmc-actions' },
        btn('Uložit předmět', async () => {
          try {
            await I().add(d);
            ui.draft = emptyDraft();
            ui.addOpen = false;
            redraw();
          } catch (e) {
            NS.ui.clear(err).appendChild(NS.ui.errorBox(e.message));
          }
        }, { kind: 'primary' }),
        btn('Zrušit', () => { ui.addOpen = false; ui.draft = null; redraw(); })));
  }

  // ---- detail předmětu ----------------------------------------------------
  function upgradeList(it, redraw) {
    const ups = it.upgrades || [];
    if (!ups.length) return note('Žádné upgrady – celková cena je jen pořízení.');
    return h('div', { class: 'cmc-table' },
      ups.map((u, i) => h('div', { class: 'cmc-tr' },
        h('span', { text: u.at }),
        h('span', { text: u.label }),
        h('span', { text: F.kc(u.cost) }),
        h('button', {
          class: 'cmc-x', type: 'button', title: 'smazat upgrade', text: '×',
          on: { click: async () => { await I().removeUpgrade(it.id, i); redraw(); } }
        }))));
  }

  function upgradeForm(it, redraw) {
    const d = ui.upDraft[it.id] || (ui.upDraft[it.id] = { label: '', cost: null, at: I().today() });
    return h('div', { class: 'cmc-subsection' },
      grid(
        textField('Co se vylepšilo', d.label, v => { d.label = v; }, { placeholder: 'např. tlumič' }).wrap,
        numField('Cena (Kč)', d.cost, v => { d.cost = v; }, { min: 0 }),
        textField('Datum', d.at, v => { d.at = v; }, { type: 'date' }).wrap),
      h('div', { class: 'cmc-actions' },
        btn('+ Přidat upgrade', async () => {
          if (d.cost == null) return;
          await I().addUpgrade(it.id, d);
          delete ui.upDraft[it.id];
          redraw();
        }, { kind: 'primary' })));
  }

  function soldForm(it, redraw) {
    if (it.sold) {
      const n = I().net(it);
      return h('div', { class: 'cmc-subsection' },
        row('Prodáno', it.sold.at + ' za ' + F.kc(it.sold.price)),
        row('Výsledek', F.signed(n), n >= 0 ? 'cmc-good' : 'cmc-bad'),
        h('div', { class: 'cmc-actions' },
          btn('Vrátit mezi vlastněné', async () => { await I().unmarkSold(it.id); redraw(); })));
    }
    const d = ui.upDraft['sold_' + it.id] || (ui.upDraft['sold_' + it.id] = { price: null, at: I().today() });
    return h('div', { class: 'cmc-subsection' },
      grid(
        numField('Prodejní cena (Kč)', d.price, v => { d.price = v; }, { min: 0 }),
        textField('Datum prodeje', d.at, v => { d.at = v; }, { type: 'date' }).wrap),
      h('div', { class: 'cmc-actions' },
        btn('Označit jako prodané', async () => {
          if (d.price == null) return;
          await I().markSold(it.id, d.price, d.at);
          delete ui.upDraft['sold_' + it.id];
          redraw();
        })));
  }

  function itemCard(it, redraw) {
    const tot = I().total(it);
    const upc = I().upgradesCost(it);
    const share = I().upgradeShare(it);
    const open = !!ui.open[it.id];

    const head = h('div', {
      class: 'cmc-card-head cmc-clickable',
      on: { click: () => { ui.open[it.id] = !open; redraw(); } }
    },
      h('span', { class: 'cmc-card-title', text: it.name }),
      it.sold ? badge('prodáno', 'muted') : null,
      h('span', { class: 'cmc-card-total', text: F.kc(tot, { short: true }), title: F.kc(tot) }),
      h('span', { class: 'cmc-caret', text: open ? '▾' : '▸' }));

    const summary = h('div', { class: 'cmc-item-sum' },
      h('span', { class: 'cmc-fact-k', text: it.category + ' · ' + it.source + ' · ' + it.acquiredAt }),
      h('span', {
        class: 'cmc-fact-k',
        text: upc
          ? `pořízení ${F.kc(it.acquirePrice, { short: true })} + ${(it.upgrades || []).length}× upgrade ${F.kc(upc, { short: true })}`
          : `pořízení ${F.kc(it.acquirePrice, { short: true })}`
      }));

    const card = h('div', { class: 'cmc-card' + (it.sold ? ' cmc-card-muted' : '') }, head, summary);

    if (open) {
      card.appendChild(section('Celková cena',
        row('Pořízení (' + it.source + ')', F.kc(it.acquirePrice)),
        row('Upgrady (' + (it.upgrades || []).length + ')', F.kc(upc)),
        row('Celkem', F.kc(tot), 'cmc-strong'),
        share != null && upc ? note('Upgrady tvoří ' + F.pct(share) + ' celkové ceny.') : null));
      card.appendChild(section('Upgrady', upgradeList(it, redraw), upgradeForm(it, redraw)));
      card.appendChild(section('Prodej', soldForm(it, redraw)));
      if (it.note) card.appendChild(note(it.note));
      card.appendChild(h('div', { class: 'cmc-actions' },
        confirmBtn('Smazat předmět', 'Opravdu smazat?', async () => { await I().remove(it.id); redraw(); })));
    }

    return card;
  }

  // ---- celý tab -----------------------------------------------------------
  function render(root, ctx) {
    const body = h('div');
    root.appendChild(body);

    function redraw() {
      NS.ui.clear(body);
      const s = I().summary();

      body.appendChild(grid(
        tile('Investováno', F.kc(s.investedActive, { short: true }),
          F.count(s.activeCount, 'vlastněný předmět', 'vlastněné předměty', 'vlastněných předmětů')),
        tile('Z toho upgrady', F.kc(s.upgradesTotal, { short: true }),
          s.investedTotal ? F.pct((s.upgradesTotal / s.investedTotal) * 100) + ' všech výdajů' : '–')));

      if (s.soldCount) {
        body.appendChild(grid(
          tile('Prodáno', String(s.soldCount) + '×',
            F.plural(s.soldCount, 'předmět', 'předměty', 'předmětů')),
          tile('Výsledek prodejů', F.signed(s.realizedPnL),
            s.realizedPnL >= 0 ? 'vyděláno' : 'ztraceno')));
      }

      // přidání
      if (ui.addOpen) body.appendChild(addForm(redraw));
      else body.appendChild(h('div', { class: 'cmc-actions' },
        btn('+ Přidat předmět', () => { ui.addOpen = true; redraw(); }, { kind: 'primary' })));

      // filtr a řazení
      const search = textField(null, ui.query, v => {
        ui.query = v;
        drawList();
      }, { placeholder: 'hledat…' });
      body.appendChild(h('div', { class: 'cmc-filters' },
        search.wrap,
        selectField('Řadit', ui.sort, SORTS, v => { ui.sort = v; drawList(); }),
        h('label', { class: 'cmc-check' },
          h('input', {
            type: 'checkbox', checked: ui.showSold || null,
            on: { change: ev => { ui.showSold = ev.target.checked; drawList(); } }
          }),
          h('span', { text: 'i prodané' }))));

      const list = h('div', { class: 'cmc-list' });
      body.appendChild(list);

      function drawList() {
        NS.ui.clear(list);
        const items = I().view({ query: ui.query, sort: ui.sort, showSold: ui.showSold });
        if (!items.length) {
          list.appendChild(note(I().all().length
            ? 'Nic neodpovídá filtru.'
            : 'Zatím nic. Přidej první předmět – od pořizovací ceny přes každý upgrade uvidíš, kolik tě celkem stál.'));
          return;
        }
        items.forEach(it => list.appendChild(itemCard(it, redraw)));

        // kde peníze skončily
        const byCat = I().byCategory(items);
        if (byCat.length > 1) {
          list.appendChild(NS.chart.bars(byCat.slice(0, 6), {
            title: 'Celkem utraceno po kategoriích',
            format: v => F.kc(v, { short: true })
          }));
        }
      }

      drawList();

      body.appendChild(h('div', { class: 'cmc-actions' },
        btn('⬇ Export CSV', () => NS.ui.download('czechmafie-predmety.csv', I().toCsv(), 'text/csv;charset=utf-8'))));
      body.appendChild(note('Vyplňuješ ručně – hra tyhle údaje nikde souhrnně nedává. Zápis při každém nákupu je pár sekund a po pár měsících je to jediné místo, kde vidíš skutečnou cenu své výbavy.'));
    }

    redraw();
  }

  (NS.tabs || (NS.tabs = {})).predmety = { label: 'Předměty', render };
})();
