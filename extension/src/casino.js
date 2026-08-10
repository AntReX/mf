/* =============================================================================
 * casino.js – „Šťastný tip“ (budova #15) jako řádek v liště
 *
 *   KASINO: [10 000 ▾]  🔫  ❤️  🔥        12× · −340 Kč
 *
 * Vybereš sázku, klikneš na tvar a hraje se. Klik vloží fragment budovy do
 * herního okna, vybere tvar, vepíše částku a zmáčkne skutečné „Hrajeme!“ –
 * požadavek posílá hra. Jeden tvůj klik = jedna sázka, **žádná automatika**.
 *
 * !!! PROČ TU NENÍ AUTOMATICKÉ SÁZENÍ !!!
 * Hra má tři tvary a platí trojnásobek bez poplatků, takže očekávaná hodnota je
 * PŘESNĚ NULA: (1/3 × +2) + (2/3 × −1) = 0. Automat by tedy nevydělával, jen by
 * roztáčel majetek dokola, dokud ho rozptyl neodkrojí. Proto se kliká ručně
 * a v liště je vidět skutečná bilance – ať je čím ověřit, že to opravdu nevydělává.
 *
 * !!! JAK SE POZNÁ VÝSLEDEK !!!
 * Hra odpovídá JSONem (`{"confirm":"Gratulujeme! Uhodl jsi!…","winNumber":2}`),
 * ale ten čte HERNÍ javascript – rozšíření je v izolovaném světě a k odpovědi se
 * nedostane. Zjišťuje se proto z DOM, kam hra výsledek vykreslí:
 *   `.lg-ball.winner`      – vítězný tvar (po animaci, ~5 s)
 *   `.choose-ball.selected` – co jsi tipoval
 *
 * Z HUD to určovat NELZE: špinavé peníze se mění i z jiných zdrojů. Při testu
 * narostly o 827 Kč zrovna u PROHRANÉ sázky za 10 Kč – detekce podle rozdílu
 * v HUD by hlásila výhru. Proto se bilance počítá z výsledku (výhra = +2×,
 * prohra = −1×), ne z peněz v HUD.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/15';
  const WAIT_RESULT = 9000;      // animace koulí trvá ~5 s
  const POLL = 200;

  /*
   * Hraje se jen za špinavé peníze. Diamantová varianta (`playFigures`, záložka
   * `points`) má stejnou mechaniku, ale diamanty jsou drahá valuta a omylem
   * kliknutá sázka by bolela – proto tu není.
   */
  const TAB = 'dirty_money';
  const SHAPES = [
    { ball: '1', cls: 'gun', label: '🔫', name: 'pistole' },
    { ball: '2', cls: 'heart', label: '❤️', name: 'srdce' },
    { ball: '3', cls: 'fire', label: '🔥', name: 'oheň' }
  ];

  /*
   * !!! NAVYŠOVÁNÍ PO PROHŘE (martingale) !!!
   * Výplata je 3× sázka při šanci 1/3, takže aby výhra pokryla všechny předchozí
   * prohry, musí platit `3·b > S + b`, tedy `2·b > S` (b = nová sázka,
   * S = dosud vsazeno v sérii). Při `b = základ × f^k` z toho vychází f > 1,5.
   *
   * ×1,5 je PŘESNĚ ta hranice a má pěknou vlastnost: čistý zisk je +2× základ,
   * ať výhra přijde v kterémkoli kroku. Menší násobek (×1,3, ×1,4) vypadá
   * bezpečněji, ale od 4.–5. kroku už výhra série ztrátu NEPOKRYJE – proto je
   * pod 1,5 varování.
   *
   * Co to nemění: očekávaná hodnota zůstává nula. Martingale mění rozdělení –
   * mnoho malých výher a občas velká ztráta, když série přeteče strop nebo
   * majetek. Šance na prohru je 2/3, takže série jsou časté: 6× za sebou 8,8 %,
   * 10× za sebou 1,7 % (a to je pak 58× základ na jedné sázce).
   */
  const STEP_MIN_SAFE = 1.5;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shapeByBall = b => SHAPES.find(s => s.ball === String(b));

  /**
   * Pravděpodobnost v procentech. `fmt.pct` umí jedno desetinné místo, což u malých
   * čísel ztrácí smysl – 0,23 % by ukázalo jako „0,2 %“ a 0,03 % jako „0,0 %“.
   */
  const pctText = v => (v >= 1
    ? NS.fmt.pct(v, 1)
    : (Math.round(v * 100) / 100).toString().replace('.', ',') + ' %');

  /**
   * Sázka pro příští klik: základ navýšený za každou prohru v řadě. Po výhře se
   * série nuluje, takže se jde zas od základu.
   */
  /**
   * Špinavé peníze z HUD (`renew-dirty_money`). Za ně se v kasinu sází, takže
   * proti nim se drží rezerva. Čte se z DOM, žádný požadavek do hry.
   */
  function readDirty() {
    const el = document.querySelector('.value.renew-dirty_money');
    if (el && !el.closest('#cmc-gym-bar')) return NS.parse.toNum(el.textContent);
    const box = Array.from(document.querySelectorAll('.mparam'))
      .find(e => !e.closest('#cmc-gym-bar') && e.querySelector('[class*="currency-money-dirty"]'));
    return box ? NS.parse.toNum(box.textContent) : null;
  }

  /**
   * Progrese sázek. Násobek se může po zadaném počtu kol přepnout na druhý:
   * první fáze zisk série NAVYŠUJE (čím vyšší násobek, tím víc), druhá ho jen
   * drží – proto se hodí začít ostřeji a pak přejít na 1,5, kde je expozice
   * nejmenší. Násobí se PO sázce, takže „prvních 6 kol ×2“ = sázky
   * `1, 2, 4, 8, 16, 32 ×základ` a sedmá už `32 × 1,5`.
   *
   * Nepočítá se ze vzorce geometrické řady, ale krok za krokem – kód každou sázku
   * zaokrouhluje a u dvou fází by uzavřený vzorec nesouhlasil s realitou.
   */
  function schedule(zaklad, nasobek, pokusy, faze1, nasobek2) {
    const out = [];
    let cur = Math.max(1, zaklad);
    for (let k = 1; k <= Math.max(1, pokusy); k++) {
      out.push(Math.round(cur));
      cur *= (faze1 > 0 && k < faze1) ? nasobek : (faze1 > 0 ? nasobek2 : nasobek);
    }
    return out;
  }

  /** Sázka v k-tém kole (k od nuly). */
  function stakeAt(zaklad, nasobek, k, faze1, nasobek2) {
    return schedule(zaklad, nasobek, k + 1, faze1, nasobek2)[k];
  }

  /**
   * Kolik celkem spolkne série, když dojde až do stropu pokusů. Tohle je to číslo,
   * které je potřeba mít po ruce PŘEDEM – jinak se člověk dozví až u patnácté
   * sázky, že na dokončení nemá.
   */
  function exposure(zaklad, nasobek, pokusy, faze1, nasobek2) {
    if (!(pokusy > 0)) return 0;
    return schedule(zaklad, nasobek, pokusy, faze1 || 0, nasobek2 || nasobek)
      .reduce((s, x) => s + x, 0);
  }

  function nextStake() {
    const cfg = NS.store.get().read;
    const zaklad = Math.max(1, Math.round(+cfg.casinoStake || 10));
    const nasobek = Math.max(1, +cfg.casinoStep || STEP_MIN_SAFE);
    const strop = Math.max(0, Math.round(+cfg.casinoMax || 0));
    const zapnuto = cfg.casinoProgress !== false;
    const pokusy = Math.max(1, Math.round(+cfg.casinoMaxSteps || 6));
    // dvě fáze: prvních `faze1` kol prvním násobkem, dál druhým (0 = jedna fáze)
    const faze1 = Math.max(0, Math.round(+cfg.casinoPhase1 || 0));
    const nasobek2 = Math.max(1, +cfg.casinoStep2 || nasobek);
    const log = NS.store.get().casinoLog || {};
    const serie = log.streak || 0;
    // s vypnutým navyšováním se sází pořád základ; série se dál eviduje, ale
    // na výši sázky nemá vliv
    const chtena = zapnuto ? stakeAt(zaklad, nasobek, serie, faze1, nasobek2) : zaklad;
    const sunk = log.sunk || 0;
    const potreba = zapnuto ? exposure(zaklad, nasobek, pokusy, faze1, nasobek2) : zaklad;
    /*
     * Rezerva: kolik špinavých peněz musí zůstat. Sázka na ni nesmí sáhnout –
     * jinak by martingale v nejhorší chvíli vysál účet do nuly.
     */
    const rezerva = Math.max(0, Math.round(+cfg.casinoReserve || 0));
    const dirty = readDirty();
    const dostupne = dirty == null ? null : Math.max(0, dirty - rezerva);
    const vysledna = strop > 0 ? Math.min(chtena, strop) : chtena;
    return {
      zaklad,
      nasobek,
      nasobek2,
      faze1,
      zapnuto,
      serie,
      sunk,
      strop,
      pokusy,
      // celková expozice série a kolik z ní ještě zbývá
      potreba,
      zbyva: Math.max(0, potreba - sunk),
      // kolikátý pokus je ten příští a jestli je poslední
      pokus: serie + 1,
      posledni: zapnuto && serie + 1 >= pokusy,
      // sázka posledního kola a zisk, když série vyjde (od 2. fáze konstantní)
      posledniSazka: zapnuto ? stakeAt(zaklad, nasobek, pokusy - 1, faze1, nasobek2) : zaklad,
      serieZisk: zapnuto
        ? chtena * 3 - (sunk + chtena)
        : zaklad * 2,
      rezerva,
      dirty,
      dostupne,
      // sázka by šla pod rezervu → nesází se vůbec (radši nic než sáhnout do rezervy)
      blokovano: dostupne != null && vysledna > dostupne,
      // strop je pojistka: bez něj série roste, dokud ji hra neodmítne
      amount: vysledna,
      omezeno: zapnuto && strop > 0 && chtena > strop
    };
  }

  /* ---- sázka --------------------------------------------------------------- */

  /**
   * Zahraje jednu sázku a vrátí výsledek. Fragment se vkládá celý, protože
   * handler hry si sahá na okolí (`.tab-c.active`, animace podle rozměrů koulí).
   */
  async function play(ball, amount) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');
    if (!(amount > 0)) throw new Error('sázka musí být větší než nula');

    const { status, raw } = await NS.parse.apiGetTry(BUILDING);
    /* výpadek se zkusí znovu – jedno 404 nesmí vypnout automatiku, viz apiGetTry */
    if (status !== 200) throw new Error('kasino nelze přečíst (HTTP ' + status + ', opakováno)');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-casino-box';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(200);   // ať se poskládá layout, animace čte rozměry

      const sekce = box.querySelector('.tab-c[data-id="' + TAB + '"]')
        || box.querySelector('form.playBalls');
      const form = sekce && (sekce.matches('form') ? sekce : sekce.querySelector('form.playBalls'));
      if (!form) throw new Error('formulář sázky ve fragmentu není');

      const volba = Array.from(form.closest('.tab-c, div').querySelectorAll('.choose-ball'))
        .find(e => e.getAttribute('data-ball') === String(ball));
      const pole = form.querySelector('input[name="amount"]');
      const tlacitko = form.querySelector('button, [type="submit"]');
      if (!volba || !pole || !tlacitko) throw new Error('kasino má jinou podobu, než čekám');

      volba.click();
      await sleep(120);
      pole.value = String(Math.round(amount));

      tlacitko.click();

      // výsledek se objeví až po animaci: hra označí vítěznou kouli
      const konec = Date.now() + WAIT_RESULT;
      let winner = null;
      while (Date.now() < konec) {
        await sleep(POLL);
        const el = box.querySelector('.lg-ball.winner');
        if (el) { winner = el; break; }
      }
      if (!winner) throw new Error('hra neoznámila výsledek (zkus to znovu)');

      const vitez = SHAPES.find(s => winner.classList.contains(s.cls));
      const vyhra = !!(vitez && vitez.ball === String(ball));
      return {
        win: vyhra,
        winner: vitez ? vitez.name : '?',
        mine: (shapeByBall(ball) || {}).name || '?',
        amount: Math.round(amount),
        delta: vyhra ? Math.round(amount) * 2 : -Math.round(amount)
      };
    } finally {
      box.remove();
    }
  }

  /* ---- bilance ------------------------------------------------------------- */

  const MAX_LAST = 60;      // posledních sázek se drží jen rozumný počet

  const PRAZDNY = {
    plays: 0, wins: 0, staked: 0, won: 0, net: 0, at: null, byShape: {}, last: [],
    streak: 0,   // proher v řadě – podle toho se navyšuje sázka
    sunk: 0,     // kolik je v běžící série utopeno (po výhře se nuluje)
    busts: 0,    // kolikrát série vyčerpala pokusy a vzdala se
    /*
     * Nepovedené pokusy v řadě. Vede se ZVLÁŠŤ od `streak`, protože ten se nuluje
     * i vzdáním série (vyčerpáním pokusů) – takže by jeho rekord nikdy nepřelezl
     * strop pokusů a neřekl by nic. `lossRun` se nuluje jedině výhrou, takže
     * `maxLossRun` je skutečný rekord „kolikrát to za sebou nepadlo“.
     */
    lossRun: 0,
    maxLossRun: 0
  };

  /**
   * Zápis jedné sázky. Bilance je jediný způsob, jak si na vlastních datech
   * ověřit, že hra opravdu nevydělává – a musí se počítat z VÝSLEDKŮ, ne z peněz
   * v HUD (ty se mění i z jiných zdrojů).
   *
   *   staked = co jsi celkem vložil
   *   won    = co ti hra celkem vrátila (při výhře trojnásobek sázky)
   *   net    = won − staked
   */
  async function log(r) {
    const cur = { ...PRAZDNY, ...(NS.store.get().casinoLog || {}) };
    const vraceno = r.win ? r.amount * 3 : 0;
    const cfg = NS.store.get().read;
    const pokusy = Math.max(1, Math.round(+cfg.casinoMaxSteps || 6));

    /*
     * Série končí výhrou, nebo vyčerpáním pokusů. Bez druhé podmínky by sázka
     * rostla dál a dál – při ×1,5 je 30. sázka 128 tisíc základů a 50. už
     * 425 milionů. Po vyčerpání pokusů se ztráta realizuje a jde se od základu.
     */
    const dalsiSerie = cur.streak + 1;
    const vzdano = !r.win && dalsiSerie >= pokusy;
    // proher v řadě bez ohledu na vzdané série – nuluje to jedině výhra
    const bezVyhry = r.win ? 0 : (cur.lossRun || 0) + 1;

    const sh = { plays: 0, wins: 0, staked: 0, won: 0, ...(cur.byShape[r.mine] || {}) };
    const byShape = {
      ...cur.byShape,
      [r.mine]: {
        plays: sh.plays + 1,
        wins: sh.wins + (r.win ? 1 : 0),
        staked: sh.staked + r.amount,
        won: sh.won + vraceno
      }
    };

    await NS.store.put('casinoLog', {
      plays: cur.plays + 1,
      wins: cur.wins + (r.win ? 1 : 0),
      staked: cur.staked + r.amount,
      won: cur.won + vraceno,
      net: cur.won + vraceno - (cur.staked + r.amount),
      at: Date.now(),
      byShape,
      streak: (r.win || vzdano) ? 0 : dalsiSerie,
      sunk: (r.win || vzdano) ? 0 : cur.sunk + r.amount,
      busts: cur.busts + (vzdano ? 1 : 0),
      lossRun: bezVyhry,
      maxLossRun: Math.max(cur.maxLossRun || 0, bezVyhry),

      // do záznamu patří i to, v kolikátém kroku série se sázelo
      last: [{ at: Date.now(), tip: r.mine, amount: r.amount, win: r.win, winner: r.winner,
        delta: r.delta, step: cur.streak, abandoned: vzdano,
        serieNet: r.win ? vraceno - (cur.sunk + r.amount)
          : (vzdano ? -(cur.sunk + r.amount) : null) },
        ...cur.last].slice(0, MAX_LAST)
    });
  }

  /** Souhrn pro lištu i pro panel. */
  /**
   * Vynuluje bilanci. Je to tady schválně: seznam klíčů se od zavedení rozrostl
   * (streak, sunk, busts, lossRun, maxLossRun) a udržovat ho na dvou místech
   * znamená, že jedno z nich zůstane zapomenuté.
   */
  async function reset() {
    await NS.store.put('casinoLog', { ...PRAZDNY });
  }

  function stats() {
    const c = { ...PRAZDNY, ...(NS.store.get().casinoLog || {}) };
    const shapes = SHAPES.map(s => {
      const z = { plays: 0, wins: 0, staked: 0, won: 0, ...(c.byShape[s.name] || {}) };
      return {
        name: s.name, label: s.label, ...z,
        net: z.won - z.staked,
        rate: z.plays ? (z.wins / z.plays) * 100 : null
      };
    }).filter(s => s.plays > 0);

    return {
      ...c,
      net: c.won - c.staked,
      rate: c.plays ? (c.wins / c.plays) * 100 : null,
      // jak nepravděpodobný ten rekord byl – (2/3)^n
      maxLossRunChance: c.maxLossRun > 0 ? Math.pow(2 / 3, c.maxLossRun) * 100 : null,
      next: nextStake(),
      // 1 ze 3 – proti tomu se porovnává, jestli se realita drží teorie
      expected: 100 / SHAPES.length,
      shapes
    };
  }

  /* ---- automatické sázení (volitelné, výchozí vypnuto) --------------------- */

  /*
   * !!! SÁZÍ BEZ TVÉHO KLIKNUTÍ !!!
   * Vybereš tvar a sází se sám – s navyšováním po prohře, stropem pokusů
   * a stropem na sázku, přesně jak je nastaveno. Platí všechny pojistky ostatních
   * automatik: hlavní vypínač ⏸ i zámek ve vězení.
   *
   * !!! A JEDNA POJISTKA NAVÍC: STOP PO VZDANÉ SÉRII !!!
   * Očekávaná hodnota je nula, takže automat nemá co optimalizovat – jen mele
   * majetek dokola. Kdyby jel dál i po vyčerpání pokusů, opakoval by přesně tu
   * ztrátu, proti které je ten strop postavený. Proto se po vzdané série sám
   * vypne a napíše to. Kdo chce jet dál, zapne to znovu jedním klikem.
   */
  let autoRunning = false;

  /*
   * Přechodná selhání (hra neodpověděla, chybí herní okno, timeout animace) NESMÍ
   * automatiku vypnout – jedno zaškobrtnutí by tak ukončilo celý běh. Počítají se
   * a vypne se až po třech za sebou; první úspěšná sázka počítadlo nuluje.
   */
  const AUTO_MAX_FAILS = 3;
  let autoFails = 0;

  /** Co je NASTAVENÉ (bez ohledu na hlavní vypínač). */
  function autoShape() {
    const id = String(NS.store.get().read.casinoAuto || '');
    return SHAPES.find(s => s.ball === id) || null;
  }

  /** Je ve výběru automat (#18)? Sází pak slots.js, ne tenhle modul. */
  const autoSlots = () => String(NS.store.get().read.casinoAuto || '') === 'slots';
  /** A blackjack (#18)? Ten hraje blackjack.js – a za diamanty. */
  const autoBlackjack = () => String(NS.store.get().read.casinoAuto || '') === 'blackjack';
  /** Poker (#18) hraje poker.js, taky za diamanty. */
  const autoPoker = () => String(NS.store.get().read.casinoAuto || '') === 'poker';

  /** Co se SMÍ spustit. */
  const autoOn = () => (NS.store.get().read.autoPaused === true ? null : autoShape());

  /** Jedna automatická sázka. Vrací true, když se sázelo. */
  async function autoTick() {
    if (autoRunning) return false;
    const sh = autoOn();
    if (!sh) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;

    const pred = nextStake();
    if (pred.blokovano) {
      // rezerva – nevypínáme, špinavé peníze mohou přitéct z výroby nebo zločinů
      NS.gym.setStatus('auto kasino čeká: sázka ' + NS.fmt.kc(pred.amount)
        + ' by šla pod rezervu ' + NS.fmt.kc(pred.rezerva), true);
      return false;
    }

    autoRunning = true;
    try {
      const n = pred;
      const posledni = n.posledni;
      NS.gym.setStatus('auto kasino: ' + sh.name + ' za ' + NS.fmt.kc(n.amount)
        + ' (' + n.pokus + '/' + n.pokusy + ')');
      const r = await NS.gym.withSuspend(() => play(sh.ball, n.amount));
      await log(r);

      autoFails = 0;

      if (r.win) {
        NS.gym.setStatus('auto kasino: 🎉 ' + r.mine + ' ' + NS.fmt.signed(r.delta)
          + ', zpět na ' + NS.fmt.kc(nextStake().zaklad));
      } else if (posledni) {
        /*
         * Vyčerpané pokusy = ta ztráta, proti které je strop postavený. Výchozí
         * chování je zastavit se – kdo chce mlít dál, zapne si `casinoAutoContinue`.
         * Při 6 pokusech se to stane v 8,8 % sérií, tedy asi každou jedenáctou.
         */
        const dal = NS.store.get().read.casinoAutoContinue === true;
        const ztrata = NS.fmt.signed(-(n.sunk + n.amount));
        if (!dal) await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus(dal
          ? 'auto kasino: série vzdána (' + ztrata + '), jedu dál od základu'
          : 'auto kasino zastaveno: pokusy vyčerpány, série vzdána (' + ztrata + ')', !dal);
      } else {
        NS.gym.setStatus('auto kasino: prohra ' + NS.fmt.signed(r.delta)
          + ', příště ' + NS.fmt.kc(nextStake().amount));
      }
      return true;
    } catch (e) {
      // přechodné zaškobrtnutí automatiku nevypíná, jen se počítá
      autoFails++;
      if (autoFails >= AUTO_MAX_FAILS) {
        await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus('⚠ auto kasino zastaveno po ' + autoFails + ' neúspěších: '
          + e.message, true);
        autoFails = 0;
      } else {
        NS.gym.setStatus('⚠ auto kasino: ' + e.message
          + ' (' + autoFails + '/' + AUTO_MAX_FAILS + ', zkusím znovu)', true);
      }
      return false;
    } finally {
      autoRunning = false;
      const zprava = NS.gym.statusText();
      NS.gym.collect();
      if (zprava) NS.gym.setStatus(zprava, /zastaveno|⚠/.test(zprava));
    }
  }

  /* ---- řádek v liště ------------------------------------------------------- */

  function row(onChange) {
    const s = stats();
    const n = s.next;

    const wrap = document.createElement('div');
    wrap.className = 'cmc-gym-row cmc-casino-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = 'Kasino:';
    label.title = 'Šťastný tip (#15): tři tvary, trojnásobek, žádné poplatky – tedy'
      + ' očekávaná hodnota PŘESNĚ NULA. Navyšování po prohře to nemění, jen'
      + ' přehází rozdělení: hodně malých výher a občas velká ztráta. Sází se za'
      + ' špinavé peníze, jeden klik = jedna sázka, žádná automatika.';
    wrap.appendChild(label);

    /*
     * Blackjack se hraje za DIAMANTY, kdežto kuličky a automat za špinavé peníze.
     * Je to jedno pole, ale jiná měna i jiný klíč – míchat je do jednoho čísla by
     * znamenalo, že „500“ znamená pokaždé něco úplně jiného.
     */
    const bj = NS.blackjack && NS.blackjack.autoSet();
    const pk = NS.poker && NS.poker.autoSet();
    const bjN = bj ? NS.blackjack.nextStake() : (pk ? NS.poker.nextStake() : null);

    /*
     * !!! JEDNO POLE, TŘI RŮZNÁ NASTAVENÍ – MUSÍ BÝT VIDĚT KTERÉ !!!
     * Cíl se řídí volbou v AUTO: vypnuto → `casinoStake` (kuličky, Kč),
     * blackjack → `bjStake`, poker → `pkStake` (obojí 💎). Uživatel ale přirozeně
     * nejdřív napíše částku a AUTO zapne teprve potom – číslo tak spadlo do
     * sázky kuliček a po přepnutí na poker se pole překreslilo na uložené ante.
     * Vypadalo to, že se „vrátila původní částka“, i když se jen ukazovala jiná
     * kolonka. Proto je před polem popisek, co zrovna nastavuje.
     */
    const jmenoCile = pk ? '🂡 ante' : (bj ? '🃏 sázka' : '🎯 vklad');
    const mena = (pk || bj) ? '💎' : 'Kč';
    const stitek = document.createElement('span');
    stitek.className = 'cmc-gym-auto-label cmc-casino-cil';
    stitek.textContent = jmenoCile;
    stitek.title = 'Pole nastavuje ' + (pk ? 'ante pokeru' : bj ? 'sázku blackjacku'
      : 'vklad kuliček') + ' v ' + (mena === '💎' ? 'DIAMANTECH' : 'KORUNÁCH')
      + '. Každá hra má svoje číslo, takže se přepnutím v AUTO změní i to, co tu'
      + ' vidíš – nic se neztratilo.';
    wrap.appendChild(stitek);

    // základní vklad – volné pole, ne nabídka
    const pole = document.createElement('input');
    pole.type = 'number';
    const vDiamantech = bj || pk;
    pole.min = vDiamantech ? '10' : '1';
    if (vDiamantech) pole.step = '10';
    pole.className = 'cmc-casino-input' + (vDiamantech ? ' cmc-casino-gems' : '');
    pole.value = String(vDiamantech ? bjN.amount : n.zaklad);
    pole.title = pk
      ? 'ante v DIAMANTECH. Skládá se ze ŽETONŮ (10, 50, 100, 1 000, 5 000,'
        + ' 9 000), takže musí být násobek deseti – 12 hra složit neumí.'
        + ' Po flopu se spočítá šance a při'
        + ' převaze se sázka zdvojnásobí – proto je potřeba mít dvojnásobek.'
        + (bjN.diamanty != null ? ' Máš ' + NS.fmt.gems(bjN.diamanty) + '.' : '')
      : bj
      ? 'sázka v DIAMANTECH (nejmenší žeton je ' + NS.blackjack.MIN_SAZKA
        + ', sázka se z žetonů skládá, takže se zaokrouhluje na desítky).'
        + ' Blackjack platí 2,5×, výhra 2×, remíza vrací vklad.'
        + (bjN.diamanty != null ? ' Máš ' + NS.fmt.gems(bjN.diamanty) + '.' : '')
      : 'základní vklad – po každé prohře se navyšuje '
        + (n.faze1 > 0
          ? 'prvních ' + n.faze1 + ' kol ×' + n.nasobek + ', dál ×' + n.nasobek2
          : '×' + n.nasobek)
        + ', po výhře se vrací sem';
    const uloz = async () => {
      if (pk) {
        const v = Math.max(10, Math.round((+pole.value || 10) / 10) * 10);
        if (v === bjN.amount) return;
        await NS.store.patch('read', { pkStake: v });
        NS.gym.collect(true);
        return;
      }
      if (bj) {
        const min = NS.blackjack.MIN_SAZKA;
        const v = Math.max(min, Math.round((+pole.value || min) / min) * min);
        if (v === bjN.amount) return;
        await NS.store.patch('read', { bjStake: v });
        NS.gym.collect(true);
        return;
      }
      const v = Math.max(1, Math.round(+pole.value || 1));
      if (v === n.zaklad) return;
      await NS.store.patch('read', { casinoStake: v });
      NS.gym.collect(true);
    };
    pole.addEventListener('change', uloz);
    pole.addEventListener('blur', uloz);
    wrap.appendChild(pole);

    /*
     * Přepínač navyšování. Bez něj by se z volby „sázím pořád stovku“ nedalo
     * vrátit jinak než přes nastavení – a hlavně: navyšování mění výši sázky,
     * takže musí být vidět, jestli je zapnuté.
     */
    const prep = document.createElement('label');
    prep.className = 'cmc-gym-auto-box' + (n.zapnuto ? ' cmc-gym-auto-on' : '');
    prep.title = n.zapnuto
      ? 'Navyšování je ZAPNUTÉ: '
        + (n.faze1 > 0
          ? 'prvních ' + n.faze1 + ' kol ×' + n.nasobek + ', pak ×' + n.nasobek2
          : 'po každé prohře ×' + n.nasobek)
        + ', po výhře zpět na ' + NS.fmt.kc(n.zaklad) + '.'
        + ' Očekávanou hodnotu to nemění (je nulová), jen rozdělení – hodně malých'
        + ' výher a občas velká ztráta.'
      : 'Navyšování je vypnuté – sází se pořád ' + NS.fmt.kc(n.zaklad) + '.';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = n.zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { casinoProgress: cb.checked });
      NS.gym.collect(true);
    });
    const cbTxt = document.createElement('span');
    cbTxt.textContent = n.faze1 > 0
      ? '×' + n.nasobek + '→' + n.nasobek2
      : '×' + n.nasobek;
    prep.append(cb, cbTxt);
    wrap.appendChild(prep);

    for (const sh of SHAPES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-casino-btn';
      b.textContent = sh.label;
      b.disabled = !!n.blokovano;
      if (n.blokovano) b.classList.add('cmc-casino-blocked');
      b.title = (n.blokovano
        ? 'NELZE: sázka ' + NS.fmt.kc(n.amount) + ' by šla pod rezervu '
          + NS.fmt.kc(n.rezerva) + ' (špinavých máš ' + NS.fmt.kc(n.dirty)
          + ', k dispozici ' + NS.fmt.kc(n.dostupne) + '). '
        : '') + 'vsadit ' + NS.fmt.kc(n.amount) + ' na ' + sh.name
        + (n.zapnuto ? ' (' + n.pokus + '. z ' + n.pokusy + ' pokusů'
          + (n.sunk ? ', utopeno ' + NS.fmt.kc(n.sunk) : '')
          + (n.posledni ? ' – POSLEDNÍ, při prohře se série vzdá' : '') + ')' : '')
        + (n.omezeno ? ' – zastropováno na ' + NS.fmt.kc(n.strop)
          + ', série už ztrátu nepokryje' : '')
        + ' · šance 1 ze 3, při výhře trojnásobek';
      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        NS.gym.setStatus('kasino: ' + sh.name + ' za ' + NS.fmt.kc(n.amount) + '…');
        try {
          const r = await NS.gym.withSuspend(() => play(sh.ball, n.amount));
          await log(r);
          const po = stats();
          const zprava = r.win
            ? '🎉 ' + r.mine + ' – VÝHRA ' + NS.fmt.signed(r.delta)
              + (n.serie ? ', série uzavřena (' + NS.fmt.signed(r.amount * 3 - (n.sunk + r.amount)) + ')' : '')
              + ', zpět na ' + NS.fmt.kc(po.next.zaklad)
            : r.mine + ' – prohra ' + NS.fmt.signed(r.delta) + ' (padlo ' + r.winner + ')'
              + (!po.next.zapnuto ? ''
                : n.posledni
                  ? ', pokusy vyčerpány – série vzdána (' + NS.fmt.signed(-(n.sunk + n.amount))
                    + '), zpět na ' + NS.fmt.kc(po.next.zaklad)
                  : ', příště ' + NS.fmt.kc(po.next.amount) + ' (' + (po.next.pokus)
                    + '. z ' + po.next.pokusy + ')');
          setTimeout(() => {
            onChange();
            NS.gym.setStatus('kasino: ' + zprava, !r.win);
          }, 300);
        } catch (e) {
          NS.gym.setStatus('⚠ kasino: ' + e.message, true);
          b.disabled = false;
        }
      });
      wrap.appendChild(b);
    }

    // automatika: co se má sázet samo
    {
      const sh = autoShape();
      const pozastaveno = NS.store.get().read.autoPaused === true;
      const auto = document.createElement('span');
      auto.className = 'cmc-gym-auto'
        + (sh && !pozastaveno ? ' cmc-gym-auto-on' : '')
        + (sh && pozastaveno ? ' cmc-gym-auto-paused' : '');
      const jedeDal = NS.store.get().read.casinoAutoContinue === true;
      const sance = pctText(Math.pow(2 / 3, n.pokusy) * 100);
      auto.title = (sh && pozastaveno ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
        + (sh
          ? 'Sází se samo na ' + sh.name + ' za ' + NS.fmt.kc(n.amount)
            + ' (' + n.pokus + '. z ' + n.pokusy + ' pokusů). Po výhře zpět na základ. '
            + (jedeDal
              ? 'Po vzdané série jede dál od základu.'
              : 'Po vyčerpání pokusů se SÁM VYPNE – to je ta nejčastější příčina, proč'
                + ' se select přepne na „vypnuto“, a při ' + n.pokusy + ' pokusech to'
                + ' nastane v ' + sance + ' sérií. Přepnout na pokračování jde v nastavení.')
            + (s.busts ? ' Zatím vzdáno sérií: ' + s.busts + '.' : '')
            + ' Očekávaná hodnota je nula, tohle nevydělává.'
          : 'Automatické sázení na vybraný tvar. Sází BEZ tvého kliknutí, s navyšováním'
            + ' a stropem pokusů podle nastavení. Po vyčerpání pokusů se samo vypne'
            + ' (jde přepnout na pokračování v nastavení).');

      const lbl = document.createElement('span');
      lbl.className = 'cmc-gym-auto-label';
      lbl.textContent = 'auto';
      auto.appendChild(lbl);

      const sel = document.createElement('select');
      sel.className = 'cmc-gym-auto-select';
      /*
       * „automat“ je budova #18, jiná hra (částečné výplaty, žádné navyšování) –
       * ale ovládá se odtud, aby nebyly dva selecty na totéž. Obsluhuje ji
       * slots.js, tady jen sedí ve výběru.
       */
      const VOLBY = [{ ball: '', label: 'vypnuto' }, ...SHAPES,
        { ball: 'slots', label: '🎰', name: 'automat (#18)' },
        { ball: 'blackjack', label: '🃏', name: 'blackjack (#18)' },
        { ball: 'poker', label: '🂡', name: 'poker (#18)' }];
      const aktualni = String(NS.store.get().read.casinoAuto || '');
      for (const o of VOLBY) {
        const opt = document.createElement('option');
        opt.value = o.ball;
        opt.textContent = o.ball ? o.label + ' ' + o.name : o.label;
        if (o.ball === aktualni) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', async () => {
        const predtim = String(NS.store.get().read.casinoAuto || '');
        await NS.store.patch('read', { casinoAuto: sel.value });
        /*
         * Když se přepnutím mění i to, co pole nastavuje, řekne se to. Bez toho
         * to vypadá, že se zadaná částka „vrátila zpátky“.
         */
        const kam = v => (v === 'poker' ? 'ante pokeru (💎)'
          : v === 'blackjack' ? 'sázku blackjacku (💎)'
          : v === 'slots' ? 'vklad automatu (Kč)' : 'vklad kuliček (Kč)');
        const drivDiamanty = predtim === 'poker' || predtim === 'blackjack';
        const nyniDiamanty = sel.value === 'poker' || sel.value === 'blackjack';
        if (kam(predtim) !== kam(sel.value)) {
          const cfg2 = NS.store.get().read;
          const cislo = sel.value === 'poker' ? cfg2.pkStake
            : sel.value === 'blackjack' ? cfg2.bjStake : cfg2.casinoStake;
          NS.gym.setStatus('kasino: pole teď nastavuje ' + kam(sel.value) + ' – '
            + NS.fmt.num(cislo) + (nyniDiamanty ? ' 💎' : ' Kč')
            + (drivDiamanty !== nyniDiamanty
              ? ' (jiná měna než předtím, proto jiné číslo)'
              : ' (předchozí číslo zůstalo uložené u své hry)'), true);
        }
        NS.gym.collect(true);
      });
      auto.appendChild(sel);
      wrap.appendChild(auto);
    }

    /*
     * Kolik je potřeba mít, když série dojde do stropu. Ukazuje se i před první
     * sázkou – to je celý smysl: vidět expozici dřív, než do ní člověk vleze.
     */
    if (n.zapnuto) {
      const need = document.createElement('span');
      need.className = 'cmc-gym-auto-label cmc-casino-need';
      need.textContent = 'max ' + n.pokusy + '× · ' + NS.fmt.kc(n.potreba, { short: true });
      need.title = 'Při ' + n.pokusy + ' pokusech a '
        + (n.faze1 > 0
          ? 'násobcích ×' + n.nasobek + ' (prvních ' + n.faze1 + ' kol) a ×' + n.nasobek2
          : 'násobku ×' + n.nasobek)
        + ' spolkne celá série nejvýš ' + NS.fmt.kc(n.potreba)
        + ' (poslední sázka ' + NS.fmt.kc(n.posledniSazka) + ').'
        + ' Zisk uzavřené série je teď ' + NS.fmt.signed(n.serieZisk) + '.'
        + (n.serie > 0 ? ' Utopeno ' + NS.fmt.kc(n.sunk) + ', zbývá ' + NS.fmt.kc(n.zbyva) + '.' : '')
        + ' Šance, že se prohrají všechny pokusy, je '
        + pctText(Math.pow(2 / 3, n.pokusy) * 100) + '.'
        + ' Po vyčerpání pokusů se ztráta realizuje a jde se zas od základu.';
      wrap.appendChild(need);
    }

    if (n.rezerva > 0) {
      const rez = document.createElement('span');
      rez.className = 'cmc-gym-auto-label cmc-casino-reserve'
        + (n.blokovano ? ' cmc-casino-capped' : '');
      rez.textContent = 'rezerva ' + NS.fmt.kc(n.rezerva, { short: true });
      rez.title = 'Pod tuhle částku špinavých peněz sázka nesmí jít.'
        + (n.dirty != null
          ? ' Máš ' + NS.fmt.kc(n.dirty) + ', k dispozici tedy ' + NS.fmt.kc(n.dostupne) + '.'
          : ' Špinavé peníze se z HUD nepodařilo přečíst – rezerva se pak nehlídá.')
        + (n.blokovano ? ' Právě teď je sázka ' + NS.fmt.kc(n.amount) + ' zablokovaná.' : '')
        + ' Celá série potřebuje ' + NS.fmt.kc(n.potreba) + '.';
      wrap.appendChild(rez);
    }

    // stav série – aby bylo vidět, kde v progresi jsi, než klikneš
    if (n.serie > 0) {
      const serie = document.createElement('span');
      serie.className = 'cmc-gym-auto-label cmc-casino-serie';
      serie.textContent = n.serie + '× prohra'
        + (n.zapnuto ? ' → ' + NS.fmt.kc(n.amount, { short: true }) : '');
      serie.title = 'V sérii je utopeno ' + NS.fmt.kc(n.sunk)
        + '. Při výhře touto sázkou dostaneš ' + NS.fmt.kc(n.amount * 3)
        + ', tedy čistý ' + NS.fmt.signed(n.amount * 3 - (n.sunk + n.amount))
        + (n.zapnuto
          ? '. Po výhře se vklad vrátí na ' + NS.fmt.kc(n.zaklad) + '.'
          : '. Navyšování je vypnuté, takže sérii tahle sázka nedohoní.');
      if (n.omezeno) serie.classList.add('cmc-casino-capped');
      wrap.appendChild(serie);
    }

    if (s.plays > 0) {
      const bilance = document.createElement('span');
      // vlastní třída, ne `cmc-gym-status` – to je stavová hláška lišty a pletlo by se to
      bilance.className = 'cmc-casino-sum';
      bilance.textContent = s.plays + '× · ' + NS.fmt.signed(s.net);
      bilance.classList.add(s.net >= 0 ? 'cmc-casino-plus' : 'cmc-casino-minus');
      bilance.title = 'Vloženo ' + NS.fmt.kc(s.staked) + ', vráceno ' + NS.fmt.kc(s.won)
        + ', bilance ' + NS.fmt.signed(s.net) + '. Uhodnuto ' + s.wins + ' z ' + s.plays
        + (s.rate != null ? ' (' + NS.fmt.pct(s.rate, 1) + ', teoreticky 33,3 %)' : '')
        + (s.maxLossRun ? '. Nejvíc proher v řadě: ' + s.maxLossRun
          + ' (šance ' + pctText(s.maxLossRunChance) + ')' : '')
        + (s.lossRun ? ', právě ' + s.lossRun + ' v řadě' : '')
        + (s.busts ? '. Vzdaných sérií: ' + s.busts : '')
        + '. Počítá se z výsledků, ne z peněz v HUD – ty se mění i z jiných zdrojů.';
      wrap.appendChild(bilance);
    }

    return wrap;
  }

  NS.casino = {
    autoSlots, autoBlackjack, autoPoker, reset,
    row, play, stats, log, nextStake, exposure, schedule, stakeAt,
    autoTick, autoShape, autoOn, readDirty, pctText,
    AUTO_MAX_FAILS,
    get autoFails() { return autoFails; },
    resetAutoFails() { autoFails = 0; },
    SHAPES, STEP_MIN_SAFE, BUILDING
  };
})();
