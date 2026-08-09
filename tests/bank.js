/* Banka #22: praní špinavých peněz a sebrání vypraných.
 *
 * Proměřeno naživo (odtud fixtures):
 *   POST /map/building/bank/startLaundering {amount}  → 200, prázdné tělo
 *        špinavé −100, čisté +0 (peníze zatím leží v budově)
 *   POST /map/building/bank/collectLaunderedMoney {}  → 200
 *        {"money":"70Kč","confirm":"Sesbíral jsi …70Kč"} a čisté +70
 *   kurz 100 Kč = 70 Kč, hra si bere 30 %
 *
 * Klíčové: jsou to DVA kroky a mezi nimi peníze leží v budově. Automatika
 * proto musí sbírat dřív, než pere – jinak se nevyzvednuté hromadí.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

/* stav banky ve fixtuře */
let K_PRANI = '15402197.96';        // hra předvyplní maximum sama
let HOTOVE = [];                    // částky čekající na sebrání
let V_BANCE = 0;                    // kolik už leží ve skladu
/*
 * Skutečný zůstatek i s haléři – HUD ho ukazuje ZAOKROUHLENÝ nahoru
 * („2 742 863“ proti „2742862.99“), takže kdo počítá z HUD, pošle o korunu víc,
 * než na účtu je, a hra vklad odmítne.
 */
let K_VKLADU = '2742862.99';
let K_VYBERU = '0.00';          // kolik leží ve skladu (taky s haléři)
/*
 * Kolik hra při vkladu SKUTEČNĚ přesune. Naživo se to s naším zadáním
 * rozchází (zadáno 1 000 000 → vloženo 997), protože handler čte
 * `input[name=amount]` globálně a pole vkladu se jmenuje `deposit`.
 * `null` = chová se poslušně a přesune, co se zadalo.
 */
let VLOZI_SKUTECNE = null;
const BANKA = () => `<div class="box-h main-box">Banka</div><div class="box-con">
  <div class="tabs">
    <a href="#deposit" class="active">Sklad</a>
    <a href="#laundering">Praní peněz</a>
    <a href="#converter">Převod</a>
  </div>
  <div id="deposit">
    <p>Momentálně máš v bance uloženo ${V_BANCE}Kč</p>
    <p>Vložit peníze? ${K_VKLADU}</p>
    <input type="number" name="deposit" class="form-control">
    <input type="number" name="withdraw" class="form-control">
    <a href="#" action="https://s1.czechmafie.cz/map/building/bank/insertToBank"
       class="btn btn-danger btn-sm bankOperation deposit">Vložit</a>
    <p>Vybrat ${K_VYBERU}</p>
    <a href="#" action="https://s1.czechmafie.cz/map/building/bank/takeFromBank"
       class="btn btn-danger btn-sm bankOperation withdraw">Vybrat</a>
  </div>
  <div id="converter">
    <p>Momentálně máš 0Kč Kolik čistých peněz převést na špinavé?</p>
    <input type="number" name="amount" value="0.00">
    <!--
      POZOR: převodník má cíl v data-action, NE v action – a navíc má
      data-message, takže hra napřed otevře potvrzení. Fixtura to původně
      měla jako obyčejné action a přesně tím tuhle chybu zamaskovala:
      testy procházely, kdežto naživo padalo „tlačítko v okně banky není“.
    -->
    <a href="#" id="confirm"
       data-action="convertMoneyToDirty('/map/building/bank/convertToDirty')"
       data-message="Opravdu? Dostaneš stejné množství špinavých peněz"
       class="btn btn-danger btn-sm money-converter-button">Převést</a>
    <p>Máš možnost převést čisté peníze na špinavé 1Kč = 1Kč</p>
  </div>
  <div id="laundering">
    <p>Momentálně máš 88 492 624Kč</p>
    <p>Kolik peněz vyprat?</p>
    <input type="number" name="amount" class="form-control" value="${K_PRANI}">
    <input type="hidden" name="price" value="30">
    <a href="#" action="https://s1.czechmafie.cz/map/building/bank/startLaundering"
       class="btn btn-danger btn-sm launderMoney">Prát</a>
    <p>Na současné úrovni můžeš vyprat 15 402 198Kč</p>
    <p>100Kč = 70Kč</p>
    ${HOTOVE.map(c => `<div class="laundering-box"><div class="finished">
      <div class="label">Dokončil praní peněz</div><div class="money">${c}Kč</div>
      <a href="#" action="https://s1.czechmafie.cz/map/building/bank/collectLaunderedMoney"
         class="btn btn-secondary btn-sm collectLaunderedMoney pulseAnim">Sebrat peníze</a>
    </div></div>`).join('')}
  </div>
</div>`;

const dom = new JSDOM('<!doctype html><html><head>'
  + '<meta name="csrf-token" content="token123">'
  + '</head><body><div class="modal-box main-box"></div>'
  /*
   * !!! HRA MÁ NA POTVRZOVÁNÍ DVĚ RŮZNÉ VĚCI A POZNAJÍ SE RŮZNĚ !!!
   * (obojí opsané z běžící hry)
   *
   *   `.confirm-box` v `.middle-top-alert`   zavřený = `display: none`,
   *                                          třída `active` na něm zůstává vždy
   *   `.confirm-modal` (`.modal-box.center`) `display` je VŽDY `flex`,
   *                                          otevřený = přidaná třída `active`
   *
   * Převod peněz otevírá TEN DRUHÝ. Fixtura tu původně měla jen `.confirm-box`,
   * a proto neodhalila, že detekce podle `display` u převodu nenajde nic – „Ano“
   * se nikdy nekliklo a nepřevedlo se ani jednou, přestože banka hlásila úspěch.
   *
   * `#confirmYes` je tím pádem v dokumentu DVAKRÁT, v každém dialogu jeden.
   */
  + '<div class="middle-top-alert"><div class="alert-messages">'
  + '<div class="confirm-box alert-icon-box active" style="display:none">'
  + '<div class="msg"></div>'
  + '<button id="confirmYes" class="btn btn-success">Ano</button>'
  + '<button id="confirmNo" class="btn">Ne</button></div></div></div>'
  + '<div class="modal-box center confirm-modal" style="display:flex">'
  + '<div class="box-c"><div class="box-ci"><div class="msg"></div>'
  + '<a id="confirmYes" class="btn btn-secondary btn-sm">Ano</a>'
  + '<a id="confirmNo" class="btn btn-secondary btn-sm">Ne</a>'
  + '</div></div></div>'
  + '<span class="value renew-money">15 217 287</span>'
  + '<span class="value renew-dirty_money">88 492 624</span>'
  + '<span class="value renew-points">27 515</span>'
  + '<div class="energy"><span class="value">100</span></div></body></html>',
  { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver',
  'location', 'URLSearchParams'])
  globalThis[k] = dom.window[k];
/*
 * `getComputedStyle` je v content skriptu obyčejný globál a bank.js podle něj
 * pozná otevřený potvrzovací dialog. Musí se navázat na okno – volání bez
 * `this` jsdom odmítne. (Konstruktory výš se vázat NESMÍ, rozbilo by to `new`.)
 */
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.window = dom.window;
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
for (const f of ['src/store.js', 'src/queue.js', 'src/fmt.js', 'src/parse.js', 'src/econ.js',
  'src/jail.js', 'src/gym.js', 'src/mines.js', 'src/bank.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

/*
 * Průběžný odchyt hlášek do lišty. Část kontrol se totiž netýká toho, CO se
 * udělalo, ale toho, že se o tom ŘEKLO – mlčení bylo v tomhle modulu opakovaně
 * horší než chyba (banka hlásila „převedeno“ a nepřevedla; ukládání se tiše
 * nedělalo kvůli hranici).
 */
const HLASKY = [];
{
  const puvodni = CMC.gym.setStatus;
  CMC.gym.setStatus = (t, chyba) => {
    HLASKY.push(String(t || ''));
    return puvodni ? puvodni(t, chyba) : undefined;
  };
}

let POSLANO = [];
let ODPOVED = { status: 200, body: '' };
globalThis.fetch = async (url, opt = {}) => {
  POSLANO.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''),
    metoda: opt.method || 'GET', telo: opt.body || '' });
  return { status: ODPOVED.status, async text() { return ODPOVED.body; } };
};
/*
 * Vklad a výběr přímý požadavek ODMÍTAJÍ („Spausk per mygtuką…“), takže se
 * klikají skutečná tlačítka ve vloženém fragmentu – tady se zaznamená adresa
 * i to, co bylo v poli.
 */
