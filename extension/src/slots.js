/* =============================================================================
 * slots.js – Automaty (budova #18, záložka „Peníze“)
 *
 * Jiná hra než kuličky v kasinu #15, i když se ovládá stejným selectem „auto“.
 * Ověřeno naživo osmi zatočeními za 10 Kč:
 *
 *   POST /map/building/casino/slotsMoney   tělo `amount=10`   → {"win":false}
 *
 * !!! VÝPLATA NENÍ BINÁRNÍ !!!
 * U kuliček je to buď 3× sázka, nebo nic. Tady hra vyplácí LIBOVOLNOU část:
 * z osmi zatočení za 10 Kč přišlo „Vyhrál jsi 4“ a „Vyhrál jsi 5“ – tedy výhry
 * MENŠÍ než sázka. `input[name="price"]` má hodnotu 6, což je maximální
 * násobek („Maximální výhra“ v okně), ne výplata.
 *
 * Proto tady NENÍ navyšování po prohře: martingale stojí na tom, že jedna výhra
 * pokryje všechny předchozí sázky, a to u částečných výplat neplatí. Sází se
 * vždy základní částka.
 *
 * !!! JAK SE POZNÁ VÝSLEDEK !!!
 * Rozšíření je v izolovaném světě, takže odpověď hry (`{"win":…}`) přečíst nejde.
 * Hra ale píše výhru do `.won-text` – a dělá to i ve fragmentu vloženém mimo
 * obrazovku, což je ověřené. Prázdný `.won-text` = prohra. Jako druhá kontrola
 * se bere rozdíl špinavých peněz z HUD; když si obojí odporuje, věří se HUD,
 * protože ten mluví o skutečném stavu konta.
 *
 * Celá pointa modulu je MĚŘENÍ: kolik se vložilo, kolik se vrátilo, jaká je
 * návratnost. Tabulka je v panelu v záložce „Automat“.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/18';
  const SEL_SPIN = '.js-spin, [action*="/casino/slotsMoney"]';
  const SEL_AMOUNT = '.casino-spin input[name="amount"]';
  const SEL_WON = '.casino-spin .won-text';

  /** Hodnota `input[name="price"]` – „Maximální výhra“ je tenhle násobek sázky. */
  const MAX_NASOBEK = 6;

  const WAIT_RESULT = 8000;      // animace válců
  const POLL = 200;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const PRAZDNY = {
    spins: 0, wins: 0, staked: 0, won: 0,
    best: 0, bestStake: 0, lossRun: 0, maxLossRun: 0,
    firstAt: null, lastAt: null, recent: []
  };
  const RECENT_MAX = 50;

  /* ---- jedno zatočení ------------------------------------------------------ */

  /**
   * Zatočí jednou. Fragment se vloží do herního okna a klikne se na skutečné
   * „Točit“ – požadavek posílá hra, stejně jako u všeho ostatního v liště.
   */
  async function spin(amount) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');
    if (!(amount > 0)) throw new Error('sázka musí být větší než nula');

    const { status, raw } = await NS.parse.apiGetTry(BUILDING);
    /* výpadek se zkusí znovu – jedno 404 nesmí vypnout automatiku, viz apiGetTry */
    if (status !== 200) throw new Error('automaty nelze přečíst (HTTP ' + status + ', opakováno)');
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const dirtyPred = NS.casino ? NS.casino.readDirty() : null;

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-slots-box';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(250);        // ať se poskládá layout, animace čte rozměry

      const pole = box.querySelector(SEL_AMOUNT);
      const tlacitko = box.querySelector(SEL_SPIN);
      if (!pole || !tlacitko) throw new Error('automat má jinou podobu, než čekám');

      pole.value = String(Math.round(amount));
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(120);

      tlacitko.click();

      /*
       * Výsledek se objeví až po animaci. Prázdný `.won-text` po celou dobu
       * čekání znamená prohru – hra při ní nic nenapíše.
       */
      const konec = Date.now() + WAIT_RESULT;
      let vyhra = 0;
      while (Date.now() < konec) {
        await sleep(POLL);
        const t = (box.querySelector(SEL_WON) || {}).textContent || '';
        const n = NS.parse.byRe(t.replace(/\s+/g, ' '), /Vyhrál jsi\s*(\d[\d\s.,]*)/i);
        if (n != null) { vyhra = n; break; }
      }

      /*
       * Kontrola proti HUD: `.won-text` je text hry, kdežto rozdíl špinavých
       * peněz je skutečnost. Když se rozejdou, platí HUD – měření by jinak
       * lhalo právě v tom, co má měřit.
       */
      const dirtyPo = NS.casino ? NS.casino.readDirty() : null;
      let podleHud = null;
      if (dirtyPred != null && dirtyPo != null && dirtyPo !== dirtyPred) {
        podleHud = Math.max(0, (dirtyPo - dirtyPred) + Math.round(amount));
      }

      return {
        amount: Math.round(amount),
        won: podleHud != null ? podleHud : vyhra,
        wonText: vyhra,
        wonHud: podleHud,
        rozpor: podleHud != null && podleHud !== vyhra
      };
    } finally {
      box.remove();
    }
  }

  /* ---- záznam ------------------------------------------------------------- */

  const now = () => Date.now();

  async function log(r) {
    const cur = { ...PRAZDNY, ...(NS.store.get().slotsLog || {}) };
    const vyhral = r.won > 0;
    const bezVyhry = vyhral ? 0 : (cur.lossRun || 0) + 1;

    const zapis = {
      at: now(),
      amount: r.amount,
      won: r.won,
      // rozpor mezi textem hry a HUD se schovávat nemá – je to varování o měření
      rozpor: r.rozpor ? { text: r.wonText, hud: r.wonHud } : undefined
    };

    await NS.store.put('slotsLog', {
      spins: cur.spins + 1,
      wins: cur.wins + (vyhral ? 1 : 0),
      staked: cur.staked + r.amount,
      won: cur.won + r.won,
      best: Math.max(cur.best || 0, r.won),
      bestStake: r.won > (cur.best || 0) ? r.amount : cur.bestStake,
      lossRun: bezVyhry,
      maxLossRun: Math.max(cur.maxLossRun || 0, bezVyhry),
      firstAt: cur.firstAt || now(),
      lastAt: now(),
      recent: [zapis, ...(cur.recent || [])].slice(0, RECENT_MAX)
    });
  }

  /** Souhrn pro tabulku i pro lištu. */
  function stats() {
    const s = { ...PRAZDNY, ...(NS.store.get().slotsLog || {}) };
    const cisty = s.won - s.staked;
    return {
      ...s,
      net: cisty,
      // návratnost: kolik z každé vložené koruny se vrátilo
      rtp: s.staked > 0 ? (s.won / s.staked) * 100 : null,
      winRate: s.spins > 0 ? (s.wins / s.spins) * 100 : null,
      avgStake: s.spins > 0 ? s.staked / s.spins : null,
      avgWin: s.wins > 0 ? s.won / s.wins : null
    };
  }

  async function reset() {
    await NS.store.put('slotsLog', { ...PRAZDNY });
  }

  /* ---- sázka a hradla ----------------------------------------------------- */

  /**
   * Kolik se vloží a jestli to jde. Sází se VŽDY základní částka – navyšování
   * po prohře tady nemá smysl (viz hlavička). Rezerva špinavých peněz je stejná
   * jako u kuliček, ať se to nemusí nastavovat dvakrát.
   */
  function nextStake() {
    const cfg = NS.store.get().read;
    const zaklad = Math.max(1, Math.round(+cfg.casinoStake || 1000));
    const rezerva = Math.max(0, Math.round(+cfg.casinoReserve || 0));
    const dirty = NS.casino ? NS.casino.readDirty() : null;
    const dostupne = dirty != null ? Math.max(0, dirty - rezerva) : null;
    return {
      amount: zaklad,
      rezerva,
      dirty,
      dostupne,
      maxVyhra: zaklad * MAX_NASOBEK,
      blokovano: dostupne != null && zaklad > dostupne
    };
  }

  const autoSet = () => String(NS.store.get().read.casinoAuto || '') === 'slots';
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  let autoRunning = false;
  let selhani = 0;
  const AUTO_MAX_FAILS = 3;

  /** Jedno automatické zatočení. Vrací true, když se točilo. */
  async function autoTick() {
    if (autoRunning || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;

    const n = nextStake();
    if (n.blokovano) {
      // rezerva – nevypínat, špinavé peníze mohou přitéct z výroby nebo zločinů
      NS.gym.setStatus('auto automat čeká: sázka ' + NS.fmt.kc(n.amount)
        + ' by šla pod rezervu ' + NS.fmt.kc(n.rezerva), true);
      return false;
    }

    autoRunning = true;
    try {
      NS.gym.setStatus('auto automat: točím za ' + NS.fmt.kc(n.amount) + '…');
      const r = await NS.gym.withSuspend(() => spin(n.amount));
      await log(r);
      selhani = 0;

      const s = stats();
      NS.gym.setStatus('automat: ' + (r.won > 0 ? 'výhra ' + NS.fmt.kc(r.won) : 'nic')
        + ' · bilance ' + NS.fmt.signed(s.net)
        + (s.rtp != null ? ' (' + NS.fmt.pct(s.rtp) + ' návratnost)' : ''),
        r.won === 0);
      NS.gym.collect();
      return true;
    } catch (e) {
      /*
       * Přechodné selhání automatiku nevypíná – vypnutí po jednom „hra
       * neodpověděla“ byla u kuliček nejčastější stížnost. Vypne se po třech.
       */
      selhani++;
      if (selhani >= AUTO_MAX_FAILS) {
        await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus('⚠ auto automat vypnuto po ' + selhani + ' selháních: ' + e.message, true);
        NS.gym.collect();
      } else {
        NS.gym.setStatus('⚠ automat: ' + e.message + ' (zkusím znovu)', true);
      }
      return false;
    } finally {
      autoRunning = false;
    }
  }

  NS.slots = {
    spin, log, stats, reset, nextStake, autoTick, autoSet, autoOn,
    BUILDING, MAX_NASOBEK, PRAZDNY, RECENT_MAX,
    get autoRunning() { return autoRunning; },
    resetFails() { selhani = 0; }
  };
})();
