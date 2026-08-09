/* Noční obnovování – STRANA STRÁNKY. Rozvrh drží background (viz background.js).
 *
 * Tenhle modul umí tři věci a každá se dá pokazit jinak:
 *  – odpoví backgroundu, jestli se smí obnovit (a mlčení = zaseknutá stránka),
 *  – na jeho pokyn udělá odpočet a obnoví se (bez hlášky to vypadá jako pád),
 *  – NIKDY se neobnoví přes kontrolu „jsi člověk?“.
 *
 * Rozvrh tady být NESMÍ: Chrome v kartě na pozadí časovače brzdí a nakonec je
 * zmrazí, takže by se přes noc nemusel spustit ani jednou.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body>'
  + '<div class="modal-box center captcha-modal" style="display:flex"></div>'
  + '</body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

/*
 * `location.reload` jsdom nedovolí přepsat, takže se modulu podstrčí náhradní
 * `location` – jinak by test skutečně „obnovoval stránku“ a nešlo by to změřit.
 */
let RELOADU = 0;
globalThis.location = { href: dom.window.location.href,
  origin: dom.window.location.origin, reload: () => { RELOADU++; } };

const mem = {};
/* obsluhy zpráv od backgroundu – test je vyvolá ručně */
const POSLUCHACI = [];
globalThis.chrome = { runtime: { id: 'test',
    onMessage: { addListener(fn) { POSLUCHACI.push(fn); } } },
  storage: { local: {
    async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
    async set(o) { Object.assign(mem, o); }, async remove() {} },
    onChanged: { addListener() {} } } };

