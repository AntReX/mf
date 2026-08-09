/* Záložky panelu: že se registrují ve správném pořadí, vykreslí se bez výjimky
 * a že „Doprava“ ukazuje výdělek per prostředek. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location', 'Blob', 'URL', 'SVGElement'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };

/* stejné pořadí, jaké má manifest – ať test hlídá i to */
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const soubory = manifest.content_scripts[0].js.filter(f => f !== 'content.js');
for (const f of soubory) new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

let fails = 0;
const norm = x => String(x).replace(/[\s\u00a0\u202f]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };

(async () => {
  await CMC.store.load();

  console.log('\n[panel] záložky, jak je opravdu VYKRESLÍ panel');
  /*
   * Tohle je to podstatné: registrace v NS.tabs nestačí. panel.js má vlastní
   * TAB_ORDER a když v něm klíč není, záložka se nevykreslí – zaregistrovaná
   * „doprava“ tak byla úplně neviditelná a test na Object.keys(NS.tabs) to
   * neodhalil.
   */
  D.body.innerHTML = '';
  CMC.panel.build();
  CMC.panel.render();
  const panelEl = D.getElementById('cmc-panel');
  ok('panel se postavil', !!panelEl);
  const vykreslene = [...panelEl.querySelectorAll('.cmc-tabs:not(.cmc-tabs-sub) .cmc-tab')]
    .map(b => b.textContent.trim());
  eq('vykreslené záložky', vykreslene.join(' · '), 'Stav · Doprava · Příjmy · Automat · Blackjack · Poker · Historie · Předměty · Trh');

  console.log('\n[záložky] lišta se ZABALUJE, jinak poslední záložka zmizí');
  /*
   * !!! TÍMHLE SE „ZTRATILA“ KARTA TRH !!!
   * Záložky měly `flex: 1`, tedy `flex-basis: 0` – všechny se vždycky vejdou na
   * jeden řádek a jen se zúží. Text se ale nezúží, takže od devíté záložky obsah
   * přetekl (naměřeno v běžící hře 428 px do šířky 338) a protože panel má
   * `overflow: hidden`, byla poslední záložka odříznutá ZA hranou – bez posuvníku
   * a bez vodítka, že tam je. Vypadalo to, že se karta vůbec nepřidala.
   *
   * jsdom layout nepočítá, takže se kontroluje PRAVIDLO – to je tady ta příčina.
   */
  const css = fs.readFileSync(path.join(EXT, 'panel.css'), 'utf8');
  const pravidloTabs = css.slice(css.indexOf('#cmc-panel .cmc-tabs {'),
    css.indexOf('}', css.indexOf('#cmc-panel .cmc-tabs {')));
  const pravidloTab = css.slice(css.indexOf('#cmc-panel .cmc-tab {'),
    css.indexOf('}', css.indexOf('#cmc-panel .cmc-tab {')));
  ok('lišta se zabaluje', /flex-wrap:\s*wrap/.test(pravidloTabs));
  ok('záložka NEMÁ flex-basis 0', !/flex:\s*1\s*;/.test(pravidloTab));
  ok('ale roste podle obsahu', /flex:\s*1\s+1\s+auto/.test(pravidloTab));
  ok('a text se nezalamuje uvnitř záložky', /white-space:\s*nowrap/.test(pravidloTab));
  ok('záložek je dost, aby na tom záleželo', vykreslene.length >= 9);
  ok('Doprava je mezi nimi', vykreslene.includes('Doprava'));

  console.log('\n[panel] nová záložka se ukáže i bez dopsání do TAB_ORDER');
  CMC.tabs.pokus = { label: 'Pokus', render: b => b.appendChild(D.createElement('div')) };
  CMC.panel.render();
  const s2 = [...D.querySelectorAll('#cmc-panel .cmc-tabs:not(.cmc-tabs-sub) .cmc-tab')]
    .map(b => b.textContent.trim());
  ok('přidá se na konec', s2[s2.length - 1] === 'Pokus');
  ok('a pořadí zbytku zůstane',
    s2.slice(0, 8).join(',') === 'Stav,Doprava,Příjmy,Automat,Blackjack,Poker,Historie,Předměty');
  delete CMC.tabs.pokus;

  console.log('\n[záložky] registrace vs. zobrazení');
  /*
   * `NS.tabs` je v pořadí NAČÍTÁNÍ souborů, kdežto v panelu rozhoduje `TAB_ORDER`.
   * Tyhle dvě věci se pletou (jednou už to zamaskovalo, že Doprava nebyla vidět),
   * takže se testují zvlášť – zobrazení výš přes skutečně vykreslený panel.
   */
  eq('registrované záložky', Object.keys(CMC.tabs).join(','), 'stav,doprava,historie,predmety,trh,automat,blackjack,poker,prijmy');
  eq('popisky', Object.values(CMC.tabs).map(t => t.label).join(' · '), 'Stav · Doprava · Historie · Předměty · Trh · Automat · Blackjack · Poker · Příjmy');
  ok('Ekonomika už není', !CMC.tabs.ekonomika);
  ok('její soubor se nenačítá', !soubory.includes('src/tab-ekonomika.js'));
  ok('ale econ.js zůstal – Stav a Historie ho potřebují', !!CMC.econ && soubory.includes('src/econ.js'));
  ok('a recepty ve nastavení taky', Array.isArray(CMC.store.get().econ.recipes));

  console.log('\n[záložky] každá se vykreslí bez výjimky');
  const ctx = { state: { buildings: [], hud: {}, at: 0 }, refresh() {}, rescheduleAuto() {}, rerender() {} };
  for (const key of Object.keys(CMC.tabs)) {
    const body = D.createElement('div');
    let chyba = null;
    try { CMC.tabs[key].render(body, ctx); } catch (e) { chyba = e.message; }
    eq(key + ' se vykreslí', chyba || 'ok', 'ok');
    ok(key + ' něco vypsal', body.childNodes.length > 0);
  }

  console.log('\n[doprava] prázdná evidence to řekne');
  {
    const body = D.createElement('div');
    CMC.tabs.doprava.render(body, ctx);
    ok('poradí, kde se to plní', /sebrání peněz, které uděláš tlačítkem v liště/.test(norm(body.textContent)));
  }

  console.log('\n[doprava] výdělky bez rozpadu vysvětlí, proč rozpad chybí');
  // takhle vypadají starší záznamy: výdělek ano, cargo ne
  await CMC.store.put('fleetLog', {
    plane: { 1: { name: 'Grasswing', runs: 5, total: 900, lost: 0, first: 1, last: Date.now() } },
    boat: {}
  });
  {
    const b = D.createElement('div');
    CMC.tabs.doprava.render(b, ctx);
    const txt = norm(b.textContent);
    ok('výdělek je vidět', /Grasswing/.test(txt));
    ok('a bez rozpadu se čistý zisk netvrdí', /chybí rozpad podle suroviny/.test(txt));
    ok('a je vysvětleno, proč chybí rozpad', /potřebuje celý cyklus přes lištu/.test(txt));
    ok('včetně toho, že ruční odeslání se nepočítá', /odeslané ručně v herním okně/.test(txt));
  }

  console.log('\n[doprava] s daty ukáže výdělek per prostředek');
  await CMC.store.put('fleetLog', {
    plane: { 1: { name: 'Grasswing', runs: 12, total: 4512, lost: 0, first: 1, last: Date.now(),
      cargo: { whisky: { label: 'whisky', runs: 12, total: 4512, amount: 2412 } }, pending: null } },
    boat: { 4: { name: 'Marvella', runs: 3, total: 38200, lost: 1200, first: 1, last: Date.now(),
      cargo: { meth: { label: 'pervitin', runs: 3, total: 38200, amount: 43491 } }, pending: null } }
  });
  const body = D.createElement('div');
  CMC.tabs.doprava.render(body, ctx);
  const t = norm(body.textContent);
  ok('celkový výdělek 4 512 + 38 200', /42 712 Kč/.test(t));
  ok('L1 Grasswing s počtem jízd', /L1 Grasswing/.test(t) && /12/.test(t));
  ok('S4 Marvella zvlášť', /S4 Marvella/.test(t));
  ok('průměr na jízdu', /na jízdu/.test(t));
  ok('pokuta za pozdní sběr je vidět', /pozdním sběrem odteklo/.test(t));
  ok('nejvíc / nejmíň na jízdu', /nejvíc/.test(t) && /nejmíň/.test(t));
  ok('a je řečeno, že se počítá jen to z lišty',
    /Sběr ručně v herním okně rozšíření nevidí/.test(t));
  ok('letadla i lodě mají vlastní sekci', /Letadla –/.test(t) && /Lodě –/.test(t));

  console.log('\n[doprava] rozpis na jednu jízdu a po surovinách');
  ok('žebříček surovin na jízdu', /Co se vyplatí vozit – na jednu jízdu/.test(t));
  ok('pořadí je číslované', /1\. pervitin/.test(t));
  ok('a v závorce zisk na jednotku', /\(\d[^)]*\/g\)/.test(t));
  ok('sekce „Na jednu jízdu“ u suroviny', /Na jednu jízdu/.test(t));
  ok('a „Celkem – 3× jízdy“', /Celkem – 3× jízdy/.test(t));
  ok('rozpad vstupů: tablety', /tablet/.test(t));
  // pervitin na jízdu: 43 491 g / 3 = 14 497 g → 4 349,1 tablet × 0,40 = 1 739,64 Kč
  ok('spotřeba vstupu na jízdu', /4 349/.test(t));
  ok('sekce za jednotku', /Za jednu g/.test(t));
  ok('vyplatí se vozit', /vozit se vyplatí/.test(t));

  console.log('\n[doprava] náklad a čistý zisk');
  ok('sekce podle suroviny', /Podle suroviny/.test(t));
  ok('pervitin i whisky', /pervitin/.test(t) && /whisky/.test(t));
  ok('materiál je vidět', /materiál/.test(t));
  ok('čistý zisk taky', /čistý zisk/.test(t));
  ok('i marže', /marže/.test(t));
  ok('a srovnání s prodejem', /proti prodeji u prodejce/.test(t));

  console.log('\n[doprava] cena u prodejce');
  // pervitin: 43 491 g × 1,40 = 60 887 Kč u prodejce, dopravou bylo 38 200
  ok('částka u prodejce celkem', /u prodejce by bylo/.test(t));
  ok('a je spočítaná z ceny za gram', /60 887 Kč/.test(t));
  ok('rozdíl je vidět', /doprava lepší o|prodej lepší o/.test(t));
  // s těmito testovacími čísly je prodej lepší → musí to říct, ne to zamlčet
  ok('a přizná, když je prodej lepší', /prodat se vyplatí víc/.test(t));
  ok('u jednotky obojí', /dopravou/.test(t) && /u prodejce/.test(t));
  ok('i čistý zisk prodejem', /čistý zisk prodejem/.test(t));
  // whisky: 2 412 l × 1,60 = 3 859 Kč u prodejce, dopravou 4 512 → doprava lepší
  ok('u whisky vyhrává doprava', /vozit se vyplatí/.test(t));
  // pervitin: 43 491 g × 0,12 = 5 218,92 materiál → zisk 32 981
  ok('spočítá se materiál z receptu', /5 219 Kč|5 218/.test(t));
  console.log('\n[doprava] dlaždice: hrubý → materiál → čistý → odteklo');
  {
    const dl = Array.from(body.querySelectorAll('.cmc-tile'))
      .map(x => norm(x.querySelector('.cmc-tile-label').textContent));
    eq('všechny čtyři a v tomhle pořadí', dl.join(' · '),
      'Hrubý výnos · Materiál · Čistý zisk · Odteklo pozdním sběrem');
    const hodnota = n => norm(Array.from(body.querySelectorAll('.cmc-tile'))
      .find(x => norm(x.querySelector('.cmc-tile-label').textContent) === n)
      .querySelector('.cmc-tile-value').textContent);
    // whisky 4 512 + pervitin 38 200 = 42 712 hrubého
    eq('hrubý výnos', hodnota('Hrubý výnos'), '42 712 Kč');
    // materiál: 2 412 l × 0,667 + 43 491 g × 0,12 = 1 608 + 5 219 = 6 827
    ok('materiál je odečet', /^− /.test(hodnota('Materiál')));
    eq('čistý zisk = hrubý − materiál', hodnota('Čistý zisk'), '35 885 Kč');
    ok('a je u něj marže', /marže/.test(norm(body.textContent)));
  }
  ok('dlaždice ukazuje čistý zisk', /Čistý zisk/.test(t));
  ok('u prostředku je vidět, co vozil', /vozilo: pervitin/.test(t));

  console.log('\n[doprava] rozjetá jízda je vidět');
  await CMC.store.put('fleetLog', {
    plane: { 1: { name: 'Grasswing', runs: 1, total: 500, lost: 0, first: 1, last: Date.now(),
      cargo: { whisky: { label: 'whisky', runs: 1, total: 500, amount: 201 } },
      pending: { id: 'whisky', label: 'whisky', amount: 201, at: Date.now() } } },
    boat: {}
  });
  {
    const b = D.createElement('div');
    CMC.tabs.doprava.render(b, ctx);
    ok('píše, co se právě veze', /právě veze whisky 201/.test(norm(b.textContent)));
  }

  console.log('\n[doprava] CSV má řádek na prostředek');
  let csv = null;
  CMC.ui.download = (name, text) => { csv = { name, text }; };
  const tlacitka = Array.from(body.querySelectorAll('button')).filter(b => /Export CSV/.test(b.textContent));
  tlacitka[0].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  ok('soubor se jmenuje podle záložky', csv && /doprava\.csv$/.test(csv.name));
  eq('hlavička', csv.text.split('\n')[0],
    'druh,oznaceni,jmeno,naklad,jizd,vypraveno,vynos,material,zisk,zisk_na_jizdu,'
    + 'zisk_na_jednotku,na_jizdu,odteklo,prvni,posledni');
  // řádek za prostředek + řádek za každý jeho náklad
  eq('řádky', csv.text.trim().split('\n').length, 5);
  ok('a je v něm materiál i zisk', /pervitin/.test(csv.text) && /5218.92/.test(csv.text));
  ok('a jsou v něm obě jména', /Marvella/.test(csv.text) && /Grasswing/.test(csv.text));

  console.log('\n[historie] sekce Kasino s logováním');
  await CMC.store.put('casinoLog', {
    plays: 3, wins: 1, staked: 250, won: 300, net: 50, at: Date.now(),
    byShape: { srdce: { plays: 2, wins: 1, staked: 200, won: 300 },
               pistole: { plays: 1, wins: 0, staked: 50, won: 0 } },
    last: [{ at: Date.now(), tip: 'pistole', amount: 50, win: false, winner: 'oheň', delta: -50 },
           { at: Date.now(), tip: 'srdce', amount: 100, win: true, winner: 'srdce', delta: 200 }],
    streak: 1, sunk: 50, busts: 2, lossRun: 4, maxLossRun: 9
  });
  {
    const b = D.createElement('div');
    CMC.tabs.historie.render(b, ctx);
    const txt = norm(b.textContent);
    ok('sekce je v Historii', /Kasino „Šťastný tip“/.test(txt));
    ok('vloženo', /vloženo/.test(txt) && /250 Kč/.test(txt));
    ok('vyhráno (vráceno hrou)', /vyhráno \(vráceno hrou\)/.test(txt) && /300 Kč/.test(txt));
    ok('bilance', /bilance/.test(txt) && /\+50/.test(txt));
    ok('úspěšnost proti teorii', /33,3 %/.test(txt) && /teoreticky/.test(txt));
    ok('rozpad po tvarech', /srdce/.test(txt) && /pistole/.test(txt));
    ok('poslední sázky', /padlo oheň/.test(txt));
    ok('a je řečeno, že to nevydělává', /očekávaná hodnota je přesně nula/.test(txt));
    ok('nejvíc proher v řadě', /nejvíc proher v řadě/.test(txt) && /9×/.test(txt));
    ok('se šancí na tu sérii', /2,6 %|2,6%/.test(txt));
    ok('právě běžící série', /právě proher v řadě/.test(txt) && /4×/.test(txt));
    ok('a vzdané série', /vzdaných sérií/.test(txt) && /2×/.test(txt));
  }

  console.log('\n[trh] staty se rozkládají do SLOUPCŮ, ne do jedné buňky');
  {
    const { SLOUPCE, statyZ, aktivni } = CMC.tabs.trh.__staty;
    eq('sloupce jsou čtyři', SLOUPCE.map(c => c.key).join(','), 'sila,obrana,rychlost,stesti');

    /* Běžný předmět: druh statu je z ikony (`defense`), hodnota je jedna. */
    const helma = { hodnota: 5263.24, stat: 'defense' };
    eq('obrana z ikony', statyZ(helma, {}).obrana, 5263.24);
    ok('do ostatních sloupců nic nespadlo', statyZ(helma, {}).sila == null
      && statyZ(helma, {}).rychlost == null);

    /* Karta: všechny tři staty pojmenované v textu. */
    const karta = { staty: { sila: 1022, obrana: 1022, rychlost: 1022 } };
    const k = statyZ(karta, {});
    eq('karta má sílu', k.sila, 1022);
    eq('i obranu', k.obrana, 1022);
    eq('i rychlost', k.rychlost, 1022);

    /*
     * Dražba druh statu neuvádí. Když ho zná PRODUKT, hodnota jde do jeho
     * sloupce; když ne, jde do „dává“ – a nesmí se tiše zařadit jinam.
     */
    const drazba = { hodnota: 21144 };
    eq('z produktu se doplní', statyZ(drazba, { stat: 'speed' }).rychlost, 21144);
    const bezStatu = statyZ(drazba, {});
    eq('bez znalosti do „jiné“', bezStatu.jine, 21144);
    ok('a ne do síly', bezStatu.sila == null);

    /* Prázdné sloupce se nevykreslují, ať tabulka nekyne. */
    const cols = aktivni([helma, { hodnota: 3449, stat: 'defense' }], {});
    eq('jen obrana', cols.map(c => c.key).join(','), 'obrana');
    const colsMix = aktivni([helma, karta, drazba], {});
    eq('mix i s „dává“', colsMix.map(c => c.key).join(','), 'sila,obrana,rychlost,jine');
  }

  console.log('\n[trh] tabulka kusů má hlavičku statu a čísla vpravo');
  {
    /* Produkt s dvěma kusy – obranou. Projde skutečným vykreslením záložky. */
    await CMC.market.pridejProdukt({ nazev: 'Válečná helma',
      obrazek: '/main/inventory/clothes/hats/rare/warrior_helmet.webp' });
    const id = 'clothes/hats/rare/warrior_helmet';
    await CMC.market.pridejKus(id, { instance: '158226', kvalita: 1.05, hodnota: 5263 });
    await CMC.market.pridejKus(id, { instance: '157901', kvalita: 3.2, hodnota: 16010 });
    /* stat je vlastnost produktu – tady ho dodáme, jak by ho dal inventář */
    await CMC.market.ulozInventar([{ master: id, instance: '158226', nazev: 'Válečná helma',
      obrazek: '/main/inventory/clothes/hats/rare/warrior_helmet.webp',
      kvalita: 1.05, hodnota: 5263, stat: 'defense' }], Date.now());

    const el = D.createElement('div');
    CMC.tabs.trh.render(el, { repaint() {} });
    const radek = [...el.querySelectorAll('.cmc-trh-radek, [class*="cmc-trh"]')]
      .find(x => /Válečná helma/.test(x.textContent));
    ok('produkt je v seznamu', !!radek);

    /* rozbalit ho a podívat se na tabulku */
    const trh = CMC.tabs.trh;
    const el2 = D.createElement('div');
    radek.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    trh.render(el2, { repaint() {} });
    const hlavy = [...el2.querySelectorAll('.cmc-trh-tab thead th')].map(t => t.textContent);
    ok('hlavička má „obrana“ (dostal: ' + hlavy.join('|') + ')', hlavy.includes('obrana'));
    ok('a nemá sloupec „dává“', !hlavy.includes('dává'));
    const num = [...el2.querySelectorAll('.cmc-trh-tab .cmc-num')].length;
    ok('čísla mají zarovnávací třídu', num > 0);
    const bunky = [...el2.querySelectorAll('.cmc-trh-tab tbody tr')]
      .map(r => [...r.children].map(c => c.textContent.trim()));
    ok('hodnota statu je ve vlastní buňce (' + JSON.stringify(bunky[0]) + ')',
      bunky.some(r => r.some(c => /^\+\s*5\s*263/.test(norm(c)))));
    ok('a v buňce není slovo „obrana“', !bunky.some(r => r.some(c => /obrana/.test(c))));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ záložky drží');
  process.exit(fails ? 1 : 0);
})();
