/* Útok na neaktivního hráče – tlačítko v liště.
 *
 * !!! FIXTURY JSOU OPSANÉ Z ŽIVÉ HRY (5. 8. 2026) !!!
 * Nejdůležitější je rozdíl mezi seznamem a scénou: hráč #30 má v ŘÁDKU hledání
 * jen `status-away` + `status-boss`, ale ve SCÉNĚ útoku i `status-med`. Kdyby
 * fixtura měla nemocnici i v řádku, test by prošel a rozšíření by v ostrém
 * provozu útočilo na ležící hráče – přesně to, co si uživatel nepřál.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
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
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/queue.js', 'src/jail.js', 'src/attack.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;
const A = CMC.attack;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };

/* ---- fixtury ------------------------------------------------------------- */

/** Hlavička: energie a HP tak, jak je hra vypisuje. */
function hlavicka(en = 59, hp = 22150, level = 50) {
  D.body.insertAdjacentHTML('beforeend',
    `<div id="hd"><div class="value renew-hp">${hp}</div>
     <div class="value renew-energy">${en}</div>
     ${level == null ? '' : `<div class="renew-level">${level}</div>`}</div>`);
}

/** Spodní lišta hry s ikonou hledání – vstup do celého postupu. */
function spodniLista() {
  D.body.insertAdjacentHTML('beforeend',
    '<div class="bottom-panel"><a href="#"><span class="icon-p search"></span></a></div>');
}

/**
 * ŘÁDEK VÝSLEDKU HLEDÁNÍ – všimni si, že tu nemocnice NENÍ, ani u hráče, který
 * ve scéně `status-med` má. Tak to hra opravdu posílá.
 */
const radek = (id, jmeno, lvl, extra = '') => `
  <div class="result-user-i box-ins">
    <div class="user-panel-i">
      <div class="avatar"><a data-modal="/profile/${id}"><div class="level">${lvl}</div></a></div>
      <div class="r-s">
        <div class="name"><a href="/profile/${id}">${jmeno}</a></div>
        <div class="icons-l">
          <div class="icon-h tooltip-over"><div class="icon status-away"></div>
            <div class="tooltip-i">Neaktivní více než 6 dnů. Může zaútočit kdokoliv</div></div>
          ${extra}
        </div>
      </div>
    </div>
    <div class="acts">
      <a href="#" data-modal="/attack-scene/${id}" class="btn btn-danger btn-sm">Napadnout</a>
      <a href="#" id="confirm" data-action="processFight('/steal/${id}')" class="btn">Okrást</a>
    </div>
  </div>`;

/** SCÉNA ÚTOKU – dva panely, soupeř je ten druhý. */
const scena = (id, jmeno, lezi) => `
  <div class="box-w"><div class="box-i">
    <div class="box-h">Boj<div class="m-close js-close-modal"><div class="icon ui-close"></div></div></div>
    <div class="user-panel-i"><div class="name">AntReX</div>
      <div class="icons-l"><div class="icon status-vip"></div><div class="icon status-shild"></div></div></div>
    <div class="user-panel-i"><div class="name">${jmeno}</div>
      <div class="icons-l">
        <div class="icon-h tooltip-over"><div class="icon status-away"></div></div>
        ${lezi ? '<div class="icon-h tooltip-over"><div class="icon status-med"></div>'
          + '<div class="tooltip-i">Hráč je v nemocnici nebo ve vězení.</div></div>' : ''}
      </div></div>
    <div class="top-box box-ins">
      <div class="result-details won" style="display:none">
        <div class="label" data-text="Vyhrál jsi">Vyhrál jsi</div><div class="desc"></div></div>
      <div class="result-details lost" style="display:none">
        <div class="label" data-text="Prohrál jsi">Prohrál jsi</div><div class="desc"></div></div>
    </div>
    <div class="acts">
      <a href="#" action="/attack/${id}" class="btn btn-secondary btn-sm attackButton fight-round">Začít</a>
      <a href="#" class="btn btn-danger btn-sm attackButton next-opponent">Další</a>
    </div>
  </div></div>`;

