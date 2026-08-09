/* =============================================================================
 * tab-prijmy.js – co doopravdy přinesla mzda a nevěstinec
 *
 * Hra ani jedno nesčítá: v okně je vždycky jen to, co čeká teď, a jak to
 * vybereš, zmizí. Tady je součet za celou dobu, s rozpisem na měny podle toho,
 * čím která budova platí:
 *
 *   Mzda (#9)        čisté peníze + diamanty
 *   Nevěstinec (#19) špinavé peníze
 *
 * U mzdy je zajímavější sazba za HODINU práce než na výběr – hodiny se sčítají
 * z toho, co okno hlásilo před výběrem. Zaokrouhlení na celé hodiny je v textu
 * hry, takže je to odhad, ne přesné číslo.
 *
 * Neurčité výběry jsou ty, u kterých se HUD nepohnul; u mzdy se doplní částkou
 * z okna, u nevěstince zůstanou nulové. Vede se to zvlášť, aby čísla nelhala.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const { h, row, tile, grid, section, note, btn, confirmBtn } = NS.ui;
  const F = NS.fmt;

  function kdy(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    const dva = n => String(n).padStart(2, '0');
    return dva(d.getDate()) + '.' + dva(d.getMonth() + 1) + '. '
      + dva(d.getHours()) + ':' + dva(d.getMinutes());
  }

  /** Kolik toho zdroj přinesl, v měnách, kterými platí. */
  function castka(z) {
    const c = [];
    if (z.meny.includes('kc') && z.kc) c.push(F.kc(z.kc, { short: true }));
    if (z.meny.includes('dirty') && z.dirty) c.push(F.kc(z.dirty, { short: true }) + ' špinavých');
    if (z.meny.includes('gems') && z.gems) c.push(F.gems(z.gems));
    // co přišlo mimo očekávané měny, se přizná – radši než zahodit
    for (const [k, jm] of [['kc', ''], ['dirty', ' špinavých'], ['gems', '']]) {
      if (!z.meny.includes(k) && z[k]) {
        c.push((k === 'gems' ? F.gems(z[k]) : F.kc(z[k], { short: true }) + jm) + ' (!)');
      }
    }
    return c.length ? c.join(' + ') : '–';
  }

  function karta(z) {
    const sek = section(z.label);
    if (!z.n) {
      sek.appendChild(note('Zatím žádný výběr. Zapíše se sám, jak se vybere –'
        + ' ručně tlačítkem v liště i automatikou.'));
      return sek;
    }

    sek.appendChild(row('Výběrů', F.num(z.n)
      + (z.neurcite ? ' · z toho ' + z.neurcite + '× nezměřeno z HUD' : '')));
    /*
     * Souhrn všech měn, které z téhle budovy skutečně přišly – včetně těch,
     * kterými by platit neměla. Ty se označí „(!)“, protože zahodit je do
     * nesprávné kolonky by bylo horší než je přiznat.
     */
    sek.appendChild(row('Přišlo celkem', castka(z), 'cmc-strong'));
    if (z.meny.includes('kc')) {
      sek.appendChild(row('Čisté peníze', F.kc(z.kc), 'cmc-strong'));
      if (z.kcNaVyber) sek.appendChild(row('na výběr', F.kc(z.kcNaVyber)));
    }
    if (z.meny.includes('dirty')) {
      sek.appendChild(row('Špinavé peníze', F.kc(z.dirty), 'cmc-strong'));
      if (z.dirtyNaVyber) sek.appendChild(row('na výběr', F.kc(z.dirtyNaVyber)));
    }
    if (z.meny.includes('gems')) {
      sek.appendChild(row('Diamanty', F.gems(z.gems), 'cmc-strong'));
      if (z.gemsNaVyber) sek.appendChild(row('na výběr', F.gems(Math.round(z.gemsNaVyber * 10) / 10)));
    }
    if (z.hodin) {
      sek.appendChild(row('Odpracováno', F.num(z.hodin) + ' h'));
      if (z.kcNaHodinu) sek.appendChild(row('sazba', F.kc(z.kcNaHodinu) + '/h'));
      if (z.gemsNaHodinu) {
        sek.appendChild(row('diamanty za hodinu',
          F.num(Math.round(z.gemsNaHodinu * 100) / 100) + ' 💎/h'));
      }
    }
    sek.appendChild(row('První výběr', kdy(z.firstAt)));
    sek.appendChild(row('Poslední', kdy(z.lastAt)));

    // posledních pár výběrů – ať je vidět, jestli jsou částky stabilní
    const poslednich = (z.recent || []).slice(0, 8);
    if (poslednich.length) {
      const radky = poslednich.map(r => {
        const casti = [];
        if (r.kc) casti.push(F.kc(r.kc, { short: true }));
        if (r.dirty) casti.push(F.kc(r.dirty, { short: true }) + ' šp.');
        if (r.gems) casti.push(F.gems(r.gems));
        return h('div', { class: 'cmc-sit-r' },
          h('span', { class: 'cmc-sit-t', text: kdy(r.at) }),
          h('span', {
            text: casti.join(' + ') || '–',
            class: r.neurcity ? 'cmc-bad' : '',
            title: (r.popis ? r.popis + ' · ' : '') + 'zdroj čísla: ' + r.zdrojCisla
          }),
          h('span', { class: 'cmc-sit-t', text: r.hodin != null ? r.hodin + ' h' : '' }));
      });
      sek.appendChild(h('div', { class: 'cmc-sit-tab' },
        h('div', { class: 'cmc-sit-r cmc-sit-head' },
          h('span', { text: 'kdy' }), h('span', { text: 'přišlo' }), h('span', { text: '' })),
        ...radky));
    }
    return sek;
  }

  /**
   * Kámen–Nůžky–Papír (#17) – vede se zvlášť od mzdy a nevěstince, protože se
   * měří něčím jiným.
   *
   * U budov se měří PŘÍRŮSTEK v HUD po výběru. Tady to nejde: vytvořením se
   * jen vyvěsí výzva (sázka se strhne hned) a výsledek přijde, až ji někdo
   * přijme – klidně za hodinu, kdy do špinavých peněz zároveň teče nevěstinec.
   * Výhru by tedy nešlo od běžného příjmu oddělit. Eviduje se proto jen to,
   * co je měřitelné: kolik výzev se vypsalo, za kolik, kolik čeká a kolik už
   * někdo přijal.
   */
  function kamenNuzkyPapir(ctx) {
    if (!NS.rps) return null;
    const s = NS.rps.stats();
    const v = s.vysledky;
    const sek = section('Kámen–Nůžky–Papír (#17)');
    if (!s.n && !v.dohrano) {
      sek.appendChild(note('Zatím nic. Výzva se vypisuje tlačítkem v liště –'
        + ' zadáš částku ve špinavých penězích a znamení se zvolí náhodně.'));
      return sek;
    }

    /*
     * Skutečná bilance se čte ZE ZPRÁV hry („Vyhrál jsi 190…“), ne z HUD:
     * výsledek přijde, až výzvu někdo přijme, a to klidně za hodinu, kdy do
     * špinavých peněz zároveň teče nevěstinec. Ze zpráv jde navíc započítat
     * i hry vypsané ručně ve hře, takže počty se s „vypsáno tlačítkem“ nemusí
     * shodovat.
     */
    if (v.dohrano) {
      sek.appendChild(grid(
        tile('Vsazeno', F.kc(v.vsazeno, { short: true }),
          F.num(v.dohrano) + '× dohráno'),
        tile('Vráceno', F.kc(v.vraceno, { short: true }),
          v.uspesnost != null ? F.pct(v.uspesnost) + ' výher' : ''),
        tile('Bilance', F.signed(v.bilance, ' Kč'),
          v.bilance >= 0 ? 'jsi v plusu' : 'tolik to vzalo'),
        tile('Návratnost', v.rtp != null ? F.pct(v.rtp) : '–', 'čekáno ~96,7 %')
      ));
      sek.appendChild(row('Výher', F.num(v.vyhry)
        + (v.uspesnost != null ? ' · ' + F.pct(v.uspesnost) : '')));
      sek.appendChild(row('Remíz', F.num(v.remizy)));
      sek.appendChild(row('Proher', F.num(v.prohry)));
    }

    if (s.n) {
      sek.appendChild(row('Vypsáno tlačítkem', F.num(s.n)
        + ' · ' + F.kc(s.vsazeno)));
      const zn = s.znameni || {};
      if (Object.keys(zn).length) {
        sek.appendChild(row('Znamení', Object.entries(NS.rps.POPIS)
          .map(([k, p]) => p + ' ' + F.num(zn[k] || 0)).join(' · ')));
      }
      sek.appendChild(row('Čeká na soupeře',
        F.num(s.ceka) + (s.cekaCastka ? ' · ' + F.kc(s.cekaCastka) : '')));
      sek.appendChild(row('První výzva', kdy(s.firstAt)));
      sek.appendChild(row('Poslední', kdy(s.lastAt)));
    }
    if (s.kontrolaAt) sek.appendChild(row('Zprávy čteny', kdy(s.kontrolaAt)));

    sek.appendChild(note('Bilance se počítá ZE ZPRÁV hry („Vyhrál jsi 190 ve hře'
      + ' kámen-nůžky-papír“), protože výsledek přijde až později – v HUD by se'
      + ' nedal odlišit od příjmu z nevěstince. Výhra je 1,9× sázky (sázka zpět'
      + ' plus soupeřova mínus 10 % poplatku), takže ze „Vyhrál jsi 190“ plyne'
      + ' sázka 100 a čistý zisk 90.'));
    sek.appendChild(note('Zprávy se čtou samy, nejvýš jednou za minutu. Hra je po'
      + ' čase maže (a jde na ně „Smazat vše“), takže co se nestihne přečíst, je'
      + ' pryč – proto se kontroluje průběžně, ne až při otevření panelu.'));
    sek.appendChild(note('Na výdělek to není: z výhry si hra bere 10 %, takže'
      + ' proti náhodnému soupeři je návratnost 96,7 % (−3,3 % na hru).'));

    sek.appendChild(h('div', { class: 'cmc-actions' },
      btn('Načíst zprávy teď', async () => {
        const r2 = await NS.rps.nactiVysledky();
        if (ctx && ctx.repaint) ctx.repaint();
        if (r2 && r2.chyba) NS.gym.setStatus('⚠ KNP: ' + r2.chyba, true);
      }),
      btn('Zkontrolovat čekající', async () => {
        const r2 = await NS.rps.zkontroluj();
        if (ctx && ctx.repaint) ctx.repaint();
        if (r2 && r2.chyba) NS.gym.setStatus('⚠ KNP: ' + r2.chyba, true);
      }),
      confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
        await NS.rps.reset();
        if (ctx && ctx.repaint) ctx.repaint();
      })));
    return sek;
  }

  /**
   * Banka (#22) – praní špinavých peněz.
   *
   * Vede se zvlášť od budov: nejde o příjem, ale o SMĚNU se ztrátou. Hra si
   * bere 30 %, takže „vypráno“ a „sebráno“ nikdy nesedí – rozdíl je poplatek.
   * A protože jsou to dva kroky (praní odebere špinavé, sebrání připíše čisté),
   * může mezi nimi něco viset nevyzvednuté.
   */
  function banka(ctx) {
    if (!NS.bank) return null;
    const s = NS.bank.stats();
    const sek = section('Banka (#22) – praní peněz');
    if (!s.prani && !s.sebrani) {
      sek.appendChild(note('Zatím nic. Pere se tlačítkem 🧼 v liště – vždy'
        + ' maximum, které hra nabídne.'));
      return sek;
    }
    sek.appendChild(row('Praní', F.num(s.prani) + '× · vypráno ' + F.kc(s.vyprano)));
    sek.appendChild(row('Sebráno', F.num(s.sebrani) + '× · ' + F.kc(s.sebrano),
      'cmc-strong'));
    sek.appendChild(row('Poplatek hry (30 %)', F.kc(s.poplatek), 'cmc-bad'));
    if (s.vyprano && s.sebrano) {
      const rozdil = Math.round(s.vyprano * 0.7) - s.sebrano;
      if (rozdil > 0) {
        sek.appendChild(row('Ještě nevyzvednuto', F.kc(rozdil) + ' (odhad)',
          'cmc-bad'));
      }
    }
    sek.appendChild(row('První praní', kdy(s.firstAt)));
    sek.appendChild(row('Poslední', kdy(s.lastAt)));
    sek.appendChild(note('Praní není příjem, ale směna se ztrátou: ze 100 Kč'
      + ' špinavých je 70 Kč čistých. „Vypráno“ je to, co odešlo špinavé,'
      + ' „sebráno“ to, co přišlo čisté – rozdíl je poplatek hry.'));
    sek.appendChild(note('Jsou to dva kroky a mezi nimi peníze leží v budově,'
      + ' takže se vyplatí sbírat dřív, než se pere znovu. Automatika to tak'
      + ' dělá sama.'));
    sek.appendChild(h('div', { class: 'cmc-actions' },
      confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
        await NS.bank.reset();
        if (ctx && ctx.repaint) ctx.repaint();
      })));
    return sek;
  }

  function render(el, ctx) {
    const s = NS.prijmy ? NS.prijmy.stats() : null;
    if (!s) {
      el.appendChild(note('Modul příjmů se nenačetl.'));
      return;
    }

    const c = s.celkem;
    el.appendChild(grid(
      tile('Čisté peníze', F.kc(c.kc, { short: true }), 'ze mzdy'),
      tile('Špinavé peníze', F.kc(c.dirty, { short: true }), 'z nevěstince'),
      tile('Diamanty', F.gems(c.gems), 'ze mzdy'),
      tile('Výběrů', F.num(c.n), 'celkem z obou budov')
    ));

    for (const z of Object.values(s.zdroje)) el.appendChild(karta(z));

    const knp = kamenNuzkyPapir(ctx);
    if (knp) el.appendChild(knp);

    const bnk = banka(ctx);
    if (bnk) el.appendChild(bnk);

    el.appendChild(section('Jak se to měří',
      note('Po každém výběru se počká, až se pohne HUD, a zapíše se rozdíl –'
        + ' peníze, špinavé peníze i diamanty zvlášť. Hra totiž nikde neuvádí,'
        + ' co přišlo, a u nevěstince ani předem neřekne přesnou částku.'),
      note('Když se HUD nepohne, u mzdy se doplní částka z okna („vydělal 882,40 Kč'
        + ' + 0“) a výběr se označí jako nezměřený; u nevěstince zůstane nula.'
        + ' Automatika je sériová, takže do měření nemůže spadnout jiný příjem –'
        + ' u ručního kliknutí to vyloučit nejde.'),
      h('div', { class: 'cmc-actions' },
        btn('Export CSV', () => {
          const hlava = 'zdroj;kdy;cista;spinava;diamanty;hodin;zdroj_cisla\n';
          const telo = Object.entries(s.zdroje).flatMap(([k, z]) =>
            (z.recent || []).map(r => [k, new Date(r.at).toISOString(),
              r.kc, r.dirty, r.gems, r.hodin == null ? '' : r.hodin, r.zdrojCisla].join(';'))
          ).join('\n');
          NS.ui.download('prijmy-budov.csv', hlava + telo, 'text/csv;charset=utf-8');
        }),
        confirmBtn('Vynulovat', 'Opravdu vynulovat?', async () => {
          await NS.prijmy.reset();
          if (ctx && ctx.repaint) ctx.repaint();
        }))));
  }

  (NS.tabs || (NS.tabs = {})).prijmy = { label: 'Příjmy', render };
})();
