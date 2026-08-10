/* =============================================================================
 * blackjack.js – Blackjack (#18) hraný ZÁKLADNÍ STRATEGIÍ
 *
 * Jediná hra ze čtyř v kasinu, kde rozhodnutí něco znamená. Pravidla té
 * implementace jsem proměřil naživo (37 kol po 10 💎) z `win_multiplier`:
 *
 *   Blackjack  2,5×  (3:2)      Výhra  2×  (1:1)
 *   Remíza     1×    (push)     Prohra 0
 *   Dealer stojí na 17 – viděn dohrávat na 17–21, přebírat na 22 a 23,
 *   nikdy nedobíral pod 17.
 *
 * !!! NENÍ DOUBLE ANI SPLIT !!!
 * V okně jsou jen „Vzít kartu“ a „Stát“. Právě zdvojováním a rozdělováním se
 * výhoda domu stlačuje k půl procentu, takže tady zůstane i při bezchybné hře
 * kolem 2 %. Strategie níže je proto ta správná pro hit/stand-only variantu,
 * NE opsaná tabulka z běžného blackjacku (ta počítá s double).
 *
 * !!! POČÍTÁNÍ KARET NEMÁ CENU !!!
 * Změřeno na barvách: v jednom kole se karta nikdy nezopakovala (6 kol), ale
 * mezi koly ano a často (ve 36 kartách byla K♠ třikrát, 2♥ třikrát). Míchá se
 * tedy po každém rozdání – minulé karty o příštích neříkají nic. Tenhle modul
 * proto nic nepočítá a hraje každé kolo od nuly. Cíl není vydělat (to nejde),
 * ale prohrávat co nejpomaleji a mít o tom čísla.
 *
 * !!! HRU MUSÍ INICIALIZOVAT HLAVNÍ SVĚT !!!
 * Blackjack si drží stav v proměnných hlavního světa (`blackjack_currentBet`)
 * a nastavuje je INLINE SKRIPT uvnitř fragmentu. `innerHTML` skripty nespustí
 * a izolovaný svět do těch proměnných nedosáhne, takže klik na žeton neudělá
 * nic: sázka zůstane 0, „HRÁT“ podrží atribut `disabled` a protože prohlížeč na
 * `disabled` tlačítko click vůbec nevyvolá, vypadá to jako chyba tlačítka.
 * Dělá to proto `src/main-world.js` (deklarovaný v `world: "MAIN"`), který to
 * navíc POTVRDÍ – vyrábět `<script>` znovu se v ostrém provozu neosvědčilo.
 *
 * !!! STAV SE ČTE Z DOM, NE Z ODPOVĚDÍ HRY !!!
 * Odpovědi serveru (`score`, `dealer_up_card`) izolovaný svět nevidí. Hra ale
 * všechno vykreslí:
 *   .blackjack_card .blackjack_rank-top → „10♣“, „A♥“ (i barva)
 *   .blackjack_card-back             → dealerova skrytá karta
 *   #blackjack_msg-title             → „Blackjack“ / „Vyhrál jsi!“ / „Remíza“
 *   #blackjack_player-score          → součet, ale JEN JAKO KONTROLA
 *
 * !!! SOUČET SE POČÍTÁ Z KARET !!!
 * `#blackjack_player-score` hra dopisuje se zpožděním a někdy vůbec – naživo ve
 * dvou kolech z pěti byl prázdný a `toNum('')` z toho udělala nulu, podle které
 * strategie dobrala na sedmnáctce a přebrala. Karty v okně jsou proti tomu fakt,
 * takže se sčítají vlastními silami (esa 11 → 1) a číslo ze hry se jen porovnává;
 * rozpor se hlásí do logu.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/18';

  /**
   * !!! NOMINÁLY ŽETONŮ SE ČTOU Z OKNA, NE Z TABULKY V KÓDU !!!
   * Tady byla natvrdo tabulka a TŘI ZE ŠESTI hodnot byly špatně (stejná chyba
   * jako v pokeru – `-10x` je 1 000, `-50x` 5 000 a `-100x` 9 000, ne 500/1000/
   * 2000). Názvy tříd k tomu vybízejí, ale hodnota je v textu žetonu.
   *
   * Blackjack `data-val` NEMÁ – jen text – takže se čte obojí a bere se první,
   * co dá číslo.
   *
   * Kdo si hodnoty odhadne, vsadí něco jiného, než si zapíše: sázka 2 000 by se
   * složila jedním kliknutím na `-100x`, tedy 9 000 doopravdy. A protože se
   * z téhož čísla počítá i výhra, v panelu by to vypadalo správně.
   */
  const CHIP_TRIDA = /^blackjack_chip-/;

  function zetony(box) {
    const out = [];
    for (const el of box.querySelectorAll('[class*="blackjack_chip-"]')) {
      const cls = [...el.classList].find(c => CHIP_TRIDA.test(c));
      if (!cls) continue;
      const v = NS.parse.toNum(el.getAttribute('data-val'))
        || NS.parse.toNum(el.textContent);
      if (v > 0) out.push([v, cls]);
    }
    return out.sort((a, b) => b[0] - a[0]);
  }
  const MIN_SAZKA = 10;

  const S = {
    root: '#blackjack',
    betting: '#blackjack_ui-betting',
    play: '#blackjack_ui-play',
    deal: '#blackjack_btn-deal',
    restart: '#blackjack_btn-restart',
    clear: '#blackjack_btn-clear',
    hit: '#blackjack_btn-hit',
    stand: '#blackjack_btn-stand',
    bet: '#blackjack_current-bet',
    pScore: '#blackjack_player-score',
    pCards: '#blackjack_player-cards',
    dCards: '#blackjack_dealer-cards',
    msg: '#blackjack_msg-box',
    msgTitle: '#blackjack_msg-title',
    msgSub: '#blackjack_msg-sub'
  };

  /** Titulek → násobek. Ověřeno proti `win_multiplier` ze serveru. */
  const VYSLEDKY = [
    { re: /blackjack/i, nasobek: 2.5, jmeno: 'blackjack' },
    { re: /remíz|push/i, nasobek: 1, jmeno: 'remíza' },
    { re: /vyhrál|výhra/i, nasobek: 2, jmeno: 'výhra' },
    { re: /prohrál|prohra|přebral|bust/i, nasobek: 0, jmeno: 'prohra' }
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- diagnostický log --------------------------------------------------- */

  /*
   * !!! PODROBNÝ ZÁPIS PRŮBĚHU !!!
   * Chyby v tomhle modulu se ukázaly být jinde, než na co ukazovala hláška
   * (viz hlavička – oživení fragmentu, zdržený součet, nemazaný titulek).
   * Proto se každý krok kola zapisuje: co bylo v okně, na co se kliklo, na co
   * se čekalo a co z toho vyšlo. Bez toho se to ladí naslepo.
   */
  const TRACE_KOL = 5;         // kolik posledních kol se drží
  const TRACE_KROKU = 120;     // strop na jedno kolo, ať to neroste bez konce

  let trace = [];
  let traceZacatek = 0;

  function traceNove(popis) {
    trace = [];
    traceZacatek = Date.now();
    krok('start', popis);
  }

  function krok(co, detail) {
    if (trace.length >= TRACE_KROKU) return;
    trace.push({ ms: Date.now() - traceZacatek, co, ...(detail || {}) });
  }

  /** Jak vypadá tlačítko – právě tohle rozhodlo o té „chybě u tlačítka“. */
  function tlacitko(box, sel) {
    const e = box.querySelector(sel);
    if (!e) return 'CHYBÍ';
    return (e.disabled ? 'disabled-attr ' : '')
      + (e.classList.contains('disabled') ? 'disabled-class ' : '')
      + 'ok';
  }

  /** Úplný snímek okna pro zápis do logu. */
  function snimek(box) {
    const s = stav(box);
    return {
      faze: s.faze,
      konec: s.konec,
      titul: s.titul || null,
      titulVDom: s.titulVDom || null,
      schovano: s.schovano,
      score: s.score,
      moje: s.hraci.map(k => k.value + k.suit).join(' ') || null,
      dealer: s.dealer.map(k => k.value + k.suit).join(' ') || null,
      rub: box.querySelectorAll('.blackjack_card-back').length,
      sazkaVOkne: s.sazka,
      tl: {
        deal: tlacitko(box, S.deal),
        hit: tlacitko(box, S.hit),
        stand: tlacitko(box, S.stand),
        restart: tlacitko(box, S.restart)
      }
    };
  }

  /** Uloží průběh kola. Drží se posledních `TRACE_KOL`. */
  async function traceUloz(vysledek) {
    const stare = NS.store.get().bjTrace || [];
    const zapis = {
      at: Date.now(),
      vysledek: vysledek || null,
      kroku: trace.length,
      kroky: trace.slice()
    };
    await NS.store.put('bjTrace', [zapis, ...stare].slice(0, TRACE_KOL));
  }

  /** Průběh jako čitelný text – do panelu i do souboru. */
  function traceText(zapisy) {
    const list = zapisy || NS.store.get().bjTrace || [];
    return list.map(z => {
      const hlava = '=== ' + new Date(z.at).toLocaleString('cs-CZ')
        + ' — ' + (z.vysledek || 'nedokončeno') + ' (' + z.kroku + ' kroků)';
      const radky = z.kroky.map(k => {
        const { ms, co, ...zbytek } = k;
        const detail = Object.entries(zbytek)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([a, v]) => a + '=' + (typeof v === 'object' ? JSON.stringify(v) : v))
          .join(' ');
        return '  +' + String(ms).padStart(6) + ' ms  ' + String(co).padEnd(22) + ' ' + detail;
      });
      return [hlava, ...radky].join('\n');
    }).join('\n\n');
  }

  const PRAZDNY = {
    rounds: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0,
    // kola, u kterých se nepřečetl výsledek – do bilance se nepočítají
    neurcite: 0,
    staked: 0, won: 0, lossRun: 0, maxLossRun: 0,
    byAkci: {}, firstAt: null, lastAt: null, recent: []
  };
  const RECENT_MAX = 200;

  /* ---- karty a strategie -------------------------------------------------- */

  /** „10♣“ → { value: '10', suit: '♣', weight: 10 }. */
  function parseKartu(text) {
    const t = String(text || '').replace(/\s+/g, '');
    const m = t.match(/^(10|[2-9]|[JQKA])(.*)$/);
    if (!m) return null;
    const v = m[1];
    const weight = v === 'A' ? 11 : (/^(J|Q|K)$/.test(v) ? 10 : +v);
    return { value: v, suit: m[2] || '', weight };
  }

  /**
   * Karty v řadě. Rubová (`card-back`) se vynechává – tu neznáme.
   *
   * !!! DVĚ KROKY, NE SLOŽENÝ SELEKTOR !!!
   * `box.querySelectorAll('#blackjack_player-cards .blackjack_card')` se
   * vyhodnocuje proti CELÉMU dokumentu, takže když je stejné ID i v herním okně
   * (otevřená budova 18), padne na tu druhou kopii a karty se v našem okně
   * nenajdou. Nejdřív se tedy najde kontejner v boxu, pak karty v něm.
   */
  function karty(box, sel) {
    const kont = box.querySelector(sel);
    if (!kont) return [];
    return Array.from(kont.querySelectorAll('.blackjack_card'))
      .filter(el => !el.classList.contains('blackjack_card-back'))
      .map(el => parseKartu((el.querySelector('.blackjack_rank-top') || {}).textContent))
      .filter(Boolean);
  }

  /**
   * Je ruka „soft“, tedy s esem počítaným za 11? Pozná se z porovnání se
   * součtem, který spočítal server: kdyby se to počítalo znovu vlastními
   * silami, stačilo by se splést v esech a strategie by rozhodovala naslepo.
   */
  function jeSoft(ruka, score) {
    if (!ruka.some(k => k.value === 'A')) return false;
    /*
     * Nejde sečíst esa po jedenácti a porovnat – A+A je soft 12 (jedno za 11,
     * druhé za 1) a takový součet by dal 22. Soft je ruka, kde se PRÁVĚ JEDNO
     * eso počítá za 11, tedy skóre je o 10 vyšší než součet se všemi esy za 1.
     */
    const tvrdy = ruka.reduce((s, k) => s + (k.value === 'A' ? 1 : k.weight), 0);
    return score === tvrdy + 10;
  }

  /**
   * Součet ruky spočítaný z karet, s esy správně (11 → 1, dokud se to nevejde).
   *
   * !!! NUTNÁ ZÁLOHA, NE LUXUS !!!
   * Hra občas nemá `#blackjack_player-score` naplněné a `toNum('')` z toho udělá
   * NULU – naživo se to stalo ve dvou kolech z pěti a strategie podle „0“
   * dobírala na sedmnáctce a přebrala. Když číslo ze hry nedává smysl, počítá se
   * z karet, které jsou v okně vidět.
   */
  function soucetKaret(karty) {
    let s = 0;
    let esa = 0;
    for (const k of karty) {
      s += k.weight;
      if (k.value === 'A') esa++;
    }
    while (s > 21 && esa > 0) { s -= 10; esa--; }
    return s;
  }

  /**
   * ZÁKLADNÍ STRATEGIE pro hit/stand-only, dealer stojí na 17.
   * Vrací 'hit' | 'stand'. Tabulka je pro tuhle variantu, ne opsaná z běžného
   * blackjacku – bez double se hraje jinak (třeba 11 se prostě dobírá).
   */
  function rozhodni(score, soft, dealerWeight) {
    const d = dealerWeight;                 // 2–11 (eso = 11)
    if (soft) {
      if (score >= 19) return 'stand';
      // soft 18: stát proti 2–8, dobírat proti 9, 10 a esu (nemám co ztratit)
      if (score === 18) return (d >= 9) ? 'hit' : 'stand';
      return 'hit';                          // soft 17 a méně vždy
    }
    if (score >= 17) return 'stand';
    if (score >= 13) return (d >= 7) ? 'hit' : 'stand';   // 13–16 proti silné kartě
    if (score === 12) return (d >= 4 && d <= 6) ? 'stand' : 'hit';
    return 'hit';                            // 11 a méně nelze přebrat
  }

  /* ---- stav v okně -------------------------------------------------------- */

  const viditelne = el => !!el && !el.classList.contains('blackjack_hidden');
  const num = el => (el ? NS.parse.toNum(el.textContent) : null);

  /**
   * Co je právě v okně: fáze, součet, karty, výsledek.
   *
   * !!! TITULEK SÁM NESTAČÍ !!!
   * `blackjack_resetBoard()` okno s výsledkem jen SCHOVÁ (`fadeOut`) – text
   * v `#blackjack_msg-title` tam zůstane. Kdo bere konec kola jen z titulku,
   * má ho po prvním kole napořád: naživo se druhé kolo zaseklo přesně na tomhle.
   * Konec je proto „titulek je tam A okno není schované“.
   */
  function stav(box) {
    const msgEl = box.querySelector(S.msg);
    const titul = (box.querySelector(S.msgTitle) || {}).textContent || '';
    const schovano = !!msgEl && (
      ((msgEl.style && msgEl.style.display) || '') === 'none'
      || msgEl.classList.contains('blackjack_hidden'));
    const konec = !!titul.trim() && !schovano;
    const hraciKarty = karty(box, S.pCards);
    const scoreDom = num(box.querySelector(S.pScore));
    const scoreKarty = hraciKarty.length ? soucetKaret(hraciKarty) : null;
    /*
     * !!! KARTY MAJÍ PŘEDNOST PŘED ČÍSLEM ZE HRY !!!
     * Karty v okně jsou fakt; `#blackjack_player-score` je jen text, který hra
     * dopisuje se zpožděním – a když ho nestihne, je prázdný (naživo ve dvou
     * kolech z pěti). Vlastní součet z karet je okamžitý a počítá esa stejně
     * jako hra, takže se bere jako hlavní. Číslo ze hry slouží ke KONTROLE.
     */
    const score = scoreKarty != null ? scoreKarty
      : ((scoreDom != null && scoreDom >= 4) ? scoreDom : null);
    const hraci = hraciKarty;
    const dealer = karty(box, S.dCards);
    return {
      faze: viditelne(box.querySelector(S.play)) ? 'hra' : 'sazka',
      konec,
      titul: konec ? titul.replace(/\s+/g, ' ').trim() : '',
      titulVDom: titul.replace(/\s+/g, ' ').trim(),
      schovano,
      podtitul: ((box.querySelector(S.msgSub) || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      score,
      scoreDom,
      scoreKarty,
      // rozpor se hlásí – buď hra nestíhá, nebo se karty čtou špatně
      rozporScore: scoreDom != null && scoreDom >= 4 && scoreKarty != null
        && scoreDom !== scoreKarty,
      hraci, dealer,
      dealerUp: dealer.length ? dealer[0] : null,
      sazka: num(box.querySelector(S.bet)),
      msgEl
    };
  }

  /** Titulek → výsledek kola. */
  function vysledek(titul) {
    const v = VYSLEDKY.find(x => x.re.test(titul));
    return v || { nasobek: null, jmeno: 'neznámý' };
  }

  /**
   * Počká, až se okno USTÁLÍ: dvě stejná čtení po sobě (titulek, součet, počet
   * karet) a splněná podmínka postupu. Čekat na „změnu součtu“ nestačí – hra
   * překresluje po částech a naživo se to zaseklo na tom, že se hodnota, na
   * kterou se čeká, objevila v jiném pořadí, než jsem čekal. Ustálený stav je
   * jediné, co se dá spolehlivě poznat zvenčí.
   */
  async function ustaleny(box, hotovo, ms = 14000) {
    let posledni = null;
    let stejne = 0;
    const konec = Date.now() + ms;
    while (Date.now() < konec) {
      const n = stav(box);
      const podpis = n.titul + '|' + n.score + '|' + n.hraci.length + '|' + n.dealer.length;
      if (podpis === posledni) stejne++;
      else { stejne = 0; posledni = podpis; }
      if (stejne >= 1 && hotovo(n)) return n;
      await sleep(250);
    }
    return null;
  }

  const cekat = async (fn, ms = 12000, krok = 200) => {
    const konec = Date.now() + ms;
    while (Date.now() < konec) {
      const v = fn();
      if (v) return v;
      await sleep(krok);
    }
    return null;
  };

  /** Klik na prvek, až přestane být zakázaný (hra si tlačítka blokuje sama). */
  async function klikni(box, sel, ms = 8000) {
    const el = await cekat(() => {
      const e = box.querySelector(sel);
      return e && !e.classList.contains('disabled') && !e.disabled ? e : null;
    }, ms);
    if (!el) {
      krok('klik SELHAL', { sel, stav: tlacitko(box, sel) });
      throw new Error('tlačítko ' + sel + ' se neuvolnilo');
    }
    krok('klik', { sel });
    el.click();
    return el;
  }

  /* ---- jedno kolo --------------------------------------------------------- */

  /** Naskládá sázku z žetonů (odspodu největšími). Vrací, co se povedlo složit. */
  async function nasadit(box, cil) {
    const clear = box.querySelector(S.clear);
    if (clear) { clear.click(); await sleep(120); }
    let zbyva = Math.max(MIN_SAZKA, Math.round(cil / MIN_SAZKA) * MIN_SAZKA);
    let vlozeno = 0;
    const chipy = zetony(box);
    if (!chipy.length) throw new Error('žetony v okně blackjacku nejsou');
    krok('sázím', { cil: zbyva, zetony: chipy.map(c => c[0]).join('/'),
      dealPred: tlacitko(box, S.deal) });
    for (const [hodnota, cls] of chipy) {
      while (zbyva >= hodnota) {
        /*
         * !!! BEZ PREFIXU `#blackjack ` !!!
         * Složený selektor `#blackjack .chip` se vyhodnocuje proti celému
         * dokumentu, takže když je budova 18 otevřená i v herním okně, `#blackjack`
         * padne na TEN druhý a žeton v našem okně se nenajde. Uvnitř boxu stačí
         * hledat samotnou třídu.
         */
        const chip = box.querySelector('.' + cls);
        if (!chip) break;
        chip.click();
        await sleep(70);
        zbyva -= hodnota;
        vlozeno += hodnota;
      }
    }

    /*
     * Kontrola, že to hra vzala. Když se sázka nepohnula, je zbytečné čekat
     * osm sekund na „HRÁT“, které se nikdy neuvolní – tohle je ta chyba, co
     * vypadala jako problém s tlačítkem, a přitom šlo o neoživený fragment.
     */
    const videna = NS.parse.toNum((box.querySelector(S.bet) || {}).textContent);
    const zHry = await mainVolej('bj-stav', 1200);
    krok('vsazeno', { chtel: vlozeno, vidiHra: videna, deal: tlacitko(box, S.deal),
      hraEviduje: zHry ? zHry.bet : 'bez odpovědi', busy: zHry ? zHry.busy : null });
    if (vlozeno && videna === 0) {
      throw new Error('hra sázku nepřijala (v okně je 0) – zkusím znovu');
    }
    /*
     * !!! CO HRA EVIDUJE, MUSÍ SEDĚT NA KORUNU !!!
     * Hlídala se jen nula, takže špatně oceněné žetony prošly bez povšimnutí –
     * hra vsadila 9 000, modul si zapsal 2 000, a protože z téhož čísla počítá
     * i výhru, panel ukazoval normální návratnost. Kolo, jehož sázku neznáme,
     * se hrát nesmí.
     */
    if (vlozeno && videna != null && videna !== vlozeno) {
      if (clear) { clear.click(); await sleep(120); }
      throw new Error('hra eviduje jinou sázku (' + videna + ' 💎) než chci ('
        + vlozeno + ' 💎) – kolo se nehraje');
    }
    return vlozeno;
  }

  /**
   * Připraví okno na nové kolo. Fragment může přijít v jakémkoli stavu, protože
   * hru drží server: buď rozehraná (pak se dohraje strategií, jinak by tam
   * uvízla), nebo dokončená s titulkem (pak stačí „Nová hra“).
   */
  async function pripravKolo(box) {
    let s = stav(box);
    krok('okno při otevření', snimek(box));
    if (s.konec) return await doSazkove(box);
    if (s.faze === 'hra' && s.score != null && s.dealerUp) {
      // rozehrané kolo se dohraje – nedohrané by blokovalo všechna další
      await dohrajRuku(box, s, []);
      return await doSazkove(box);
    }
    return s;
  }

  /**
   * Klikne „Nová hra“ a počká na sázkovou fázi (ne na zmizení titulku, ten
   * zůstává v DOM).
   *
   * !!! ZKOUŠÍ TO DVAKRÁT !!!
   * Naživo se stalo, že po VYHRANÉM kole klik proběhl (log to potvrdil), ale
   * okno v sázkové fázi neskončilo. U prohry se to nestávalo – rozdíl je, že
   * při výhře hra pouští `coinShower()`. Příčinu nemám potvrzenou, takže druhý
   * pokus doplní uvolnění zaseknutého `blackjack_isBusy`; kdyby to viselo na
   * něm, tímhle se to rozjede, a když ne, log ukáže oba pokusy.
   */
  async function doSazkove(box) {
    for (let pokus = 1; pokus <= 2; pokus++) {
      if (pokus === 2) {
        const u = await mainVolej('bj-unlock', 1200);
        krok('uvolnění příznaku', { busy: u ? u.busy : 'bez odpovědi' });
      }
      await klikni(box, S.restart);
      const s = await ustaleny(box, n => n.faze === 'sazka' && !n.konec, 8000);
      if (s) {
        krok('zpět v sázkové fázi', { sazkaVOkne: s.sazka, pokus });
        return s;
      }
      krok('nová hra SELHALA', { pokus, ...snimek(box) });
    }
    throw new Error('okno se nevrátilo do sázkové fáze (2 pokusy)');
  }

  /**
   * Dobírá/stojí podle strategie, dokud kolo neskončí. Zapisuje tahy.
   *
   * !!! ČEKÁ SE NA PŘEPOČÍTANÉ SKÓRE, NE JEN NA NOVOU KARTU !!!
   * Hra kartu dokreslí dřív, než přepíše součet, takže „karta přišla“ ještě
   * neznamená „vím, kolik mám“. Když se čekalo jen na kartu, strategie
   * rozhodovala podle STARÉHO součtu – naživo to vzalo kartu na 21 a přebralo
   * (2+7+7+5 = 21, a přišla ještě šestka). Proto se čeká, dokud se skóre
   * skutečně nezmění; když se nezmění vůbec, je něco rozbité a je lepší to
   * přiznat než hrát podle zastaralého čísla.
   */
  async function dohrajRuku(box, s, tahy) {
    let kroku = 0;
    while (!s.konec && kroku++ < 12) {
      /*
       * Pojistka: bez smysluplného součtu se NEROZHODUJE. Radši chyba než tah
       * podle nuly – přesně tím se naživo přebralo na sedmnáctce.
       */
      if (!(s.score >= 4 && s.score <= 30)) {
        krok('nesmyslný součet', { ...snimek(box) });
        throw new Error('nečitelný součet ruky (' + s.score + ') – nehraju naslepo');
      }
      const soft = jeSoft(s.hraci, s.score);
      const co = rozhodni(s.score, soft, s.dealerUp.weight);
      tahy.push(co + '@' + s.score + (soft ? 's' : '') + 'v' + s.dealerUp.value);
      krok('rozhodnutí', { akce: co, score: s.score, soft, dealerUp: s.dealerUp.value,
        moje: s.hraci.map(k => k.value + k.suit).join(' ') });

      const pocetPred = s.hraci.length;
      await klikni(box, co === 'hit' ? S.hit : S.stand);
      if (co === 'stand') {
        const po = await ustaleny(box, n => n.konec, 18000);
        if (!po) krok('po stání NEDOŠLO k závěru', snimek(box));
        s = po || stav(box);
        break;
      }

      /*
       * !!! ČEKÁ SE NA NOVOU KARTU, NE NA ZMĚNU SOUČTU !!!
       * Součet se po dobrání změnit NEMUSÍ: A+2 je měkkých 13 a po desítce je
       * to 1+2+10 = zase 13, protože eso spadne z jedenáctky na jedničku.
       * Podmínka na změnu čísla proto naživo zasekla dvě kola z pěti. Nová karta
       * v okně je jednoznačná a součet se z karet dopočítá sám.
       */
      const novy = await ustaleny(box, n =>
        n.konec || (n.hraci.length > pocetPred && n.score >= 4));
      if (!novy) {
        krok('dobrání SELHALO', { karetPred: pocetPred, ...snimek(box) });
        throw new Error('hra nepřidala kartu po kliknutí na „Vzít kartu“');
      }
      krok('po dobrání', { score: novy.score, zeHry: novy.scoreDom,
        zKaret: novy.scoreKarty, rozpor: novy.rozporScore || undefined,
        moje: novy.hraci.map(k => k.value + k.suit).join(' '), konec: novy.konec });
      s = novy;
    }
    return s;
  }

  /* ---- most do hlavního světa --------------------------------------------- */

  /*
   * !!! PROČ TO NEJDE BEZ TOHOTO !!!
   * Fragment budovy nese inline skript, který hře inicializuje proměnné
   * (`blackjack_currentBet`, `blackjack_isBusy`) a zavolá `blackjackUpdateUI()`.
   * `innerHTML` skripty nespouští a izolovaný svět do proměnných hlavního světa
   * nedosáhne. Pokus vyrobit `<script>` znovu se NEOSVĚDČIL – v ostrém provozu
   * se sázka dál nezapočítala (log: „oživení skriptu=2“ → „vsazeno … vidiHra=0“).
   *
   * Proto je v `world: "MAIN"` deklarovaný `main-world.js`, který to udělá
   * a POTVRDÍ. Když potvrzení nepřijde, ví se, že tam ten skript neběží –
   * místo aby to spadlo o dva kroky dál na „tlačítko se neuvolnilo“.
   */
  const DOTAZ = 'cmc-main-req';
  const ODPOVED = 'cmc-main-res';
  let dotazId = 0;

  const maMainWorld = () => document.documentElement.getAttribute('data-cmc-main') === '1';

  function mainVolej(co, ms = 2000) {
    return new Promise(resolve => {
      const id = 'bj' + (++dotazId);
      let hotovo = false;
      const posluchac = ev => {
        const d = (ev && ev.detail) || {};
        if (d.id !== id) return;
        hotovo = true;
        document.removeEventListener(ODPOVED, posluchac);
        resolve(d);
      };
      document.addEventListener(ODPOVED, posluchac);
      document.dispatchEvent(new CustomEvent(DOTAZ, { detail: { id, co } }));
      setTimeout(() => {
        if (hotovo) return;
        document.removeEventListener(ODPOVED, posluchac);
        resolve(null);
      }, ms);
    });
  }

  /** Inicializuje hru v hlavním světě. Vrací, co odpověděl `main-world.js`. */
  async function oziv() {
    if (!maMainWorld()) {
      krok('oživení SELHALO', { duvod: 'main-world.js neběží – reloadni rozšíření i stránku' });
      throw new Error('pomocník v hlavním světě neběží – po reloadu rozšíření'
        + ' obnov i stránku hry (F5)');
    }
    const r = await mainVolej('bj-init');
    if (!r || !r.ok) {
      krok('oživení SELHALO', { odpoved: r ? r.err : 'bez odpovědi' });
      throw new Error('hru nešlo inicializovat: ' + (r ? r.err : 'hlavní svět neodpověděl'));
    }
    krok('oživení', { bet: r.bet, busy: r.busy, maUpdateUI: r.maUpdateUI });
    return r;
  }

  /** Jedno kolo v už vloženém okně. */
  async function odehrajKolo(box, sazka) {
    const diamantyPred = readPoints();
    const tahy = [];

    const vlozeno = await nasadit(box, sazka);
    if (!vlozeno) throw new Error('sázku nejde složit z žetonů');

    await klikni(box, S.deal);

    /*
     * Rozdání: čeká se, až se okno ustálí (animace karet trvá ~1 s). Delší limit
     * je tady schválně – v tomhle místě už je sázka na serveru STRŽENÁ, takže
     * vzdát se moc brzy znamená propadlou sázku bez odehraného kola.
     */
    const rozdano = await ustaleny(box, s =>
      (s.score >= 4 && s.hraci.length >= 2 && s.dealerUp) || s.konec, 20000);
    if (!rozdano) {
      krok('rozdání SELHALO', snimek(box));
      throw new Error('hra nevykreslila rozdání – sázka ' + vlozeno
        + ' 💎 mohla propadnout');
    }
    krok('rozdáno', { score: rozdano.score, zeHry: rozdano.scoreDom,
      zKaret: rozdano.scoreKarty, rozpor: rozdano.rozporScore || undefined,
      moje: rozdano.hraci.map(k => k.value + k.suit).join(' '),
      dealerUp: rozdano.dealerUp ? rozdano.dealerUp.value + rozdano.dealerUp.suit : null });

    await dohrajRuku(box, rozdano, tahy);

    // konec kola: hra napíše titulek („Blackjack“, „Vyhrál jsi!“, …)
    const finalni = await cekat(() => {
      const n = stav(box);
      return n.konec ? n : null;
    }, 15000) || stav(box);

    krok('závěr', snimek(box));
    const v = vysledek(finalni.titul);
    const vraceno = v.nasobek != null ? Math.round(vlozeno * v.nasobek) : null;

    /*
     * !!! HUD SE NA VÝSLEDEK POUŽÍT NEDÁ !!!
     * Diamanty přitékají i odjinud – šachty, mzda a nevěstinec běží zároveň,
     * takže rozdíl v HUD může být cokoli. Naživo z toho vyšlo „neznámý +15 💎“
     * u kola se sázkou 10. Bere se tedy jen jako VODÍTKO do logu; když se
     * výsledek nepřečte z titulku, kolo se přizná jako neurčité a do bilance
     * se nepočítá.
     */
    const diamantyPo = readPoints();
    const podleHud = (diamantyPred != null && diamantyPo != null)
      ? (diamantyPo - diamantyPred) + vlozeno
      : null;
    if (vraceno == null) {
      krok('výsledek NEPŘEČTEN', { titul: finalni.titul, hudVodítko: podleHud, ...snimek(box) });
    }

    return {
      sazka: vlozeno,
      vysledek: v.jmeno,
      nasobek: v.nasobek,
      // null = nevíme; do bilance se takové kolo nepočítá (viz `log`)
      vraceno,
      neurcity: vraceno == null,
      titul: finalni.titul,
      score: finalni.score,
      // výchozí situace: podle ní se hraje, takže podle ní se to i vyhodnocuje
      start: rozdano.score,
      startSoft: jeSoft(rozdano.hraci, rozdano.score),
      hraci: finalni.hraci.map(k => k.value).join('+'),
      dealer: finalni.dealer.map(k => k.value).join('+'),
      dealerUp: rozdano.dealerUp ? rozdano.dealerUp.value : null,
      tahy: tahy.join(' '),
      hud: podleHud,
      rozporScore: finalni.rozporScore || false
    };
  }

  /** Otevře kasino v herním okně a vrátí vložený box. */
  async function otevri() {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const { status, raw } = await NS.parse.apiGetTry(BUILDING);
    /* výpadek se zkusí znovu – jedno 404 nesmí vypnout automatiku, viz apiGetTry */
    if (status !== 200) throw new Error('kasino nelze přečíst (HTTP ' + status + ', opakováno)');
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-bj-box';
    box.innerHTML = raw;
    host.appendChild(box);
    await oziv();
    await sleep(300);
    if (!box.querySelector(S.root)) {
      box.remove();
      throw new Error('blackjack v okně není');
    }
    return box;
  }

  /** Jedno kolo od začátku do konce (otevřít, zahrát, zavřít). */
  async function playRound(sazka) {
    traceNove({ sazka, diamanty: readPoints() });
    let box = null;
    try {
      /*
       * `otevri()` musí být uvnitř `try`: když selže oživení, je to přesně ta
       * chyba, kvůli které se kolo nerozjede – a bez zápisu by z logu zmizela.
       */
      box = await otevri();
      await pripravKolo(box);
      const r = await odehrajKolo(box, sazka);
      krok('hotovo', { vysledek: r.vysledek, vraceno: r.vraceno, tahy: r.tahy });
      await traceUloz(r.vysledek + ' ' + NS.fmt.signed((r.vraceno || 0) - r.sazka, '💎'));
      return r;
    } catch (e) {
      krok('CHYBA', { zprava: e.message });
      await traceUloz('CHYBA: ' + e.message);
      throw e;
    } finally {
      if (box) box.remove();
    }
  }

  /** Diamanty z HUD (bez požadavku do hry). */
  function readPoints() {
    const el = document.querySelector('.value.renew-points');
    return el ? NS.parse.toNum(el.textContent) : null;
  }

  /* ---- záznam ------------------------------------------------------------- */

  async function log(r) {
    const cur = { ...PRAZDNY, ...(NS.store.get().bjLog || {}) };
    const vyhral = r.nasobek != null && r.nasobek > 1;
    const push = r.nasobek === 1;
    const bezVyhry = vyhral ? 0 : (push ? cur.lossRun : (cur.lossRun || 0) + 1);
    /*
     * Kolo, u kterého se nepřečetl výsledek, se do vsazeno/vráceno NEPOČÍTÁ –
     * jinak by návratnost lhala. Vede se zvlášť, ať je vidět, kolik jich je.
     */
    if (r.neurcity) {
      await NS.store.put('bjLog', {
        ...cur,
        rounds: cur.rounds + 1,
        neurcite: (cur.neurcite || 0) + 1,
        lastAt: Date.now(),
        firstAt: cur.firstAt || Date.now(),
        recent: [{
          at: Date.now(), sazka: r.sazka, vraceno: null, vysledek: 'neurčité',
          score: r.score, start: r.start, startSoft: r.startSoft,
          hraci: r.hraci, dealer: r.dealer, dealerUp: r.dealerUp, tahy: r.tahy
        }, ...(cur.recent || [])].slice(0, RECENT_MAX)
      });
      return;
    }

    const a = { n: 0, ...(cur.byAkci[r.vysledek] || {}) };
    await NS.store.put('bjLog', {
      rounds: cur.rounds + 1,
      wins: cur.wins + (vyhral ? 1 : 0),
      pushes: cur.pushes + (push ? 1 : 0),
      losses: cur.losses + (r.nasobek === 0 ? 1 : 0),
      blackjacks: cur.blackjacks + (r.vysledek === 'blackjack' ? 1 : 0),
      staked: cur.staked + r.sazka,
      won: cur.won + (r.vraceno || 0),
      lossRun: bezVyhry,
      maxLossRun: Math.max(cur.maxLossRun || 0, bezVyhry),
      byAkci: { ...cur.byAkci, [r.vysledek]: { n: a.n + 1 } },
      firstAt: cur.firstAt || Date.now(),
      lastAt: Date.now(),
      recent: [{
        at: Date.now(), sazka: r.sazka, vraceno: r.vraceno || 0,
        vysledek: r.vysledek, score: r.score, start: r.start, startSoft: r.startSoft,
        hraci: r.hraci, dealer: r.dealer, dealerUp: r.dealerUp, tahy: r.tahy,
        rozpor: r.rozpor ? { titul: r.titul, hud: r.hud } : undefined
      }, ...(cur.recent || [])].slice(0, RECENT_MAX)
    });
  }

  function stats() {
    const s = { ...PRAZDNY, ...(NS.store.get().bjLog || {}) };
    return {
      ...s,
      net: s.won - s.staked,
      rtp: s.staked > 0 ? (s.won / s.staked) * 100 : null,
      winRate: s.rounds > 0 ? (s.wins / s.rounds) * 100 : null,
      pushRate: s.rounds > 0 ? (s.pushes / s.rounds) * 100 : null,
      bjRate: s.rounds > 0 ? (s.blackjacks / s.rounds) * 100 : null,
      avgStake: s.rounds > 0 ? s.staked / s.rounds : null
    };
  }

  /* ---- rozpis podle situací ------------------------------------------------ */

  /*
   * Strategie je pro daná pravidla optimum, takže tímhle se nezlepší – slouží
   * k něčemu jinému: ověřit, že hra není v konkrétních situacích zaujatá, a
   * vidět, kde bere nejvíc. Sdružuje se do skupin, protože jednotlivých kombinací
   * (16 součtů × 10 karet dealera) je tolik, že by v každé bylo pár kol a jen šum.
   */
  const SKUPINY = [
    { key: 'bj', label: 'blackjack', test: (s, soft, bj) => bj },
    { key: 'soft', label: 'měkká ruka (s esem)', test: (s, soft) => soft },
    { key: '4-8', label: 'tvrdá 4–8', test: s => s >= 4 && s <= 8 },
    { key: '9-11', label: 'tvrdá 9–11', test: s => s >= 9 && s <= 11 },
    { key: '12-16', label: 'tvrdá 12–16', test: s => s >= 12 && s <= 16 },
    { key: '17+', label: 'tvrdá 17+', test: s => s >= 17 }
  ];

  const DEALER_KAT = [
    { key: '2-6', label: 'slabá (2–6)', test: w => w >= 2 && w <= 6 },
    { key: '7-9', label: 'střední (7–9)', test: w => w >= 7 && w <= 9 },
    { key: '10', label: 'desítka (10, J, Q, K)', test: w => w === 10 },
    { key: 'A', label: 'eso', test: w => w === 11 }
  ];

  /** Počáteční součet: uložený, nebo dopočítaný ze zapsaných tahů. */
  function startZeZapisu(z) {
    if (z.start != null) return { start: z.start, soft: !!z.startSoft };
    /*
     * Starší záznamy `start` nemají, ale je v tazích: „hit@13v5“ nese součet
     * i to, že byl měkký („18s“). Bez toho by se historie musela zahodit.
     */
    const m = String(z.tahy || '').match(/@(\d+)(s?)/);
    if (m) return { start: +m[1], soft: m[2] === 's' };
    // žádné tahy = kolo skončilo hned, tedy blackjack
    return { start: 21, soft: true };
  }

  /** Sdruží kola podle výchozí situace. Bere jen kola s jasným výsledkem. */
  function situace(zapisy) {
    const list = (zapisy || (NS.store.get().bjLog || {}).recent || [])
      .filter(z => z.vraceno != null && z.sazka > 0);
    const prazdna = () => ({ n: 0, wins: 0, pushes: 0, staked: 0, won: 0 });
    const podleRuky = {};
    const podleDealera = {};
    const mrizka = {};

    for (const z of list) {
      const { start, soft } = startZeZapisu(z);
      const bj = z.vysledek === 'blackjack';
      const ruka = (SKUPINY.find(s => s.test(start, soft, bj)) || SKUPINY[SKUPINY.length - 1]).key;
      const w = z.dealerUp ? (parseKartu(z.dealerUp + '♠') || {}).weight : null;
      const dk = w != null ? (DEALER_KAT.find(d => d.test(w)) || {}).key : null;

      for (const [kam, klic] of [[podleRuky, ruka], [podleDealera, dk],
        [mrizka, ruka + '|' + dk]]) {
        if (!klic) continue;
        const c = kam[klic] || (kam[klic] = prazdna());
        c.n++;
        c.staked += z.sazka;
        c.won += z.vraceno;
        if (z.vysledek === 'remíza') c.pushes++;
        else if (z.vraceno > z.sazka) c.wins++;
      }
    }

    const dopln = o => {
      for (const k of Object.keys(o)) {
        const c = o[k];
        c.net = c.won - c.staked;
        c.rtp = c.staked > 0 ? (c.won / c.staked) * 100 : null;
        c.winRate = c.n > 0 ? (c.wins / c.n) * 100 : null;
      }
      return o;
    };
    return {
      kol: list.length,
      ruka: dopln(podleRuky),
      dealer: dopln(podleDealera),
      mrizka: dopln(mrizka),
      SKUPINY, DEALER_KAT
    };
  }

  const reset = () => NS.store.put('bjLog', { ...PRAZDNY });

  /* ---- sázka a hradla ----------------------------------------------------- */

  /**
   * Sázka je v DIAMANTECH, ne v korunách – proto vlastní klíč a vlastní rezerva.
   * Zaokrouhluje se na desítky, protože nejmenší žeton je 10 a sázka se z žetonů
   * skládá.
   */
  function nextStake() {
    const cfg = NS.store.get().read;
    const zadano = Math.max(MIN_SAZKA, Math.round(+cfg.bjStake || MIN_SAZKA));
    const zaklad = Math.max(MIN_SAZKA, Math.round(zadano / MIN_SAZKA) * MIN_SAZKA);
    const rezerva = Math.max(0, Math.round(+cfg.bjReserve || 0));
    const diamanty = readPoints();
    const dostupne = diamanty != null ? Math.max(0, diamanty - rezerva) : null;
    return {
      amount: zaklad, rezerva, diamanty, dostupne,
      zaokrouhleno: zaklad !== zadano,
      blokovano: dostupne != null && zaklad > dostupne
    };
  }

  const autoSet = () => String(NS.store.get().read.casinoAuto || '') === 'blackjack';
  /** Hrát po dohraném kole hned další? */
  const smyckaZapnuta = () => NS.store.get().read.bjLoop !== false;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  let autoRunning = false;
  let selhani = 0;
  const AUTO_MAX_FAILS = 3;

  /** Jedno kolo automaticky. Vrací true, když se hrálo. */
  async function autoTick() {
    if (autoRunning || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;

    const n = nextStake();
    if (n.blokovano) {
      NS.gym.setStatus('auto blackjack čeká: sázka ' + NS.fmt.gems(n.amount)
        + ' by šla pod rezervu ' + NS.fmt.gems(n.rezerva), true);
      return false;
    }

    autoRunning = true;
    try {
      NS.gym.setStatus('auto blackjack: hraju za ' + NS.fmt.gems(n.amount) + '…');
      const r = await NS.gym.withSuspend(() => playRound(n.amount));
      await log(r);
      selhani = 0;

      const s = stats();
      NS.gym.setStatus('blackjack: ' + r.vysledek
        + (r.vraceno ? ' +' + NS.fmt.gems(r.vraceno) : '')
        + ' · ' + s.rounds + '× · bilance ' + NS.fmt.signed(s.net, '💎')
        + (s.rtp != null ? ' (' + NS.fmt.pct(s.rtp) + ')' : ''),
        r.nasobek === 0);
      NS.gym.collect();
      naplanujDalsi();
      return true;
    } catch (e) {
      selhani++;
      if (selhani >= AUTO_MAX_FAILS) {
        await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus('⚠ auto blackjack vypnuto po ' + selhani + ' selháních: '
          + e.message, true);
        NS.gym.collect();
      } else {
        NS.gym.setStatus('⚠ blackjack: ' + e.message + ' (zkusím znovu)', true);
      }
      return false;
    } finally {
      autoRunning = false;
    }
  }

  /**
   * !!! SMYČKA PO DOHRANÉM KOLE !!!
   * Po kole se blackjack zařadí do fronty ZNOVU, na konec. Tím „projde smyčka“:
   * když mezitím něco čeká (trénink, zahrady, šachty…), dostane to přednost,
   * a až fronta nemá nic dalšího, hraje se další kolo. Dávka několika kol
   * v jednom průchodu by naopak frontu blokovala na desítky sekund.
   *
   * Bez smyčky se hraje jedno kolo na tik, tedy asi jedno za pět sekund.
   */
  function naplanujDalsi() {
    if (!smyckaZapnuta() || !autoOn() || !NS.queue) return;
    /*
     * Krátký odklad je nutný: v momentě téhle volby ještě běží tenhle úkol,
     * takže by ho fronta odmítla jako duplikát. 350 ms je zároveň pauza, ať se
     * hra nemlátí kolo za kolem bez dechu.
     */
    setTimeout(() => {
      if (!smyckaZapnuta() || !autoOn()) return;
      NS.queue.run('blackjack', () => autoTick()).catch(() => {});
    }, 350);
  }

  NS.blackjack = {
    playRound, odehrajKolo, pripravKolo, otevri, naplanujDalsi, smyckaZapnuta, ustaleny,
    traceText, snimek, TRACE_KOL, mainVolej, maMainWorld, oziv,
    get trace() { return trace.slice(); },
    /** Vypíše průběh posledních kol do konzole – na ladění za běhu. */
    dumpTrace() { const t = traceText(); console.log(t); return t; },
    clearTrace() { return NS.store.put('bjTrace', []); },
    log, stats, reset, nextStake, autoTick, autoSet, autoOn,
    rozhodni, jeSoft, parseKartu, soucetKaret, stav, vysledek, readPoints, nasadit,
    situace, startZeZapisu, SKUPINY, DEALER_KAT,
    BUILDING, zetony, MIN_SAZKA, PRAZDNY, RECENT_MAX, S,
    get autoRunning() { return autoRunning; },
    resetFails() { selhani = 0; }
  };
})();