const FORMULAR = `
  <div class="box-w"><div class="box-i">
    <div class="box-h">Hledat hráče <div class="m-close js-close-modal"></div></div>
    <div class="box-con">
      <select name="victimsType" class="form-control">
        <option value="">Co hledat?</option>
        <option value="all">Všichni hráči</option>
        <option value="not-active">Neaktivní hráči</option>
        <option value="not-active-gang">Neaktivní členové gangu</option>
        <option value="active-gang">Aktivní členové gangu</option>
        <option value="enemies">Tvoji nepřátelé</option>
      </select>
      <button action="/search/playersAbleToAttack" class="btn canAttack attack-hunt">Hledat, koho napadnout</button>
      <button action="/search/player" class="btn searchButton">Hledat</button>
      <div id="searchResults"></div>
    </div>
  </div></div>`;

/**
 * Falešná hra: reaguje na kliky jako ta pravá.
 *  - klik na ikonu hledání   → vykreslí formulář
 *  - klik na „koho napadnout“ → vloží řádky
 *  - klik na podstrčený odkaz → vykreslí scénu
 *  - klik na „Začít“          → po `zpozdeni` dopíše výsledek (nebo mlčí)
 */
function hra(opts = {}) {
  const stav = { kliky: [], scen: 0, utoku: 0, hledani: 0 };
  let box = null;
  const okno = html => {
    if (!box) {
      box = D.createElement('div');
      box.className = 'modal-box main-box';
      D.body.appendChild(box);
    }
    box.innerHTML = html;
    return box;
  };
  stav.zavri = () => { if (box) { box.remove(); box = null; } };

  D.body.addEventListener('click', ev => {
    /*
     * Zavíráček okna je `<div class="m-close js-close-modal">`, ne odkaz –
     * kdyby se tu hledalo jen `a,button`, falešná hra by zavírání vůbec
     * neviděla a test by tvrdil, že se okno nezavírá.
     */
    const zav = ev.target.closest ? ev.target.closest('.js-close-modal, .m-close') : null;
    if (zav) { stav.kliky.push('zavri'); stav.zavri(); return; }
    const el = ev.target.closest ? ev.target.closest('a,button') : null;
    if (!el) return;

    if (el.querySelector && el.querySelector('.icon-p.search')) {
      stav.hledani++; stav.kliky.push('hledani'); okno(FORMULAR); return;
    }
    if (el.classList.contains('attack-hunt')) {
      stav.kliky.push('hunt');
      const typ = box.querySelector('select[name=victimsType]');
      stav.typ = typ ? typ.value : null;
      if (opts.prazdno) return;
      /*
       * Hra vrací pro každý druh JINÝ seznam. Kdyby fixtura vracela pořád týž,
       * test by neodhalil, že se tlačítko „v gangu“ ptá na neaktivní obecně.
       */
      const zdroj = stav.typ === 'not-active-gang'
        ? (opts.gang || []) : (opts.radky || []);
      box.querySelector('#searchResults').innerHTML =
        zdroj.map(r => radek(r.id, r.jmeno, r.lvl == null ? 1 : r.lvl)).join('');
      return;
    }
    if (el.getAttribute && /^\/attack-scene\//.test(el.getAttribute('data-modal') || '')) {
      const id = el.getAttribute('data-modal').split('/').pop();
      stav.scen++; stav.kliky.push('scena:' + id);
      const kdo = [...(opts.radky || []), ...(opts.gang || [])]
        .find(r => String(r.id) === id) || { jmeno: '?' };
      okno(scena(id, kdo.jmeno, !!kdo.lezi));
      return;
    }
    if (el.classList.contains('fight-round')) {
      stav.utoku++; stav.kliky.push('utok:' + el.getAttribute('action'));
      if (opts.mlci) return;                       // captcha: handler skončí bez následku
      const en = D.querySelector('.value.renew-energy');
      if (en) en.textContent = String(Math.max(0, +en.textContent - 30));
      setTimeout(() => {
        /*
         * Hra jen ODKRYJE jeden z dvou boxů (jQuery `.show()` = inline display).
         * Druhý zůstane v DOMu i s textem „Prohrál jsi“ – právě proto se výsledek
         * nesmí hledat v textu okna.
         */
        const vyhra = !opts.prohra;
        const el = box.querySelector(vyhra ? '.result-details.won' : '.result-details.lost');
        if (opts.oba) box.querySelectorAll('.result-details').forEach(x => { x.style.display = 'block'; });
        else el.style.display = 'block';
        el.querySelector('.desc').textContent = vyhra
          ? 'Zmlátil jsi soupeře, ukradl 0Kč, získal 1 384 zkušeností.'
            + ' Tvůj nepřítel bude ve vězení 800 sekund'
          : 'Soupeř tě zmlátil. Ležíš v nemocnici 600 sekund';
      }, opts.zpozdeni || 20);
      return;
    }
  });
  return stav;
}

