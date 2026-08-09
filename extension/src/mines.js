/* =============================================================================
 * mines.js – diamantové šachty jako řádek v liště
 *
 *   ŠACHTY: D30  D31  D32  D33  D34  ☑auto │ Mzda ☑auto │ Nevěstinec ☑auto
 *
 * Šachta má dva stavy, které se střídají: „Začít pracovat“ a po dokončení
 * „Sebrat diamanty“. Lišta z toho udělá jedno tlačítko, které vždycky udělá to,
 * co je právě na řadě – stejně jako u letadel a lodí.
 *
 * !!! CESTY V HŘE !!!
 * Vlastněná šachta je na `/map/mine/show/{n}`, nepostavená vrací **404** –
 * `/map/mine/build/{n}` totiž ukazuje dialog „Postav důl“ i pro cizí čísla, takže
 * podle něj se vlastnictví poznat nedá. Seznam čísel se bere z mapy
 * (`[action*="/map/mine/show/"]`), což nestojí žádný požadavek, a drží se
 * v `chrome.storage` – šachty se nekupují každý den.
 *
 * !!! STEJNÁ HRANICE JAKO U TRÉNINKU !!!
 * Klik vloží fragment šachty do herního okna a klikne na skutečné tlačítko hry;
 * požadavek posílá hra. Jeden tvůj klik = jedna akce.
 *
 * Ověřené akce a třídy:
 *   /map/mine/start/{n}    .startMine             „Začít pracovat“
 *   /map/mine/collect/{n}  .collectMineDiamonds   „Sebrat diamanty“
 *   /map/mine/upgrade/{n}  .mineUpgrade           – vylepšení, do lišty NEPATŘÍ
 *
 * !!! ODPOČET NENÍ V `time-left-secs` !!!
 * Ten je ve fragmentu šachty napevno `0`. Skutečný čas je na `.working`:
 * `data-timedone` (konec), `data-timenow` (čas serveru) a `data-time` = zbytek
 * v sekundách, který jde i do minusu (`-3303` = hotovo před 55 minutami).
 * Kdyby se to čekalo z `time-left-secs`, každá šachta by se jevila jako hotová.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const URL_OF = n => '/map/mine/show/' + n;
  const STATE_TTL = 90 * 1000;
  const LIST_TTL = 12 * 60 * 60 * 1000;   // čísla šachet se mění jen při stavbě

  const SEL_COLLECT = '.collectMineDiamonds, [action*="/map/mine/collect/"]';
  const SEL_START = '.startMine, [action*="/map/mine/start/"]';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const doc = html => new DOMParser().parseFromString(html, 'text/html');

  /**
   * Zbývající sekundy z `.working`. `data-time` je zbytek (může být negativní =
   * dávno hotovo), jinak se spočítá z `data-timedone − data-timenow`. Do
   * `time-left-secs` se nekouká vůbec – ve fragmentu je vždycky 0.
   */
  /**
   * Délka celého cyklu ze `.working`: `data-timedone − data-timesent`. Hra sazbu
   * nikde neuvádí, takže se počítá z toho, co je v atributech (u mě 10 800 s = 3 h).
   * U nespuštěné šachty `.working` není, takže se vezme cyklus z jiné šachty.
   */
  function cycleOf(d) {
    const w = d.querySelector('.working');
    if (!w) return null;
    const done = NS.parse.toNum(w.getAttribute('data-timedone'));
    const sent = NS.parse.toNum(w.getAttribute('data-timesent'));
    return done != null && sent != null && done > sent ? done - sent : null;
  }

  function remaining(d) {
    const w = d.querySelector('.working');
    if (!w) return 0;
    const zbytek = NS.parse.toNum(w.getAttribute('data-time'));
    if (zbytek != null) return zbytek;
    const done = NS.parse.toNum(w.getAttribute('data-timedone'));
    const now = NS.parse.toNum(w.getAttribute('data-timenow'));
    return done != null && now != null ? done - now : 0;
  }

  let state = null;      // [{ n, mode, eta, yield, level }]
  let stateAt = 0;
  let inflight = null;

  /* ---- které šachty vlastním ---------------------------------------------- */

  /**
   * Čísla šachet z mapy (zdarma) nebo z uložených dat. Na mapě jsou vlastněné
   * jako `show/{n}`, ta nejbližší na postavení jako `build/{n}`.
   */
  function discover() {
    const zMapy = Array.from(document.querySelectorAll('[action*="/map/mine/show/"]'))
      .map(e => +String(e.getAttribute('action')).replace(/^.*show\//, ''))
      .filter(n => n > 0);
    const cache = NS.store.get().mines || { ids: [], at: 0 };
    if (zMapy.length) {
      const ids = [...new Set(zMapy)].sort((a, b) => a - b);
      if (ids.join() !== (cache.ids || []).join()) {
        NS.store.put('mines', { ids, at: Date.now() }).catch(() => {});
      }
      return ids;
    }
    return cache.ids || [];
  }

  /* ---- stav --------------------------------------------------------------- */

  /**
   * Stav jedné šachty. Pořadí rozhodování: nejdřív běžící odpočet (to přebíjí
   * všechno), pak sběr, pak spuštění – jinak by se u dokončené šachty mohlo
   * omylem sáhnout na „Začít pracovat“.
   */
  async function mineState(n) {
    const { status, raw } = await NS.parse.apiGet(URL_OF(n));
    if (status !== 200 || /"errors"/.test(raw.slice(0, 60))) return null;
    const d = doc(raw);
    const t = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ');

    const eta = remaining(d);
    const sebrat = d.querySelector(SEL_COLLECT);
    const zacit = d.querySelector(SEL_START);

    let mode = 'idle';
    if (eta > 0) mode = 'working';
    else if (sebrat) mode = 'collect';
    else if (zacit) mode = 'start';

    return {
      n, mode, eta,
      cycle: cycleOf(d),
      level: NS.parse.byRe(t, /Úroveň dolu:\s*(\d+)/i),
      yield: NS.parse.byRe(t, /Budeš moci vytěžit\s*(\d[\d\s]*)/i),
      // těžení spotřebovává zeleninu – bez ní se nerozjede
      veg: NS.parse.byRe(t, /Dostupná zelenina\s*:?\s*(\d[\d\s]*)/i)
    };
  }

  /**
   * Zapomene seznam i stav – použije se, když se postaví nová šachta a stránka
   * s mapou není po ruce, takže by se čekalo na její příští načtení.
   */
  async function forget() {
    state = null;
    stateAt = 0;
    await NS.store.put('mines', { ids: [], at: 0 });
  }

  function load(force) {
    if (!force && state && Date.now() - stateAt < STATE_TTL) return Promise.resolve(state);
    if (inflight) return inflight;
    inflight = doLoad().finally(() => { inflight = null; });
    return inflight;
  }

  async function doLoad() {
    const ids = discover();
    if (!ids.length) return state;
    const list = [];
    for (const n of ids) {
      const m = await mineState(n);
      if (m) list.push(m);
      await sleep(90);
    }
    if (!list.length) return state;
    state = list;
    stateAt = Date.now();
    return state;
  }

  async function refreshOne(n) {
    if (!state) return;
    const fresh = await mineState(n);
    if (!fresh) return;
    state = state.map(m => (m.n === n ? { ...m, ...fresh } : m));
  }

  /* ---- akce --------------------------------------------------------------- */

  /** Udělá, co je na řadě: sebere diamanty, nebo pustí šachtu do práce. */
  async function act(n) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const { status, raw } = await NS.parse.apiGet(URL_OF(n));
    if (status !== 200) throw new Error('šachtu nelze přečíst (HTTP ' + status + ')');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(150);

      // stav se ověřuje z ČERSTVÉHO fragmentu – v liště mohl zestárnout
      if (remaining(box) > 0) throw new Error('šachta ještě pracuje');

      const sebrat = box.querySelector(SEL_COLLECT);
      if (sebrat) {
        sebrat.click();
        await sleep(300);
        return { text: 'sebráno' };
      }
      const zacit = box.querySelector(SEL_START);
      if (!zacit) throw new Error('šachta teď nic nenabízí');
      zacit.click();
      await sleep(300);
      return { text: 'pustil jsem ji do práce' };
    } finally {
      box.remove();
    }
  }

  /* ---- automatické sbírání a spouštění (volitelné) ------------------------- */

  /*
   * !!! KLIKÁ BEZ TVÉHO KLIKNUTÍ !!!
   * Se zaškrtnutým „auto“ se hotové šachty samy seberou a nespuštěné se pustí do
   * práce. Z celé lišty je to nejméně sporná automatika: cyklus je pevný (3 h),
   * nic se nevybírá a nedá se tím nic prohrát – jen se nezapomene.
   *
   * Nejdřív se sbírá, pak spouští: sběr uvolní šachtu, aby se dala hned pustit
   * znovu, takže jedno kolo zvládne celý cyklus.
   */
  const AUTO_GAP = 1200;
  const AUTO_MAX_PER_ROUND = 12;
  let autoBusy = false;

  const autoSet = () => NS.store.get().read.mineAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  async function autoRound() {
    if (autoBusy || !autoOn()) return 0;
    if (NS.jail && NS.jail.blocked()) return 0;
    if (!NS.gym.gameHost()) return 0;

    autoBusy = true;
    let hotovo = 0;
    try {
      await load();
      if (!state) return 0;
      for (const rezim of ['collect', 'start']) {
        for (const m of state.filter(x => x.mode === rezim)) {
          if (hotovo >= AUTO_MAX_PER_ROUND || !autoOn()) return hotovo;
          try {
            const co = await NS.gym.withSuspend(() => act(m.n));
            await refreshOne(m.n);
            hotovo++;
            NS.gym.setStatus('auto D' + m.n + ' ' + co.text);
          } catch (e) {
            // jedna šachta neúspěchem nesmí zabít kolo (mohla se mezitím rozjet)
            NS.gym.setStatus('⚠ auto D' + m.n + ': ' + e.message, true);
          }
          await sleep(AUTO_GAP);
        }
      }
      return hotovo;
    } finally {
      autoBusy = false;
      if (hotovo) {
        const zprava = NS.gym.statusText();
        NS.gym.collect();
        if (zprava) NS.gym.setStatus(zprava, /⚠/.test(zprava));
      }
    }
  }

  /* ---- řádek v liště ------------------------------------------------------ */

  const MODE_CLASS = {
    collect: 'cmc-gym-unit-ready',     // zeleně: diamanty čekají
    start: 'cmc-gym-unit-send',        // vínově: dá se pustit do práce
    working: 'cmc-gym-unit-away',      // šedě: pracuje
    idle: 'cmc-gym-unit-away'
  };

  const SLOVO = { collect: 'sebrat', start: 'začít', working: 'pracuje', idle: '—' };

  /**
   * Souhrn do popisku řádku: kolik diamantů dá celá flotila šachet za cyklus a za
   * hodinu. Hra tohle nikde nesčítá, přitom je to jediné číslo, které řekne,
   * jestli se sbírání vyplatí hlídat.
   */
  function soucet() {
    if (!state || !state.length) return '';
    const cyklus = knownCycle();
    const celkem = state.reduce((s, m) => s + (m.yield || 0), 0);
    if (!(celkem > 0)) return '';
    const zaCyklus = ' · ' + state.length + '× šachta = ' + NS.fmt.gems(celkem);
    if (!(cyklus > 0)) return zaCyklus;
    const hodin = cyklus / 3600;
    return zaCyklus + ' za ' + (NS.fleet ? NS.fleet.etaText(cyklus) : cyklus + ' s')
      + ', tedy ' + NS.fmt.num(celkem / hodin) + ' 💎/h a '
      + NS.fmt.num(celkem / hodin * 24) + ' 💎/den'
      + (state[0] && state[0].veg ? '. Cyklus spotřebuje zeleninu.' : '');
  }

  const legend = 'Šachty: zeleně = diamanty k sebrání, vínově = dá se pustit do práce,'
    + ' šedě = právě pracuje (v tlačítku zbývající čas). Klik udělá to, co je na řadě;'
    + ' jeden klik = jedna akce. Vylepšení šachty v liště schválně není.';

  /** Cyklus, který se povedlo odečíst z kterékoli šachty (nespuštěná ho nemá). */
  const knownCycle = () => (state || []).map(m => m.cycle).find(c => c > 0) || null;

  /** „38 💎 za 3 h (12,7 💎/h)“ – hra sazbu neuvádí, tak se dopočítá. */
  function rateText(yieldGems, cycleSec) {
    if (!(yieldGems > 0) || !(cycleSec > 0)) return '';
    const hodin = cycleSec / 3600;
    return ' za ' + (NS.fleet ? NS.fleet.etaText(cycleSec) : cycleSec + ' s')
      + ' (' + NS.fmt.num(yieldGems / hodin) + ' 💎/h)';
  }

  function titleFor(m) {
    const zaklad = 'Důl č. ' + m.n + (m.level ? ' (úroveň ' + m.level + ')' : '');
    const vytezek = m.yield
      ? ', vytěží ' + NS.fmt.gems(m.yield) + rateText(m.yield, m.cycle || knownCycle())
      : '';
    const zelenina = m.veg != null ? '; zeleniny ' + NS.fmt.num(m.veg) : '';
    if (m.mode === 'collect') return zaklad + vytezek + ' – seber diamanty' + zelenina;
    if (m.mode === 'start') return zaklad + vytezek + ' – pusť ji do práce' + zelenina;
    if (m.mode === 'working') {
      return zaklad + vytezek + ' – pracuje, hotovo za '
        + (NS.fleet ? NS.fleet.etaText(m.eta) : m.eta + ' s') + zelenina;
    }
    return zaklad + ' – nic k akci' + zelenina;
  }

  function row(onChange) {
    /*
     * !!! ŘÁDEK SE NESMÍ ZAHODIT KVŮLI ŠACHTÁM !!!
     * Šachty se čtou požadavkem, takže při prvním kreslení (a při chybě) žádné
     * nejsou. Dřív se v tu chvíli vracelo `null` – a tím zmizela i mzda,
     * nevěstinec a zahrady, které na šachtách vůbec nezávisí (zahrady dokonce
     * čtou stav jen z DOM). Šachty se proto vynechají samy a řádek jede dál;
     * `null` se vrátí až když v něm není JEDINÉ tlačítko.
     */
    if (!state) load().then(l => { if (l && l.length) onChange(); }).catch(() => {});
    else if (Date.now() - stateAt >= STATE_TTL) load().then(() => onChange()).catch(() => {});

    const wrap = document.createElement('div');
    wrap.className = 'cmc-gym-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = state && state.length ? 'Šachty:' : 'Budovy:';
    label.title = state && state.length ? legend + soucet()
      : 'Šachty se ještě nenačetly (nebo je nemáš) – ostatní tlačítka na nich nezávisí.';
    wrap.appendChild(label);

    /*
     * Šachty i mzda jsou vlastní „skupina“ – CSS dává druhé a další skupině levý
     * rámeček, takže z toho vyjde svislítko bez dalšího prvku.
     */
    const grupa = document.createElement('span');
    grupa.className = 'cmc-gym-group';

    for (const m of (state || [])) {
      const akcni = m.mode === 'collect' || m.mode === 'start';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-gym-unit ' + (MODE_CLASS[m.mode] || MODE_CLASS.idle);
      // na tlačítku jen číslo – čas patří do tooltipu, ať řádek neposkakuje
      b.textContent = 'D' + m.n;
      b.title = titleFor(m);
      b.disabled = !akcni;

      if (akcni) {
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (b.disabled) return;
          b.disabled = true;
          NS.gym.setStatus('D' + m.n + ': ' + SLOVO[m.mode] + '…');
          try {
            const co = await NS.gym.withSuspend(() => act(m.n));
            await refreshOne(m.n);
            setTimeout(() => {
              onChange();
              NS.gym.setStatus('D' + m.n + ' ' + co.text);
            }, 300);
          } catch (e) {
            NS.gym.setStatus('⚠ D' + m.n + ': ' + e.message, true);
            b.disabled = false;
          }
        });
      }
      grupa.appendChild(b);
    }
    if (state && state.length) {
      grupa.appendChild(autoBox(onChange));
      wrap.appendChild(grupa);
    }

    /*
     * Další budovy se stejným cyklem „počkej a vyber“ – každá ve vlastní skupině,
     * takže je CSS oddělí svislítkem. Přidání další je jeden řádek do `PRIDAVKY`.
     */
    const PRIDAVKY = [
      { modul: () => NS.work, flag: 'workBar' },        // úřad práce #9 – mzda
      { modul: () => NS.brothel, flag: 'brothelBar' },  // nevěstinec #19
      { modul: () => NS.farm, flag: 'farmBar' }         // zahrady, sloty 35–54
      /*
       * Banka (#22) ani kámen-nůžky-papír (#17) tu nejsou schválně – oboje má
       * vlastní řádek, protože se tam PLATÍ, kdežto tady se sbírá hotové.
       */
    ];
    for (const p of PRIDAVKY) {
      const m = p.modul();
      if (!m || NS.store.get().read[p.flag] === false) continue;
      // modul dá jedno tlačítko (`button`), nebo víc (`buttons` – zahrady)
      const tlacitka = m.buttons ? m.buttons(onChange) : [m.button(onChange)];
      const platna = (tlacitka || []).filter(Boolean);
      if (!platna.length) continue;
      const g = document.createElement('span');
      g.className = 'cmc-gym-group';
      platna.forEach(t => g.appendChild(t));
      if (m.autoBox) g.appendChild(m.autoBox(onChange));
      wrap.appendChild(g);
    }
    // prázdný řádek nemá co dělat v liště – ale jen skutečně prázdný
    return wrap.querySelector('button, input') ? wrap : null;
  }

  /** Zaškrtávátko automatiky – jediná věc v řádku, která klikne bez tebe. */
  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává zapnutá. ' : '')
      + (zapnuto
        ? 'Automatika je ZAPNUTÁ: hotové šachty se samy seberou a nespuštěné se pustí'
          + ' do práce. Odškrtnutím to hned přestane.'
        : 'Zapne automatiku: hotové šachty se samy seberou a nespuštěné se pustí do'
          + ' práce. Klikne to BEZ tvého kliknutí – u šachet je to ale jen o tom'
          + ' nezapomenout, cyklus je pevný a nedá se tím nic prohrát.');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { mineAuto: cb.checked });
      onChange();
    });
    const txt = document.createElement('span');
    txt.textContent = zapnuto && pozastaveno ? 'auto ⏸' : 'auto';
    wrap.append(cb, txt);
    return wrap;
  }

  NS.mines = {
    row, load, act, refreshOne, mineState, discover, forget, remaining, cycleOf, rateText, soucet,
    autoRound, autoOn, autoSet,
    get state() { return state; }
  };
})();
