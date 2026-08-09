/* Evidence předmětů: produkt (master) → varianty → kusy, a k tomu ceny.
 *
 * Fixtures jsou opsané ze živé hry, včetně pastí, které v nich jsou:
 *   inventář: <div class="col" data-item-id="158226"> … „Válečná helma +1.05% +5 263.24“
 *             obrázek /main/inventory/clothes/hats/rare/warrior_helmet.webp
 *   aukce:    „Boty +0.62% Růžové žluté tenisky +21 144 | #4076 na místě 130 000Kč“
 *             tlačítko /map/building/auction/bid/30835
 *
 * Tři věci, na kterých to stojí:
 *  – MASTER je cesta obrázku (nese kategorii i vzácnost, název ne),
 *  – KVALITA (+x %) je vlastnost KUSU, ne produktu,
 *  – aukce a inventář se spojit NEDAJÍ: aukce `data-item-id` nemá a `#4076`
 *    je pořadí v žebříčku („#4076 na místě“), ne identita kusu.
 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://s1.czechmafie.cz/' });
for (const k of ['document', 'DOMParser', 'Node', 'HTMLElement', 'Event', 'location'])
  globalThis[k] = dom.window[k];
globalThis.window = dom.window;

const mem = {};
globalThis.chrome = { runtime: { id: 'test' }, storage: { local: {
  async get(k) { const o = {}; for (const x of (Array.isArray(k) ? k : Object.keys(k))) if (x in mem) o[x] = mem[x]; return o; },
  async set(o) { Object.assign(mem, o); }, async remove() {} }, onChanged: { addListener() {} } } };

for (const f of ['src/store.js', 'src/fmt.js', 'src/parse.js', 'src/market.js',
  'src/ui.js', 'src/tab-trh.js'])
  new Function(fs.readFileSync(path.join(EXT, f), 'utf8')).call(globalThis);
const CMC = globalThis.CMC;

/* ---- fixtures ------------------------------------------------------------- */

const IMG = 'https://2025game.narco.lt/main/inventory';

/** Položka aukce – přesně ve struktuře hry (.static-inv + tlačítko /bid/{id}). */
const lot = ({ obr, text, bid, cas, special }) => `
  <div class="static-inv holder " data-time="${cas || 217.5}">
    <div class="i-box large"><img src="${IMG}/${obr}?v=20260418">
      <div class="over-name">${text}</div></div>
    <a href="#" action="https://s1.czechmafie.cz/map/building/${special ? 'auctionSpecial' : 'auction'}/bid/${bid}"
       class="btn btn-danger btn-sm bidAuction">Nabídnout cenu</a>
  </div>`;

const AUKCE = () => `<div class="box-con"><div class="row">
  ${lot({ obr: 'drinks/luckelixir.webp', bid: 654, special: true,
    text: 'Speciální Elixír štěstí 200 000 082Kč 08:05:19' })}
  ${lot({ obr: 'weapons/common/1._straw_broom.webp', bid: 30826,
    text: 'Zbraň Slaměné koště +1 | #11158 na místě 259 000Kč 00:03:12' })}
  ${lot({ obr: 'clothes/shoes/rare/pink_yellow_sneakers.webp', bid: 30835,
    text: 'Boty +0.62% Růžové žluté tenisky +21 144 | #4076 na místě 130 000Kč 00:02:05' })}
  ${lot({ obr: 'clothes/shoes/rare/wooden_heels.webp', bid: 30756,
    text: 'Boty +13.69% Dřevěné podpatky +2 001 661 | #760 na místě 1.7 mld Kč 00:08:56' })}
</div></div>`;

/*
 * Kus v inventáři – opsané ze živé hry. Podstatné je, že DRUH STATU není v textu,
 * ale v TŘÍDĚ IKONY uvnitř `.rank.bottom`:
 *
 *   <div class="badge"><div class="icon rarity-rare"></div>
 *     <div class="rank">+0.23%</div></div>          ← kvalita
 *   <div class="rank bottom"><div class="icon defense"></div>+1</div>
 *                                    ↑ stat          ↑ hodnota
 *
 * Fixtura to původně měla jen jako text („Válečná helma +1.05% +5 263.24“), takže
 * se z ní druh statu nedal poznat – a rozšíření ho proto neevidovalo.
 */
