/* Vylepšování budov: Továrna, Dům zločinů, Posilovna, Nemocnice, Závody, Kasárna.
 *
 * !!! FIXTURY JSOU OPSANÉ Z ŽIVÉ HRY (6. 8. 2026) !!!
 * Tři budovy byly volné a tři se zrovna vylepšovaly, takže oba stavy jsou opsané
 * z reality. Podstatné je, že se od sebe liší úplně jinou značkou:
 *   volno → <a action="/map/building/upgrade/25" class="upgradeBuilding">
 *   běží  → odpočet `.btn-badge.minutes` + data-action="skipBuildingUpgrade(…)"
 * Kdyby fixtura běžící budovu neuměla, modul by na ni klikal naprázdno.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules/jsdom'));
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/queue.js',
  'src/jail.js', 'src/upgrade.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;
const U = CMC.upgrade;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };

/* ---- fixtury ------------------------------------------------------------- */

/** Budova, kterou lze vylepšit. */
const VOLNO = (id, nazev, uroven, cena) => `
  <div class="box-w"><div class="box-i">
    <div class="box-h">${nazev}</div>
    <div class="box-con">
      <p>${nazev} Úroveň:${uroven}</p>
      <p>Momentálně získáváš +70% efektivity. <b>+72% efektivity</b></p>
      <a href="#" class="btn btn-primary btn-sm upgradeBuilding tw-l"
         action="/map/building/upgrade/${id}">Vylepšit ${cena}Kč</a>
    </div>
  </div></div>`;

/**
 * Budova, která se právě vylepšuje. „Vylepšit“ tam NENÍ – jen odpočet a
 * „Urychlit“ za diamanty, do čehož rozšíření nesahá.
 */
const BEZI = (id, nazev, uroven, h, m, s, diamanty) => `
  <div class="box-w"><div class="box-i">
    <div class="box-h">${nazev}</div>
    <div class="box-con">
      <p>${nazev} Úroveň:${uroven}</p>
      <div class="desc">
        <div class="btn-badge hours">${String(h).padStart(2, '0')}</div>
        <div class="btn-badge minutes">${String(m).padStart(2, '0')}</div>
        <div class="btn-badge seconds">${String(s).padStart(2, '0')}</div>
        <a href="#" class="btn open-confirm btn-secondary w-s tw-l" id="confirm"
           data-action="skipBuildingUpgrade(
             'https://s1.czechmafie.cz/map/building/skip-upgrade/${id}',
             '11', 'https://2025game.narco.lt/main/buildings/${id}-3.webp',
             '${nazev} Úroveň:${uroven}' )">Urychlit ${diamanty}</a>
      </div>
    </div>
  </div></div>`;

/** Ani jedno – třeba když hra vrátí něco úplně jiného. */
const NIC = nazev => `<div class="box-i"><div class="box-h">${nazev}</div>
  <p>${nazev} Úroveň:7</p><p>Nic tu není.</p></div>`;

/* ---- falešná hra --------------------------------------------------------- */

/**
 * `stranky` je mapa id → html. Klik na `[action="/map/building/upgrade/<id>"]`
 * budovu přepne na běžící (nebo ne, když `hluchy`), a hotovost se sníží o cenu.
 */
function hra(opts = {}) {
  const stav = { get: [], kliky: [], vybery: [] };
  const stranky = { ...(opts.stranky || {}) };

  CMC.parse.apiGet = async (url) => {
    const id = +String(url).split('/').pop();
    stav.get.push(id);
    if (!(id in stranky)) return { status: 404, raw: '' };
    return { status: 200, raw: stranky[id] };
  };

  /* herní okno, kam se vkládá fragment (jako u výroben) */
  CMC.gym = {
    gameHost: () => D.body,
    setStatus: (t, o) => { (stav.hlasky || (stav.hlasky = [])).push({ t, o }); }
  };

  D.body.addEventListener('click', ev => {
    const el = ev.target.closest ? ev.target.closest('[action]') : null;
    if (!el) return;
    const m = String(el.getAttribute('action') || '').match(/\/map\/building\/upgrade\/(\d+)/);
    if (!m) return;
    const id = +m[1];
    stav.kliky.push(id);
    if (opts.hluchy) return;                       // klik bez následku
    const c = (opts.ceny || {})[id] || 0;
    hotovostNastav(Math.max(0, hotovostCti() - c));
    stranky[id] = BEZI(id, 'Budova' + id, 1, 0, 30, 0, 20);
  });

  stav.stranky = stranky;
  return stav;
}