let KLIKY = [];
/*
 * Dělá „hra“ při převodu doopravdy něco? Vypnutím se napodobí ta situace, kdy
 * se klikne, nic se nestane a přesto se ohlásí úspěch.
 */
const PREVOD_FUNGUJE = { ano: true };
/*
 * Dva dialogy, každý s jiným příznakem otevřenosti – přesně jako hra.
 * `KTERY` říká, který z nich se má u potvrzování použít; naživo je to `modal`,
 * ale nechává se to přepínatelné, aby šlo vyzkoušet i druhá varianta.
 */
const alertEl = () => D.querySelector('.confirm-box');
const modalEl = () => D.querySelector('.confirm-modal');
const KTERY = { kde: 'modal' };
const dialogOtevri = () => {
  if (KTERY.kde === 'modal') modalEl().classList.add('active');
  else alertEl().style.display = 'flex';
};
const dialogZavri = () => {
  modalEl().classList.remove('active');
  alertEl().style.display = 'none';
};
const dialogJede = () => modalEl().classList.contains('active')
  || alertEl().style.display === 'flex';
let CEKA = null;          // co se provede, až uživatel odklepne „Ano“

dom.window.HTMLElement.prototype.click = function () {
  /*
   * Tlačítko s `data-message` samo NIC neudělá – hra jen otevře potvrzení.
   * Naživo to bylo vidět na odposlechu sítě: po kliku ani jeden požadavek.
   */
  if (this.hasAttribute('data-message')) { CEKA = this; dialogOtevri(); return; }
  if (this.id === 'confirmNo') { CEKA = null; dialogZavri(); return; }
  if (this.id === 'confirmYes') {
    /*
     * Odklepnout smí jen „Ano“ z OTEVŘENÉHO dialogu. `#confirmYes` je
     * v dokumentu dvakrát a ten z toho zavřeného nesmí dělat nic – jinak by
     * test propustil kód, který si vezme první, na který narazí.
     */
    const muj = this.closest('.confirm-modal, .confirm-box');
    const otevreny = modalEl().classList.contains('active') ? modalEl()
      : (alertEl().style.display === 'flex' ? alertEl() : null);
    if (!otevreny || muj !== otevreny) return;
    const co = CEKA; CEKA = null; dialogZavri();
    if (co) provedKlik(co);
    return;
  }
  provedKlik(this);
};