const kus = (id, obr, nazev, kvalita, stat, hodnota) => `
  <div class="col" data-item-id="${id}">
    <div class="i-box medium"><img src="${IMG}/${obr}?v=20260418">
      <span class="corners"></span>
      <div class="over-name">${nazev}</div>
      <div class="badge"><div class="icon rarity-rare"></div>
        <div class="rank">+${kvalita}%</div></div>
      ${stat ? `<div class="rank bottom"><div class="icon ${stat}"></div> +${hodnota}</div>` : ''}
    </div>
  </div>`;

/* Karta má všechny tři staty pojmenované v textu a `.rank.bottom` NEMÁ. */
const karta = (id, obr, nazev, kvalita, sila, obrana, rychlost) => `
  <div class="col" data-item-id="${id}">
    <div class="i-box medium"><img src="${IMG}/${obr}?v=20260418">
      <div class="badge"><div class="icon rarity-rare"></div>
        <div class="rank">+${kvalita}%</div></div>
      <div class="over-name">${nazev}</div>
      <p>Síla +${sila} Obrana +${obrana} Rychlost +${rychlost}</p>
    </div>
  </div>`;

const INVENTAR = () => `<div class="box-con">
  <p>Inventář Požadovaná úroveň: 65</p>
  ${kus(158226, 'clothes/hats/rare/warrior_helmet.webp', 'Válečná helma', '1.05', 'defense', '5 263.24')}
  ${kus(157901, 'clothes/hats/rare/warrior_helmet.webp', 'Válečná helma', '3.20', 'defense', '16 010.50')}
  ${kus(157668, 'pets/rare/ginger_cat.webp', 'Zázvorová kočka', '1.85', 'defense', '3 449.17')}
  ${kus(157663, 'pets/rare/white_cat.webp', 'Bílá kočka', '0.56', 'speed', '1')}
  ${karta(157455, 'cards/rare/sniper_operative.webp', 'Operativní odstřelovač',
    '1.37', '1 022', '1 022', '1 022')}
</div>`;

