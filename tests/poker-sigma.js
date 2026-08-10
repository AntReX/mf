/* Poctivost pokeru: hlídač měří JINÉ okno než panel.
 *
 * !!! CO SI ODPOROVALO !!!
 * Panel ukazoval „Odchylka dealera +1,6 σ – rozdání vypadá poctivě“ a lišta
 * přitom hlásila „poker vypnut: rozdání je vychýlené 2,2 σ a víc“. Obě čísla
 * byla pravdivá: `poctivost()` bez parametru bere CELÝ log, hlídač jen
 * posledních `STOP_OKNO` kol. Vypadalo to jako chyba, protože okno hlídače
 * nebylo v panelu vidět.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules/jsdom'));
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location', 'Blob', 'URL', 'SVGElement'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
for (const f of manifest.content_scripts[0].js.filter(f => f !== 'content.js'))
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (String(g) === String(w) ? '' : `  got ${JSON.stringify(g)} want ${JSON.stringify(w)}`), String(g) === String(w));

/**
 * Kolo do logu. `vysoke` je počet vysokých karet u dealera (0–2); zbytek devítky
 * se dorovná nízkými, aby test měřil právě to, co `poctivost()` počítá.
 */
function kolo(vysokeDealer, vysokeCelkem) {
  const V = ['J♦', 'Q♠', 'K♥', 'A♣'];
  const N = ['2♦', '3♠', '4♥', '5♣', '6♦', '7♠', '8♥'];
  const dealer = [];
  for (let i = 0; i < 2; i++) dealer.push(i < vysokeDealer ? V[i % 4] : N[i % 7]);
  const zbyva = Math.max(0, vysokeCelkem - vysokeDealer);
  const ostatni = [];
  for (let i = 0; i < 7; i++) ostatni.push(i < zbyva ? V[i % 4] : N[i % 7]);
  return {
    at: 1, ante: 10, sazka: 10, vraceno: 10, vysledek: 'remíza',
    moje: ostatni.slice(0, 2).join(' '),
    board: ostatni.slice(2).join(' '),
    dealer: dealer.join(' ')
  };
}

/** Log: `starych` poctivých kol a `cerstvych` vychýlených NAVRCH (recent je od nejnovějšího). */
async function log(cerstvych, starych) {
  const recent = [];
  /* čerstvá: dealer bere obě vysoké z devíti */
  for (let i = 0; i < cerstvych; i++) recent.push(kolo(2, 2));
  /* starší: vysoké karty jsou dvě z devíti, ale dealerovi patří jen občas */
  for (let i = 0; i < starych; i++) recent.push(kolo(i % 5 === 0 ? 1 : 0, 2));
  await CMC.store.put('pkLog', { rounds: recent.length, recent });
}

