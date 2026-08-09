/* =============================================================================
 * work.js – Úřad práce (#9): tlačítko na výběr mzdy
 *
 *   ŠACHTY: D30 D31 D32 D33 D34 ☑auto │ Mzda
 *
 * V úřadu práce běží zaměstnání a mzda se v něm hromadí, dokud si ji nevybereš.
 * Roste průběžně (u mě +26 Kč za minutu), takže se nedá „propásnout“ jako sběr
 * z lodí – ale zapomenout se na ni dá snadno, protože nic nebliká.
 *
 * !!! STEJNÁ HRANICE JAKO U TRÉNINKU !!!
 * Klik vloží fragment budovy do herního okna a klikne na skutečné „Vybrat mzdu“;
 * požadavek posílá hra. Jeden tvůj klik = jedna akce.
 *
 * Ověřené akce a třídy:
 *   /map/building/mafiahouse/collectSalary  .getSalary  „Vybrat mzdu“
 *   /map/building/mafiahouse/joinWork/{n}   .getWork    „Odeslat životopis“
 *
 * Do lišty jde JEN výběr mzdy. Přihlášení na jinou pozici (`joinWork`) je
 * rozhodnutí, ne rutina – měnilo by ti to práci jedním kliknutím omylem.
 *
 * !!! CO JEŠTĚ NEVÍM !!!
 * Podobu úřadu PO výběru mzdy jsem neviděl – neznám tedy, jestli zaměstnání
 * pokračuje samo, nebo se musí znovu přihlásit. Proto se stav určuje jen podle
 * přítomnosti `.getSalary`: když tam není, tlačítko je vypnuté a v tooltipu je
 * napsáno, že tenhle stav ještě nemám ověřený.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const URL = '/map/building/show/9';
  const SEL_SALARY = '.getSalary, [action*="/mafiahouse/collectSalary"]';
  const TTL = 60 * 1000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let state = null;
  let stateAt = 0;
  let inflight = null;

  /* ---- stav --------------------------------------------------------------- */

  /**
   * Jak dlouho se pracuje, v HODINÁCH.
   *
   * !!! JEDNOTKA SE MUSÍ ČÍST !!!
   * Hra píše „Pracuješ už 15 minut“, ale taky „už 3 hodiny“ – a dřív se bralo
   * jen to číslo, takže z „120 minut“ vyšlo 120 hodin. Sazba Kč/h pak byla
   * nesmysl a podmínka na minimální počet hodin v automatice se nikdy
   * neuplatnila (120 není menší než 1).
   */
  function hodinPrace(t) {
    const m = String(t || '').match(/Pracuješ už\s*(\d+)\s*(minut\S*|hodin\S*|den|dn\S*)/i);
    if (!m) return null;
    const n = +m[1];
    const j = m[2].toLowerCase();
    if (j.startsWith('minut')) return n / 60;
    if (j.startsWith('hodin')) return n;
    if (j.startsWith('d')) return n * 24;      // „den“, „dny“, „dní“
    return n;
  }

  async function read() {
    const { status, raw } = await NS.parse.apiGet(URL);
    if (status !== 200) return null;
    const d = new DOMParser().parseFromString(raw, 'text/html');
    const t = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ');
    const btn = d.querySelector(SEL_SALARY);
    const okoli = btn ? (btn.closest('.box-ins, .static-inv, div') || d.body) : d.body;
    const ot = okoli.textContent.replace(/\s+/g, ' ');

    return {
      salary: !!btn,
      job: (t.match(/pracuješ jako\s+([^.]{1,40}?)\s+Pracuješ/i) || [])[1] || null,
      hours: (t.match(/Pracuješ už\s+([^U]{1,20}?)\s*(?:Už|$)/i) || [])[1] || null,
      // „Už jsi vydělal 12 613Kč + 18“ – koruny a k tomu diamanty
      money: NS.parse.byRe(ot, /vydělal\s*(\d[\d\s .,]*)\s*Kč/i),
      gems: NS.parse.byRe(ot, /Kč\s*\+\s*(\d[\d\s]*)/i),
      /*
       * Hodiny se z textu berou jen jako číslo („3 hodiny“), takže sazba je
       * PŘIBLIŽNÁ – hra ji nikde neuvádí a údaj je zaokrouhlený na celé hodiny.
       */
      hoursNum: hodinPrace(t)
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
    if (status !== 200) throw new Error('úřad práce nelze přečíst (HTTP ' + status + ')');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(150);
      const btn = box.querySelector(SEL_SALARY);
      if (!btn) throw new Error('mzda teď není k výběru');

      // částka se čte z ČERSTVÉHO fragmentu – průběžně roste
      const ot = (btn.closest('.box-ins, .static-inv, div') || box).textContent.replace(/\s+/g, ' ');
      const money = NS.parse.byRe(ot, /vydělal\s*(\d[\d\s .,]*)\s*Kč/i);
      const gems = NS.parse.byRe(ot, /Kč\s*\+\s*(\d[\d\s]*)/i);

      /*
       * Evidence příjmu: HUD se snímá PŘED klikem, ať se dá spočítat, co
       * doopravdy přišlo. Částka z okna („vydělal 882.40Kč + 0“) slouží jako
       * záloha, když se HUD nepohne – viz prijmy.js.
       */
      const hodin = state && state.hoursNum != null ? state.hoursNum : null;
      const pred = NS.prijmy ? NS.prijmy.snap() : null;

      btn.click();
      await sleep(300);

      if (NS.prijmy && pred) {
        const zmena = await NS.prijmy.zmer(pred);
        await NS.prijmy.zapis('work', zmena, {
          ocekavaneKc: money, ocekavaneGems: gems, hodin,
          popis: state && state.job ? state.job : null
        });
      }
      return { money, gems };
    } finally {
      box.remove();
    }
  }

  /* ---- tlačítko do řádku --------------------------------------------------- */

  /**
   * Přibližná sazba. Hra ji neuvádí, počítá se z nasbírané částky a hodin – a ty
   * jsou v textu zaokrouhlené na celé, takže je to odhad, ne přesné číslo.
   * Diamanty navíc podle mého sledování nerostou plynule jako koruny.
   */
  function sazba(s) {
    if (!(s.hoursNum > 0)) return '';
    const kc = s.money != null ? NS.fmt.kc(s.money / s.hoursNum) + '/h' : null;
    const dia = s.gems != null ? NS.fmt.num(s.gems / s.hoursNum) + ' 💎/h' : null;
    const casti = [kc, dia].filter(Boolean);
    return casti.length ? ' – přibližně ' + casti.join(' + ') : '';
  }

  /**
   * Jedno tlačítko „Mzda“. Vrací null, dokud se stav nepřečetl – načte se na
   * pozadí a lišta se pak překreslí (stejně jako u letadel).
   */
  function button(onChange) {
    if (!state) {
      load().then(s => { if (s) onChange(); }).catch(() => {});
      return null;
    }
    if (Date.now() - stateAt >= TTL) load().then(() => onChange()).catch(() => {});

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-btn cmc-gym-unit '
      + (state.salary ? 'cmc-gym-unit-ready' : 'cmc-gym-unit-away');
    b.textContent = 'Mzda';
    b.disabled = !state.salary;
    b.title = state.salary
      ? (state.job ? state.job + ' – ' : '')
        + 'vyber mzdu'
        + (state.money != null ? ' ' + NS.fmt.kc(state.money) : '')
        + (state.gems != null ? ' + ' + NS.fmt.gems(state.gems) : '')
        + (state.hours ? ' (pracuješ ' + state.hours.trim() + ')' : '')
        + sazba(state)
        + '. Mzda průběžně roste, takže se nedá propásnout – jen zapomenout.'
      : 'Mzda teď není k výběru. Tenhle stav ještě nemám ověřený – nevím, jestli'
        + ' zaměstnání pokračuje samo, nebo se musí znovu přihlásit. Přihlašování'
        + ' na pozice v liště schválně není, to je rozhodnutí, ne rutina.';

    if (state.salary) {
      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        NS.gym.setStatus('mzda: vybírám…');
        try {
          const r = await NS.gym.withSuspend(() => act());
          await load(true);
          setTimeout(() => {
            onChange();
            NS.gym.setStatus('mzda vybrána'
              + (r.money != null ? ' ' + NS.fmt.kc(r.money) : '')
              + (r.gems != null ? ' + ' + NS.fmt.gems(r.gems) : ''));
          }, 300);
        } catch (e) {
          NS.gym.setStatus('⚠ mzda: ' + e.message, true);
          b.disabled = false;
        }
      });
    }
    return b;
  }

  /* ---- automatický výběr (volitelný, výchozí vypnuto) ---------------------- */

  /*
   * !!! KLIKÁ BEZ TVÉHO KLIKNUTÍ !!!
   *
   * S časem se tu dá pracovat lépe než „vybírej každých 10 minut“. Z pozorování:
   *   • koruny přitékají PLYNULE (12 587 → 12 613 → 13 201 během 25 minut)
   *   • diamanty se drží na stejném čísle a 18 💎 při 3 hodinách je přesně 6/h
   * Z toho vychází, že diamanty se přičítají po CELÝCH hodinách. A pokud ano, tak
   * výběr uprostřed hodiny zahodí rozdělanou část: v 59. minutě přijdeš o 5,9 💎,
   * těsně po hranici o nic.
   *
   * Proto se nevybírá „po hodině“, ale AŽ SE POČET DIAMANTŮ ZVEDNE – to je přímé
   * pozorování hranice hodiny, bez počítání s časem, který hra uvádí zaokrouhlený
   * na celé hodiny. Interval kontroly pak určuje jen to, o kolik se hranice mine:
   * každé 2 minuty ≈ 0,1 💎, každých 10 minut ≈ 0,5 💎.
   *
   * Kdyby zaměstnání diamanty nedávalo, hranice se poznat nedá – pak se vybere
   * jednoduše po dosažení minimálního počtu hodin.
   */
  const TICK_DEFAULT = 120;      // sekund mezi kontrolami
  let autoBusy = false;
  let lastCheck = 0;
  let baseline = null;           // naposledy viděný počet diamantů a hodin

  const autoSet = () => NS.store.get().read.workAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  async function autoTick() {
    if (autoBusy || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;

    const cfg = NS.store.get().read;
    const kazdych = Math.max(30, Math.round(+cfg.workAutoEverySec || TICK_DEFAULT)) * 1000;
    if (Date.now() - lastCheck < kazdych) return false;

    autoBusy = true;
    try {
      lastCheck = Date.now();
      const s = await read();
      if (!s) return false;
      state = s;
      stateAt = Date.now();

      const minHodin = Math.max(0, Math.round(+cfg.workAutoMinHours ?? 1));
      if (!s.salary) return false;
      if (s.hoursNum != null && s.hoursNum < minHodin) return false;

      /*
       * Hranice hodiny = diamanty se zvedly proti minulé kontrole. Bez předchozí
       * hodnoty se jen zapamatuje a čeká se na příští zvednutí – vybrat hned by
       * znamenalo zahodit rozdělanou hodinu.
       */
      let duvod = null;
      if (s.gems == null) {
        duvod = 'zaměstnání nedává diamanty, beru po ' + minHodin + ' h';
      } else if (baseline == null) {
        baseline = { gems: s.gems, hours: s.hoursNum };
        NS.gym.setStatus('auto mzda: čekám na přeskočení hodiny (teď '
          + NS.fmt.gems(s.gems) + ')');
        return false;
      } else if (s.gems > baseline.gems) {
        duvod = 'hodina přeskočila (' + NS.fmt.gems(baseline.gems) + ' → ' + NS.fmt.gems(s.gems) + ')';
      } else {
        return false;
      }

      const r = await NS.gym.withSuspend(() => act());
      baseline = null;                     // po výběru začíná nová série hodin
      await load(true);
      NS.gym.setStatus('auto mzda vybrána'
        + (r.money != null ? ' ' + NS.fmt.kc(r.money) : '')
        + (r.gems != null ? ' + ' + NS.fmt.gems(r.gems) : '')
        + ' – ' + duvod);
      const zprava = NS.gym.statusText();
      NS.gym.collect();
      if (zprava) NS.gym.setStatus(zprava);
      return true;
    } catch (e) {
      NS.gym.setStatus('⚠ auto mzda: ' + e.message, true);
      return false;
    } finally {
      autoBusy = false;
    }
  }

  /** Zaškrtávátko automatiky vedle tlačítka Mzda. */
  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const cfg = NS.store.get().read;
    const kazdych = Math.max(30, Math.round(+cfg.workAutoEverySec || TICK_DEFAULT));
    const minHodin = Math.max(0, Math.round(+cfg.workAutoMinHours ?? 1));

    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává zapnutá. ' : '')
      + 'Automatický výběr mzdy. Nevybírá „po hodině“, ale až se ZVEDNE POČET'
      + ' DIAMANTŮ – to je hranice hodiny, a výběr uprostřed hodiny by rozdělanou'
      + ' část zahodil (v 59. minutě je to 5,9 💎). Kontroluje každých '
      + kazdych + ' s, nejdřív po ' + minHodin + ' h.'
      + (baseline ? ' Naposledy viděno ' + NS.fmt.gems(baseline.gems) + ', čekám na zvednutí.' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { workAuto: cb.checked });
      baseline = null;
      onChange();
    });
    const txt = document.createElement('span');
    txt.textContent = zapnuto && pozastaveno ? 'auto ⏸' : 'auto';
    wrap.append(cb, txt);
    return wrap;
  }

  NS.work = {
    button, autoBox, load, act, read, autoTick, autoSet, autoOn,
    get state() { return state; },
    get baseline() { return baseline; },
    resetBaseline() { baseline = null; lastCheck = 0; },
    /** Jen vynulování časovače kontrol – základ zůstává (používá to test). */
    resetTimer() { lastCheck = 0; }
  };
})();
