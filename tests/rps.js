/* Kámen–Nůžky–Papír (#17): čtení důvodu odmítnutí.
 *
 * !!! ODPOVĚDI JSOU OPSANÉ ZE ŽIVÉ HRY (7. 8. 2026) !!!
 * Hra odmítá dvěma různými tvary a ten druhý shodil celou hlášku na „N“:
 *   422 {"message":"Minimální číslo může být 100","errors":{"amount":[…]}}
 *   403 {"errors":"Nemáš dostatek špinavých peněz. Potřebuješ <b…>1 000Kč</b>…"}
 * U toho druhého je `errors` prostý TEXT – `Object.values()` nad ním vrátí
 * jednotlivé ZNAKY, takže z hlášky zbylo první „N“ a v liště svítilo „⚠ KNP: N“.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules/jsdom'));
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><head>'
  + '<meta name="csrf-token" content="TEST"></head><body></body></html>',
{ url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/queue.js', 'src/rps.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC;
const R = CMC.rps;

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };

/** Odpověď serveru; `telo` je to, co doopravdy vrací. */
function server(status, telo) {
  const zaznam = { volani: [] };
  globalThis.fetch = async (url, opts) => {
    zaznam.volani.push({ url, body: opts && opts.body });
    return {
      status,
      async text() { return typeof telo === 'string' ? telo : JSON.stringify(telo); }
    };
  };
  return zaznam;
}

(async () => {
  await CMC.store.load();

  console.log('\n[hláška] !!! TO, CO DĚLALO Z CELÉ CHYBY JEDINÉ „N“ !!!');
  {
    /* Přesná odpověď ze živé hry – `errors` je TEXT, `message` chybí. */
    const telo = { errors: 'Nemáš dostatek špinavých peněz. Potřebuješ'
      + ' <b class=pretty-points-value><span class=icon-currency-money-dirty></span>'
      + '1 000Kč</b> Nezapomeň, že v bance' };
    const d = R.duvodOdmitnuti(telo, 403);
    ok('není to jedno písmeno', d.length > 5);
    ok('a řekne, co se stalo (' + d.slice(0, 40) + '…)',
      /Nemáš dostatek špinavých peněz/.test(d));
    ok('HTML značky v liště nekončí', !/[<>]/.test(d));
    ok('a částka v hlášce zůstane', /1 000Kč/.test(d));
  }

  console.log('\n[hláška] laravelovský tvar zůstává funkční');
  {
    const d = R.duvodOdmitnuti(
      { message: 'Minimální číslo může být 100', errors: { amount: ['Minimální číslo může být 100'] } }, 422);
    eq('bere se `message`', d, 'Minimální číslo může být 100');
  }

  console.log('\n[hláška] errors jako objekt s polem (bez message)');
  {
    const d = R.duvodOdmitnuti({ errors: { amount: ['Minimální číslo může být 100'] } }, 422);
    eq('vytáhne se text z pole', d, 'Minimální číslo může být 100');
  }

  console.log('\n[hláška] když hra nepošle nic srozumitelného');
  {
    ok('řekne aspoň stav', /HTTP 500/.test(R.duvodOdmitnuti(null, 500)));
    ok('prázdný errors nepovažuje za hlášku', /HTTP 403/.test(R.duvodOdmitnuti({ errors: '' }, 403)));
    ok('ani prázdné pole', /HTTP 403/.test(R.duvodOdmitnuti({ errors: { a: [] } }, 403)));
  }

  console.log('\n[vytvoření] odmítnutí projde až k volajícímu jako čitelný text');
  {
    server(403, { errors: 'Nemáš dostatek špinavých peněz. Potřebuješ 1 000Kč' });
    let chyba = null;
    try { await R.vytvor(1000); } catch (e) { chyba = e.message; }
    ok('chyba nese celý důvod', /Nemáš dostatek špinavých peněz/.test(String(chyba)));
    ok('a není to „N“', String(chyba) !== 'N');
  }

  console.log('\n[vytvoření] úspěch vrátí, co se vypsalo');
  {
    const z = server(200, { confirm: 'Úspěšně umístěno' });
    const r = await R.vytvor(1000);
    eq('částka', r.castka, 1000);
    ok('znamení je jedno ze tří', R.ZNAMENI.includes(r.sign));
    eq('zpráva hry', r.zprava, 'Úspěšně umístěno');
    ok('poslalo se na createSSP', /createSSP/.test(z.volani[0].url));
    ok('a v těle je částka i znamení',
      /amount=1000/.test(z.volani[0].body) && /sign=/.test(z.volani[0].body));
  }

  console.log('\n[vytvoření] minimum vynucuje i klient');
  {
    const z = server(200, { confirm: 'Úspěšně umístěno' });
    const r = await R.vytvor(1);
    eq('zvedne se na minimum', r.castka, R.MIN);
    ok('a odešlo se minimum', /amount=100\b/.test(z.volani[0].body));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ KNP drží');
  process.exit(fails ? 1 : 0);
})();
