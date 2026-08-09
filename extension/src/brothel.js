/* =============================================================================
 * brothel.js – Nevěstinec (#19): tlačítko na výběr peněz
 *
 *   ŠACHTY: D30 D31 … ☑auto │ Mzda ☑auto │ Nevěstinec ☑auto
 *
 * Cyklus má TŘI stavy, které se střídají:
 *   1. doma      „Poslat prostitutky vydělávat“  → /brothel/startWork
 *   2. pracují   `.working` s odpočtem (5 hodin)
 *   3. hotovo    „Vybrat peníze“                 → /brothel/finishWork
 * Tlačítko udělá to, co je právě na řadě – stejně jako u šachet.
 *
 * (Původně jsem počítal jen se stavy 2 a 3, protože stav „čeká na poslání“ jsem
 * neviděl. V něm pak tlačítko jen svítilo vypnuté a automatika nedělala nic.)
 *
 * !!! TADY SE VYBÍRÁ HNED, NA ROZDÍL OD MZDY !!!
 * Hra varuje: „Peníze musí být vybrány co nejdříve, protože při zpoždění 10 min
 * se odečte 2 %.“ U mzdy se čeká na hranici hodiny, protože tam se čekáním nic
 * neztrácí – tady se ztrácí 2 % za každých 10 minut, takže se bere, jak to jde.
 *
 * Automatika proto nekontroluje na pevný interval, ale **naplánuje se na konec
 * cyklu**: z `.working` se přečte, kolik zbývá, a příští kontrola se posune přesně
 * tam. Když se stav přečíst nedá, zkusí to znovu za minutu.
 *
 * !!! STEJNÁ HRANICE JAKO U TRÉNINKU !!!
 * Klik vloží fragment budovy do herního okna a klikne na skutečné „Vybrat
 * peníze“; požadavek posílá hra.
 *
 * Ověřené akce a třídy:
 *   /map/building/brothel/startWork    .startBusiness  „Poslat prostitutky vydělávat“
 *   /map/building/brothel/finishWork   .collectMoney   „Vybrat peníze“
 *   /map/building/brothel/buyHookers   – nábor, do lišty NEPATŘÍ (stojí peníze)
 *   /map/building/brothel/sellHookers  – prodej, do lišty NEPATŘÍ
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const URL = '/map/building/show/19';
  const SEL_COLLECT = '.collectMoney, [action*="/brothel/finishWork"]';
  const SEL_START = '.startBusiness, [action*="/brothel/startWork"]';
  const TTL = 60 * 1000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let state = null;
  let stateAt = 0;
  let inflight = null;

  /* ---- stav --------------------------------------------------------------- */

  /** Zbývající sekundy z `.working` – stejná mechanika jako u šachet. */
  function remaining(d) {
    const w = d.querySelector('.working');
    if (!w) return 0;
    const zbytek = NS.parse.toNum(w.getAttribute('data-time'));
    if (zbytek != null) return zbytek;
    const done = NS.parse.toNum(w.getAttribute('data-timedone'));
    const now = NS.parse.toNum(w.getAttribute('data-timenow'));
    return done != null && now != null ? done - now : 0;
  }

  async function read() {
    const { status, raw } = await NS.parse.apiGet(URL);
    if (status !== 200) return null;
    const d = new DOMParser().parseFromString(raw, 'text/html');
    const t = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ');
    const eta = remaining(d);
    const btn = d.querySelector(SEL_COLLECT);
    const zacit = d.querySelector(SEL_START);

    /*
     * „Prostitutky :34 618“ – mezera před dvojtečkou, takže se hledá až za ní.
     * Počet krát průměr výdělku dá odhad výplaty; hra samotnou částku neuvádí.
     */
    const pocet = NS.parse.byRe(t, /Prostitutky\s*:\s*(\d[\d\s]*)/i);
    const od = NS.parse.byRe(t, /vydělá od\s*(\d[\d\s.,]*)\s*Kč/i);
    const do_ = NS.parse.byRe(t, /vydělá od\s*[\d\s.,]*\s*Kč\s*do\s*(\d[\d\s.,]*)\s*Kč/i);

    /*
     * Ve stavu „doma“ hra rozsah výplaty uvádí přímo („Vyděláš od 191 210Kč do
     * 382 420Kč“) – to je lepší než odhad z počtu, tak se použije, když je.
     */
    const vyplataOd = NS.parse.byRe(t, /Vyděláš od\s*(\d[\d\s.,]*)\s*Kč/i);
    const vyplataDo = NS.parse.byRe(t, /Vyděláš od\s*[\d\s.,]*\s*Kč\s*do\s*(\d[\d\s.,]*)\s*Kč/i);

    let mode = 'idle';
    if (eta > 0) mode = 'working';
    else if (btn) mode = 'collect';
    else if (zacit) mode = 'start';

    return {
      mode,
      collect: mode === 'collect',
      eta,
      count: pocet,
      perOne: od != null && do_ != null ? [od, do_] : null,
      payout: vyplataOd != null && vyplataDo != null ? [vyplataOd, vyplataDo] : null,
      estimate: vyplataOd != null && vyplataDo != null
        ? (vyplataOd + vyplataDo) / 2
        : (pocet != null && od != null && do_ != null ? pocet * (od + do_) / 2 : null),
      free: NS.parse.byRe(t, /Ještě se vejde:\s*(\d[\d\s]*)/i),
      level: NS.parse.byRe(t, /Úroveň\s*:\s*(\d+)/i),
      // „při zpoždění 10 min se odečte 2%“ – proto se vybírá hned
      penalty: (t.match(/zpoždění\s*(\d+)\s*min\s*se odečte\s*(\d+)\s*%/i) || []).slice(1, 3).join('/') || null
    };
  }

  function load(force) {
    if (!force && state && Date.now() - stateAt < TTL) return Promise.resolve(state);
    if (inflight) return inflight;
    inflight = read().then(s => {
      if (s) { state = s; stateAt = Date.now(); }
      return state;
    }).finally(() => { inflight = null; });
    return inflight;
  }

  /* ---- akce --------------------------------------------------------------- */

  async function act() {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const { status, raw } = await NS.parse.apiGet(URL);
    if (status !== 200) throw new Error('nevěstinec nelze přečíst (HTTP ' + status + ')');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(150);
      // stav se ověřuje z ČERSTVÉHO fragmentu – v liště mohl zestárnout
      if (remaining(box) > 0) throw new Error('práce ještě neskončila');

      const btn = box.querySelector(SEL_COLLECT);
      if (btn) {
        /*
         * Nevěstinec platí ŠPINAVÝMI penězi (ověřeno z ikony v okně) a přesnou
         * částku hra předem neuvádí – jen rozsah. Změří se tedy z HUD; odhad
         * z okna se ukládá jen do popisu, ať je s čím srovnat.
         */
        const pred = NS.prijmy ? NS.prijmy.snap() : null;
        const odhad = state && state.estimate != null ? state.estimate : null;

        btn.click();
        await sleep(300);

        if (NS.prijmy && pred) {
          const zmena = await NS.prijmy.zmer(pred);
          await NS.prijmy.zapis('brothel', zmena, {
            popis: odhad != null ? 'odhad ' + NS.fmt.kc(odhad, { short: true }) : null
          });
        }
        return 'collect';
      }
      const zacit = box.querySelector(SEL_START);
      if (!zacit) throw new Error('nevěstinec teď nic nenabízí');
      zacit.click();
      await sleep(300);
      return 'start';
    } finally {
      box.remove();
    }
  }

  /* ---- automatika --------------------------------------------------------- */

  let autoBusy = false;
  let dueAt = 0;           // kdy má smysl zkusit to znovu

  const autoSet = () => NS.store.get().read.brothelAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  /**
   * Naplánuje se na konec cyklu, ne na pevný interval: 2 % za 10 minut zpoždění
   * je dost na to, aby se to nekontrolovalo „někdy“. Když se stav nedá přečíst,
   * zkusí to za minutu.
   */
  async function autoTick() {
    if (autoBusy || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;
    if (Date.now() < dueAt) return false;

    autoBusy = true;
    try {
      const s = await read();
      if (!s) { dueAt = Date.now() + 60 * 1000; return false; }
      state = s;
      stateAt = Date.now();

      if (s.mode === 'working') {
        // +3 s, ať se nečeká na hranu
        dueAt = Date.now() + s.eta * 1000 + 3000;
        return false;
      }
      if (s.mode !== 'collect' && s.mode !== 'start') {
        dueAt = Date.now() + 60 * 1000;
        return false;
      }

      /*
       * Sebrat a hned poslat zpátky do práce – dvě akce v jednom kole, jinak by
       * nevěstinec po sběru stál celé kolo nečinně (a přesně tohle se stalo, když
       * modul stav „doma“ neznal).
       */
      const udelano = [];
      for (let i = 0; i < 2; i++) {
        if (!autoOn()) break;
        try {
          udelano.push(await NS.gym.withSuspend(() => act()));
        } catch (e) {
          if (!udelano.length) throw e;
          break;                       // druhá akce nemusí být na řadě
        }
        await sleep(600);
        const po = await read();
        if (po) { state = po; stateAt = Date.now(); }
        /*
         * Nikdy dvakrát TU SAMOU akci: hra může chvíli po sběru pořád hlásit
         * „Vybrat peníze“ (než požadavek zpracuje) a bez téhle podmínky by se
         * na výběr kliklo dvakrát. Střídat se smí jen sebrat → poslat.
         */
        if (!po || po.mode !== 'collect' && po.mode !== 'start') break;
        if (po.mode === udelano[udelano.length - 1]) break;
      }

      dueAt = Date.now() + ((state && state.eta > 0) ? state.eta * 1000 + 3000 : 60 * 1000);
      const slova = { collect: 'vybráno', start: 'posláno do práce' };
      NS.gym.setStatus('auto nevěstinec: ' + udelano.map(x => slova[x] || x).join(' + ')
        + (s.estimate != null && udelano.includes('collect')
          ? ' ~' + NS.fmt.kc(s.estimate, { short: true }) : ''));
      const zprava = NS.gym.statusText();
      NS.gym.collect();
      if (zprava) NS.gym.setStatus(zprava);
      return true;
    } catch (e) {
      dueAt = Date.now() + 60 * 1000;
      NS.gym.setStatus('⚠ auto nevěstinec: ' + e.message, true);
      return false;
    } finally {
      autoBusy = false;
    }
  }

  /* ---- tlačítko a zaškrtávátko -------------------------------------------- */

  function popis(s) {
    const casti = [];
    if (s.count != null) {
      casti.push(NS.fmt.num(s.count) + ' prostitutek'
        + (s.perOne ? ' × ' + NS.fmt.kc(s.perOne[0]) + '–' + NS.fmt.kc(s.perOne[1]) : ''));
    }
    if (s.payout) {
      casti.push('vyděláš ' + NS.fmt.kc(s.payout[0], { short: true })
        + '–' + NS.fmt.kc(s.payout[1], { short: true }));
    } else if (s.estimate != null) {
      casti.push('odhad ' + NS.fmt.kc(s.estimate, { short: true }));
    }
    if (s.free != null) casti.push('vejde se ještě ' + NS.fmt.num(s.free));
    return casti.join(', ');
  }

  function button(onChange) {
    if (!state) {
      load().then(s => { if (s) onChange(); }).catch(() => {});
      return null;
    }
    if (Date.now() - stateAt >= TTL) load().then(() => onChange()).catch(() => {});

    const TRIDA = {
      collect: 'cmc-gym-unit-ready',   // zeleně: peníze čekají
      start: 'cmc-gym-unit-send',      // vínově: dá se poslat do práce
      working: 'cmc-gym-unit-away',
      idle: 'cmc-gym-unit-away'
    };
    const akcni = state.mode === 'collect' || state.mode === 'start';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-btn cmc-gym-unit ' + (TRIDA[state.mode] || TRIDA.idle);
    b.textContent = 'Nevěstinec';
    b.disabled = !akcni;
    b.title = (state.mode === 'collect'
      ? 'Vyber peníze – ' + popis(state)
      : state.mode === 'start'
        ? 'Pošli prostitutky vydělávat – ' + popis(state)
        : 'Práce ještě neskončila'
          + (state.eta > 0 ? ', hotovo za ' + (NS.fleet ? NS.fleet.etaText(state.eta) : state.eta + ' s') : '')
          + (popis(state) ? ' (' + popis(state) + ')' : ''))
      + (state.penalty
        ? '. Pozor: při zpoždění ' + state.penalty.split('/')[0] + ' min se odečte '
          + state.penalty.split('/')[1] + ' %, takže se vybírá hned.'
        : '')
      + ' Nábor a prodej prostitutek v liště schválně nejsou – stojí peníze.';

    if (akcni) {
      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        const odhad = state.estimate;
        NS.gym.setStatus('nevěstinec: ' + (state.mode === 'collect' ? 'vybírám…' : 'posílám…'));
        try {
          const co = await NS.gym.withSuspend(() => act());
          await load(true);
          setTimeout(() => {
            onChange();
            NS.gym.setStatus('nevěstinec: ' + (co === 'collect'
              ? 'vybráno' + (odhad != null ? ' ~' + NS.fmt.kc(odhad, { short: true }) : '')
              : 'posláno do práce'));
          }, 300);
        } catch (e) {
          NS.gym.setStatus('⚠ nevěstinec: ' + e.message, true);
          b.disabled = false;
        }
      });
    }
    return b;
  }

  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává zapnutá. ' : '')
      + 'Automatický výběr peněz a poslání zpátky do práce (obojí v jednom kole).'
      + ' Vybírá HNED, jak to jde – hra při zpoždění'
      + ' 10 minut odečítá 2 %, takže tady se na nic nečeká (na rozdíl od mzdy,'
      + ' kde se čeká na hranici hodiny). Kontrola se plánuje na konec cyklu,'
      + ' ne na pevný interval.'
      + (state && state.eta > 0 && NS.fleet
        ? ' Teď hotovo za ' + NS.fleet.etaText(state.eta) + '.' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { brothelAuto: cb.checked });
      dueAt = 0;
      onChange();
    });
    const txt = document.createElement('span');
    txt.textContent = zapnuto && pozastaveno ? 'auto ⏸' : 'auto';
    wrap.append(cb, txt);
    return wrap;
  }

  NS.brothel = {
    button, autoBox, load, act, read, remaining, autoTick, autoSet, autoOn,
    get state() { return state; },
    resetTimer() { dueAt = 0; }
  };
})();
