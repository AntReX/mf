/* Jednorázový výpadek čtení nesmí vypnout automatiku.
 *
 * !!! CO SE STALO (10. 8. 2026) !!!
 * Poker se sám vypnul. V trace byly dva záznamy „kasino nelze přečíst (HTTP 404)“
 * ve 10:57:58 a 10:58:01 – budova přitom jinak odpovídala normálně. Každé takové
 * selhání se počítalo do `AUTO_MAX_FAILS`, takže krátká série výpadků vypnula
 * celou hru a uživatel ji našel vypnutou bez zjevné příčiny. Totéž předtím
 * shodilo vylepšování budov (12s timeout u banky).
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
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC;

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (String(g) === String(w) ? '' : `  got ${JSON.stringify(g)} want ${JSON.stringify(w)}`), String(g) === String(w));

/** Podstrčí `apiGet` posloupnost odpovědí. */
function odpovedi(...stavy) {
  const z = { volani: 0 };
  CMC.parse.apiGet = async () => {
    const s = stavy[Math.min(z.volani, stavy.length - 1)];
    z.volani++;
    if (s === 'chyba') throw new Error('Hra neodpověděla do 12 s.');
    return { status: s, raw: s === 200 ? '<div>ok</div>' : '' };
  };
  return z;
}

(async () => {
  await CMC.store.load();

  console.log('\n[apiGetTry] výpadek se zkusí znovu');
  {
    const z = odpovedi(404, 404, 200);
    const o = await CMC.parse.apiGetTry('/map/building/show/18', 10, 1);
    eq('nakonec 200', o.status, 200);
    eq('zkusilo se to třikrát', z.volani, 3);
    ok('a vrátí obsah', /ok/.test(o.raw));
    eq('a řekne, na kolikátý pokus', o.pokusu, 3);
  }

  console.log('\n[apiGetTry] pokusů je deset');
  {
    const z = odpovedi(404);
    const o = await CMC.parse.apiGetTry('/map/building/show/18', undefined, 1);
    eq('zůstane 404', o.status, 404);
    eq('zkusilo se to desetkrát', z.volani, 10);
    eq('a řekne kolik pokusů', o.pokusu, 10);
  }

  console.log('\n[apiGetTry] od pátého pokusu se interval PRODLUŽUJE');
  {
    /*
     * Prvních pár výpadků je okamžik a nemá cenu čekat. Když ale hra neodpovídá
     * pátý pokus v řadě, není to mrknutí – a bušit do ní každých 700 ms jí
     * nepomůže.
     */
    const p = CMC.parse.pauzaProPokus;
    eq('od pátého se to láme', CMC.parse.KLIDNI_OD, 5);
    eq('1. pokus', p(1), 700);
    eq('4. pokus ještě krátce', p(4), 700);
    eq('5. pokus dvojnásobek', p(5), 1400);
    eq('6. pokus', p(6), 2100);
    eq('9. pokus', p(9), 4200);
    ok('a je tam strop', p(50) <= 8000);
    let soucet = 0;
    for (let i = 1; i <= 9; i++) soucet += p(i);
    ok('deset pokusů trvá ~17 s, ne minuty (' + Math.round(soucet / 1000) + ' s)',
      soucet > 12000 && soucet < 25000);
  }

  console.log('\n[apiGetTry] po úspěchu se interval vrací na začátek');
  {
    /*
     * Prodloužení platí jen v rámci JEDNOHO čtení – nikde se nepamatuje. Kdyby
     * se stav nesl mezi voláními, jeden výpadek by zpomalil všechna další čtení.
     */
    let z = odpovedi(404, 404, 404, 404, 404, 200);   // uspěje až v 6. pokusu
    const t0 = Date.now();
    await CMC.parse.apiGetTry('/x', 10, 1);
    const dlouhe = Date.now() - t0;

    z = odpovedi(200);
    const t1 = Date.now();
    await CMC.parse.apiGetTry('/x', 10, 1);
    const kratke = Date.now() - t1;
    eq('další čtení je jediný pokus', z.volani, 1);
    ok('a nezdědí zpomalení (' + dlouhe + ' ms → ' + kratke + ' ms)', kratke <= dlouhe);
    ok('modul si nepamatuje žádný stav pokusů',
      !/let\s+(pokusy|zpomaleni|posledniPokus)/.test(
        fs.readFileSync(path.join(EXT, 'src/parse.js'), 'utf8')));
  }

  console.log('\n[apiGetTry] i vyhozená výjimka se bere jako výpadek');
  {
    const z = odpovedi('chyba', 200);
    const o = await CMC.parse.apiGetTry('/x', 10, 1);
    eq('druhý pokus prošel', o.status, 200);
    eq('dva pokusy', z.volani, 2);
  }

  console.log('\n[apiGetTry] první úspěch nic neopakuje');
  {
    const z = odpovedi(200);
    const o = await CMC.parse.apiGetTry('/x', 10, 1);
    eq('jedno volání', z.volani, 1);
    ok('a nehlásí počet pokusů, když nebyl potřeba', o.pokusu === undefined);
  }

  console.log('\n[zdroj] hry v kasinu čtou budovu s opakováním');
  {
    for (const f of ['src/poker.js', 'src/blackjack.js', 'src/slots.js', 'src/casino.js']) {
      const src = fs.readFileSync(path.join(EXT, f), 'utf8');
      ok(f + ' používá apiGetTry', /apiGetTry\(BUILDING/.test(src));
      ok(f + ' už nečte budovu naholo',
        !/=\s*await NS\.parse\.apiGet\(BUILDING\)/.test(src));
    }
  }

  console.log('\n[zdroj] apiGet zůstává BEZ opakování');
  {
    /*
     * Některá 404 jsou očekávaná – hra odmítá „přes odkaz“ („Spausk per mygtuką,
     * o ne per nuorodą!“). Kdyby opakoval i `apiGet`, dělal by trojnásobný provoz
     * pro nic.
     */
    const src = fs.readFileSync(path.join(EXT, 'src/parse.js'), 'utf8');
    const telo = (src.match(/async function apiGet\(path\)[\s\S]*?\n  \}/) || [''])[0];
    ok('apiGet neopakuje', !/for \(|while \(/.test(telo));
    ok('a apiGetTry je zvláštní funkce', /async function apiGetTry/.test(src));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ výpadky drží');
  process.exit(fails ? 1 : 0);
})();
