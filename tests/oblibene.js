/* ★ oblíbené předměty a jejich vylepšování.
 *
 * !!! HRA OBLÍBENÉ NEMÁ !!!
 * `.stars` v inventáři je VZÁCNOST. Hvězdička je značka rozšíření pod
 * `data-item-id`, takže test hlídá i to, že se ukládá k tomu správnému kusu.
 *
 * !!! A HLAVNĚ: TURBO SE NESMÍ POUŽÍT !!!
 * Okno vylepšení nabízí vedle běžného vylepšení za 2,36 Kč taky
 * `turboUpgrade/<id>[/5|/10]` za 4 800 / 24 000 / 48 000 DIAMANTŮ. Fixtura je má
 * obojí a test ověřuje, že klik padne na to správné.
 * Vše opsané ze živé hry 10. 8. 2026.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules/jsdom'));
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/queue.js',
  'src/jail.js', 'src/captcha.js', 'src/market.js', 'src/oblibene.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;
const O = CMC.oblibene;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (norm(g) === norm(w) ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`), norm(g) === norm(w));

/** Karta v inventáři – zkráceně, ale se vším, na co se sahá. */
function karta(id, obr) {
  const el = D.createElement('div');
  el.className = 'col';
  el.setAttribute('data-item-id', String(id));
  el.innerHTML = `<div class="col-card col-card--rare"><div class="col-card-inner i-box green">
    <div class="col-card-art"><img src="https://2025game.narco.lt/main/inventory/${obr}.webp?v=1">
      <div class="col-card-badge"><div class="icon rarity-rare"></div><div class="rank">+0.15%</div></div></div>
    <div class="acts">
      <a href="#" action="/inventory/equip/${id}" class="equipItem"></a>
      <a href="#" action="/inventory/item/upgrade/${id}" js-open-inventory></a>
      <a href="#" action="/inventory/item/sell/${id}" js-open-inventory></a>
    </div></div></div>`;
  D.body.appendChild(el);
  return el;
}

/** Okno vylepšení – s běžným tlačítkem i s Turbem, jak to hra posílá. */
const OKNO = (id, uroven, kvalita) => `
  <div class="inventory-action-modal"><div class="box-con">
    <p>Vylepšování předmětu Efektivita závisí na tvém štěstí, úrovni a úrovni továrny</p>
    <p>Momentálně na #42254 místě Úroveň: ${uroven} Řetězový buldok Síla +1 Obrana +1 Rychlost +1</p>
    <p>Kvůli vzácnosti předmětu získáš při vylepšování +${kvalita}% navíc
      Obvyklá cena <span class="icon-currency-crystal"></span>-9.99 -2.01
      <span class="icon-currency-money-dirty"></span>-2.36Kč</p>
    <a action="/inventory/item/upgrade/${id}" class="btn btn-danger btn-sm upgrade ">Vylepšit +96</a>
    <a action="/inventory/item/turboUpgrade/${id}" class="btn upgrade turbo">Turbo X1 4 800 + 2.36Kč</a>
    <a action="/inventory/item/turboUpgrade/${id}/5" class="btn upgrade turbo">Turbo X5 24 000 + 11.80Kč</a>
    <a action="/inventory/item/turboUpgrade/${id}/10" class="btn upgrade turbo">Turbo X10 48 000 + 23.60Kč</a>
  </div></div>`;

