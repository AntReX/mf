/* =============================================================================
 * panel.js – skořápka panelu ve hře
 *
 * Drží stav načtení, přepínání záložek, tažení a auto-refresh. Samotné
 * záložky si registrují do NS.tabs a vykreslují se samy.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, btn } = NS.ui;

  const TAB_ORDER = ['stav', 'doprava', 'prijmy', 'automat', 'blackjack', 'poker', 'historie', 'predmety', 'trh'];

  /**
   * Pořadí je dané seznamem, ale co v něm není, se přidá na konec. Bez toho může
   * být nová záložka zaregistrovaná v `NS.tabs` a přesto nikde vidět – prostě se
   * zapomene dopsat sem. (Stalo se u „doprava“.)
   */
  const tabKeys = () => [
    ...TAB_ORDER.filter(k => NS.tabs[k]),
    ...Object.keys(NS.tabs).filter(k => !TAB_ORDER.includes(k))
  ];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const state = {
    buildings: [],     // výstupy parse.readBuilding()
    cash: null,
    bank: null,        // zůstatek v bance
    bankFrom: null,    // 'banka' | 'selektor' | 'ručně'
    dirty: null,       // špinavé peníze
    gems: null,        // diamanty (jiná valuta – nesčítá se s Kč)
    sales: {},         // výkupní ceny a zásoby produktů podle receptu
    lastRead: null,
    busy: false,
    progress: null,    // 'Palírna whisky (2/5)' – ať je vidět, že se něco děje
    error: null
  };

  let panel = null, bodyEl = null, tabsEl = null, autoTimer = null;
  let collapseEl = null, miniEl = null;

  // ---- čtení stavu (jediná síťová operace celého rozšíření) ---------------
  async function refresh() {
    // zaseknuté čtení nesmí navždy zablokovat tlačítko
    if (state.busy) {
      if (Date.now() - (state.busyAt || 0) < 90000) return;
      state.error = 'Předchozí čtení se zaseklo – zkouším znovu.';
    }
    state.busy = true;
    state.busyAt = Date.now();
    state.error = null;
    state.progress = null;
    state.stale = false;
    render();

    try {
      const cfg = NS.store.get();
      const out = [];
      const total = cfg.read.buildings.length;
      let done = 0;
      for (const spec of cfg.read.buildings) {
        state.progress = (spec.label || ('#' + spec.id)) + ' (' + (++done) + '/' + total + ')';
        render();
        // budova bez ID se nečte – jen se připomene, že jí chybí slot
        if (!(spec.id > 0)) {
          out.push({
            id: 0, label: spec.label || 'Nepojmenovaná budova', kind: spec.kind,
            error: 'Chybí ID slotu – doplň ho v ikoně rozšíření.', fields: [], metrics: {}
          });
          continue;
        }
        try {
          out.push(await NS.parse.readBuilding(spec));
        } catch (e) {
          out.push({
            id: spec.id, label: spec.label || ('Budova ' + spec.id), kind: spec.kind,
            error: e.message, fields: [], metrics: {}
          });
        }
        await sleep(250);   // ať to není dávka requestů v jednom okamžiku
      }
      state.buildings = out;

      // výkupní ceny a zásoby produktů (prodejní stránky jsou lehké)
      const sales = {};
      for (const r of (cfg.econ.recipes || [])) {
        if (!r.saleSlug) continue;
        state.progress = 'ceny ' + r.label;
        render();
        try {
          sales[r.id] = await NS.parse.readSale(r.saleSlug);
        } catch (e) {
          console.warn('[CMC] cena', r.saleSlug, e.message);
        }
        await sleep(200);
      }
      state.sales = sales;

      /*
       * Peníze a diamanty: HUD hry (`.money-set`) má přednost, protože je na
       * každé stránce a obsahuje všechny valuty. Zůstatek v bance v HUD není,
       * ten dá jedině budova Banka; pak selektor a nakonec ruční hodnota.
       */
      const hud = NS.parse.readHud();
      const bankCard = out.find(b => b.isBank && !b.error);
      const bm = bankCard ? bankCard.metrics : {};

      state.cash = hud.clean != null ? hud.clean
        : (bm.clean != null ? bm.clean : NS.parse.readCash(cfg.read.cashSelector));
      state.dirty = hud.dirty != null ? hud.dirty : (bm.dirty != null ? bm.dirty : null);
      state.gems = hud.gems != null ? hud.gems : cfg.read.gemsManual;

      if (bm.bank != null) {
        state.bank = bm.bank;
        state.bankFrom = 'banka';
      } else {
        const fromPage = NS.parse.readBankFromPage(cfg.read.bankSelector);
        state.bank = fromPage != null ? fromPage : cfg.read.bankManual;
        state.bankFrom = fromPage != null ? 'selektor' : 'ručně';
      }

      state.lastRead = Date.now();
      const worth = state.cash == null && state.bank == null && state.dirty == null
        ? null
        : (state.cash || 0) + (state.bank || 0) + (cfg.read.countDirty ? (state.dirty || 0) : 0);
      await NS.history.push(state.cash, state.bank, out.filter(b => !b.error), {
        dirty: state.dirty, gems: state.gems, total: worth
      });
      await saveLastState();
    } catch (e) {
      state.error = 'Čtení stavu selhalo: ' + e.message;
      console.error('[CMC] refresh', e);
    } finally {
      state.busy = false;
      state.progress = null;
      render();
    }
  }

  /** Uloží stav, aby panel po načtení stránky nezačínal prázdný. */
  async function saveLastState() {
    await NS.store.put('lastState', {
      at: state.lastRead,
      cash: state.cash,
      bank: state.bank,
      bankFrom: state.bankFrom,
      dirty: state.dirty,
      gems: state.gems,
      sales: state.sales,
      buildings: state.buildings
    });
  }

  /** Obnoví poslední známý stav (označený časem, kdy byl přečtený). */
  function restoreLastState() {
    const last = NS.store.get().lastState;
    if (!last || !last.at) return;
    state.cash = last.cash;
    state.bank = last.bank;
    state.bankFrom = last.bankFrom;
    state.dirty = last.dirty;
    state.gems = last.gems;
    state.sales = last.sales || {};
    state.buildings = last.buildings || [];
    state.lastRead = last.at;
    state.stale = true;      // hodnoty jsou z minulého čtení, ne z tohohle
  }

  function rescheduleAuto() {
    clearTimeout(autoTimer);
    const cfg = NS.store.get();
    if (!cfg.read.autoRefresh) return;
    const ms = Math.max(60, cfg.read.refreshSeconds || 180) * 1000;
    autoTimer = setTimeout(async () => { await refresh(); rescheduleAuto(); }, ms);
  }

  // ---- vykreslení ---------------------------------------------------------
  const ctx = { state, refresh, rescheduleAuto, rerender: () => render() };

  function render() {
    if (!bodyEl) return;
    const cfg = NS.store.get();
    const active = NS.tabs[cfg.ui.tab] ? cfg.ui.tab : 'stav';

    // záložky
    NS.ui.clear(tabsEl);
    for (const key of tabKeys()) {
      const tab = NS.tabs[key];
      if (!tab) continue;
      tabsEl.appendChild(h('button', {
        class: 'cmc-tab' + (key === active ? ' cmc-tab-on' : ''),
        type: 'button',
        text: tab.label,
        on: { click: () => { NS.store.patch('ui', { tab: key }); render(); } }
      }));
    }

    paintMini();
    NS.ui.clear(bodyEl);
    try {
      NS.tabs[active].render(bodyEl, ctx);
    } catch (e) {
      bodyEl.appendChild(NS.ui.errorBox('Chyba panelu: ' + e.message));
      console.error('[CMC]', e);
    }
  }

  // ---- stavba panelu ------------------------------------------------------
  function build() {
    if (document.getElementById('cmc-panel')) return;
    const cfg = NS.store.get();

    tabsEl = h('div', { class: 'cmc-tabs', id: 'cmc-tabs' });
    bodyEl = h('div', { class: 'cmc-body', id: 'cmc-body' });

    const version = (chrome.runtime && chrome.runtime.getManifest)
      ? chrome.runtime.getManifest().version : '?';

    // ve sbaleném stavu nese hlavička aspoň souhrn, ať to nevypadá mrtvě
    miniEl = h('span', { class: 'cmc-mini' });

    collapseEl = h('span', {
      class: 'cmc-icon', title: 'sbalit panel', text: '–',
      on: { click: ev => { ev.stopPropagation(); setCollapsed(!panel.classList.contains('cmc-collapsed')); } }
    });

    const head = h('div', { class: 'cmc-head', id: 'cmc-head' },
      h('span', { class: 'cmc-brand', text: 'CzechMafie Companion' }),
      h('span', { class: 'cmc-version', title: 'verze rozšíření – po Reload v chrome://extensions se musí změnit', text: 'v' + version }),
      miniEl,
      h('span', {
        class: 'cmc-icon', title: 'načíst stav', text: '↻',
        on: { click: ev => { ev.stopPropagation(); refresh(); } }
      }),
      collapseEl);

    panel = h('div', { class: 'cmc-panel', id: 'cmc-panel' },
      head, tabsEl, bodyEl,
      h('div', { class: 'cmc-foot', text: 'jen čtení – rozšíření neprovádí žádné herní akce' }));

    if (cfg.ui.collapsed) panel.classList.add('cmc-collapsed');
    paintCollapse();
    if (cfg.ui.left != null) { panel.style.left = cfg.ui.left + 'px'; panel.style.right = 'auto'; }
    if (cfg.ui.top != null) panel.style.top = cfg.ui.top + 'px';

    document.body.appendChild(panel);
    /*
     * Až po vložení do stránky – dřív panel nemá rozměry, takže by se nedalo
     * spočítat, jestli je vůbec vidět.
     */
    vratDoOkna();
    enableDrag(head);
    hlidejVelikostOkna();
    restoreLastState();
    render();
  }

  /**
   * Sbalení / rozbalení. Ikona musí říkat, co se stane – s pořád stejným „–“
   * nebylo po sbalení poznat, že je co rozbalit.
   */
  function setCollapsed(on) {
    panel.classList.toggle('cmc-collapsed', on);
    NS.store.patch('ui', { collapsed: on });
    paintCollapse();
  }

  function paintCollapse() {
    if (!collapseEl) return;
    const on = panel.classList.contains('cmc-collapsed');
    collapseEl.textContent = on ? '+' : '–';
    collapseEl.title = on ? 'rozbalit panel' : 'sbalit panel';
    paintMini();
  }

  /** Kompaktní souhrn do hlavičky (vidět jen když je panel sbalený). */
  function paintMini() {
    if (!miniEl) return;
    const parts = [];
    const worth = [state.cash, state.bank, state.dirty].some(v => v != null)
      ? (state.cash || 0) + (state.bank || 0) +
        (NS.store.get().read.countDirty ? (state.dirty || 0) : 0)
      : null;
    if (worth != null) parts.push(NS.fmt.kc(worth, { short: true }));
    if (state.gems != null) parts.push(NS.fmt.gems(state.gems));
    const ready = state.buildings.filter(b => !b.error && !b.isBank &&
      (b.harvestReady || b.percent === 100)).length;
    if (ready) parts.push(ready + '× k sebrání');
    miniEl.textContent = parts.join(' · ');
  }

  /*
   * !!! PANEL SE MUSÍ VEJÍT DO OKNA !!!
   * Poloha se pamatuje v pixelech od levého okraje. Na menším monitoru (nebo po
   * zmenšení okna) tak panel skončí za pravou hranou – není na něj vidět a
   * nedá se ani chytit za hlavičku, takže si ho uživatel nemůže přitáhnout
   * zpátky. Jediná cesta byla smazat nastavení.
   *
   * Proto se poloha po každém načtení (a po změně velikosti okna) srovná: co
   * přečuhuje, se přisadí k okraji. Ukládá se jen tehdy, když se doopravdy
   * hýbalo – jinak by se drobné posuny zapisovaly při každém reloadu.
   */
  const OKRAJ = 8;

  function vratDoOkna() {
    if (!panel) return false;
    const sirkaOkna = window.innerWidth || document.documentElement.clientWidth || 0;
    const vyskaOkna = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!sirkaOkna || !vyskaOkna) return false;

    const r = panel.getBoundingClientRect();
    /*
     * Panel bez uložené polohy visí na `right: 12px` – ten je vždycky v okně,
     * tak se do něj nesahá. Sahá se jen tam, kde je poloha zadaná zleva.
     */
    const maLevo = panel.style.left && panel.style.left !== 'auto';
    if (!maLevo && r.right <= sirkaOkna) return false;

    const sirka = r.width || panel.offsetWidth || 0;
    const vyska = r.height || panel.offsetHeight || 0;
    const maxL = Math.max(OKRAJ, sirkaOkna - sirka - OKRAJ);
    const maxT = Math.max(OKRAJ, vyskaOkna - Math.min(vyska, vyskaOkna) - OKRAJ);

    const l = Math.min(Math.max(OKRAJ, maLevo ? panel.offsetLeft : r.left), maxL);
    const t = Math.min(Math.max(OKRAJ, panel.offsetTop), maxT);

    const zmena = !maLevo || Math.abs(l - panel.offsetLeft) > 1
      || Math.abs(t - panel.offsetTop) > 1;
    if (!zmena) return false;

    panel.style.left = l + 'px';
    panel.style.top = t + 'px';
    panel.style.right = 'auto';
    NS.store.patch('ui', { left: l, top: t });
    return true;
  }

  /*
   * Změna velikosti okna přijde v mnoha událostech za sebou (tažení rámu), tak
   * se srovnává až po ustálení. Zvětšení okna nic nerozbije, ale nechat panel
   * u okraje je pořád lepší než ho tam mít napůl.
   */
  let srovnavac = null;
  function hlidejVelikostOkna() {
    window.addEventListener('resize', () => {
      clearTimeout(srovnavac);
      srovnavac = setTimeout(() => vratDoOkna(), 250);
    });
  }

  function enableDrag(handle) {
    let drag = null;
    handle.addEventListener('mousedown', e => {
      if (e.target.classList.contains('cmc-icon')) return;
      drag = { x: e.clientX, y: e.clientY, l: panel.offsetLeft, t: panel.offsetTop };
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      panel.style.left = (drag.l + e.clientX - drag.x) + 'px';
      panel.style.top = (drag.t + e.clientY - drag.y) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = null;
      NS.store.patch('ui', { left: panel.offsetLeft, top: panel.offsetTop });
    });
  }

  NS.panel = { build, render, refresh, rescheduleAuto, state, vratDoOkna };
})();