for (const f of ['src/store.js', 'src/fmt.js', 'src/captcha.js', 'src/reload.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

/* náhradní fronta – podle ní se pozná rozdělaná akce */
let BUSY = false, DELKA = 0;
CMC.queue = { get busy() { return BUSY; }, get length() { return DELKA; } };
const HLASKY = [];
CMC.gym = { setStatus: t => HLASKY.push(String(t || '')), collect() {} };

let fails = 0;
const eq = (n, g, w) => { const o = String(g) === String(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(String(g))} want ${JSON.stringify(String(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Doručí zprávu od backgroundu a vrátí, co stránka odpověděla. */
const posli = zprava => new Promise(hotovo => {
  let odpovezeno = false;
  for (const fn of POSLUCHACI) {
    fn(zprava, {}, v => { if (!odpovezeno) { odpovezeno = true; hotovo(v); } });
  }
  setTimeout(() => { if (!odpovezeno) hotovo(null); }, 50);
});

(async () => {
  await CMC.store.load();
  const R = CMC.reload;
  R.start();

  console.log('\n[rozvrh] stránka si ho nedrží – to je celý smysl změny');
  /*
   * Kdyby si plánovala sama, byly by dva rozvrhy a ten v kartě na pozadí by
   * neběžel. Modul proto žádné `naplanuj` ani vlastní časovač nemá.
   */
  ok('žádné plánování v API', typeof R.naplanuj === 'undefined');
  ok('ani rušení termínu', typeof R.zrus === 'undefined');
  ok('odpočet se čte z rozvrhu backgroundu', typeof R.zbyva === 'function');

  console.log('\n[odpočet] bere se z rozvrhu ve storage');
  eq('bez rozvrhu nic', R.zbyva(), 'null');
  await CMC.store.put('reloadPlan', { 7: { do: Date.now() + 600000, min: 42 } });
  await CMC.store.load();
  const z = R.zbyva();
  ok('spočítá se z termínu', z > 590 && z <= 600);
  // víc karet: ukazuje se ta nejbližší, protože ta se obnoví první
  await CMC.store.put('reloadPlan', {
    7: { do: Date.now() + 600000 }, 9: { do: Date.now() + 120000 } });
  await CMC.store.load();
  ok('z víc karet ta nejbližší', R.zbyva() <= 120);

  console.log('\n[dotaz] background se ptá, stránka odpovídá');
  /*
   * Že odpověď vůbec přijde, je pro background informace sama o sobě: mlčení
   * znamená zaseknutou stránku a ta se obnoví zvenčí.
   */
  await CMC.store.patch('read', { reloadAuto: true });
  BUSY = false; DELKA = 0;
  let odp = await posli({ cmc: 'zdravi' });
  ok('odpověď přišla', !!odp);
  eq('a je to v pořádku', odp.ok, true);
  eq('bez důvodu', String(odp.duvod), 'null');
  eq('a hlásí zapnutost', odp.zapnuto, true);

  console.log('\n[dotaz] rozdělaná akce se přizná i s důvodem');
  BUSY = true;
  odp = await posli({ cmc: 'zdravi' });
  eq('nesmí se', odp.ok, false);
  ok('a ví se proč', /běží akce/.test(String(odp.duvod)));
  BUSY = false; DELKA = 2;
  odp = await posli({ cmc: 'zdravi' });
  ok('čekající akce taky', odp.ok === false && /fronta|čekaj/.test(String(odp.duvod)));
  DELKA = 0;

  console.log('\n[dotaz] captcha se přizná a NEOBEJDE se');
  /*
   * Obnovením by captcha zmizela, tedy by se obcházela kontrola proti botům.
   * Zrovna tady na to musí být výslovná podmínka: ta tmavá prázdná stránka je
   * přesně stav, kdy člověk sáhne po F5.
   */
  D.querySelector('.captcha-modal').classList.add('active');
  odp = await posli({ cmc: 'zdravi' });
  eq('nesmí se', odp.ok, false);
  ok('a je jasné proč', /člověk/.test(String(odp.duvod)));
  RELOADU = 0;
  await posli({ cmc: 'obnov' });        // i na přímý pokyn se drží
  await sleep(1500);
  eq('ani na pokyn se neobnoví', RELOADU, 0);
  D.querySelector('.captcha-modal').classList.remove('active');

  console.log('\n[pokyn] na „obnov“ se udělá odpočet a pak obnovení');
  /*
   * Odpočet je jediný důvod, proč obnovení nedělá background rovnou: bez hlášky
   * vypadá obnovení jako pád stránky a člověk hledá chybu, která není.
   */
  ok('varování je aspoň 3 s', R.VAROVANI_S >= 3);
  HLASKY.length = 0;
  RELOADU = 0;
  BUSY = false; DELKA = 0;
  const prijato = await posli({ cmc: 'obnov' });
  ok('pokyn se potvrdí hned', prijato && prijato.prijato === true);
  await sleep(R.VAROVANI_S * 1000 + 700);
  eq('stránka se obnovila', RELOADU, 1);
  ok('a bylo to dopředu vidět', HLASKY.some(h => /obnovuji stránku za/.test(h)));
  ok('včetně odpočtu', HLASKY.some(h => /za 1 s/.test(h)));

  console.log('\n[pokyn] když se během odpočtu něco rozjede, ustoupí se');
  RELOADU = 0;
  BUSY = false; DELKA = 0;
  await posli({ cmc: 'obnov' });
  await sleep(1200);
  BUSY = true;                          // uprostřed odpočtu se rozjela akce
  await sleep(R.VAROVANI_S * 1000 + 700);
  eq('neobnovilo se', RELOADU, 0);
  BUSY = false;

  console.log('\n[zprávy] cizí zprávy se ignorují');
  const cizi = await posli({ cmc: 'neco-jineho' });
  eq('nic se neodpoví', String(cizi), 'null');

  console.log('\n[lišta] zaškrtávátko patří k ovládání karty');
  const b = R.box(() => {});
  ok('je to zaškrtávátko', !!b.querySelector('input[type=checkbox]'));
  ok('s vlastní třídou', /cmc-gym-reload/.test(b.className));
  eq('a je zaškrtnuté podle nastavení', b.querySelector('input').checked, true);
  ok('popisek zmiňuje, že rozvrh je mimo stránku',
    /mimo stránku|na pozadí|zvenčí/.test(b.title));

  await CMC.store.patch('read', { reloadAuto: false });
  const b2 = R.box(() => {});
  eq('vypnuté není zaškrtnuté', b2.querySelector('input').checked, false);
  ok('a popisek vysvětlí, k čemu to je', /nereagu|černá|obnov/i.test(b2.title));
  ok('vypnuté není zvýrazněné', !/cmc-gym-reload-on/.test(b2.className));

  console.log('\n[lišta] přepnutí uloží nastavení');
  const b3 = R.box(() => {});
  const inp = b3.querySelector('input');
  inp.checked = true;
  inp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await sleep(40);
  eq('nastavení se uložilo', CMC.store.get().read.reloadAuto, true);
  inp.checked = false;
  inp.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await sleep(40);
  eq('a vypnutí taky', CMC.store.get().read.reloadAuto, false);

  console.log('\n[CSS] pravidlo pro zaškrtávátko existuje');
  const css = fs.readFileSync(path.join(EXT, 'panel.css'), 'utf8');
  ok('má styl', /\.cmc-gym-reload\s*\{/.test(css));
  ok('i stav zapnuto', /\.cmc-gym-reload-on/.test(css));
  ok('a ve zmenšené liště se schová', /cmc-gym-hidden .cmc-gym-reload/.test(css));

  console.log('\n[napojení] modul se spouští z content.js a je v manifestu');
  const content = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
  ok('content.js ho startuje', /NS\.reload\.start\(\)/.test(content));
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const js = man.content_scripts[0].js;
  ok('je v manifestu', js.includes('src/reload.js'));
  ok('a PŘED gym.js (lišta si od něj bere zaškrtávátko)',
    js.indexOf('src/reload.js') < js.indexOf('src/gym.js'));
  ok('captcha.js je před ním (ptá se ho)',
    js.indexOf('src/captcha.js') < js.indexOf('src/reload.js'));

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ stránka odpovídá a obnoví se na pokyn');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
