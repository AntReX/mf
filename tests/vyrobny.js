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
 * !!! V TESTU SE SVĚT MĚNÍ OKAMŽITĚ, VE HŘE NE !!!
 * `vyrobny.js` si pamatuje, dokdy budova prokazatelně pracuje (z odpočtu hry),
 * a do té doby ji nečte – tím spadlo 5 požadavků na tik na 1. Test ale přepne
 * budovu z „vyrábí“ na „hotovo“ jedním přiřazením, což hra nikdy neudělá, takže
 * by ta paměť držela nepravdu. Každá změna fixture ji proto zahodí.
 */
const zapomenPoZmene = obj => new Proxy(obj, {
  set(t, k, v) { t[k] = v; if (CMC.vyrobny) CMC.vyrobny.zapomenVse(); return true; }
});

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

CMC.parse.apiGet = async url => {
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

/* obalit až po načtení modulů – `zapomenVse` do té doby neexistuje */
const S_ = zapomenPoZmene(S);
const BEZI_ = zapomenPoZmene(BEZI);
const SKLAD_ = zapomenPoZmene(SKLAD);

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

  console.log('\n[stav] recepty a sklady se čtou z okna');
  let s = await V.stav(29);
  eq('pivovar má dvě suroviny', s.suroviny.length, 2);
  eq('chmel: 15 na sud', s.suroviny[0].naJednotku, 15);
  eq('ječmen: 30 na sud', s.suroviny[1].naJednotku, 30);
  eq('a vidí se, že se dá sebrat', s.lzeSebrat, true);

  console.log('\n[stav] laboratoř: kapacita je „Dostupní chemici“');
  /*
   * !!! „MŮŽE ZDE PRACOVAT X CHEMIKŮ“ NENÍ KAPACITA !!!
   * Je to `pilulky / 30`, tedy důsledek zásob. Původně se z těch dvou čísel
   * bralo minimum („ať se nepřestřelí“) a znělo to rozumně – jenže kapacita pak
   * nikdy nepřerostla to, na co už materiál byl, takže si laboratoř NIKDY
   * nedokoupila pilulky. Naživo to při nule pilulek uvázlo úplně.
   */
  S_[21] = 'volno';
  s = await V.stav(21);
  eq('kapacita je limit budovy, ne stav zásob', s.kapacita, CHEMICI);
  ok('a NE odvozené číslo', s.kapacita !== PRACOVAT());
  eq('potřeba pilulek na plnou kapacitu', s.suroviny[0].potreba, CHEMICI * 30);
  eq('sklad', s.suroviny[0].sklad, 989280);
  eq('takže se pilulky dokupují', s.suroviny[0].chybi, CHEMICI * 30 - 989280);
  eq('a jde spustit z toho, co je', s.lzeSpustit, true);

  console.log('\n[stav] laboratoř s NULOU pilulek se nesmí zacyklit');
  /*
   * Tenhle stav to naživo odhalil: 127 622 chemiků, 0 tablet, v okně jen
   * „Koupit“. S minimem vyšla kapacita 0 → nic nechybí → není co kupovat →
   * nikdy se nekoupí. Kapacita musí zůstat kapacitou i s prázdným skladem.
   */
  const pilulkyZ = SKLAD.pilulky;
  SKLAD_.pilulky = 0;
  s = await V.stav(21);
  eq('kapacita se nezmenší na nulu', s.kapacita, CHEMICI);
  eq('chybí všechny pilulky', s.suroviny[0].chybi, CHEMICI * 30);
  eq('a ví se, co to bude stát', s.suroviny[0].cenaChybejicich,
    Math.ceil(CHEMICI * 30 * 0.4));
  ok('nákup je v okně nabídnutý', s.suroviny[0].maNakup);
  eq('spustit se nedá (hra tlačítko nedává)', s.lzeSpustit, false);
  eq('a ze skladu není co spustit', s.naSklade, 0);
  SKLAD_.pilulky = pilulkyZ;

  console.log('\n[stav] chybějící materiál se dopočítá, ne opíše z okna');
  /*
   * Hra předvyplněné množství někdy nechá prázdné, i když materiál nestačí
   * (whisky: 827 536 kg proti potřebným 2 653 200), takže se počítá tady:
   * kapacita × naJednotku − sklad.
   */
  S_[24] = 'volno';
  s = await V.stav(24);
  eq('potřeba pšenice', s.suroviny[0].potreba, 331650 * 8);
  eq('chybí', s.suroviny[0].chybi, 331650 * 8 - 827536);
  eq('a co to bude stát (2,50/kg)', s.suroviny[0].cenaChybejicich,
    Math.ceil((331650 * 8 - 827536) * 2.5));

  console.log('\n[běžící výroba] tlačítkům v okně se nevěří, hlídá se odpočet');
  /*
   * !!! TOHLE JE SKUTEČNÁ VADA HRY !!!
   * Pivovar nabízí „Vařit pivo“, i když fermentace běží, a hra pak požadavek
   * odmítne litevským „Verslas visdar dirba, turi sulaukti kada baigs“. Bez
   * kontroly odpočtu to automatika zkoušela každých pět sekund a uživateli
   * vyskakovala hláška, dokud auto nevypnul.
   */
  S_[29] = 'volno';                 // okno nabízí start
  BEZI_[29] = 15310;                // ale fermentace ještě běží
  SKLAD_.chmel = 99999999; SKLAD_.jecmen = 99999999;
  let bz = await V.stav(29);
  eq('odpočet se přečte', bz.zbyvaS, 15310);
  eq('a pozná se, že to běží', bz.bezi, true);
  eq('okno start nabízí', bz.nabiziStart, true);
  eq('ale spustit NELZE', bz.lzeSpustit, false);
  KLIKY = [];
  let rr = await V.kolo(29);
  eq('kolo nic neudělá', rr.co, 'nic');
  eq('a hlavně NEKLIKNE', KLIKY.length, 0);
  ok('řekne, že se čeká', rr.bezi === true);

  console.log('\n[běžící výroba] po termínu (záporný odpočet) se sbírá');
  /*
   * Záporné číslo znamená hotovo a po termínu – hra v tom stavu odpařuje
   * procenta, takže se sbírat MUSÍ, ne čekat.
   */
  S_[29] = 'vyrabi';                // okno nabízí sběr
  BEZI_[29] = -5940;                // zpozdil ses 99 minut
  bz = await V.stav(29);
  eq('běží se to nebere', bz.bezi, false);
  eq('a sebrat jde', bz.lzeSebrat, true);
  KLIKY = [];
  rr = await V.kolo(29);
  eq('sebralo se', rr.co, 'sebráno');
  ok('kliklo se na sběr', /beerbrewery\/harvest/.test(KLIKY[0].akce));
  BEZI_[29] = 0;

  console.log('\n[běžící výroba] hlídá se u všech, ne jen u pivovaru');
  for (const id of [21, 24, 27]) {
    S[id] = 'volno';
    BEZI[id] = 3600;
    const st2 = await V.stav(id);
    ok('#' + id + ' běží → nespouští se', st2.bezi === true && st2.lzeSpustit === false);
    BEZI[id] = 0;
  }

  console.log('\n[kolo] pořadí je sebrat → koupit → spustit');
  /*
   * Kapacitu uvolní teprve sběr, takže kupovat materiál dřív by znamenalo
   * kupovat na kapacitu, která ještě není volná.
   */
  S_[29] = 'vyrabi';
  KLIKY = [];
  let r = await V.kolo(29);
  eq('nejdřív se sebere', r.co, 'sebráno');
  ok('a kliklo se na sběr', /beerbrewery\/harvest/.test(KLIKY[0].akce));

  console.log('\n[kolo] dokoupí se jen to, co chybí');
  S_[29] = 'volno';
  SKLAD_.chmel = 0;              // chmel chybí celý
  SKLAD_.jecmen = 99999999;      // ječmene je dost
  KLIKY = [];
  r = await V.kolo(29);
  eq('koupilo se', r.co, 'koupeno');
  eq('jen jedna surovina', KLIKY.length, 1);
  ok('a byl to chmel', /buyHops/.test(KLIKY[0].akce));
  eq('množství je chybějící chmel', KLIKY[0].mnozstvi, String(KAPACITA[29] * 15));
  ok('do pole u SPRÁVNÉHO tlačítka', KLIKY[0].ingredience === 'hops');

  console.log('\n[kolo] jedno volání = JEDNA úloha');
  /*
   * Fronta řadí akce po jedné a mezi nimi nechává mezeru, takže rozdělené
   * úlohy se navzájem nerozhodí a v liště je vidět, co se zrovna děje.
   * Pivovar se dvěma surovinami proto zabere dva tiky, ne jeden.
   */
  SKLAD_.chmel = 0; SKLAD_.jecmen = 0;
  KLIKY = [];
  r = await V.kolo(29);
  eq('koupí se JEDNA surovina', KLIKY.length, 1);
  ok('a je to chmel', /buyHops/.test(KLIKY[0].akce));
  ok('popis řekne, kolik zbývá', /zbývá 1/.test(r.popis));

  SKLAD_.chmel = 99999999;         // chmel je koupený, jde na řadu ječmen
  KLIKY = [];
  r = await V.kolo(29);
  eq('další tik koupí druhou', KLIKY.length, 1);
  ok('a je to ječmen', /buyBarley/.test(KLIKY[0].akce));
  ok('a už nic nezbývá', !/zbývá/.test(r.popis));

  console.log('\n[kolo] když je materiálu dost, spustí se výroba');
  SKLAD_.chmel = 99999999; SKLAD_.jecmen = 99999999;
  KLIKY = [];
  r = await V.kolo(29);
  eq('spustilo se', r.co, 'spuštěno');
  ok('kliklo se na vaření', /boilBeer/.test(KLIKY[0].akce));

  console.log('\n[kolo] bez peněz se nekupuje');
  /*
   * Materiál se platí ŠPINAVÝMI penězi. Když nejsou, musí to říct a nic
   * neposílat – jinak by hra jen odmítla a vypadalo by to jako chyba.
   */
  SKLAD_.chmel = 0; SKLAD_.jecmen = 0;
  D.querySelector('.value.renew-dirty_money').textContent = '1 000';
  KLIKY = [];
  r = await V.kolo(29);
  eq('kolo to přizná', r.co, 'nedostatek');
  eq('a nic neposlalo', KLIKY.length, 0);
  ok('řekne, kolik chybí', /chybí/.test(r.popis));
  D.querySelector('.value.renew-dirty_money').textContent = '102 000 000';

  console.log('\n[peníze z banky] výrobna si sama doplní špinavé');
  /*
   * Materiál se platí ŠPINAVÝMI, banka drží ČISTÉ. Když špinavé nestačí,
   * `bank.zajisti()` vybere z banky a převede – ale PŘESNĚ to, co chybí:
   * čisté peníze jsou potřeba na vylepšování a zpátky by šly jen praním za 30 %.
   */
  S_[29] = 'volno';
  SKLAD_.chmel = 0; SKLAD_.jecmen = 99999999;
  const potreba = Math.ceil(KAPACITA[29] * 15 * 0.6);   // chybějící chmel × 0,60
  D.querySelector('.value.renew-dirty_money').textContent = '1 000';
  BANKA = { kVkladu: '0.00', kVyberu: String(potreba + 100000) + '.00' };
  /*
   * Dorovnání peněz je VLASTNÍ úloha – nákup přijde až v dalším tiku. Je to
   * schválně: fronta pak řadí akce po jedné a v liště je vidět, co se děje.
   */
  KLIKY = [];
  let rb = await V.kolo(29);
  eq('nejdřív se doplní peníze', rb.co, 'peníze');
  ok('vybralo se z banky', KLIKY.some(k => /takeFromBank/.test(k.akce)));
  ok('a převedlo na špinavé', KLIKY.some(k => /convertToDirty/.test(k.akce)));
  /*
   * O REZERVU se z banky řekne NAVÍC. Kdyby se převedlo přesně `potreba`, zbyla
   * by po nákupu nula – a takový nákup hra mlčky odmítne (viz níž).
   */
  eq('vybralo se, co chybí, PLUS rezerva',
    KLIKY.find(k => /takeFromBank/.test(k.akce)).vyber,
    String(potreba + V.REZERVA_KC - 1000));
  ok('nekupovalo se ještě nic', !KLIKY.some(k => /buyHops/.test(k.akce)));

  // po doplnění peněz už špinavé stačí (s rezervou), takže další tik nakupuje
  D.querySelector('.value.renew-dirty_money').textContent = String(potreba + V.REZERVA_KC);
  KLIKY = [];
  rb = await V.kolo(29);
  eq('další tik koupí materiál', rb.co, 'koupeno');
  ok('a je to nákup chmele', KLIKY.some(k => /buyHops/.test(k.akce)));

  console.log('\n[nákup] NIKDY za všechny peníze do poslední koruny');
  /*
   * !!! TOHLE STÁLO PALÍRNU CELÝ DEN !!!
   * Hra nákup, po kterém by zůstala NULA špinavých, odmítne – a NEŘEKNE to:
   * žádný požadavek neodejde, žádná chyba se neobjeví. Naživo palírna potřebovala
   * 3 636 240 kg pšenice za 9 090 600 Kč, špinavých bylo přesně 9 090 600 a
   * nekoupilo se nikdy. Přitom 3 000 000 kg za 7 500 000 prošlo bez řečí, takže
   * o velikost dávky ani o mechaniku nešlo.
   *
   * Vzniklo to spolu s `bank.zajisti()`, které převádí PŘESNĚ chybějící sumu –
   * po nákupu by tedy vždycky zbyla nula. Tady se ověřuje samotný výpočet
   * množství, aby na tom nezáleželo, odkud peníze přišly.
   */
  const chmel = { nazev: 'chmel', chybi: 1000, cena: 0.6 };   // stojí 600
  eq('s přebytkem se koupí všechno', V.kolikKoupit(chmel, 10000), 1000);
  eq('přesně na cenu se koupí MÍŇ', V.kolikKoupit(chmel, 600) < 1000, true);
  ok('a rezerva zůstane',
    600 - V.kolikKoupit(chmel, 600) * 0.6 >= V.REZERVA_KC - 1);
  eq('o kus víc než rezerva stačí na skoro všechno',
    V.kolikKoupit(chmel, 600 + V.REZERVA_KC), 1000);
  eq('bez peněz se nekupuje nic', V.kolikKoupit(chmel, 50), 0);
  eq('když nevím kolik mám, neblokuje to', V.kolikKoupit(chmel, null), 1000);

  console.log('\n[nákup] odmítnutý nákup se NEHLÁSÍ jako povedený');
  /*
   * `koupit()` jen kliklo a mlčky se vrátilo, takže odmítnutí vypadalo jako
   * úspěch: v liště svítilo „koupeno pšenice za 9,1 mil. Kč“, zásoba zůstala na
   * nule a peníze se nepohnuly. Poznat to šlo jedině tím, že se uživatel podivil,
   * proč to pořád chce peníze, které má.
   */
  S_[24] = 'volno';
  SKLAD_.psenice = 0;
  // špinavé nastavím tak, aby nákup „prošel“ jen naoko: fixtura při nule odmítne
  const potrebaW = Math.ceil(KAPACITA[24] * 8 * 2.5);
  D.querySelector('.value.renew-dirty_money').textContent = String(potrebaW);
  BANKA = { kVkladu: '0.00', kVyberu: '0.00' };   // z banky nic, ať se to nedorovná
  KLIKY = [];
  let padlo = null;
  try { await V.koupit(24, { nazev: 'pšenice', chybi: KAPACITA[24] * 8, cena: 2.5,
    nakupRe: /whiskydistillery\/buyWheat/ }, KAPACITA[24] * 8); }
  catch (e) { padlo = e.message; }
  ok('nákup za všechny peníze spadne', !!padlo);
  ok('a řekne, že se peníze nezmenšily', /nezmenšily|neproběhl/.test(String(padlo)));
  eq('špinavé opravdu zůstaly', +D.querySelector('.value.renew-dirty_money').textContent,
    potrebaW);

  console.log('\n[nákup] s rezervou projde a peníze ubudou');
  D.querySelector('.value.renew-dirty_money').textContent = String(potrebaW + V.REZERVA_KC);
  const rNakup = await V.koupit(24, { nazev: 'pšenice', chybi: KAPACITA[24] * 8, cena: 2.5,
    nakupRe: /whiskydistillery\/buyWheat/ }, KAPACITA[24] * 8);
  eq('koupilo se', rNakup.koupeno, KAPACITA[24] * 8);
  eq('a ubylo přesně tolik', +D.querySelector('.value.renew-dirty_money').textContent,
    V.REZERVA_KC);

  console.log('\n[peníze z banky] když nejsou ani tam, spustí se aspoň ze zásob');
  /*
   * !!! TOHLE STÁLO NAŽIVO VÝROBU !!!
   * Pivovar měl chmel a ječmen na 25 600 sudů, ale chyběly peníze na dokoupení
   * do plné kapacity – a modul se zastavil na „nedostatek“, místo aby uvařil
   * to, na co zásoby stačily. Stojící výrobna je horší než menší dávka.
   */
  D.querySelector('.value.renew-dirty_money').textContent = '1 000';
  BANKA = { kVkladu: '0.00', kVyberu: '5000.00' };
  SKLAD_.chmel = 15 * 5000;        // zásoby na 5 000 sudů
  SKLAD_.jecmen = 30 * 5000;
  KLIKY = [];
  rb = await V.kolo(29);
  eq('spustí se výroba', rb.co, 'spuštěno');
  ok('kliklo se na vaření', KLIKY.some(k => /boilBeer/.test(k.akce)));
  ok('nic se nekoupilo', !KLIKY.some(k => /buyHops/.test(k.akce)));
  console.log('       (popis: ' + rb.popis + ')');
  ok('v popisu je, kolik se stihlo', /5[\s  ]?000/.test(rb.popis));
  ok('i to, že peníze chyběly', /chybí/.test(rb.popis));

  console.log('\n[peníze z banky] bez peněz i bez zásob se přizná nedostatek');
  SKLAD_.chmel = 0; SKLAD_.jecmen = 0;
  KLIKY = [];
  rb = await V.kolo(29);
  eq('kolo to přizná', rb.co, 'nedostatek');
  ok('a řekne, že nestačí ani banka', /nestačí|chybí/.test(rb.popis));
  ok('nic se nekoupilo', !KLIKY.some(k => /buyHops/.test(k.akce)));
  ok('a nespustilo', !KLIKY.some(k => /boilBeer/.test(k.akce)));
  D.querySelector('.value.renew-dirty_money').textContent = '102 000 000';
  BANKA = { kVkladu: '0.00', kVyberu: '0.00' };
  SKLAD_.chmel = 1022620; SKLAD_.jecmen = 1545240;

  console.log('\n[kolo] konopí bez semen: koupit, teprve pak sázet');
  S_[27] = 'volno';
  SKLAD_.semena = 0;
  KLIKY = [];
  r = await V.kolo(27);
  eq('koupí se semena', r.co, 'koupeno');
  eq('množství = 100 na hektar', KLIKY[0].mnozstvi, String(KAPACITA[27] * 100));
  SKLAD_.semena = KAPACITA[27] * 100;
  KLIKY = [];
  r = await V.kolo(27);
  eq('pak se zaseje', r.co, 'spuštěno');
  ok('kliklo se na sázení', /agriculture\/plant/.test(KLIKY[0].akce));

  console.log('\n[úspora] běžící budova se nečte znovu – ani automatikou, ani lištou');
  /*
   * !!! ZMĚŘENÁ ZTRÁTA !!!
   * `autoTick` projde budovy, dokud jedna něco neudělá – a každá běžící se
   * stahovala ZNOVU, každých pět sekund. Se třemi běžícími to bylo 5 požadavků
   * na tik (tři zbytečné + dva na akci), tedy 60 za minutu jen za výrobny.
   * Přitom hra sama v `.working` říká, kolik sekund zbývá.
   *
   * Termínu se věří v plné délce, i když jsou to hodiny, a UKLÁDÁ se – jinak by
   * ho smazal každý reload (a ten se děje sám každých 30–60 minut).
   */
  V.zapomenVse();
  S_[21] = 'vyrabi'; BEZI_[21] = 3600;      // hodina výroby
  let pocet = 0;
  let adresy = [];
  const puvodniApi = CMC.parse.apiGet;
  CMC.parse.apiGet = async url => { pocet++; adresy.push(String(url)); return puvodniApi(url); };

  pocet = 0;
  let rB = await V.kolo(21);
  eq('první čtení proběhne', pocet, 1);
  eq('a hlásí, že běží', rB.bezi, true);
  ok('termín se zapamatoval', V.beziAz(21) > Date.now() + 3000000);

  pocet = 0;
  rB = await V.kolo(21);
  eq('druhé kolo už NEČTE nic', pocet, 0);
  ok('a ví to z paměti', rB.zPameti === true);
  ok('zbývající čas dopočítá', rB.zbyvaS > 3000);

  // lišta kreslí všechny čtyři budovy – hlídá se, že TU BĚŽÍCÍ vynechá
  adresy = [];
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 60));
  ok('ani lišta tu běžící nečte', !adresy.some(u => /show\/21$/.test(u)));
  ok('ostatní si ale načte', adresy.some(u => /show\/(24|27|29)$/.test(u)));

  console.log('\n[úspora] po akci se paměť zahodí, ať se stav nedomýšlí');
  V.zapomen(21);
  eq('termín je pryč', String(V.beziAz(21)), 'null');
  pocet = 0;
  await V.kolo(21);
  eq('takže se přečte znovu', pocet, 1);
  CMC.parse.apiGet = puvodniApi;
  BEZI_[21] = 0; S_[21] = 'vyrabi';
  V.zapomenVse();

  console.log('\n[úspora] jedna úloha = JEDEN požadavek, ne dva');
  /*
   * `kolo()` si budovu přečte kvůli `stav()` a `klikni()` si ji vzápětí stahovalo
   * ZNOVU – změřeno 2× tentýž `/map/building/show/{id}` na každou úlohu. Mezi
   * těmi čteními jsou milisekundy, takže se nic „nezčerstvilo“.
   */
  let pocet2 = 0;
  CMC.parse.apiGet = async url => { pocet2++; return puvodniApi(url); };
  S_[24] = 'vyrabi';
  pocet2 = 0;
  const rS = await V.kolo(24);
  eq('sebralo se', rS.co, 'sebráno');
  eq('a stálo to jeden požadavek', pocet2, 1);
  CMC.parse.apiGet = puvodniApi;
  V.zapomenVse();

  console.log('\n[automatika] jedna budova za tik, střídají se');
  /*
   * Čtyři budovy naráz by znamenaly osm požadavků v jednom okamžiku – bere se
   * jedna a příště se pokračuje od další.
   */
  await CMC.store.patch('read', { vyrAuto: true, autoPaused: false });
  for (const id of [21, 24, 27, 29]) S[id] = 'vyrabi';
  KLIKY = [];
  ok('první tik něco udělal', await V.autoTick());
  eq('a byl to jeden klik', KLIKY.length, 1);
  const prvni = KLIKY[0].akce;
  KLIKY = [];
  await V.autoTick();
  ok('druhý tik vzal jinou budovu', KLIKY.length === 1 && KLIKY[0].akce !== prvni);

  console.log('\n[automatika] pauza a vypnutí');
  await CMC.store.patch('read', { autoPaused: true });
  KLIKY = [];
  eq('pozastavená nic nedělá', await V.autoTick(), false);
  eq('a neklikla', KLIKY.length, 0);
  await CMC.store.patch('read', { autoPaused: false, vyrAuto: false });
  eq('vypnutá taky ne', await V.autoTick(), false);
  await CMC.store.patch('read', { vyrAuto: true });

  console.log('\n[evidence] co se dělo, se zapisuje');
  await CMC.store.put('vyrLog', {});
  S_[29] = 'vyrabi';
  await V.kolo(29);
  S_[29] = 'volno';
  SKLAD_.chmel = 0; SKLAD_.jecmen = 99999999;
  await V.kolo(29);
  const st = V.stats();
  const pivo = st.budovy.find(b => b.id === 29);
  eq('sebrání', pivo.sebrano, 1);
  eq('nákup', pivo.koupeno, 1);
  ok('a co stál materiál', st.zaMaterial > 0);
  SKLAD_.chmel = 1022620; SKLAD_.jecmen = 1545240;

  console.log('\n[lišta] výrobny mají vlastní řádek');
  await CMC.store.patch('read', { gymBar: true, vyrBar: true, mineBar: true });
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 400));   // stavy se dotahují na pozadí
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 200));
  ok('řádek výroben je v liště', !!vyrRadek());
  ok('a jmenuje se Výrobny',
    /Výrobny/.test((vyrRadek().querySelector('.cmc-gym-label') || {}).textContent || ''));
  // banka je samostatný řádek, ne skupina uvnitř tohohle
  ok('banka v něm není', !vyrRadek().querySelector('.cmc-bank-keep'));
  const bankaRadek = D.querySelector('#cmc-gym-bar .cmc-gym-bank-row');
  ok('banka má vlastní řádek', !!bankaRadek);
  ok('a je až za výrobnami', !bankaRadek
    || [...D.querySelectorAll('#cmc-gym-bar .cmc-gym-row')].indexOf(bankaRadek)
       > [...D.querySelectorAll('#cmc-gym-bar .cmc-gym-row')].indexOf(vyrRadek()));
  eq('čtyři tlačítka', vyrRadek().querySelectorAll('.cmc-gym-unit').length, 4);
  eq('a jen JEDNO zaškrtávátko', vyrRadek().querySelectorAll('.cmc-gym-auto-box').length, 1);
  const popisky = [...vyrRadek().querySelectorAll('.cmc-gym-unit')].map(b => b.title).join(' ');
  ok('popisky říkají kapacitu', /kapacita/.test(popisky));
  ok('i stav materiálu', /CHYBÍ|stačí/.test(popisky));

  console.log('\n[lišta] hlavní vypínač o výrobnách ví');
  const master = Array.from(bar().querySelectorAll('button')).find(b => /⏸|▶/.test(b.textContent));
  ok('vypínač se kreslí', !!master);
  ok('a jmenuje výrobny', /výrobny/.test(norm(master.title)));

  console.log('\n[lišta] dá se vypnout');
  await CMC.store.patch('read', { vyrBar: false });
  CMC.gym.collect(true);
  await new Promise(r => setTimeout(r, 120));
  ok('vypnutý řádek v liště není', !vyrRadek());

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ výrobny sbírají, kupují a spouštějí');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
