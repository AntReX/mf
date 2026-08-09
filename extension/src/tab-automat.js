/* =============================================================================
 * tab-automat.js – kolik automat (#18) sebral a kolik vrátil
 *
 * Jediný účel: na vlastních datech vidět, jak (ne)výhodná ta hra je. Hra sama
 * nikde nesčítá, co jsi do automatu vložil – v okně je vždycky jen poslední
 * zatočení, a to zmizí, jak zavřeš budovu.
 *
 * Klíčové číslo je NÁVRATNOST: kolik z každé vložené koruny se vrátilo. U hry
 * s férovou nulovou výhodou by dlouhodobě sedělo na 100 %; co je pod tím, je
 * výhoda domu. Osm zatočení za 10 Kč při ověřování dalo 9 Kč zpátky z 80,
 * tedy 11 % – ale osm zatočení nedokazuje nic, proto je vedle vždy vidět
 * i POČET zatočení. Na malých počtech je to číslo jen šum.
 *
 * Vede se i to, co je vidět v tabulce jinak nespolehlivě: nejvyšší jednotlivá
 * výhra, nejdelší série bez výhry a rozpory mezi textem hry a HUD.
 *
 * Sbírá se jen to, co proběhne přes lištu (ruční zatočení v herním okně
 * rozšíření nevidí) a tabulka to říká nahlas, ať čísla nevypadají úplnější,
 * než jsou.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, grid, section, note, btn, confirmBtn } = NS.ui;
  const F = NS.fmt;

  /** Kdy má návratnost vypovídací hodnotu – pod tím je to šum. */
  const DOST_ZATOCENI = 100;

  function kdy(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    const dva = n => String(n).padStart(2, '0');
    return dva(d.getDate()) + '.' + dva(d.getMonth() + 1) + '. '
      + dva(d.getHours()) + ':' + dva(d.getMinutes());
  }

  /** Tabulka posledních zatočení – sázka, výhra, rozdíl. */
  function tabulka(s) {
    if (!s.recent || !s.recent.length) return null;
    const hlava = h('div', { class: 'cmc-slots-r cmc-slots-head' },
      h('span', { text: 'kdy' }),
      h('span', { text: 'vloženo' }),
      h('span', { text: 'vyhráno' }),
      h('span', { text: 'rozdíl' }));

    const radky = s.recent.map(z => {
      const d = z.won - z.amount;
      return h('div', { class: 'cmc-slots-r' + (z.won > 0 ? ' cmc-slots-win' : '') },
        h('span', { class: 'cmc-slots-t', text: kdy(z.at) }),
        h('span', { text: F.kc(z.amount) }),
        h('span', { text: z.won > 0 ? F.kc(z.won) : '–' }),
        h('span', {
          class: d >= 0 ? 'cmc-good' : 'cmc-bad',
          text: F.signed(d),
          title: z.rozpor
            ? 'Hra napsala „vyhrál jsi ' + z.rozpor.text + '“, ale podle špinavých'
              + ' peněz v HUD to bylo ' + z.rozpor.hud + '. Platí HUD.'
            : ''
        }));
    });

    return section('Posledních ' + s.recent.length + ' zatočení',
      h('div', { class: 'cmc-slots-tab' }, hlava, ...radky));
  }

  function render(el, ctx) {
    const s = NS.slots ? NS.slots.stats() : null;
    if (!s) {
      el.appendChild(note('Modul automatu se nenačetl.'));
      return;
    }

    if (!s.spins) {
      el.appendChild(section('Automat (#18)',
        note('Zatím nic. Zapni v liště u kasina volbu ' + '🎰' + ' automat (#18)'
          + ' – bude se točit za částku, kterou tam máš zadanou, a sem se zapíše'
          + ' každé zatočení.'),
        note('Sázka i rezerva špinavých peněz se berou ze nastavení kasina, aby'
          + ' se totéž nemuselo zadávat dvakrát. Navyšování po prohře se tady'
          + ' NEPOUŽÍVÁ: automat vyplácí i částky menší než sázka, takže'
          + ' martingale, který stojí na jedné pokrývající výhře, nemá o co se'
          + ' opřít.')));
      return;
    }

    const dost = s.spins >= DOST_ZATOCENI;

    el.appendChild(grid(
      tile('Vloženo', F.kc(s.staked, { short: true }),
        s.spins + '× zatočení, průměr ' + F.kc(s.avgStake)),
      tile('Vyhráno', F.kc(s.won, { short: true }),
        s.wins + '× výhra' + (s.winRate != null ? ' (' + F.pct(s.winRate) + ')' : '')),
      tile('Celkem', F.signed(s.net),
        s.net >= 0 ? 'jsi v plusu' : 'tolik automat sebral'),
      tile('Návratnost', s.rtp != null ? F.pct(s.rtp) : '–',
        dost ? 'z každé vložené koruny' : 'jen ' + s.spins + '× – zatím šum')
    ));

    if (!dost) {
      el.appendChild(note('Návratnost má smysl číst od ' + DOST_ZATOCENI
        + ' zatočení výš. Do té doby s ní pohne jedna větší výhra o desítky'
        + ' procent – při ověřování vyšla z osmi zatočení 11 %, což o hře'
        + ' neříká nic.'));
    }

    el.appendChild(section('Podrobnosti',
      row('Zatočení', F.num(s.spins)),
      row('Výher', F.num(s.wins) + (s.winRate != null ? ' · ' + F.pct(s.winRate) : '')),
      row('Průměrná výhra', s.avgWin != null ? F.kc(s.avgWin) : '–'),
      row('Nejvyšší výhra', s.best > 0
        ? F.kc(s.best) + (s.bestStake ? ' (ze sázky ' + F.kc(s.bestStake) + ')' : '')
        : '–'),
      row('Nejdelší série bez výhry', F.num(s.maxLossRun) + '×'),
      row('Teď bez výhry', F.num(s.lossRun) + '×'),
      row('Maximální výhra podle hry',
        '× ' + (NS.slots.MAX_NASOBEK || 6) + ' sázky'),
      row('První zatočení', kdy(s.firstAt)),
      row('Poslední zatočení', kdy(s.lastAt))));

    const t = tabulka(s);
    if (t) el.appendChild(t);

    el.appendChild(section('Data',
      note('Zapisuje se jen to, co proběhne přes lištu. Co zatočíš ručně'
        + ' v herním okně, rozšíření nevidí – hra o tom nikde nepíše.'),
      h('div', { class: 'cmc-actions' },
        btn('Export CSV', () => {
          const hlava = 'kdy;vlozeno;vyhrano;rozdil\n';
          const telo = (s.recent || []).map(z =>
            [new Date(z.at).toISOString(), z.amount, z.won, z.won - z.amount].join(';')).join('\n');
          NS.ui.download('automat-' + s.spins + 'x.csv', hlava + telo, 'text/csv;charset=utf-8');
        }),
        confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
          await NS.slots.reset();
          if (ctx && ctx.repaint) ctx.repaint();
        }))));
  }

  (NS.tabs || (NS.tabs = {})).automat = { label: 'Automat', render };
})();