(async () => {
  await CMC.store.load();
  await CMC.store.patch('read', { pkStopVychyleni: true, casinoAuto: 'poker' });

  console.log('\n[σ] celý log a čerstvé okno se mohou LIŠIT');
  {
    await log(200, 900);
    const cely = CMC.poker.poctivost();
    const okno = CMC.poker.poctivost(CMC.poker.STOP_OKNO, CMC.poker.STOP_MIN_KOL);
    ok('obě měření mají dost kol', cely.dost && okno.dost);
    ok('okno je kratší než log (' + okno.kol + ' < ' + cely.kol + ')', okno.kol < cely.kol);
    ok('a čerstvé okno je vychýlenější (' + Math.round(okno.sigmaDealer * 10) / 10
      + ' σ > ' + Math.round(cely.sigmaDealer * 10) / 10 + ' σ)',
    okno.sigmaDealer > cely.sigmaDealer);
    eq('okno hlídače je 300 kol', CMC.poker.STOP_OKNO, 300);
    eq('a prah 2,2 σ', CMC.poker.STOP_SIGMA, 2.2);
  }

  console.log('\n[panel] ukazuje OBĚ čísla, ne jen jedno');
  {
    const el = D.createElement('div');
    CMC.tabs.poker.render(el, { repaint() {} });
    const t = el.textContent.replace(/\s+/g, ' ');
    /* hlavní číslo je OKNO, celý log je až kontext o řádek níž */
    ok('hlavní odchylka je za posledních 300 kol',
      /Odchylka dealera – posledních 300 kol/.test(t));
    const uryvek = (t.match(/Kol v testu[^·]{0,40}/) || ['?'])[0];
    ok('kol v testu je okno hlídače (' + uryvek + ')',
      /Kol v testu \(okno hlídače\)\s*300/.test(t));
    ok('celý log je jen pro srovnání', /Pro srovnání – celý log \(1 100 kol\)/.test(t));
    ok('a je vidět prah hlídače', /hlídač 2\.2 σ|hlídač 2,2 σ/.test(t));
  }

  console.log('\n[panel] !!! NETVRDÍ „POCTIVÉ“, KDYŽ HLÍDAČ ZASTAVUJE !!!');
  {
    const okno = CMC.poker.poctivost(CMC.poker.STOP_OKNO, CMC.poker.STOP_MIN_KOL);
    ok('čerstvé okno je nad prahem (' + Math.round(okno.sigmaDealer * 10) / 10 + ' σ)',
      okno.sigmaDealer > CMC.poker.STOP_SIGMA);
    const el = D.createElement('div');
    CMC.tabs.poker.render(el, { repaint() {} });
    const t = el.textContent.replace(/\s+/g, ' ');
    ok('nepíše „rozdání vypadá poctivě“', !/vypadá poctivě/.test(t));
    ok('a řekne, že je automatika vypnutá', /Automatika je nad prahem vypnutá/.test(t));
  }

  console.log('\n[panel] když je poctivé obojí, verdikt zůstává příznivý');
  {
    await log(0, 1000);
    const okno = CMC.poker.poctivost(CMC.poker.STOP_OKNO, CMC.poker.STOP_MIN_KOL);
    ok('okno je v pořádku (' + Math.round(okno.sigmaDealer * 10) / 10 + ' σ)',
      okno.sigmaDealer <= 2);
    const el = D.createElement('div');
    CMC.tabs.poker.render(el, { repaint() {} });
    const t = el.textContent.replace(/\s+/g, ' ');
    ok('píše, že rozdání vypadá poctivě', /vypadá poctivě/.test(t));
    ok('a nevaruje zbytečně', !/Automatika je nad prahem vypnutá/.test(t));
  }

  console.log('\n[nastavení] prah hlídače se dá změnit');
  {
    await log(200, 900);
    const okno = CMC.poker.poctivost(CMC.poker.STOP_OKNO, CMC.poker.STOP_MIN_KOL);
    ok('okno je hodně vychýlené (' + Math.round(okno.sigmaDealer) + ' σ)',
      okno.sigmaDealer > 5);

    await CMC.store.patch('read', { pkStopSigma: 2.2 });
    eq('výchozí prah', CMC.poker.stopSigma(), 2.2);
    await CMC.store.patch('read', { pkStopSigma: 40 });
    eq('nad 20 se to nepustí (pojistka proti rozbité hodnotě)',
      CMC.poker.stopSigma(), 20);
    await CMC.store.patch('read', { pkStopSigma: 0 });
    eq('nula spadne na výchozí', CMC.poker.stopSigma(), 2.2);

    /* vysoký prah znamená, že panel nesmí hlásit vypnutí */
    await CMC.store.patch('read', { pkStopSigma: 15 });
    const el = D.createElement('div');
    CMC.tabs.poker.render(el, { repaint() {} });
    const t = el.textContent.replace(/\s+/g, ' ');
    ok('prah z nastavení je v panelu vidět', /hlídač 15 σ/.test(t));
    await CMC.store.patch('read', { pkStopSigma: 2.2 });

    /* okno zůstává pevné – uživatel si ho měnit nepřál */
    eq('okno je pořád 300', CMC.poker.STOP_OKNO, 300);
    const src = fs.readFileSync(path.join(EXT, 'src/poker.js'), 'utf8');
    ok('a nečte se z nastavení', !/STOP_OKNO\s*=\s*[^;]*store/.test(src));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ poctivost drží');
  process.exit(fails ? 1 : 0);
})();
