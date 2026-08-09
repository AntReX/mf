/* =============================================================================
 * tab-blackjack.js – jak dopadá hra základní strategií
 *
 * Blackjack je jediná hra v kasinu, kde rozhodnutí něco znamená, takže tahle
 * tabulka odpovídá na jinou otázku než ta u automatu: ne „jak moc je hra
 * nevýhodná“, ale „drží se skutečnost toho, co se dá čekat“.
 *
 * Změřená pravidla (37 kol naživo z `win_multiplier`): blackjack 2,5×, výhra 2×,
 * remíza vrací vklad, dealer stojí na 17. Bez double a splitu je i při bezchybné
 * hře výhoda domu kolem 2 %, takže návratnost by se měla dlouhodobě usadit
 * kolem 98 %. Když je výrazně jinde, buď je málo kol, nebo něco nechápu –
 * proto je vedle vždy vidět POČET kol.
 *
 * Podíl blackjacků je užitečná kontrola sama pro sebe: při jednom balíčku má
 * přijít v ~4,8 % kol. Když by byl výrazně nižší, hra nerozdává férově.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, grid, section, note, btn, confirmBtn } = NS.ui;
  const F = NS.fmt;

  /** Pod tolik kol je návratnost šum. */
  const DOST_KOL = 100;
  /** Očekávaná návratnost při bezchybné hře bez double/splitu. */
  const CEKANA_RTP = 98;
  /** Kolik kol má přinést blackjack (jeden balíček). */
  const CEKANO_BJ = 4.8;

  function kdy(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    const dva = n => String(n).padStart(2, '0');
    return dva(d.getDate()) + '.' + dva(d.getMonth() + 1) + '. '
      + dva(d.getHours()) + ':' + dva(d.getMinutes());
  }

  const BARVA = {
    blackjack: 'cmc-good', 'výhra': 'cmc-good', 'remíza': '', prohra: 'cmc-bad'
  };

  /** Posledních N kol: co jsem měl, co dealer, jak to skončilo. */
  function tabulka(s) {
    if (!s.recent || !s.recent.length) return null;
    const hlava = h('div', { class: 'cmc-bj-r cmc-bj-head' },
      h('span', { text: 'kdy' }),
      h('span', { text: 'moje' }),
      h('span', { text: 'dealer' }),
      h('span', { text: 'výsledek' }),
      h('span', { text: 'rozdíl' }));

    const radky = s.recent.map(z => {
      const d = (z.vraceno || 0) - z.sazka;
      return h('div', { class: 'cmc-bj-r' + (d > 0 ? ' cmc-bj-win' : '') },
        h('span', { class: 'cmc-bj-t', text: kdy(z.at) }),
        h('span', {
          class: 'cmc-bj-t',
          text: (z.hraci || '?') + (z.score != null ? ' = ' + z.score : ''),
          // v tazích je vidět, co strategie rozhodla a proti čemu
          title: z.tahy ? 'tahy: ' + z.tahy : ''
        }),
        h('span', { class: 'cmc-bj-t', text: z.dealer || (z.dealerUp ? z.dealerUp + ' + ?' : '?') }),
        h('span', { class: BARVA[z.vysledek] || '', text: z.vysledek }),
        h('span', {
          class: d >= 0 ? 'cmc-good' : 'cmc-bad',
          text: F.signed(d, '💎'),
          title: z.rozpor
            ? 'Hra napsala „' + z.rozpor.titul + '“, ale podle diamantů v HUD to'
              + ' bylo ' + z.rozpor.hud + '. Zapsáno podle titulku.'
            : ''
        }));
    });

    return section('Posledních ' + s.recent.length + ' kol',
      h('div', { class: 'cmc-bj-tab' }, hlava, ...radky));
  }

  /**
   * Průběh posledních kol krok za krokem. Je to ladicí nástroj: hlášky tohohle
   * modulu už dvakrát ukazovaly jinam, než kde byla příčina (tlačítko vs.
   * neoživený fragment), takže tady je vidět celý sled – co bylo v okně, na co
   * se kliklo, jak dlouho se čekalo.
   */
  function prubeh(ctx) {
    const zapisy = NS.store.get().bjTrace || [];
    const sek = section('Průběh posledních kol (diagnostika)');
    if (!zapisy.length) {
      sek.appendChild(note('Zatím žádný průběh. Zapíše se sám při každém kole,'
        + ' i když skončí chybou.'));
      return sek;
    }

    const text = NS.blackjack.traceText(zapisy);
    const pre = h('pre', { class: 'cmc-bj-trace', text });
    sek.appendChild(pre);
    sek.appendChild(note('Nejnovější kolo je nahoře. Drží se posledních '
      + NS.blackjack.TRACE_KOL + ' kol. Řádky s VELKÝMI písmeny (SELHALO, CHYBA)'
      + ' jsou místa, kde se to zaseklo.'));
    sek.appendChild(h('div', { class: 'cmc-actions' },
      btn('⬇ Uložit log', () => NS.ui.download('blackjack-prubeh.txt', text)),
      btn('Kopírovat', async () => {
        try { await navigator.clipboard.writeText(text); } catch (e) { /* bez oprávnění */ }
      }),
      confirmBtn('Smazat průběh', 'Opravdu?', async () => {
        await NS.blackjack.clearTrace();
        if (ctx && ctx.repaint) ctx.repaint();
      })));
    return sek;
  }

  /**
   * Rozpis podle situací. Strategii to nezlepší (je optimum), ale ukáže dvě věci,
   * které z celkové bilance nejsou vidět: jestli hra není v některých situacích
   * zaujatá, a kde bere nejvíc.
   */
  function rozpis(s) {
    const sit = NS.blackjack.situace();
    if (!sit.kol) return null;

    const tabulka = (nazev, data, kategorie) => {
      const hlava = h('div', { class: 'cmc-sit-r cmc-sit-head' },
        h('span', { text: nazev }),
        h('span', { text: 'kol' }),
        h('span', { text: 'výher' }),
        h('span', { text: 'bilance' }),
        h('span', { text: 'návratnost' }));
      const radky = kategorie.map(k => {
        const c = data[k.key];
        if (!c) return null;
        /*
         * Malý počet kol se označuje: v pěti kolech je návratnost cokoli, a bez
         * téhle značky by z toho někdo (i já) vyvozoval závěry.
         */
        const malo = c.n < 15;
        return h('div', { class: 'cmc-sit-r' },
          h('span', { class: 'cmc-sit-t', text: k.label }),
          h('span', { text: F.num(c.n) + (malo ? ' ⚠' : '') }),
          h('span', { text: c.winRate != null ? F.pct(c.winRate) : '–' }),
          h('span', { class: c.net >= 0 ? 'cmc-good' : 'cmc-bad', text: F.signed(c.net, '💎') }),
          h('span', {
            class: malo ? '' : (c.rtp >= 98 ? 'cmc-good' : 'cmc-bad'),
            text: c.rtp != null ? F.pct(c.rtp) : '–',
            title: malo ? 'málo kol – tohle číslo nic neříká' : ''
          }));
      }).filter(Boolean);
      return h('div', { class: 'cmc-sit-tab' }, hlava, ...radky);
    };

    // kde to bere nejvíc – jen z kombinací, kde je aspoň něco k vidění
    const nejhorsi = Object.entries(sit.mrizka)
      .filter(([, c]) => c.n >= 8)
      .sort((a, b) => a[1].rtp - b[1].rtp)[0];

    const sek = section('Rozpis podle situací (' + sit.kol + ' kol)',
      tabulka('moje ruka', sit.ruka, sit.SKUPINY),
      h('div', { class: 'cmc-sit-mezera' }),
      tabulka('karta dealera', sit.dealer, sit.DEALER_KAT));

    if (nejhorsi) {
      const [klic, c] = nejhorsi;
      const [ruka, dealer] = klic.split('|');
      const jmenoRuky = (sit.SKUPINY.find(x => x.key === ruka) || {}).label || ruka;
      const jmenoDealera = (sit.DEALER_KAT.find(x => x.key === dealer) || {}).label || dealer;
      sek.appendChild(note('Nejvíc bere: ' + jmenoRuky + ' proti ' + jmenoDealera
        + ' – ' + c.n + '× za ' + F.signed(c.net, '💎')
        + ' (návratnost ' + F.pct(c.rtp) + ').'));
    }

    sek.appendChild(note('Strategie je pro tahle pravidla optimum, takže rozpis'
      + ' není na její ladění – slouží ke kontrole, že hra rozdává férově.'
      + ' Řádky s ⚠ mají pod 15 kol a jejich čísla nic neříkají.'
      + ' Kola s nepřečteným výsledkem se do rozpisu nepočítají.'));
    return sek;
  }

  function render(el, ctx) {
    const s = NS.blackjack ? NS.blackjack.stats() : null;
    if (!s) {
      el.appendChild(note('Modul blackjacku se nenačetl.'));
      return;
    }

    if (!s.rounds) {
      el.appendChild(section('Blackjack (#18)',
        note('Zatím nic. V liště u kasina vyber 🃏 blackjack (#18) a hraje se samo'
          + ' – základní strategií, kolo za kolem, za sázku z toho pole'
          + ' (v diamantech).'),
        section('Změřená pravidla',
          row('Blackjack', '2,5× vklad (3:2)'),
          row('Výhra', '2× vklad (1:1)'),
          row('Remíza', 'vklad zpět'),
          row('Dealer', 'stojí na 17'),
          row('Double / split', 'nejsou')),
        note('Bez double a splitu se výhoda domu nedá stlačit pod ~2 %, takže'
          + ' i bezchybná hra dlouhodobě prohrává. Počítání karet nepomůže: hra'
          + ' míchá po každém rozdání, což je ověřené na barvách karet.')));
      /*
       * Průběh se ukazuje i tady – když se ani jedno kolo nedohrálo, je to
       * přesně to jediné, co se dá číst.
       */
      el.appendChild(prubeh(ctx));
      return;
    }

    const dost = s.rounds >= DOST_KOL;

    el.appendChild(grid(
      tile('Vsazeno', F.gems(s.staked), s.rounds + '× kolo, průměr ' + F.gems(Math.round(s.avgStake))),
      tile('Vráceno', F.gems(s.won),
        s.wins + '× výhra' + (s.winRate != null ? ' (' + F.pct(s.winRate) + ')' : '')),
      tile('Celkem', F.signed(s.net, '💎'),
        s.net >= 0 ? 'jsi v plusu' : 'tolik to zatím vzalo'),
      tile('Návratnost', s.rtp != null ? F.pct(s.rtp) : '–',
        dost ? 'čekáno ~' + CEKANA_RTP + ' %' : 'jen ' + s.rounds + '× – zatím šum')
    ));

    if (!dost) {
      el.appendChild(note('Návratnost má smysl číst od ' + DOST_KOL + ' kol výš.'
        + ' Jeden blackjack navíc s ní na malém počtu pohne o jednotky procent.'));
    } else {
      const rozdil = s.rtp - CEKANA_RTP;
      el.appendChild(note('Při bezchybné hře bez double a splitu se čeká'
        + ' návratnost kolem ' + CEKANA_RTP + ' %. Teď je '
        + F.pct(s.rtp) + ', tedy ' + (rozdil >= 0 ? '+' : '') + F.pct(rozdil)
        + ' proti očekávání – ' + (Math.abs(rozdil) < 3
          ? 'to je v rámci rozptylu.'
          : 'to už je odchylka, která na tomhle počtu kol stojí za pozornost.')));
    }

    el.appendChild(section('Rozpis kol',
      row('Výher', F.num(s.wins) + (s.winRate != null ? ' · ' + F.pct(s.winRate) : '')),
      row('Z toho blackjack', F.num(s.blackjacks)
        + (s.bjRate != null ? ' · ' + F.pct(s.bjRate) + ' (čekáno ~' + CEKANO_BJ + ' %)' : '')),
      row('Remíz', F.num(s.pushes) + (s.pushRate != null ? ' · ' + F.pct(s.pushRate) : '')),
      row('Proher', F.num(s.losses)),
      row('Neurčitých', F.num(s.neurcite || 0)
        + (s.neurcite ? ' – výsledek se nepřečetl, do bilance se nepočítají' : '')),
      row('Nejdelší série bez výhry', F.num(s.maxLossRun) + '×'),
      row('Teď bez výhry', F.num(s.lossRun) + '×'),
      row('První kolo', kdy(s.firstAt)),
      row('Poslední kolo', kdy(s.lastAt))));

    const r = rozpis(s);
    if (r) el.appendChild(r);

    const t = tabulka(s);
    if (t) el.appendChild(t);

    el.appendChild(prubeh(ctx));

    el.appendChild(section('Data',
      note('Zapisují se jen kola odehraná přes lištu. Co odehraješ ručně'
        + ' v herním okně, rozšíření nevidí.'),
      h('div', { class: 'cmc-actions' },
        btn('Export CSV', () => {
          const hlava = 'kdy;sazka;vraceno;rozdil;vysledek;moje;score;dealer;tahy\n';
          const telo = (s.recent || []).map(z => [
            new Date(z.at).toISOString(), z.sazka, z.vraceno || 0,
            (z.vraceno || 0) - z.sazka, z.vysledek, z.hraci, z.score,
            z.dealer, z.tahy
          ].join(';')).join('\n');
          NS.ui.download('blackjack-' + s.rounds + 'kol.csv', hlava + telo,
            'text/csv;charset=utf-8');
        }),
        confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
          await NS.blackjack.reset();
          if (ctx && ctx.repaint) ctx.repaint();
        }))));
  }

  (NS.tabs || (NS.tabs = {})).blackjack = { label: 'Blackjack', render };
})();
