/* Čtyři výrobny surovin: sebrat → dokoupit materiál → spustit.
 *
 * Fixtures jsou opsané z produkce (texty i adresy):
 *   #21 methlab/collect/<id> → methlab/boil,        30 pilulek/chemik, 0,40 Kč
 *   #24 whiskydistillery/harvest → makewhisky,      8 kg pšenice/sud,  2,50 Kč
 *   #27 agriculture/harvest → plant-pot,            100 semen/ha,      0,10 Kč
 *   #29 beerbrewery/harvest → boilBeer,   15 kg chmele (0,60) + 30 kg ječmene (0,20)
 *
 * Dvě věci, na kterých to stojí:
 *  – přímý požadavek server odmítá („Spausk per mygtuką, o ne per nuorodą!“),
 *    takže se klikají SKUTEČNÁ tlačítka ve vloženém fragmentu,
 *  – kapacitu uvolní teprve SBĚR, takže materiál se kupuje až po něm.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

/* stav výroben ve fixtuře: 'vyrabi' | 'volno' */
const S = { 21: 'vyrabi', 24: 'vyrabi', 27: 'vyrabi', 29: 'vyrabi' };
/*
 * Kolik zbývá do konce výroby. Pivovar má vadu: nabízí „Vařit pivo“, i když
 * fermentace ještě běží, a hra pak požadavek odmítne litevským „Verslas visdar
 * dirba“. Fixtura to napodobuje – proto `bezi` zvlášť od `S`.
 */
const BEZI = { 21: 0, 24: 0, 27: 0, 29: 0 };
const working = id => BEZI[id]
  ? `<div class="working left-time working-${id}" data-time="${BEZI[id]}"
       data-timedone="1785629616" data-timenow="${1785629616 - BEZI[id]}">04 15 09 39%</div>`
  : '';
/* sklady materiálu – nastavuje se v testech */
const SKLAD = { pilulky: 989280, psenice: 827536, semena: 0, chmel: 1022620, jecmen: 1545240 };
const KAPACITA = { 24: 331650, 27: 331650, 29: 100000 };
/*
 * Laboratoř (#21) má kapacitu v „Dostupní chemici“. Vedle toho hra píše ještě
 * „Může zde pracovat X chemiků“, což ale NENÍ kapacita, nýbrž `pilulky / 30`,
 * tedy důsledek zásob – proto se to tady i počítá, ne zadává. Naživo to bylo
 * potvrzené nulou: 0 pilulek → „Může zde pracovat 0 chemiků“.
 */
const CHEMICI = 66892;
const PRACOVAT = () => Math.floor(SKLAD.pilulky / 30);

const A = (akce, text) => `<a href="#" action="https://s1.czechmafie.cz${akce}"
  class="btn btn-secondary btn-sm">${text}</a>`;
/*
 * Nákupní sekce tak, jak ji má hra: obal `.buyIngredient` (na ten je navěšená
 * obsluha `.buyIngredient .btn`), pole `amount` a SKRYTÁ `price` s cenou za
 * jednotku – z ní hra počítá, kolik to bude stát.
 */
const nakup = (akce, ingredience, cena) => `<div class="box-ins buyIngredient">
  <input type="text" name="amount" value="">
  <input type="hidden" name="price" value="${cena == null ? 1 : cena}">
  ${ingredience ? `<input type="hidden" name="ingredient" value="${ingredience}">` : ''}
  ${A(akce, 'Koupit')}</div>`;