function provedKlik(el) {
  const obal = el.closest('#deposit, #converter') || el.parentElement;
  const q = sel => (obal && obal.querySelector ? obal.querySelector(sel) : null);
  const akce = (el.getAttribute('action') || el.getAttribute('data-action') || '')
    .replace(/^https?:\/\/[^/]+/, '').replace(/^[^(]*\('|'\)$/g, '');
  KLIKY.push({
    akce,
    vklad: (q('input[name=deposit]') || {}).value ?? null,
    vyber: (q('input[name=withdraw]') || {}).value ?? null,
    prevod: (q('input[name=amount]') || {}).value ?? null
  });
  /*
   * !!! PŘEVOD MUSÍ V FIXTUŘE OPRAVDU PŘESUNOUT PENÍZE !!!
   * Dřív se jen zaznamenal klik, takže testy nemohly poznat rozdíl mezi
   * „převedlo se“ a „neudělalo se nic“ – a právě to naživo nastalo: banka
   * hlásila „převedeno 9,1 mil. Kč“, peníze zůstaly čisté a výrobny stály.
   * Teď se HUD špinavých i čistých mění, aby šlo kontrolovat výsledek.
   */
  if (/convertToDirty/.test(akce) && PREVOD_FUNGUJE.ano) {
    const kolik = +((q('input[name=amount]') || {}).value || 0);
    const hudS = D.querySelector('.value.renew-dirty_money');
    const hudC = D.querySelector('.value.renew-money');
    const sp = +String(hudS.textContent).replace(/[^\d]/g, '');
    const ci = +String(hudC.textContent).replace(/[^\d]/g, '');
    const presun = Math.min(kolik, ci);      // víc, než je na účtu, hra nepřevede
    hudS.textContent = String(sp + presun);  // kurz je 1:1 (ověřeno naostro)
    hudC.textContent = String(ci - presun);
  }

  /*
   * Vklad ubere z účtu – buď co se zadalo, nebo co si vymyslí hra. Mění se
   * HUD i okno banky (`K_VKLADU`), protože podle okna se měří pokrok:
   * HUD se naživo překresluje se zpožděním.
   */
  if (/insertToBank/.test(akce)) {
    const hud = D.querySelector('.value.renew-money');
    const mam = +String(hud.textContent).replace(/[^\d]/g, '');
    /*
     * Hra bere hodnotu z pole `deposit`. Kdyby se sáhlo i na `amount` (praní,
     * převodník), vzala by si jeho – přesně tak vzniklo naživo „997 místo
     * milionu“. Fixtura to hlídá: když je `amount` přepsané, použije se ono.
     */
    const zadano = +((q('input[name=deposit]') || {}).value || 0);
    const rusive = q('input[name=amount]');
    const zdroj = (rusive && rusive.value && +rusive.value !== zadano)
      ? +rusive.value : zadano;
    const ubere = Math.min(mam, VLOZI_SKUTECNE != null ? VLOZI_SKUTECNE : zdroj);
    hud.textContent = String(Math.max(0, mam - ubere));
    K_VKLADU = String(Math.max(0, +K_VKLADU - ubere)) + '.00';
  }
}
CMC.parse.apiGet = async url => (/\/map\/building\/show\/22$/.test(url)
  ? { status: 200, raw: BANKA() } : { status: 404, raw: '' });

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const telo = i => Object.fromEntries(new dom.window.URLSearchParams(POSLANO[i].telo));
const bar = () => D.getElementById('cmc-gym-bar');
const tlacitko = t => Array.from(bar().querySelectorAll('button'))
  .find(b => norm(b.textContent).includes(t));

(async () => {
  await CMC.store.load();
  const B = CMC.bank;

  console.log('\n[stav] čte se z okna banky');
  /*
   * Kolik jde vyprat, závisí na úrovni budovy i na tom, kolik špinavých peněz
   * je – hra to spočítá sama a předvyplní. Nic se proto nedopočítává.
   */
  HOTOVE = [];
  let s = await B.load();
  eq('maximum se bere z předvyplněného pole', s.kPrani, 15402197);
  eq('a desetinná místa se zahodí dolů', String(s.kPrani).includes('.'), false);
  eq('nic nečeká na sebrání', s.hotovych, 0);

  HOTOVE = ['70'];
  s = await B.load();
  eq('hotové praní se pozná', s.hotovych, 1);
  eq('i s částkou', s.kSebrani, 70);

  console.log('\n[praní] pošle se maximum');
  POSLANO = [];
  const v = await B.prat();
  const p = POSLANO.find(x => /startLaundering/.test(x.url));
  ok('šlo to na startLaundering', !!p);
  eq('metodou POST', p.metoda, 'POST');
  eq('s maximem z okna',
    Object.fromEntries(new dom.window.URLSearchParams(p.telo)).amount, '15402197');
  eq('hlásí, co se pere', v.vyprano, 15402197);
  eq('a co z toho bude (70 %)', v.dostanu, Math.round(15402197 * 0.7));

  console.log('\n[praní] pod minimem se nepere');
  // 30 % z drobných je zbytečný klik
  K_PRANI = '500';
  let chyba = null;
  try { await B.prat(); } catch (e) { chyba = e.message; }
  ok('řekne, že není co prát', /není co prát/.test(chyba || ''));
  K_PRANI = '15402197.96';

  console.log('\n[sebrání] připsaná částka se přečte z odpovědi');
  ODPOVED = { status: 200,
    body: '{"money":"70Kč","confirm":"Sesbíral jsi <b>70Kč</b>"}' };
  POSLANO = [];
  const sv = await B.sebrat();
  ok('šlo to na collectLaunderedMoney',
    POSLANO.some(x => /collectLaunderedMoney/.test(x.url)));
  eq('částka se přečetla', sv.castka, 70);
  ODPOVED = { status: 200, body: '' };

  console.log('\n[chyby] hláška hry se propíše');
  ODPOVED = { status: 422, body: '{"message":"Nemáš tolik peněz"}' };
  chyba = null;
  try { await B.sebrat(); } catch (e) { chyba = e.message; }
  eq('beze změny', chyba, 'Nemáš tolik peněz');
  ODPOVED = { status: 500, body: 'nope' };
  chyba = null;
  try { await B.sebrat(); } catch (e) { chyba = e.message; }
  ok('i když server pošle nesmysl', /HTTP 500/.test(chyba || ''));
  ODPOVED = { status: 200, body: '' };

  console.log('\n[praní běží] server odmítne, ale není to chyba');
  /*
   * Během praní vrací hra 403 „Banka už nyní pere peníze, počkej, až skončí“
   * – a to na praní i na sebrání. V okně to poznat NENÍ (žádný box, žádný
   * odpočet v sekci), takže se stav pozná až z odpovědi. Automatika to musí
   * přejít mlčky a zkusit to za pět sekund znovu, ne hlásit chybu.
   */
  ODPOVED = { status: 403, body: '{"errors":"Banka už nyní pere peníze, počkej, až skončí"}' };
  let bezici = null;
  try { await B.sebrat(); } catch (e) { bezici = e; }
  eq('hláška se propíše', bezici.message, 'Banka už nyní pere peníze, počkej, až skončí');
  ok('a je označená jako „běží“', bezici.pereSe === true);
  bezici = null;
  try { await B.prat(); } catch (e) { bezici = e; }
  ok('u praní taky', bezici && bezici.pereSe === true);

  console.log('\n[praní běží] automatika mlčí a počká');
  await CMC.store.patch('read', { bankAuto: true, autoPaused: false });
  HOTOVE = ['70'];
  let hlaska = '';
  const puvodniStatus = CMC.gym.setStatus;
  CMC.gym.setStatus = (t, chyba) => { hlaska = String(t || '') + (chyba ? ' [CHYBA]' : ''); };
  eq('kolo neudělalo nic', await B.autoTick(), false);
  ok('a nekřičí se o chybě', !/CHYBA/.test(hlaska));
  ODPOVED = { status: 500, body: 'rozbito' };
  await B.autoTick();
  ok('skutečná chyba se ale ohlásí', /CHYBA/.test(hlaska));
  CMC.gym.setStatus = puvodniStatus;
  ODPOVED = { status: 200, body: '' };

  console.log('\n[evidence] praní a sebrání zvlášť');
  await CMC.store.put('bankLog', {});
  await B.zapis('prani', 1000);
  await B.zapis('sebrani', 700);
  const st = B.stats();
  eq('praní', st.prani, 1);
  eq('vypráno', st.vyprano, 1000);
  eq('sebrání', st.sebrani, 1);
  eq('sebráno', st.sebrano, 700);
  eq('poplatek hry (30 %)', st.poplatek, 300);

  console.log('\n[praní] rezerva špinavých se nepere');
  /*
   * Špinavými se platí materiál pro výrobny, takže vyprat je do posledního by
   * je nechalo bez nákupu – a zpátky by se čisté dostaly převodem 1:1, což je
   * zbytečné kolečko. Pere se `min(co hra nabízí, špinavé − rezerva)`.
   */
  K_PRANI = '5000000.00';
  D.querySelector('.value.renew-dirty_money').textContent = '8 000 000';
  await CMC.store.patch('read', { bankKeepDirty: 0 });
  let sp = await B.load();
  eq('bez rezervy se pere, co hra nabízí', B.kPrani(sp).castka, 5000000);
  ok('a nic to neomezuje', B.kPrani(sp).omezeno === false);

  await CMC.store.patch('read', { bankKeepDirty: 6000000 });
  eq('s rezervou se pere jen zbytek', B.kPrani(sp).castka, 2000000);
  ok('a přizná se, že je to omezené', B.kPrani(sp).omezeno === true);
  eq('rezerva se hlásí', B.kPrani(sp).nechat, 6000000);

  await CMC.store.patch('read', { bankKeepDirty: 9000000 });
  eq('rezerva vyšší než zásoba → nepere se nic', B.kPrani(sp).castka, 0);

  console.log('\n[praní] pere se jen povolená část');
  await CMC.store.patch('read', { bankKeepDirty: 6000000 });
  POSLANO = [];
  const vp = await B.prat();
  eq('vypralo se jen nad rezervu', vp.vyprano, 2000000);
  eq('a to i v požadavku',
    Object.fromEntries(new dom.window.URLSearchParams(
      POSLANO.find(p => /startLaundering/.test(p.url)).telo)).amount, '2000000');

  console.log('\n[praní] pod minimem se s rezervou nepere');
  // minimum praní je 1 000, takže rezerva musí nechat míň než to
  await CMC.store.patch('read', { bankKeepDirty: 7999500 });
  let chybaP = null;
  try { await B.prat(); } catch (e) { chybaP = e.message; }
  ok('řekne, že není co prát', /není co prát/.test(chybaP || ''));
  ok('a zmíní rezervu', /rezerva/.test(chybaP || ''));
  await CMC.store.patch('read', { bankKeepDirty: 0 });
  K_PRANI = '15402197.96';
  D.querySelector('.value.renew-dirty_money').textContent = '102 000 000';

  console.log('\n[ukládání] kolik se uloží podle rezervy');
  /*
   * Smysl je nemít peníze na účtu, odkud se dají ukrást. Rezerva říká, kolik
   * si nechat po ruce; zbytek jde do skladu banky. Ukládání je ZDARMA, na
   * rozdíl od praní za 30 %, proto je to samostatná volba.
   */
  D.querySelector('.value.renew-money').textContent = '3 000 000';
  await CMC.store.patch('read', { bankKeep: 0 });
  eq('bez rezervy se uloží vše', B.kUlozeni().castka, 3000000);
  await CMC.store.patch('read', { bankKeep: 500000 });
  eq('s rezervou se uloží zbytek', B.kUlozeni().castka, 2500000);
  eq('a rezerva se hlásí', B.kUlozeni().nechat, 500000);
  await CMC.store.patch('read', { bankKeep: 9000000 });
  eq('když je rezerva vyšší než účet, neukládá se nic', B.kUlozeni().castka, 0);
  await CMC.store.patch('read', { bankKeep: 0 });

  console.log('\n[ukládání] částka se bere z OKNA, ne z HUD');
  /*
   * !!! TOHLE BYLA CHYBA !!!
   * HUD ukazuje zaokrouhleno („2 742 863“), skutečný zůstatek je 2742862,99.
   * Z HUD by se poslalo o korunu víc, než na účtu je, a hra by vklad odmítla.
   * Bere se proto číslo z okna a zaokrouhluje se DOLŮ.
   */
  K_VKLADU = '2742862.99';
  D.querySelector('.value.renew-money').textContent = '2 742 863';
  const zOkna = await B.load();
  eq('okno hlásí zůstatek s haléři dolů', zOkna.kVkladu, 2742862);
  eq('a z něj se počítá', B.kUlozeni(zOkna).castka, 2742862);
  eq('zdroj se přizná', B.kUlozeni(zOkna).zdroj, 'okno banky');
  ok('je to MÍŇ než z HUD', B.kUlozeni(zOkna).castka < 2742863);
  eq('bez stavu se spadne na HUD', B.kUlozeni().zdroj, 'HUD (zaokrouhlený)');

  console.log('\n[ukládání] klikne se na tlačítko, ne přímý požadavek');
  /*
   * `insertToBank` vrací na přímý požadavek 404 „Spausk per mygtuką, o ne per
   * nuorodą!“ – i s CSRF a hlavičkou XMLHttpRequest. Praní ho přitom bere.
   */
  KLIKY = [];
  POSLANO = [];
  const vysledek = await B.vlozit(2500000);
  eq('vložená částka se vrátí', vysledek.vlozeno, 2500000);
  eq('kliklo se jednou', KLIKY.length, 1);
  ok('na insertToBank', /insertToBank/.test(KLIKY[0].akce));
  eq('a částka byla v poli', KLIKY[0].vklad, '2500000');
  ok('žádný přímý požadavek na vklad', !POSLANO.some(p => /insertToBank/.test(p.url)));

  console.log('\n[ukládání] automatika ukládá i bez praní');
  /*
   * Částka jde z OKNA (`Vložit peníze?`), ne z HUD – proto se ve fixtuře mění
   * `K_VKLADU`, nikoli text v HUD. HUD je zaokrouhlený a poslalo by se z něj
   * o korunu víc, než na účtu je.
   */
  await CMC.store.put('bankLog', {});
  await CMC.store.patch('read', { bankUloz: true, bankAuto: false, bankKeep: 1000000,
    autoPaused: false });
  K_VKLADU = '3000000.00';
  D.querySelector('.value.renew-money').textContent = '3 000 000';
  VLOZI_SKUTECNE = null;              // hra se chová poslušně
  KLIKY = [];
  eq('kolo něco udělalo', await B.autoTick(), true);
  ok('uložilo se', KLIKY.some(k => /insertToBank/.test(k.akce)));
  eq('nad rezervu', KLIKY[0].vklad, '2000000');
  eq('a zapsalo se to', B.stats().vklady, 1);
  eq('s částkou', B.stats().vlozeno, 2000000);

  console.log('\n[pole] sáhne se JEN na své pole a své tlačítko');
  /*
   * !!! OVĚŘENO NAŽIVO NA KORUNU !!!
   * Vybráno 777 777 → přišlo 777 777; vloženo 777 777 → odešlo 777 777, konečný
   * stav přesně jako na začátku. Podmínka je nesahat na nic jiného: když se
   * „pro jistotu“ přepsalo i `input[name=amount]` (praní, převodník), hra vzala
   * JEHO hodnotu a přesunula 997 místo milionu.
   */
  K_VKLADU = '2000000.00';
  D.querySelector('.value.renew-money').textContent = '2 000 000';
  VLOZI_SKUTECNE = null;
  KLIKY = [];
  const jeden = await B.vlozit(777777);
  eq('vložilo se přesně, co se zadalo', jeden.skutecne, 777777);
  ok('a sedí to', jeden.sedi);
  eq('do pole vkladu', KLIKY[0].vklad, '777777');
  ok('cizí pole zůstala nedotčená',
    KLIKY[0].prevod == null || KLIKY[0].prevod !== '777777');

  console.log('\n[pole] výběr má vlastní pole i tlačítko');
  K_VYBERU = '5000000.00';
  KLIKY = [];
  const vyb = await B.vybrat(123456);
  eq('vybralo se zadané', vyb.vybrano, 123456);
  ok('kliklo se na výběr', /takeFromBank/.test(KLIKY[0].akce));
  eq('a částka šla do pole withdraw', KLIKY[0].vyber, '123456');
  ok('do pole vkladu se nesáhlo', KLIKY[0].vklad !== '123456');
  K_VYBERU = '0.00';

  console.log('\n[ukládání] hra přesune míň → kliká se dál');
  /*
   * !!! ZMĚŘENO NAŽIVO !!!
   * Zadáno 1 000 000 → vloženo 997; zadáno 1 234 → vloženo 2 991. Handler hry
   * čte `input[name=amount]` globálně a pole „Vložit peníze?“ se jmenuje
   * `deposit`, takže částku z naší strany zaručit nejde. Řeší se to opakováním:
   * kliká se, dokud na účtu nezůstane jen rezerva.
   */
  await CMC.store.patch('read', { bankUloz: true, bankKeep: 0 });
  K_VKLADU = '10000.00';
  D.querySelector('.value.renew-money').textContent = '10 000';
  VLOZI_SKUTECNE = 2000;              // hra bere po dvou tisících
  KLIKY = [];
  let uv = await B.ulozVse();
  ok('povedlo se', uv.ok);
  ok('a je hotovo', uv.hotovo);
  eq('uložilo se všechno', uv.celkem, 10000);
  eq('na pět kroků', uv.kroky.length, 5);
  eq('a tolikrát se kliklo',
    KLIKY.filter(k => /insertToBank/.test(k.akce)).length, 5);

  console.log('\n[ukládání] rezerva se dodrží i po krocích');
  K_VKLADU = '10000.00';
  D.querySelector('.value.renew-money').textContent = '10 000';
  await CMC.store.patch('read', { bankKeep: 4000 });
  VLOZI_SKUTECNE = 2000;
  uv = await B.ulozVse();
  eq('uložilo se jen nad rezervu', uv.celkem, 6000);
  ok('a zbytek zůstal', uv.hotovo);
  await CMC.store.patch('read', { bankKeep: 0 });

  console.log('\n[ukládání] když se nepohne nic, přestane se');
  /*
   * Tady už opakování nepomůže – dál by to jen mlelo naprázdno, tak se
   * automatika vypne a řekne proč.
   */
  K_VKLADU = '5000000.00';
  D.querySelector('.value.renew-money').textContent = '5 000 000';
  VLOZI_SKUTECNE = 0;                 // hra nepřijme nic
  KLIKY = [];
  uv = await B.ulozVse();
  ok('nepovede se', !uv.ok);
  eq('a nic se neuložilo', uv.celkem, 0);
  ok('řekne proč', /nepřijala/.test(uv.duvod || ''));
  eq('a kliklo se jen jednou', KLIKY.filter(k => /insertToBank/.test(k.akce)).length, 1);

  console.log('\n[ukládání] jedno selhání automatiku NEVYPÍNÁ');
  /*
   * !!! TÍMHLE ZŮSTALO UKLÁDÁNÍ VYPNUTÉ NAVŽDY !!!
   * Dřív se po PRVNÍM neúspěchu `bankUloz` vypnul natrvalo. Stačilo jedno
   * přechodné odmítnutí (nebo doba, kdy byla chybná hranice vkladu) a ukládání
   * bylo pryč – uživatel to viděl jako „ukládání do banky nefunguje“ a hlášku
   * v liště už dávno přepsala jiná.
   *
   * Na rozdíl od pokerového stopu tu selhání nic NESTOJÍ: vklad je zdarma
   * (změřeno 21 → 21 → 21), takže vypínat po prvním pokusu je nepřiměřené.
   */
  await CMC.store.patch('read', { bankUloz: true, bankKeep: 0 });
  eq('první pokus selže', await B.autoTick(), false);
  eq('ale ukládání zůstává zapnuté', CMC.store.get().read.bankUloz, true);
  eq('druhý taky', await B.autoTick(), false);
  eq('a pořád je zapnuté', CMC.store.get().read.bankUloz, true);
  eq('třetí je poslední', await B.autoTick(), false);
  eq('teprve teď se vypne', CMC.store.get().read.bankUloz, false);
  VLOZI_SKUTECNE = null;
  await CMC.store.patch('read', { bankUloz: true, bankKeep: 1000000 });

  console.log('\n[ukládání] strop kroků drží');
  // pojistka proti nekonečné smyčce, kdyby hra brala po drobných
  K_VKLADU = '100000000.00';
  D.querySelector('.value.renew-money').textContent = '100 000 000';
  await CMC.store.patch('read', { bankKeep: 0 });
  VLOZI_SKUTECNE = 1000;
  KLIKY = [];
  uv = await B.ulozVse();
  eq('víc než strop se neklikne',
    KLIKY.filter(k => /insertToBank/.test(k.akce)).length, CMC.bank.MAX_KROKU);
  ok('a přizná, že hotovo není', !uv.hotovo);
  ok('ale co se stihlo, se počítá', uv.celkem === 1000 * CMC.bank.MAX_KROKU);
  VLOZI_SKUTECNE = null;
  K_VKLADU = '2742862.99';
  D.querySelector('.value.renew-money').textContent = '15 217 287';
  await CMC.store.patch('read', { bankUloz: false, bankKeep: 0 });

  console.log('\n[praní vs. výrobny] praní se vypne, když něco stojí');
  /*
   * !!! PRANÍ JDE PROTI VÝROBNÁM A OBRÁTKA STOJÍ 30 % !!!
   * Materiál se platí špinavými, banka drží čisté. Převod je 1:1, praní bere
   * 30 % – a ve frontě běží banka PŘED výrobnami, takže bez brzdy vzniká mlýnek:
   * výrobny převedou, banka to vypere, výrobny převedou znovu…
   *
   * Spíná se to na PŘECHODU, ne podle stavu: jinak by automatika s uživatelem
   * zápasila – on by praní zapnul, ona by ho hned zase vypnula.
   */
  let STOJI = false;
  CMC.vyrobny = { necoStoji: () => STOJI };
  const cfgB = () => CMC.store.get().read;
  // tenhle blok si hraje s přepínači banky – ať to nezůstane dalším testům
  const zalohaCfg = { bankAuto: cfgB().bankAuto, bankUloz: cfgB().bankUloz,
    bankBar: cfgB().bankBar, bankPratPozastaveno: cfgB().bankPratPozastaveno };

  await CMC.store.patch('read', { bankAuto: true, bankUloz: false,
    bankPratPozastaveno: false });
  STOJI = false;
  await B.autoTick();                 // první čtení jen zapíše výchozí stav
  ok('při prvním čtení se nic nepřepíná', cfgB().bankAuto === true);

  STOJI = true;
  await B.autoTick();
  eq('když něco stojí, praní se vypne', cfgB().bankAuto, false);
  ok('a je poznamenáno, že to udělala automatika', cfgB().bankPratPozastaveno === true);

  await B.autoTick();
  eq('opakovaný tik už nic nemění', cfgB().bankAuto, false);

  STOJI = false;
  await B.autoTick();
  eq('až je vše odeslané, praní se zapne', cfgB().bankAuto, true);
  ok('a příznak je pryč', cfgB().bankPratPozastaveno === false);

  console.log('\n[praní vs. výrobny] ručně vypnuté praní se NEZAPNE');
  /*
   * Tohle je ta past, kvůli které se drží, KDO praní vypnul. Bez toho by
   * automatika zapnula praní, které si uživatel vypnul sám.
   */
  await CMC.store.patch('read', { bankAuto: false, bankPratPozastaveno: false });
  STOJI = true;
  await B.autoTick();
  eq('vypnuté praní se nevypíná znovu', cfgB().bankAuto, false);
  ok('a nic si nenárokuje', cfgB().bankPratPozastaveno === false);
  STOJI = false;
  await B.autoTick();
  eq('a hlavně se NEZAPNE', cfgB().bankAuto, false);

  console.log('\n[praní vs. výrobny] ruční zásah bere automatice vlastnictví');
  /*
   * Když si uživatel praní zapne, zatímco ho automatika drží vypnuté, musí
   * příznak zmizet – jinak by mu ho automatika později zase vypnula nebo
   * zapnula podruhé. Přepínač v liště i volba v nastavení příznak mažou.
   */
  await CMC.store.patch('read', { bankAuto: true, bankPratPozastaveno: false });
  STOJI = false; await B.autoTick();
  STOJI = true; await B.autoTick();
  ok('automatika praní vypnula', cfgB().bankAuto === false && cfgB().bankPratPozastaveno);
  // uživatel si ho zapne zpátky (totéž dělá zaškrtávátko v liště)
  await CMC.store.patch('read', { bankAuto: true, bankPratPozastaveno: false });
  await B.autoTick();
  eq('automatika ho už nevypíná', cfgB().bankAuto, true);
  STOJI = false;
  await B.autoTick();
  eq('a ani znovu nezapíná', cfgB().bankAuto, true);
  ok('příznak zůstává prázdný', cfgB().bankPratPozastaveno === false);

  console.log('\n[praní vs. výrobny] zaškrtávátko v liště příznak maže');
  // náhradní modul výroben umí jen `necoStoji`, takže lištu by neposkládal
  delete CMC.vyrobny;
  await B.load();
  await CMC.store.patch('read', { gymBar: true, bankBar: true, bankAuto: false,
    bankPratPozastaveno: true });
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 80));
  const boxPrani = (() => {
    const b = [...D.querySelectorAll('#cmc-gym-bar .cmc-gym-bank-row .cmc-gym-auto-box')]
      .find(x => /prát/i.test(x.textContent));
    return b ? b.querySelector('input') : null;
  })();
  ok('zaškrtávátko je v liště', !!boxPrani);
  if (boxPrani) {
    boxPrani.checked = true;
    boxPrani.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    eq('ruční zapnutí praní projde', cfgB().bankAuto, true);
    ok('a smaže nárok automatiky', cfgB().bankPratPozastaveno === false);
  }
  await CMC.store.patch('read', zalohaCfg);
  await B.load();

  console.log('\n[ukládání] drobné se neukládají');
  // jinak by to klikalo po korunách při každém tiku
  K_VKLADU = '1005000.00';
  KLIKY = [];
  eq('pod minimem se neukládá', await B.autoTick(), false);
  eq('a neklikne se', KLIKY.length, 0);

  console.log('\n[ukládání] když hranice brání, ŘEKNE se to');
  /*
   * !!! MLČENÍ JE HORŠÍ NEŽ HLÁŠKA !!!
   * Když hranice vkladu brání uložení, dřív se nedělo nic a nic se neřeklo –
   * zvenčí to vypadá jako rozbité ukládání. Právě takhle vypadala hranice
   * 1 000 000: na účtu tisíce, rezerva 100, a v liště ani slovo.
   */
  await CMC.store.patch('read', { bankUloz: true, bankKeep: 100,
    bankMinVklad: 1000000 });
  K_VKLADU = '5000.00';
  await B.load();
  HLASKY.length = 0;
  await B.autoTick();
  ok('napíše se, že se neukládá', HLASKY.some(h => /neukládá se/.test(h)));
  // `fmt` používá pevnou mezeru – proto `norm()`, jinak regulárka nesedí
  ok('a kolik je nad rezervou', HLASKY.some(h => /4 900/.test(norm(h))));
  ok('i od jaké částky by se ukládalo', HLASKY.some(h => /1 mil/.test(norm(h))));
  ok('a poradí, že nula znamená všechno', HLASKY.some(h => /0 = vlož/.test(h)));

  console.log('\n[ukládání] hláška se neopakuje každý tik');
  // jinak by přebíjela všechno ostatní ve stavu akce
  HLASKY.length = 0;
  await B.autoTick();
  await B.autoTick();
  eq('podruhé už mlčí', HLASKY.filter(h => /neukládá se/.test(h)).length, 0);

  console.log('\n[ukládání] zadaná hranice se NEPŘEPISUJE');
  /*
   * !!! TÍMHLE SE NEVKLÁDALO NIC !!!
   * Hranice se na třech místech tiše zvedala na 10 000 a výchozí hodnota byla
   * MILION. Kdo si nastavil rezervu 100 a čekal, že se vloží zbytek, nedostal
   * nic, dokud se nenastřádal milion – a v UI o tom nebylo ani slovo.
   *
   * Odůvodnění „vklad stojí energii“ bylo přitom ZMĚŘENĚ NEPRAVDIVÉ
   * (21 → 21 → 21 přes vklad i výběr), takže to dno nemělo důvod existovat.
   */
  await CMC.store.patch('read', { bankUloz: true, bankKeep: 100, bankMinVklad: 100 });
  K_VKLADU = '5000.00';            // 4 900 nad rezervou – dřív by se nevložilo nic
  KLIKY = [];
  await B.load();
  const u100 = B.kUlozeni(await B.load());
  eq('hranice zůstala 100', u100.prah, 100);
  eq('rezerva 100', u100.nechat, 100);
  eq('vloží se zbytek', u100.castka, 4900);
  ok('a je to nad hranicí', u100.staci);

  console.log('\n[ukládání] nula znamená „vlož všechno nad rezervu“');
  await CMC.store.patch('read', { bankMinVklad: 0 });
  K_VKLADU = '150.00';
  const u0 = B.kUlozeni(await B.load());
  eq('hranice je nula', u0.prah, 0);
  eq('vloží se 50', u0.castka, 50);
  ok('a udělá se to', u0.staci);
  // sanita: nulovou částku vložit nejde
  K_VKLADU = '100.00';
  const uNic = B.kUlozeni(await B.load());
  eq('nad rezervou nic nezbývá', uNic.castka, 0);
  ok('takže se nevkládá', !uNic.staci);

  await CMC.store.patch('read', { bankKeep: 0, bankMinVklad: 1000000 });
  K_VKLADU = '2742862.99';
  await B.load();
  await CMC.store.patch('read', { bankUloz: false, bankKeep: 0 });

  console.log('\n[peníze na materiál] převede se PŘESNĚ to, co chybí');
  /*
   * Banka drží ČISTÉ, materiál se platí ŠPINAVÝMI, takže z banky nejde platit
   * přímo: sklad → Vybrat → účet → Převést → špinavé. Kurz je 1:1, ale
   * převádí se jen chybějící část – čisté peníze jsou potřeba na vylepšování
   * a zpátky by šly jen praním za 30 %.
   */
  const dirty = v => { D.querySelector('.value.renew-dirty_money').textContent = v; };
  dirty('100 000');
  K_VKLADU = '5000000.00';        // na účtu je dost, banka se nemá sahat
  K_VYBERU = '9000000.00';
  KLIKY = [];
  let z = await B.zajisti(500000);
  ok('povedlo se', z.ok);
  eq('chybělo 400 tis.', z.chybelo, 400000);
  eq('z banky se nebralo nic', z.zBanky, 0);
  eq('jeden krok: převod', KLIKY.length, 1);
  ok('a byl to převodník', /convertToDirty/.test(KLIKY[0].akce));
  eq('převedlo se PŘESNĚ to, co chybí', KLIKY[0].prevod, '400000');

  console.log('\n[peníze na materiál] když účet nestačí, dobere se z banky');
  dirty('100 000');
  K_VKLADU = '150000.00';        // na účtu je málo
  K_VYBERU = '9000000.00';       // ve skladu dost
  KLIKY = [];
  z = await B.zajisti(1000000);
  ok('povedlo se', z.ok);
  eq('chybělo 900 tis.', z.chybelo, 900000);
  eq('z banky se vzalo jen to, co na účtu nebylo', z.zBanky, 750000);
  eq('dva kroky', KLIKY.length, 2);
  ok('nejdřív výběr', /takeFromBank/.test(KLIKY[0].akce));
  eq('a to přesnou částkou', KLIKY[0].vyber, '750000');
  ok('pak převod', /convertToDirty/.test(KLIKY[1].akce));
  eq('celé chybějící', KLIKY[1].prevod, '900000');

  console.log('\n[peníze na materiál] co je, se nepřevádí');
  dirty('2 000 000');
  KLIKY = [];
  z = await B.zajisti(1000000);
  ok('povedlo se', z.ok);
  eq('nechybělo nic', z.chybelo, 0);
  eq('a nic se nedělalo', KLIKY.length, 0);

  console.log('\n[haléře] špinavé mají desetinná místa – převod se zaokrouhlí NAHORU');
  /*
   * Tohle shazovalo vylepšování budov a stejná past je tady: špinavé 603,45,
   * potřeba 2 769 → chybí 2 165,55. `prevest()` částku podlahuje, takže bez
   * zaokrouhlení nahoru se převede 2 165 a zůstane se 55 haléřů pod cílem.
   */
  {
    KLIKY = [];
    dirty('603.45');               // špinavé s haléři, jak je hra opravdu ukazuje
    K_VKLADU = '5000000.00';
    K_VYBERU = '9000000.00';
    const z = await B.zajisti(2769);
    ok('povedlo se', z.ok);
    eq('chybí se počítá v celých korunách nahoru', z.chybelo, 2166);
    ok('a převedlo se aspoň tolik', +KLIKY[KLIKY.length - 1].prevod >= 2166);
  }

  console.log('\n[převodník] jiné tlačítko a ještě se potvrzuje');
  /*
   * !!! TAHLE DVOJICE STÁLA STOJÍCÍ PIVOVAR !!!
   * Vklad a výběr mají cíl v `action`, převodník ale v `data-action`
   * (`convertMoneyToDirty('…/convertToDirty')`) a k tomu `data-message`.
   * Hledalo se jen `[action]`, takže převod padal na „tlačítko v okně banky
   * není“ – v liště pak svítilo `⚠ Pivo: …` a vypadalo to na chybu výroben,
   * i když peníze prostě nikdy nedorazily. Fixtura to maskovala tím, že měla
   * u převodníku obyčejné `action`; teď má obojí jako živá hra.
   */
  const prevodnik = () => {
    const d = new dom.window.DOMParser().parseFromString(BANKA(), 'text/html');
    return d.querySelector('#converter [data-action], #converter [action]');
  };
  ok('fixtura má převodník na data-action', !!prevodnik().getAttribute('data-action'));
  ok('a bez action', !prevodnik().hasAttribute('action'));
  ok('a ptá se', prevodnik().hasAttribute('data-message'));

  dirty('100 000');
  K_VKLADU = '5000000.00';
  K_VYBERU = '9000000.00';
  KLIKY = [];
  z = await B.zajisti(500000);
  ok('převod projde i tak', z.ok);
  eq('a doopravdy se provedl', KLIKY.length, 1);
  ok('dialog zůstal zavřený', !dialogJede());

  console.log('\n[převodník] dialog neprobliká přes obrazovku');
  /*
   * Ptát se „opravdu?“ na akci, kterou si uživatel sám zapnul zaškrtávátkem,
   * nemá smysl – a při každém převodu mu to probliklo přes obrazovku. Dialog
   * se proto na tu chvíli schová. Zůstat viset ale NESMÍ: neviditelný dialog
   * by uživateli blokoval každý další klik ve hře.
   */
  const ticho = () => D.documentElement.classList.contains('cmc-tichy-dialog');
  let bylTicho = false;
  // „Ano“ z TOHO dialogu, který hra u převodu opravdu otevírá (viz fixtura výš)
  const puvodniAno = modalEl().querySelector('[id=confirmYes]');
  // odchytit stav přesně ve chvíli, kdy se odklepává „Ano“
  const puvodniClick = puvodniAno.click.bind(puvodniAno);
  puvodniAno.click = function () { bylTicho = ticho(); puvodniClick(); };
  dirty('100 000');
  KLIKY = [];
  await B.zajisti(500000);
  ok('při odklepávání je dialog schovaný', bylTicho);
  ok('a po dokončení už ne', !ticho());
  delete puvodniAno.click;

  /*
   * Pravidlo se kontroluje textem, protože jsdom kaskádu nepočítá. Podstatné
   * je, že NEpoužívá `display: none` – podle `display` se pozná otevřený dialog
   * a schovalo by nám ho i před vlastní kontrolou (klik na „Ano“ by se přeskočil
   * a převod by tiše neproběhl).
   */
  const css = fs.readFileSync(path.join(EXT, 'panel.css'), 'utf8');
  const pravidlo = css.slice(css.indexOf('html.cmc-tichy-dialog'),
    css.indexOf('}', css.indexOf('html.cmc-tichy-dialog')));
  ok('pravidlo pro schování existuje', !!pravidlo);
  ok('schovává se přes visibility', /visibility:\s*hidden/.test(pravidlo));
  ok('a NE přes display: none', !/display:\s*none/.test(pravidlo));
  ok('míří na OBA potvrzovací dialogy hry',
    /\.confirm-box/.test(pravidlo) && /\.confirm-modal/.test(pravidlo));

  console.log('\n[převodník] bez potvrzení se neodešle nic');
  /*
   * Kdyby se „Ano“ neodklepávalo, nestalo by se vůbec nic – a to je horší než
   * chyba, protože by to vypadalo na úspěch. Ověří se tak, že se potvrzování
   * dočasně vypne a klik pak nesmí nic provést.
   */
  const pravyYes = modalEl().querySelector('[id=confirmYes]');
  pravyYes.id = 'confirmYes-vypnuto';
  dirty('100 000');
  KLIKY = [];
  let padlo = (await B.zajisti(500000)).duvod;
  eq('nic se neprovedlo', KLIKY.length, 0);
  ok('a řekne se to nahlas', /Ano/.test(String(padlo)));
  pravyYes.id = 'confirmYes';
  // dialog po nepovedeném pokusu nesmí zůstat otevřený, blokoval by další klik
  ok('a dialog se po pádu zavře', !dialogJede());
  /*
   * A hlavně: schovávací třída se musí sundat i při pádu. Kdyby zůstala viset,
   * měl by uživatel v každém dalším potvrzení hry neviditelné okno – tedy
   * zaseknutou hru bez jakéhokoli vysvětlení.
   */
  ok('a schovávání se zruší i po pádu', !ticho());

  console.log('\n[převodník] hra otevírá .confirm-modal, ne .confirm-box');
  /*
   * !!! TOHLE ZASTAVILO VŠECHNY TŘI VÝROBNY !!!
   * Hra má dvě potvrzovací věci a poznají se různě:
   *   `.confirm-box`   zavřený = display:none, třída `active` na něm zůstává vždy
   *   `.confirm-modal` display je VŽDY flex, otevřený = přidaná třída `active`
   * Převod otevírá ten druhý. Detekce koukala jen na první a jen na `display`,
   * takže „Ano“ se nikdy nekliklo a nepřevedlo se ANI JEDNOU – zatímco banka
   * hlásila „převedeno 9,1 mil. Kč“. Peníze zůstaly ČISTÉ, materiál se platí
   * ŠPINAVÝMI, takže pivovar, palírna i konopná farma stály se zásobou 0.
   */
  const spinaveHUD = () => +String(D.querySelector('.value.renew-dirty_money').textContent)
    .replace(/[^\d]/g, '');
  dirty('100 000');
  K_VKLADU = '5000000.00';
  D.querySelector('.value.renew-money').textContent = '5000000';
  KLIKY = [];
  const spinavePred = spinaveHUD();
  z = await B.zajisti(500000);
  ok('převod projde', z.ok);
  eq('a špinavé se opravdu zvedly', spinaveHUD() - spinavePred, 400000);
  ok('žádný dialog nezůstal otevřený', !dialogJede());
  ok('a modal není označený jako aktivní', !modalEl().classList.contains('active'));

  console.log('\n[převodník] „Ano“ ze ZAVŘENÉHO dialogu se nepočítá');
  /*
   * `#confirmYes` je v dokumentu dvakrát. Kdo si vezme první, na který narazí,
   * odklepne tlačítko z dialogu, který není otevřený – a hra to ignoruje.
   * Fixtura to napodobuje, takže by se to poznalo jako neúspěšný převod.
   */
  ok('opravdu jsou dva', D.querySelectorAll('[id=confirmYes]').length === 2);
  ok('a jsou v různých dialozích',
    D.querySelectorAll('[id=confirmYes]')[0].closest('.confirm-box')
    && D.querySelectorAll('[id=confirmYes]')[1].closest('.confirm-modal'));

  console.log('\n[převodník] když se nic nepřevede, NEHLÁSÍ se úspěch');
  /*
   * Tohle je ta hlubší chyba: `prevest()` jen kliklo a vrátilo „převedeno“, aniž
   * by se kdokoli podíval, jestli se peníze pohnuly. Proto se rozbité potvrzování
   * nedalo poznat odnikud než z reálného stavu diamantů a korun.
   */
  PREVOD_FUNGUJE.ano = false;
  dirty('100 000');
  D.querySelector('.value.renew-money').textContent = '5000000';
  KLIKY = [];
  z = await B.zajisti(500000);
  ok('nehlásí úspěch', !z.ok);
  ok('a řekne, že se špinavé nezvedly', /nezvedly|neproběhl/.test(String(z.duvod)));
  eq('špinavé opravdu zůstaly', spinaveHUD(), 100000);
  PREVOD_FUNGUJE.ano = true;

  console.log('\n[převodník] cizí otevřený dialog se nepotvrzuje');
  /*
   * Dialog je na stránce jeden pro celou hru. Kdyby se do něj automatika
   * strefila ve chvíli, kdy se uživatel na něco rozhoduje, odklepla by mu
   * jeho vlastní akci – a to může být cokoli, třeba prodej.
   */
  dialogOtevri();
  KLIKY = [];
  padlo = (await B.zajisti(500000)).duvod;
  eq('nic se nekliklo', KLIKY.length, 0);
  ok('a ví se proč', /ptá/.test(String(padlo)));
  ok('cizí dialog zůstal otevřený', dialogJede());
  dialogZavri();

  console.log('\n[peníze na materiál] když to nestačí ani s bankou');
  dirty('0');
  K_VKLADU = '1000.00';
  K_VYBERU = '2000.00';
  KLIKY = [];
  z = await B.zajisti(500000);
  ok('nepovede se', !z.ok);
  ok('a řekne, kolik chybí', /chybí/.test(z.duvod));
  eq('nic se neposlalo', KLIKY.length, 0);

  console.log('\n[peníze na materiál] eviduje se výběr i převod');
  await CMC.store.put('bankLog', {});
  dirty('0');
  K_VKLADU = '0.00';
  K_VYBERU = '9000000.00';
  await B.zajisti(300000);
  const stv = B.stats();
  eq('jeden výběr', stv.vybery, 1);
  eq('za 300 tis.', stv.vybrano, 300000);
  eq('jeden převod', stv.prevody, 1);
  eq('taky 300 tis.', stv.prevedeno, 300000);
  dirty('102 000 000');
  K_VKLADU = '2742862.99';
  K_VYBERU = '0.00';

  console.log('\n[automatika] sbírá se DŘÍV, než pere');
  /*
   * Vyprané peníze leží v budově, dokud se nevyzvednou. Kdyby automatika prala
   * dřív, hromadilo by se nevyzvednuté a hráč by o tom nevěděl.
   */
  await CMC.store.put('bankLog', {});
  await CMC.store.patch('read', { bankAuto: true, autoPaused: false });
  HOTOVE = ['70'];
  POSLANO = [];
  ODPOVED = { status: 200, body: '{"money":"70Kč","confirm":"ok"}' };
  eq('kolo proběhlo', await B.autoTick(), true);
  ok('sebralo se', POSLANO.some(x => /collectLaunderedMoney/.test(x.url)));
  ok('a NEpralo', !POSLANO.some(x => /startLaundering/.test(x.url)));
  eq('zapsalo se sebrání', B.stats().sebrani, 1);

  console.log('\n[automatika] když není co sebrat, pere');
  HOTOVE = [];
  POSLANO = [];
  ODPOVED = { status: 200, body: '' };
  eq('kolo proběhlo', await B.autoTick(), true);
  ok('pralo se', POSLANO.some(x => /startLaundering/.test(x.url)));
  eq('zapsalo se praní', B.stats().prani, 1);

  console.log('\n[automatika] nic k práci = nic se neděje');
  K_PRANI = '100';
  POSLANO = [];
  eq('kolo nic neudělalo', await B.autoTick(), false);
  eq('a nic neposlalo', POSLANO.filter(x => /bank\/(start|collect)/.test(x.url)).length, 0);
  K_PRANI = '15402197.96';

  console.log('\n[automatika] pauza a vypnutí');
  await CMC.store.patch('read', { autoPaused: true });
  eq('pozastavená nehraje', await B.autoTick(), false);
  await CMC.store.patch('read', { autoPaused: false, bankAuto: false });
  eq('vypnutá taky ne', await B.autoTick(), false);
  await CMC.store.patch('read', { bankAuto: true });

  console.log('\n[lišta] vlastní řádek, ne v řádku budov');
  /*
   * V řádku budov banka není schválně: tam se sbírá hotové (šachty, mzda,
   * nevěstinec), kdežto praní je směna se ztrátou 30 % – v jedné řadě
   * s „vybrat mzdu“ by se to kliklo omylem.
   */
  HOTOVE = ['70'];
  await B.load();
  await CMC.store.patch('read', { gymBar: true, bankBar: true, mineBar: true });
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 80));
  /*
   * Banka má vlastní řádek: nese dvě rezervy, dvě akce a dvě zaškrtávátka,
   * takže vedle čtyř výroben by se to na jeden řádek netrefilo.
   */
  const bankRadek = D.querySelector('#cmc-gym-bar .cmc-gym-bank-row');
  ok('banka má vlastní řádek', !!bankRadek);
  ok('s vlastním popiskem',
    /Banka/.test((bankRadek.querySelector('.cmc-gym-label') || {}).textContent || ''));
  ok('v řádku šachet už není', (() => {
    const sachty = Array.from(D.querySelectorAll('#cmc-gym-bar .cmc-gym-row'))
      .find(r => /Šachty/.test((r.querySelector('.cmc-gym-label') || {}).textContent || ''));
    return !sachty || !/Prát/.test(sachty.textContent);
  })());
  ok('tlačítko praní je v liště', !!tlacitko('Prát'));
  ok('a je ve svém řádku', bankRadek.contains(tlacitko('Prát')));
  ok('sebrání taky', bankRadek.contains(tlacitko('Sebrat')));
  ok('a tlačítko sebrání taky', !!tlacitko('Sebrat'));
  ok('praní řekne kolik a za kolik', /30 %/.test(tlacitko('Prát').title));
  ok('a varuje, že peníze přijdou až po sebrání',
    /až po sebrání/.test(tlacitko('Prát').title));
  ok('sebrání zmíní částku', /70/.test(tlacitko('Sebrat').title));
  ok('sebrání je aktivní, když je co', !tlacitko('Sebrat').disabled);

  console.log('\n[lišta] bez hotového praní je sebrání vypnuté');
  HOTOVE = [];
  await B.load();
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 80));
  ok('sebrání je zašedlé', tlacitko('Sebrat').disabled);
  ok('a řekne proč', /Není co sebrat/.test(tlacitko('Sebrat').title));

  console.log('\n[lišta] dvě zaškrtávátka: prát a ukládat');
  /*
   * Zvlášť schválně: praní stojí 30 %, ukládání je zdarma. Kdo chce jen
   * bezpečí před krádeží, nemá platit poplatek za praní.
   */
  const boxy = [...D.querySelectorAll('#cmc-gym-bar .cmc-gym-bank-row .cmc-gym-auto-box')];
  eq('jsou dvě', boxy.length, 2);
  const prani = boxy.find(b => /prát/.test(b.textContent));
  const uklad = boxy.find(b => /ukládat/.test(b.textContent));
  ok('jedno je praní', !!prani);
  ok('druhé ukládání', !!uklad);
  ok('praní přizná 30% poplatek', /30 %/.test(prani.title));
  ok('a že se sbírá dřív než pere', /dřív než pere/.test(prani.title));
  ok('ukládání přizná, že je zdarma', /ZDARMA|zdarma/.test(uklad.title));
  ok('a že hra řídí částku po svém', /po svém|ověří/.test(uklad.title));
  ok('a zmíní rezervu', /rezerv/i.test(uklad.title));

  console.log('\n[lišta] dvě rezervy: čisté a špinavé');
  const keepDirty = D.querySelector('#cmc-gym-bar .cmc-bank-keep-dirty');
  ok('políčko rezervy špinavých je v liště', !!keepDirty);
  keepDirty.value = '3000000';
  keepDirty.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  eq('uloží se', CMC.store.get().read.bankKeepDirty, 3000000);
  await CMC.store.patch('read', { bankKeepDirty: 0 });

  const keep = D.querySelector('#cmc-gym-bar .cmc-bank-keep');
  ok('políčko je v liště', !!keep);
  keep.value = '2000000';
  keep.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  eq('rezerva se uloží', CMC.store.get().read.bankKeep, 2000000);
  keep.value = '-5';
  keep.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  eq('záporná se srovná na nulu', CMC.store.get().read.bankKeep, 0);
  ok('tlačítko ukládání je v liště',
    !!Array.from(D.querySelectorAll('#cmc-gym-bar button')).find(b => /Uložit/.test(b.textContent)));

  console.log('\n[lišta] čísla v liště nejsou');
  /*
   * Vypráno/sebráno se v liště nezobrazuje schválně: praní není zisk, ale směna
   * se ztrátou 30 %, takže dvě čísla vedle sebe na jeden pohled nic neříkají.
   * Souhrn patří do záložky Příjmy.
   */
  await B.zapis('prani', 5000);
  await B.zapis('sebrani', 3500);
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 80));
  const bankRadek2 = D.querySelector('#cmc-gym-bar .cmc-gym-bank-row');
  ok('v řádku nejsou částky', !/3 500|5 000|3500|5000/.test(bankRadek2.textContent));
  ok('ale tlačítka ano', !!tlacitko('Prát') && !!tlacitko('Sebrat'));

  console.log('\n[lišta] hlavní vypínač o bance ví');
  const master = Array.from(bar().querySelectorAll('button')).find(b => /⏸|▶/.test(b.textContent));
  ok('vypínač se kreslí', !!master);
  ok('a jmenuje banku', /banka/.test(norm(master.title)));

  console.log('\n[lišta] dá se vypnout');
  await CMC.store.patch('read', { bankBar: false });
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 80));
  /*
   * V téhle fixtuře je banka jediný obsah řádku budov (šachty ani mzda tu
   * nejsou), takže po vypnutí nezbude co kreslit a lišta zmizí celá.
   */
  ok('vypnutý řádek v liště není',
    !D.querySelector('#cmc-gym-bar .cmc-gym-bank-row'));
  await CMC.store.patch('read', { bankBar: true });

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ banka pere a sbírá');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
