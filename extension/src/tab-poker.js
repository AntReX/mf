/* =============================================================================
 * tab-poker.js – jak si vede poker (#18)
 *
 * !!! ROZDÁNÍ JE VYCHÝLENÉ – VIZ „Poctivost rozdání“ !!!
 * Test bez předpokladů ukázal na 804 kolech, že dealer dostává vysoké karty
 * o 7 σ častěji, než má. Základní hra tím má −9,8 % na kolo a zdvojování to
 * nepřebije. Proto je poctivost rozdání první sekce v záložce – dokud nesedí,
 * nemá cenu zkoumat cokoli dalšího.
 *
 * Casino Hold'em je symetrický (hráč i dealer dvě karty, společný board), takže
 * „vždy Pokračovat“ má očekávanou hodnotu nulu. Cenu má jen rozhodnutí zdvojit
 * v převaze – simulace se skutečnými pravidly dává **+0,132 ante na kolo, tedy
 * návratnost kolem 109 %**. (Hra ignoruje kickery, viz `porovnejHrou`.)
 *
 * Proto je tady rozpis podle ROZHODNUTÍ: kola, kde se zdvojnásobilo, proti těm,
 * kde se jen pokračovalo. Právě tam je vidět, jestli výpočet dělá to, co má:
 * ve zdvojených kolech má být návratnost výrazně nad 100 %, v ostatních pod.
 *
 * !!! ROZPTYL JE DEVÍTINÁSOBEK VÝHODY !!!
 * σ ≈ 1,2 ante na kolo proti výhodě 0,132. Na dvaceti kolech proto rozhoduje
 * štěstí (šance na plus 69 %), po stovce 86 %, po pěti stech 99,3 %. Tabulka to
 * říká nahlas, aby se z padesáti kol nevyvozovalo, že „to nefunguje“.
 *
 * A pozor na ANTE: výhoda i kolísání rostou se sázkou stejně, takže poměr drží –
 * ale v absolutních číslech se kolísání zvětší. Kdo vydělá tisíce s malým ante
 * a pak ho zvýší desetinásobně, může celý zisk smazat jedním horším úsekem.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, grid, section, note, btn, confirmBtn } = NS.ui;
  const F = NS.fmt;

  /**
   * Očekávaná návratnost při zdvojování v převaze (ze simulace se SKUTEČNÝMI
   * pravidly hry – hra ignoruje kickery, viz `porovnejHrou` v poker.js).
   */
  const CEKANA_RTP = 109;
  /** Kolik kol, aby čísla něco znamenala. */
  const DOST_KOL = 200;

  function kdy(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    const dva = n => String(n).padStart(2, '0');
    return dva(d.getDate()) + '.' + dva(d.getMonth() + 1) + '. '
      + dva(d.getHours()) + ':' + dva(d.getMinutes());
  }

  /** Šance, že je hráč po n kolech v plusu (normální aproximace). */
  function sanceNaPlus(n) {
    if (!n) return null;
    // výhoda 0,132 ante na kolo proti σ ≈ 1,2 ante (se skutečnými pravidly)
    const z = 0.132 * Math.sqrt(n) / 1.2;
    // Abramowitz–Stegun aproximace normální distribuce
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = 1 - d * t * (1.330274 * t * t * t * t - 1.821256 * t * t * t
      + 1.781478 * t * t - 0.356538 * t + 0.319382);
    return z >= 0 ? p * 100 : (1 - p) * 100;
  }

  const BARVA = { 'výhra': 'cmc-good', 'remíza': '', prohra: 'cmc-bad' };

  function tabulka(s) {
    if (!s.recent || !s.recent.length) return null;
    const hlava = h('div', { class: 'cmc-pk-r cmc-pk-head' },
      h('span', { text: 'kdy' }),
      h('span', { text: 'moje' }),
      h('span', { text: 'navrch' }),
      h('span', { text: 'sázka' }),
      h('span', { text: 'rozdíl' }));

    const radky = s.recent.slice(0, 40).map(z => {
      const d = (z.vraceno || 0) - z.sazka;
      return h('div', { class: 'cmc-pk-r' + (d > 0 ? ' cmc-pk-win' : '') },
        h('span', { class: 'cmc-pk-t', text: kdy(z.at) }),
        h('span', {
          class: 'cmc-pk-t',
          text: (z.moje || '?') + (z.mujRank ? ' · ' + z.mujRank : ''),
          title: (z.board ? 'stůl: ' + z.board + '\n' : '')
            + (z.dealer ? 'dealer: ' + z.dealer + (z.dealerRank ? ' · ' + z.dealerRank : '') : '')
        }),
        h('span', {
          class: z.edge > 0 ? 'cmc-good' : 'cmc-bad',
          text: z.edge != null ? (z.edge > 0 ? '+' : '') + F.pct(z.edge) : '–',
          title: 'o kolik byla šance na výhru vyšší než na prohru'
        }),
        h('span', { text: F.gems(z.sazka) + (z.zdvojeno ? ' 2×' : '') }),
        h('span', { class: d >= 0 ? 'cmc-good' : 'cmc-bad', text: F.signed(d, '💎') }));
    });
    return section('Posledních ' + Math.min(40, s.recent.length) + ' kol',
      h('div', { class: 'cmc-pk-tab' }, hlava, ...radky));
  }

  /**
   * Poctivost rozdání – nejdůležitější věc na téhle záložce.
   *
   * Celý výpočet stojí na tom, že dealerovy karty jsou náhodné. Když nejsou,
   * nepomůže žádná strategie, protože základní hra je pak ztrátová sama o sobě.
   * Test je bez předpokladů (viz `poctivost()` v poker.js) a naživo odhalil, že
   * hra rozdává dealerovi vysoké karty o 7 σ častěji, než má.
   */
  function poctivostRozdani() {
    const cely = NS.poker.poctivost();
    if (!cely.dost) {
      return section('Poctivost rozdání',
        note('Zatím ' + F.num(cely.kol) + ' kol s kompletními kartami – na test je'
          + ' potřeba aspoň 100. Pak se tady spočítá, jestli dealer dostává'
          + ' náhodné karty, nebo jestli mu hra nadržuje.'));
    }

    /*
     * !!! HLAVNÍ ČÍSLO JE ČERSTVÉ OKNO, NE CELÝ LOG !!!
     * Rozhoduje okno hlídače (`STOP_OKNO` = 300 kol) – podle něj se automatika
     * vypíná a vychýlení se v čase mění, takže starší kola ho jen rozmazávají.
     * Dřív tu vedl celý log a vznikaly z toho rozpory: panel ukazoval +1,6 σ
     * a „vypadá poctivě“, zatímco lišta zrovna hlásila vypnutí kvůli 2,2 σ.
     * Celý log tu zůstává jako kontext, o řádek níž.
     */
    const okno = NS.poker.poctivost(NS.poker.STOP_OKNO, NS.poker.STOP_MIN_KOL);
    const prah = NS.poker.stopSigma();
    const hlidacZapnut = NS.store.get().read.pkStopVychyleni !== false;

    /* dokud čerstvé okno nemá dost kol, rozhoduje aspoň celý log */
    const hlavni = okno.dost ? okno : cely;
    const s = hlavni.sigmaDealer;
    const nadPrahem = s > prah;
    const spatne = s > 3;
    const podezrele = s > 2 || nadPrahem;
    const sek = section('Poctivost rozdání' + (spatne ? ' – NEHRÁT' : ''));

    sek.appendChild(row(okno.dost
      ? 'Kol v testu (okno hlídače)' : 'Kol v testu', F.num(hlavni.kol)));
    sek.appendChild(row('Vysokých karet (J,Q,K,A) dealerovi',
      F.num(hlavni.dealer) + ' · čekáno ' + F.num(Math.round(hlavni.cekano)),
      spatne ? 'cmc-bad' : (podezrele ? '' : 'cmc-good')));
    sek.appendChild(row('Tobě',
      F.num(hlavni.hrac) + ' · čekáno ' + F.num(Math.round(hlavni.cekano)),
      hlavni.sigmaHrac < -3 ? 'cmc-bad' : ''));
    sek.appendChild(row('Odchylka dealera'
      + (okno.dost ? ' – posledních ' + F.num(okno.kol) + ' kol' : ''),
    (s > 0 ? '+' : '') + (Math.round(s * 10) / 10) + ' σ'
      + ' · hlídač ' + prah + ' σ' + (hlidacZapnut ? '' : ' (vypnutý)'),
    nadPrahem ? 'cmc-bad' : 'cmc-good'));

    /* celý log jen jako kontext – rozhodovat podle něj by mazalo čerstvý stav */
    if (okno.dost && cely.kol > okno.kol) {
      sek.appendChild(row('Pro srovnání – celý log (' + F.num(cely.kol) + ' kol)',
        (cely.sigmaDealer > 0 ? '+' : '')
          + (Math.round(cely.sigmaDealer * 10) / 10) + ' σ'));
    }

    if (nadPrahem && hlidacZapnut) {
      sek.appendChild(note('Automatika je nad prahem vypnutá. Prah se dá změnit'
        + ' v předvolbách rozšíření; okno je pevných '
        + F.num(NS.poker.STOP_OKNO) + ' kol, protože vychýlení se v čase mění.'));
    }

    if (spatne) {
      sek.appendChild(note('!!! ROZDÁNÍ NENÍ NÁHODNÉ !!! Dealer dostává vysoké'
        + ' karty výrazně častěji, než mu má padat – nad 3 σ je to náhodou'
        + ' přibližně jedno kolo z tisíce, takže to není smůla. Základní hra je'
        + ' tím ztrátová sama o sobě a ŽÁDNÉ rozhodování to nepřebije, protože'
        + ' zdvojení může přidat nejvýš pár procent.'));
      sek.appendChild(note('Změřený vztah je nemilosrdný: každá 1 σ vychýlení'
        + ' stojí ~3,6 pb návratnosti, takže při +5 σ hra bere pětinu každé sázky.'));
    } else if (podezrele) {
      sek.appendChild(note('Dealer má vysokých karet víc, než by měl, ale ještě'
        + ' to může být náhoda. Nech dojet dalších pár stovek kol a koukni znovu.'));
    } else {
      sek.appendChild(note('Dealer dostává karty, jaké mu padat mají – rozdání'
        + ' vypadá poctivě, takže výpočet šancí stojí na pevném základě.'));
    }
    sek.appendChild(note('Vychýlení se v čase MĚNÍ – naměřeno +8,0 σ v jednom'
      + ' sezení a +3,4 σ v dalším ten samý den. Při +8 σ hra brala 12 % z každé'
      + ' sázky, při +3,4 σ ji zdvojování vyrovnalo na nulu. Proto se sem dívej'
      + ' vždycky, než začneš hrát – ne jednou za týden.'));
    sek.appendChild(note('Jak se to měří: devět karet kola (tvoje dvě, stůl,'
      + ' dealerovy dvě) je při poctivém míchání rozdáno tak, že kterékoli dvě'
      + ' z nich mohly být dealerovy. Stačí tedy porovnat, kolik vysokých karet'
      + ' dostal, s tím, kolik jich dostat měl. Nezávisí to na pravidlech hry'
      + ' ani na mém hodnocení kombinací.'));
    return sek;
  }

  /**
   * Naučený prah zdvojení. Nula je špatný prah, protože odhad počítá s náhodným
   * dealerem – a hlavně je vedle NE rovnoměrně: mírná převaha (0…+40 pb) je ve
   * skutečnosti ztrátová, hotová silná ruka (+40 pb a výš) sedí. Prah se proto
   * dopočítává regresí z vlastní historie (viz `kalibrace()` v poker.js).
   */
  function naucenyPrah() {
    const pp = NS.poker.platnyPrah();
    const k = pp.kalib || {};
    const sek = section('Prah zdvojení');
    sek.appendChild(row('Používá se',
      pp.prah + ' pb · ' + pp.zdroj, 'cmc-strong'));
    if (!k.dost) {
      sek.appendChild(note('Zatím se prah neměří (' + F.num(k.kol || 0) + ' kol,'
        + ' potřeba 250) – jede se podle nastavení v předvolbách.'));
      return sek;
    }

    // co by dal který prah na posledních kolech – ať je vidět, proč právě tenhle
    const hlava = h('div', { class: 'cmc-sit-r cmc-sit-head' },
      h('span', { text: 'prah' }), h('span', { text: 'zdvojeno' }),
      h('span', { text: 'bilance' }), h('span', { text: 'návratnost' }));
    const radky = (k.varianty || []).map(v => h('div', {
      class: 'cmc-sit-r' + (v.prah === k.prah ? ' cmc-pk-win' : '')
    },
      h('span', { class: 'cmc-sit-t', text: '> ' + v.prah + ' pb' }),
      h('span', { text: F.pct(v.zdvoj / k.kol * 100) }),
      h('span', {
        class: v.netto >= 0 ? 'cmc-good' : 'cmc-bad',
        text: F.signed(Math.round(v.netto), ' ante')
      }),
      h('span', {
        class: v.rtp >= 100 ? 'cmc-good' : 'cmc-bad',
        text: v.rtp != null ? F.pct(v.rtp) : '–'
      })));
    sek.appendChild(h('div', { class: 'cmc-sit-tab' }, hlava, ...radky));
    sek.appendChild(note('Spočteno z posledních ' + F.num(k.kol) + ' kol (okno '
      + F.num(k.okno) + '). Přepne se jen na prah, který nulu překoná víc než'
      + ' o vlastní šum – jinak zůstává nula.'));
    sek.appendChild(note('Optimální prah ZÁVISÍ na tom, jak je rozdání zrovna'
      + ' vychýlené, a to se mění po hodinách. Naměřeno na týchž kolech: při'
      + ' poctivém rozdání (+0,3 σ) dal prah 0 návratnost 103,9 % a prah 45 pb'
      + ' jen 100,4 %; při vychýleném (+3,3 a +4,9 σ) to bylo naopak 97,2 % proti'
      + ' 100,1 % u prahu 20 pb. Proto se počítá jen z nedávných kol.'));
    return sek;
  }

  /**
   * Měřicí režim – rozplétá, co vychýlení rozdání způsobuje.
   *
   * Vychýlení se v čase mění (0,95× až 1,51× mezi okny), takže srovnání
   * „před a po“ nic neprokáže. Střídání ante po blocích dá každé podmínce
   * několik různých okamžiků, čímž se oddělí vliv sázky od vlivu času.
   */
  function mereniSekce() {
    const m = NS.poker.mereni();
    const st = NS.poker.mereniStats();
    if (!m && !st.kol) return null;

    const sek = section('Měření: co vychýlení způsobuje'
      + (m ? ' – BĚŽÍ' : ' – zastaveno'));
    if (m) {
      sek.appendChild(row('Právě se hraje',
        'ante ' + m.ante + ' 💎 · blok ' + (m.blok + 1)
        + ' · ' + m.kolVBloku + '/' + m.delka + ' kol', 'cmc-strong'));
      sek.appendChild(row('Podmínky', m.podminky.join(' / ') + ' 💎, bloky po '
        + m.delka + ' kolech'));
    }
    if (!st.kol) {
      sek.appendChild(note('Zatím žádné změřené kolo. Střídá se ante po blocích;'
        + ' každá podmínka tak dostane několik různých okamžiků a půjde oddělit'
        + ' vliv sázky od vlivu času a od předchozích výsledků.'));
      return sek;
    }

    const tabulka = (nazev, radky, prvni) => {
      const hlava = h('div', { class: 'cmc-sit-r cmc-sit-head' },
        h('span', { text: prvni }), h('span', { text: 'kol' }),
        h('span', { text: 'dealer/mělo být' }), h('span', { text: 'poměr' }),
        h('span', { text: 'návratnost' }));
      return h('div', {}, h('div', { class: 'cmc-strong', text: nazev }),
        h('div', { class: 'cmc-sit-tab' }, hlava, ...radky));
    };
    const radek = (popis, o) => h('div', { class: 'cmc-sit-r' },
      h('span', { class: 'cmc-sit-t', text: popis }),
      h('span', { text: F.num(o.kol) }),
      h('span', {
        text: o.dealer != null
          ? F.num(o.dealer) + ' / ' + F.num(Math.round(o.cekano)) : '–'
      }),
      h('span', {
        class: o.pomer == null ? '' : (o.pomer > 1.1 ? 'cmc-bad' : (o.pomer < 0.95 ? 'cmc-good' : '')),
        text: o.pomer != null ? (Math.round(o.pomer * 100) / 100) + '×' : '–',
        title: o.sigma != null ? (Math.round(o.sigma * 10) / 10) + ' σ' : ''
      }),
      h('span', {
        class: o.rtp == null ? '' : (o.rtp >= 100 ? 'cmc-good' : 'cmc-bad'),
        text: o.rtp != null ? F.pct(o.rtp) : '–'
      }));

    sek.appendChild(tabulka('Podle výše sázky',
      st.podminky.map(o => radek('ante ' + o.ante + ' 💎', o)), 'podmínka'));
    sek.appendChild(tabulka('Podle bloku (v čase)',
      st.bloky.map(o => radek('blok ' + (o.blok + 1) + ' · ante ' + o.ante, o)), 'blok'));

    sek.appendChild(note('Podmínky se srovnávají POMĚREM (dostal / měl dostat),'
      + ' ne v σ – σ roste s odmocninou z počtu kol, takže by podmínka s víc'
      + ' koly vypadala vychýleněji, i kdyby byla stejná.'));
    sek.appendChild(note('Když půjde poměr s výší sázky a ne s pořadím bloku, je'
      + ' příčinou sázka. Když půjde s pořadím bloku napříč oběma sázkami, je to'
      + ' čas nebo počet kol. Na rozpoznání rozdílu 1,2× je potřeba ~200 kol na'
      + ' podmínku, na 1,1× asi 780.'));
    return sek;
  }

  /** Rozpis podle rozhodnutí – tady je vidět, jestli má výpočet cenu. */
  function podleRozhodnuti(s) {
    const radek = (nazev, o, popis) => {
      if (!o || !o.n) return null;
      return h('div', { class: 'cmc-sit-r' },
        h('span', { class: 'cmc-sit-t', text: nazev, title: popis }),
        h('span', { text: F.num(o.n) }),
        h('span', { text: o.winRate != null ? F.pct(o.winRate) : '–' }),
        h('span', { class: o.net >= 0 ? 'cmc-good' : 'cmc-bad', text: F.signed(o.net, '💎') }),
        h('span', {
          class: o.rtp >= 100 ? 'cmc-good' : 'cmc-bad',
          text: o.rtp != null ? F.pct(o.rtp) : '–'
        }));
    };
    const hlava = h('div', { class: 'cmc-sit-r cmc-sit-head' },
      h('span', { text: 'rozhodnutí' }), h('span', { text: 'kol' }),
      h('span', { text: 'výher' }), h('span', { text: 'bilance' }),
      h('span', { text: 'návratnost' }));
    const r1 = radek('Vsadit 2× (v převaze)', s.zdvojene,
      'kola, kde výpočet ukázal převahu a sázka se zdvojnásobila');
    const r2 = radek('jen Pokračovat', s.jenAnte,
      'kola, kde převaha nebyla – hraje se za samotné ante');
    if (!r1 && !r2) return null;
    return section('Podle rozhodnutí',
      h('div', { class: 'cmc-sit-tab' }, hlava, ...[r1, r2].filter(Boolean)),
      note('Ve zdvojených kolech má být návratnost výrazně nad 100 %, v ostatních'
        + ' pod – na tom se pozná, že výpočet dělá, co má. Celková návratnost'
        + ' vychází ze simulace kolem ' + CEKANA_RTP + ' %.'));
  }

  function prubeh(ctx) {
    const zapisy = NS.store.get().pkTrace || [];
    const sek = section('Průběh posledních kol (diagnostika)');
    if (!zapisy.length) {
      sek.appendChild(note('Zatím žádný průběh. Zapíše se sám při každém kole,'
        + ' i když skončí chybou – včetně spočítané šance a zvoleného tahu.'));
      return sek;
    }
    const text = NS.poker.traceText(zapisy);
    sek.appendChild(h('pre', { class: 'cmc-bj-trace', text }));
    sek.appendChild(h('div', { class: 'cmc-actions' },
      btn('⬇ Uložit log', () => NS.ui.download('poker-prubeh.txt', text)),
      btn('Kopírovat', async () => {
        try { await navigator.clipboard.writeText(text); } catch (e) { /* bez oprávnění */ }
      }),
      confirmBtn('Smazat průběh', 'Opravdu?', async () => {
        await NS.poker.clearTrace();
        if (ctx && ctx.repaint) ctx.repaint();
      })));
    return sek;
  }

  function render(el, ctx) {
    const s = NS.poker ? NS.poker.stats() : null;
    if (!s) {
      el.appendChild(note('Modul pokeru se nenačetl.'));
      return;
    }

    if (!s.rounds) {
      el.appendChild(section('Poker (#18) – Casino Hold\'em',
        note('Zatím nic. V liště u kasina vyber 🂡 poker (#18) a hraje se samo:'
          + ' po flopu se spočítá šance a při převaze se sázka zdvojnásobí.'),
        section('Změřená pravidla',
          row('Výhra', '1:1 z celkové sázky'),
          row('Remíza', 'sázka zpět'),
          row('Síla kombinace', 'na výplatu NEMÁ vliv'),
          row('Kvalifikace dealera', 'není'),
          row('„Pokračovat“', 'sázka = ante'),
          row('„Vsadit 2×“', 'sázka = 2× ante')),
        section('Proč se tu dá vydělat',
          row('vždy Pokračovat', '98,6 % (EV ≈ 0)'),
          row('zdvojit v převaze', CEKANA_RTP + ' %'),
          row('kickery', 'hra je ignoruje – proto 22 % remíz')),
        note('Hra je symetrická – hráč i dealer mají dvě karty a společný board –'
          + ' takže samotné hraní nevydělá ani neprohraje. Cenu má jen to'
          + ' rozhodnutí: zdvojnásobit tam, kde jsem po flopu favorit. Čísla jsou'
          + ' ze simulace se skutečnými pravidly hry.'),
        note('POZOR na rozptyl: σ ≈ 1,2 ante na kolo proti výhodě 0,13. Po 20'
          + ' kolech je šance na plus 69 %, po 100 kolech 86 %, po 500 kolech'
          + ' 99,3 %. Na krátkém úseku rozhoduje štěstí.'),
        note('A pozor na velikost ante: výhoda i kolísání rostou se sázkou'
          + ' stejně, takže poměr zůstává – ale v absolutních číslech se'
          + ' kolísání zvětší. Kdo vydělá tisíce s malým ante a pak ho zvýší'
          + ' desetinásobně, může celý zisk smazat jedním horším úsekem.')));
      el.appendChild(prubeh(ctx));
      return;
    }

    const dost = s.rounds >= DOST_KOL;
    const sance = sanceNaPlus(s.rounds);

    el.appendChild(grid(
      tile('Vsazeno', F.gems(s.staked), s.rounds + '× kolo, zdvojeno '
        + (s.doubleRate != null ? F.pct(s.doubleRate) : '–')),
      tile('Vráceno', F.gems(s.won),
        s.wins + '× výhra' + (s.winRate != null ? ' (' + F.pct(s.winRate) + ')' : '')),
      tile('Celkem', F.signed(s.net, '💎'),
        s.net >= 0 ? 'jsi v plusu' : 'tolik to zatím vzalo'),
      tile('Návratnost', s.rtp != null ? F.pct(s.rtp) : '–',
        dost ? 'čekáno ~' + CEKANA_RTP + ' %' : 'jen ' + s.rounds + '× – zatím šum')
    ));

    if (!dost) {
      el.appendChild(note('Při ' + s.rounds + ' kolech je šance, že poctivě hraná'
        + ' strategie zatím ukazuje plus, kolem ' + F.pct(sance) + ' – takže'
        + ' z téhle bilance ještě nejde nic vyvozovat. Smysl to dává od '
        + DOST_KOL + ' kol výš, jistotu dá pět stovek.'));
    }

    /*
     * Poctivost rozdání jde PŘED rozpis rozhodnutí schválně: když dealer
     * nedostává náhodné karty, nemá cenu zkoumat, jak dobře se rozhoduje –
     * základní hra je ztrátová sama o sobě a strategie to nepřebije.
     */
    el.appendChild(poctivostRozdani());
    const mer = mereniSekce();
    if (mer) el.appendChild(mer);
    el.appendChild(naucenyPrah());

    const pr = podleRozhodnuti(s);
    if (pr) el.appendChild(pr);

    el.appendChild(section('Rozpis',
      row('Výher', F.num(s.wins) + (s.winRate != null ? ' · ' + F.pct(s.winRate) : '')),
      row('Remíz', F.num(s.pushes) + (s.pushRate != null ? ' · ' + F.pct(s.pushRate) : '')),
      row('Proher', F.num(s.losses)),
      row('Zdvojeno', F.num(s.doubled)
        + (s.doubleRate != null ? ' · ' + F.pct(s.doubleRate) + ' (čekáno ~46 %)' : '')),
      row('Neurčitých', F.num(s.neurcite || 0)),
      row('Nejdelší série bez výhry', F.num(s.maxLossRun) + '×'),
      row('První kolo', kdy(s.firstAt)),
      row('Poslední kolo', kdy(s.lastAt))));

    const t = tabulka(s);
    if (t) el.appendChild(t);

    el.appendChild(prubeh(ctx));

    el.appendChild(section('Data',
      note('Zapisují se jen kola odehraná přes lištu.'),
      h('div', { class: 'cmc-actions' },
        btn('Export CSV', () => {
          const hlava = 'kdy;ante;sazka;zdvojeno;navrch_pb;vysledek;vraceno;rozdil;'
            + 'moje;stul;dealer;mereni_blok;mereni_ante\n';
          const telo = (s.recent || []).map(z => [
            new Date(z.at).toISOString(), z.ante, z.sazka, z.zdvojeno ? 1 : 0,
            z.edge, z.vysledek, z.vraceno, (z.vraceno || 0) - z.sazka,
            z.moje, z.board, z.dealer,
            z.mBlok != null ? z.mBlok + 1 : '', z.mAnte != null ? z.mAnte : ''
          ].join(';')).join('\n');
          NS.ui.download('poker-' + s.rounds + 'kol.csv', hlava + telo, 'text/csv;charset=utf-8');
        }),
        confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
          await NS.poker.reset();
          if (ctx && ctx.repaint) ctx.repaint();
        }))));
  }

  (NS.tabs || (NS.tabs = {})).poker = { label: 'Poker', render };
})();