const FRAG = {
  21: () => `<div class="box-h main-box">Laboratoř pervitinu</div><div class="box-con">
    <div id="land"><div class="level">Laboratoř pervitinu Úroveň:25</div>
      ${working(21)}
      ${S[21] === 'vyrabi'
        ? `<p>Právě se vaří. Zbývá 802 704 g.</p>${A('/map/building/methlab/collect/68933', 'Sebrat')}`
        : `<p>Dostupní chemici: ${CHEMICI}</p>
           <p>Tablety proti nachlazení: ${SKLAD.pilulky}</p>
           <p>Může zde pracovat ${PRACOVAT()} chemiků</p>
           ${SKLAD.pilulky ? A('/map/building/methlab/boil', 'Vařit')
             : '<p>Nemáš tablety proti nachlazení. Kup si je v lékárně</p>'}`}
    </div>
    <div id="seeds"><p>Tablety proti nachlazení:${SKLAD.pilulky}</p>
      <p>1 chemik potřebuje 30 pilulek. Jedna tableta stojí 0.40Kč</p>
      ${nakup('/map/building/methlab/buy-coldpills', null, 0.4)}</div></div>`,
  24: () => `<div class="box-h main-box">Palírna whisky</div><div class="box-con">
    <div id="land"><div class="level">Palírna whisky Úroveň:30</div>
      ${working(24)}
      ${S[24] === 'vyrabi'
        ? `<p>Momentálně zraje. Zbývá 3 979 800 l.</p>${A('/map/building/whiskydistillery/harvest/572278', 'Sebrat')}`
        : `<p>Prázdné a nepoužité sudy: ${KAPACITA[24]}</p>
           <p>Pšenice: ${SKLAD.psenice} kg</p>
           ${A('/map/building/whiskydistillery/makewhisky', 'Vyrábět whisky')}`}
    </div>
    <div id="seeds"><p>Pšenice:${SKLAD.psenice} kg</p>
      <p>8 kg pšenice na sud Cena: 2.50Kč za kg</p>
      ${nakup('/map/building/whiskydistillery/buyWheat', 'wheat', 2.5)}</div></div>`,
  27: () => `<div class="box-h main-box">Konopná farma</div><div class="box-con">
    <div id="land"><div class="level">Konopná farma Úroveň:30</div>
      ${working(27)}
      ${S[27] === 'vyrabi'
        ? `<p>Momentálně se pěstuje.</p>${A('/map/building/agriculture/harvest/488355', 'Sklidit')}`
        : `<p>Neosazené hektary: ${KAPACITA[27]}</p>
           <p>Semena konopí: ${SKLAD.semena}</p>
           ${SKLAD.semena > 0 ? A('/map/building/agriculture/plant-pot', 'Zasít') : ''}`}
    </div>
    <div id="seeds"><p>Semena konopí:${SKLAD.semena}</p>
      <p>Zasít 1 hektar – 100 semen. Jedno semínko stojí 0.10Kč</p>
      ${nakup('/map/building/agriculture/buy-potseeds', null, 0.1)}</div></div>`,
  29: () => `<div class="box-h main-box">Pivovar</div><div class="box-con">
    <div id="land"><div class="level">Pivovar Úroveň:25</div>
      ${working(29)}
      ${S[29] === 'vyrabi'
        ? `<p>Momentálně probíhá fermentace. Zbývá 2 006 760 l.</p>${A('/map/building/beerbrewery/harvest/65018', 'Sebrat')}`
        : `<p>Prázdné a nepoužité sudy: ${KAPACITA[29]}</p>
           <p>Chmel: ${SKLAD.chmel} kg</p><p>Ječmen: ${SKLAD.jecmen} kg</p>
           ${A('/map/building/beerbrewery/boilBeer', 'Vařit pivo')}`}
    </div>
    <div id="seeds"><p>Je potřeba 15kg chmele a 30kg ječmene na jeden sud piva</p>
      <p>Chmel :${SKLAD.chmel} kg</p><p>Ječmen :${SKLAD.jecmen} kg</p>
      <p>15 kg chmele na sud 1 kg chmele stojí 0.60Kč</p>
      ${nakup('/map/building/beerbrewery/buyHops', 'hops', 0.6)}
      <p>30 kg ječmene na sud kg ječmene stojí 0.20Kč</p>
      ${nakup('/map/building/beerbrewery/buyBarley', 'barley', 0.2)}</div></div>`
};

