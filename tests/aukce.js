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
function polozka(id, cena, sekund, druh) {
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
        action="https://s1.czechmafie.cz/map/building/${druh || 'auction'}/bid/${id}">Nabídnout cenu</button>
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
    eq('id z adresy tlačítka', A.lotId(it), 'auction:666');
    eq('cena', A.currentBid(it), 200000987);
    eq('čas z data-time (ms)', Math.round(A.zbyva(it)), 10149178);

    /* Bez `data-time` se čas složí z odpočtu – 00:02:30. */
    it.removeAttribute('data-time');
    eq('záloha z odpočtu', A.zbyva(it), 150000);
  }

  console.log('\n[vedu?] odvozuje se z VLASTNÍ nabídky, hra to neukazuje');
  {
    await nastav({});
    ok('bez uložené nabídky nevedu', A.veduJa('auction:666', 1000) === false);
    await nastav({ 'auction:666': { strop: 5000, moje: 1000 } });
    ok('stejná cena = vede moje', A.veduJa('auction:666', 1000) === true);
    ok('o haléře výš pořád moje', A.veduJa('auction:666', 1000.01) === true);
    ok('vyšší cena = někdo přehodil', A.veduJa('auction:666', 1001) === false);
  }

  console.log('\n[rozhodnutí] bez stropu se nedělá nic');
  {
    uklid(); spinave(1e12);
    await nastav({});
    const it = polozka('666', '1000', 60);
    eq('vypnuto', A.rozhodni(it, 'auction:666').co, 'vypnuto');
  }

  console.log('\n[rozhodnutí] !!! DÁL NEŽ TŘI MINUTY SE ČEKÁ !!!');
  {
    /*
     * Přihazovat dřív by jen zvedalo cenu proti sobě – každý příhoz je vidět
     * a ostatní mají čas reagovat.
     */
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 5000 } });
    const daleko = polozka('666', '1000', 600);          // 10 minut
    const r1 = A.rozhodni(daleko, 'auction:666');
    eq('čeká', r1.co, 'ceka');
    ok('a řekne proč', /poslední 3 min/.test(r1.text));

    uklid(); spinave(1e12);
    const blizko = polozka('666', '1000', 150);          // 2:30
    const r2 = A.rozhodni(blizko, 'auction:666');
    eq('v okně přihodí', r2.co, 'prihodit');
    /* !!! 2 %, ne koruna – nižší nabídku hra nepřijme !!! */
    eq('o 2 % výš', r2.cil, 1020);
    ok('a je to v hlášce vidět', /\+2 %/.test(r2.text));
  }

  console.log('\n[příhoz] 2 % se počítají nahoru a v celých korunách');
  {
    eq('z 1000 → 1020', A.prihozZ(1000), 1020);
    eq('z 1 → 2 (nahoru, ne 1,02)', A.prihozZ(1), 2);
    eq('z 200 000 987 → 204 001 007', A.prihozZ(200000987), 204001007);
    ok('nikdy to není o korunu', A.prihozZ(1000) !== 1001);
  }

  console.log('\n[rozhodnutí] strop se nepřekročí');
  {
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 1019 } });      // 2 % z 1000 = 1020
    const it = polozka('666', '1000', 60);
    const r = A.rozhodni(it, 'auction:666');
    eq('nepřihazuje', r.co, 'strop');
    ok('a je vidět, kolik by to bylo', /1 020/.test(norm(r.text)));

    await nastav({ 'auction:666': { strop: 1020 } });
    eq('přesně na strop ještě jde', A.rozhodni(it, 'auction:666').co, 'prihodit');
  }

  console.log('\n[limit] !!! DENNÍ LIMIT K PŘEDMĚTŮM NEPATŘÍ !!!');
  {
    /*
     * „Můžeš přihazovat v aukcích 4/4 krát denně“ je limit DIAMANTOVÉ aukce
     * (`pointsAuction`), ne dražeb předmětů. Chvíli se ukazoval i u předmětů,
     * což hlásilo omezení, které tam neexistuje.
     */
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 100000 } });
    D.body.insertAdjacentHTML('beforeend',
      '<p>Můžeš přihazovat v aukcích 4/4 krát denně</p>');
    const it = polozka('666', '1000', 60);
    const r = A.rozhodni(it, 'auction:666');
    eq('přihodí se', r.co, 'prihodit');
    ok('a o limitu ani slovo (' + r.text + ')', !/limit/i.test(r.text));
    ok('modul limit vůbec nečte', typeof A.limitDne === 'undefined');
  }

  console.log('\n[příhoz] uloží se jako moje, až když cena opravdu stoupne');
  {
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 5000 } });
    const it = polozka('666', '1000', 60);
    const z = hra();
    const v = await A.prihod(it, 'auction:666', 1020);
    eq('poslalo se 1020', z.kliky[0], 1020);
    eq('a zapsalo jako moje', CMC.store.get().aukce['auction:666'].moje, 1020);
    eq('takže teď vedu', A.rozhodni(it, 'auction:666').co, 'vedu');
  }

  console.log('\n[příhoz] !!! NEPROŠLÝ PŘÍHOZ SE NESMÍ ZAPSAT !!!');
  {
    /*
     * Kdyby se „moje“ zapsalo i po neúspěchu, hlídka by si myslela, že vede,
     * a do konce dražby by už nikdy nepřihodila.
     */
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 5000 } });
    const it = polozka('666', '1000', 60);
    const z = hra({ hluchy: true });
    let chyba = null;
    try { await A.prihod(it, 'auction:666', 1020); } catch (e) { chyba = e.message; }
    ok('ohlásí se chyba', /neprošla/.test(String(chyba)));
    eq('klik přitom padl', z.kliky.length, 1);
    ok('ale nic se nezapsalo', CMC.store.get().aukce['auction:666'].moje == null);
    eq('takže se to zkusí znovu', A.rozhodni(it, 'auction:666').co, 'prihodit');
  }

  console.log('\n[kolo] hlavní vypínač, captcha a vězení mají přednost');
  {
    uklid(); spinave(1e12);
    await nastav({ 'auction:666': { strop: 5000 } });
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

  console.log('\n[diamanty] !!! DIAMANTOVÁ AUKCE SE NEŘEŠÍ !!!');
  {
    /*
     * Na stránce jsou tři druhy dražeb a poznají se jedině z adresy:
     * `auction` a `auctionSpecial` jsou předměty, `pointsAuction` DIAMANTY.
     * Do diamantů se nepřihazuje a nedostanou ani pole na strop.
     */
    uklid(); spinave(1e12);
    await CMC.store.patch('read', { auctionFill: true, autoPaused: false });
    await nastav({});
    const dia = polozka('12486', '80 000 323', 60, 'pointsAuction');
    const vec = polozka('32038', '1 300 000', 60, 'auction');
    const spec = polozka('666', '200 000 987', 60, 'auctionSpecial');

    ok('diamantová dražba nemá identitu', A.lotId(dia) === null);
    ok('a pozná se jako diamantová', A.jeDiamantova(dia));
    eq('předmět má', A.lotId(vec), 'auction:32038');
    eq('speciální předmět taky', A.lotId(spec), 'auctionSpecial:666');
    ok('druh je v klíči (jinak by si dražby pletly nabídky)',
      A.lotId(vec).startsWith('auction:'));

    A.scan();
    ok('diamanty nedostaly pole na strop', !dia.querySelector('.cmc-bid-strop'));
    ok('předmět ano', !!vec.querySelector('.cmc-bid-strop'));
    ok('a speciální taky', !!spec.querySelector('.cmc-bid-strop'));

    /* i kdyby měly strop, hlídka je nesmí vzít */
    await nastav({ 'pointsAuction:12486': { strop: 1e12 } });
    const z = hra();
    await A.kolo();
    ok('na diamanty se neklikalo', !z.kliky.length);
  }

  console.log('\n[lišta] +1 je zrušené, pole na strop je tam');
  {
    uklid(); spinave(1e12);
    await nastav({});
    await CMC.store.patch('read', { auctionFill: true });
    const it = polozka('666', '1000', 60);
    A.scan();
    const tlacitka = [...it.querySelectorAll('.cmc-bid-btn')].map(b => b.textContent);
    ok('žádné „+1“ Kč (' + tlacitka.join(' ') + ')', !tlacitka.includes('+1'));
    /*
     * !!! +1 % JE RUČNÍ VOLBA, NE MINIMUM AUTOMATIKY !!!
     * Dřív tu stálo, že +1 % tlačítko být nesmí, protože hra pod 2 % odmítá.
     * To platí pro HLÍDKU, která musí projít napoprvé – ručně si člověk vidí na
     * cenu i na to, jestli příhoz prošel, a menší krok se hodí, když nechce
     * cenu zbytečně vyhnat. Tohle je vědomé rozhodnutí, ne opomenutí.
     */
    ok('+1 % je k dispozici ručně', tlacitka.includes('+1 %'));
    ok('+2 % tam je (příhoz automatiky)', tlacitka.includes('+2 %'));
    ok('a +5 % zůstalo', tlacitka.includes('+5 %'));
    /*
     * Vložit přesně nejvyšší sázku nemá smysl: takovou nabídku hra nepřijme,
     * protože přebít se musí nahoru. Bylo to jen kliknutí navíc.
     */
    ok('tlačítko se stejnou částkou zmizelo',
      !tlacitka.some(t => /^[\d\s.,]+$/.test(t)));
    const strop = it.querySelector('.cmc-bid-strop');
    ok('pole na strop existuje', !!strop);

    /* zadání stropu se uloží k té dražbě, ne globálně */
    strop.value = '4321';
    strop.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));
    eq('uložilo se k dražbě 666', CMC.store.get().aukce['auction:666'].strop, 4321);
    ok('a u položky je vidět stav (' + it.querySelector('.cmc-bid-stav').textContent + ')',
      /přihodí|čeká|nad strop|chybí/.test(it.querySelector('.cmc-bid-stav').textContent));
  }

  console.log('\n[zdroj] hlavička už netvrdí, že se na tlačítko nesahá');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/auction.js'), 'utf8');
    ok('nepíše „NESAHAT“ jako platné pravidlo', !/na tlačítko [^\n]*nikdy nesahá/.test(src));
    ok('a přiznává, že umí přihodit sama', /umí přihodit sama/.test(src));
    ok('interval je 30 s', /KONTROLA_MS = 30000/.test(src));
    ok('automatika přihazuje 2 %, ne korunu',
      /PRIHOZ_PCT = 2/.test(src) && !/PRIHOZ = 1;/.test(src));
    ok('okno jsou 3 minuty', /OKNO_MS = 3 \* 60 \* 1000/.test(src));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ aukce drží');
  process.exit(fails ? 1 : 0);
})();
