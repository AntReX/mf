/* Řádky letadel a lodí v liště: stav, výběr nákladu, klik = jedna akce.
 * Fixtures kopírují strukturu ověřenou v /map/plane/{1,2,3}, /map/boat/{1,2,3,4}
 * a fragmentech letiště #60 / přístavu #30. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

/* Nabídka nákladu a „Odeslat“/„Vyplout“ jsou ve fragmentu VŽDY – i u prostředku,
 * který je venku. Hra to značí obalem `.box-ins.shipSendDisabled`.
 * `.max-{id}-amount` je hodnota, kterou si hra po kliknutí na náklad dá do
 * `input[name=amountOfDrugs]` (ověřeno v app.js i klikáním naživo). */
const cargoBox = o => `
  <div class="box-ins${o.disabled ? ' shipSendDisabled' : ''}" id="smuggle-selection">
    <p>Vyber, co chceš propašovat ${o.kind === 'plane' ? 'letadlem' : 'lodí'}</p>
    <input name="amountOfDrugs" value="${o.cap}">
    <div class="capacity-amounts">${o.opts.map(x => `<b class="max-${x.id}-amount">${x.max}</b>`).join('')}</div>
    ${o.opts.map(x => `<div class="static-inv v2${x.sel ? ' selected' : ''}" data-id="${x.id}">${x.text}</div>`).join('')}
    <div class="inline-form"><a href="#" action="/map/${o.kind}/${o.n}/send"
      class="btn btn-danger btn-sm">${o.kind === 'plane' ? 'Odeslat' : 'Vyplout'}</a></div>
  </div>`;

const unit = o => `<div class="box-h">${o.name}</div><div class="box-con"><p>Kapacita: ${o.capText || o.cap} L</p>
  ${o.note || ''}
  ${o.collect ? `<a href="#" action="/map/${o.kind}/${o.n}/collect" class="btn btn-success btn-sm takeMoney">Sebrat peníze</a>` : ''}
  ${cargoBox(o)}</div>`;

/* U letadel je výchozí náklad whisky; pivo je záloha, když whisky nestačí. */
const BOOZE = (whiskyMax, whiskyStock) => [
  { id: 'beer', max: 999999999, sel: false, text: 'Pivo: 676 870 L Dostaneš 1Kč' },
  { id: 'whisky', max: whiskyMax, sel: true, text: 'Whisky: ' + (whiskyStock || '5 165 146') + ' L Dostaneš 2.50Kč' }
];
/* U lodí je výchozí náklad konopí; pervitin je ten, který chceme, když ho je dost. */
const DRUGS = (methMax, methStock, mariMax) => [
  { id: 'meth', max: methMax, sel: false, text: 'Pervitin: ' + methStock + ' g Dostaneš 2.40Kč' },
  { id: 'marijuana', max: mariMax || 999999999, sel: true,
    text: 'Konopí: ' + (mariMax ? mariMax : '32 827 137') + ' g Dostaneš 0.60Kč' }
];

const FRAG = {
  // ---- letadla ----
  'plane/1': unit({ kind: 'plane', n: 1, name: 'Grasswing', cap: 201, opts: BOOZE(201) }),
  'plane/2': unit({ kind: 'plane', n: 2, name: 'Skylet', cap: 302, collect: true, disabled: true,
    note: '<p>Letadlo se vrátilo zpět do před 5 minutami a přivezlo 755Kč</p>', opts: BOOZE(302) }),
  'plane/3': unit({ kind: 'plane', n: 3, name: 'Twincrest', cap: 2842, capText: '2 842', disabled: true,
    note: '<p>Letadlo je momentálně ve vzduchu</p>', opts: BOOZE(2842) }),
  // whisky nestačí na plný náklad (hra sama zkrátí max) → náhradní pivo
  'plane/4': unit({ kind: 'plane', n: 4, name: 'Stratos', cap: 14497, capText: '14 497',
    opts: BOOZE(900, '900') }),
  // ---- lodě ----
  // peníze čekají + hra hlásí pokutu za pozdní sběr
  'boat/1': unit({ kind: 'boat', n: 1, name: 'Tulák', cap: 201, collect: true, disabled: true,
    note: '<p>Zpozdil ses 28 minut se sběrem peněz. Přišel jsi o 28.94Kč</p>'
        + '<p>Loď se vrátila zpět do před 28 minutami a přivezla 453.46Kč</p>',
    opts: DRUGS(201, '170 115') }),
  // pervitinu je dost → popluje pervitin
  'boat/2': unit({ kind: 'boat', n: 2, name: 'Windel', cap: 302, opts: DRUGS(302, '170 115') }),
  // pervitinu je málo (hra sama zkrátí max) → náhradní náklad konopí
  'boat/3': unit({ kind: 'boat', n: 3, name: 'Brontug', cap: 2842, capText: '2 842', opts: DRUGS(1500, '1 500', 1000) }),
  // na cestě
  'boat/4': unit({ kind: 'boat', n: 4, name: 'Marvella', cap: 14497, capText: '14 497', disabled: true,
    note: '<p>Loď je momentálně na cestě</p>', opts: DRUGS(14497, '170 115') })
};