/* hotovost má ve hře haléře (858,90) – test s celými čísly by past minul */
const hotovostCti = () => +((D.querySelector('.renew-money') || {}).textContent || '0')
  .replace(/[^\d.]/g, '');
function hotovostNastav(v) {
  let el = D.querySelector('.renew-money');
  if (!el) {
    el = D.createElement('div');
    el.className = 'renew-money';
    D.body.appendChild(el);
  }
  el.textContent = String(v);
}

/** Banka: kolik je k výběru a co udělá `vybrat()`. */
function banka(vBance, opts = {}) {
  const log = [];
  CMC.bank = {
    async load() {
      if (opts.rozbita) throw new Error('okno banky nejde přečíst');
      return { kVyberu: vBance, kVkladu: 0, raw: '<div></div>' };
    },
    async vybrat(c) {
      /*
       * !!! PRAVÁ BANKA PODLAHUJE !!!
       * `bank.vybrat()` dělá `Math.floor(castka)`. Fixtura to musí dělat taky,
       * jinak by test nikdy neviděl chybějící haléře – a právě ty vylepšení
       * shazovaly.
       */
      const cele = Math.floor(c);
      log.push(cele);
      if (opts.nepripise) return { vybrano: cele };   // klik naprázdno
      hotovostNastav(hotovostCti() + cele);
      return { vybrano: cele };
    }
  };
  return log;
}

function uklid() {
  D.body.innerHTML = '';
  D.body.replaceWith(D.body.cloneNode(false));
  globalThis.document = D;
  U.__reset();
}

/* ---- test ---------------------------------------------------------------- */