const dom = new JSDOM('<!doctype html><html><body>'
  + '<div class="modal-box main-box"></div>'
  /*
   * Potvrzovací modal hry: `display` je vždy flex, otevřený se pozná PŘIDANOU
   * třídou `active`. Převod peněz otevírá právě tenhle – bez něj by fixtura
   * neodhalila, že se „Ano“ nikdy nekliklo a nepřevedlo se nic.
   */
  + '<div class="modal-box center confirm-modal" style="display:flex">'
  + '<a id="confirmYes" class="btn">Ano</a><a id="confirmNo" class="btn">Ne</a></div>'
  + '<span class="value renew-money">15 217 287</span>'
  + '<span class="value renew-dirty_money">102 000 000</span>'
  + '<span class="value renew-points">27 515</span>'
  + '<div class="energy"><span class="value">100</span></div></body></html>',
  { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver',
  'location', 'URLSearchParams'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
for (const f of ['src/store.js', 'src/queue.js', 'src/fmt.js', 'src/parse.js', 'src/econ.js',
  'src/jail.js', 'src/gym.js', 'src/mines.js', 'src/bank.js', 'src/vyrobny.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

/*
 * Banka (#22) je tu proto, aby šlo vyzkoušet, že si výrobny samy doplní špinavé
 * peníze na materiál: sklad → Vybrat → účet → Převést → špinavé (kurz 1:1).
 */
let BANKA = { kVkladu: '0.00', kVyberu: '0.00' };
const FRAG_BANKA = () => `<div class="box-h main-box">Banka</div><div class="box-con">
  <div id="deposit"><p>Momentálně máš v bance uloženo 0Kč</p>
    <p>Vložit peníze? ${BANKA.kVkladu}</p><p>Vybrat ${BANKA.kVyberu}</p>
    <input type="number" name="deposit"><input type="number" name="withdraw">
    <a href="#" action="https://s1.czechmafie.cz/map/building/bank/insertToBank"
       class="btn bankOperation deposit">Vložit</a>
    <a href="#" action="https://s1.czechmafie.cz/map/building/bank/takeFromBank"
       class="btn bankOperation withdraw">Vybrat</a></div>
  <div id="laundering"><p>Momentálně máš 0Kč</p>
    <input type="number" name="amount" value="0"></div>
  <div id="converter"><p>Kolik čistých peněz převést na špinavé?</p>
    <input type="number" name="amount" value="0.00">
    <!--
      Převodník má cíl v data-action, NE v action, a nese data-message – hra
      pak otevře potvrzení (.confirm-modal, poznává se třídou active).
      Bez toho fixtura neodhalí, že se „Ano“ nikdy nekliklo.
    -->
    <a href="#" id="confirm"
       data-action="convertMoneyToDirty('/map/building/bank/convertToDirty')"
       data-message="Opravdu? Dostaneš stejné množství špinavých peněz"
       class="btn money-converter-button">Převést</a>
    <p>1Kč = 1Kč</p></div></div>`;

globalThis.__POCET = [];
const __origApi = null;
CMC.parse.apiGet = async url => {
  globalThis.__POCET.push(String(url));
  if (/\/map\/building\/show\/22$/.test(String(url))) return { status: 200, raw: FRAG_BANKA() };
  const m = String(url).match(/\/map\/building\/show\/(\d+)$/);
  return m && FRAG[m[1]] ? { status: 200, raw: FRAG[m[1]]() } : { status: 404, raw: '' };
};
/* klik na herní prvek: zaznamená se adresa a případné množství vedle něj */
let KLIKY = [];
/* potvrzovací modal hry – převod se bez odklepnutí neprovede */
const modalEl = () => D.querySelector('.confirm-modal');
let CEKA = null;
dom.window.HTMLElement.prototype.click = function () {
  if (this.hasAttribute('data-message')) {
    CEKA = this; modalEl().classList.add('active'); return;
  }
  if (this.id === 'confirmNo') { CEKA = null; modalEl().classList.remove('active'); return; }
  if (this.id === 'confirmYes') {
    if (!modalEl().classList.contains('active')) return;
    const co = CEKA; CEKA = null; modalEl().classList.remove('active');
    if (co) co.__proved(); 
    return;
  }
  this.__proved();
};
dom.window.HTMLElement.prototype.__proved = function () {
  const obal = this.closest('.buyIngredient, .box-ins, #deposit, #converter') || this.parentElement;
  const pole = obal && obal.querySelector ? obal.querySelector('input[name=amount]') : null;
  const q = sel => (obal && obal.querySelector ? obal.querySelector(sel) : null);
  // převodník má cíl v `data-action`, ostatní v `action`
  const akce = (this.getAttribute('action') || this.getAttribute('data-action') || '')
    .replace(/^https?:\/\/[^/]+/, '').replace(/^[^(]*\('|'\)$/g, '');
  KLIKY.push({
    akce,
    mnozstvi: pole ? pole.value : null,
    vyber: (q('input[name=withdraw]') || {}).value ?? null,
    ingredience: (() => {
      const i = obal && obal.querySelector ? obal.querySelector('[name=ingredient]') : null;
      return i ? i.value : null;
    })()
  });
  // převod musí doopravdy přesunout peníze, jinak se „nepřevedlo“ nedá poznat
  if (/convertToDirty/.test(this.getAttribute('data-action') || '')) {
    const hud = D.querySelector('.value.renew-dirty_money');
    const sp = +String(hud.textContent).replace(/[^\d]/g, '');
    hud.textContent = String(sp + (+(pole ? pole.value : 0) || 0));
  }

  /*
   * !!! NÁKUP MUSÍ V FIXTUŘE OPRAVDU UBRAT PENÍZE !!!
   * Bez toho nejde poznat rozdíl mezi „koupilo se“ a „hra to odmítla a mlčela“ –
   * a přesně to naživo nastalo: v liště svítilo „koupeno pšenice za 9,1 mil. Kč“,
   * zásoba zůstala na nule a peníze se nepohnuly.
   *
   * A napodobuje se i to odmítnutí: hra nákup, po kterém by zůstala NULA
   * špinavých, odmítne a NEŘEKNE to (žádný požadavek, žádná chyba).
   */
  const nakupRe = /buyHops|buyBarley|buyWheat|buy-potseeds|buy-coldpills/;
  if (nakupRe.test(akce)) {
    const cena = +((obal && obal.querySelector('input[name=price]') || {}).value || 0);
    const kolik = +((pole || {}).value || 0);
    const stoji = Math.ceil(kolik * (cena || 0));
    const hud = D.querySelector('.value.renew-dirty_money');
    const sp = +String(hud.textContent).replace(/[^\d]/g, '');
    // po nákupu musí něco zůstat – jinak hra mlčky odmítne
    if (stoji > 0 && sp - stoji > 0) hud.textContent = String(sp - stoji);
  }
};

let fails = 0;
const norm = x => String(x).replace(/[\s  ]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const bar = () => D.getElementById('cmc-gym-bar');
/* Výrobny mají vlastní řádek; banka taky (má na sdílený moc prvků). */
const vyrRadek = () => D.querySelector('#cmc-gym-bar .cmc-gym-vyr-row');


(async () => {
  await CMC.store.load();
  const V = CMC.vyrobny;
  const zmer = async (jmeno, fn) => {
    globalThis.__POCET = [];
    KLIKY = [];
    const t0 = Date.now();
    let r = null, e = null;
    try { r = await fn(); } catch (x) { e = x.message; }
    const ms = Date.now() - t0;
    const url = globalThis.__POCET;
    console.log('  ' + jmeno.padEnd(34)
      + ' pozadavku=' + String(url.length).padStart(2)
      + '  ms=' + String(ms).padStart(5)
      + '  co=' + (r && r.co ? r.co : (e ? 'CHYBA' : '-')));
    const shoda = {};
    for (const u of url) shoda[u] = (shoda[u] || 0) + 1;
    for (const [u, n] of Object.entries(shoda)) {
      if (n > 1) console.log('      ' + n + '× TENTÝŽ: ' + u);
    }
  };

  console.log('\n=== kolik požadavků stojí jedna úloha ===');
  D.querySelector('.value.renew-dirty_money').textContent = '102000000';

  S[24] = 'vyrabi';
  await zmer('kolo(24) – sebrat', () => V.kolo(24));
  S[24] = 'volno'; SKLAD.psenice = 0;
  await zmer('kolo(24) – koupit materiál', () => V.kolo(24));
  SKLAD.psenice = 99999999;
  await zmer('kolo(24) – spustit', () => V.kolo(24));
  S[29] = 'vyrabi';
  await zmer('kolo(29) – sebrat', () => V.kolo(29));
  BEZI[21] = 3000;
  await zmer('kolo(21) – nic (běží)', () => V.kolo(21));
  BEZI[21] = 0;

  console.log('\n=== požadavky na TIK, když tři výrobny pracují ===');
  await CMC.store.patch('read', { vyrAuto: true, autoPaused: false });
  D.body.innerHTML = '<div class="modal-box main-box"></div>'
    + '<span class="value renew-money">15 217 287</span>'
    + '<span class="value renew-dirty_money">102000000</span>'
    + '<div class="modal-box center confirm-modal" style="display:flex">'
    + '<a id="confirmYes" class="btn">Ano</a><a id="confirmNo" class="btn">Ne</a></div>';
  // tři běží s dlouhým odpočtem, palírna má co dělat
  BEZI[21] = 3000; BEZI[27] = 3000; BEZI[29] = 3000;
  S[21] = 'vyrabi'; S[27] = 'vyrabi'; S[29] = 'vyrabi';
  S[24] = 'volno'; SKLAD.psenice = 99999999;
  for (let t = 1; t <= 4; t++) {
    globalThis.__POCET = [];
    const t0 = Date.now();
    await CMC.vyrobny.autoTick();
    console.log('  tik ' + t + ': pozadavku=' + globalThis.__POCET.length
      + '  ms=' + (Date.now() - t0));
  }

  console.log('\n=== a jak dlouho trvá samotné čtení stavu ===');
  await zmer('stav(24)', () => V.stav(24));

  process.exit(0);
})();
