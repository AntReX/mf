/* =============================================================================
 * prijmy.js – kolik doopravdy přinesla mzda (#9) a nevěstinec (#19)
 *
 * Hra nikde nesčítá, co ti která budova vydělala: v okně je vždycky jen to, co
 * čeká teď, a jak to vybereš, zmizí. Tady se každý výběr zapíše.
 *
 * !!! MĚŘÍ SE VŠECHNY TŘI MĚNY, NEHÁDÁ SE !!!
 * Ověřeno z ikon v oknech budov:
 *   mzda #9        → čisté peníze (`icon-currency-money`) + diamanty
 *   nevěstinec #19 → špinavé peníze (`icon-currency-money-dirty`)
 * Přesto se snímá HUD celý (čisté, špinavé, diamanty) a zapíše se to, co se
 * skutečně změnilo. Kdyby hra jednou vyplatila jinak, evidence to ukáže,
 * místo aby to zahodila do špatné kolonky.
 *
 * !!! HUD SE NEMĚNÍ HNED !!!
 * Hra si čísla přepisuje animací a `user/minute-refresh` chodí po minutách,
 * takže se po kliknutí čeká, dokud se hodnota nepohne (max několik sekund).
 * Když se nepohne vůbec, zapíše se to jako neurčité – u mzdy se navíc doplní
 * částka z okna („Už jsi vydělal 882.40Kč + 0“), kterou hra uvádí předem.
 *
 * !!! CIZÍ PŘÍJMY DO TOHO MOHOU SPADNOUT !!!
 * HUD je společný, takže kdyby ve stejnou chvíli přiteklo něco odjinud,
 * připsalo by se to sem. Automatika je ale sériová (queue.js), takže v momentě
 * výběru nic jiného neběží; u ručního kliknutí se to stát může a je to cena za
 * to, že hra jinou možnost nedává.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /** Zdroje, které se evidují. Přidání dalšího je jeden řádek. */
  const ZDROJE = {
    work: { label: 'Mzda (#9)', meny: ['kc', 'gems'] },
    brothel: { label: 'Nevěstinec (#19)', meny: ['dirty'] }
  };

  const SEL = {
    kc: '.value.renew-money',
    dirty: '.value.renew-dirty_money',
    gems: '.value.renew-points'
  };

  const RECENT_MAX = 100;
  const PRAZDNY_ZDROJ = {
    n: 0, kc: 0, dirty: 0, gems: 0, hodin: 0, neurcite: 0,
    firstAt: null, lastAt: null, recent: []
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- měření ------------------------------------------------------------- */

  const cti = sel => {
    const el = document.querySelector(sel);
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /** Snímek HUD: čisté, špinavé, diamanty. */
  function snap() {
    return { kc: cti(SEL.kc), dirty: cti(SEL.dirty), gems: cti(SEL.gems) };
  }

  /** Rozdíl dvou snímků; `null` u složky, kterou nešlo přečíst. */
  function rozdil(pred, po) {
    const d = {};
    for (const k of ['kc', 'dirty', 'gems']) {
      d[k] = (pred && po && pred[k] != null && po[k] != null) ? po[k] - pred[k] : null;
    }
    return d;
  }

  const nenulovy = d => ['kc', 'dirty', 'gems'].some(k => d[k]);

  /**
   * Počká, až se HUD pohne, a vrátí rozdíl. Bez čekání by se naměřily nuly,
   * protože hra přepisuje čísla se zpožděním.
   */
  async function zmer(pred, ms = 5000, krok = 250) {
    const konec = Date.now() + ms;
    let posledni = rozdil(pred, snap());
    while (Date.now() < konec) {
      await sleep(krok);
      const d = rozdil(pred, snap());
      if (nenulovy(d)) {
        /*
         * Ještě chvíli počkat, ať se dopočítá i druhá měna (mzda platí penězi
         * i diamanty a nepřijdou nutně v jednom kroku).
         */
        await sleep(600);
        return rozdil(pred, snap());
      }
      posledni = d;
    }
    return posledni;
  }

  /* ---- zápis -------------------------------------------------------------- */

  /**
   * Zapíše jeden výběr. `ocekavano` je to, co hra uvedla v okně (u mzdy), použije
   * se, když HUD mlčí.
   */
  async function zapis(zdroj, zmena, extra) {
    if (!ZDROJE[zdroj]) return null;
    const cur = NS.store.get().prijmyLog || {};
    const s = { ...PRAZDNY_ZDROJ, ...(cur[zdroj] || {}) };
    const e = extra || {};

    let kc = zmena && zmena.kc > 0 ? zmena.kc : 0;
    let dirty = zmena && zmena.dirty > 0 ? zmena.dirty : 0;
    let gems = zmena && zmena.gems > 0 ? zmena.gems : 0;
    let neurcity = false;

    if (!kc && !dirty && !gems) {
      /*
       * HUD se nepohnul. U mzdy to okno říká předem, takže se vezme odtud;
       * jinak se přizná, že se to nezměřilo – nula by lhala.
       */
      if (e.ocekavaneKc || e.ocekavaneGems) {
        kc = Math.max(0, Math.round(e.ocekavaneKc || 0));
        gems = Math.max(0, Math.round(e.ocekavaneGems || 0));
        neurcity = true;
      } else {
        neurcity = true;
      }
    }

    const zapisek = {
      at: Date.now(), kc, dirty, gems,
      hodin: e.hodin != null ? e.hodin : null,
      popis: e.popis || null,
      zdrojCisla: neurcity ? (kc || gems ? 'z okna hry' : 'nezměřeno') : 'HUD',
      neurcity
    };

    await NS.store.put('prijmyLog', {
      ...cur,
      [zdroj]: {
        n: s.n + 1,
        kc: s.kc + kc,
        dirty: s.dirty + dirty,
        gems: s.gems + gems,
        hodin: s.hodin + (e.hodin || 0),
        neurcite: s.neurcite + (neurcity ? 1 : 0),
        firstAt: s.firstAt || Date.now(),
        lastAt: Date.now(),
        recent: [zapisek, ...(s.recent || [])].slice(0, RECENT_MAX)
      }
    });
    return zapisek;
  }

  /**
   * Změří a zapíše v jednom: sejme HUD, zavolá akci, dopočítá rozdíl.
   * Používají to work.js a brothel.js, aby měření nebylo na dvou místech.
   */
  async function zmerAZapis(zdroj, akce, extra) {
    const pred = snap();
    const vysledek = await akce();
    const zmena = await zmer(pred);
    const zapisek = await zapis(zdroj, zmena, extra);
    return { vysledek, zmena, zapisek };
  }

  /* ---- souhrn ------------------------------------------------------------- */

  function stats() {
    const cur = NS.store.get().prijmyLog || {};
    const out = { zdroje: {}, celkem: { kc: 0, dirty: 0, gems: 0, n: 0 } };
    for (const [k, def] of Object.entries(ZDROJE)) {
      const s = { ...PRAZDNY_ZDROJ, ...(cur[k] || {}) };
      const perVyber = n => (s.n > 0 ? n / s.n : null);
      out.zdroje[k] = {
        ...s, label: def.label, meny: def.meny,
        kcNaVyber: perVyber(s.kc), dirtyNaVyber: perVyber(s.dirty), gemsNaVyber: perVyber(s.gems),
        // u mzdy je zajímavější Kč za hodinu práce než na výběr
        kcNaHodinu: s.hodin > 0 ? s.kc / s.hodin : null,
        gemsNaHodinu: s.hodin > 0 ? s.gems / s.hodin : null
      };
      out.celkem.kc += s.kc;
      out.celkem.dirty += s.dirty;
      out.celkem.gems += s.gems;
      out.celkem.n += s.n;
    }
    return out;
  }

  const reset = () => NS.store.put('prijmyLog', {});

  NS.prijmy = { snap, rozdil, zmer, zapis, zmerAZapis, stats, reset, ZDROJE, PRAZDNY_ZDROJ };
})();