function uklid() {
  D.body.innerHTML = '';
  D.body.replaceWith(D.body.cloneNode(false));   // i s posluchači falešné hry
  globalThis.document = D;
}

/* ---- test ---------------------------------------------------------------- */

(async () => {
  await CMC.store.load();
  /* Lišta se jen povolá – status je jinak `NS.gym.setStatus` a ten tu není. */
  const HLASKY = [];
  CMC.gym = { setStatus: (t, ok) => HLASKY.push({ t, ok }) };
  const nastav = o => CMC.store.patch('read', o);

  console.log('\n[čtení] soupeř je POSLEDNÍ panel scény, ne první');
  {
    const b = D.createElement('div');
    b.innerHTML = scena(51, 'OrlíZástupce', false);
    const s = A.soupeR(b);
    eq('jméno soupeře', s.jmeno, 'OrlíZástupce');
    ok('já (první panel) se za soupeře nepletu', s.jmeno !== 'AntReX');
    eq('neleží', s.lezi, false);
    ok('tlačítko útoku se našlo', !!s.tlacitko);
  }
  {
    const b = D.createElement('div');
    b.innerHTML = scena(30, 'NočníŠéf', true);
    eq('status-med = leží', A.soupeR(b).lezi, true);
  }

  console.log('\n[past] v ŘÁDKU hledání nemocnice není – proto se musí do scény');
  {
    const d = D.createElement('div');
    d.innerHTML = radek(30, 'NočníŠéf', 45);
    ok('řádek status-med NEMÁ', !d.querySelector('.icon.status-med'));
    ok('ale scéna téhož hráče ANO',
      /status-med/.test(scena(30, 'NočníŠéf', true)));
  }

  console.log('\n[energie] pod 30 se nekliká vůbec');
  {
    uklid(); hlavicka(29); spodniLista();
    const h = hra({ radky: [{ id: 51, jmeno: 'OrlíZástupce' }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('odmítne se s důvodem', /energie 29 z 30/.test(String(chyba)));
    eq('a nic neotevře', h.kliky.length, 0);
  }

  console.log('\n[captcha] útok se ani nezkouší');
  {
    uklid(); hlavicka(59); spodniLista();
    D.body.insertAdjacentHTML('beforeend', '<div class="modal-box center captcha-modal active"></div>');
    const h = hra({ radky: [{ id: 51, jmeno: 'OrlíZástupce' }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('řekne, že je captcha', /captch/i.test(String(chyba)));
    eq('a nikam neklikne', h.kliky.length, 0);
  }

  console.log('\n[hlavní cesta] přeskočí ležící a napadne prvního volného');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ radky: [
      { id: 30, jmeno: 'NočníŠéf', lezi: true },
      { id: 38, jmeno: 'DracoKat', lezi: true },
      { id: 51, jmeno: 'OrlíZástupce' },
      { id: 79, jmeno: 'PravýCapo' }
    ] });
    const r = await A.zautoc();
    eq('vybral prvního volného', r.jmeno, 'OrlíZástupce');
    eq('výsledek', r.vysledek, 'vyhrál jsi');
    ok('zpráva hry se uložila', /1 384 zkušeností/.test(norm(r.zprava)));
    eq('přeskočil dva ležící', r.preskoceni.length, 2);
    ok('a řekl které', /NočníŠéf \(leží\)/.test(r.preskoceni.join(', ')));
    eq('hledalo se „not-active“', h.typ, 'not-active');
    eq('scén se otevřelo právě 3', h.scen, 3);
    eq('útok byl jen jeden', h.utoku, 1);
    ok('a mířil na správné ID', h.kliky.includes('utok:/attack/51'));
    ok('na ležící se NEklikalo', !h.kliky.some(k => /utok:\/attack\/(30|38)/.test(k)));
    eq('energie ubyla o 30', r.energie.pred - r.energie.po, 30);
    ok('okno se nakonec zavřelo', h.kliky[h.kliky.length - 1] === 'zavri');
  }

  console.log('\n[opakování] druhý stisk začíná zavřením předchozího okna');
  {
    uklid(); hlavicka(200); spodniLista();
    const h = hra({ radky: [{ id: 51, jmeno: 'OrlíZástupce' }] });
    await A.zautoc();
    const prvni = h.kliky.slice();
    await A.zautoc();
    const druhy = h.kliky.slice(prvni.length);
    eq('hledání se otevřelo znovu', h.hledani, 2);
    eq('a proběhl druhý útok', h.utoku, 2);
    ok('druhý průběh je celý, ne jen klik', druhy.includes('hledani') && druhy.includes('utok:/attack/51'));
  }

  console.log('\n[mlčící klik] bez výsledku se NEHLÁSÍ úspěch');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ radky: [{ id: 51, jmeno: 'OrlíZástupce' }], mlci: true });
    let chyba = null;
    const t0 = Date.now();
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('ohlásí neproběhlý útok', /neproběhl/.test(String(chyba)));
    ok('a jmenuje soupeře', /OrlíZástupce/.test(String(chyba)));
    eq('klik ale padl', h.utoku, 1);
    ok('čekalo se na výsledek, ne hned chyba', Date.now() - t0 >= 500);
  }

  console.log('\n[prázdný seznam] řekne to, místo aby klikal');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ prazdno: true });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('hlásí, že nic nenašel', /nevrátilo|neaktivní/.test(String(chyba)));
    eq('žádná scéna', h.scen, 0);
    eq('žádný útok', h.utoku, 0);
  }

  console.log('\n[všichni leží] nezaútočí a vypíše koho přeskočil');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ radky: [
      { id: 30, jmeno: 'NočníŠéf', lezi: true },
      { id: 38, jmeno: 'DracoKat', lezi: true }
    ] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('řekne, že nešel nikdo', /nešel napadnout nikdo/.test(String(chyba)));
    ok('a vyjmenuje je', /NočníŠéf.*DracoKat/.test(String(chyba)));
    eq('nikdo nebyl napaden', h.utoku, 0);
  }

  console.log('\n[strop] otevře nejvýš KANDIDATU scén');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ radky: Array.from({ length: 10 }, (_, i) =>
      ({ id: 100 + i, jmeno: 'Lezici' + i, lezi: true })) });
    try { await A.zautoc(); } catch (e) { /* čekaná chyba */ }
    eq('scén právě KANDIDATU', h.scen, A.KANDIDATU);
    ok('a ne všech deset', h.scen < 10);
  }

  console.log('\n[vězení] zámek jail.js má přednost');
  {
    uklid(); hlavicka(59); spodniLista();
    /*
     * jail.js bere ikonu jen když je VIDITELNÁ (`offsetParent`) – hra si ji drží
     * v DOM i ve zdravém stavu a jen ji skrývá. jsdom offsetParent neumí, takže
     * se to musí nasimulovat, jinak by test měřil něco jiného než ostrý provoz.
     */
    D.body.insertAdjacentHTML('beforeend',
      '<div id="hd2" class="icon-h"><div class="icon status-med"></div>'
      + '<div class="tooltip-i">Hráč je v nemocnici nebo ve vězení.</div></div>');
    const ikona = D.querySelector('#hd2 .icon.status-med');
    Object.defineProperty(ikona, 'offsetParent', { get: () => D.body });
    const h = hra({ radky: [{ id: 51, jmeno: 'OrlíZástupce' }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('odmítne to', /vězení|nemocnici/.test(String(chyba)));
    eq('a nikam neklikne', h.kliky.length, 0);
  }

  console.log('\n[výsledek] rozhoduje ODKRYTÁ třída, ne text v okně');
  {
    const b = D.createElement('div');
    b.innerHTML = scena(51, 'Kdokoli', false);
    /*
     * Dokud je skryté oboje, boj nedoběhl. Tohle je ta chyba, kterou to mělo:
     * v textu okna je „Vyhrál jsi“ i „Prohrál jsi“ pořád.
     */
    eq('skryté oboje = ještě nic', A.vysledekScenz(b), null);
    ok('a text okna přitom obsahuje obojí',
      /Vyhrál jsi/.test(b.textContent) && /Prohrál jsi/.test(b.textContent));

    b.querySelector('.result-details.lost').style.display = 'block';
    b.querySelector('.result-details.lost .desc').textContent = 'Soupeř tě zmlátil.';
    const v = A.vysledekScenz(b);
    eq('odkrytá „lost“ = prohra', v.vysledek, 'prohrál jsi');
    ok('a zpráva je z TOHO boxu', /Soupeř tě zmlátil/.test(v.zprava));
    ok('ne z toho druhého', !/Zmlátil jsi soupeře/.test(v.zprava));
  }

  console.log('\n[výsledek] prohra se ohlásí jako prohra');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby17', lvl: 17 }], prohra: true });
    const r = await A.zautoc();
    eq('výsledek', r.vysledek, 'prohrál jsi');
    ok('zpráva odpovídá prohře', /Ležíš v nemocnici/.test(r.zprava));
    eq('a útok byl jen jeden', h.utoku, 1);
  }

  console.log('\n[výsledek] když jsou vidět oba, NEHÁDÁ se');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    hra({ radky: [{ id: 79, jmeno: 'Slaby17', lvl: 17 }], oba: true });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('řekne, že je to nejasné', /nejasný/.test(String(chyba)));
    ok('a jmenuje obě třídy', /won.*lost|lost.*won/.test(String(chyba)));
  }

  console.log('\n[gang] druhé tlačítko se ptá na „not-active-gang“');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({
      radky: [{ id: 51, jmeno: 'MimoGang', lvl: 10 }],
      gang: [{ id: 900, jmeno: 'LinyClen', lvl: 12 }]
    });
    const r = await A.zautoc('not-active-gang');
    eq('hledal se gangový druh', h.typ, 'not-active-gang');
    eq('a napadl člena gangu', r.jmeno, 'LinyClen');
    eq('druh je v záznamu', r.druh, 'not-active-gang');
    ok('na hráče z obecného seznamu se neklikalo',
      !h.kliky.some(k => /scena:51|utok:\/attack\/51/.test(k)));
  }

  console.log('\n[gang] a naopak – obecné tlačítko nebere gang');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({
      radky: [{ id: 51, jmeno: 'MimoGang', lvl: 10 }],
      gang: [{ id: 900, jmeno: 'LinyClen', lvl: 12 }]
    });
    const r = await A.zautoc();
    eq('výchozí druh', h.typ, 'not-active');
    eq('napadl neaktivního mimo gang', r.jmeno, 'MimoGang');
  }

  console.log('\n[druh] neznámý druh se odmítne, než se něco otevře');
  {
    uklid(); hlavicka(59); spodniLista();
    const h = hra({ radky: [{ id: 51, jmeno: 'Kdokoli', lvl: 1 }] });
    let chyba = null;
    try { await A.zautoc('enemies'); } catch (e) { chyba = e.message; }
    ok('řekne, co je špatně', /neznámý druh/.test(String(chyba)));
    eq('a nikam neklikne', h.kliky.length, 0);
  }

  console.log('\n[strop úrovně] bere jen do 70 % vlastní úrovně');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();   // strop = 35
    eq('strop z úrovně 50', A.strop(), 35);
    const h = hra({ radky: [
      { id: 30, jmeno: 'Silny45', lvl: 45 },
      { id: 38, jmeno: 'Presne36', lvl: 36 },
      { id: 51, jmeno: 'Presne35', lvl: 35 },
      { id: 79, jmeno: 'Slaby17', lvl: 17 }
    ] });
    const r = await A.zautoc();
    eq('napadl prvního do stropu', r.jmeno, 'Presne35');
    ok('35 je ještě v pořádku (≤, ne <)', r.uroven === '35');
    eq('strop je v záznamu', r.strop, 35);
    ok('silné vyřadil s číslem', /Silny45 \(úroveň 45 > 35\)/.test(r.preskoceni.join(', ')));
    ok('a 36 taky', /Presne36 \(úroveň 36 > 35\)/.test(r.preskoceni.join(', ')));
    eq('scény se otevřely jen dvě (35 a nic dál)', h.scen, 1);
    ok('na silné se neklikalo vůbec',
      !h.kliky.some(k => /scena:(30|38)/.test(k)));
  }

  console.log('\n[strop] když nikdo nevyhovuje, neútočí a řekne proč');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    const h = hra({ radky: [{ id: 30, jmeno: 'Silny45', lvl: 45 }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('hlásí rozsah úrovní', /nikdo v úrovni 1–35/.test(String(chyba)));
    eq('žádná scéna', h.scen, 0);
    eq('žádný útok', h.utoku, 0);
  }

  console.log('\n[strop] bez znalosti vlastní úrovně se NEÚTOČÍ');
  {
    uklid(); hlavicka(59, 22150, null); spodniLista();
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby17', lvl: 17 }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    eq('strop není', A.strop(), null);
    ok('řekne, že nezná svou úroveň', /nevím svoji úroveň/.test(String(chyba)));
    eq('a nezaútočí', h.utoku, 0);
  }

  console.log('\n[strop] řádek bez úrovně se přeskočí, ne odhadne');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    const h = hra({ radky: [
      { id: 30, jmeno: 'BezUrovne', lvl: '' },
      { id: 79, jmeno: 'Slaby17', lvl: 17 }
    ] });
    const r = await A.zautoc();
    eq('vzal toho s úrovní', r.jmeno, 'Slaby17');
    ok('a ten bez ní je vypsaný', /BezUrovne \(úroveň neznámá\)/.test(r.preskoceni.join(', ')));
  }

  console.log('\n[lišta] dvě tlačítka a stav');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    const t = A.buttons(() => {});
    eq('tři prvky (2 tlačítka + stav)', t.length, 3);
    eq('první je obecné', t[0].textContent, '🔪 Neaktivního');
    eq('druhé gangové', t[1].textContent, '🔪 Neaktivního v gangu');
    ok('popisek zmiňuje rozsah úrovní', /úroveň 1–35/.test(t[0].title));
    /*
     * `posledni` drží výsledek z předchozího testu, takže tady se právem ukazuje
     * poslední útok, ne energie. Energii ukáže jen před prvním útokem – to už
     * pokrývá test [lišta] pod 30 energie přes `title`.
     */
    ok('stav mluví o posledním útoku', /naposled .*: (vyhrál|prohrál|remíz)/.test(t[2].textContent));
  }

  console.log('\n[lišta] pod 30 energie jsou obě tlačítka vypnutá');
  {
    uklid(); hlavicka(12, 22150, 50); spodniLista();
    const t = A.buttons(() => {});
    ok('obecné vypnuté', t[0].disabled);
    ok('gangové vypnuté', t[1].disabled);
    ok('a je vidět proč', /energie 12 z 30/.test(t[0].title));
  }

  console.log('\n[nastavení] podíl úrovně je zvlášť pro ruku a pro automatiku');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    await nastav({ atkPodil: 70, atkPodilAuto: 50 });
    eq('ruční strop', A.strop(), 35);
    eq('automatický strop', A.strop(A.podilAuto()), 25);
    await nastav({ atkPodil: 40 });
    eq('změna nastavení se projeví hned', A.strop(), 20);
    await nastav({ atkPodil: 70 });
  }

  console.log('\n[automatika] útočí sama, ale drží automatický strop');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, autoPaused: false, atkPodilAuto: 50,
      atkPauza: 5, atkRezerva: 0, atkDruh: 'not-active' });
    const h = hra({ radky: [
      { id: 30, jmeno: 'Uroven30', lvl: 30 },   // pod ručním 35, NAD automatickým 25
      { id: 79, jmeno: 'Uroven17', lvl: 17 }
    ] });
    ok('automatika je zapnutá', A.autoSet() && A.autoOn());
    const udelal = await A.autoTick();
    eq('kolo něco udělalo', udelal, true);
    eq('a vzalo slabšího', A.posledni.jmeno, 'Uroven17');
    eq('podíl v záznamu je automatický', A.posledni.podil, 50);
    ok('na úroveň 30 se neklikalo (ruční strop by ji pustil)',
      !h.kliky.some(k => /scena:30/.test(k)));
    eq('počítadlo útoků', A.pocty.utoku, 1);
    eq('a výher', A.pocty.vyher, 1);
  }

  console.log('\n[automatika] pauza mezi útoky se drží');
  {
    uklid(); hlavicka(200, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, atkPauza: 3600 });   // hodinová pauza
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }] });
    eq('první kolo projde', await A.autoTick(), true);
    eq('druhé hned po něm ne', await A.autoTick(), false);
    eq('a nekliklo se dvakrát', h.utoku, 1);
    await nastav({ atkPauza: 5 });
  }

  console.log('\n[automatika] energie a rezerva');
  {
    uklid(); hlavicka(29, 22150, 50); spodniLista(); A.__reset();   // pod 30
    await nastav({ atkAuto: true, atkPauza: 5, atkRezerva: 0 });
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }] });
    eq('pod 30 energie nic', await A.autoTick(), false);
    eq('a nikam se neklikalo', h.kliky.length, 0);

    uklid(); hlavicka(35, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkRezerva: 10 });                  // potřeba 40
    const h2 = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }] });
    eq('rezerva se respektuje', await A.autoTick(), false);
    eq('taky bez kliku', h2.kliky.length, 0);
    await nastav({ atkRezerva: 0 });
  }

  console.log('\n[automatika] hlavní vypínač a vězení mají přednost');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, autoPaused: true, atkPauza: 5 });
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }] });
    ok('volba zůstává zapnutá', A.autoSet());
    ok('ale neběží', !A.autoOn());
    eq('kolo nic neudělá', await A.autoTick(), false);
    eq('bez kliku', h.kliky.length, 0);
    await nastav({ autoPaused: false });
  }

  console.log('\n[automatika] captcha zastaví a NEvypne automatiku');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    D.body.insertAdjacentHTML('beforeend', '<div class="modal-box center captcha-modal active"></div>');
    await nastav({ atkAuto: true, atkPauza: 5 });
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }] });
    eq('kolo nic neudělá', await A.autoTick(), false);
    eq('bez kliku', h.kliky.length, 0);
    ok('a volba zůstala zapnutá', CMC.store.get().read.atkAuto === true);
  }

  console.log('\n[automatika] „není koho“ se odmlčí, nevypne se');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, atkPauza: 5, atkPodilAuto: 50 });
    HLASKY.length = 0;
    const h = hra({ radky: [{ id: 30, jmeno: 'Silny45', lvl: 45 }] });
    eq('kolo neudělá nic', await A.autoTick(), false);
    ok('řekne, že zkusí později (hlásky: ' + JSON.stringify(HLASKY.map(x => x.t)) + ')',
      HLASKY.some(x => /zkusím za \d+ min/.test(x.t)));
    ok('a automatika zůstává zapnutá', CMC.store.get().read.atkAuto === true);
    eq('žádný útok', h.utoku, 0);
  }

  console.log('\n[automatika] po pěti chybách se vypne a řekne proč');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, atkPauza: 1 });
    HLASKY.length = 0;
    /* mlčící klik = skutečná porucha (ne prázdný seznam) */
    const h = hra({ radky: [{ id: 79, jmeno: 'Slaby', lvl: 10 }], mlci: true });
    /* pauza se drží i mezi neúspěchy, tak se mezi koly čeká */
    for (let i = 0; i < 5; i++) {
      await A.autoTick();
      await new Promise(r => setTimeout(r, 1100));
    }
    ok('automatika se vypnula', CMC.store.get().read.atkAuto === false);
    ok('a napsala proč', HLASKY.some(x => /automatiku jsem vypnul/.test(x.t)));
    ok('pokusů bylo pět', h.utoku === 5);
  }

  console.log('\n[automatika] zaškrtávátko do lišty');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista();
    await nastav({ atkAuto: true, autoPaused: false, atkPodilAuto: 50, atkDruh: 'not-active-gang' });
    const box = A.autoBox(() => {});
    ok('je zaškrtnuté', box.querySelector('input').checked);
    ok('popisek zmiňuje automatický strop', /do 50 %/.test(box.title));
    ok('a co hledá', /neaktivní v gangu/.test(box.title));
    await nastav({ atkAuto: false, atkDruh: 'not-active' });
    ok('po vypnutí není zaškrtnuté', !A.autoBox(() => {}).querySelector('input').checked);
  }

  console.log('\n[minimální úroveň] slabé soupeře přeskočí');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkMinUroven: 10, atkPodil: 70 });   // rozsah 10–35
    eq('minimum se čte z nastavení', A.minUroven(), 10);
    const h = hra({ radky: [
      { id: 30, jmeno: 'Novacek3', lvl: 3 },
      { id: 38, jmeno: 'Presne10', lvl: 10 },
      { id: 79, jmeno: 'Slusny20', lvl: 20 }
    ] });
    const r = await A.zautoc();
    eq('vzal prvního v rozsahu', r.jmeno, 'Presne10');
    ok('10 je ještě v pořádku (≥, ne >)', r.uroven === '10');
    eq('minimum je v záznamu', r.min, 10);
    ok('nováčka vyřadil s číslem',
      /Novacek3 \(úroveň 3 < 10\)/.test(r.preskoceni.join(', ')));
    ok('a scénu mu neotevřel', !h.kliky.some(k => /scena:30/.test(k)));
  }

  console.log('\n[minimální úroveň] platí i pro automatiku');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkAuto: true, atkPauza: 1, atkMinUroven: 10, atkPodilAuto: 50 });
    const h = hra({ radky: [
      { id: 30, jmeno: 'Novacek3', lvl: 3 },
      { id: 79, jmeno: 'Slusny20', lvl: 20 }
    ] });
    eq('kolo proběhlo', await A.autoTick(), true);
    eq('a vzalo hráče v rozsahu', A.posledni.jmeno, 'Slusny20');
    eq('nováček přeskočen', h.kliky.filter(k => /scena:30/.test(k)).length, 0);
    await nastav({ atkAuto: false });
  }

  console.log('\n[minimální úroveň] když je nad stropem, NEÚTOČÍ a řekne to');
  {
    uklid(); hlavicka(59, 22150, 50); spodniLista(); A.__reset();
    await nastav({ atkMinUroven: 40, atkPodil: 70 });   // strop 35, minimum 40
    const h = hra({ radky: [{ id: 79, jmeno: 'Slusny20', lvl: 20 }] });
    let chyba = null;
    try { await A.zautoc(); } catch (e) { chyba = e.message; }
    ok('hlásí rozpor v nastavení', /odporuje/.test(String(chyba)));
    ok('a jmenuje obě čísla', /40/.test(String(chyba)) && /35/.test(String(chyba)));
    eq('žádný útok', h.utoku, 0);
    await nastav({ atkMinUroven: 0 });
  }

  console.log('\n[zdroj] captcha se nikdy neřeší ani neobchází');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/attack.js'), 'utf8');
    const kod = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('nekliká do captcha okna', !/captcha-modal[^)]*\)\s*\.\s*click/.test(kod));
    ok('nehledá políčka captchy', !/\.nc-|captcha[^)]*input/i.test(kod));
    ok('detekce je jen čtení', /querySelector\('\.captcha-modal\.active'\)/.test(kod));
    ok('nesahá na location.reload', !/location\.reload/.test(kod));
    ok('„Další“ se nepoužívá – vede na aktivní hráče', !/next-opponent/.test(kod)
      || /NEPOUŽÍVÁ/.test(src));
  }

  console.log('\n[odmlka] když není koho, čeká se podle nastavení');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/attack.js'), 'utf8');
    const radek = (src.match(/const odmlkaMs = [^\n]+/) || [''])[0];
    ok('odmlka se bere z nastavení, ne z konstanty', /cfg\(\)\.atkOdmlka/.test(radek));
    ok('a napevno zadaná ODMLKA_MS je pryč', !/ODMLKA_MS/.test(src));

    const odmlkaMs = v => new Function('C',
      'const cfg=()=>C; const ODMLKA_MIN=2; ' + radek + ' return odmlkaMs();')({ atkOdmlka: v });
    const min = 60000;
    eq('výchozí jsou 2 minuty', odmlkaMs(undefined), 2 * min);
    eq('nastavená hodnota platí', odmlkaMs(5), 5 * min);
    /*
     * Dolní mez je to podstatné: bez ní by nula nebo záporné číslo z pole
     * udělaly z odmlky tlučení bez pauzy – a hustý sled hledání je přesně to,
     * na co hra reaguje captchou.
     */
    eq('nula padá na výchozí, ne na žádnou pauzu', odmlkaMs(0), 2 * min);
    eq('záporná se ořízne na minutu', odmlkaMs(-3), 1 * min);
    eq('zlomek pod minutu taky', odmlkaMs(0.4), 1 * min);
    eq('řetězec z inputu se převede', odmlkaMs('7'), 7 * min);

    /* volba musí projít celým řetězcem, jinak ji uživatel nenastaví */
    const store = fs.readFileSync(path.join(EXT, 'src/store.js'), 'utf8');
    const html = fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8');
    const pop = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');
    ok('úložiště má výchozí hodnotu', /atkOdmlka:\s*2,/.test(store));
    ok('popup má pole', /id="atkOdmlka"/.test(html));
    ok('pole nedovolí míň než minutu',
      /min="1"/.test((html.match(/<input[^>]*id="atkOdmlka"[^>]*>/) || [''])[0]));
    ok('popup hodnotu načítá', /\$\('atkOdmlka'\)\.value = cfg\.read\.atkOdmlka/.test(pop));
    ok('a ukládá s dolní mezí', /atkOdmlka: Math\.max\(1,/.test(pop));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ vše prošlo');
  process.exit(fails ? 1 : 0);
})();
