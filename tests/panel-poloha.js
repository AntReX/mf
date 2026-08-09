/* Poloha panelu: nesmí zůstat za hranou okna.
 *
 * Proč to má test: poloha se pamatuje v pixelech zleva, takže po přechodu na
 * menší monitor (nebo zmenšení okna) skončil panel za pravou hranou. Nebylo na
 * něj vidět a nedal se chytit za hlavičku, takže si ho uživatel nemohl
 * přitáhnout – jediná cesta byla smazat nastavení rozšíření.
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
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (String(g) === String(w) ? '' : `  got ${JSON.stringify(g)} want ${JSON.stringify(w)}`), String(g) === String(w));

/**
 * jsdom nepočítá rozvržení, takže rozměry i okno musíme dodat. `left`/`top` se
 * čtou z inline stylu – přesně to, s čím `vratDoOkna()` pracuje.
 */
function prostredi({ okno, panelSirka = 420, panelVyska = 600 }) {
  dom.window.innerWidth = okno.w;
  dom.window.innerHeight = okno.h;
  const p = D.getElementById('cmc-panel');
  Object.defineProperty(p, 'offsetWidth', { get: () => panelSirka, configurable: true });
  Object.defineProperty(p, 'offsetHeight', { get: () => panelVyska, configurable: true });
  Object.defineProperty(p, 'offsetLeft', {
    get: () => parseInt(p.style.left, 10) || 0, configurable: true });
  Object.defineProperty(p, 'offsetTop', {
    get: () => parseInt(p.style.top, 10) || 0, configurable: true });
  p.getBoundingClientRect = () => {
    const l = parseInt(p.style.left, 10);
    const t = parseInt(p.style.top, 10) || 0;
    const levo = Number.isFinite(l) ? l : okno.w - 12 - panelSirka;
    return { left: levo, top: t, width: panelSirka, height: panelVyska,
      right: levo + panelSirka, bottom: t + panelVyska };
  };
  return p;
}

(async () => {
  await CMC.store.load();

  console.log('\n[panel] za pravou hranou se přisadí k okraji');
  {
    /* Uloženo z velkého monitoru, teď je okno úzké → panel je celý mimo. */
    await CMC.store.patch('ui', { left: 2500, top: 90 });
    D.body.innerHTML = '';
    CMC.panel.build();
    const p = prostredi({ okno: { w: 1280, h: 800 } });
    p.style.left = '2500px'; p.style.top = '90px';

    ok('nejdřív je mimo okno', p.getBoundingClientRect().right > 1280);
    const zmeneno = CMC.panel.vratDoOkna();
    ok('poloha se srovnala', zmeneno);
    const r = p.getBoundingClientRect();
    ok('celý se vejde (' + r.left + '–' + r.right + ' v okně 1280)',
      r.left >= 0 && r.right <= 1280);
    eq('a sedí u pravého okraje', p.style.left, (1280 - 420 - 8) + 'px');
    eq('nová poloha se uložila', CMC.store.get().ui.left, 1280 - 420 - 8);
  }

  console.log('\n[panel] pod dolní hranou se vytáhne nahoru');
  {
    await CMC.store.patch('ui', { left: 100, top: 3000 });
    D.body.innerHTML = '';
    CMC.panel.build();
    const p = prostredi({ okno: { w: 1280, h: 800 }, panelVyska: 600 });
    p.style.left = '100px'; p.style.top = '3000px';
    CMC.panel.vratDoOkna();
    const r = p.getBoundingClientRect();
    ok('vejde se svisle (' + r.top + '–' + r.bottom + ' v okně 800)',
      r.top >= 0 && r.bottom <= 800);
    eq('vodorovně se nehýbalo', p.style.left, '100px');
  }

  console.log('\n[panel] když je vidět celý, nic se nemění');
  {
    await CMC.store.patch('ui', { left: 200, top: 50 });
    D.body.innerHTML = '';
    CMC.panel.build();
    const p = prostredi({ okno: { w: 1280, h: 800 } });
    p.style.left = '200px'; p.style.top = '50px';
    const zmeneno = CMC.panel.vratDoOkna();
    ok('nehlásí změnu', !zmeneno);
    eq('poloha zůstala', p.style.left + '/' + p.style.top, '200px/50px');
  }

  console.log('\n[panel] bez uložené polohy se do stylu nesahá');
  {
    /*
     * Bez `left` panel visí na `right: 12px`, což je vždycky v okně. Kdyby se
     * i tady dopočítávalo `left`, přišel by o přisazení k pravému okraji při
     * dalších změnách velikosti.
     */
    await CMC.store.patch('ui', { left: null, top: null });
    D.body.innerHTML = '';
    CMC.panel.build();
    const p = prostredi({ okno: { w: 1280, h: 800 } });
    const zmeneno = CMC.panel.vratDoOkna();
    ok('nehlásí změnu', !zmeneno);
    ok('a `left` zůstává nenastavené', !p.style.left);
  }

  console.log('\n[panel] i těsné okno nechá panel uchopitelný');
  {
    /* Okno menší než panel: nesmí skončit na negativním `left`. */
    await CMC.store.patch('ui', { left: 1000, top: 500 });
    D.body.innerHTML = '';
    CMC.panel.build();
    const p = prostredi({ okno: { w: 300, h: 200 }, panelSirka: 420, panelVyska: 600 });
    p.style.left = '1000px'; p.style.top = '500px';
    CMC.panel.vratDoOkna();
    ok('levý okraj je v okně (' + p.style.left + ')', parseInt(p.style.left, 10) >= 0);
    ok('horní okraj je v okně (' + p.style.top + ')', parseInt(p.style.top, 10) >= 0);
    ok('takže se dá chytit za hlavičku', parseInt(p.style.top, 10) < 200);
  }

  console.log('\n[panel] hlídá se i změna velikosti okna, ne jen načtení');
  {
    const src = fs.readFileSync(path.join(EXT, 'src/panel.js'), 'utf8');
    ok('posluchač resize je navěšený', /addEventListener\('resize'/.test(src));
    ok('a je odložený, ať se to nepočítá při každém pixelu',
      /setTimeout\(\(\) => vratDoOkna\(\)/.test(src));
  }

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ poloha panelu drží');
  process.exit(fails ? 1 : 0);
})();