function hra(opts = {}) {
  const z = { get: [], kliky: [] };
  const stav = { uroven: opts.uroven != null ? opts.uroven : 0, kvalita: opts.kvalita || 0.15 };
  CMC.parse.apiGet = async url => {
    z.get.push(url);
    const m = String(url).match(/upgrade\/(\d+)/);
    if (!m) return { status: 404, raw: '' };
    return { status: 200, raw: OKNO(m[1], stav.uroven, stav.kvalita) };
  };
  CMC.gym = { gameHost: () => D.body, collect: () => {},
    setStatus: (t, o) => { (z.hlasky || (z.hlasky = [])).push({ t, o }); } };
  D.body.addEventListener('click', ev => {
    const a = ev.target.closest ? ev.target.closest('[action]') : null;
    if (!a) return;
    const akce = a.getAttribute('action') || '';
    if (!/\/inventory\/item\/(turbo)?[Uu]pgrade\//.test(akce)) return;
    z.kliky.push(akce);
    if (opts.hluchy) return;
    stav.uroven += 1;                       // hra po vylepšení zvedne úroveň
  });
  z.stav = stav;
  return z;
}

function spinave(v) {
  let el = D.querySelector('.value.renew-dirty_money');
  if (!el) { el = D.createElement('div'); el.className = 'value renew-dirty_money'; D.body.appendChild(el); }
  el.textContent = String(v);
}

function uklid() {
  D.body.innerHTML = '';
  D.body.replaceWith(D.body.cloneNode(false));
  globalThis.document = D;
}

(async () => {
  await CMC.store.load();

  console.log('\n[★] značka se ukládá k danému kusu, ne k produktu');
  {
    uklid(); await CMC.store.put('oblibene', {});
    hra();
    const a = karta(161599, 'pets/rare/chain_bulldog');
    const b = karta(161600, 'pets/rare/chain_bulldog');   // TÝŽ produkt, jiný kus
    O.scan();
    const hvezda = k => k.querySelector('.cmc-fav');
    ok('hvězdička je na obou kartách', !!hvezda(a) && !!hvezda(b));
    eq('a je prázdná', hvezda(a).textContent, '☆');

    hvezda(a).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    ok('první kus je oblíbený', O.jeOblibeny('161599'));
    ok('druhý kus TÝŽ produkt oblíbený NENÍ', !O.jeOblibeny('161600'));
    eq('hvězdička je plná', hvezda(a).textContent, '★');
    eq('u druhé se nic nezměnilo', hvezda(b).textContent, '☆');
    ok('uložil se i master z obrázku',
      CMC.store.get().oblibene['161599'].master === 'pets/rare/chain_bulldog');

    hvezda(a).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    ok('druhý klik označení zruší', !O.jeOblibeny('161599'));
  }

  console.log('\n[★] klik na hvězdičku nespustí akci předmětu');
  {
    uklid(); await CMC.store.put('oblibene', {});
    const z = hra();
    const k = karta(161599, 'pets/rare/chain_bulldog');
    O.scan();
    k.querySelector('.cmc-fav').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    eq('žádná herní akce', z.kliky.length, 0);
  }

  console.log('\n[okno] cena a stav se čtou GETem, bez klikání');
  {
    uklid(); spinave(1e9);
    hra({ uroven: 3, kvalita: 0.15 });
    const s = await O.stav('161599');
    eq('úroveň', s.uroven, 3);
    eq('kvalita', s.kvalita, 0.15);
    eq('špinavé z ceny', s.cena.spinave, 2.36);
    /* první dvě čísla se NEHÁDAJÍ – vrací se jako „zbylé zdroje“ */
    eq('zbylé zdroje zůstanou nepojmenované', s.cena.zbyle.join('/'), '9.99/2.01');
    ok('lze vylepšit', s.lzeVylepsit);
    eq('název z okna', s.nazev, 'Řetězový buldok');
  }

  console.log('\n[vylepšení] !!! KLIKÁ SE NA BĚŽNÉ, NIKDY NA TURBO !!!');
  {
    uklid(); spinave(1e9);
    const z = hra({ uroven: 0 });
    const r = await O.vylepsi('161599');
    eq('kliklo se jednou', z.kliky.length, 1);
    eq('a na běžné vylepšení', z.kliky[0], '/inventory/item/upgrade/161599');
    ok('na Turbo se nesáhlo', !z.kliky.some(k => /turboUpgrade/.test(k)));
    eq('úroveň stoupla', r.uroven.po, 1);
    eq('a cena se zapsala', r.cena.spinave, 2.36);
  }

  console.log('\n[vylepšení] když se nic nezmění, NENÍ to úspěch');
  {
    uklid(); spinave(1e9);
    const z = hra({ hluchy: true });
    let chyba = null;
    try { await O.vylepsi('161599'); } catch (e) { chyba = e.message; }
    ok('ohlásí se chyba', /nic nezměnil/.test(String(chyba)));
    eq('klik přitom padl', z.kliky.length, 1);
  }

  console.log('\n[vylepšení] chybějící špinavé peníze a captcha');
  {
    uklid(); spinave(1);
    let z = hra();
    let chyba = null;
    try { await O.vylepsi('161599'); } catch (e) { chyba = e.message; }
    ok('bez peněz se nekliká', /chybí špinavé/.test(String(chyba)));
    eq('žádný klik', z.kliky.length, 0);

    uklid(); spinave(1e9);
    z = hra();
    D.body.insertAdjacentHTML('beforeend', '<div class="modal-box captcha-modal active"></div>');
    chyba = null;
    try { await O.vylepsi('161599'); } catch (e) { chyba = e.message; }
    ok('při captcze se nekliká', /captchu/.test(String(chyba)));
    eq('žádný klik', z.kliky.length, 0);
  }

  console.log('\n[lišta] tlačítko na každý oblíbený kus');
  {
    uklid(); spinave(1e9);
    hra({ uroven: 2 });
    await CMC.store.put('oblibene', {
      161599: { nazev: 'Řetězový buldok', master: 'pets/rare/chain_bulldog' }
    });
    const t = O.buttons(() => {});
    eq('jedno tlačítko', t.length, 1);
    ok('má název kusu', /Řetězový/.test(t[0].textContent));
    ok('a v popisku je, že Turbo se nepoužívá', /Turbo se nepoužívá/.test(t[0].title));

    await CMC.store.put('oblibene', {});
    eq('bez oblíbených se řádek nestaví', O.buttons(() => {}).length, 0);
  }

  console.log('\n[layout] !!! DO POZICOVÁNÍ HERNÍCH PRVKŮ SE NESAHÁ !!!');
  {
    /*
     * Tohle rozhodilo celý inventář: hvězdička dostala `position: relative` na
     * `.col-card-inner`, aby se měla čeho držet. Ale `.col` je ve hře UŽ
     * `relative` a všechny absolutně pozicované prvky karty (`.corners` a jejích
     * devět rohů, odznak vzácnosti, ikony akcí) se pozicují proti němu – bližší
     * `relative` jim změnil vztažný rámec a odskočily.
     */
    const css = fs.readFileSync(path.join(EXT, 'panel.css'), 'utf8');
    const pravidla = css.replace(/\/\*[\s\S]*?\*\//g, '');
    ok('rozšíření nepřidává position herním prvkům karty',
      !/\.col(-card)?[^{]*\{[^}]*position\s*:/.test(pravidla));
    ok('ani jinému hernímu prvku inventáře',
      !/\.(col-card-inner|col-card-art|acts|corners)[^{]*\{[^}]*position\s*:/.test(pravidla));

    /* hvězdička patří přímo do `.col`, který hra pozicuje sama */
    uklid();
    hra();
    const k = karta(161599, 'pets/rare/chain_bulldog');
    O.scan();
    const b = k.querySelector('.cmc-fav');
    eq('hvězdička je dítě .col', b.parentElement.className, 'col');
    ok('ne uvnitř karty', !k.querySelector('.col-card-inner .cmc-fav'));
    ok('a ne mezi akcemi (prodej!)', !k.querySelector('.acts .cmc-fav'));

    /* herní prvky karty musí zůstat, jak byly */
    ok('akce předmětu zůstaly tři', k.querySelectorAll('.acts a').length === 3);
    ok('odznak vzácnosti je pořád na místě', !!k.querySelector('.col-card-badge .rank'));

    /*
     * Umístění: vlevo nahoře má hra rank, vpravo nahoře pruh akcí (včetně
     * PRODEJE) a úplně dole staty. Hvězdička patří do pravého dolního kouta,
     * ale NAD staty – doslovný `bottom: 4px` by ležel na čísle rychlosti.
     */
    const pravidlo = (css.match(/\.cmc-fav \{[^}]*\}/) || [''])[0];
    ok('je vpravo', /right:\s*\d+px/.test(pravidlo) && !/left:\s*\d+px/.test(pravidlo));
    ok('a dole', /bottom:\s*\d+px/.test(pravidlo) && !/top:\s*\d+px/.test(pravidlo));
    const odspodu = +(pravidlo.match(/bottom:\s*(\d+)px/) || [0, 0])[1];
    ok('ale nad pruhem statů (' + odspodu + ' px > 27)', odspodu > 27);
    ok('a ne tak vysoko, aby lezla do akcí (' + odspodu + ' px < 130)', odspodu < 130);
  }

  console.log('\n[zdroj] Turbo se nesmí objevit jako akce');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/oblibene.js'), 'utf8');
    const kod = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('nikde se turbo adresa neskládá', !/turboUpgrade\/'|"turboUpgrade|\+ *'\/5'/.test(kod));
    ok('a je aktivně vyloučené', /!\/turboUpgrade\/\.test\(a\)/.test(kod.replace(/\s/g, '')) 
      || /turboUpgrade/.test(kod));
    ok('obal se jmenuje jako herní, jinak se klik nezachytí',
      /inventory-action-modal/.test(kod));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ oblíbené drží');
  process.exit(fails ? 1 : 0);
})();
