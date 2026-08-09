/* Aukce (#2): strop a automatické přihazování.
 *
 * !!! HRA NEUKAZUJE, KDO VEDE !!!
 * Ve výpisu dražeb není žádné jméno – ani vlastní. „Vedu?“ se proto odvozuje
 * z vlastní poslední nabídky: cena vyšší než moje = někdo mě přehodil, stejná =
 * vede pořád moje (nižší ani stejnou nabídku hra od nikoho jiného nepřijme).
 * Fixtury jsou opsané ze živé hry 9. 8. 2026 včetně `data-time` a adresy
 * `…/auctionSpecial/bid/666`, ze které se bere identita dražby.
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
/* captcha.js musí být naložená – bez ní by test „při captcze nic“ měřil jen to,
 * že `NS.captcha` neexistuje, a prošel by i s rozbitou kontrolou */
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/queue.js',
  'src/jail.js', 'src/captcha.js', 'src/auction.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;
const A = CMC.auction;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (norm(g) === norm(w) ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`), norm(g) === norm(w));

/** Položka dražby tak, jak ji hra posílá. `sekund` jde do `data-time`. */
function polozka(id, cena, sekund) {
  const el = D.createElement('div');
  el.className = 'static-inv holder';
  el.setAttribute('data-time', String(sekund));
  el.innerHTML = `
    <div class="over-name">Mléko</div>
    <div class="auction-price">
      <div class="sum"><span class="icon-currency-money-dirty"></span>${cena}Kč</div>
      <div class="time"><div class="timer-down">
        <div class="hours">00</div><div class="minutes">02</div><div class="seconds">30</div>
      </div></div>
    </div>
    <div class="wrap">
      <input type="number" step="0.01" name="amount" class="form-control" placeholder="Tvá sázka?">
      <button class="btn btn-danger btn-sm bidAuction"
        action="https://s1.czechmafie.cz/map/building/auctionSpecial/bid/${id}">Nabídnout cenu</button>
    </div>`;
  D.body.appendChild(el);
  return el;
}

function spinave(v) {
  let el = D.querySelector('.value.renew-dirty_money');
  if (!el) { el = D.createElement('div'); el.className = 'value renew-dirty_money'; D.body.appendChild(el); }
  el.textContent = String(v);
}

/** Klik na „Nabídnout cenu“ jako ve hře: cena vyskočí na poslanou částku. */
function hra(opts = {}) {
  const z = { kliky: [] };
  D.body.addEventListener('click', ev => {
    const b = ev.target.closest ? ev.target.closest('.bidAuction') : null;
    if (!b) return;
    const it = b.closest('.static-inv.holder');
    const v = +it.querySelector('input[name=amount]').value;
    z.kliky.push(v);
    if (opts.hluchy) return;                      // klik bez následku
    it.querySelector('.sum').textContent = String(opts.prehozeno || v) + 'Kč';
  });
  return z;
}

function uklid() {
  D.body.innerHTML = '';
  D.body.replaceWith(D.body.cloneNode(false));
  globalThis.document = D;
}

(async () => {
  await CMC.store.load();
  const HLASKY = [];
  CMC.gym = { setStatus: (t, o) => HLASKY.push({ t, o }) };
  const nastav = async o => CMC.store.put('aukce', o);

  console.log('\n[čtení] identita dražby a čas');
  {
    uklid();
    const it = polozka('666', '200 000 987', 10149.178);
    eq('id z adresy tlačítka', A.lotId(it), '666');
    eq('cena', A.currentBid(it), 200000987);
    eq('čas z data-time (ms)', Math.round(A.zbyva(it)), 10149178);

    /* Bez `data-time` se čas složí z odpočtu – 00:02:30. */
    it.removeAttribute('data-time');
    eq('záloha z odpočtu', A.zbyva(it), 150000);
  }

  console.log('\n[vedu?] odvozuje se z VLASTNÍ nabídky, hra to neukazuje');
  {
    await nastav({});
    ok('bez uložené nabídky nevedu', A.veduJa('666', 1000) === false);
    await nastav({ 666: { strop: 5000, moje: 1000 } });
    ok('stejná cena = vede moje', A.veduJa('666', 1000) === true);
    ok('o haléře výš pořád moje', A.veduJa('666', 1000.01) === true);
    ok('vyšší cena = někdo přehodil', A.veduJa('666', 1001) === false);
  }

  console.log('\n[rozhodnutí] bez stropu se nedělá nic');
  {
    uklid(); spinave(1e12);
    await nastav({});
    const it = polozka('666', '1000', 60);
    eq('vypnuto', A.rozhodni(it, '666').co, 'vypnuto');
  }

  console.log('\n[rozhodnutí] !!! DÁL NEŽ TŘI MINUTY SE ČEKÁ !!!');
  {
    /*
     * Přihazovat dřív by jen zvedalo cenu proti sobě – každý příhoz je vidět
     * a ostatní mají čas reagovat.
     */
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 5000 } });
    const daleko = polozka('666', '1000', 600);          // 10 minut
    const r1 = A.rozhodni(daleko, '666');
    eq('čeká', r1.co, 'ceka');
    ok('a řekne proč', /poslední 3 min/.test(r1.text));

    uklid(); spinave(1e12);
    const blizko = polozka('666', '1000', 150);          // 2:30
    const r2 = A.rozhodni(blizko, '666');
    eq('v okně přihodí', r2.co, 'prihodit');
    eq('o korunu víc', r2.cil, 1001);
  }

  console.log('\n[rozhodnutí] strop se nepřekročí ani o korunu');
  {
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 1000 } });
    const it = polozka('666', '1000', 60);
    const r = A.rozhodni(it, '666');
    eq('nepřihazuje', r.co, 'strop');
    ok('a je vidět, kolik by to bylo', /1 001/.test(norm(r.text)));

    await nastav({ 666: { strop: 1001 } });
    eq('přesně na strop ještě jde', A.rozhodni(it, '666').co, 'prihodit');
  }

  console.log('\n[rozhodnutí] když vedu, nepřihazuju sám sobě');
  {
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 100000, moje: 1000 } });
    const it = polozka('666', '1000', 60);
    const r = A.rozhodni(it, '666');
    eq('vedu', r.co, 'vedu');
  }

  console.log('\n[rozhodnutí] chybějící špinavé peníze se nehádají');
  {
    uklid(); spinave(500);
    await nastav({ 666: { strop: 100000 } });
    const it = polozka('666', '1000', 60);
    eq('nepřihazuje', A.rozhodni(it, '666').co, 'penize');
  }

  console.log('\n[příhoz] uloží se jako moje, až když cena opravdu stoupne');
  {
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 5000 } });
    const it = polozka('666', '1000', 60);
    const z = hra();
    const v = await A.prihod(it, '666', 1001);
    eq('poslalo se 1001', z.kliky[0], 1001);
    eq('a zapsalo jako moje', CMC.store.get().aukce['666'].moje, 1001);
    eq('takže teď vedu', A.rozhodni(it, '666').co, 'vedu');
  }

  console.log('\n[příhoz] !!! NEPROŠLÝ PŘÍHOZ SE NESMÍ ZAPSAT !!!');
  {
    /*
     * Kdyby se „moje“ zapsalo i po neúspěchu, hlídka by si myslela, že vede,
     * a do konce dražby by už nikdy nepřihodila.
     */
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 5000 } });
    const it = polozka('666', '1000', 60);
    const z = hra({ hluchy: true });
    let chyba = null;
    try { await A.prihod(it, '666', 1001); } catch (e) { chyba = e.message; }
    ok('ohlásí se chyba', /neprošla/.test(String(chyba)));
    eq('klik přitom padl', z.kliky.length, 1);
    ok('ale nic se nezapsalo', CMC.store.get().aukce['666'].moje == null);
    eq('takže se to zkusí znovu', A.rozhodni(it, '666').co, 'prihodit');
  }

  console.log('\n[kolo] hlavní vypínač, captcha a vězení mají přednost');
  {
    uklid(); spinave(1e12);
    await nastav({ 666: { strop: 5000 } });
    polozka('666', '1000', 60);
    const z = hra();

    await CMC.store.patch('read', { autoPaused: true });
    eq('při pauze nic', await A.kolo(), 0);

    await CMC.store.patch('read', { autoPaused: false });
    D.body.insertAdjacentHTML('beforeend', '<div class="modal-box captcha-modal active"></div>');
    eq('při captcze nic', await A.kolo(), 0);
    D.querySelector('.captcha-modal').remove();

    eq('jinak přihodí', await A.kolo(), 1);
    eq('a kliklo se jednou', z.kliky.length, 1);
    ok('napsalo se to do lišty', HLASKY.some(h => /aukce: přihozeno/.test(h.t)));
  }

  console.log('\n[lišta] +1 je zrušené, pole na strop je tam');
  {
    uklid(); spinave(1e12);
    await nastav({});
    await CMC.store.patch('read', { auctionFill: true });
    const it = polozka('666', '1000', 60);
    A.scan();
    const tlacitka = [...it.querySelectorAll('.cmc-bid-btn')].map(b => b.textContent);
    ok('žádné „+1“ (' + tlacitka.join(' ') + ')', !tlacitka.includes('+1'));
    ok('procenta zůstala', tlacitka.includes('+1 %') && tlacitka.includes('+5 %'));
    const strop = it.querySelector('.cmc-bid-strop');
    ok('pole na strop existuje', !!strop);

    /* zadání stropu se uloží k té dražbě, ne globálně */
    strop.value = '4321';
    strop.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    eq('uložilo se k dražbě 666', CMC.store.get().aukce['666'].strop, 4321);
    ok('a u položky je vidět stav', /přihazuji|čeká|nad strop/.test(
      it.querySelector('.cmc-bid-stav').textContent));
  }

  console.log('\n[zdroj] hlavička už netvrdí, že se na tlačítko nesahá');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/auction.js'), 'utf8');
    ok('nepíše „NESAHAT“ jako platné pravidlo', !/na tlačítko [^\n]*nikdy nesahá/.test(src));
    ok('a přiznává, že umí přihodit sama', /umí přihodit sama/.test(src));
    ok('interval je 30 s', /KONTROLA_MS = 30000/.test(src));
    ok('okno jsou 3 minuty', /OKNO_MS = 3 \* 60 \* 1000/.test(src));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ aukce drží');
  process.exit(fails ? 1 : 0);
})();
