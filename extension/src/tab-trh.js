/* =============================================================================
 * tab-trh.js – evidence předmětů: produkt → varianty → kusy, ceny a kvalita
 *
 * Jedna položka je PRODUKT (master) a pod ní se rozbalí varianty. Master je cesta
 * obrázku bez přípony, protože nese i kategorii a vzácnost – proto je u něj taky
 * vidět obrázek přímo z CDN hry (ukládá se jen cesta, ne data).
 *
 * !!! CO SE TU NEDÁ UKÁZAT A PROČ !!!
 * Konečná cena aukce není nikde k přečtení – vidí se jen průběh do vypršení.
 * Vedená cena je proto POSLEDNÍ VIDĚNÁ NABÍDKA, tedy dolní odhad, a je to tak
 * i pojmenované. Skutečnou zaplacenou cenu zadává uživatel tlačítkem.
 *
 * A koupený kus se v inventáři automaticky nedohledá: aukce `data-item-id` nemá
 * a číslo `#4076` v jejím popisku je pořadí v žebříčku („#4076 na místě“), ne
 * identita. Proto je vazba ceny na kus nepovinná a ruční.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, badge, btn, confirmBtn, numField, textField,
    section, grid, note } = NS.ui;
  const F = NS.fmt;
  const M = () => NS.market;

  const ui = {
    query: '',
    sort: 'nazev',
    jenSve: false,
    otevreny: null,        // rozbalený produkt
    formular: null,        // { master, cena, kvalita, hodnota, instance, poznamka }
    novy: null,            // { nazev, obrazek, kategorie, vzacnost }
    novyKus: null,         // { master, instance, kvalita, hodnota }
    hlaska: null
  };

  const CDN = 'https://2025game.narco.lt';

  /** Obrázek masteru z CDN hry. Ukládá se jen cesta – base64 by byl megabajt. */
  function obrazek(p) {
    if (!p.obrazek) return h('span', { class: 'cmc-trh-ikona cmc-trh-ikona-chybi', text: '?' });
    return h('img', {
      class: 'cmc-trh-ikona', src: CDN + p.obrazek, alt: p.nazev,
      title: p.obrazek, loading: 'lazy'
    });
  }

  const pct = v => (v == null ? '—' : F.num(Math.round(v * 100) / 100) + ' %');

  /*
   * Volby statu pro ruční zápis. Ukládá se KLÍČ hry (`defense`), ne české jméno –
   * tím ruční záznam a to, co přečte sběr z ikony inventáře, padnou na totéž.
   */
  const volbyStatu = () => [{ value: '', label: '— neuvedeno —' }].concat(
    Object.entries(M().STATY).map(([value, label]) => ({ value, label })));

  /* ---- formulář na ruční cenu ---------------------------------------------- */

  function formular(render) {
    const f = ui.formular;
    if (!f) return null;
    const p = M().prehled(f.master);
    return section('Uložit cenu – ' + (p ? p.nazev : f.master),
      note('Konečná cena z aukce se přečíst nedá (vidí se jen průběh do vypršení),'
        + ' takže sem patří to, co jsi doopravdy zaplatil. Kvalitu a hodnotu vyplň'
        + ' podle kusu, kterého se to týká – podle nich se pak ceny srovnávají.'),
      grid(
        numField('Cena (Kč)', f.cena, v => { f.cena = v; }),
        numField('Kvalita (%)', f.kvalita, v => { f.kvalita = v; }),
        numField('Kolik dává', f.hodnota, v => { f.hodnota = v; }),
        NS.ui.selectField('Který stat', f.stat || '', volbyStatu(),
          v => { f.stat = v; }),
        textField('Kus (nepovinné)', f.instance, v => { f.instance = v; },
          { placeholder: 'data-item-id z inventáře' })
      ),
      textField('Poznámka', f.poznamka, v => { f.poznamka = v; }),
      h('div', { class: 'cmc-actions' },
        btn('Uložit', async () => {
          try {
            await M().ulozCenu(f.master, f);
            ui.hlaska = 'Cena uložena.';
            ui.formular = null;
          } catch (e) { ui.hlaska = e.message; }
          render();
        }, { primary: true }),
        btn('Zrušit', () => { ui.formular = null; render(); })));
  }

  /**
   * Přidání produktu ručně.
   *
   * !!! CESTA OBRÁZKU JE TO, CO SPOJÍ RUČNÍ ZÁPIS SE SBĚREM !!!
   * Master se normálně bere z cesty obrázku. Když ji sem uživatel vloží, ruční
   * záznam a to, co později najde sběr v aukci, je TÝŽ produkt. Bez ní vznikne
   * `rucne/<název>` – samostatná položka, kterou sběr nikdy nedoplní. Je to tady
   * napsané, protože jinak by to byla nemilá záhada.
   */
  function formularNovy(render) {
    const f = ui.novy;
    if (!f) return null;
    return section('Přidat produkt',
      textField('Název', f.nazev, v => { f.nazev = v; },
        { placeholder: 'např. Válečná helma' }),
      textField('Cesta obrázku (nepovinné)', f.obrazek, v => { f.obrazek = v; },
        { placeholder: '/main/inventory/clothes/hats/rare/warrior_helmet.webp' }),
      note('Cestu obrázku zjistíš ve hře pravým klikem na ikonu předmětu →'
        + ' „Kopírovat adresu obrázku“. Když ji vyplníš, doplní se kategorie'
        + ' i vzácnost samy a záznam se SPOJÍ s tím, co pak najde sběr v aukci.'
        + ' Bez ní zůstane samostatný a sběr o něm nebude vědět.'),
      grid(
        textField('Kategorie', f.kategorie, v => { f.kategorie = v; },
          { placeholder: 'clothes/hats' }),
        NS.ui.selectField('Vzácnost', f.vzacnost || '', [
          { value: '', label: '—' },
          { value: 'common', label: 'common' },
          { value: 'uncommon', label: 'uncommon' },
          { value: 'rare', label: 'rare' },
          { value: 'epic', label: 'epic' },
          { value: 'legendary', label: 'legendary' },
          { value: 'mythic', label: 'mythic' }
        ], v => { f.vzacnost = v; })),
      h('div', { class: 'cmc-actions' },
        btn('Přidat', async () => {
          try {
            const r = await M().pridejProdukt(f);
            ui.hlaska = r.novy
              ? ('Přidáno' + (r.rucne ? ' (bez obrázku – sběr to nespojí)' : '') + '.')
              : 'Takový produkt už v seznamu byl, jen se doplnil.';
            ui.otevreny = r.master;
            ui.novy = null;
          } catch (e) { ui.hlaska = e.message; }
          render();
        }, { primary: true }),
        btn('Zrušit', () => { ui.novy = null; render(); })));
  }

  /** Přidání konkrétního kusu k produktu. */
  function formularKus(render) {
    const f = ui.novyKus;
    if (!f) return null;
    return section('Přidat kus',
      note('Kvalita je to procento, které hra píše u předmětu (např. +1,05 %).'
        + ' Označení kusu je `data-item-id` z inventáře – když ho nevyplníš,'
        + ' vyrobí se vlastní, aby se dva ruční kusy nepřebily.'),
      grid(
        numField('Kvalita (%)', f.kvalita, v => { f.kvalita = v; }),
        numField('Kolik dává', f.hodnota, v => { f.hodnota = v; }),
        NS.ui.selectField('Který stat', f.stat || '', volbyStatu(),
          v => { f.stat = v; }),
        textField('Označení kusu', f.instance, v => { f.instance = v; },
          { placeholder: 'nepovinné' })),
      h('div', { class: 'cmc-actions' },
        btn('Přidat kus', async () => {
          try {
            await M().pridejKus(f.master, f);
            ui.hlaska = 'Kus přidán.';
            ui.novyKus = null;
          } catch (e) { ui.hlaska = e.message; }
          render();
        }, { primary: true }),
        btn('Zrušit', () => { ui.novyKus = null; render(); })));
  }

  /* ---- staty do sloupců ---------------------------------------------------- */

  /*
   * Staty patří do SLOUPCŮ, ne do jedné textové buňky. Když se vypisovaly jako
   * „obrana +5 263“, nešlo dvě helmy srovnat očima – čísla se nekryla pod sebou.
   *
   * `stat` je klíč z ikony hry (`defense`), `key` je pojmenovaný stat u karet
   * (`obrana`) – karty mají v textu všechny tři, běžné předměty jen jeden podle
   * ikony. Tabulka proto zvládá obojí a ukazuje jen ty sloupce, ve kterých
   * něco opravdu je.
   */
  const SLOUPCE = [
    { key: 'sila', nazev: 'síla', stat: 'strength' },
    { key: 'obrana', nazev: 'obrana', stat: 'defense' },
    { key: 'rychlost', nazev: 'rychlost', stat: 'speed' },
    { key: 'stesti', nazev: 'štěstí', stat: 'resources-happy' }
  ];

  /**
   * Staty jednoho záznamu rozložené do klíčů sloupců. `jine` je hodnota, u které
   * druh statu neznáme (aukce ho neuvádí a produkt jsme v inventáři neviděli) –
   * ta se nesmí tiše zařadit pod nějaký sloupec.
   */
  function statyZ(x, p) {
    const out = {};
    if (x.staty) {
      for (const k of ['sila', 'obrana', 'rychlost', 'stesti']) {
        if (x.staty[k] != null) out[k] = x.staty[k];
      }
    }
    if (x.hodnota != null) {
      const stat = x.stat || (p && p.stat);
      const sl = SLOUPCE.find(c => c.stat === stat);
      if (sl) { if (out[sl.key] == null) out[sl.key] = x.hodnota; }
      else out.jine = x.hodnota;
    }
    return out;
  }

  /** Které sloupce se mají vykreslit – prázdné se vynechají, ať tabulka nekyne. */
  function aktivni(rows, p) {
    const mapa = rows.map(r => statyZ(r, p));
    const out = SLOUPCE.filter(c => mapa.some(m => m[c.key] != null));
    if (mapa.some(m => m.jine != null)) out.push({ key: 'jine', nazev: 'dává', stat: null });
    return out;
  }

  const cislo = v => (v == null ? '—' : '+' + F.num(v));

  /** Hlavičky a buňky statů – aby všechny tři tabulky vypadaly stejně. */
  const hlavyStatu = cols => cols.map(c => h('th', { class: 'cmc-num', text: c.nazev }));
  const bunkyStatu = (cols, x, p) => {
    const m = statyZ(x, p);
    return cols.map(c => h('td', { class: 'cmc-num', text: cislo(m[c.key]) }));
  };

  /* ---- rozbalený produkt --------------------------------------------------- */

  function detail(p, render) {
    const colKusy = aktivni(p.kusy, p);
    const kusy = p.kusy.length
      ? h('div', { class: 'cmc-trh-scroll' }, h('table', { class: 'cmc-table cmc-trh-tab' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'kus' }),
          h('th', { class: 'cmc-num', text: 'kvalita' }),
          ...hlavyStatu(colKusy))),
        h('tbody', {}, p.kusy.map(k => h('tr', {},
          h('td', { text: '#' + k.instance }),
          h('td', { class: 'cmc-num', text: pct(k.kvalita) }),
          ...bunkyStatu(colKusy, k, p))))))
      : note('Tenhle produkt v inventáři nemáš – je tu jen z aukce.');

    const videne = p.nabidky.slice(0, 12);
    const colNab = aktivni(videne, p);
    const nabidky = p.nabidky.length
      ? h('div', { class: 'cmc-trh-scroll' }, h('table', { class: 'cmc-table cmc-trh-tab' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'dražba' }),
          h('th', { class: 'cmc-num', text: 'poslední nabídka' }),
          h('th', { class: 'cmc-num', text: 'kvalita' }),
          ...hlavyStatu(colNab),
          h('th', { class: 'cmc-num', text: 'za bod' }),
          h('th', { text: 'viděno' }))),
        h('tbody', {}, videne.map(n => h('tr', {},
          h('td', { text: n.lotId ? '#' + n.lotId : '—' }),
          h('td', { class: 'cmc-num',
            text: (n.cena == null ? '—' : F.kc(n.cena, { short: true }))
              + (n.jednotka ? ' (' + n.jednotka + ')' : '') }),
          h('td', { class: 'cmc-num', text: pct(n.kvalita) }),
          /*
           * Druh statu aukce neuvádí – bere se z produktu, jak jsme ho jednou
           * viděli v inventáři. Dokud ho neznáme, jde číslo do sloupce „dává“.
           */
          ...bunkyStatu(colNab, n, p),
          h('td', { class: 'cmc-num',
            text: n.zaBod == null ? '—' : F.kc(Math.round(n.zaBod * 100) / 100) }),
          h('td', { text: n.at ? new Date(n.at).toLocaleString('cs-CZ') : '—' }))))))
      : note('Zatím jsem tenhle produkt v aukci neviděl.');

    const colCeny = aktivni(p.ceny, p);
    const ceny = p.ceny.length
      ? h('div', { class: 'cmc-trh-scroll' }, h('table', { class: 'cmc-table cmc-trh-tab' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'cmc-num', text: 'cena' }),
          h('th', { class: 'cmc-num', text: 'kvalita' }),
          ...hlavyStatu(colCeny),
          h('th', { class: 'cmc-num', text: 'za bod' }),
          h('th', { text: 'kus' }), h('th', { text: 'kdy' }),
          h('th', { text: 'poznámka' }))),
        h('tbody', {}, p.ceny.map(c => h('tr', {},
          h('td', { class: 'cmc-num', text: F.kc(c.cena) }),
          h('td', { class: 'cmc-num', text: pct(c.kvalita) }),
          ...bunkyStatu(colCeny, c, p),
          h('td', { class: 'cmc-num',
            text: c.zaBod == null ? '—' : F.kc(Math.round(c.zaBod * 100) / 100) }),
          h('td', { text: c.instance ? '#' + c.instance : '—' }),
          h('td', { text: new Date(c.at).toLocaleDateString('cs-CZ') }),
          h('td', { text: c.poznamka || '' }))))))
      : note('Žádná uložená cena. Tlačítkem „Uložit cenu“ zapíšeš, co jsi zaplatil.');

    return h('div', { class: 'cmc-trh-detail' },
      grid(
        tile('Kusů', F.num(p.pocetKusu)),
        tile('Nejlepší kvalita', pct(p.nejlepsiKvalita)),
        tile('Nejhorší kvalita', pct(p.nejhorsiKvalita)),
        tile('Cena za 1 % kvality', p.naProcento == null ? '—'
          : F.kc(Math.round(p.naProcento), { short: true }),
        p.naProcento == null ? 'zadej aspoň jednu cenu' : 'z uložených cen'),
        /*
         * Cena za bod statu je vlastně odpověď na „vyplatí se to?“ – procenta
         * srovnají kusy téhož produktu, ale napříč produkty se dá porovnat jen
         * to, co ten předmět doopravdy dá.
         */
        tile('Cena za bod ' + (p.statNazev || 'statu'),
          p.naBodStatu == null ? '—' : F.kc(Math.round(p.naBodStatu * 100) / 100),
          p.naBodStatu == null ? 'zadej cenu a hodnotu' : 'z uložených cen')),
      section('Moje kusy', kusy),
      section('Viděné dražby (poslední nabídka, ne konečná cena)', nabidky),
      section('Zaplacené ceny', ceny),
      h('div', { class: 'cmc-actions' },
        btn('Uložit cenu', () => {
          ui.formular = { master: p.id, cena: null,
            kvalita: p.nejlepsiKvalita, hodnota: null, stat: p.stat || '',
            instance: '', poznamka: '' };
          render();
        }, { primary: true }),
        btn('Přidat kus', () => {
          ui.novyKus = { master: p.id, kvalita: null, hodnota: null,
            stat: p.stat || '', instance: '' };
          render();
        }),
        confirmBtn('Smazat produkt', 'Opravdu smazat?', async () => {
          await M().smazProdukt(p.id);
          ui.otevreny = null;
          ui.hlaska = 'Produkt smazán.';
          render();
        })));
  }

  /* ---- karta --------------------------------------------------------------- */

  function render(el) {
    const prekresli = () => render(el);
    el.textContent = '';
    const m = M();
    if (!m) { el.appendChild(note('Modul evidence není načtený.')); return; }

    const s = m.souhrn();
    const sbira = m.zapnuto();

    el.appendChild(grid(
      tile('Produktů', F.num(s.produktu)),
      tile('Mých kusů', F.num(s.kusu)),
      tile('Viděných dražeb', F.num(s.nabidek)),
      tile('Zaplacených cen', F.num(s.cen))));

    el.appendChild(h('div', { class: 'cmc-actions' },
      btn(sbira ? 'Sběr zapnutý – vypnout' : 'Sběr vypnutý – zapnout', async () => {
        await NS.store.patch('read', { marketSbirat: !sbira });
        prekresli();
      }, { primary: !sbira }),
      btn('Načíst teď', async () => {
        ui.hlaska = 'čtu…';
        prekresli();
        const v = await m.nactiHned().catch(e => ({ chyba: e.message }));
        ui.hlaska = v && v.chyba ? v.chyba
          : (v ? 'Načteno.' : 'Nic nového (nebo jsi ve vězení / v nemocnici).');
        prekresli();
      }),
      btn('Přidat produkt', () => {
        ui.novy = { nazev: '', obrazek: '', kategorie: '', vzacnost: '' };
        render();
      }, { primary: true }),
      btn('CSV', () => NS.ui.download('predmety.csv', m.csv())),
      confirmBtn('Smazat evidenci', 'Opravdu smazat?',
        async () => { await m.smaz(); ui.otevreny = null; ui.hlaska = 'Evidence smazána.'; prekresli(); })));

    if (!sbira) {
      el.appendChild(note('Sběr je vypnutý, takže se nic nečte. Po zapnutí se každé'
        + ' 3 minuty přečte aukce a každou půlhodinu inventář – je to čtení, ve hře'
        + ' se tím nic nemění.'));
    }
    if (ui.hlaska) el.appendChild(note(ui.hlaska));

    el.appendChild(grid(
      textField('Hledat', ui.query, v => { ui.query = v; prekresli(); },
        { placeholder: 'název, kategorie, vzácnost' }),
      NS.ui.selectField('Řadit', ui.sort, [
        { value: 'nazev', label: 'podle názvu' },
        { value: 'kusy', label: 'podle počtu kusů' },
        { value: 'kvalita', label: 'podle kvality' },
        { value: 'cena', label: 'podle poslední nabídky' },
        { value: 'bodStatu', label: 'nejlevnější za bod statu' }
      ], v => { ui.sort = v; prekresli(); }),
      h('label', { class: 'cmc-check' },
        h('input', { type: 'checkbox', checked: ui.jenSve ? 'checked' : null,
          on: { change: ev => { ui.jenSve = ev.target.checked; prekresli(); } } }),
        h('span', { text: 'jen co mám' }))));

    if (ui.novy) el.appendChild(formularNovy(prekresli));
    if (ui.novyKus) el.appendChild(formularKus(prekresli));
    if (ui.formular) el.appendChild(formular(prekresli));

    const list = m.seznam({ query: ui.query, sort: ui.sort, jenSve: ui.jenSve });
    if (!list.length) {
      el.appendChild(note(s.produktu
        ? 'Nic neodpovídá hledání.'
        : 'Zatím nic. Zapni sběr, klikni na „Načíst teď“, nebo si produkt přidej'
          + ' ručně tlačítkem „Přidat produkt“.'));
      return;
    }

    for (const p of list) {
      const otevreno = ui.otevreny === p.id;
      const hlava = h('div', {
        class: 'cmc-trh-item' + (otevreno ? ' cmc-trh-item-open' : ''),
        on: { click: () => { ui.otevreny = otevreno ? null : p.id; prekresli(); } }
      },
      obrazek(p),
      h('div', { class: 'cmc-trh-jmeno' },
        h('div', { class: 'cmc-trh-nazev', text: p.nazev }),
        h('div', { class: 'cmc-trh-cesta',
          text: (p.statNazev ? p.statNazev + ' · ' : '') + (p.kategorie || p.id) })),
      p.vzacnost ? badge(p.vzacnost, p.vzacnost) : null,
      h('span', { class: 'cmc-trh-cislo',
        text: p.pocetKusu ? p.pocetKusu + '× moje' : '—' }),
      h('span', { class: 'cmc-trh-cislo', text: pct(p.nejlepsiKvalita) }),
      h('span', { class: 'cmc-trh-cislo',
        text: p.posledniCena == null ? '—' : F.kc(p.posledniCena, { short: true }) }));
      el.appendChild(hlava);
      if (otevreno) el.appendChild(detail(m.prehled(p.id), prekresli));
    }
  }

  // `__staty` je jen pro testy – rozklad statů do sloupců je logika, kterou má
  // smysl měřit zvlášť od vykreslování
  (NS.tabs || (NS.tabs = {})).trh = { label: 'Trh', render, __staty: { SLOUPCE, statyZ, aktivni } };
})();
