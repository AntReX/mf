/* =============================================================================
 * queue.js – automatika kliká JEDNU VĚC PO DRUHÉ
 *
 * Předtím se v pětisekundovém tiku odpálilo všech sedm automatik bez `await`,
 * takže běžely vedle sebe. Každá měla vlastní zámek (sama sebe nepřekřížila),
 * ale napříč moduly zámek nebyl – a to dělalo tři konkrétní potíže:
 *
 *   1. ENERGIE. Trénink bere 3 na klik, zahrady 6 na pole, a oba čtou totéž
 *      číslo z HUD. Souběžně počítaly ze stejného stavu, dohromady přestřelily
 *      a hra jednomu akci odmítla.
 *   2. PŘEKRESLENÍ. `withSuspend` byl jeden vypínač pro všechny: konec akce A
 *      ho po 250 ms pustil, i když akce B ještě klikala, a lišta se překreslila
 *      uprostřed cizího kliknutí. Proto je z něj teď POČÍTADLO (viz gym.js).
 *   3. CHYBY HRY. Chybové okno je jedno pro celou stránku, takže odmítnutí
 *      způsobené akcí A si mohl modul B vyhodnotit jako své vlastní.
 *
 * Sériové řazení všechny tři řeší tím, že v jednu chvíli běží jedna akce: stav
 * se čte aktuální, hlášku hry způsobila právě ta jedna běžící věc.
 *
 * !!! AUTOMATIKA BĚŽÍ JEN V JEDNÉ KARTĚ !!!
 * Rozšíření se načte v každé otevřené kartě hry a každá by hrála sama za sebe.
 * To není jen dvojnásobné tempo – hru drží SERVER a rozehrané kolo je jedno pro
 * celý účet, takže dvě karty si navzájem přebíjejí rozdání:
 *
 *   karta A zaplatí ante a nechá rozdat
 *   karta B zaplatí ante a nechá rozdat znovu   → ante karty A propadne
 *   karta A pošle „Vsadit 2×“ podle karet, které viděla
 *                                              → server to použije na kolo B
 *
 * Výsledkem jsou propadlé sázky a rozhodnutí podle karet, které v tom kole
 * vůbec nejsou – tedy přesně obrázek „strategie přestala fungovat“, protože
 * čísla v panelu odpovídají tomu, co karta viděla, ne tomu, co hra hrála.
 *
 * Proto si jedna karta bere ZÁMEK a ostatní automatiku nespustí. Ruční klikání
 * v liště funguje ve všech kartách dál – to je tvoje rozhodnutí, ne automatika.
 *
 * !!! ZOMBIE KARTY PO RELOADU ROZŠÍŘENÍ !!!
 * Když se rozšíření reloadne, už otevřené karty si nechají STARÉ skripty běžet
 * dál – Chrome jim jen odpojí `chrome.*` API. Taková karta pořád umí klikat
 * a posílat požadavky (hraje za skutečné peníze!), ale nemůže nic zapsat do
 * logu (je neviditelná v panelu) a nemůže se ani sama vypnout, protože vypnutí
 * je zápis do storage. Naživo takhle jedna ponechaná karta hrála celou noc
 * a způsobila kritické ztráty. Poznávací znamení osiřelého skriptu je zmizelé
 * `chrome.runtime.id` – proto ho kontroluje každé místo, které umí spustit akci.
 *
 * !!! FRONTA NIC NESPOUŠTÍ !!!
 * Je to jen řadič – jestli je vůbec co dělat, rozhoduje pořád každý modul sám
 * (a hlavní vypínač je nad tím). Zařazení do fronty nezaručuje akci; většina
 * položek skončí tím, že modul zjistí „není co dělat“, a to je v pořádku.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /**
   * Prodleva mezi dvěma akcemi. Není to kosmetika: `withSuspend` pouští
   * překreslení lišty 250 ms po skončení akce, takže bez téhle mezery by další
   * akce začala do rozdělaného překreslení.
   */
  const MEZERA = 300;

  /**
   * Strop délky. Tik chodí každých 5 s, takže kdyby se něco dlouho drhlo, fronta
   * by narůstala – a klikat věci naplánované před minutami nemá smysl.
   */
  const STROP = 12;

  /* ---- zámek na jednu kartu ------------------------------------------------ */

  /*
   * Zámek je „kdo se zapsal naposledy a pořád se hlásí“. Karta si drží
   * vlastnictví obnovováním časové značky; když přestane (zavřená karta,
   * uspaný počítač), po `ZAMEK_TTL` ho převezme jiná.
   *
   * Atomické operace `chrome.storage` nemá, takže se po zápisu ještě jednou
   * přečte, kdo tam zůstal – když se dvě karty potkají, vyhraje ta pozdější
   * a druhá se stáhne.
   */
  /**
   * Žije tenhle skript, nebo je to sirotek po reloadu rozšíření? Osiřelému
   * zmizí `chrome.runtime.id`. Kontroluje se před KAŽDOU akcí – sirotek si
   * totiž pamatuje, že zámek měl, takže samotný zámek ho nezastaví.
   */
  const ziju = () => {
    try {
      return !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  };

  const KARTA_ID = 'k' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
  const ZAMEK_TTL = 20000;      // bez ozvání se vlastnictví uvolní
  const ZAMEK_OBNOVA = 6000;    // jak často se hlásit, když jsem vlastník

  let zamekMam = false;
  let zamekCizi = null;         // kdo drží zámek, když ho nemám

  /*
   * Ruční rozhodnutí uživatele fajfkou „hraje tady“. Drží se v PAMĚTI KARTY,
   * ne ve storage – storage je společná, takže by volba z jedné karty přepnula
   * i ostatní, a to je přesně naopak, než k čemu fajfka je.
   *
   *   null   nikdo nic neřekl → automatické chování (vezmi si volný zámek)
   *   true   uživatel řekl „hraj tady“ → zámek se přebil natvrdo
   *   false  uživatel řekl „tady ne“ → zámek se nebere, ani když je volný
   */
  let rucne = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /**
   * Zkusí získat nebo obnovit zámek. Vrací true, když tahle karta smí hrát.
   * Volá se z tiku lišty, takže obnovování jde ruku v ruce s automatikou.
   */
  async function zkusZamek() {
    if (!ziju()) { zamekMam = false; return false; }
    // uživatel tuhle kartu odškrtl – zámek se nebere, ani kdyby byl volný
    if (rucne === false) { zamekMam = false; return false; }
    const cfg = await NS.store.load();
    const cur = cfg.autoOwner;
    const ted = Date.now();
    const cizi = cur && cur.id && cur.id !== KARTA_ID;
    const zivy = cur && cur.at && (ted - cur.at) < ZAMEK_TTL;

    if (cizi && zivy) {
      zamekMam = false;
      zamekCizi = cur.id;
      return false;
    }
    // volný, prošlý, nebo už můj – ale obnovovat netřeba častěji než je potřeba
    if (zamekMam && cur && cur.id === KARTA_ID && (ted - cur.at) < ZAMEK_OBNOVA) {
      return true;
    }
    await NS.store.put('autoOwner', { id: KARTA_ID, at: ted });
    /*
     * Kontrola po zápisu: kdyby se ve stejný okamžik zapsala jiná karta,
     * zůstane tam ona a tahle se musí stáhnout.
     */
    await sleep(120);
    const po = (await NS.store.load()).autoOwner;
    zamekMam = !!(po && po.id === KARTA_ID);
    zamekCizi = zamekMam ? null : (po && po.id) || null;
    return zamekMam;
  }

  /** Vzdá se zámku – jiná karta ho může vzít hned, ne až po vypršení. */
  async function uvolniZamek() {
    if (!zamekMam) return;
    zamekMam = false;
    const cur = (await NS.store.load()).autoOwner;
    if (cur && cur.id === KARTA_ID) await NS.store.put('autoOwner', null);
  }

  /*
   * !!! RUČNÍ PŘEBITÍ ZÁMKU !!!
   * Automatické předání funguje jen na vypršení: karta, která se přestala hlásit,
   * pustí zámek po `ZAMEK_TTL`. To pokrývá zavřenou kartu, ale NE tyhle dva
   * případy, které se naživo staly:
   *
   *   1. SIROTEK po reloadu rozšíření. Skript v otevřené kartě běží dál, ale
   *      `chrome.*` mu Chrome odpojil, takže `zkusZamek` skončí hned na `ziju()`
   *      a karta si zámek nikdy nevezme – i když ho reálně nikdo nedrží. V liště
   *      přitom svítilo „běží v jiné kartě“, takže to vypadalo na cizí kartu
   *      a jediná cesta ven bylo uhodnout, že se má obnovit stránka.
   *   2. Dvě karty naráz, kdy uživatel chce hrát v TÉHLE, ne čekat 20 s na to,
   *      až se ta druhá odmlčí.
   *
   * Přebití proto zámek zapíše bez ohledu na to, kdo ho drží. Druhá karta si na
   * svém dalším tiku přečte cizí `id` a sama se stáhne – nemusí se jí nic říkat.
   */
  async function prevezmi() {
    if (!ziju()) return false;
    rucne = true;
    await NS.store.put('autoOwner', { id: KARTA_ID, at: Date.now() });
    await sleep(120);
    const po = (await NS.store.load()).autoOwner;
    zamekMam = !!(po && po.id === KARTA_ID);
    zamekCizi = zamekMam ? null : (po && po.id) || null;
    return zamekMam;
  }

  /** Uživatel fajfku odškrtl: tady se nehraje a zámek se ani nezkouší brát. */
  async function vzdejSe() {
    rucne = false;
    clear();
    await uvolniZamek().catch(() => {});
    zamekMam = false;
  }

  /** Je tahle karta osiřelá po reloadu rozšíření? (jen pro hlášku v liště) */
  const sirotek = () => !ziju();

  const cekajici = [];
  let bezi = null;
  let beziOd = 0;           // kdy začala běžící akce – aby šlo ukázat, jak dlouho
  let pumpuje = false;      // jeden průchod, i když `run` zavolá pump kdykoli
  let posledniKonec = 0;    // kdy skončila předchozí akce – kvůli mezeře
  let posledni = null;      // co se udělalo naposledy (pro tooltip)
  let zahozeno = 0;

  /**
   * Zařadí akci. Vrací její výsledek, nebo `null`, když se nezařadila (už čeká
   * nebo právě běží stejná věc – tik ji nabídne znovu za pět sekund).
   *
   * Deduplikace podle jména je tady schválně: každý tik nabídne všechny
   * automatiky a bez ní by se ve frontě hromadily kopie téhož.
   */
  function run(name, fn) {
    // sirotek po reloadu rozšíření nesmí spustit NIC – viz hlavička
    if (!ziju()) { zamekMam = false; clear(); return Promise.resolve(null); }
    // bez zámku se v této kartě nehraje
    if (!zamekMam) return Promise.resolve(null);
    if ((bezi && bezi.name === name) || cekajici.some(u => u.name === name)) {
      return Promise.resolve(null);
    }
    if (cekajici.length >= STROP) {
      zahozeno++;
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      cekajici.push({ name, fn, resolve, reject });
      pump();
    });
  }

  /**
   * Jeden průchod frontou. `pumpuje` tu musí být zvlášť od `bezi`: kdyby se
   * hlídalo jen `bezi`, položka zařazená během čekání na mezeru by nastartovala
   * druhý průchod – a mezera by se přeskočila, protože `bezi` je v tu chvíli už
   * prázdné. (Přesně to se stalo a chytil to test na mezeru.)
   */
  async function pump() {
    if (pumpuje) return;
    pumpuje = true;
    try {
      while (cekajici.length) {
        /*
         * Zámek se kontroluje i mezi úkoly: kdyby ho karta mezitím ztratila
         * (uspaný počítač, jiná karta), zbytek fronty se zahodí.
         */
        if (!ziju()) { zamekMam = false; clear(); break; }
        if (!zamekMam) { clear(); break; }
        // mezera se měří od KONCE předchozí akce, ne od začátku čekání
        const zbyva = MEZERA - (Date.now() - posledniKonec);
        if (zbyva > 0) await sleep(zbyva);
        if (!cekajici.length) break;      // mezitím se mohlo vyprázdnit

        const u = cekajici.shift();
        bezi = u;
        beziOd = Date.now();
        try {
          u.resolve(await u.fn());
        } catch (e) {
          u.reject(e);
        } finally {
          posledni = u.name;
          bezi = null;
          posledniKonec = Date.now();
        }
      }
    } finally {
      pumpuje = false;
    }
  }

  /**
   * Vyprázdní frontu – čeká se na dokončení té jedné běžící (přerušit klik
   * uprostřed by nechalo hru v rozdělaném stavu), zbytek se zahodí.
   * Používá to hlavní vypínač: po vypnutí nemá co dobíhat.
   */
  function clear() {
    while (cekajici.length) cekajici.pop().resolve(null);
  }

  /** Co se právě děje – do tooltipu hlavního vypínače a do řádku v liště. */
  function info() {
    return {
      // drží tahle karta automatiku? (viz zámek v hlavičce)
      zamek: zamekMam,
      zamekCizi,
      kartaId: KARTA_ID,
      sirotek: sirotek(),
      rucneVypnuto: rucne === false,
      running: bezi ? bezi.name : null,
      runningFor: bezi ? Date.now() - beziOd : 0,
      waiting: cekajici.map(u => u.name),
      last: posledni,
      dropped: zahozeno
    };
  }

  /** Text do tooltipu, nebo prázdno, když se nic neděje. */
  function popis() {
    const i = info();
    if (i.sirotek) {
      return 'Rozšíření se mezitím přenačetlo a tahle stránka na něj ztratila'
        + ' napojení – automatika tu už nepoběží, ať se fajfka přepne jakkoli.'
        + ' Obnov stránku (F5).';
    }
    if (i.rucneVypnuto) {
      return 'Tahle karta má hraní vypnuté (fajfka „hraje tady“). Zaškrtnutím'
        + ' si vezme automatiku zpátky. Ruční tlačítka fungují dál.';
    }
    if (!i.zamek) {
      return 'Automatika běží v jiné kartě hry – tady je vypnutá, aby si karty'
        + ' navzájem nepřebíjely rozehraná kola. Zaškrtnutím „hraje tady“ ji'
        + ' přetáhneš sem a tamta se sama vypne. Ruční tlačítka fungují dál.';
    }
    if (!i.running && !i.waiting.length) return '';
    return 'Automatika běží po jedné věci: teď '
      + (i.running || 'nic')
      + (i.waiting.length ? ', ve frontě ' + i.waiting.join(', ') : '')
      + '.';
  }

  /**
   * Řádek do lišty. Text je krátký schválně – je to věc, na kterou se kouká
   * koutkem oka, ne hlášení. Sekundy u běžící akce jsou tam proto, že se pozná
   * zaseknutí: číslo, které roste a roste, je jediná vodítko, že se něco drhne.
   */
  function radek() {
    const i = info();
    if (i.sirotek) {
      return { aktivni: false, running: null, text: 'obnov stránku (F5)' };
    }
    if (i.rucneVypnuto) {
      return { aktivni: false, running: null, text: 'tady vypnuto' };
    }
    if (!i.zamek) {
      return { aktivni: false, running: null, text: 'běží v jiné kartě' };
    }
    if (i.running) {
      const s = Math.round(i.runningFor / 1000);
      return {
        aktivni: true,
        running: i.running,
        text: 'teď ' + i.running + (s >= 2 ? ' (' + s + ' s)' : '')
          + (i.waiting.length ? '  ·  čeká ' + i.waiting.join(', ') : '')
      };
    }
    if (i.waiting.length) {
      return { aktivni: true, running: null, text: 'čeká ' + i.waiting.join(', ') };
    }
    return {
      aktivni: false,
      running: null,
      text: 'klidno' + (i.last ? '  ·  naposledy ' + i.last : '')
    };
  }

  NS.queue = { run, clear, info, popis, radek, MEZERA, STROP,
    zkusZamek, uvolniZamek, prevezmi, vzdejSe, sirotek, ziju,
    KARTA_ID, ZAMEK_TTL,
    get mamZamek() { return zamekMam; },
    get rucneVypnuto() { return rucne === false; },
    get busy() { return !!bezi; },
    get length() { return cekajici.length; } };
})();
