/* =============================================================================
 * vyrobny.js – čtyři výrobny surovin: sebrat, dokoupit materiál, spustit
 *
 * Budovy a jejich cyklus (proměřeno naživo, ne odhad):
 *
 *   #21 Laboratoř pervitinu  methlab/collect/<id>        → methlab/boil
 *       30 pilulek na chemika, „Tablety proti nachlazení“, 0,40 Kč/ks
 *   #24 Palírna whisky       whiskydistillery/harvest/<id> → …/makewhisky
 *       8 kg pšenice na sud, 2,50 Kč/kg
 *   #27 Konopná farma        agriculture/harvest/<id>    → …/plant-pot
 *       100 semen na hektar, 0,10 Kč/ks
 *   #29 Pivovar              beerbrewery/harvest/<id>    → …/boilBeer
 *       15 kg chmele (0,60) A 30 kg ječmene (0,20) na sud – DVĚ suroviny
 *
 * Materiál se platí ŠPINAVÝMI penězi. Když nejsou, zkusí se dopravit z banky:
 * čisté peníze jdou na špinavé v kurzu 1:1, takže se na tom nic neztratí (na
 * rozdíl od praní za 30 %). Zajišťuje to `bank.zajisti()` a převede se PŘESNĚ
 * to, co chybí – nic pro zásobu.
 *
 * !!! PŘÍMÝ POŽADAVEK SERVER NEPŘIJME !!!
 * `POST /map/building/methlab/collect/68933` vrátí 404 a „Spausk per mygtuką,
 * o ne per nuorodą!“ (klikni na tlačítko, ne na odkaz). Akce se proto provádí
 * jako u šachet: fragment budovy se vloží do herního okna mimo obraz a klikne
 * se na SKUTEČNÉ tlačítko, takže požadavek pošle hra sama.
 *
 * !!! JEDNO VOLÁNÍ = JEDNA ÚLOHA !!!
 * `kolo()` udělá vždycky JEDNU věc a skončí – sebere, nebo dorovná peníze, nebo
 * koupí JEDNU surovinu, nebo spustí. Nic se nespojuje do jednoho kroku.
 *
 * Je to schválně: fronta (`queue.js`) řadí akce po jedné a mezi nimi nechává
 * mezeru, takže rozdělené úlohy se navzájem nerozhodí a v liště je vidět, co se
 * zrovna děje. Pivovar se dvěma surovinami tak zabere dva tiky místo jednoho,
 * což nevadí – tik chodí každých pět sekund.
 *
 * !!! NEDOSTATEK PENĚZ NESMÍ ZASTAVIT VÝROBU !!!
 * Materiál se kupuje na PLNOU kapacitu, ale když na to nejsou peníze, výroba
 * se přesto rozjede s tím, co na skladě je. Dřív se v tu chvíli vracel jen
 * „nedostatek“ a výrobna stála – naživo tak pivovar čekal na nákup chmele za
 * 918 tis., přestože měl zásoby na 25 600 sudů, které mohl vařit hned.
 *
 * Pořadí je tedy: sebrat → zkusit dokoupit → SPUSTIT, i když se nekoupilo.
 *
 * !!! KAPACITA JE JINÁ VĚC NEŽ MATERIÁL !!!
 * Kolik se dá vyrobit, určuje volná kapacita (sudy, hektary, chemici) – a ta
 * se uvolní teprve SBĚREM. Materiál na plnou kapacitu se tedy kupuje až po
 * sběru, jinak by se koupilo na kapacitu, která ještě není volná. Pořadí
 * jednoho kola je proto: **sebrat → dokoupit → spustit**.
 *
 * !!! TLAČÍTKŮM V OKNĚ NEJDE VĚŘIT – HLÍDÁ SE ODPOČET !!!
 * Pivovar nabízí „Vařit pivo“, i když fermentace ještě běží, a hra pak požadavek
 * odmítne litevským „Verslas visdar dirba, turi sulaukti kada baigs“ (podnik
 * ještě pracuje). Ostatní tři budovy v tom stavu tlačítko neukážou, takže je to
 * vada jen u pivovaru – ale hlídá se to u všech.
 *
 * Rozhoduje `.working` v sekci `#land`: `data-time` (nebo `data-timedone`
 * mínus `data-timenow`) říká, kolik sekund zbývá. Kladné číslo = ještě běží,
 * nula a záporné = hotovo (záporné znamená, že je to po termínu a odpařuje se).
 *
 * !!! PŘEDVYPLNĚNÉ MNOŽSTVÍ V NÁKUPU NEJDE VĚŘIT !!!
 * U konopí hra do pole předvyplní přesně chybějící počet semen (33 165 000),
 * u whisky nechá pole prázdné, i když pšenice na plnou kapacitu NESTAČÍ
 * (827 536 kg proti potřebným 2 653 200). Chybějící množství se proto počítá
 * tady: `kapacita × naJednotku − sklad`.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cislo = t => {
    const m = String(t || '').match(/-?[\d][\d\s  ]*(?:[.,]\d+)?/);
    return m ? (NS.parse.toNum(m[0]) || 0) : null;
  };

  /**
   * Popis jedné výrobny. `kapacitaRe` může být víc výrazů, ale jsou to
   * ALTERNATIVY – vyhrává první nalezený. Minimum z víc čísel tu být nesmí,
   * hra v témže okně píše i čísla odvozená ze zásob (viz #21).
   */
  const VYROBNY = [
    {
      id: 21, nazev: 'Pervitin', zkratka: '💊',
      sberRe: /methlab\/collect/, startRe: /methlab\/boil/,
      jednotka: 'chemik',
      /*
       * !!! „MŮŽE ZDE PRACOVAT X CHEMIKŮ“ NENÍ KAPACITA !!!
       * Je to `floor(pilulky / 30)`, tedy DŮSLEDEK zásob – ověřeno dvakrát:
       * naživo 0 pilulek → „Může zde pracovat 0 chemiků“, a ve fixtuře
       * 989 280 / 30 = 32 976, což je přesně to číslo. Kapacita budovy je
       * `Dostupní chemici`.
       *
       * Dokud se z těch dvou čísel bralo minimum, kapacita nikdy nepřerostla
       * to, na co už materiál byl – takže si laboratoř NIKDY nemohla dokoupit
       * pilulky. S nulou to bylo úplné zacyklení: nekoupí, protože nemá.
       */
      kapacitaRe: [/Dostupní chemici:?\s*([\d\s  ]+)/i],
      suroviny: [{
        nazev: 'pilulky', naJednotku: 30, cena: 0.4,
        skladRe: /Tablety proti nachlazení:?\s*([\d\s  ]+)/i,
        nakupRe: /methlab\/buy-coldpills/
      }]
    },
    {
      id: 24, nazev: 'Whisky', zkratka: '🥃',
      sberRe: /whiskydistillery\/harvest/, startRe: /whiskydistillery\/makewhisky/,
      jednotka: 'sud',
      kapacitaRe: [/Prázdné a nepoužité sudy:?\s*([\d\s  ]+)/i],
      suroviny: [{
        nazev: 'pšenice', naJednotku: 8, cena: 2.5,
        skladRe: /Pšenice:?\s*([\d\s  ]+)\s*kg/i,
        nakupRe: /whiskydistillery\/buyWheat/
      }]
    },
    {
      id: 27, nazev: 'Konopí', zkratka: '🌿',
      sberRe: /agriculture\/harvest/, startRe: /agriculture\/plant/,
      jednotka: 'ha',
      kapacitaRe: [/Neosazené hektary:?\s*([\d\s  ]+)/i],
      suroviny: [{
        nazev: 'semena', naJednotku: 100, cena: 0.1,
        skladRe: /Semena konopí:?\s*([\d\s  ]+)/i,
        nakupRe: /agriculture\/buy-potseeds/
      }]
    },
    {
      id: 29, nazev: 'Pivo', zkratka: '🍺',
      sberRe: /beerbrewery\/harvest/, startRe: /beerbrewery\/boilBeer/,
      jednotka: 'sud',
      kapacitaRe: [/Prázdné a nepoužité sudy:?\s*([\d\s  ]+)/i],
      // pivovar potřebuje DVĚ suroviny – obě se hlídají zvlášť
      suroviny: [
        {
          nazev: 'chmel', naJednotku: 15, cena: 0.6,
          skladRe: /Chmel\s*:?\s*([\d\s  ]+)\s*kg/i,
          nakupRe: /beerbrewery\/buyHops/
        },
        {
          nazev: 'ječmen', naJednotku: 30, cena: 0.2,
          skladRe: /Ječmen\s*:?\s*([\d\s  ]+)\s*kg/i,
          nakupRe: /beerbrewery\/buyBarley/
        }
      ]
    }
  ];

  const URL_OF = id => '/map/building/show/' + id;
  const def = id => VYROBNY.find(v => v.id === id) || null;

  /* ---- čtení stavu --------------------------------------------------------- */

  const spinave = () => {
    const el = document.querySelector('.value.renew-dirty_money');
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /**
   * Kolik sekund zbývá do konce výroby. `null` = nic neběží.
   *
   * Záporné číslo znamená hotovo a po termínu – to je normální stav, ve kterém
   * se sbírá (a hra za zdržení odpařuje procenta), takže se nesmí brát jako
   * „ještě běží“.
   */
  function zbyva(d) {
    const kde = d.querySelector('#land') || d;
    const w = kde.querySelector('.working');
    if (!w) return null;
    const t = NS.parse.toNum(w.getAttribute('data-time'));
    if (t != null && Number.isFinite(t)) return t;
    const done = NS.parse.toNum(w.getAttribute('data-timedone'));
    const now = NS.parse.toNum(w.getAttribute('data-timenow'));
    return (done != null && now != null) ? done - now : null;
  }

  /** Přečte jednu výrobnu: co se dá udělat, kolik je kapacity a materiálu. */
  async function stav(id) {
    const v = def(id);
    if (!v) throw new Error('neznámá výrobna ' + id);
    const { status, raw } = await NS.parse.apiGet(URL_OF(id));
    if (status !== 200) throw new Error(v.nazev + ': nejde přečíst (HTTP ' + status + ')');
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const d = document.createElement('div');
    d.innerHTML = raw;
    const text = (d.textContent || '').replace(/\s+/g, ' ');
    const akce = [...d.querySelectorAll('[action]')];
    const ma = re => akce.some(e => re.test(e.getAttribute('action') || ''));

    /*
     * Kapacita: výrazy jsou ALTERNATIVY, vyhrává první, který se najde. Když se
     * nenajde nic, je to null – „nevím“, ne „nula“, a nic se nespouští.
     *
     * !!! MINIMUM ZE VÍC ČÍSEL TU BÝT NESMÍ !!!
     * Dřív se z nalezených čísel bralo `Math.min`. Vypadá to opatrně, ale hra
     * v témže okně píše i čísla ODVOZENÁ ZE ZÁSOB („Může zde pracovat X
     * chemiků“ = pilulky/30). Minimum s takovým číslem znamená, že kapacita
     * nikdy nepřeroste to, na co už materiál je – a modul si proto NIKDY
     * nedokoupí. U laboratoře to při nule pilulek uvázlo úplně.
     */
    let kapacita = null;
    for (const re of v.kapacitaRe) {
      const m = text.match(re);
      const c = m ? cislo(m[1]) : null;
      if (c != null) { kapacita = c; break; }
    }

    const suroviny = v.suroviny.map(s => {
      const m = text.match(s.skladRe);
      const sklad = m ? cislo(m[1]) : null;
      const potreba = kapacita != null ? kapacita * s.naJednotku : null;
      const chybi = (potreba != null && sklad != null)
        ? Math.max(0, potreba - sklad) : null;
      return {
        ...s, sklad, potreba, chybi,
        // co to bude stát ŠPINAVÝCH – materiál se platí jimi
        cenaChybejicich: chybi != null ? Math.ceil(chybi * s.cena) : null,
        maNakup: ma(s.nakupRe)
      };
    });

    /*
     * Dokud běží odpočet, nesmí se sbírat ani spouštět – i kdyby tlačítko
     * v okně bylo (pivovar ho tam má, viz hlavička).
     */
    const zbyvaS = zbyva(d);
    const bezi = zbyvaS != null && zbyvaS > 0;

    const chybiCelkem = suroviny.reduce((s, x) => s + (x.cenaChybejicich || 0), 0);
    // ať banka ví, kolik špinavých nesmí vyprat (viz `potrebaSpinavych`)
    potrebaKes.set(id, { kc: bezi ? 0 : chybiCelkem, stoji: !bezi, at: Date.now() });

    /*
     * Dokdy se budovou nemusíme zabývat. Zapisuje se TADY, a ne v `kolo()`, aby
     * paměť držel čerstvou každý, kdo budovu přečte – včetně lišty. Jinak by
     * jeden čtenář viděl něco jiného než druhý.
     */
    if (bezi && zbyvaS > 0) {
      /*
       * Věří se odpočtu hry v plné délce – i když jsou to hodiny. Kdyby budovu
       * uživatel sebral RUČNĚ ve hře, automatika o ní do konce odpočtu neví;
       * jenže lišta si stav čte sama (`tlacitko`), takže se to při otevřené liště
       * srovná, a bez ní se stejně nic neděje.
       */
      beziDo.set(id, Date.now() + zbyvaS * 1000 - REZERVA_MS);
    } else {
      beziDo.delete(id);
    }
    ulozPamet();

    return {
      // surové HTML si bere `kolo()`, ať se budova nestahuje na úlohu dvakrát
      raw,
      id, nazev: v.nazev, zkratka: v.zkratka, jednotka: v.jednotka,
      kapacita, suroviny, zbyvaS, bezi,
      lzeSebrat: ma(v.sberRe) && !bezi,
      lzeSpustit: ma(v.startRe) && !bezi,
      // co okno nabízí, i když to zrovna nejde – kvůli diagnostice
      nabiziSber: ma(v.sberRe),
      nabiziStart: ma(v.startRe),
      chybiCelkem,
      // kolik jednotek se dá spustit z toho, co je na skladě
      naSklade: Math.min(...suroviny.map(s =>
        s.sklad != null ? Math.floor(s.sklad / s.naJednotku) : Infinity))
    };
  }

  /* ---- kolik špinavých je potřeba (čte banka) ------------------------------ */

  /*
   * !!! PRANÍ A PŘEVOD JDOU PROTI SOBĚ – A JEDNA OBRÁTKA STOJÍ 30 % !!!
   * Materiál se platí ŠPINAVÝMI, banka drží ČISTÉ. Převod čisté→špinavé je 1:1,
   * ale praní špinavé→čisté bere 30 %. Ve frontě přitom běží banka PŘED
   * výrobnami, takže bez téhle brzdy vzniká mlýnek:
   *
   *   tik N    výrobny převedou čisté → špinavé (1:1)
   *   tik N+1  banka je vypere zpátky na čisté (−30 %)
   *   tik N+2  výrobny je zase převedou…
   *
   * A pozor, ta smyčka existuje i BEZ převodu: stačí, že banka vypere špinavé,
   * které výrobny vzápětí potřebují, a ty si je musí převést zpátky.
   *
   * Zapamatovat si „co jsem právě převedl“ by řešilo jen první případ. Správné
   * je říct bance, kolik špinavých je právě POTŘEBA – ta pak nikdy nepere pod
   * tuhle hranici a je to samoopravné, bez časovačů a expirací.
   *
   * Čísla se neberou zvlášť: `stav()` je počítá tak jako tak při každém tiku
   * výroben, takže se jen odloží stranou a banka je čte zadarmo. Každý tik
   * obslouží jednu budovu, takže se celý obrázek obnoví za čtyři tiky (~20 s);
   * proto ta tolerance ve stáří záznamu.
   */
  const potrebaKes = new Map();
  const POTREBA_TTL = 5 * 60 * 1000;

  /**
   * Stojí některá výrobna? Tedy: je odeslané všechno, nebo něco čeká?
   *
   * Podle tohohle banka pozastavuje praní. Vrací `false`, když je automatika
   * výroben vypnutá (pak se nic nekupuje, takže není co chránit) a taky když
   * ještě není z čeho soudit – čerstvě načtená karta nesmí praní vypnout na
   * základě prázdné evidence.
   */
  function necoStoji() {
    if (!autoSet()) return false;
    const ted = Date.now();
    let vim = false;
    for (const [, z] of potrebaKes) {
      if (ted - z.at >= POTREBA_TTL) continue;
      vim = true;
      if (z.stoji) return true;
    }
    return false;
  }

  /** Kolik ŠPINAVÝCH peněz výrobny právě potřebují – do popisku, ne k rozhodování. */
  function potrebaSpinavych() {
    if (!autoSet()) return 0;
    const ted = Date.now();
    let soucet = 0;
    for (const [, z] of potrebaKes) {
      if (ted - z.at < POTREBA_TTL) soucet += z.kc || 0;
    }
    return Math.round(soucet);
  }

  /* ---- akce (klik na skutečné tlačítko) ------------------------------------ */

  /**
   * Vloží fragment budovy mimo obraz, klikne na tlačítko podle výrazu a uklidí.
   * Přímý požadavek server odmítá, proto tahle cesta – viz hlavička.
   */
  /**
   * !!! FRAGMENT SE STAHUJE JEDNOU, NE DVAKRÁT !!!
   * `kolo()` si budovu přečte kvůli `stav()` a `klikni()` si ji vzápětí stahovalo
   * ZNOVU – změřeno 2× tentýž `/map/building/show/{id}` na každou úlohu. Byla to
   * čistá ztráta: mezi těmi dvěma čteními je pár milisekund, takže se nic
   * „nezčerstvilo“, jen se čekalo na druhý round-trip a hra dostala dvojnásobek
   * požadavků.
   *
   * `raw` se proto předává. Když se nepředá (ruční tlačítko v liště), přečte se
   * jako dřív – tam žádné čtení předtím není.
   */
  async function klikni(id, kam, priprav, raw) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    if (raw == null) {
      const o = await NS.parse.apiGet(URL_OF(id));
      if (o.status !== 200) {
        throw new Error('budova ' + id + ' nejde přečíst (HTTP ' + o.status + ')');
      }
      raw = o.raw;
    }

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-vyr-box';
    box.innerHTML = raw;
    host.appendChild(box);
    try {
      await sleep(200);
      const el = [...box.querySelectorAll('[action]')]
        .find(e => kam.test(e.getAttribute('action') || ''));
      if (!el) throw new Error('tlačítko v okně není');
      if (priprav) priprav(box, el);
      el.click();
      await sleep(400);
    } finally {
      box.remove();
    }
  }

  /*
   * !!! BĚŽÍCÍ BUDOVU NEMÁ CENU ČÍST ZNOVU !!!
   * `autoTick` projde budovy, dokud jedna něco neudělá – a každá běžící se přitom
   * stáhla ZNOVU, každých pět sekund. Přitom hra sama v `.working` říká, kolik
   * sekund zbývá: když je to 3 000, nemá čtení co přinést dalších 50 minut.
   *
   * Změřeno: se čtyřmi budovami, z nichž tři běží, to bylo 5 požadavků na jeden
   * tik (tři zbytečné + dva na akci) – tedy 60 požadavků za minutu jen za
   * výrobny. Tady se z toho dělá nula.
   *
   * Termín se drží s rezervou (kontroluje se chvilku dřív) a při jakékoli akci se
   * zahodí, aby se stav nedomýšlel z něčeho, co už neplatí.
   */
  const beziDo = new Map();
  /*
   * Kontroluje se chvilku před koncem, ať se nesbírá o tik později – hra za
   * zdržení odpařuje procenta.
   */
  const REZERVA_MS = 5000;

  /**
   * !!! TERMÍN SE UKLÁDÁ, JINAK BY HO SMAZAL KAŽDÝ RELOAD !!!
   * Výroba běží v řádu hodin, takže termín má cenu jen tehdy, když přežije
   * obnovení stránky – a to se navíc děje samo každých 30–60 minut (noční
   * obnovování). V paměti karty by se zahodil a všechno by se přečetlo znovu.
   */
  function nactiPamet() {
    const ulozene = NS.store.get().vyrBeziDo || {};
    for (const [id, kdy] of Object.entries(ulozene)) {
      if (+kdy > Date.now()) beziDo.set(+id, +kdy);
    }
  }

  let pametSpinava = false;
  function ulozPamet() {
    if (pametSpinava) return;
    pametSpinava = true;
    // sloučí se do jednoho zápisu, ať se storage netrápí každým čtením budovy
    setTimeout(() => {
      pametSpinava = false;
      const out = {};
      const ted = Date.now();
      for (const [id, kdy] of beziDo) if (kdy > ted) out[id] = kdy;
      NS.store.put('vyrBeziDo', out).catch(() => {});
    }, 500);
  }

  const zapomen = id => { beziDo.delete(id); ulozPamet(); };
  const zapomenVse = () => { beziDo.clear(); ulozPamet(); };
  /** Dokdy budova prokazatelně pracuje; `null` = nevíme. */
  const beziAz = id => {
    const kdy = beziDo.get(id);
    return kdy && kdy > Date.now() ? kdy : null;
  };

  /*
   * Po každé akci se zapomene, dokdy budova „běží“ – stav se změnil a domýšlet
   * ho z předchozího odpočtu by znamenalo hádat.
   */
  const sebrat = async (id, raw) => { zapomen(id); return klikni(id, def(id).sberRe, null, raw); };
  const spustit = async (id, raw) => { zapomen(id); return klikni(id, def(id).startRe, null, raw); };

  /**
   * Dokoupí chybějící surovinu. Množství se dopisuje do pole `amount` u TÉHOŽ
   * tlačítka – u pivovaru jsou dvě nákupní pole a spolu s nimi skryté
   * `ingredient`, takže se musí vzít to správné, ne první v okně.
   */
  /**
   * !!! PO NÁKUPU MUSÍ NĚCO ZŮSTAT !!!
   * Hra nákup, po kterém by špinavé peníze klesly na NULU, odmítne – a neřekne
   * to nijak: žádný požadavek neodejde a žádná chyba se neobjeví. Rezerva je
   * proto povinná, ne kosmetická.
   */
  const REZERVA_KC = 100;

  /**
   * Kolik jednotek si můžu dovolit. Vrací 0, když ani jedna nejde – volající to
   * pak přizná místo toho, aby klikal naprázdno.
   */
  function kolikKoupit(surovina, mamSpinavych) {
    const chybi = Math.max(0, Math.ceil(surovina.chybi || 0));
    if (!chybi) return 0;
    if (mamSpinavych == null) return chybi;      // nevím kolik mám – nezdržuj
    const cena = surovina.cena > 0 ? surovina.cena : 1;
    const utratitLze = Math.max(0, mamSpinavych - REZERVA_KC);
    return Math.max(0, Math.min(chybi, Math.floor(utratitLze / cena)));
  }

  /**
   * !!! ÚSPĚCH SE MĚŘÍ, NEPŘEDPOKLÁDÁ !!!
   * Tohle jen kliklo a mlčky se vrátilo, takže odmítnutý nákup vypadal jako
   * povedený: v liště svítilo „koupeno pšenice za 9,1 mil. Kč“, zásoba zůstala
   * na nule a peníze na účtu se nepohnuly. Poznat to šlo jedině tak, že se
   * uživatel podivil, proč to pořád chce peníze, které má.
   *
   * Kontroluje se úbytek špinavých, ne zásoba – je to čtení z HUD, tedy bez
   * dalšího požadavku do hry. HUD se překresluje se zpožděním, takže se to zkusí
   * několikrát; a nemusí to sedět na korunu (mezitím může doběhnout praní),
   * takže se hlídá většina očekávané ceny.
   */
  const UBYLO_MIN = 0.9;

  async function koupit(id, surovina, kolik, raw) {
    const kusu = Math.ceil(kolik);
    const cekano = Math.ceil(kusu * (surovina.cena || 0));
    const pred = spinave();

    await klikni(id, surovina.nakupRe, (box, el) => {
      const obal = el.closest('form, .buyIngredient, .box-ins, div') || box;
      const pole = obal.querySelector('input[name=amount]')
        || box.querySelector('input[name=amount]');
      if (!pole) throw new Error('pole s množstvím v okně není');
      pole.value = String(kusu);
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
    }, raw);

    if (pred == null || !(cekano > 0)) return { koupeno: kusu, cena: cekano };

    let po = pred;
    for (let i = 0; i < 6; i++) {
      await sleep(400);
      po = spinave();
      if (po != null && pred - po >= cekano * UBYLO_MIN) break;
    }
    if (po == null || pred - po < cekano * UBYLO_MIN) {
      throw new Error('nákup neproběhl – špinavé se nezmenšily ('
        + NS.fmt.kc(pred, { short: true }) + ' → ' + NS.fmt.kc(po, { short: true })
        + ', čekáno −' + NS.fmt.kc(cekano, { short: true }) + ')');
    }
    return { koupeno: kusu, cena: cekano, skutecne: pred - po };
  }

  /* ---- jedno kolo ---------------------------------------------------------- */

  /**
   * Udělá s výrobnou jednu věc a řekne kterou. Pořadí je dané: sebrat uvolní
   * kapacitu, teprve pak má smysl kupovat materiál na ni, a nakonec spustit.
   */
  async function kolo(id) {
    const doKdy = beziAz(id);
    if (doKdy) {
      return { co: 'nic', popis: null, bezi: true,
        zbyvaS: Math.round((doKdy - Date.now()) / 1000), zPameti: true };
    }

    const s = await stav(id);   // `stav()` si paměť přeskoků udržuje samo

    if (s.bezi) {
      return { co: 'nic', popis: null, bezi: true, zbyvaS: s.zbyvaS };
    }

    // 1) sebrat – uvolní kapacitu, takže musí být první
    if (s.lzeSebrat) {
      await sebrat(id, s.raw);
      await zapis(id, 'sebrano');
      return { co: 'sebráno', popis: s.nazev + ': sebráno' };
    }

    const kupovat = s.suroviny.filter(x => x.chybi > 0 && x.maNakup);
    if (kupovat.length) {
      const mam = spinave();
      const stoji = kupovat.reduce((a, x) => a + x.cenaChybejicich, 0);

      // 2) dorovnat peníze – vlastní úloha, ať je v liště vidět, co se děje
      /*
       * O rezervu se řekne bance NAVÍC. Kdyby se převedlo přesně `stoji`, zbyla
       * by po nákupu nula – a takový nákup hra odmítne (viz `REZERVA_KC`). Takhle
       * se koupí plná dávka a rezerva zůstane.
       */
      if (mam != null && stoji + REZERVA_KC > mam) {
        const z = (NS.bank && NS.bank.zajisti)
          ? await NS.bank.zajisti(stoji + REZERVA_KC) : { ok: false };
        if (z.ok && z.kroky && z.kroky.length) {
          return { co: 'peníze', popis: s.nazev + ': z banky – ' + z.kroky.join(', ') };
        }
        if (!z.ok) {
          /*
           * Peníze nejsou ani v bance. Nekupuje se, ale výroba se rozjede
           * s tím, co na skladě je – stojící výrobna je horší než menší dávka.
           */
          const duvod = s.nazev + ': na materiál '
            + (z.duvod || 'chybí ' + NS.fmt.kc(stoji - mam, { short: true }) + ' špinavých');
          if (s.lzeSpustit && s.kapacita > 0 && s.naSklade >= 1) {
            await spustit(id, s.raw);
            await zapis(id, 'spusteno');
            return {
              co: 'spuštěno',
              popis: s.nazev + ': spuštěno na ' + NS.fmt.num(s.naSklade) + ' '
                + s.jednotka + ' ze zásob – ' + duvod.replace(s.nazev + ': ', '')
            };
          }
          return { co: 'nedostatek', popis: duvod };
        }
      }

      /*
       * 3) koupit JEDNU surovinu – další přijde na řadu v dalším tiku.
       *
       * !!! NIKDY ZA VŠECHNY PENÍZE DO POSLEDNÍ KORUNY !!!
       * Hra nákup, po kterém by zůstala NULA špinavých, odmítne – a neřekne to
       * (žádný požadavek neodejde, žádná chyba). Naživo to vyšlo takhle: palírna
       * potřebovala 3 636 240 kg pšenice za 9 090 600 Kč, špinavých bylo přesně
       * 9 090 600 a nekoupilo se nikdy. Přitom 3 000 000 kg za 7 500 000 prošlo
       * bez řečí, takže o velikost dávky ani o mechaniku nešlo.
       *
       * Vzniklo to spolu s `bank.zajisti()`, které převádí PŘESNĚ chybějící sumu
       * – po nákupu by tedy vždycky zbyla nula. Množství se proto zastropuje tak,
       * aby rezerva zůstala.
       */
      const x = kupovat[0];
      const kolik = kolikKoupit(x, spinave());
      if (!(kolik > 0)) {
        return { co: 'nedostatek',
          popis: s.nazev + ': na ' + x.nazev + ' nezbývá dost špinavých ('
            + NS.fmt.kc(spinave() || 0, { short: true }) + ')' };
      }
      await koupit(id, x, kolik, s.raw);
      await zapis(id, 'koupeno', Math.ceil(kolik * x.cena));
      return {
        co: 'koupeno',
        popis: s.nazev + ': koupeno ' + x.nazev + ' za '
          + NS.fmt.kc(x.cenaChybejicich, { short: true })
          + (kupovat.length > 1 ? ' (zbývá ' + (kupovat.length - 1) + ')' : '')
      };
    }

    // 4) spustit
    if (s.lzeSpustit && s.kapacita > 0) {
      await spustit(id, s.raw);
      await zapis(id, 'spusteno');
      return { co: 'spuštěno', popis: s.nazev + ': spuštěna výroba' };
    }
    return { co: 'nic', popis: null };
  }

  /* ---- evidence ------------------------------------------------------------ */

  async function zapis(id, co, castka) {
    const log = NS.store.get().vyrLog || {};
    const b = { sebrano: 0, spusteno: 0, koupeno: 0, zaMaterial: 0, ...(log[id] || {}) };
    b[co] = (b[co] || 0) + 1;
    if (co === 'koupeno') b.zaMaterial += (castka || 0);
    await NS.store.put('vyrLog', { ...log, [id]: b, lastAt: Date.now() });
  }

  function stats() {
    const log = NS.store.get().vyrLog || {};
    const budovy = VYROBNY.map(v => ({
      id: v.id, nazev: v.nazev, zkratka: v.zkratka,
      sebrano: 0, spusteno: 0, koupeno: 0, zaMaterial: 0, ...(log[v.id] || {})
    }));
    return {
      budovy,
      zaMaterial: budovy.reduce((s, b) => s + b.zaMaterial, 0),
      sebrano: budovy.reduce((s, b) => s + b.sebrano, 0),
      spusteno: budovy.reduce((s, b) => s + b.spusteno, 0),
      lastAt: log.lastAt || null
    };
  }

  const reset = () => NS.store.put('vyrLog', {});

  /* ---- automatika ---------------------------------------------------------- */

  const autoSet = () => NS.store.get().read.vyrAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  let poradi = 0;

  /**
   * Jedno kolo automatiky. Bere se JEDNA výrobna za tik a střídají se – čtyři
   * budovy naráz by znamenaly osm požadavků do hry v jednom okamžiku.
   */
  async function autoTick() {
    if (!autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (!NS.gym.gameHost()) return false;

    // projít je od té, kde se skončilo, ať se všechny dostanou na řadu
    for (let i = 0; i < VYROBNY.length; i++) {
      const v = VYROBNY[(poradi + i) % VYROBNY.length];
      let r;
      try {
        r = await kolo(v.id);
      } catch (e) {
        NS.gym.setStatus('⚠ ' + v.nazev + ': ' + e.message, true);
        poradi = (poradi + i + 1) % VYROBNY.length;
        return false;
      }
      if (r.co !== 'nic') {
        poradi = (poradi + i + 1) % VYROBNY.length;
        NS.gym.setStatus(r.popis, r.co === 'nedostatek');
        NS.gym.collect();
        return r.co !== 'nedostatek';
      }
    }
    return false;
  }

  /* ---- lišta --------------------------------------------------------------- */

  const cache = new Map();
  const TTL = 30000;

  function tlacitko(v, onChange) {
    const zaznam = cache.get(v.id);
    const s = zaznam && Date.now() - zaznam.at < TTL ? zaznam.s : null;
    /*
     * !!! LIŠTA TAKY NEČTE BUDOVU, O KTERÉ VÍME, ŽE PRACUJE !!!
     * Bez tohohle by úspora v automatice byla k ničemu: lišta si každou budovu
     * načítala po 30 s znovu, tedy 8 požadavků za minutu, a to bez ohledu na to,
     * že hra sama říká „ještě 50 minut“. Odpočet do tlačítka se dopočítá
     * z termínu, takže se ani nemá co pokazit.
     */
    if (!s && !beziAz(v.id)) {
      stav(v.id).then(x => { cache.set(v.id, { s: x, at: Date.now() }); onChange(); })
        .catch(() => cache.set(v.id, { s: null, at: Date.now() }));
    }

    const b = document.createElement('button');
    b.type = 'button';
    const co = !s || s.bezi ? null
      : (s.lzeSebrat ? 'sebrat'
        : (s.suroviny.some(x => x.chybi > 0) ? 'koupit'
          : (s.lzeSpustit && s.kapacita > 0 ? 'spustit' : null)));
    const TRIDA = { sebrat: 'cmc-gym-unit-ready', koupit: 'cmc-gym-unit-partial',
      spustit: 'cmc-gym-unit-send' };
    b.className = 'cmc-gym-btn cmc-gym-unit ' + (TRIDA[co] || 'cmc-gym-unit-away');
    b.textContent = v.zkratka + (co === 'sebrat' ? ' ✓' : (s && s.bezi ? ' ⏳' : ''));
    b.disabled = !co;

    b.title = !s ? v.nazev + ': načítám…'
      : v.nazev + ' (#' + v.id + ')'
        + (s.bezi ? '\nJEŠTĚ BĚŽÍ – zbývá ' + NS.fmt.dur(s.zbyvaS)
          + (s.nabiziStart ? ' (okno nabízí start, ale hra ho odmítne)' : '') : '')
        + '\nkapacita: ' + (s.kapacita != null ? NS.fmt.num(s.kapacita) + ' ' + s.jednotka : '?')
        + s.suroviny.map(x => '\n' + x.nazev + ': ' + NS.fmt.num(x.sklad || 0)
          + ' (potřeba ' + NS.fmt.num(x.potreba || 0)
          + (x.chybi > 0 ? ', CHYBÍ ' + NS.fmt.num(x.chybi)
            + ' za ' + NS.fmt.kc(x.cenaChybejicich, { short: true }) : ', stačí') + ')').join('')
        + '\n→ ' + (s.bezi ? 'čeká se na dokončení'
          : co === 'sebrat' ? 'sebrat hotové'
          : co === 'koupit' ? 'dokoupit materiál a spustit'
            : co === 'spustit' ? 'spustit výrobu' : 'teď není co dělat');

    if (co) {
      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        try {
          const r = await NS.gym.withSuspend(() => kolo(v.id));
          cache.delete(v.id);
          if (r.popis) NS.gym.setStatus(r.popis, r.co === 'nedostatek');
        } catch (e) {
          NS.gym.setStatus('⚠ ' + v.nazev + ': ' + e.message, true);
        }
        onChange();
      });
    }
    return b;
  }

  /** Zaškrtávátko automatiky – jedno pro všechny čtyři, jak bylo zadáno. */
  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
      + 'Jedno zaškrtnutí pro všechny čtyři výrobny. V každém kole udělá jednu'
      + ' věc u jedné budovy a střídá je: sebrat → dokoupit materiál → spustit.'
      + ' Materiál se platí ŠPINAVÝMI penězi a kupuje se až po sběru, protože'
      + ' teprve tím se uvolní kapacita. Když na materiál nejsou peníze, řekne'
      + ' to a nic nekoupí.';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto;
    inp.addEventListener('change', async () => {
      await NS.store.patch('read', { vyrAuto: inp.checked });
      onChange();
    });
    wrap.appendChild(inp);
    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto' + (zapnuto && pozastaveno ? ' ⏸' : '');
    wrap.appendChild(txt);
    return wrap;
  }

  /**
   * Čtyři tlačítka, jedno na výrobnu. Řádek skládá `gym.js`, protože ho výrobny
   * dělí s bankou – patří k sobě, obojí je práce se surovinami a penězi.
   */
  const buttons = onChange => VYROBNY.map(v => tlacitko(v, onChange));

  const POPIS_SKUPINY = 'Konopí (#27), pervitin (#21), whisky (#24) a pivovar'
    + ' (#29). Jedno kolo = sebrat → dokoupit chybějící materiál → spustit'
    + ' výrobu. Materiál se platí špinavými penězi.';

  NS.vyrobny = {
    VYROBNY, stav, kolo, sebrat, spustit, koupit, klikni, zbyva,
    autoTick, autoSet, autoOn, buttons, tlacitko, autoBox, POPIS_SKUPINY,
    stats, reset, zapis, URL_OF, def, potrebaSpinavych, necoStoji, POTREBA_TTL,
    kolikKoupit, REZERVA_KC, zapomen, zapomenVse, beziAz, nactiPamet
  };
})();
