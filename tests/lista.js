/* Ovládání lišty: po zrušení křížku je minimalizace jediný prvek.
 *
 * Proč to má test: „×“ sedělo hned vedle minimalizace a vypínalo lištu úplně –
 * zapnout ji šlo pak jenom v nastavení rozšíření, což vypadalo, že se rozbila.
 * Test proto hlídá, že se křížek nevrátí ani do kódu, ani do stylu.
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
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/econ.js', 'src/queue.js',
  'src/jail.js', 'src/gym.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (String(g) === String(w) ? '' : `  got ${JSON.stringify(g)} want ${JSON.stringify(w)}`), String(g) === String(w));

(async () => {
  await CMC.store.load();
  const src = fs.readFileSync(path.join(EXT, 'src/gym.js'), 'utf8');
  const css = fs.readFileSync(path.join(EXT, 'panel.css'), 'utf8');

  console.log('\n[lišta] křížek na vypnutí je pryč – z kódu i ze stylu');
  ok('gym.js nevytváří .cmc-gym-x', !/cmc-gym-x/.test(src));
  ok('a nikde nevypíná gymBar klikem',
    !/gymBar:\s*false/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('panel.css na .cmc-gym-x nemá pravidlo', !/cmc-gym-x/.test(css));

  console.log('\n[lišta] minimalizace: jedno tlačítko, dva stavy');
  {
    /* `toggleButton()` si čte třídu z `bar`, tak ho musíme podstrčit. */
    const bar = D.createElement('div');
    bar.id = 'cmc-gym-bar';
    D.body.appendChild(bar);
    const t = CMC.gym.toggleButton(bar);   // vlastní lišta, ať jde stav změřit
    bar.appendChild(t);
    t._paint();
    eq('rozbaleno: šipka dovnitř', t.textContent, '«');
    ok('a bez velké třídy', !t.classList.contains('cmc-gym-toggle-big'));
    ok('popisek říká, že se lišta nedá vypnout', /nedá vypnout|jen zmenšit/.test(t.title));

    /* klik na tlačítko musí lištu zmenšit sám – ne až ruční přidání třídy */
    t.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    ok('klik lištu zmenšil', bar.classList.contains('cmc-gym-hidden'));
    t._paint();
    eq('zmenšeno: šipka ven', t.textContent, '»');
    ok('a velká třída naskočí', t.classList.contains('cmc-gym-toggle-big'));
    ok('popisek nabídne rozbalení', /rozbalit/.test(t.title));
  }

  console.log('\n[pauza] klik zabere hned a nečeká na úložiště');
  {
    /*
     * Dřív handler začínal `await NS.store.patch(...)`, takže se do zápisu
     * nezastavila dávka ani nevyprázdnila fronta – při zaneprázdněném úložišti
     * klik chvíli „nedělal nic“ a druhý klik pauzu vzal zpátky.
     */
    await CMC.store.patch('read', { autoPaused: false, autoTrain: 'speed' });

    let vyprazdneno = 0, dokonceno = null;
    const puvodni = CMC.queue.clear;
    CMC.queue.clear = () => { vyprazdneno++; };
    /* úložiště schválně pomalé – zápis dokončíme až na konci testu */
    const pomaly = new Promise(r => { dokonceno = r; });
    const patch = CMC.store.patch;
    CMC.store.patch = (k, v) => { patch(k, v); return pomaly; };

    const b = CMC.gym.masterButton();
    eq('před klikem běží', b.textContent, '⏸');
    b.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));

    /* !!! bez jediného `await` – tohle všechno musí platit okamžitě !!! */
    ok('mezipaměť už zná pauzu', CMC.store.get().read.autoPaused === true);
    eq('tlačítko se překreslilo hned', b.textContent, '▶');
    ok('a má vypnutý vzhled', b.classList.contains('cmc-gym-master-off'));
    eq('fronta se vyprázdnila', vyprazdneno, 1);

    dokonceno();
    CMC.store.patch = patch;
    CMC.queue.clear = puvodni;
  }

  console.log('\n[pauza] stav se čte při KLIKU, ne z doby vykreslení');
  {
    /*
     * Tlačítko vykreslené jako „běží“ mohlo zůstat v DOMu, když se pauza
     * zapnula odjinud (popup, hlídač captchy). Klik pak přepínal podle staré
     * hodnoty – tedy pauzu VYPNUL, i když ji uživatel chtěl zapnout.
     */
    await CMC.store.patch('read', { autoPaused: false, autoTrain: 'speed' });
    const b = CMC.gym.masterButton();          // vykresleno ve stavu „běží“
    await CMC.store.patch('read', { autoPaused: true });   // mezitím se pauza zapnula jinde

    b.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    ok('klik pauzu ROZBĚHL (nezapnul znovu)', CMC.store.get().read.autoPaused === false);
  }

  console.log('\n[pauza] dva rychlé signály nepřepnou dvakrát');
  {
    /*
     * Na jeden stisk přijde `pointerdown` i `click`. Bez pojistky by se pauza
     * zapnula a hned vypnula, což je právě to „nereaguje“.
     */
    await CMC.store.patch('read', { autoPaused: false, autoTrain: 'speed' });
    const b = CMC.gym.masterButton();
    b.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    ok('pauza je zapnutá a zůstala', CMC.store.get().read.autoPaused === true);
    eq('a tlačítko taky', b.textContent, '▶');
  }

  console.log('\n[pauza] reaguje na stisk, ne až na uvolnění');
  {
    const s2 = fs.readFileSync(path.join(EXT, 'src/gym.js'), 'utf8');
    ok('pointerdown je navěšený', /addEventListener\('pointerdown', ev => \{ ev\.preventDefault\(\); prepni/.test(s2));
    ok('a stav se bere z autoPaused(), ne z proměnné',
      /const nove = !autoPaused\(\);/.test(s2));
  }

  console.log('\n[styl] pravý kout má jeden rozměr pro všechny tři prvky');
  {
    /*
     * Vypínač, obnovování a minimalizace stály vedle sebe každý jinak vysoký
     * (11px písmo proti 17px), takže to vypadalo jako tři nesourodé věci.
     */
    const skupina = (css.match(/#cmc-gym-bar \.cmc-gym-ctrl > \.cmc-gym-master,[\s\S]*?\}/) || [''])[0];
    ok('pravidlo pro celou skupinu existuje', skupina.length > 40);
    for (const co of ['master', 'reload', 'toggle']) {
      ok('platí i pro .cmc-gym-' + co, skupina.includes('.cmc-gym-' + co));
    }
    ok('má společnou výšku', /height:\s*26px/.test(skupina));
    ok('i společné písmo', /font-size:\s*13px/.test(skupina));
    ok('a stejné zaoblení', /border-radius:\s*6px/.test(skupina));
    ok('zaškrtávátko je zvětšené na 14 px',
      /\.cmc-gym-reload input \{[^}]*width:\s*14px/.test(css));
  }

  console.log('\n[styl] zmenšený úchyt je větší než ten rozbalený');
  {
    const cast = re => (css.match(re) || [''])[0];
    const zakl = cast(/#cmc-gym-bar \.cmc-gym-toggle \{[^}]*\}/);
    const velky = cast(/#cmc-gym-bar \.cmc-gym-toggle\.cmc-gym-toggle-big \{[^}]*\}/);
    const px = (blok, vlastnost) => {
      const m = blok.match(new RegExp(vlastnost + ':\\s*(\\d+)px'));
      return m ? +m[1] : null;
    };
    ok('základní má rozměr', px(zakl, 'height') > 0 && px(zakl, 'font-size') > 0);
    ok('zmenšený je vyšší (' + px(zakl, 'height') + ' → ' + px(velky, 'height') + ')',
      px(velky, 'height') > px(zakl, 'height'));
    ok('a má větší písmo (' + px(zakl, 'font-size') + ' → ' + px(velky, 'font-size') + ')',
      px(velky, 'font-size') > px(zakl, 'font-size'));
    ok('zmenšená lišta není poloprůhledná',
      /cmc-gym-hidden \{[^}]*opacity:\s*1/.test(css));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ ovládání lišty drží');
  process.exit(fails ? 1 : 0);
})();