let fails = 0;
const eq = (n, g, w) => { const o = String(g) === String(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(String(g))} want ${JSON.stringify(String(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };

(async () => {
  await CMC.store.load();
  const M = CMC.market;

  console.log('\n[master] z cesty obrázku, ne z názvu');
  /*
   * Cesta nese KATEGORII i VZÁCNOST, což z názvu vyčíst nejde. A odstřihává se
   * cache-busting `?v=…`, jinak by se stejný produkt evidoval podle verze
   * assetu vícekrát.
   */
  const m1 = M.zObrazku(IMG + '/clothes/hats/rare/warrior_helmet.webp?v=20260418');
  eq('master je cesta bez přípony', m1.id, 'clothes/hats/rare/warrior_helmet');
  eq('kategorie', m1.kategorie, 'clothes/hats');
  eq('vzácnost', m1.vzacnost, 'rare');
  eq('obrázek se drží jako cesta', m1.obrazek, '/main/inventory/clothes/hats/rare/warrior_helmet.webp');
  ok('bez dotazu v cestě', !/\?/.test(m1.obrazek));

  console.log('\n[master] bez vzácnosti se za ni nesmí vzít kategorie');
  // `/drinks/luckelixir.webp` vzácnost nemá – „drinks“ je kategorie
  const m2 = M.zObrazku(IMG + '/drinks/luckelixir.webp');
  eq('id', m2.id, 'drinks/luckelixir');
  eq('kategorie', m2.kategorie, 'drinks');
  eq('vzácnost není', String(m2.vzacnost), 'null');
  eq('cizí obrázek se odmítne', String(M.zObrazku('/main/content/man-f.webp')), 'null');

  console.log('\n[staty] procento je KVALITA, číslo je hodnota');
  /*
   * Pořadí čtení je podstatné: procento se musí vytáhnout první a z textu
   * odstranit, jinak by ho `hodnota` sebrala jako své číslo.
   */
  const s1 = M.zeStatu('Válečná helma +1.05% +5 263.24');
  eq('kvalita', s1.kvalita, 1.05);
  eq('hodnota', s1.hodnota, 5263.24);
  const s2 = M.zeStatu('Boty +13.69% Dřevěné podpatky +2 001 661');
  eq('kvalita i u velkých čísel', s2.kvalita, 13.69);
  eq('hodnota s mezerami', s2.hodnota, 2001661);
  const s3 = M.zeStatu('Zbraň Slaměné koště +1 | #11158 na místě');
  eq('bez procenta je kvalita null', String(s3.kvalita), 'null');
  eq('a hodnota se přečte', s3.hodnota, 1);

  console.log('\n[staty] mazlíčci mají tři staty zvlášť');
  const s4 = M.zeStatu('Operativní odstřelovač +1.37% Síla +1 022 Obrana +1 022 Rychlost +1 022');
  eq('kvalita', s4.kvalita, 1.37);
  eq('síla', s4.staty.sila, 1022);
  eq('obrana', s4.staty.obrana, 1022);
  eq('rychlost', s4.staty.rychlost, 1022);

  console.log('\n[název] očistí se od procent, statů a žebříčku');
  eq('helma', M.ocistiNazev('Válečná helma +1.05% +5 263.24'), 'Válečná helma');
  eq('tenisky bez žebříčku',
    M.ocistiNazev('Boty +0.62% Růžové žluté tenisky +21 144 | #4076 na místě 130 000Kč 00:02:05 Nabídnout cenu'),
    'Boty Růžové žluté tenisky');

  console.log('\n[aukce] přečtou se nabídky včetně identity dražby');
  const nab = M.zAukce(AUKCE());
  eq('čtyři nabídky', nab.length, 4);
  const tenisky = nab.find(n => /tenisky/i.test(n.nazev));
  eq('master z obrázku', tenisky.master, 'clothes/shoes/rare/pink_yellow_sneakers');
  eq('lot id z tlačítka', tenisky.lotId, '30835');
  eq('cena', tenisky.cena, 130000);
  eq('kvalita', tenisky.kvalita, 0.62);
  eq('hodnota', tenisky.hodnota, 21144);

  console.log('\n[aukce] „#4076 na místě“ je POŘADÍ, ne identita kusu');
  /*
   * !!! TOHLE JE TA PAST !!!
   * Vypadá to jako ID předmětu, ale text zní „#4076 na místě“ a dražší boty mají
   * NIŽŠÍ číslo (#760) – je to žebříček. Kdyby se to bralo za identitu, spojily
   * by se nesouvisející kusy a historie by lhala.
   */
  eq('pořadí se čte zvlášť', tenisky.poradi, 4076);
  const podpatky = nab.find(n => /podpatky/i.test(n.nazev));
  ok('dražší předmět má nižší pořadí', podpatky.poradi < tenisky.poradi);
  ok('a je to jiný master', podpatky.master !== tenisky.master);

  console.log('\n[aukce] speciální aukce se pozná a odliší');
  // spotřebák: bez kvality, bez statů, jiná cesta i jiný endpoint
  const elixir = nab.find(n => n.specialni);
  ok('je označená', !!elixir);
  eq('má vlastní master', elixir.master, 'drinks/luckelixir');
  eq('bez kvality', String(elixir.kvalita), 'null');
  eq('běžné nabídky speciální nejsou', nab.filter(n => n.specialni).length, 1);

  console.log('\n[aukce] jednotka „mld Kč“ se přizná');
  // „1.7 mld Kč“ – samotné číslo 1.7 by bez jednotky lhalo o devět řádů
  eq('jednotka', podpatky.jednotka, 'mld');

  console.log('\n[inventář] kusy se čtou podle data-item-id');
  const kusy = M.zInventare(INVENTAR());
  eq('pět kusů', kusy.length, 5);
  const helmy = kusy.filter(k => /helma/i.test(k.nazev));
  eq('dvě helmy', helmy.length, 2);
  eq('a jsou to různé kusy', new Set(helmy.map(k => k.instance)).size, 2);
  eq('ale TÝŽ master', new Set(helmy.map(k => k.master)).size, 1);
  eq('s různou kvalitou', helmy.map(k => k.kvalita).sort().join(','), '1.05,3.2');

  console.log('\n[inventář] DRUH statu se bere z třídy ikony, ne z textu');
  /*
   * V textu karty je jen číslo („+1“), co ten bod znamená, je pouze ve třídě
   * `<div class="icon defense">`. Dokud se to nečetlo, evidence věděla „+5 263“,
   * ale ne čeho – a přesně to uživateli chybělo.
   */
  eq('helma dává obranu', helmy[0].stat, 'defense');
  eq('a hodnotu', helmy.find(k => k.kvalita === 1.05).hodnota, 5263.24);
  const zazvor = kusy.find(k => /Zázvorová/.test(k.nazev));
  const bila = kusy.find(k => /Bílá/.test(k.nazev));
  eq('zázvorová kočka obranu', zazvor.stat, 'defense');
  /* Stat je vlastnost PRODUKTU, ne kategorie – dvě kočky, dva různé staty. */
  eq('bílá kočka rychlost', bila.stat, 'speed');
  const karta157455 = kusy.find(k => /odstřelovač/i.test(k.nazev));
  ok('karta má všechny tři staty pojmenované',
    karta157455.staty && karta157455.staty.sila === 1022
    && karta157455.staty.obrana === 1022 && karta157455.staty.rychlost === 1022);
  ok('a druh statu jediný nemá', !karta157455.stat);

  console.log('\n[uložení] aukce se zapíše, stejná dražba se AKTUALIZUJE');
  /*
   * Bez toho by z jednoho lotu vzniklo tolik záznamů, kolikrát se aukce přečetla
   * – při čtení každé tři minuty by to zaplnilo strop za půl hodiny.
   */
  const r1 = await M.ulozAukci(nab, 1000);
  eq('nové nabídky', r1.novych, 4);
  const r2 = await M.ulozAukci(nab, 2000);
  eq('podruhé nic nového', r2.novych, 0);
  eq('jen aktualizace', r2.aktualizovanych, 4);
  const p1 = M.prehled('clothes/shoes/rare/pink_yellow_sneakers');
  eq('u produktu je jediná nabídka', p1.nabidky.length, 1);
  eq('a pamatuje si první výskyt', p1.nabidky[0].prvni, 1000);
  eq('i poslední čtení', p1.nabidky[0].at, 2000);

  console.log('\n[uložení] inventář zapíše kusy pod master');
  const r3 = await M.ulozInventar(kusy, 3000);
  eq('pět nových kusů', r3.novych, 5);
  const ph = M.prehled('clothes/hats/rare/warrior_helmet');
  eq('dva kusy pod jedním produktem', ph.pocetKusu, 2);
  eq('nejlepší kvalita', ph.nejlepsiKvalita, 3.2);
  eq('nejhorší kvalita', ph.nejhorsiKvalita, 1.05);
  eq('a řadí se od nejlepšího', ph.kusy[0].kvalita, 3.2);
  eq('obrázek u masteru je', ph.obrazek, '/main/inventory/clothes/hats/rare/warrior_helmet.webp');

  console.log('\n[uložení] opakované čtení inventáře kusy nezdvojí');
  const r4 = await M.ulozInventar(kusy, 4000);
  eq('žádný nový', r4.novych, 0);
  eq('pořád dva kusy', M.prehled('clothes/hats/rare/warrior_helmet').pocetKusu, 2);

  console.log('\n[cena] ruční uložení – aukce a inventář se spojit nedají');
  /*
   * Aukce `data-item-id` nemá, takže koupený kus se v inventáři automaticky
   * nedohledá. Přiřazení ke kusu je proto rozhodnutí uživatele, ne odhad.
   */
  const c = await M.ulozCenu('clothes/shoes/rare/pink_yellow_sneakers',
    { cena: 130000, kvalita: 0.62, hodnota: 21144, poznamka: 'z aukce' }, 5000);
  eq('cena se uložila', c.cena, 130000);
  eq('i s kvalitou', c.kvalita, 0.62);
  const p2 = M.prehled('clothes/shoes/rare/pink_yellow_sneakers');
  eq('je u produktu', p2.ceny.length, 1);
  eq('nepovinná vazba na kus je prázdná', String(p2.ceny[0].instance), 'null');

  let chyba = null;
  try { await M.ulozCenu('x', { cena: 0 }); } catch (e) { chyba = e.message; }
  ok('nulová cena se odmítne', /kladné/.test(String(chyba)));

  console.log('\n[srovnání] cena se přepočítá na procento kvality');
  /*
   * Přímé srovnání cen nemá smysl: viděné tenisky za 130 tis. měly +0,62 %,
   * podpatky za 1,7 mld měly +13,69 %. Bez přepočtu by to vypadalo, že podpatky
   * jsou 13 000× dražší kvůli značce.
   */
  ok('na procento se spočítá', p2.naProcento > 0);
  eq('a je to cena/kvalita', Math.round(p2.naProcento), Math.round(130000 / 0.62));

  console.log('\n[seznam] hledání, řazení a „jen své“');
  const vse = M.seznam();
  ok('produktů je víc než jeden', vse.length >= 5);
  const jenSve = M.seznam({ jenSve: true });
  ok('„jen své“ vrátí jen to, co mám v inventáři', jenSve.every(p => p.pocetKusu > 0));
  ok('a je jich méně', jenSve.length < vse.length);
  const hledani = M.seznam({ query: 'helma' });
  eq('hledání podle názvu', hledani.length, 1);
  eq('hledání podle vzácnosti najde víc', M.seznam({ query: 'rare' }).length >= 3, true);
  const podleKusu = M.seznam({ sort: 'kusy' });
  ok('řazení podle počtu kusů', podleKusu[0].pocetKusu >= podleKusu[podleKusu.length - 1].pocetKusu);

  console.log('\n[stat u produktu] pojmenuje se česky a dědí se na dražby');
  const phs = M.prehled('clothes/hats/rare/warrior_helmet');
  eq('produkt si stat pamatuje', phs.stat, 'defense');
  eq('a umí ho česky', phs.statNazev, 'obrana');
  /*
   * Aukce `.rank.bottom` NEMÁ (v živé hře nula výskytů), takže druh statu se u
   * dražby dá vzít jedině z produktu, jak jsme ho jednou viděli v inventáři.
   */
  eq('kus zná svůj stat', phs.kusy[0].stat, 'defense');

  console.log('\n[cena za bod statu] to hlavní číslo při nákupu');
  await M.ulozCenu('clothes/hats/rare/warrior_helmet',
    { cena: 1000000, kvalita: 1.05, hodnota: 5000, instance: '158226' });
  const phc = M.prehled('clothes/hats/rare/warrior_helmet');
  eq('cena za bod statu', Math.round(phc.naBodStatu), 200);
  eq('a u záznamu taky', Math.round(phc.ceny.find(c => c.cena === 1000000).zaBod), 200);
  const podleBodu = M.seznam({ sort: 'bodStatu' });
  /*
   * Tenisky za 130 tis. dávaly +21 144, tedy 6,15 Kč za bod; helma za milion dává
   * 5 000, tedy 200 Kč za bod. Poslední nabídka by řekla, že helma je levnější –
   * cena za bod statu říká pravdu.
   */
  eq('řadí se od nejlevnějšího bodu', podleBodu[0].id,
    'clothes/shoes/rare/pink_yellow_sneakers');
  eq('helma je dražší za bod', Math.round(
    podleBodu.find(x => x.id === 'clothes/hats/rare/warrior_helmet').naBodStatu), 200);
  ok('produkty bez ceny jsou až na konci',
    podleBodu[podleBodu.length - 1].naBodStatu == null);

  console.log('\n[souhrn] čísla do hlavičky karty');
  const s = M.souhrn();
  ok('produkty', s.produktu >= 5);
  eq('kusů', s.kusu, 5);
  eq('cen', s.cen, 2);

  console.log('\n[staty všude] nese je KAŽDÝ záznam, ne jen kus z inventáře');
  {
    const id = 'clothes/hats/rare/warrior_helmet';
    const ph = M.prehled(id);
    eq('produkt zná druh statu', ph.stat, 'defense');

    /* kus z inventáře */
    ok('kus má stat', ph.kusy.every(k => k.stat === 'defense'));

    /*
     * Dražba druh statu neuvádí – musí se do záznamu propsat z produktu. Bez toho
     * by v CSV a po smazání produktu zůstalo číslo bez významu.
     */
    await M.ulozAukci([{ master: id, lotId: 'L-STAT', cena: 500000,
      kvalita: 2, hodnota: 9000, nazev: 'Válečná helma' }], 9000);
    const ph2 = M.prehled(id);
    const nab = ph2.nabidky.find(n => n.lotId === 'L-STAT');
    eq('dražba dostala stat z produktu', nab.stat, 'defense');
    eq('a hodnotu si drží', nab.hodnota, 9000);

    /* uložená cena */
    await M.ulozCenu(id, { cena: 400000, kvalita: 2, hodnota: 9000 });
    const cena = M.prehled(id).ceny.find(c => c.cena === 400000);
    eq('cena má stat', cena.stat, 'defense');

    /* ručně přidaný kus – stat se dá zadat i vybrat z produktu */
    await M.pridejKus(id, { instance: 'RUCNI-1', kvalita: 1, hodnota: 100 });
    eq('ruční kus zdědil stat produktu',
      M.prehled(id).kusy.find(k => k.instance === 'RUCNI-1').stat, 'defense');
    await M.pridejKus(id, { instance: 'RUCNI-2', kvalita: 1, hodnota: 100, stat: 'speed' });
    eq('a zadaný stat má přednost',
      M.prehled(id).kusy.find(k => k.instance === 'RUCNI-2').stat, 'speed');
  }

  console.log('\n[staty všude] karta si drží pojmenovanou trojici i na produktu');
  {
    const karta = M.prehled('cards/rare/sniper_operative');
    ok('produkt karty má staty', karta && karta.staty
      && karta.staty.sila === 1022 && karta.staty.obrana === 1022);
    ok('ale jediný stat nemá (a nemá si ho vymýšlet)', !karta.stat);
  }

  console.log('\n[CSV] jeden řádek na kus, nabídku i cenu');
  const csv = M.csv();
  const radky = csv.trim().split('\n');
  ok('má hlavičku', /^co;produkt;nazev/.test(radky[0]));
  ok('a sloupce statů', /;stat;hodnota;sila;obrana;rychlost;/.test(radky[0]));
  ok('u kusu je stat vypsaný česky',
    radky.some(r => /^kus;clothes\/hats\/rare\/warrior_helmet;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;obrana;/.test(r)));
  ok('obsahuje kus', radky.some(r => /^kus;clothes\/hats\/rare\/warrior_helmet/.test(r)));
  ok('obsahuje nabídku', radky.some(r => /^nabidka;/.test(r)));
  ok('obsahuje cenu', radky.some(r => /^cena;/.test(r)));

  console.log('\n[mazání] smaže se všechno');
  await M.smaz();
  eq('nic nezbylo', M.souhrn().produktu, 0);

  console.log('\n[strop] nabídek u produktu se drží jen tolik, kolik má smysl');
  const hodne = [];
  for (let i = 0; i < M.NABIDEK_MAX + 15; i++) {
    hodne.push({ master: 'weapons/common/1._straw_broom', nazev: 'Koště',
      obrazek: '/main/inventory/weapons/common/1._straw_broom.webp',
      lotId: String(90000 + i), cena: 1000 + i, kvalita: 1 });
  }
  await M.ulozAukci(hodne, 6000);
  eq('nad strop se nedrží', M.prehled('weapons/common/1._straw_broom').nabidky.length, M.NABIDEK_MAX);

  console.log('\n[ruční přidání] produkt se dá založit i bez sběru');
  /*
   * !!! BEZ TOHOHO SE SEZNAM PLNIL JEN SÁM !!!
   * Co v aukci neproletělo a v inventáři není (nebo se z něj nepřečetlo), by se
   * do evidence nedostalo NIKDY a nešlo by k tomu vést ani cenu. Uživatel na to
   * narazil hned: kartu viděl, ale produkt do ní nešlo přidat.
   */
  await M.smaz();
  const r1n = await M.pridejProdukt({ nazev: 'Válečná helma' });
  ok('založilo se', r1n.novy);
  eq('a je to ruční master', r1n.master, 'rucne/valecna-helma');
  ok('což se přiznává', r1n.rucne);
  eq('je v seznamu', M.seznam({ query: 'helma' }).length, 1);

  console.log('\n[ruční přidání] diakritika se v označení rozloží');
  // bez rozkladu by z „Válečná helma“ vzniklo „v-le-n-helma“
  eq('slug', M.slug('Válečná helma +1,05 %'), 'valecna-helma-1-05');
  eq('a Žluťoučký kůň taky', M.slug('Žluťoučký kůň'), 'zlutoucky-kun');

  console.log('\n[ruční přidání] s cestou obrázku se SPOJÍ se sběrem');
  /*
   * Tohle je ta podstatná část: master se bere z cesty obrázku, takže ruční
   * záznam a to, co později najde sběr v aukci, je TÝŽ produkt. Bez cesty
   * zůstane `rucne/…` a sběr o něm nikdy nebude vědět.
   */
  const r2n = await M.pridejProdukt({ nazev: 'Moje helma',
    obrazek: IMG + '/clothes/hats/rare/warrior_helmet.webp?v=1' });
  eq('master je z obrázku', r2n.master, 'clothes/hats/rare/warrior_helmet');
  ok('a není označený jako ruční', !r2n.rucne);
  const pRucni = M.prehled('clothes/hats/rare/warrior_helmet');
  eq('kategorie se doplnila sama', pRucni.kategorie, 'clothes/hats');
  eq('i vzácnost', pRucni.vzacnost, 'rare');
  // a teď to najde sběr – musí se to spojit, ne zdvojit
  await M.ulozInventar(M.zInventare(INVENTAR()), 7000);
  eq('je to jeden produkt, ne dva',
    M.seznam().filter(x => /warrior_helmet/.test(x.id)).length, 1);
  eq('a žádný „rucne/moje-helma“ nevznikl',
    M.seznam().filter(x => /^rucne\/moje/.test(x.id)).length, 0);
  eq('a kusy ze sběru se doplnily',
    M.prehled('clothes/hats/rare/warrior_helmet').pocetKusu, 2);

  console.log('\n[ruční přidání] bez názvu to nejde');
  let chybaN = null;
  try { await M.pridejProdukt({ nazev: '  ' }); } catch (e) { chybaN = e.message; }
  ok('odmítne se', /název/.test(String(chybaN)));

  console.log('\n[ruční kus] dá se přidat ke svému produktu');
  const rk = await M.pridejKus('rucne/valecna-helma', { kvalita: 2.5, hodnota: 1234 });
  ok('přidal se', rk.novy);
  ok('a má vlastní označení', /^r\d+/.test(rk.instance));
  const ph2 = M.prehled('rucne/valecna-helma');
  eq('je u produktu', ph2.pocetKusu, 1);
  eq('s kvalitou', ph2.kusy[0].kvalita, 2.5);
  // vlastní označení: dva ruční kusy se nesmí přebít
  const rk2 = await M.pridejKus('rucne/valecna-helma', { kvalita: 1.1 }, 999);
  ok('druhý kus je jiný', rk2.instance !== rk.instance);
  eq('takže jsou dva', M.prehled('rucne/valecna-helma').pocetKusu, 2);
  let chybaK = null;
  try { await M.pridejKus('neexistuje', { kvalita: 1 }); } catch (e) { chybaK = e.message; }
  ok('k neznámému produktu to nejde', /není/.test(String(chybaK)));

  console.log('\n[mazání] ruční záznam se dá zadat i špatně, tak jde smazat');
  eq('kus se smaže', await M.smazKus('rucne/valecna-helma', rk.instance), true);
  eq('a zbyl jeden', M.prehled('rucne/valecna-helma').pocetKusu, 1);
  eq('produkt se smaže', await M.smazProdukt('rucne/valecna-helma'), true);
  eq('a je pryč', String(M.prehled('rucne/valecna-helma')), 'null');
  eq('neexistující se smazat nedá', await M.smazProdukt('neexistuje'), false);

  console.log('\n[sběr] v nemocnici a ve vězení se nečte');
  /*
   * Změřeno naživo: `/inventory` i aukce v tom stavu vrátí **404** s tělem
   * `{"errors":"Momentálně ležíš v nemocnici…"}`. Čas posledního čtení se přitom
   * NESMÍ posunout, ať se to zkusí hned, jak bude z čeho.
   */
  await CMC.store.patch('read', { marketSbirat: true });
  const volani = [];
  CMC.parse.apiGet = async url => {
    volani.push(url);
    return { status: 404,
      raw: '{"errors":"Momentálně ležíš v nemocnici. Budeš tam ještě 12 minut"}' };
  };
  CMC.jail = { blocked: () => false, inText: raw => /ležíš v nemocnici/.test(raw) };
  await M.smaz();
  const T0 = 10 * 60 * 60 * 1000;      // dost vysoko nad oba intervaly
  const nic = await M.zkontrolujObcas(T0);
  eq('nic se nezapsalo', String(nic), 'null');
  eq('a evidence zůstala prázdná', M.souhrn().produktu, 0);
  ok('ale zkusilo se to', volani.length > 0);
  // podruhé to musí zkusit ZNOVU (čas se neposunul)
  volani.length = 0;
  await M.zkontrolujObcas(T0 + 1);
  ok('zkouší to znovu, čas se neposunul', volani.length > 0);

  console.log('\n[sběr] když je hra v pořádku, zapíše se');
  CMC.parse.apiGet = async url => ({ status: 200,
    raw: /show\/2$/.test(url) ? AUKCE() : INVENTAR() });
  const neco = await M.zkontrolujObcas(T0 + 60 * 60 * 1000);
  ok('něco se zapsalo', !!neco);
  ok('aukce', !!(neco && neco.aukce));
  ok('inventář', !!(neco && neco.inventar));
  ok('produkty vznikly', M.souhrn().produktu >= 5);

  console.log('\n[sběr] blokuje ho vězení i captcha');
  CMC.jail = { blocked: () => true, inText: () => false };
  eq('ve vězení se nečte', String(await M.zkontrolujObcas(T0 + 2 * 60 * 60 * 1000)), 'null');
  CMC.jail = { blocked: () => false, inText: () => false };
  CMC.captcha = { blokuje: () => true };
  eq('s captchou se nečte', String(await M.zkontrolujObcas(T0 + 2 * 60 * 60 * 1000 + 1)), 'null');
  delete CMC.captcha;

  console.log('\n[sběr] vypnutý sběr nečte vůbec nic');
  await CMC.store.patch('read', { marketSbirat: false });
  volani.length = 0;
  eq('nic', String(await M.zkontrolujObcas(T0 + 3 * 60 * 60 * 1000)), 'null');
  eq('a ani se nezkusilo', volani.length, 0);

  console.log('\n[karta] vykreslí se a ukáže obrázek masteru');
  await CMC.store.patch('read', { marketSbirat: true });
  const el = globalThis.document.createElement('div');
  CMC.tabs.trh.render(el);
  const txt = (el.textContent || '').replace(/\s+/g, ' ');
  ok('karta je zaregistrovaná', !!CMC.tabs.trh);
  eq('a jmenuje se Trh', CMC.tabs.trh.label, 'Trh');
  ok('vypíše souhrn', /Produktů/.test(txt));
  ok('a je tam tlačítko na ruční přidání', /Přidat produkt/.test(txt));
  ok('a seznam produktů', /helma|Koště|tenisky/i.test(txt));
  const img = el.querySelector('img.cmc-trh-ikona');
  ok('obrázek masteru je vykreslený', !!img);
  ok('a míří na CDN hry', /narco\.lt\/main\/inventory\//.test(img.getAttribute('src')));
  ok('bez cache-bustingu', !/\?/.test(img.getAttribute('src')));

  console.log('\n[napojení] modul je v manifestu a má výchozí klíč');
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  ok('je v manifestu', man.content_scripts[0].js.includes('src/market.js'));
  ok('karta taky', man.content_scripts[0].js.includes('src/tab-trh.js'));
  const psrc = fs.readFileSync(path.join(EXT, 'src/panel.js'), 'utf8');
  ok('a je v pořadí záložek', /'trh'/.test(psrc));
  const ssrc = fs.readFileSync(path.join(EXT, 'src/store.js'), 'utf8');
  ok('storage má klíč market', /market:\s*\{\s*produkty/.test(ssrc));

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ evidence předmětů drží');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