const buyCard = (base, n, name, lvl) => `
  <div class="static-inv holder-2"><div class="over-name">${name}<p>Požadovaná úroveň ${base === 'buyPlane' ? 'letiště' : 'přístavu'}: ${lvl}</p></div>
    <p>Kapacita: 604 233 g</p>
    <a href="#" action="https://s1.czechmafie.cz/map/building/${base === 'buyPlane' ? 'airport' : 'shipyard'}/${base}/${n}" class="btn">5 598 675Kč</a></div>`;

/* Karta odeslaného prostředku: buď odpočet `.timer-down[time-left-secs]`,
 * nebo „Vybrat“ s data-modal, když už dorazil. */
const odeslany = (path, n, name, secs) => `
  <div class="box-ins acc-ins">${name}
    <div class="acc-c"><div class="laundering-box">
      Náklad: Whisky Množství: 201 L Odešli: před 29 sekundami
      ${secs != null
        ? `<div class="timer-down" time-left-secs="${secs}"><div class="label">Vrátí se za:</div>
             <div class="btn-badge hours">00</div><div class="btn-badge minutes">02</div><div class="btn-badge seconds">38</div></div>`
        : `<a href="#" data-modal="${path}${n}">Vybrat</a>`}
    </div></div>
  </div>`;

let PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', 158);
let BOAT_DISPATCHED = '';
const AIRPORT = () => `<div class="airport"><h1>Letiště</h1>
  <div class="box-ins acc-ins-head">Odletělé letadla</div>${PLANE_DISPATCHED}
  ${buyCard('buyPlane', 5, 'Aerofox', 32)}${buyCard('buyPlane', 6, 'Vireon', 39)}</div>`;
const HARBOR = () => `<div class="harbor"><h1>Přístav</h1>
  <div class="box-ins acc-ins-head">Odeslané lodě</div>${BOAT_DISPATCHED}
  ${buyCard('buyShip', 5, 'Nákladní dopravce', 40)}${buyCard('buyShip', 6, 'Titanhaul', 55)}</div>`;

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'MutationObserver', 'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;
const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };
// econ.js je potřeba na náklad materiálu; v manifestu je taky před fleet.js
for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/econ.js', 'src/gym.js', 'src/fleet.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC, D = dom.window.document;

/* apiGet se nahradí fixturami */
const log = [];
CMC.parse.apiGet = async url => {
  log.push(url);
  if (/show\/60$/.test(url)) return { status: 200, raw: AIRPORT() };
  if (/show\/30$/.test(url)) return { status: 200, raw: HARBOR() };
  const m = url.match(/\/map\/(plane|boat)\/(\d+)$/);
  if (m && FRAG[m[1] + '/' + m[2]]) return { status: 200, raw: FRAG[m[1] + '/' + m[2]] };
  return { status: 404, raw: '{"errors":["nope"]}' };
};
/* klik na herní prvek se jen zaznamená (jinak by jsdom nic neudělal) */
const kliky = [];
dom.window.HTMLElement.prototype.click = function () {
  kliky.push((this.getAttribute('action') || this.getAttribute('data-id') || this.tagName)
    + (this.className ? ' [' + this.className + ']' : ''));
};

