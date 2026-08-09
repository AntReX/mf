/* Kontrola „jsi člověk?“: automatika stojí a rozšíření do ní NESAHÁ.
 *
 * Odkud se to vzalo: uživatel hlásil „karta celé hry je kompletně šedivá/černá
 * a nic tam není“ a že musí obnovit stránku – nejčastěji, když byl na jiné
 * kartě. V CSS hry je
 *
 *   .captcha-modal.active { background: rgba(0, 0, 0, 0.75); z-index: 1020; }
 *
 * a modal má `width: 100%`, takže překryje celou stránku. Obsah se dosazuje až
 * při spuštění, takže dokud se nenačte, je vidět jen tmavá plocha.
 *
 * Tenhle test hlídá dvě věci, které se nesmí pokazit:
 *  – captcha zastaví VŠECHNO a zapne hlavní pauzu (nerozjede se sama),
 *  – NIC do captchy neklikne a stránka se kvůli ní NEOBNOVÍ (to by ji obešlo).
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body>'
  + '<div class="modal-box main-box"></div>'
  /*
   * Modal captchy tak, jak ho má hra: `display` je vždycky flex a otevřenost se
   * pozná PŘIDANOU třídou `active`. Uvnitř je i zavírací tlačítko – rozšíření
   * ho nesmí použít.
   */
  + '<div class="modal-box center captcha-modal" style="display:flex">'
  + '<div class="captcha-modal-close"><div class="icon ui-close"></div></div>'
  + '<img src="x.png"><input name="captcha">'
  + '<a href="#" id="captchaSubmit" class="btn">Potvrdit</a>'
  + '</div>'
  + '<span class="value renew-energy">59</span>'
  + '<div class="energy"><span class="value">100</span></div></body></html>',
  { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver',
  'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

let RELOADU = 0;
globalThis.location = { href: dom.window.location.href,
  origin: dom.window.location.origin, reload: () => { RELOADU++; } };

const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
globalThis.fetch = async () => ({ status: 200, text: async () => '', json: async () => ({}) });

for (const f of ['src/store.js', 'src/queue.js', 'src/fmt.js', 'src/parse.js', 'src/econ.js',
  'src/jail.js', 'src/captcha.js', 'src/reload.js', 'src/gym.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

/* každý klik kamkoli se zaznamená – do captchy nesmí padnout ani jeden */
const KLIKY = [];
dom.window.HTMLElement.prototype.click = function () {
  KLIKY.push((this.className || this.id || this.tagName) + '');
};

let fails = 0;
const eq = (n, g, w) => { const o = String(g) === String(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(String(g))} want ${JSON.stringify(String(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const modal = () => D.querySelector('.captcha-modal');

(async () => {
  await CMC.store.load();
  const C = CMC.captcha;

  console.log('\n[detekce] pozná se podle třídy `active`, ne podle `display`');
  /*
   * `display` je u modalů hry VŽDYCKY `flex`, takže kdo se řídí jím, vidí
   * captchu i zavřenou. Přesně tahle past už jednou stála celé výrobny:
   * u `.confirm-modal` v bance to znamenalo, že se nepřevedlo ani jednou.
   */
  eq('display je flex i zavřené', getComputedStyle(modal()).display, 'flex');
  eq('zavřená captcha neblokuje', C.blokuje(), false);
  modal().classList.add('active');
  eq('otevřená blokuje', C.blokuje(), true);
  ok('a vrátí ten prvek', !!C.jeVidet());

  console.log('\n[zásah] automatika stojí a zapne se hlavní pauza');
  /*
   * Pauza schválně: hra právě dala najevo, že provoz vypadá robotický. Kdyby se
   * to po vyřešení rozjelo samo, kontrola se spustí znovu.
   */
  await CMC.store.patch('read', { autoPaused: false, gymBar: true });
  KLIKY.length = 0;
  eq('hlídač zabere', await C.hlidej(), true);
  eq('hlavní pauza je zapnutá', CMC.store.get().read.autoPaused, true);

  console.log('\n[zásah] NIC se do captchy neklikne');
  /*
   * Ani vyplnění, ani potvrzení, ani zavření. Obcházení kontroly proti botům do
   * rozšíření nepatří – tohle je ta hranice a musí být vidět v testu.
   */
  eq('žádný klik', KLIKY.length, 0);
  ok('a hlavně ne na zavírací tlačítko',
    !KLIKY.some(k => /captcha-modal-close|ui-close/.test(k)));
  ok('ani na potvrzení', !KLIKY.some(k => /captchaSubmit|Potvrdit/.test(k)));
  eq('pole zůstalo prázdné', modal().querySelector('input').value, '');

  console.log('\n[zásah] pauza se nezapíná pořád dokola');
  // jinak by se přepínala uživateli pod rukama, kdykoli by ji chtěl pustit
  await CMC.store.patch('read', { autoPaused: false });
  await C.hlidej();
  eq('podruhé už do pauzy nesahá', CMC.store.get().read.autoPaused, false);

  console.log('\n[obnovování] captcha se NEOBEJDE reloadem');
  /*
   * !!! TOHLE JE TA NEJDŮLEŽITĚJŠÍ KONTROLA V CELÉM SOUBORU !!!
   * Noční obnovování by tu tmavou prázdnou stránku obnovilo a captcha by zmizela
   * – tedy by se obcházela kontrola proti botům. Musí to být výslovně zakázané,
   * protože je to přesně ten stav, kdy člověk sáhne po F5.
   *
   * Rozvrh drží background (viz background.js), takže se to tady kontroluje na
   * dvou místech: v odpovědi na dotaz „smí se?“ a v provedení na přímý pokyn.
   */
  const R = CMC.reload;
  await CMC.store.patch('read', { reloadAuto: true });
  RELOADU = 0;
  eq('s captchou není bezpečno obnovovat', R.bezpecne(), false);
  ok('a důvod se pojmenuje', /člověk/.test(String(R.duvod())));
  await R.proved();                    // i přímý pokyn se musí odmítnout
  await sleep(1500);
  eq('a fakt se neobnovilo', RELOADU, 0);

  console.log('\n[obnovování] po vyřešení se zas obnovovat smí');
  modal().classList.remove('active');
  eq('captcha je pryč', C.blokuje(), false);
  eq('a obnovování je zas bezpečné', R.bezpecne(), true);
  RELOADU = 0;
  await R.proved();
  await sleep(R.VAROVANI_S * 1000 + 700);
  eq('obnovilo se', RELOADU, 1);
  await CMC.store.patch('read', { reloadAuto: false });

  console.log('\n[tik lišty] captcha má přednost před vězením i pauzou');
  /*
   * Kdyby se captcha vyhodnocovala až za pauzou nebo za vězením, tak by se při
   * zapnuté pauze vůbec nezjistilo, že hra něco chce – a hlavně by se dál
   * plnila fronta.
   */
  const gsrc = fs.readFileSync(path.join(EXT, 'src/gym.js'), 'utf8');
  const iCaptcha = gsrc.indexOf('NS.captcha && NS.captcha.blokuje()');
  const iJail = gsrc.indexOf('NS.jail && NS.jail.blocked()', iCaptcha > 0 ? 0 : 0);
  const iPauza = gsrc.indexOf('if (autoPaused()) {');
  ok('captcha se v tiku kontroluje', iCaptcha > 0);
  ok('a je PŘED vězením', iCaptcha < gsrc.lastIndexOf('NS.jail && NS.jail.blocked()'));
  ok('i před pauzou', iCaptcha < iPauza);
  void iJail;

  console.log('\n[napojení] modul je v manifestu před gym.js');
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const js = man.content_scripts[0].js;
  ok('je v manifestu', js.includes('src/captcha.js'));
  ok('a před gym.js', js.indexOf('src/captcha.js') < js.indexOf('src/gym.js'));
  ok('i před reload.js (ten se ho ptá)',
    js.indexOf('src/captcha.js') < js.indexOf('src/reload.js'));

  console.log('\n[zdroj] v modulu není nic, co by captchu řešilo');
  /*
   * Pojistka do budoucna: kdyby to někdo (i já) chtěl „doladit“, tenhle test to
   * zastaví. Modul smí captchu jen POZNAT.
   */
  const csrc = fs.readFileSync(path.join(EXT, 'src/captcha.js'), 'utf8');
  const kod = csrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  ok('nikde se neklika', !/\.click\(/.test(kod));
  ok('nic se nevyplňuje', !/\.value\s*=/.test(kod));
  ok('nesahá se na `active` (nezavírá se)', !/classList\.(remove|toggle)/.test(kod));
  ok('a stránka se neobnovuje', !/location\.reload/.test(kod));

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ captcha zastaví automatiku a nic neobchází');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