(async () => {
  await CMC.store.load();

  console.log('\n[budovy] šest, s ID změřenými ve hře');
  eq('počet', U.BUDOVY.length, 6);
  eq('ID a jména', U.BUDOVY.map(b => b.id + ':' + b.label).join(', '),
    '25:Továrna, 23:Dům zločinů, 26:Posilovna, 31:Nemocnice, 28:Závody, 20:Kasárna');

  console.log('\n[čtení] volná budova: cena a úroveň z tlačítka');
  {
    const s = U.zeStranky(VOLNO(25, 'Továrna', 35, '79 359'), { id: 25, label: 'Továrna' });
    eq('stav', s.stav, 'volno');
    eq('úroveň', s.uroven, 35);
    eq('cena', s.cena, 79359);
  }

  console.log('\n[čtení] běžící budova: čas z odpočtu, žádné tlačítko');
  {
    const s = U.zeStranky(BEZI(31, 'Nemocnice', 44, 0, 6, 44, 52), { id: 31, label: 'Nemocnice' });
    eq('stav', s.stav, 'bezi');
    eq('úroveň', s.uroven, 44);
    eq('zbývá 6:44 v ms', s.zbyva, (6 * 60 + 44) * 1000);
    eq('urychlení v diamantech', s.urychli, 52);
    ok('cena k vylepšení není', s.cena == null);
  }

  console.log('\n[čtení] hodiny a dny se sečtou správně');
  {
    const s = U.zeStranky(BEZI(20, 'Kasárna', 42, 2, 30, 0, 246), { id: 20, label: 'Kasárna' });
    eq('2 h 30 min', s.zbyva, (2 * 3600 + 30 * 60) * 1000);
  }

  console.log('\n[čtení] neznámý stav se NEDOMÝŠLÍ');
  {
    const s = U.zeStranky(NIC('Závody'), { id: 28, label: 'Závody' });
    eq('stav', s.stav, 'nevim');
    ok('úroveň se přesto přečte', s.uroven === 7);
  }

  console.log('\n[peníze] když hotovost stačí, do banky se nesahá');
  {
    uklid(); hotovostNastav(200000);
    const vyb = banka(50000000);
    const r = await U.penize(79359);
    ok('ok', r.ok);
    eq('nic se nevybíralo', r.vybrano, 0);
    eq('banka nedostala příkaz', vyb.length, 0);
  }

  console.log('\n[peníze] chybějící část se vybere z banky – a OVĚŘÍ');
  {
    uklid(); hotovostNastav(3499);
    const vyb = banka(50000000);
    const r = await U.penize(79359);
    ok('ok', r.ok);
    eq('vybral se rozdíl + rezerva na haléře', r.vybrano, 79359 - 3499 + 100);
    eq('banka dostala právě tolik', vyb[0], 79359 - 3499 + 100);
    ok('hotovost na cenu stačí', U.hotovost() >= 79359);
  }

  console.log('\n[peníze] !!! výběr, který nic nepřipsal, se pozná !!!');
  {
    /*
     * Tohle je ta chyba, kterou tenhle projekt řeší pořád: klik na výběr projde,
     * peníze nikde a modul hlásí úspěch. Musí se poznat z HOTOVOSTI, ne z toho,
     * že `vybrat()` nevyhodilo výjimku.
     */
    uklid(); hotovostNastav(3499);
    banka(50000000, { nepripise: true });
    const r = await U.penize(79359);
    ok('neohlásí úspěch', !r.ok);
    ok('a řekne, že to po výběru pořád nestačí', /pořád nestačí/.test(r.duvod));
  }

  console.log('\n[haléře] !!! PŘESNĚ TO, CO VYLEPŠENÍ SHAZOVALO !!!');
  {
    /*
     * Naměřeno naživo: hotovost 858,90 Kč, Závody za 2 769 Kč. Chybí 1 910,10;
     * banka výběr podlahuje na 1 910, takže hotovost skončí na 2 768,90 – deset
     * haléřů pod cenou a hra vylepšení odmítne. Bez rezervy tenhle test padá.
     */
    uklid(); hotovostNastav(858.90);
    const vyb = banka(50000000);
    const r = await U.penize(2769);
    ok('ok', r.ok);
    ok('hotovost cenu DOSÁHLA (' + U.hotovost() + ')', U.hotovost() >= 2769);
    ok('vybíralo se s rezervou, ne přesně na korunu', vyb[0] > 1910);
    eq('a je to nutné nahoru + 100', vyb[0], 1911 + 100);
  }

  console.log('\n[haléře] když v bance chybí právě na rezervu, akce se NEODMÍTNE');
  {
    /*
     * Rezerva je pohodlí, ne podmínka. Kdyby se posuzovala chtěná částka,
     * odmítlo by se vylepšení, na které peníze jsou.
     */
    uklid(); hotovostNastav(858.90);
    const vyb = banka(1950);          // nutné 1 911, chtěné 2 011
    const r = await U.penize(2769);
    ok('prošlo to', r.ok);
    eq('vybralo se, co v bance bylo', vyb[0], 1950);
    ok('a na cenu to stačí', U.hotovost() >= 2769);
  }

  console.log('\n[haléře] „skoro dost“ není dost');
  {
    /* Dřív se měřil jen podíl vybrané částky, takže tenhle případ prošel. */
    uklid(); hotovostNastav(858.90);
    banka(1000);                      // nutné 1 911 – v bance je málo
    const r = await U.penize(2769);
    ok('neohlásí úspěch', !r.ok);
    ok('a řekne, kolik chybí', /chybí/.test(r.duvod));
  }

  console.log('\n[peníze] výpadek čtení banky se zkusí znovu, ne že to vzdá');
  {
    /*
     * Naměřeno naživo: banka odpovídá za ~150 ms, ale jednou spadla na 12s
     * timeout a tlačítko kvůli tomu ohlásilo chybu. Dvě selhání po sobě se tedy
     * musí přejít, teprve třetí je opravdová chyba.
     */
    uklid(); hotovostNastav(3499);
    let pokusu = 0;
    CMC.bank = {
      async load() {
        pokusu++;
        if (pokusu < 3) throw new Error('Hra neodpověděla do 12 s.');
        return { kVyberu: 50000000, kVkladu: 0, raw: '<div></div>' };
      },
      async vybrat(c) { hotovostNastav(hotovostCti() + c); return { vybrano: c }; }
    };
    const r = await U.penize(79359);
    ok('nakonec to prošlo', r.ok);
    eq('zkusilo se to třikrát', pokusu, 3);

    uklid(); hotovostNastav(3499);
    let vzdy = 0;
    CMC.bank = { async load() { vzdy++; throw new Error('Hra neodpověděla do 12 s.'); },
      async vybrat() {} };
    const r2 = await U.penize(79359);
    ok('trvalá porucha se ohlásí', !r2.ok);
    ok('a je vidět, že to nebyl jeden pokus', /po 3 pokusech/.test(r2.duvod));
    eq('víc než třikrát to nezkouší', vzdy, 3);
  }

  console.log('\n[peníze] ani s bankou to nestačí');
  {
    uklid(); hotovostNastav(1000);
    banka(5000);
    const r = await U.penize(79359);
    ok('neohlásí úspěch', !r.ok);
    ok('řekne, kolik chybí', /chybí/.test(r.duvod));
  }

  console.log('\n[akce] vylepší volnou budovu a ověří, že se stav změnil');
  {
    uklid(); hotovostNastav(100000);
    banka(50000000);
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') }, ceny: { 25: 79359 } });
    const r = await U.vylepsi(25);
    eq('budova', r.label, 'Továrna');
    eq('cena', r.cena, 79359);
    eq('úroveň před', r.uroven, 35);
    eq('kliklo se právě jednou', h.kliky.length, 1);
    eq('a na správné ID', h.kliky[0], 25);
    ok('po akci se to přečetlo znovu (ověření)', h.get.length >= 2);
  }

  console.log('\n[akce] běžící budovu nezkouší vůbec');
  {
    uklid(); hotovostNastav(100000);
    banka(50000000);
    const h = hra({ stranky: { 31: BEZI(31, 'Nemocnice', 44, 0, 6, 44, 52) } });
    let chyba = null;
    try { await U.vylepsi(31); } catch (e) { chyba = e.message; }
    ok('řekne, že se už vylepšuje', /už se vylepšuje/.test(String(chyba)));
    ok('a napíše, kdy bude hotovo', /\d/.test(String(chyba)));
    eq('nekliklo se', h.kliky.length, 0);
  }

  console.log('\n[akce] !!! klik, po kterém se nic nezměnilo, NENÍ úspěch !!!');
  {
    uklid(); hotovostNastav(100000);
    banka(50000000);
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') }, hluchy: true });
    let chyba = null;
    try { await U.vylepsi(25); } catch (e) { chyba = e.message; }
    ok('ohlásí, že klik nic neudělal', /neudělal nic/.test(String(chyba)));
    eq('klik přitom padl', h.kliky.length, 1);
  }

  console.log('\n[akce] strop ceny se drží');
  {
    uklid(); hotovostNastav(100000);
    banka(50000000);
    await CMC.store.patch('read', { upgMaxCena: 50000 });
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') } });
    let chyba = null;
    try { await U.vylepsi(25); } catch (e) { chyba = e.message; }
    ok('řekne cenu i strop', /stojí .*strop/.test(String(chyba)));
    eq('nekliklo se', h.kliky.length, 0);
    await CMC.store.patch('read', { upgMaxCena: 0 });
  }

  console.log('\n[stav] běžící budova se nečte znovu, dokud jí neuplyne odpočet');
  {
    uklid(); hotovostNastav(100000);
    const h = hra({ stranky: {
      25: VOLNO(25, 'Továrna', 35, '79 359'),
      23: VOLNO(23, 'Dům zločinů', 20, '452 876'),
      26: VOLNO(26, 'Posilovna', 42, '189 445'),
      31: BEZI(31, 'Nemocnice', 44, 1, 0, 0, 52),
      28: BEZI(28, 'Závody', 18, 2, 0, 0, 18),
      20: BEZI(20, 'Kasárna', 42, 3, 0, 0, 246)
    } });
    const prvni = await U.stav();
    eq('šest budov', prvni.length, 6);
    eq('tři volné', prvni.filter(x => x.stav === 'volno').length, 3);
    eq('tři běžící', prvni.filter(x => x.stav === 'bezi').length, 3);
    const potePrvnim = h.get.length;
    eq('poprvé se čtou všechny', potePrvnim, 6);

    const druhy = await U.stav();
    eq('podruhé jen ty tři volné', h.get.length - potePrvnim, 3);
    ok('běžící jsou z paměti', druhy.filter(x => x.zPameti).length === 3);
    ok('a pořád vědí, kolik zbývá', druhy.filter(x => x.stav === 'bezi')
      .every(x => x.zbyva > 0));
  }

  console.log('\n[automatika] bere NEJLEVNĚJŠÍ volnou budovu');
  {
    uklid(); hotovostNastav(1000000);
    banka(50000000);
    await CMC.store.patch('read', { upgAuto: true, autoPaused: false, upgRezerva: 0 });
    const h = hra({ stranky: {
      25: VOLNO(25, 'Továrna', 35, '79 359'),
      23: VOLNO(23, 'Dům zločinů', 20, '452 876'),
      26: VOLNO(26, 'Posilovna', 42, '189 445')
    }, ceny: { 25: 79359, 23: 452876, 26: 189445 } });
    const udelal = await U.autoTick();
    eq('kolo něco udělalo', udelal, true);
    eq('a byla to nejlevnější Továrna', h.kliky, [25]);
    eq('počítadlo', U.pocty.upgradu, 1);
    eq('utraceno', U.pocty.utraceno, 79359);
  }

  console.log('\n[automatika] rezerva zastaví akci, ale nevypne automatiku');
  {
    uklid(); hotovostNastav(100000);
    banka(0);
    await CMC.store.patch('read', { upgAuto: true, upgRezerva: 5000000 });
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') } });
    eq('kolo nic neudělá', await U.autoTick(), false);
    eq('nekliklo se', h.kliky.length, 0);
    ok('řekne to do lišty', (h.hlasky || []).some(x => /rezerv/.test(x.t)));
    ok('a zůstává zapnutá', CMC.store.get().read.upgAuto === true);
    await CMC.store.patch('read', { upgRezerva: 0 });
  }

  console.log('\n[automatika] nic volného není normální stav, ne chyba');
  {
    uklid(); hotovostNastav(1000000);
    banka(50000000);
    await CMC.store.patch('read', { upgAuto: true });
    const h = hra({ stranky: {
      25: BEZI(25, 'Továrna', 35, 1, 0, 0, 30),
      23: BEZI(23, 'Dům zločinů', 20, 1, 0, 0, 30)
    } });
    eq('kolo nic neudělá', await U.autoTick(), false);
    eq('nekliklo se', h.kliky.length, 0);
    ok('a automatika zůstává zapnutá', CMC.store.get().read.upgAuto === true);
  }

  console.log('\n[automatika] hlavní vypínač má přednost');
  {
    uklid(); hotovostNastav(1000000);
    banka(50000000);
    await CMC.store.patch('read', { upgAuto: true, autoPaused: true });
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') } });
    ok('volba zůstává', U.autoSet());
    ok('ale neběží', !U.autoOn());
    eq('kolo nic neudělá', await U.autoTick(), false);
    eq('žádné čtení ani klik', h.get.length + h.kliky.length, 0);
    await CMC.store.patch('read', { autoPaused: false });
  }

  console.log('\n[automatika] po třech chybách se vypne a řekne proč');
  {
    uklid(); hotovostNastav(1000000);
    banka(50000000);
    await CMC.store.patch('read', { upgAuto: true });
    const h = hra({ stranky: { 25: VOLNO(25, 'Továrna', 35, '79 359') }, hluchy: true });
    for (let i = 0; i < 3; i++) { U.__resetPauzu(); await U.autoTick(); }
    ok('automatika se vypnula', CMC.store.get().read.upgAuto === false);
    ok('a napsala proč', (h.hlasky || []).some(x => /automatiku jsem vypnul/.test(x.t)));
    eq('pokusy byly tři', h.kliky.length, 3);
  }

  console.log('\n[zdroj] do „Urychlit“ za diamanty se nesahá');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/upgrade.js'), 'utf8');
    const kod = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('nikde se neklikne na skip', !/skipBuildingUpgrade[^)]*\)\s*\.\s*click/.test(kod));
    ok('a URL skip-upgrade se nepoužívá', !/skip-upgrade/.test(kod));
    ok('skip se jen čte jako příznak', /data-action\^="skipBuildingUpgrade"/.test(kod));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ vylepšování drží');
  process.exit(fails ? 1 : 0);
})();