let fails = 0;
const norm = x => String(x).replace(/[\s\u00a0\u202f]/g, ' ');
const eq = (n, g, w) => { const o = norm(g) === norm(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(norm(g))} want ${JSON.stringify(norm(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const bar = () => D.getElementById('cmc-gym-bar');
const rowOf = i => Array.from(bar().querySelectorAll('.cmc-gym-row'))[i];
const btnsOf = i => Array.from(rowOf(i).querySelectorAll('.cmc-gym-unit'));
const fire = el => el.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
const PLANE = CMC.fleet.kindById('plane'), BOAT = CMC.fleet.kindById('boat');

(async () => {
  await CMC.store.load();
  await CMC.store.patch('read', { gymBar: true, gymRemote: false, gymEverywhere: false, gymAlertEnergy: 0, planeBar: true, boatBar: true });
  D.body.innerHTML = '<div class="modal-box main-box"></div>';

  console.log('\n[letadla] stav z fragmentů');
  const p = await CMC.fleet.load(PLANE, true);
  eq('popisky = ID ve hře', p.map(u => u.label).join(','), 'L1,L2,L3,L4,L5,L6');
  eq('L1 doma → odeslat', p[0].name + '/' + p[0].mode, 'Grasswing/send');
  eq('L2 přivezlo peníze → sebrat', p[1].name + '/' + p[1].mode, 'Skylet/collect');
  eq('L3 letí (i když „Odeslat“ ve fragmentu je)', p[2].name + '/' + p[2].mode, 'Twincrest/away');
  eq('L4 whisky nestačí → náhradní pivo', p[3].name + '/' + p[3].cargo.id + '/' + p[3].cargo.full, 'Stratos/beer/true');
  eq('L5 nekoupené + úroveň', p[4].name + '/' + p[4].mode + '/' + p[4].level, 'Aerofox/locked/32');
  eq('L1 whisky je dost → whisky, plný náklad', p[0].cargo.id + '/' + p[0].cargo.full, 'whisky/true');

  console.log('\n[počet jízd] ze zásoby, ne z max-{náklad}-amount');
  // L1: kapacita 201, whisky 5 165 146 → 25 697 jízd. Kdyby se počítalo
  // z max-whisky-amount (= kapacita), vyšla by vždy jedna – to je ta past.
  eq('L1 = zásoba / kapacita', p[0].cargo.runs, Math.floor(5165146 / 201));
  ok('a rozhodně ne 1', p[0].cargo.runs !== 1);
  eq('L4 whisky na nic, pivo 676 870 / 14 497', p[3].cargo.runs, Math.floor(676870 / 14497));

  console.log('\n[lodě] stav a výběr nákladu');
  const b = await CMC.fleet.load(BOAT, true);
  eq('popisky', b.map(u => u.label).join(','), 'S1,S2,S3,S4,S5,S6');
  eq('S1 peníze + pokuta za pozdní sběr', b[0].mode + '/' + b[0].money + '/' + b[0].lost, 'collect/453.46/28.94');
  eq('S2 pervitinu dost → pervitin, plný náklad', b[1].cargo.id + '/' + b[1].cargo.full, 'meth/true');
  eq('S3 nestačí ani pervitin, ani konopí → konopí, ale ne plné',
    b[2].cargo.id + '/' + b[2].cargo.full + '/' + b[2].cargo.available, 'marijuana/false/1000');
  eq('S3 nemá ani na jednu plnou jízdu', b[2].cargo.runs, 0);
  eq('S4 pervitin 170 115 / 14 497', b[3].cargo.runs, Math.floor(170115 / 14497));
  eq('S4 je na cestě', b[3].mode, 'away');
  eq('S5 nekoupené + úroveň přístavu', b[4].name + '/' + b[4].level, 'Nákladní dopravce/40');
  eq('budovy se čtou po jedné', log.filter(x => /show\/(30|60)$/.test(x)).length, 2);

  console.log('\n[lišta] řádky letadel a lodí');
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 50));
  // letadla + lodě + spodní řádek se stavem akce (ten je v liště vždycky)
  eq('řádky', bar().querySelectorAll('.cmc-gym-row').length, 3);
  ok('poslední je řádek stavu',
    [...bar().querySelectorAll('.cmc-gym-row')].pop().classList.contains('cmc-gym-stav-row'));
  eq('popisky řádků', Array.from(bar().querySelectorAll('.cmc-gym-label')).map(e => e.textContent).join(' '), 'Letadla: Lodě:');
  eq('letadla – číslo a za lomítkem zbývající plné jízdy (strop 99)',
    btnsOf(0).map(x => norm(x.textContent)).join(' '), 'L1/99 L2/99 L3/99 L4/46 L5 🔒 L6 🔒');
  ok('přesný počet je v tooltipu', /vystačí na 25\s697 plných jízd/.test(btnsOf(0)[0].title));
  eq('stav nese barva', btnsOf(0).map(x =>
    ['ready', 'send', 'away', 'btn-link'].find(c => x.className.includes(c === 'btn-link' ? 'cmc-gym-btn-link' : 'cmc-gym-unit-' + c))).join(','),
    'send,ready,away,send,btn-link,btn-link');
  ok('plný náklad je bez oranžové (i když je to náhradní pivo)',
    !btnsOf(0)[0].classList.contains('cmc-gym-unit-partial')
    && !btnsOf(0)[3].classList.contains('cmc-gym-unit-partial'));
  ok('částečný náklad má oranžový rámeček', btnsOf(1)[2].classList.contains('cmc-gym-unit-partial'));
  // fmt.num sází pevnou mezeru, tak přes norm()
  // fmt.num sází pevnou mezeru (U+00A0), takže \s, ne obyčejná mezera
  ok('a tooltip řekne kolik se pošle', /jen 1\s000 – na plný náklad nestačí/.test(btnsOf(1)[2].title));
  ok('náklad je pořád v tooltipu', /vypraví whisky \(plný náklad\)/.test(btnsOf(0)[0].title)
    && /vypraví pivo/.test(btnsOf(0)[3].title));
  ok('legenda barev je na popisku řádku',
    /zeleně = přivezlo peníze/i.test(rowOf(0).querySelector('.cmc-gym-label').title));
  eq('lodě', btnsOf(1).map(x => norm(x.textContent)).join(' '), 'S1/99 S2/99 S3/0 S4/11 S5 🔒 S6 🔒');
  ok('nula se vysvětlí v tooltipu',
    /nestačí ani na jednu plnou jízdu/.test(btnsOf(1)[2].title));
  ok('legenda zmiňuje i to číslo',
    /počet zbývajících plných jízd/.test(rowOf(1).querySelector('.cmc-gym-label').title));
  ok('a v tooltipu je náklad', /vypraví pervitin/.test(btnsOf(1)[1].title));
  ok('peníze zvýrazněné', btnsOf(1)[0].classList.contains('cmc-gym-unit-ready'));
  ok('na cestě vypnuté', btnsOf(1)[3].disabled);
  // fmt.kc zaokrouhluje na koruny, stejně jako všude v panelu
  ok('v tooltipu je částka i pokuta za pozdní sběr',
    /sebere peníze \(453/.test(btnsOf(1)[0].title) && /přišlo o 29/.test(btnsOf(1)[0].title));
  ok('u pervitinu je „plný náklad“', /plný náklad/.test(btnsOf(1)[1].title));
  ok('u konopí je vidět, co popluje', /vypraví konopí/.test(btnsOf(1)[2].title));

  console.log('\n[lodě] klik vybere náklad a pak vypraví');
  kliky.length = 0;
  fire(btnsOf(1)[1]);
  await new Promise(r => setTimeout(r, 900));
  eq('nejdřív pervitin, pak vyplout', kliky.join(' , '),
    'meth [static-inv v2] , /map/boat/2/send [btn btn-danger btn-sm]');
  ok('v herním okně nic nezůstalo', !D.querySelector('.cmc-gym-offscreen'));
  ok('lišta hlásí, co poplulo', /S2 vypraveno – pervitin/.test(norm(bar().querySelector('.cmc-gym-status').textContent)));

  console.log('\n[lodě] když pervitin nestačí, klikne se konopí');
  kliky.length = 0;
  await CMC.fleet.act(BOAT, 3);
  eq('konopí, pak vyplout', kliky.join(' , '),
    'marijuana [static-inv v2 selected] , /map/boat/3/send [btn btn-danger btn-sm]');

  console.log('\n[lodě] peníze mají přednost před vypravením');
  kliky.length = 0;
  eq('vrací sebráno i s částkou', (await CMC.fleet.act(BOAT, 1)).text, 'sebráno 453 Kč');
  eq('a klikne jen na sběr', kliky.join(','), '/map/boat/1/collect [btn btn-success btn-sm takeMoney]');

  console.log('\n[lodě] co je venku, se nevypraví ani při zestaralém stavu');
  kliky.length = 0;
  let chyba = null;
  try { await CMC.fleet.act(BOAT, 4); } catch (e) { chyba = e.message; }
  eq('akce se odmítne', chyba, 'loď je na cestě');
  eq('a nic se neklikne', kliky.length, 0);

  console.log('\n[letadla] klik vybere náklad a pak odešle');
  kliky.length = 0;
  await CMC.fleet.act(PLANE, 1);
  eq('whisky, pak odeslat', kliky.join(' , '),
    'whisky [static-inv v2 selected] , /map/plane/1/send [btn btn-danger btn-sm]');
  kliky.length = 0;
  eq('a když whisky nestačí, pošle pivo', (await CMC.fleet.act(PLANE, 4)).text, 'vypraveno – pivo');
  eq('klikne se pivo, pak odeslat', kliky.join(' , '),
    'beer [static-inv v2] , /map/plane/4/send [btn btn-danger btn-sm]');

  console.log('\n[prázdné zásoby] nevypravuje se a NIC se neklikne');
  /*
   * !!! TOHLE SE STALO NAŽIVO !!!
   * Uživatel prodal všechno a lišta pořád psala chybu hry, že množství „musí být
   * aspoň 1“. Příčina: když žádný náklad nezaplnil kapacitu, vzal se prostě
   * POSLEDNÍ z nabídky – i s nulou – a odeslání se zkusilo. Automatika to pak
   * hlásila každé kolo znovu.
   *
   * Prázdná zásoba není chyba, jen není co poslat: `pickCargo` vrátí `null`
   * a `act` na „odeslat“ vůbec neklikne.
   */
  const puvodni1 = FRAG['plane/1'];
  FRAG['plane/1'] = unit({ kind: 'plane', n: 1, name: 'Grasswing', cap: 201,
    opts: [{ id: 'beer', max: 0, sel: false, text: 'Pivo: 0 L Dostaneš 1Kč' },
      { id: 'whisky', max: 0, sel: true, text: 'Whisky: 0 L Dostaneš 2.50Kč' }] });

  const prazdny = await CMC.fleet.load(PLANE, true);
  eq('náklad se nevybere', String(prazdny[0].cargo), 'null');
  eq('ale pořád je doma', prazdny[0].mode, 'send');

  kliky.length = 0;
  let bezNakladu = null;
  try { await CMC.fleet.act(PLANE, 1); } catch (e) { bezNakladu = e.message; }
  ok('odeslání se odmítne', !!bezNakladu);
  ok('a řekne se proč', /nemá co vypravit|prázdn/i.test(String(bezNakladu)));
  eq('NEKLIKLO se na nic', kliky.length, 0);
  ok('a hlavně ne na odeslat', !kliky.some(k => /\/send/.test(k)));

  console.log('\n[prázdné zásoby] tlačítko v liště je vypnuté a řekne proč');
  CMC.gym.collect(true);
  const tlacitkoL1 = btnsOf(0)[0];
  ok('tlačítko je vypnuté', tlacitkoL1.disabled);
  // samotné „L1“ by vypadalo jako každý jiný stav bez čísla – proto `/–`
  eq('na tlačítku je „L1/–“', norm(tlacitkoL1.textContent), 'L1/–');
  ok('a tooltip to vysvětlí', /nemá co vypravit/.test(tlacitkoL1.title));

  console.log('\n[prázdné zásoby] automatika to ani nezkusí');
  /*
   * Kdyby to zkoušela, psala by tu chybu hry každé kolo – právě to uživatele
   * otravovalo. Musí to projít naprázdno a beze slova.
   */
  await CMC.store.patch('read', { autoPlane: true, autoBoat: false, autoPaused: false });
  kliky.length = 0;
  const kol = await CMC.fleet.autoRound();
  ok('žádné odeslání', !kliky.some(k => /plane\/1\/send/.test(k)));
  ok('a nic se nepokusilo', typeof kol === 'number');
  await CMC.store.patch('read', { autoPlane: false });

  FRAG['plane/1'] = puvodni1;
  await CMC.fleet.load(PLANE, true);

  console.log('\n[hlídání] odpočet z jednoho fragmentu budovy');
  const poll = await CMC.fleet.pollDispatched(PLANE);
  eq('kdo je venku a za jak dlouho', JSON.stringify(poll.timers), '[{"name":"Twincrest","secs":158}]');
  eq('nikdo zatím nedorazil', poll.arrived.length, 0);
  PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', null);
  const poll2 = await CMC.fleet.pollDispatched(PLANE);
  eq('dorazilo → ID z data-modal', JSON.stringify(poll2.arrived), '[3]');
  eq('a už nemá odpočet', poll2.timers.length, 0);

  console.log('\n[hlídání] kdy se ozve příště');
  PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', 158);
  await CMC.fleet.load(PLANE, true);
  log.length = 0;
  let dalsi = await CMC.fleet.tick();
  eq('čeká se na nejbližší přílet (+3 s), ne pevný interval', dalsi, (158 + 3) * 1000);
  eq('a stálo to jeden požadavek na budovu', log.filter(x => /show\/60$/.test(x)).length, 1);
  eq('eta u toho, co je venku', CMC.fleet.states.plane.list.find(u => u.n === 3).eta, 158);
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 30));
  const tipL3 = btnsOf(0).find(b => /^L3/.test(norm(b.textContent))).title;
  ok('a je vidět v tooltipu jako odpočet', /je ve vzduchu, vrátí se za 2:38/.test(norm(tipL3)));
  eq('odpočet se formátuje po sekundách, ne zaokrouhleně na minuty',
    [59, 158, 3661].map(x => CMC.fleet.etaText(x)).join(' '), '0:59 2:38 1:01:01');

  console.log('\n[hlídání] nic venku → nic se neptá');
  // všechna letadla domů: crime/…, pardon – přepneme fragmenty na „doma“
  const zaloha = { p3: FRAG['plane/3'] };
  FRAG['plane/3'] = unit({ kind: 'plane', n: 3, name: 'Twincrest', cap: 2842, capText: '2 842', opts: BOOZE(2842) });
  PLANE_DISPATCHED = '';
  await CMC.fleet.load(PLANE, true);
  await CMC.store.patch('read', { boatBar: false });
  log.length = 0;
  dalsi = await CMC.fleet.tick();
  eq('žádný požadavek', log.length, 0);
  eq('a nic se neplánuje', dalsi, null);
  FRAG['plane/3'] = zaloha.p3;
  await CMC.store.patch('read', { boatBar: true });

  console.log('\n[hlídání] přílet překreslí lištu');
  PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', 158);
  await CMC.fleet.load(PLANE, true);
  eq('teď je venku', CMC.fleet.states.plane.list.find(u => u.n === 3).mode, 'away');
  // dorazí + jeho fragment už nabízí sběr
  PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', null);
  FRAG['plane/3'] = unit({ kind: 'plane', n: 3, name: 'Twincrest', cap: 2842, capText: '2 842', collect: true,
    disabled: true, note: '<p>Letadlo se vrátilo zpět a přivezlo 999Kč</p>', opts: BOOZE(2842) });
  await CMC.fleet.tick();
  eq('stav se změnil na „sebrat“', CMC.fleet.states.plane.list.find(u => u.n === 3).mode, 'collect');
  ok('a zná i částku', CMC.fleet.states.plane.list.find(u => u.n === 3).money === 999);

  console.log('\n[výdělek] eviduje se per prostředek');
  await CMC.store.put('fleetLog', { plane: {}, boat: {} });
  await CMC.store.patch('read', { planeBar: true, boatBar: true });
  // S1 Tulák: fragment hlásí „přivezla 453.46Kč“ a pokutu 28.94
  await CMC.fleet.act(BOAT, 1);
  const u1 = CMC.fleet.states.boat.list.find(x => x.n === 1);
  await CMC.fleet.logCollect(BOAT, u1, 453.46, 28.94);
  await CMC.fleet.logCollect(BOAT, u1, 100, 0);
  // a jedno letadlo, ať je vidět, že se druhy nesčítají dohromady
  await CMC.fleet.logCollect(PLANE, { n: 2, name: 'Skylet' }, 755, 0);

  const e = CMC.fleet.earnings();
  eq('řádky za prostředek', e.rows.length, 2);
  const tulak = e.rows.find(r => r.label === 'S1');
  eq('sečte se výdělek', Math.round(tulak.total * 100) / 100, 553.46);
  eq('i počet sebrání', tulak.runs, 2);
  eq('a pokuta za pozdní sběr zvlášť', Math.round(tulak.lost * 100) / 100, 28.94);
  eq('průměr na jízdu', Math.round(tulak.perRun * 100) / 100, 276.73);
  eq('jméno se drží', tulak.name, 'Tulák');
  eq('letadlo se počítá zvlášť', e.rows.find(r => r.label === 'L2').total, 755);
  eq('celkem přes oba druhy', Math.round(e.total * 100) / 100, 1308.46);
  eq('a celkem jízd', e.runs, 3);
  ok('řadí se od nejvýdělečnějšího', e.rows[0].total >= e.rows[1].total);

  console.log('\n[výdělek] částka se bere z čerstvého fragmentu');
  // hra u pozdního sběru průběžně strhává, takže zapamatované číslo nemusí platit
  FRAG['boat/1'] = unit({ kind: 'boat', n: 1, name: 'Tulák', cap: 201, collect: true, disabled: true,
    note: '<p>Zpozdil ses 40 minut se sběrem peněz. Přišel jsi o 60.00Kč</p>'
        + '<p>Loď se vrátila zpět a přivezla 393.46Kč</p>', opts: DRUGS(201, '170 115') });
  const co = await CMC.fleet.act(BOAT, 1);
  eq('čte se nová částka, ne stará', co.money, 393.46);
  eq('i nová pokuta', co.lost, 60);

  console.log('\n[náklad] výnos se připíše tomu, co se vypravilo');
  await CMC.store.put('fleetLog', { plane: {}, boat: {} });
  const uS2 = { n: 2, name: 'Windel' };
  // vypraveno 302 g pervitinu, pak sebráno 725 Kč
  await CMC.fleet.logSend(BOAT, uS2, 'meth', 'pervitin', 302);
  await CMC.fleet.logCollect(BOAT, uS2, 725, 0);
  // a podruhé konopí
  await CMC.fleet.logSend(BOAT, uS2, 'marijuana', 'konopí', 302);
  await CMC.fleet.logCollect(BOAT, uS2, 181, 0);
  const e2 = CMC.fleet.earnings();
  const s2 = e2.rows.find(r => r.label === 'S2');
  eq('náklady se rozdělily', s2.cargo.map(c => c.id + ':' + c.total).join(','), 'meth:725,marijuana:181');
  eq('a množství taky', s2.cargo.map(c => c.amount).join(','), '302,302');
  eq('pending se po sebrání vyprázdní', s2.pending, null);

  console.log('\n[náklad] materiál a čistý zisk z receptů');
  const meth = e2.byCargo.find(c => c.id === 'meth');
  // pervitin: 30 tablet × 0,40 Kč na chemika, ze chemika 100 g → 0,12 Kč/g
  eq('náklad na jednotku', Math.round(meth.unitCost * 1000) / 1000, 0.12);
  eq('materiál za 302 g', Math.round(meth.cost * 100) / 100, 36.24);
  eq('čistý zisk', Math.round(meth.profit * 100) / 100, 688.76);
  ok('marže je vysoká', meth.margin > 90);
  eq('výnos na gram', Math.round(meth.perUnit * 100) / 100, 2.4);
  // konopí je skoro zdarma (100 semen × 0,10 na hektar = 1 000 000 g)
  const kono = e2.byCargo.find(c => c.id === 'marijuana');
  ok('konopí má zanedbatelný materiál', kono.unitCost < 0.001);
  ok('takže zisk ≈ výnos', Math.abs(kono.profit - kono.total) < 0.01);
  eq('celkový zisk = výnos − materiál',
    Math.round((e2.total - e2.cost) * 100) / 100, Math.round(e2.profit * 100) / 100);

  console.log('\n[náklad] srovnání s prodejem na trhu');
  // doprava platí 2,40/g, trh 1,40/g → vozit se vyplatí
  ok('vozit pervitin se vyplatí víc než prodat', meth.total > meth.ifSold);
  eq('kolik navíc', Math.round((meth.total - meth.ifSold) * 100) / 100,
    Math.round((725 - 1.4 * 302) * 100) / 100);

  ok('náklad je číslo, ne null', typeof meth.cost === 'number' && meth.cost > 0);

  console.log('\n[náklad] ruční odeslání ve hře → neznámý náklad');
  await CMC.fleet.logCollect(BOAT, { n: 3, name: 'Brontug' }, 500, 0);
  const s3 = CMC.fleet.earnings().rows.find(r => r.label === 'S3');
  eq('zapíše se jako neznámo', s3.cargo.map(c => c.id).join(','), 'unknown');
  ok('a netvrdí se u něj náklad',
    (CMC.fleet.earnings().byCargo.find(c => c.id === 'unknown') || {}).cost == null);

  console.log('\n[výdělek] bez peněz se nic nezapisuje');
  const pred = CMC.fleet.earnings().rows.length;
  await CMC.fleet.logCollect(BOAT, { n: 9, name: 'Nic' }, 0, 0);
  eq('žádný nový řádek', CMC.fleet.earnings().rows.length, pred);

  console.log('\n[auto] zaškrtávátko na konci řádku');
  await CMC.store.patch('read', { planeBar: true, boatBar: true, autoPlane: false, autoBoat: false });
  await CMC.fleet.load(PLANE, true);
  await CMC.fleet.load(BOAT, true);
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 50));
  const boxy = () => Array.from(bar().querySelectorAll('.cmc-gym-auto-box'));
  eq('je u obou řádků', boxy().length, 2);
  ok('výchozí vypnuto', boxy().every(b => !b.querySelector('input').checked));
  ok('a tooltip varuje', /BEZ tvého kliknutí/.test(boxy()[0].title));

  // zapnutí přes zaškrtávátko uloží nastavení
  const cb = boxy()[0].querySelector('input');
  cb.checked = true;
  cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  ok('zapnutí se uloží', CMC.store.get().read.autoPlane === true);
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 30));
  ok('a je to na řádku vidět', boxy()[0].classList.contains('cmc-gym-auto-on'));
  ok('u lodí zůstalo vypnuto', !boxy()[1].classList.contains('cmc-gym-auto-on'));

  console.log('\n[auto] vypnuté nic nedělá');
  await CMC.store.patch('read', { autoPlane: false, autoBoat: false });
  kliky.length = 0;
  eq('žádná akce', await CMC.fleet.autoRound(), 0);
  eq('a žádný klik', kliky.length, 0);

  console.log('\n[auto] zapnuté sebere a vypraví');
  // L1 doma (odeslat), L2 přivezlo peníze (sebrat), L3 letí – ten se nesmí dotknout
  await CMC.store.patch('read', { autoPlane: true, autoBoat: false });
  // fragmenty se v předchozích sekcích měnily, tak je sem nastavíme natvrdo:
  // L1 doma, L2 s penězi, L3 ve vzduchu, L4 ve vzduchu
  PLANE_DISPATCHED = odeslany('/map/plane/', 3, 'Twincrest', 158);
  FRAG['plane/1'] = unit({ kind: 'plane', n: 1, name: 'Grasswing', cap: 201, opts: BOOZE(201) });
  FRAG['plane/3'] = unit({ kind: 'plane', n: 3, name: 'Twincrest', cap: 2842, capText: '2 842',
    disabled: true, note: '<p>Letadlo je momentálně ve vzduchu</p>', opts: BOOZE(2842) });
  FRAG['plane/4'] = unit({ kind: 'plane', n: 4, name: 'Stratos', cap: 14497, capText: '14 497',
    disabled: true, note: '<p>Letadlo je momentálně ve vzduchu</p>', opts: BOOZE(900, '900') });
  await CMC.fleet.load(PLANE, true);
  eq('výchozí stavy', CMC.fleet.states.plane.list.slice(0, 4).map(u => u.mode).join(','),
    'send,collect,away,away');
  kliky.length = 0;
  const udelano = await CMC.fleet.autoRound();
  eq('dvě akce', udelano, 2);
  // peníze mají přednost: nejdřív sebrat L2, pak vypravit L1
  eq('pořadí: nejdřív sebrat, pak vypravit',
    kliky.filter(x => /plane\/\d+\/(collect|send)/.test(x)).join(' , '),
    '/map/plane/2/collect [btn btn-success btn-sm takeMoney] , /map/plane/1/send [btn btn-danger btn-sm]');
  ok('co je ve vzduchu, se nedotklo',
    !kliky.some(x => /plane\/3\/|plane\/4\//.test(x)));
  ok('a lodí taky ne (mají auto vypnuté)', !kliky.some(x => /boat\//.test(x)));

  console.log('\n[auto] výdělek se zapíše i z automatiky');
  const zapsanoL2 = CMC.store.get().fleetLog.plane['2'];
  ok('sebrání se zaevidovalo', zapsanoL2 && zapsanoL2.runs > 0 && zapsanoL2.total > 0);
  const l1 = CMC.store.get().fleetLog.plane['1'];
  ok('a odeslání si pamatuje náklad', l1 && l1.pending && l1.pending.id === 'whisky');

  console.log('\n[hlavní vypínač] hradlo nad dopravou');
  await CMC.store.patch('read', { autoPlane: true, autoBoat: true, autoPaused: true });
  ok('nastavení zůstává', CMC.fleet.autoSet(PLANE) && CMC.fleet.autoSet(BOAT));
  ok('ale spustit se to nesmí', !CMC.fleet.autoOn(PLANE) && !CMC.fleet.autoOn(BOAT));
  kliky.length = 0;
  eq('kolo neudělá nic', await CMC.fleet.autoRound(), 0);
  eq('a nikam neklikne', kliky.length, 0);
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 40));
  const box = bar().querySelector('.cmc-gym-auto-box');
  ok('v řádku je vidět pauza', /auto ⏸/.test(norm(box.textContent)));
  ok('zaškrtávátko zůstává zaškrtnuté', box.querySelector('input').checked);
  ok('a tooltip to vysvětlí', /POZASTAVENO hlavním vypínačem/.test(box.title));

  await CMC.store.patch('read', { autoPaused: false });
  ok('po zapnutí se rozjede zpátky', CMC.fleet.autoOn(PLANE) && CMC.fleet.autoOn(BOAT));
  await CMC.store.patch('read', { autoPlane: false, autoBoat: false });

  console.log('\n[nastavení] řádky jde vypnout zvlášť');
  await CMC.store.patch('read', { boatBar: false });
  CMC.gym.collect();
  await new Promise(r => setTimeout(r, 30));
  eq('zůstanou jen letadla', bar().querySelectorAll('.cmc-gym-label').length, 1);
  await CMC.store.patch('read', { planeBar: false });
  CMC.gym.collect();
  ok('bez obou (a bez tréninku) lišta zmizí', !bar());

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ letadla i lodě fungují');
  process.exit(fails ? 1 : 0);
})();
