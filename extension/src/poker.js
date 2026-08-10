/* =============================================================================
 * poker.js – Casino Hold'em (#18)
 *
 * !!! NEHRÁT: ROZDÁNÍ JE VYCHÝLENÉ VE PROSPĚCH DEALERA (změřeno, +7 σ) !!!
 * Původně to tu stálo jako „jediná hra v kasinu s kladnou očekávanou hodnotou“.
 * To platilo, dokud se rozdávalo poctivě – dnes už ne, podrobně hned níž.
 *
 * Pravidla proměřená naživo (z odpovědí serveru, 18 kol):
 *   POST /map/building/casino/pokerPoints  {action:'deal', ante}
 *     → player_hand[2], community_cards[3] (flop), player_rank, ante
 *   POST …                                 {action:'decision', choice}
 *     → dealer_hand[2], new_community[2] (turn+river), player_rank,
 *       dealer_rank, title, sub, payout
 *
 *   „Pokračovat“ (check) → sázka zůstane ante
 *   „Vsadit 2×“  (bet2x) → sázka je 2× ante
 *   výhra platí 1:1 z celkové sázky, remíza vrací sázku, prohra bere vše
 *
 * !!! VÝPLATA NEZÁVISÍ NA SÍLE KOMBINACE !!!
 * Trojice platí stejně jako pár (změřeno). Nezáleží tedy na tom, jak silnou
 * ruku máš – jen na tom, jestli přebiješ dealera. Žádná kvalifikace dealera,
 * žádný bonus za postupku (u páru, dvou párů a trojice ověřeno; vyšší
 * kombinace se při měření nevyskytly, takže u nich bonus VYLOUČIT NEUMÍM).
 *
 * !!! ROZEHRANÉ KOLO SE NEDÁ OPUSTIT – ANTE PROPADNE (ověřeno) !!!
 * Fold ve hře není, takže kola s negativním navrchem se hrát MUSÍ. Nabízelo se,
 * že by se nevýhodné kolo dalo opustit bez rozhodnutí a ante by se vrátila –
 * pak by se hrála jen ta výhodná. Změřeno naživo dvakrát:
 *
 *   ante se strhne UŽ PŘI DEALU (27 490 → 27 480 💎)
 *   po obnovení stránky bez rozhodnutí zůstalo 27 480 → ante PROPADLA
 *   server rozehrané kolo nedrží (stůl čistý, ante 0, deal zamčený)
 *
 * Opustit kolo je tedy −1 ante, kdežto dohrát ho je −navrch, a navrch je vždy
 * ≥ −1. Dohrát je proto vždy aspoň tak dobré jako odejít, obvykle výrazně lepší
 * (v nejhorším pásmu je skutečné W−L −0,42, ne −1). ŽÁDNÁ MEZERA TU NENÍ.
 *
 * !!! VYCHÝLENÍ SE V ČASE MĚNÍ – MĚŘ HO, NEVĚŘ ČÍSLŮM NÍŽ !!!
 * Dvě sezení téhož dne, stejný kód, stejná strategie:
 *
 *   593 kol, ⌀ante 19   návratnost 88,3 %   vychýlení dealera +8,0 σ
 *   407 kol, ante 10    návratnost 101,6 %  vychýlení dealera +3,4 σ
 *
 * Když vychýlení zesláblo, zdvojování ztrátu zrovna vyrovnalo – hra pak stojí na
 * nule (+0,4 σ od ní), ne v plusu. Proto se `poctivost()` počítá průběžně: bez
 * ní se nedá říct, jestli má cenu hrát TEĎ.
 *
 * Zabudovat vychýlení do odhadu NEPOMÁHÁ (simulace 3 000 kol při síle 1,2×:
 * naivní odhad 107,9 %, poučený 108,2 %) – vychylka stlačuje všechny odhady
 * podobně, takže rozhodnutí změní jen u hraničních kol. Nemá smysl to dělat.
 *
 * !!! ROZDÁNÍ NENÍ POCTIVÉ – ZMĚŘENO !!!
 * Všechno níž platí za předpokladu, že dealerovy karty jsou náhodné. NEJSOU.
 * Permutační test na 804 kolech s kompletními kartami (devět karet kola lze
 * přeházet mezi hráče, stůl a dealera – při poctivém míchání může být kterákoli
 * dvojice dealerova):
 *
 *   vysoké karty (J,Q,K,A) dealerovi   632   čekáno 516   +7,0 σ
 *   tobě                               423   čekáno 516   −5,6 σ
 *   stůl (kontrola metody)             v normě
 *
 *   p-hodnota: 0 z 20 000 přeházení. Dealer dostal Q 178×, J 156×, A 153×;
 *   hráč pětku 157×, sedmičku 154×, dvojku 151×.
 *
 * Základní hra tím má −9,8 % na kolo (35,9 % výher proti 45,8 % proher) a žádné
 * rozhodování to nepřebije: na týchž kolech dalo „vždy Pokračovat“ 90,2 %,
 * skutečně hraná strategie 96,5 %. Zdvojování tedy POMÁHÁ (+6 pb), ale ztrátu
 * nesmaže. Proto to `poctivost()` počítá pořád a panel varuje „NEHRÁT“.
 *
 * Dřív to takhle nebylo: prvních ~2 253 kol mělo návratnost 111 % (+5 150 💎),
 * pak se to zlomilo na ~96 %. Rozdíl mezi obdobími je ~4 σ. Rané karty už v logu
 * nejsou, takže se poctivost tehdejšího rozdání dokázat nedá – ale zisk +5 150 💎
 * by ve hře s −9,8 % byl asi 10 σ, čili prakticky nemožný.
 *
 * !!! PROČ BY SE TU DALO VYDĚLAT (kdyby se rozdávalo poctivě) !!!
 * Hráč i dealer mají dvě karty a stejný board, takže hra je SYMETRICKÁ:
 * „vždy Pokračovat“ má očekávanou hodnotu nulu (simulace 20 000 kol: −0,7 %,
 * tedy šum). Cenu má jedině to rozhodnutí – zdvojnásobit sázku tam, kde jsem
 * po flopu favorit. Simulace:
 *
 *   vždy Pokračovat        EV −0,014 ante/kolo   návratnost  98,6 %
 *   zdvojit když favorit   EV +0,132 ante/kolo   návratnost 109,3 %
 *
 * (Dřív tu stálo 110,5 % – to bylo spočítané s plnými kickery, které ale hra
 *  neřeší. Podrobně u `porovnejHrou`.)
 *
 * Rozptyl je ale devítinásobek té výhody (σ ≈ 1,2 ante na kolo), takže na
 * dvaceti kolech rozhoduje štěstí a edge se prosadí až v řádu stovek kol:
 * šance na plus je po 20 kolech 69 %, po 100 kolech 86 %, po 500 kolech 99,3 %.
 *
 * !!! POZOR NA VELIKOST ANTE !!!
 * Výhoda i rozptyl rostou se sázkou lineárně, takže poměr zůstává – ale
 * v ABSOLUTNÍCH číslech kolísání roste. Kdo vydělá tisíce s malým ante a pak ho
 * zvýší desetinásobně, může celý dosavadní zisk smazat jedním horším úsekem,
 * protože ten úsek se počítá v desetinásobných jednotkách.
 *
 * !!! ROZHODUJE SE VÝPOČTEM, NE TABULKOU !!!
 * (Pozor: výpočet předpokládá náhodného dealera, což podle měření výš neplatí –
 *  odhady šancí jsou proto systematicky optimistické.)
 * Po flopu je známo pět karet ze sedmi. Zbytek (dealerovy dvě + turn + river)
 * se dosimuluje – několik tisíc náhodných dokončení dá šanci na výhru s dost
 * malou chybou, a protože je EV v okolí nuly plochá, na přesnosti prahu nesejde.
 * Nic se přitom neposílá do hry: je to čistý výpočet nad tím, co je v okně.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/18';
  const MIN_SAZKA = 10;

  /**
   * !!! NOMINÁLY ŽETONŮ SE ČTOU Z OKNA, NE Z TABULKY V KÓDU !!!
   * Tady byla natvrdo tabulka a TŘI ZE ŠESTI hodnot byly špatně:
   *
   *   třída               hra říká   bylo v kódu
   *   poker_chip-10x        1 000        500
   *   poker_chip-50x        5 000      1 000
   *   poker_chip-100x       9 000      2 000
   *
   * Názvy tříd k tomu vybízejí („10x“ jsem přečetl jako 10× ten nejmenší,
   * tedy 500), ale hra si hodnotu píše sama do `data-val` a do textu žetonu.
   * Důsledek byl vážný: ante 2 000 se složilo jedním kliknutím na `-100x`,
   * takže hra vsadila 9 000, kdežto modul si zapsal 2 000 – a protože se z téhož
   * čísla počítá i „vráceno“, návratnost v panelu vycházela normálně, zatímco
   * diamanty ubývaly čtyřapůlkrát rychleji. Při ante 3 000 by to bylo 14 000.
   *
   * Čtení z okna tuhle třídu chyb ruší úplně: hodnotu určuje hra, ne můj odhad.
   */
  const CHIP_TRIDA = /^poker_chip-/;

  function zetony(box) {
    const out = [];
    for (const el of box.querySelectorAll('[class*="poker_chip-"]')) {
      const cls = [...el.classList].find(c => CHIP_TRIDA.test(c));
      if (!cls) continue;
      // `data-val` je hodnota od hry; text žetonu je záloha (blackjack ho má jen tak)
      const v = NS.parse.toNum(el.getAttribute('data-val'))
        || NS.parse.toNum(el.textContent);
      if (v > 0) out.push([v, cls]);
    }
    // odspodu největšími, ať je kliknutí co nejmíň
    return out.sort((a, b) => b[0] - a[0]);
  }

  const S = {
    root: '#poker',
    bet: '#poker_ui-bet',
    decide: '#poker_ui-decide',
    deal: '#poker_btn-deal',
    clear: '#poker_btn-clear',
    check: '#poker_btn-check',
    bet2x: '#poker_btn-bet2x',
    reset: '#poker_btn-reset',
    overlay: '#poker_result-overlay',
    resTitle: '#poker_res-title',
    resDesc: '#poker_res-desc',
    pCards: '#poker_cards-p',
    cCards: '#poker_cards-c',
    dCards: '#poker_cards-d',
    pRank: '#poker_rank-p',
    dRank: '#poker_rank-d',
    ante: '#poker_ante-disp'
  };

  const VYSLEDKY = [
    { re: /remíz|push/i, jmeno: 'remíza' },
    { re: /vyhrál|výhra/i, jmeno: 'výhra' },
    { re: /prohrál|prohra/i, jmeno: 'prohra' }
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- karty a hodnocení --------------------------------------------------- */

  const RANKY = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const BARVY = ['♠', '♥', '♦', '♣'];

  /** „10♦“ → 0..51 (rank × 4 + barva). Vrací null, když to není karta. */
  function kodKarty(text) {
    const t = String(text || '').replace(/\s+/g, '');
    const m = t.match(/^(10|[2-9]|[JQKA])([♠♥♦♣])$/);
    if (!m) return null;
    const r = RANKY.indexOf(m[1]);
    const b = BARVY.indexOf(m[2]);
    return r < 0 || b < 0 ? null : r * 4 + b;
  }

  const popisKarty = c => RANKY[c >> 2] + BARVY[c & 3];

  /**
   * Hodnocení nejlepší pětice ze sedmi karet. Vrací pole, které se porovnává
   * po prvcích: [kategorie, …rozhodující ranky]. Kategorie 0 = nejvyšší karta,
   * 9 = královská postupka. Kickery se do výsledku počítají, ale POROVNÁVAJÍ se
   * jen první dvě složky – hra dál nekouká (viz `porovnejHrou`).
   */
  function hodnot(karty) {
    const pocty = new Array(13).fill(0);
    const barvy = [0, 0, 0, 0];
    const barvaMasky = [0, 0, 0, 0];
    let maska = 0;
    for (const c of karty) {
      const r = c >> 2;
      const b = c & 3;
      pocty[r]++;
      barvy[b]++;
      barvaMasky[b] |= 1 << r;
      maska |= 1 << r;
    }

    let barva = -1;
    for (let b = 0; b < 4; b++) if (barvy[b] >= 5) barva = b;
    if (barva >= 0) {
      const sf = postupka(barvaMasky[barva]);
      if (sf >= 0) return [sf === 12 ? 9 : 8, sf];
      return [5, ...nejvyssi(barvaMasky[barva], 5)];
    }

    const s = postupka(maska);
    const trojice = [];
    const pary = [];
    let ctverice = -1;
    for (let r = 12; r >= 0; r--) {
      if (pocty[r] === 4) ctverice = r;
      else if (pocty[r] === 3) trojice.push(r);
      else if (pocty[r] === 2) pary.push(r);
    }
    if (ctverice >= 0) return [7, ctverice, ...nejvyssi(maska & ~(1 << ctverice), 1)];
    if (trojice.length >= 2) return [6, trojice[0], trojice[1]];
    if (trojice.length === 1 && pary.length >= 1) return [6, trojice[0], pary[0]];
    if (s >= 0) return [4, s];
    if (trojice.length === 1) return [3, trojice[0], ...nejvyssi(maska & ~(1 << trojice[0]), 2)];
    if (pary.length >= 2) {
      return [2, pary[0], pary[1], ...nejvyssi(maska & ~(1 << pary[0]) & ~(1 << pary[1]), 1)];
    }
    if (pary.length === 1) return [1, pary[0], ...nejvyssi(maska & ~(1 << pary[0]), 3)];
    return [0, ...nejvyssi(maska, 5)];
  }

  /** Nejvyšší postupka v masce ranků – vrací její nejvyšší kartu, nebo −1. */
  function postupka(m) {
    for (let top = 12; top >= 4; top--) {
      const okno = 0b11111 << (top - 4);
      if ((m & okno) === okno) return top;
    }
    // A2345: eso se počítá i jako jednička, nejvyšší kartou je pětka
    return (m & 0b1000000001111) === 0b1000000001111 ? 3 : -1;
  }

  function nejvyssi(m, n) {
    const out = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if (m & (1 << r)) out.push(r);
    return out;
  }

  /**
   * !!! HRA IGNORUJE KICKERY !!!
   * Porovnává jen KATEGORII a JEDEN hlavní rank – „pár devítek“ proti „páru
   * devítek“ je remíza bez ohledu na zbytek karet, „nejvyšší karta A“ proti
   * „nejvyšší kartě A“ taky. Změřeno na 3 288 skutečných kolech: hra vykázala
   * 21,8 % remíz, kdežto hodnocení s plnými kickery dává 4,0 %. Ze čtyř
   * zkoušených hrubostí sedí jen tahle (22,8 % remíz, odchylka 1 pb):
   *
   *   jen kategorie          38,4 % remíz   (o 16,6 pb vedle)
   *   kategorie + 1 rank     22,8 % remíz   ← tak to hra dělá
   *   kategorie + 2 ranky    13,5 % remíz   (o 8,3 pb vedle)
   *   plné kickery            4,0 % remíz   (o 17,8 pb vedle)
   *
   * Odhad šance proto musí počítat TAKHLE, jinak rozhoduje podle jiné hry, než
   * se hraje: se kickery vyšlo EV +0,116 ante/kolo, podle pravidel hry +0,132.
   */
  /*
   * Kolik složek hodnocení hra porovnává. Ověřeno na 804 skutečných kolech
   * s kompletními kartami – shoda 99,6 % (3 neshody, všechny „postupka/barva
   * → hra řekla remíza“). Předchozí verze brala všude jen 2 složky, což dávalo
   * 97,8 %: hra u DVOU PÁRŮ porovnává i druhý pár.
   */
  const HLOUBKA = { 2: 3 };
  const hrube = h => h.slice(0, HLOUBKA[h[0]] || 2);

  /** −1 / 0 / +1 podle PRAVIDEL HRY (kategorie a hlavní rank/ranky). */
  function porovnejHrou(a, b) {
    if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1;
    return porovnej(hrube(a), hrube(b));
  }

  /** −1 / 0 / +1 – kdo má lepší ruku podle plného pokerového hodnocení. */
  function porovnej(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i] === undefined ? -1 : a[i];
      const y = b[i] === undefined ? -1 : b[i];
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }

  /* ---- odhad šance -------------------------------------------------------- */

  /** Kolik náhodných dokončení se zkouší. Víc = přesnější, ale pomalejší. */
  const VZORKU = 3000;

  /**
   * Šance po flopu. Dosimuluje neznámé: dealerovy dvě karty a turn s riverem.
   * Vrací podíl výher, proher a remíz – rozhoduje ROZDÍL výher a proher,
   * protože remíza vrací sázku, takže je neutrální.
   */
  function sance(moje, flop, vzorku) {
    const n = vzorku || VZORKU;
    const zname = new Set([...moje, ...flop]);
    const zbytek = [];
    for (let c = 0; c < 52; c++) if (!zname.has(c)) zbytek.push(c);

    let vyhry = 0;
    let prohry = 0;
    const vybrane = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      /*
       * Čtyři různé karty ze zbytku. Vybírá se prohazováním na konec – rychlejší
       * a bez opakování, což je u čtyř karet z ~47 podstatné.
       */
      const len = zbytek.length;
      for (let k = 0; k < 4; k++) {
        const j = k + ((Math.random() * (len - k)) | 0);
        const tmp = zbytek[k];
        zbytek[k] = zbytek[j];
        zbytek[j] = tmp;
        vybrane[k] = zbytek[k];
      }
      const board = [flop[0], flop[1], flop[2], vybrane[2], vybrane[3]];
      // podle pravidel hry, ne podle plného pokeru – viz `porovnejHrou`
      const c = porovnejHrou(
        hodnot([moje[0], moje[1], ...board]),
        hodnot([vybrane[0], vybrane[1], ...board]));
      if (c > 0) vyhry++;
      else if (c < 0) prohry++;
    }
    return {
      win: vyhry / n,
      lose: prohry / n,
      tie: (n - vyhry - prohry) / n,
      edge: (vyhry - prohry) / n,
      vzorku: n
    };
  }

  /**
   * Zdvojnásobit? Jen když jsem favorit – tedy když je šance na výhru vyšší než
   * na prohru. Prahování nad nulou dává skoro totéž (simulace: 0 %, +5 % i
   * +10 % vyjdou na +0,15 ante/kolo), takže je to nastavitelné, ne kritické.
   */
  function zdvojit(s, prah) {
    const p = Math.max(0, Math.min(50, prah == null ? 0 : prah)) / 100;
    return s.edge > p;
  }

  /**
   * Vyhodnocení měřicího režimu: poctivost a výsledek zvlášť pro každou
   * podmínku (výši ante) a zvlášť pro každý blok.
   *
   * Podmínky se srovnávají POMĚREM, ne σ – σ roste s odmocninou z počtu kol,
   * takže by podmínka s víc koly vypadala vychýleněji, i kdyby byla stejná.
   * Bloky jsou tam proto, aby bylo vidět, jestli vychýlení nejde spíš s časem
   * než s výší sázky: každá podmínka má několik bloků v různých okamžicích.
   */
  function mereniStats() {
    const s = NS.store.get().pkLog || {};
    const kola = (s.recent || []).filter(z => z.mBlok != null && z.mAnte != null);
    if (!kola.length) return { kol: 0, podminky: [], bloky: [] };

    const wl = z => (z.vysledek === 'výhra' ? 1 : (z.vysledek === 'prohra' ? -1 : 0));
    const souhrn = skupina => {
      const p = poctivostKol(skupina, 1);
      let sazkaAnte = 0, nettoAnte = 0;
      for (const z of skupina) {
        if (!z.ante || z.vysledek === 'neurčité') continue;
        const k = z.zdvojeno ? 2 : 1;
        sazkaAnte += k;
        nettoAnte += k * wl(z);
      }
      return {
        kol: skupina.length,
        pomer: p.dost ? p.pomer : null,
        sigma: p.dost ? p.sigmaDealer : null,
        dealer: p.dost ? p.dealer : null,
        cekano: p.dost ? p.cekano : null,
        nettoAnte,
        rtp: sazkaAnte ? (sazkaAnte + nettoAnte) / sazkaAnte * 100 : null
      };
    };

    const podleAnte = new Map();
    const podleBloku = new Map();
    for (const z of kola) {
      if (!podleAnte.has(z.mAnte)) podleAnte.set(z.mAnte, []);
      podleAnte.get(z.mAnte).push(z);
      if (!podleBloku.has(z.mBlok)) podleBloku.set(z.mBlok, []);
      podleBloku.get(z.mBlok).push(z);
    }
    return {
      kol: kola.length,
      podminky: [...podleAnte.entries()].sort((a, b) => a[0] - b[0])
        .map(([ante, k]) => ({ ante, ...souhrn(k) })),
      bloky: [...podleBloku.entries()].sort((a, b) => a[0] - b[0])
        .map(([blok, k]) => ({ blok, ante: k[0].mAnte, ...souhrn(k) }))
    };
  }

  /* ---- samoučící prah ------------------------------------------------------ */

  /*
   * !!! PRAHEM NENÍ NULA !!!
   * EV(Pokračovat) = navrch, EV(Vsadit 2×) = 2 × navrch, takže zdvojit se má
   * právě když je navrch KLADNÝ – ale jen pokud je odhad nezkreslený. Ten můj
   * zkreslený je, protože počítá s náhodným dealerem (viz měření výš), a měřeno
   * na 1 000 kolech NE ROVNOMĚRNĚ:
   *
   *   navrch −60…0 pb    odhad sedí (rozdíl +0,02 až +0,03)
   *   navrch  0…+40 pb   odhad je vedle o −0,33 až −0,38  ← past
   *   navrch +40…+80 pb  odhad zase sedí (−0,06 až −0,17)
   *
   * Mírná převaha je tedy ztrátová: v hraničních kolech rozhoduje, jestli dealer
   * chytne vysokou kartu, a ty on dostává navíc. U hotové silné ruky mu vysoká
   * karta nepomůže, a tam odhad platí.
   *
   * Prah proto nemá být 0, ale tam, kde SKUTEČNÉ W−L přechází nulou. Spočítá se
   * regresí z vlastní historie, takže se sám přizpůsobí, jak se vychýlení mění.
   * Poctivý test (prah z prvních 500 kol, použitý na dalších 500, která model
   * neviděl): prah 0 dal 99,9 %, naučený prah 101,4 %, prah +20 pb 102,5 %.
   */
  /*
   * !!! PRAH SE MĚŘÍ, NE EXTRAPOLUJE !!!
   * První verze hledala prah regresí jako bod, kde skutečné W−L přechází nulou
   * (−b0/b1), a vyplivla 1 169 pb. Nebyla to degenerace regrese, ale ZÁMĚNA
   * JEDNOTEK: `log()` ukládá navrch už v procentních bodech (45,0), a kód ho
   * násobil stem znovu. Skutečný odhad byl 11,7 pb; strop 45 pb tu chybu jen
   * zamaskoval a prah pak dělal strop, ne data. Proto se teď kandidáti prostě
   * vyhodnotí na vlastní historii – a proto je u každého porovnání s `edge`
   * poznámka, v čem to je.
   *
   * !!! JEN NEDÁVNÁ KOLA !!!
   * Optimální prah závisí na tom, jak je rozdání zrovna vychýlené, a to se mění
   * v řádu hodin (změřeno téhož dne +8,0 σ, +4,9 σ, +0,3 σ). Na týchž kolech:
   *
   *   poctivé rozdání (+0,3 σ)   prah 0 → 103,9 %   prah 45 → 100,4 %
   *   vychýlené (+3,3 a +4,9 σ)  prah 0 →  97,2 %   prah 20 → 100,1 %
   *
   * Prah nafitovaný na vychýlených kolech tedy v poctivém sezení bere zisk –
   * přesně to se stalo naživo. Proto se počítá z posledních `KALIB_OKNO` kol.
   */
  const KALIB_OKNO = 400;        // režim se mění po hodinách, ne po dnech
  const KALIB_MIN_KOL = 250;
  const KALIB_PRAHY = [0, 5, 10, 15, 20, 30, 45];

  /** Skutečné W−L jednoho kola: výhra +1, remíza 0, prohra −1. */
  const vysledekWL = z => (z.vysledek === 'výhra' ? 1 : (z.vysledek === 'prohra' ? -1 : 0));

  /** Bilance a obrat dané politiky na daných kolech, v jednotkách ante. */
  function vyhodnot(kola, prah) {
    let sazka = 0, netto = 0, zdvoj = 0;
    for (const z of kola) {
      // POZOR: `log()` ukládá navrch UŽ v procentních bodech (45,0), nenásobit!
      const zd = z.edge > prah;
      const k = zd ? 2 : 1;
      sazka += k;
      netto += k * vysledekWL(z);
      if (zd) zdvoj++;
    }
    return { sazka, netto, zdvoj, rtp: sazka ? (sazka + netto) / sazka * 100 : null };
  }

  function kalibrace() {
    const s = NS.store.get().pkLog || {};
    // `recent` je od nejnovějšího – bere se tedy jen čerstvé okno
    const kola = (s.recent || [])
      .filter(z => z.edge != null && z.vysledek && z.vysledek !== 'neurčité')
      .slice(0, KALIB_OKNO);
    const n = kola.length;
    if (n < KALIB_MIN_KOL) return { dost: false, kol: n };

    const zaklad = vyhodnot(kola, 0);
    let nej = { prah: 0, ...zaklad, rozdil: 0, sigma: 0 };
    const varianty = [{ prah: 0, ...zaklad }];

    for (const prah of KALIB_PRAHY.slice(1)) {
      const v = vyhodnot(kola, prah);
      varianty.push({ prah, ...v });
      /*
       * Šum se počítá jen z kol, kde se rozhodnutí LIŠÍ od prahu nula – jinde je
       * výsledek identický a do rozdílu nemluví. Každé takové kolo přispěje
       * nejvýš ±1 ante, takže směrodatná odchylka rozdílu ≈ √(počet lišících se).
       */
      const lisi = kola.filter(z => (z.edge > 0) !== (z.edge > prah)).length;
      const sigma = Math.sqrt(lisi);
      const rozdil = v.netto - zaklad.netto;
      // přepnout se smí jen na prah, který nulu překoná víc než o vlastní šum
      if (rozdil > sigma && rozdil > nej.rozdil) nej = { prah, ...v, rozdil, sigma };
    }
    return { dost: true, kol: n, okno: KALIB_OKNO, varianty, zaklad, ...nej };
  }

  /** Prah, který se má použít teď: naměřený, jinak nastavený v předvolbách. */
  function platnyPrah() {
    const k = kalibrace();
    if (k.dost) {
      return {
        prah: k.prah,
        zdroj: k.prah === 0
          ? 'nula (nic lepšího se z ' + k.kol + ' kol neprokázalo)'
          : 'naměřený z ' + k.kol + ' kol',
        kalib: k
      };
    }
    return { prah: NS.store.get().read.pkPrah || 0, zdroj: 'nastavený', kalib: k };
  }

  /* ---- diagnostický log --------------------------------------------------- */

  const TRACE_KOL = 12;   // víc historie – chyby se hledaly zpětně
  const TRACE_KROKU = 120;
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

  function tlacitko(box, sel) {
    const e = box.querySelector(sel);
    if (!e) return 'CHYBÍ';
    return (e.disabled ? 'disabled-attr ' : '')
      + (e.classList.contains('disabled') ? 'disabled-class ' : '') + 'ok';
  }

  function snimek(box) {
    const s = stav(box);
    return {
      faze: s.faze,
      konec: s.konec,
      titul: s.titul || null,
      moje: s.moje.map(popisKarty).join(' ') || null,
      board: s.board.map(popisKarty).join(' ') || null,
      dealer: s.dealer.map(popisKarty).join(' ') || null,
      mujRank: s.mujRank || null,
      dealerRank: s.dealerRank || null,
      anteVOkne: s.ante,
      tl: {
        deal: tlacitko(box, S.deal), check: tlacitko(box, S.check),
        bet2x: tlacitko(box, S.bet2x), reset: tlacitko(box, S.reset)
      }
    };
  }

  async function traceUloz(vysledek) {
    const stare = NS.store.get().pkTrace || [];
    await NS.store.put('pkTrace', [{
      at: Date.now(), vysledek: vysledek || null, kroku: trace.length, kroky: trace.slice()
    }, ...stare].slice(0, TRACE_KOL));
  }

  function traceText(zapisy) {
    const list = zapisy || NS.store.get().pkTrace || [];
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

  /* ---- stav okna ---------------------------------------------------------- */

  const num = el => (el ? NS.parse.toNum(el.textContent) : null);

  /** Karty v řadě. Kontejner se hledá nejdřív, ať ID nepadne na cizí okno. */
  function karty(box, sel) {
    const kont = box.querySelector(sel);
    if (!kont) return [];
    return Array.from(kont.querySelectorAll('.poker_card-front'))
      .map(el => kodKarty((el.firstElementChild || {}).textContent))
      .filter(c => c != null);
  }

  const aktivni = el => !!el && el.classList.contains('poker_active');

  function stav(box) {
    const ov = box.querySelector(S.overlay);
    const titul = ((box.querySelector(S.resTitle) || {}).textContent || '')
      .replace(/\s+/g, ' ').trim();
    const schovano = !!ov && (
      ((ov.style && ov.style.display) || '') === 'none' || !ov.classList.contains('poker_visible'));
    return {
      // fáze se pozná z toho, která vrstva ovládání je aktivní
      faze: aktivni(box.querySelector(S.decide)) ? 'rozhodnuti'
        : (aktivni(box.querySelector(S.bet)) ? 'sazka' : 'jina'),
      konec: !!titul && !schovanoText(box),
      titul,
      podtitul: ((box.querySelector(S.resDesc) || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      moje: karty(box, S.pCards),
      board: karty(box, S.cCards),
      dealer: karty(box, S.dCards),
      mujRank: ((box.querySelector(S.pRank) || {}).textContent || '').trim(),
      dealerRank: ((box.querySelector(S.dRank) || {}).textContent || '').trim(),
      ante: num(box.querySelector(S.ante))
    };
  }

  /**
   * Je okno s výsledkem schované? Poker ho na rozdíl od blackjacku ukazuje
   * `display`em i třídou, takže se zkouší obojí – a titulek po „Nové hře“
   * zůstává v DOM stejně jako tam.
   */
  function schovanoText(box) {
    const ov = box.querySelector(S.overlay);
    if (!ov) return true;
    const d = (ov.style && ov.style.display) || '';
    if (d === 'none') return true;
    if (d) return false;
    // bez inline stylu rozhoduje třída, jinak se bere jako viditelné
    return ov.classList.contains('poker_hidden');
  }

  const vysledek = titul => (VYSLEDKY.find(v => v.re.test(titul)) || { jmeno: 'neznámý' }).jmeno;

  const cekat = async (fn, ms = 12000, krokMs = 200) => {
    const konec = Date.now() + ms;
    while (Date.now() < konec) {
      const v = fn();
      if (v) return v;
      await sleep(krokMs);
    }
    return null;
  };

  async function ustaleny(box, hotovo, ms = 14000) {
    let posledni = null;
    let stejne = 0;
    const konec = Date.now() + ms;
    while (Date.now() < konec) {
      const n = stav(box);
      const podpis = n.faze + '|' + n.titul + '|' + n.moje.length + '|'
        + n.board.length + '|' + n.dealer.length;
      if (podpis === posledni) stejne++;
      else { stejne = 0; posledni = podpis; }
      if (stejne >= 1 && hotovo(n)) return n;
      await sleep(250);
    }
    return null;
  }

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

  /* ---- most do hlavního světa --------------------------------------------- */

  const DOTAZ = 'cmc-main-req';
  const ODPOVED = 'cmc-main-res';
  let dotazId = 0;

  const maMainWorld = () => document.documentElement.getAttribute('data-cmc-main') === '1';

  function mainVolej(co, ms = 2000) {
    return new Promise(resolve => {
      const id = 'pk' + (++dotazId);
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

  /** Inicializace hry v hlavním světě – bez ní nejde ani vsadit. */
  async function oziv() {
    if (!maMainWorld()) {
      krok('oživení SELHALO', { duvod: 'main-world.js neběží – reloadni rozšíření i stránku' });
      throw new Error('pomocník v hlavním světě neběží – po reloadu rozšíření'
        + ' obnov i stránku hry (F5)');
    }
    const r = await mainVolej('pk-init');
    if (!r || !r.ok) {
      krok('oživení SELHALO', { odpoved: r ? r.err : 'bez odpovědi' });
      throw new Error('hru nešlo inicializovat: ' + (r ? r.err : 'hlavní svět neodpověděl'));
    }
    krok('oživení', { ante: r.ante, busy: r.busy });
    return r;
  }

  /* ---- jedno kolo --------------------------------------------------------- */

  async function otevri() {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    /*
     * !!! JEDNORÁZOVÝ VÝPADEK NESMÍ VYPNOUT AUTOMATIKU !!!
     * Naměřeno 10. 8. 2026: dvě čtení kasina po sobě vrátila HTTP 404 (10:57:58
     * a 10:58:01), přitom budova jinak odpovídá normálně. Každé takové selhání
     * se počítalo do `AUTO_MAX_FAILS`, takže pár výpadků za sebou vypnulo celou
     * hru – a uživatel našel poker vypnutý bez zjevné příčiny.
     *
     * Stejná past už byla u banky ve vylepšování budov (12s timeout), tak se to
     * řeší stejně: krátká série pokusů, a teprve když neuspěje ani jeden, je to
     * skutečná chyba.
     */
    const o = await NS.parse.apiGetTry(BUILDING);
    const { status, raw } = o;
    if (status !== 200) {
      throw new Error('kasino nelze přečíst (HTTP ' + status
        + ', ' + (o.pokusu || 1) + ' pokusy)');
    }
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-pk-box';
    box.innerHTML = raw;
    host.appendChild(box);
    await oziv();
    await sleep(300);
    if (!box.querySelector(S.root)) {
      box.remove();
      throw new Error('poker v okně není');
    }
    return box;
  }

  /** Naskládá ante z žetonů (odspodu největšími). */
  async function nasadit(box, cil) {
    const clear = box.querySelector(S.clear);
    if (clear) { clear.click(); await sleep(120); }
    let zbyva = Math.max(MIN_SAZKA, Math.round(cil / MIN_SAZKA) * MIN_SAZKA);
    let vlozeno = 0;
    const chipy = zetony(box);
    if (!chipy.length) throw new Error('žetony v okně pokeru nejsou');
    krok('sázím', { cil: zbyva, zetony: chipy.map(c => c[0]).join('/'),
      dealPred: tlacitko(box, S.deal) });
    for (const [hodnota, cls] of chipy) {
      while (zbyva >= hodnota) {
        // bez prefixu `#poker ` – složený selektor by padl na cizí okno
        const chip = box.querySelector('.' + cls);
        if (!chip) break;
        chip.click();
        await sleep(70);
        zbyva -= hodnota;
        vlozeno += hodnota;
      }
    }
    const zHry = await mainVolej('pk-stav', 1200);
    krok('vsazeno', { chtel: vlozeno, hraEviduje: zHry ? zHry.ante : 'bez odpovědi',
      deal: tlacitko(box, S.deal) });
    if (vlozeno && zHry && zHry.ante === 0) {
      throw new Error('hra sázku nepřijala (eviduje 0) – zkusím znovu');
    }
    /*
     * !!! CO HRA EVIDUJE, MUSÍ SEDĚT NA KORUNU !!!
     * Dřív se hlídala jen nula, takže špatně oceněné žetony prošly bez povšimnutí:
     * hra vsadila 9 000, modul si zapsal 2 000, a protože z téhož čísla počítá
     * i „vráceno“, panel ukazoval normální návratnost. Rozdíl se tím pádem nedal
     * poznat odnikud než z reálného stavu diamantů.
     *
     * Kolo, jehož sázku neznáme, se hrát NESMÍ – radši se zruší a nehraje.
     */
    if (vlozeno && zHry && zHry.ante != null && zHry.ante !== vlozeno) {
      if (clear) { clear.click(); await sleep(120); }
      throw new Error('hra eviduje jinou sázku (' + zHry.ante + ' 💎) než chci ('
        + vlozeno + ' 💎) – kolo se nehraje');
    }
    return vlozeno;
  }

  /** Uklidí okno do sázkové fáze; zkouší to dvakrát jako blackjack. */
  async function doSazkove(box) {
    for (let pokus = 1; pokus <= 2; pokus++) {
      if (pokus === 2) {
        const u = await mainVolej('pk-unlock', 1200);
        krok('uvolnění příznaku', { busy: u ? u.busy : 'bez odpovědi' });
      }
      await klikni(box, S.reset);
      const s = await cekat(() => {
        const n = stav(box);
        return n.faze === 'sazka' ? n : null;
      }, 8000);
      if (s) {
        krok('zpět v sázkové fázi', { pokus });
        return s;
      }
      krok('nová hra SELHALA', { pokus, ...snimek(box) });
    }
    throw new Error('okno se nevrátilo do sázkové fáze (2 pokusy)');
  }

  async function pripravKolo(box) {
    const s = stav(box);
    krok('okno při otevření', snimek(box));
    if (s.faze === 'sazka' && !s.konec) return s;
    return await doSazkove(box);
  }

  /** Odehraje jedno kolo: ante → výpočet šance → Pokračovat/Vsadit 2× → výsledek. */
  async function odehrajKolo(box, ante) {
    const vlozeno = await nasadit(box, ante);
    if (!vlozeno) throw new Error('ante nejde složit z žetonů');

    await klikni(box, S.deal);

    /*
     * !!! TADY SE NEČEKÁ NA USTÁLENÍ !!!
     * Podmínka je sama dost silná: dvě moje karty, tři na stole a fáze
     * rozhodování. Trvat navíc na dvou stejných čteních po sobě bylo špatně –
     * poker karty animuje 3D překlopením, takže se podpis stavu pořád měnil
     * a ustálení nenastalo, i když všechny karty dávno byly v okně. Naživo to
     * skončilo tím, že se minutu čekalo na něco, co už tam bylo, a kolo padlo
     * na „nevykreslila rozdání“ (log: `moje=7♦ 3♦ board=8♦ 2♦ J♥`).
     */
    const rozdano = await cekat(() => {
      const n = stav(box);
      return (n.moje.length >= 2 && n.board.length >= 3 && n.faze === 'rozhodnuti')
        || n.konec ? n : null;
    }, 20000);
    if (!rozdano) {
      krok('rozdání SELHALO', snimek(box));
      throw new Error('hra nevykreslila rozdání – ante ' + vlozeno + ' 💎 mohlo propadnout');
    }

    const moje = rozdano.moje.slice(0, 2);
    const flop = rozdano.board.slice(0, 3);
    krok('rozdáno', { moje: moje.map(popisKarty).join(' '),
      flop: flop.map(popisKarty).join(' '), rank: rozdano.mujRank });

    const cas = Date.now();
    const s = sance(moje, flop, Math.max(200, NS.store.get().read.pkVzorku || VZORKU));
    // prah se učí z vlastní historie – nula je špatná, viz `kalibrace()`
    const pp = platnyPrah();
    const zdvoj = zdvojit(s, pp.prah);
    krok('výpočet', {
      vyhra: (s.win * 100).toFixed(1) + '%', prohra: (s.lose * 100).toFixed(1) + '%',
      remiza: (s.tie * 100).toFixed(1) + '%', navrch: (s.edge * 100).toFixed(1) + 'pb',
      vzorku: s.vzorku, msVypoctu: Date.now() - cas,
      prah: (Math.round(pp.prah * 10) / 10) + 'pb (' + pp.zdroj + ')',
      volba: zdvoj ? 'Vsadit 2×' : 'Pokračovat'
    });

    await klikni(box, zdvoj ? S.bet2x : S.check);

    /*
     * Konec kola stejně: titulek je jednoznačný signál, ustálení by zas mohlo
     * uvíznout na animaci dokreslovaných karet.
     */
    const finalni = await cekat(() => {
      const n = stav(box);
      return n.konec ? n : null;
    }, 20000) || stav(box);
    krok('závěr', snimek(box));

    const v = vysledek(finalni.titul);
    const sazka = zdvoj ? vlozeno * 2 : vlozeno;
    /*
     * Výplata podle změřených pravidel: výhra 2× sázka, remíza sázka, prohra 0.
     * Payout ze serveru izolovaný svět nevidí, ale pravidlo je jednoznačné.
     */
    const vraceno = v === 'výhra' ? sazka * 2 : (v === 'remíza' ? sazka : (v === 'prohra' ? 0 : null));

    if (vraceno == null) {
      krok('výsledek NEPŘEČTEN', { titul: finalni.titul, ...snimek(box) });
    }

    return {
      ante: vlozeno, zdvojeno: zdvoj, sazka,
      vysledek: v, vraceno, neurcity: vraceno == null,
      titul: finalni.titul, podtitul: finalni.podtitul,
      moje: moje.map(popisKarty).join(' '),
      board: finalni.board.map(popisKarty).join(' '),
      dealer: finalni.dealer.map(popisKarty).join(' '),
      mujRank: finalni.mujRank, dealerRank: finalni.dealerRank,
      win: s.win, lose: s.lose, tie: s.tie, edge: s.edge
    };
  }

  async function playRound(ante) {
    traceNove({ ante, diamanty: readPoints() });
    let box = null;
    try {
      box = await otevri();
      await pripravKolo(box);
      const r = await odehrajKolo(box, ante);
      krok('hotovo', { vysledek: r.vysledek, vraceno: r.vraceno, zdvojeno: r.zdvojeno });
      await traceUloz(r.vysledek + ' ' + NS.fmt.signed((r.vraceno || 0) - r.sazka, '💎')
        + (r.zdvojeno ? ' (2×)' : ''));
      return r;
    } catch (e) {
      krok('CHYBA', { zprava: e.message });
      await traceUloz('CHYBA: ' + e.message);
      throw e;
    } finally {
      if (box) box.remove();
    }
  }

  function readPoints() {
    const el = document.querySelector('.value.renew-points');
    return el ? NS.parse.toNum(el.textContent) : null;
  }

  /* ---- záznam ------------------------------------------------------------- */

  const PRAZDNY = {
    rounds: 0, wins: 0, pushes: 0, losses: 0, neurcite: 0,
    doubled: 0, staked: 0, won: 0, lossRun: 0, maxLossRun: 0,
    // zvlášť podle rozhodnutí – tam je vidět, jestli má výpočet cenu
    zdvojene: { n: 0, wins: 0, staked: 0, won: 0 },
    jenAnte: { n: 0, wins: 0, staked: 0, won: 0 },
    firstAt: null, lastAt: null, recent: []
  };
  /*
   * 1000, ne 200: při rozboru nočních ztrát z historie zbývalo jen 200 kol
   * a kritický úsek už byl přepsaný. Záznam má ~150 B, takže je to ~150 kB –
   * hluboko pod limitem chrome.storage (10 MB).
   */
  const RECENT_MAX = 1000;

  async function log(r) {
    const cur = { ...PRAZDNY, ...(NS.store.get().pkLog || {}) };
    const zapis = {
      at: Date.now(), ante: r.ante, sazka: r.sazka, zdvojeno: !!r.zdvojeno,
      vraceno: r.vraceno, vysledek: r.vysledek, moje: r.moje, board: r.board,
      dealer: r.dealer, mujRank: r.mujRank, dealerRank: r.dealerRank,
      edge: r.edge != null ? Math.round(r.edge * 1000) / 10 : null
    };

    /*
     * V měřicím režimu se ke kolu připíše blok a podmínka, jinak by se pak
     * nedalo rozdělit, co k čemu patřilo. Počítadlo `mereniKol` je zvlášť od
     * `rounds`, aby se bloky nerozhodily kolem odehraným mimo měření.
     */
    const m = mereni();
    if (m) {
      zapis.mBlok = m.blok;
      zapis.mAnte = m.ante;
    }

    const mereniKol = (cur.mereniKol || 0) + (m ? 1 : 0);

    if (r.neurcity) {
      await NS.store.put('pkLog', {
        ...cur, rounds: cur.rounds + 1, neurcite: (cur.neurcite || 0) + 1, mereniKol,
        lastAt: Date.now(), firstAt: cur.firstAt || Date.now(),
        recent: [{ ...zapis, vysledek: 'neurčité' }, ...(cur.recent || [])].slice(0, RECENT_MAX)
      });
      return;
    }

    const vyhral = r.vysledek === 'výhra';
    const push = r.vysledek === 'remíza';
    const skupina = r.zdvojeno ? 'zdvojene' : 'jenAnte';
    const sk = { n: 0, wins: 0, staked: 0, won: 0, ...(cur[skupina] || {}) };

    await NS.store.put('pkLog', {
      ...cur,
      rounds: cur.rounds + 1,
      mereniKol,
      wins: cur.wins + (vyhral ? 1 : 0),
      pushes: cur.pushes + (push ? 1 : 0),
      losses: cur.losses + (r.vysledek === 'prohra' ? 1 : 0),
      doubled: cur.doubled + (r.zdvojeno ? 1 : 0),
      staked: cur.staked + r.sazka,
      won: cur.won + (r.vraceno || 0),
      lossRun: vyhral ? 0 : (push ? cur.lossRun : (cur.lossRun || 0) + 1),
      maxLossRun: Math.max(cur.maxLossRun || 0,
        vyhral ? 0 : (push ? cur.lossRun : (cur.lossRun || 0) + 1)),
      [skupina]: {
        n: sk.n + 1, wins: sk.wins + (vyhral ? 1 : 0),
        staked: sk.staked + r.sazka, won: sk.won + (r.vraceno || 0)
      },
      firstAt: cur.firstAt || Date.now(),
      lastAt: Date.now(),
      recent: [zapis, ...(cur.recent || [])].slice(0, RECENT_MAX)
    });
  }

  /* ---- poctivost rozdání --------------------------------------------------- */

  /**
   * !!! ROZDÁNÍ SE MUSÍ KONTROLOVAT !!!
   * Celý výpočet šancí stojí na tom, že dealerovy karty jsou náhodné. To se dá
   * ověřit BEZ jakéhokoli předpokladu o pravidlech hry i o mém hodnocení: devět
   * karet kola (moje 2, stůl 5, dealer 2) je při poctivém míchání rozdáno tak,
   * že kterékoli dvě z nich mohly být dealerovy. Stačí tedy spočítat, kolik
   * vysokých karet dealer dostal, a porovnat s tím, kolik mu jich mělo padnout.
   *
   * Naživo to na 804 kolech odhalilo, že hra rozdává dealerovi vysoké karty
   * (632 místo 516, tedy +7 σ, p < 0,00005) a hráči nízké (423, −5,6 σ), zatímco
   * stůl je v normě – což je zároveň kontrola metody. Základní hra pak má
   * −9,8 % na kolo a žádná strategie to nepřebije. Proto to panel hlídá sám.
   */
  const VYSOKE = ['J', 'Q', 'K', 'A'];

  /*
   * !!! PŘI VYCHÝLENÉM ROZDÁNÍ SE PŘESTANE HRÁT !!!
   * Změřený vztah je skoro monotónní – každá 1 σ vychýlení dealera stojí
   * 3,6 pb návratnosti (okna po 150 kolech, jeden den):
   *
   *   −2,8 σ → 107 %    +0,4 σ → 101 %    +3,0 σ → 84 %
   *   −1,4 σ → 110 %    +2,0 σ →  96 %    +5,6 σ → 77 %
   *
   * Při poctivém rozdání (σ ≈ 0) je návratnost 100 %, takže hra sama o sobě
   * NEVYDĚLÁVÁ – vydělá jedině, když má dealer smůlu. Nad 3 σ jde o desítky
   * procent ztráty a žádný prah to nepřebije. Naživo takhle proteklo 1 180 💎
   * za 549 kol, protože panel jen varoval a automatika hrála dál.
   */
  /*
   * Výchozí prah; skutečná hodnota je v nastavení (`pkStopSigma`), aby se dala
   * změnit bez zásahu do kódu. Okno zůstává pevné – viz `STOP_OKNO`.
   */
  const STOP_SIGMA = 2.2;
  const stopSigma = () => {
    const v = +NS.store.get().read.pkStopSigma;
    /* rozsah je pojistka proti prázdné/rozbité hodnotě, ne omezení volby */
    return Number.isFinite(v) && v > 0 ? Math.min(20, v) : STOP_SIGMA;
  };
  const STOP_OKNO = 300;     // krátké okno, ať se to pozná včas
  const STOP_MIN_KOL = 150;

  // `karty()` výš čte karty z DOM, tohle jen rozseká zapsaný řetězec
  const rozdel = t => String(t || '').trim().split(/\s+/).filter(Boolean);
  const vysoke = ks => ks.filter(k => VYSOKE.includes(k.replace(/[♠♥♦♣]/g, ''))).length;
  const uplne = z => rozdel(z.moje).length === 2 && rozdel(z.board).length === 5
    && rozdel(z.dealer).length === 2;

  /**
   * Poctivost rozdání pro libovolnou skupinu kol. Kromě σ vrací i POMĚR
   * (dostal/měl dostat) – ten je na srovnávání skupin jediný správný, protože
   * σ roste s odmocninou z počtu kol, takže by větší skupina vypadala hůř.
   */
  function poctivostKol(kola, minKol = 100) {
    let dealer = 0, hrac = 0, cekano = 0, rozptyl = 0, n = 0;
    for (const z of kola) {
      if (!uplne(z)) continue;
      n++;
      const m = rozdel(z.moje), st = rozdel(z.board), d = rozdel(z.dealer);
      const vsech = vysoke(m) + vysoke(st) + vysoke(d);
      dealer += vysoke(d);
      hrac += vysoke(m);
      /*
       * Přesná střední hodnota i rozptyl tahu dvou karet z devíti bez vracení
       * (hypergeometricky): E = 2p, Var = 2p(1−p)·(9−2)/(9−1).
       */
      const pod = vsech / 9;
      cekano += 2 * pod;
      rozptyl += 2 * pod * (1 - pod) * 7 / 8;
    }
    if (n < minKol) return { kol: n, dost: false };
    const sd = Math.sqrt(rozptyl);
    return {
      kol: n, dost: true, dealer, hrac, cekano, sd,
      pomer: cekano > 0 ? dealer / cekano : null,
      sigmaDealer: sd > 0 ? (dealer - cekano) / sd : 0,
      sigmaHrac: sd > 0 ? (hrac - cekano) / sd : 0
    };
  }

  /**
   * `okno` omezuje test na posledních N kol – hlídač musí reagovat rychle,
   * kdežto v panelu má smysl i celá historie.
   */
  function poctivost(okno, minKol = 100) {
    const s = NS.store.get().pkLog || {};
    // POZOR: stůl se ukládá jako `board` (v CSV se přejmenovává na „stul“)
    let kola = (s.recent || []).filter(z => z.moje && z.board && z.dealer);
    if (okno) kola = kola.slice(0, okno);
    return poctivostKol(kola, minKol);
  }

  /* ---- souhrn ------------------------------------------------------------- */

  function stats() {
    const s = { ...PRAZDNY, ...(NS.store.get().pkLog || {}) };
    const pomer = o => ({
      ...o, net: o.won - o.staked,
      rtp: o.staked > 0 ? (o.won / o.staked) * 100 : null,
      winRate: o.n > 0 ? (o.wins / o.n) * 100 : null
    });
    return {
      ...s,
      net: s.won - s.staked,
      rtp: s.staked > 0 ? (s.won / s.staked) * 100 : null,
      winRate: s.rounds > 0 ? (s.wins / s.rounds) * 100 : null,
      pushRate: s.rounds > 0 ? (s.pushes / s.rounds) * 100 : null,
      doubleRate: s.rounds > 0 ? (s.doubled / s.rounds) * 100 : null,
      zdvojene: pomer(s.zdvojene || {}), jenAnte: pomer(s.jenAnte || {})
    };
  }

  const reset = () => NS.store.put('pkLog', { ...PRAZDNY });

  /* ---- sázka a automatika -------------------------------------------------- */

  /* ---- měřicí režim -------------------------------------------------------- */

  /*
   * !!! NA CO TO JE !!!
   * Vychýlení rozdání se v čase MĚNÍ (naměřeno 0,95× až 1,51× mezi okny) a to
   * mařilo každé srovnání „před a po“: jedno měření se od běžného kolísání
   * nedalo odlišit. Kandidáti na příčinu byli tři – výše sázky, počet
   * odehraných kol a předchozí výsledky – a data mezi nimi neumělo vybrat,
   * protože ante se měnilo vždycky jen jednou a naráz s časem.
   *
   * Měřicí režim to rozplete tím, že ante STŘÍDÁ po blocích. Každá podmínka pak
   * dostane několik různých okamžiků, takže se dá oddělit vliv sázky od vlivu
   * času i od průběžného výsledku.
   *
   * Kolik kol je potřeba (vychýlení, které chceme rozpoznat na 2σ):
   *   1,05× → 1 558 kol     1,20× →  97 kol
   *   1,10× →   390 kol     1,40× →  24 kol
   * Na rozdíl mezi dvěma podmínkami je potřeba dvojnásobek na každou.
   */
  function mereni() {
    const cfg = NS.store.get().read;
    if (!cfg.pkMereni) return null;
    const ante = String(cfg.pkMereniAnte || '10,20').split(',')
      .map(x => Math.round(+x))
      .filter(x => x >= MIN_SAZKA);
    if (ante.length < 2) return null;
    const delka = Math.max(20, Math.round(+cfg.pkMereniBlok || 100));
    const kol = (NS.store.get().pkLog || {}).mereniKol || 0;
    const blok = Math.floor(kol / delka);
    return {
      ante: ante[blok % ante.length], blok, delka, podminky: ante,
      kolVBloku: kol % delka, zbyvaVBloku: delka - (kol % delka), kol
    };
  }

  function nextStake() {
    const cfg = NS.store.get().read;
    const m = mereni();
    if (m) {
      const rezerva = Math.max(0, Math.round(+cfg.pkReserve || 0));
      const diamanty = readPoints();
      const dostupne = diamanty != null ? Math.max(0, diamanty - rezerva) : null;
      return {
        amount: m.ante, rezerva, diamanty, dostupne, mereni: m,
        blokovano: dostupne != null && m.ante * 2 > dostupne
      };
    }
    const zadano = Math.max(MIN_SAZKA, Math.round(+cfg.pkStake || MIN_SAZKA));
    const zaklad = Math.max(MIN_SAZKA, Math.round(zadano / MIN_SAZKA) * MIN_SAZKA);
    const rezerva = Math.max(0, Math.round(+cfg.pkReserve || 0));
    const diamanty = readPoints();
    const dostupne = diamanty != null ? Math.max(0, diamanty - rezerva) : null;
    return {
      amount: zaklad, rezerva, diamanty, dostupne,
      // na zdvojení musí zbýt dvojnásobek, jinak se kolo nedá dohrát podle plánu
      blokovano: dostupne != null && zaklad * 2 > dostupne
    };
  }

  const autoSet = () => String(NS.store.get().read.casinoAuto || '') === 'poker';
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;
  const smyckaZapnuta = () => NS.store.get().read.pkLoop !== false;

  let autoRunning = false;
  let selhani = 0;
  /*
   * Pět, ne tři: jedno selhání sem tam je normální (hra neodpoví, okno se
   * nevykreslí) a vypínat kvůli tomu celou automatiku je zbytečné. Kolik zbývá,
   * se píše do lišty, ať je poznat, že se něco děje.
   */
  const AUTO_MAX_FAILS = 5;

  function naplanujDalsi() {
    if (!smyckaZapnuta() || !autoOn() || !NS.queue) return;
    setTimeout(() => {
      if (!smyckaZapnuta() || !autoOn()) return;
      NS.queue.run('poker', () => autoTick()).catch(() => {});
    }, 350);
  }

  async function autoTick() {
    if (autoRunning || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;

    /*
     * Hlídač poctivosti – viz `STOP_SIGMA`. Vypíná se tím volba v liště, aby to
     * nešlo přehlédnout; zapnout zpátky jde ručně, když se rozdání spraví.
     * Kontroluje se PŘED herním oknem: volba se má vypnout i tehdy, když hra
     * zrovna není otevřená, ať se po otevření nezačne hrát do vychýlení.
     */
    if (NS.store.get().read.pkStopVychyleni !== false) {
      const pc = poctivost(STOP_OKNO, STOP_MIN_KOL);
      if (pc.dost && pc.sigmaDealer > stopSigma()) {
        await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus('⛔ poker vypnut: rozdání je vychýlené '
          + (Math.round(pc.sigmaDealer * 10) / 10) + ' σ ve prospěch dealera'
          + ' (posledních ' + pc.kol + ' kol, prah ' + stopSigma()
          + ' σ). Každá 1 σ stojí ~3,6 pb'
          + ' návratnosti – nemá cenu hrát.', true);
        NS.gym.collect();
        return false;
      }
    }

    if (!NS.gym.gameHost()) return false;

    const n = nextStake();
    if (n.blokovano) {
      NS.gym.setStatus('auto poker čeká: na kolo s možností zdvojit je potřeba '
        + NS.fmt.gems(n.amount * 2) + ' nad rezervou ' + NS.fmt.gems(n.rezerva), true);
      return false;
    }

    autoRunning = true;
    try {
      NS.gym.setStatus('auto poker: hraju za ' + NS.fmt.gems(n.amount) + '…');
      const r = await NS.gym.withSuspend(() => playRound(n.amount));
      await log(r);
      selhani = 0;

      const s = stats();
      NS.gym.setStatus('poker: ' + r.vysledek + (r.zdvojeno ? ' (2×)' : '')
        + ((r.vraceno || 0) - r.sazka >= 0 ? ' +' : ' ')
        + NS.fmt.gems((r.vraceno || 0) - r.sazka)
        + ' · ' + s.rounds + '× · bilance ' + NS.fmt.signed(s.net, '💎')
        + (s.rtp != null ? ' (' + NS.fmt.pct(s.rtp) + ')' : ''),
        r.vysledek === 'prohra');
      NS.gym.collect();
      naplanujDalsi();
      return true;
    } catch (e) {
      selhani++;
      if (selhani >= AUTO_MAX_FAILS) {
        await NS.store.patch('read', { casinoAuto: '' });
        NS.gym.setStatus('⚠ auto poker vypnuto po ' + selhani + ' selháních: ' + e.message, true);
        NS.gym.collect();
      } else {
        NS.gym.setStatus('⚠ poker: ' + e.message
          + ' (zkusím znovu, do vypnutí ' + (AUTO_MAX_FAILS - selhani) + '×)', true);
        // po chybě se pokračuje – jinak by se čekalo na pětisekundový tik
        naplanujDalsi();
      }
      return false;
    } finally {
      autoRunning = false;
    }
  }

  NS.poker = {
    playRound, odehrajKolo, pripravKolo, otevri, nasadit, naplanujDalsi, smyckaZapnuta,
    log, stats, reset, nextStake, autoTick, autoSet, autoOn,
    STOP_SIGMA, STOP_OKNO, STOP_MIN_KOL, stopSigma,
    sance, zdvojit, kalibrace, platnyPrah, vyhodnot, hodnot, porovnej, porovnejHrou, hrube,
    poctivost, poctivostKol, mereni, mereniStats, kodKarty, popisKarty,
    stav, vysledek, ustaleny,
    traceText, snimek, mainVolej, maMainWorld, oziv, readPoints,
    BUILDING, zetony, MIN_SAZKA, VZORKU, PRAZDNY, RECENT_MAX, TRACE_KOL, S,
    get trace() { return trace.slice(); },
    get autoRunning() { return autoRunning; },
    dumpTrace() { const t = traceText(); console.log(t); return t; },
    clearTrace() { return NS.store.put('pkTrace', []); },
    resetFails() { selhani = 0; }
  };
})();
