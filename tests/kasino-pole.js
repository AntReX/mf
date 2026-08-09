/* Pole vkladu v kasinu ovládá TŘI různá nastavení podle volby v AUTO.
 *
 * Proč to má test: uživatel přirozeně nejdřív napíše částku a AUTO zapne teprve
 * potom. Číslo tak spadne do sázky kuliček (`casinoStake`) a po přepnutí na
 * poker se pole překreslí na uložené `pkStake` – vypadá to, že se „vrátila
 * původní částka“. Nic se neztratí, ale poznat to nešlo.
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
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
for (const f of manifest.content_scripts[0].js.filter(f => f !== 'content.js'))
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (norm(g) === norm(w) ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`), norm(g) === norm(w));

/** Řádek kasina – vrací popisek cíle, pole a select AUTO. */
function radek() {
  D.body.innerHTML = '';
  const r = CMC.casino.row(() => {});
  D.body.appendChild(r);
  return {
    stitek: r.querySelector('.cmc-casino-cil'),
    pole: r.querySelector('input[type=number]'),
    sel: r.querySelector('select')
  };
}

const HLASKY = [];
CMC.gym.setStatus = (t, o) => HLASKY.push({ t, o });

(async () => {
  await CMC.store.load();
  await CMC.store.patch('read', { casinoBar: true, casinoStake: 1000,
    pkStake: 100, bjStake: 20, casinoAuto: '' });

  console.log('\n[pole] popisek říká, co zrovna nastavuje');
  {
    let r = radek();
    ok('při vypnuté automatice je to vklad kuliček', /vklad/.test(r.stitek.textContent));
    eq('a ukazuje casinoStake', r.pole.value, '1000');
    ok('popisek mluví o korunách', /KORUN/.test(r.stitek.title));

    await CMC.store.patch('read', { casinoAuto: 'poker' });
    r = radek();
    ok('u pokeru je to ante', /ante/.test(r.stitek.textContent));
    eq('a ukazuje pkStake, ne casinoStake', r.pole.value, '100');
    ok('popisek mluví o diamantech', /DIAMANT/.test(r.stitek.title));

    await CMC.store.patch('read', { casinoAuto: 'blackjack' });
    r = radek();
    ok('u blackjacku je to sázka', /sázka/.test(r.stitek.textContent));
    eq('a ukazuje bjStake', r.pole.value, '20');
  }

  console.log('\n[pole] !!! TA PAST: částka zadaná před zapnutím jde do kuliček !!!');
  {
    await CMC.store.patch('read', { casinoAuto: '', casinoStake: 1000, pkStake: 100 });
    const r = radek();
    /* uživatel přepíše pole na 500 a potvrdí (blur) */
    r.pole.value = '500';
    r.pole.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(x => setTimeout(x, 20));
    eq('uložilo se to do casinoStake', CMC.store.get().read.casinoStake, 500);
    eq('ante pokeru se nezměnilo', CMC.store.get().read.pkStake, 100);

    /* teprve teď zapne poker – pole musí ukázat ante, a musí to být vysvětlené */
    HLASKY.length = 0;
    const r2 = radek();
    r2.sel.value = 'poker';
    r2.sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(x => setTimeout(x, 20));
    ok('řekne se, co pole teď nastavuje',
      HLASKY.some(h => /pole teď nastavuje ante pokeru/.test(h.t)));
    ok('a že předchozí číslo nezmizelo',
      HLASKY.some(h => /jiná měna|zůstalo uložené/.test(h.t)));
    eq('sázka kuliček zůstala uložená', CMC.store.get().read.casinoStake, 500);
  }

  console.log('\n[pole] u pokeru se píše do pkStake a po desítkách');
  {
    await CMC.store.patch('read', { casinoAuto: 'poker', pkStake: 100, casinoStake: 500 });
    const r = radek();
    r.pole.value = '2000';
    r.pole.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(x => setTimeout(x, 20));
    eq('ante se uložilo', CMC.store.get().read.pkStake, 2000);
    eq('a sázka kuliček zůstala', CMC.store.get().read.casinoStake, 500);

    r.pole.value = '12';                 // žetony jsou po desítkách
    r.pole.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(x => setTimeout(x, 20));
    eq('12 se zaokrouhlí na desítky', CMC.store.get().read.pkStake, 10);
  }

  console.log('\n[pole] přepnutí mezi hrami se stejnou měnou to taky vysvětlí');
  {
    await CMC.store.patch('read', { casinoAuto: 'poker', pkStake: 500, bjStake: 20 });
    HLASKY.length = 0;
    const r = radek();
    r.sel.value = 'blackjack';
    r.sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(x => setTimeout(x, 20));
    ok('hláška zmíní blackjack',
      HLASKY.some(h => /sázku blackjacku/.test(h.t)));
    eq('ante pokeru se nepřepsalo', CMC.store.get().read.pkStake, 500);
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ pole vkladu drží');
  process.exit(fails ? 1 : 0);
})();
