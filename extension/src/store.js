/* =============================================================================
 * store.js – persistence nad chrome.storage.local
 *
 * Plochý model: každý top-level klíč se ukládá samostatně, takže zápis historie
 * nepřepisuje nastavení a naopak. Načítá se i v popup.html (nesmí tu být nic,
 * co závisí na herní stránce nebo na DOM).
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const DEFAULTS = {
    schema: 5,

    // stav panelu
    ui: { collapsed: false, tab: 'stav', left: null, top: null, gymHidden: false },

    // co a jak často se ČTE (výhradně GET, žádné herní akce)
    read: {
      // ID zjištěná ze hry (s1.czechmafie.cz) – lze změnit v nastavení
      buildings: [
        { id: 24, label: 'Palírna whisky', kind: 'whisky', capacity: null },
        { id: 27, label: 'Konopná farma', kind: 'farm', capacity: null },
        { id: 29, label: 'Pivovar', kind: 'brewery', capacity: null },
        { id: 21, label: 'Laboratoř pervitinu', kind: 'meth', capacity: null },
        { id: 22, label: 'Banka', kind: 'bank', capacity: null }
      ],
      autoRefresh: false,
      refreshSeconds: 180,
      cashSelector: '',       // volitelný CSS selektor s hotovostí v UI hry
      bankSelector: '',       // záložní selektor zůstatku (primárně se čte budova Banka)
      bankManual: null,       // zůstatek zadaný v panelu, když ho nelze přečíst
      countDirty: true,       // počítat špinavé peníze do majetku
      gemsManual: null,       // diamanty zadané ručně, když HUD není vidět
      /*
       * Jediná funkce, která zapisuje do stránky hry: v aukci nabídne tlačítka
       * pro vyplnění pole „Tvá sázka?“. Nic neodesílá – viz src/auction.js.
       */
      auctionFill: true,
      gymBar: true,           // lišta posilovny (přeposílá klik na herní tlačítko)
      gymEverywhere: false,   // mimo posilovnu nechat lištu jako zkratku do ní
      /*
       * Trénink odkudkoli: na klik stáhne fragment posilovny, vloží tlačítko do
       * herního kontejneru a přepošle na něj klik. Požadavek posílá hra, ne
       * rozšíření – ale funkčně je to „otevři posilovnu na pozadí“, takže je to
       * nejblíž automatizaci, co tu je. Proto výchozí vypnuto.
       */
      gymRemote: false,
      gymAlertEnergy: 0,      // zvýraznit lištu při energii ≥ N (0 = vypnuto); jen signál, neklikne
      /*
       * Automatický trénink – JEDINÁ funkce, která klikne bez kliknutí uživatele.
       * `autoTrain` je klíč akce ('speed' | 'strength' | 'defense' |
       * 'army_guards' | 'army_warriors') nebo prázdno = vypnuto.
       * Dávka se spustí při energii ≥ autoTrainPct a klikne, dokud neklesne na
       * autoTrainFloor. Interval je pevný (autoTrainGap ms) – žádné náhodné
       * rozptýlení, maskovat klikátko není účel. Viz src/gym.js.
       */
      /*
       * Hlavní vypínač veškeré automatiky (trénink i doprava). Je to hradlo nad
       * jednotlivými volbami – ty se nemažou, takže zapnutí zpátky rozjede přesně
       * to, co bylo. Ovládá se ⏸ / ▶ v liště nebo v tomhle nastavení.
       */
      autoPaused: false,
      autoTrain: '',
      autoTrainPct: 100,
      autoTrainFloor: 70,
      autoTrainGap: 1000,
      /*
       * Minimum štěstí, aby se dávka vůbec rozjela. Štěstí (v DOM `renew-awake`,
       * ikona `resources-happy`) je druhá spotřebovávaná měna – trénink z něj
       * bere ~50 za kus a doplňuje se ze šperků, ne samo. Bez tohohle by dávka
       * jela dál a hra by ji jen odmítala.
       */
      autoTrainLuck: 100,
      /*
       * Další řádky lišty: letadla jako L1, L2… a lodě jako S1, S2… Tlačítko
       * podle stavu sebere peníze, nebo vypraví náklad – ten dražší, pokud ho je
       * na plný náklad dost (letadla whisky/pivo, lodě pervitin/konopí).
       * Jeden klik = jedna akce, viz src/fleet.js.
       */
      planeBar: true,
      boatBar: true,
      /*
       * Automatické sbírání a vypravování letadel / lodí. Zaškrtávátko je přímo
       * v řádku lišty, protože je to (spolu s autoTrain) jediná věc, která klikne
       * bez uživatele. Viz src/fleet.js.
       */
      autoPlane: false,
      autoBoat: false,
      /*
       * Řádek zločinů z mapy. Na tlačítku je potřebná odvaha, klik přepošle klik
       * na herní „Spáchat zločin“ – viz src/crimes.js.
       */
      crimeBar: true,
      /*
       * Řádek diamantových šachet (`/map/mine/show/{n}`). Jedno tlačítko na šachtu:
       * sebere diamanty, nebo ji pustí do práce – viz src/mines.js.
       */
      mineBar: true,
      /*
       * Automatické sbírání a spouštění šachet. Zaškrtávátko je v řádku lišty.
       * Podléhá hlavnímu vypínači i zámku ve vězení, viz src/mines.js.
       */
      mineAuto: false,
      /*
       * Tlačítko „Mzda“ z úřadu práce (#9) v řádku šachet. Jen výběr mzdy –
       * přihlašování na pozice v liště není, viz src/work.js.
       */
      workBar: true,
      /*
       * Automatický výběr mzdy. Nevybírá „po hodině“, ale až se zvedne počet
       * diamantů – to je hranice hodiny a výběr uprostřed by rozdělanou hodinu
       * zahodil. Viz src/work.js.
       */
      workAuto: false,
      workAutoMinHours: 1,
      workAutoEverySec: 120,
      /*
       * Nevěstinec (#19). Vybírá se HNED – hra při zpoždění 10 min odečítá 2 %,
       * takže tu není co optimalizovat čekáním. Viz src/brothel.js.
       */
      brothelBar: true,
      brothelAuto: false,
      // zahrady (sloty 35–54): 3 energie za akci, proto i rezerva proti tréninku
      farmBar: true,
      farmAuto: false,
      farmReservePct: 25,
      // limit osetých zahrad podle úrovně – zjistí se z odmítnutí hrou (403)
      farmLimit: null,
      // blackjack #18: sázka v DIAMANTECH (ne v Kč jako kuličky a automat)
      bjStake: 10,
      bjReserve: 0,
      // po dohraném kole hrát hned další (fronta mezitím pustí ostatní automatiky)
      bjLoop: true,
      /*
       * Poker #18 – jediná hra v kasinu s kladným EV, když se zdvojnásobuje jen
       * v převaze. `pkPrah` je o kolik procentních bodů musí být šance na výhru
       * vyšší než na prohru (0 = zdvojit vždy, když jsem favorit).
       */
      pkStake: 10,
      pkReserve: 0,
      pkPrah: 0,
      pkVzorku: 3000,
      pkLoop: true,
      /*
       * Automaticky páchaný zločin – ID z /map/crime/{n}, nebo 0 = vypnuto.
       * Select je na konci řádku „Zločiny“ v liště. Podléhá `autoPaused`.
       */
      autoCrime: 0,
      /*
       * Řádek kasina (#15). VÝCHOZÍ VYPNUTO – na rozdíl od ostatních řádků se tu
       * sází, tedy klik utrácí peníze. Očekávaná hodnota hry je nula, takže si to
       * uživatel musí zapnout sám. Automatika tu žádná není.
       */
      casinoBar: false,
      /*
       * Kasino: základní vklad a navyšování po prohře. `casinoStep` musí být
       * > 1,5, jinak výhra série ztrátu nepokryje – viz rozvaha v src/casino.js.
       * `casinoMax` je strop na jednu sázku (0 = bez stropu).
       */
      casinoStake: 10,
      casinoProgress: true,     // navyšování po prohře jde vypnout (přepínač v liště)
      /*
       * Navyšování může mít dvě fáze: prvních `casinoPhase1` kol se násobí
       * `casinoStep`, dál `casinoStep2`. První fáze zisk série NAVYŠUJE (nad 1,5),
       * druhá ho jen drží – proto se hodí začít ostřeji a pak přejít na 1,5, kde
       * je expozice nejmenší. 0 = jedna fáze, celá série `casinoStep`.
       */
      casinoStep: 1.5,
      casinoPhase1: 0,
      casinoStep2: 1.5,
      /*
       * Strop na počet pokusů v jedné sérii. Bez něj sázka roste bez konce – při
       * ×1,5 je 30. sázka 128 tisíc základů a 50. už 425 milionů. Po vyčerpání se
       * ztráta realizuje a jde se od základu.
       */
      /*
       * Automatické sázení: '1' | '2' | '3' (pistole/srdce/oheň), nebo prázdno.
       * Po vyčerpání pokusů se samo vypne – viz src/casino.js.
       */
      casinoAuto: '',
      /*
       * Po vzdané série (vyčerpané pokusy) se automatika výchozím chováním
       * zastaví – při 6 pokusech k tomu dojde v 8,8 % sérií, tedy často. S touhle
       * volbou jede dál a začne zas od základu.
       */
      casinoAutoContinue: false,
      /*
       * Rezerva špinavých peněz: pod tuhle částku sázka nesmí jít. Bez ní by
       * martingale v nejhorší chvíli vysál účet do nuly.
       */
      casinoReserve: 0,
      casinoMaxSteps: 6,
      casinoMax: 0
    },

    /*
     * Recepty výroby. Spotřebu surovin, ceny surovin i výnos na jednotku bere
     * rozšíření z fragmentu budovy, výkupní cenu produktu z jeho prodejní
     * stránky (`saleSlug` → /inventory/…). Hodnoty níž jsou jen záloha pro
     * případ, že se čtení nepovede.
     */
    econ: {
      recipes: [
        {
          id: 'whisky', label: 'Whisky', kind: 'whisky',
          unitForms: ['sud', 'sudy', 'sudů'], unitAcc: 'sud',
          inputs: [{ key: 'wheat', label: 'Pšenice', of: 'pšenice', unit: 'kg', perUnit: 8, price: 2.5 }],
          output: { name: 'whisky', of: 'whisky', unit: 'l', perUnit: 30, price: 1.6 },
          saleSlug: 'whisky',
          hours: 8
        },
        {
          id: 'farm', label: 'Konopí', kind: 'farm',
          unitForms: ['hektar', 'hektary', 'hektarů'], unitAcc: 'hektar',
          inputs: [{ key: 'seeds', label: 'Semena', of: 'semen', unit: 'ks', perUnit: 100, price: 0.1 }],
          output: { name: 'konopí', of: 'konopí', unit: 'g', perUnit: 1000000, price: 0.3 },
          saleSlug: 'marijuana',
          hours: 6
        },
        {
          id: 'beer', label: 'Pivo', kind: 'brewery',
          unitForms: ['sud', 'sudy', 'sudů'], unitAcc: 'sud',
          inputs: [
            { key: 'hops', label: 'Chmel', of: 'chmele', unit: 'kg', perUnit: 15, price: 0.6 },
            { key: 'barley', label: 'Ječmen', of: 'ječmene', unit: 'kg', perUnit: 30, price: 0.2 }
          ],
          output: { name: 'pivo', of: 'piva', unit: 'l', perUnit: 75, price: 0.6 },
          saleSlug: 'beer',
          hours: 5
        },
        {
          id: 'meth', label: 'Pervitin', kind: 'meth',
          unitForms: ['chemik', 'chemici', 'chemiků'], unitAcc: 'chemika',
          inputs: [{ key: 'pills', label: 'Tablety', of: 'tablet', unit: 'ks', perUnit: 30, price: 0.4 }],
          output: { name: 'pervitin', of: 'pervitinu', unit: 'g', perUnit: 100, price: 1.4 },
          saleSlug: 'meth',
          hours: 4
        }
      ]
    },

    /*
     * Dopravní prostředky – kolikrát ještě můžeš vyslat. Zásoba se bere
     * z metriky sledované budovy, nebo ji zadáš v panelu ručně.
     */
    fleet: [
      {
        id: 'ship', name: 'Nákladní loď', capacity: 500, count: 2, cost: 0,
        sourceBuildingId: null, sourceMetric: 'stock', stock: null
      }
    ],

    history: [],   // [{ t, cash, bank, dirty, total, b: { "<id>": {...} } }]
    items: [],     // viz items.js

    /*
     * Poslední přečtený stav. Content script se spouští znovu při každém
     * načtení herní stránky, takže bez tohohle by byl panel po každém kliknutí
     * ve hře prázdný a vypadalo by to, že nic nefunguje.
     */
    lastState: null,

    /*
     * Požadavky zločinů (odvaha, rychlost, odměna) z /map/crime/{n}. Nemění se,
     * takže se drží tady – jinak by každé načtení herní stránky znamenalo 20
     * požadavků na hru. Co hráč právě má, se čte z HUD při každém překreslení.
     */
    crimes: { at: 0, list: [] },

    /*
     * Čísla vlastněných šachet. Berou se z mapy (zdarma), tady se drží jen proto,
     * aby řádek fungoval i na stránce, kde mapa není.
     */
    mines: { ids: [], at: 0 },

    /*
     * Jednorázový vzorek podoby vězeňského okna. Detekce v src/jail.js je zatím
     * postavená na českých formulacích, protože okno se nepovedlo zachytit
     * naživo; tohle ho uloží samo, jak se objeví, a pak se odhad nahradí přesným
     * selektorem. Ukládá se jen struktura a text, ne HTML s atributy.
     */
    jailSample: null,

    /*
     * Výdělek dopravy: kolik která loď / letadlo doopravdy přineslo. Hra nikde
     * nesčítá, co ti co vydělalo, takže se sčítá při každém sebrání peněz.
     *   { plane: { 2: { name, runs, total, lost, first, last, cargo, pending } } }
     * `lost` = co odteklo pozdním sběrem (hra strhává 3 % za každých 10 minut).
     * `cargo` = rozpad výdělku podle nákladu; `pending` = co se právě vypravilo,
     * protože sebrané peníze samy neříkají, z čeho jsou (viz src/fleet.js).
     */
    fleetLog: { plane: {}, boat: {} },

    /*
     * Bilance kasina. Počítá se z VÝSLEDKŮ (výhra +2×, prohra −1×), ne z peněz
     * v HUD – ty se mění i z jiných zdrojů, takže by to lhalo. Slouží hlavně
     * k tomu, aby šlo na vlastních datech vidět, že hra s nulovým EV nevydělává.
     */
    casinoLog: {
      plays: 0, wins: 0, staked: 0, won: 0, net: 0, at: null, byShape: {}, last: [],
      streak: 0, sunk: 0, busts: 0, lossRun: 0, maxLossRun: 0
    },

    /*
     * Blackjack (#18) – hraje se za DIAMANTY, proto vlastní sázka i rezerva.
     * Nejmenší žeton je 10 a sázka se z žetonů skládá, takže jen desítky.
     */
    /* (klíče `bjStake`, `bjReserve` jsou v `read` níže) */

    /*
     * Automaty (#18) – vlastní záznam, ne součást `casinoLog`. Je to jiná hra:
     * výplata není binární (viděné výhry 4 a 5 při sázce 10), takže by se
     * čísla s kuličkami sčítat nedala. Návratnost se počítá z těchto dvou
     * sloupců, a to je celý smysl – zjistit, jak nevýhodná ta hra je.
     */
    slotsLog: {
      spins: 0, wins: 0, staked: 0, won: 0,
      best: 0, bestStake: 0, lossRun: 0, maxLossRun: 0,
      firstAt: null, lastAt: null, recent: []
    },

    /*
     * Blackjack (#18) – v DIAMANTECH, tak zvlášť od `casinoLog` i `slotsLog`.
     * Sleduje se i rozpis výsledků, protože podíl remíz a blackjacků říká,
     * jestli hra platí, jak proměřeno (BJ 2,5×, výhra 2×, remíza vrací vklad).
     */
    /*
     * Podrobný průběh posledních kol blackjacku (diagnostika). Drží se jen
     * několik kol – je to nástroj na ladění, ne archiv.
     */
    bjTrace: [],

    /*
     * Která karta právě drží automatiku. Rozšíření běží v každé otevřené kartě
     * hry, ale hru drží server – dvě karty by si přebíjely rozehraná kola
     * (podrobně v queue.js). `null` znamená, že je zámek volný.
     */
    autoOwner: null,

    /** Evidence Kámen–Nůžky–Papír: kolik se vypsalo, za kolik a co ještě čeká. */
    rpsLog: {},

    /** Evidence banky: kolik se vypralo a kolik se z toho sebralo. */
    bankLog: {},

    /** Evidence výroben: co se sebralo, spustilo a kolik stál materiál. */
    vyrLog: {},

    /*
     * Dokdy která výrobna prokazatelně pracuje: `{ "<id>": timestamp }`. Bere se
     * z odpočtu hry (`.working`) a UKLÁDÁ se, protože výroba běží v řádu hodin –
     * v paměti karty by termín smazal každý reload, a ten se navíc děje sám
     * každých 30–60 minut (noční obnovování).
     *
     * Dokud termín platí, budova se nečte ani automatikou, ani lištou. Změřeno:
     * s třemi běžícími výrobnami to spadlo z 5 požadavků na tik na 1.
     */
    vyrBeziDo: {},

    /*
     * Evidence předmětů: produkt (master) → varianty → kusy, a k tomu ceny.
     * Master je cesta obrázku bez přípony, protože nese i kategorii a vzácnost;
     * kus je `data-item-id` z inventáře. Aukce a inventář se spojit nedají
     * (aukce `data-item-id` nemá), takže cena se ke kusu přiřazuje ručně.
     */
    market: { produkty: {} },

    /*
     * Rozvrh nočního obnovování: `{ "<tabId>": { do, min, slib } }`. Píše ho
     * `background.js`, stránka si z něj čte jen odpočet do popisku. Musí být
     * mezi klíči tady, aby se změna propsala do keše (viz `onChange`).
     */
    reloadPlan: {},
    /*
     * Kdy byla naposled vidět kontrola „jsi člověk?“. Píše content skript, čte
     * background – ten podle toho NIKDY neobnoví stránku s captchou, a to ani
     * u zaseknuté karty, která by mu to sama říct nemohla.
     */
    captchaAt: 0,

    /*
     * Přestat hrát poker, když rozdání vychýlí dealerovi nad 3 σ. Změřeno:
     * každá 1 σ stojí ~3,6 pb návratnosti a při poctivém rozdání je hra jen na
     * nule, takže vychýlené kolo se nedá vyhrát strategií (viz poker.js).
     */
    pkStopVychyleni: true,

    /*
     * Měřicí režim: střídá ante po blocích, aby se dalo rozpletat, co vychýlení
     * rozdání způsobuje – výše sázky, počet odehraných kol, nebo předchozí
     * výsledky. Bez střídání se to oddělit nedá, protože ante se v běžném hraní
     * mění jednou a naráz s časem (viz poker.js).
     */
    /*
     * Kámen–Nůžky–Papír (#17): sázka ve špinavých penězích (minimum 100 hlídá
     * server) a evidence vypsaných výzev. Výsledek se dozvědět nedá – viz rps.js.
     */
    rpsBar: true,
    rpsStake: 100,

    /*
     * Boj (#/search). Útok stojí 30 energie a energie se dobíjí ~10/min, takže
     * strop je asi 20 útoků za hodinu – tempo drží ona, ne časovač.
     *
     * Podíl úrovně je ZVLÁŠŤ pro ruku a pro automatiku: u ručního kliku se
     * člověk na soupeře podívá, automatika ne, tak si sahá na slabší.
     */
    atkBar: true,
    atkAuto: false,
    atkPodil: 70,            // ruční tlačítka: do 70 % vlastní úrovně
    atkPodilAuto: 50,        // automatika: do 50 %
    /*
     * Nejnižší úroveň soupeře. 0 = bez omezení. Platí pro ruku i automatiku –
     * je to vlastnost toho, koho chceš napadat, ne toho, kdo klikl.
     */
    atkMinUroven: 0,
    atkRezerva: 0,           // energie, kterou automatika nechá na jiné věci
    atkPauza: 60,            // nejmenší mezera mezi útoky automatiky (s)
    atkDruh: 'not-active',   // co automatika hledá (not-active / not-active-gang)

    /*
     * Vylepšování budov (Továrna 25, Dům zločinů 23, Posilovna 26, Nemocnice 31,
     * Závody 28, Kasárna 20). Platí se ČISTÝMI penězi z hotovosti, která bývá
     * skoro nulová – takže si automatika sáhne do banky. Viz upgrade.js.
     */
    upgBar: true,
    upgAuto: false,
    upgMaxCena: 0,           // strop na jedno vylepšení (0 = bez omezení)
    upgRezerva: 0,           // kolik peněz (hotovost + banka) nechat být

    /*
     * Banka (#22): praní špinavých peněz. Hra si bere 30 %, takže automatika
     * je schválně vypnutá – zapíná se vědomě.
     */
    bankBar: true,
    bankAuto: false,

    /*
     * Automatické ukládání do skladu banky. Je zvlášť od praní: praní stojí
     * 30 %, ukládání je zdarma a slouží k tomu, aby peníze neležely na účtu,
     * odkud se dají ukrást. `bankKeep` je, kolik se nechá mimo banku.
     */
    bankUloz: false,
    bankKeep: 0,
    /*
     * Kolik ŠPINAVÝCH nechat nevypraných. Platí se jimi materiál pro výrobny,
     * takže vyprat je do posledního by je nechalo bez nákupu – a zpátky by se
     * čisté dostaly převodem, kdežto praní stojí 30 %.
     */
    bankKeepDirty: 0,
    /*
     * !!! KDO PRANÍ VYPNUL – TY, NEBO AUTOMATIKA? !!!
     * Praní se dočasně vypíná, když výrobny stojí a potřebují špinavé peníze
     * (praní jde proti tomu a stojí 30 %). Aby se pak zapnulo zpátky JEN tehdy,
     * když ho vypnula automatika, drží se to tady. Bez toho by se stalo obojí
     * špatně: zapnulo by se praní, které jsi měl vypnuté, nebo by zůstalo
     * vypnuté praní, které jsi měl zapnuté.
     *
     * Tvoje ruční přepnutí přepínače tenhle příznak VŽDY smaže – rozhodl jsi ty
     * a automatika už do toho nemluví.
     */
    bankPratPozastaveno: false,
    /*
     * Od kolika peněz se vkládá. NENÍ to kvůli ceně – vklad ani výběr energii
     * nestojí (změřeno: 21 → 21 → 21 přes obojí). Je to jen proti tomu, aby se
     * to klikalo pořád po drobných. **Nula = vlož všechno nad rezervu.**
     *
     * Výchozí bývalo 1 000 000, což se ukázalo jako past: kdo si nastavil rezervu
     * 100 a čekal, že se vloží zbytek, nedostal nic, dokud se nenastřádal milion.
     */
    bankMinVklad: 10000,
    bankMinEnergie: 0,

    /*
     * Šetřicí režim: hra drží 27 nekonečných animací, kvůli kterým se karta
     * překresluje každý snímek, i když se nic nemění (změřeno – viz uspor.js).
     * 'napozadi' je výchozí, protože když na kartu nekoukáš, jsou animace čistá
     * ztráta a nic se jejich vypnutím neztratí.
     */
    usporAnimace: 'napozadi',

    /*
     * Sběr evidence předmětů: na pozadí se čte aukce (každé 3 min) a inventář
     * (každých 30 min) a plní se z toho `market` – produkty, kusy, kvalita
     * a viděné ceny. Je to ČTENÍ, nic to ve hře nemění.
     *
     * Výchozí vypnuto: jsou to požadavky do hry, které si uživatel nevyžádal,
     * a bez zapnutí nemá rozšíření důvod je posílat.
     */
    marketSbirat: false,

    /*
     * Noční obnovování stránky. Hra po delší době přestane reagovat a obnovení
     * to spraví – přes noc u toho ale nikdo nesedí. Prodleva se LOSUJE z 30–60
     * minut po každém obnovení; pevná perioda by z toho udělala hodinky, které
     * jdou na sekundu. Výchozí vypnuto: obnovení stránky je zásah do toho, co
     * má uživatel rozdělané.
     */
    reloadAuto: false,

    /*
     * Výrobny (#21 pervitin, #24 whisky, #27 konopí, #29 pivo). Jedno
     * zaškrtnutí pro všechny čtyři; automatika kupuje materiál za ŠPINAVÉ
     * peníze, takže je vypnutá, dokud ji nezapneš.
     */
    vyrBar: true,
    vyrAuto: false,

    pkMereni: false,
    pkMereniAnte: '10,20',
    pkMereniBlok: 100,

    /*
     * Kolik přinesly budovy, které se vybírají: mzda #9 (čisté peníze
     * + diamanty) a nevěstinec #19 (špinavé peníze). Hra to nikde nesčítá.
     */
    prijmyLog: {},

    /* Poker (#18): bilance a ladicí průběh, zvlášť od blackjacku. */
    pkTrace: [],
    pkLog: {
      rounds: 0, wins: 0, pushes: 0, losses: 0, neurcite: 0,
      doubled: 0, staked: 0, won: 0, lossRun: 0, maxLossRun: 0,
      zdvojene: { n: 0, wins: 0, staked: 0, won: 0 },
      jenAnte: { n: 0, wins: 0, staked: 0, won: 0 },
      firstAt: null, lastAt: null, recent: []
    },

    bjLog: {
      rounds: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0, neurcite: 0,
      staked: 0, won: 0, lossRun: 0, maxLossRun: 0,
      byAkci: {}, firstAt: null, lastAt: null, recent: []
    }
  };

  const KEYS = Object.keys(DEFAULTS);

  const clone = v => JSON.parse(JSON.stringify(v));

  /** Uložená hodnota + chybějící výchozí klíče (pro objekty), jinak hodnota. */
  function withDefaults(key, stored) {
    const def = DEFAULTS[key];
    if (stored === undefined || stored === null) return clone(def);
    if (Array.isArray(def) || typeof def !== 'object') return stored;
    return { ...clone(def), ...stored };
  }

  let cache = null;

  async function load() {
    const stored = await chrome.storage.local.get(KEYS);
    cache = {};
    for (const k of KEYS) cache[k] = withDefaults(k, stored[k]);

    // migrace z 0.1.x (automatizace): přenes ID budov, zbytek zahoď
    if (stored.schema === undefined) await migrateFromAuto(stored);
    // schema 4: výkupní ceny byly řádově mimo (whisky 60 Kč/l vs. 1,60 ve hře),
    // takže se recepty přepíšou na ověřené hodnoty; historie a předměty zůstávají
    else if (stored.schema < 4) await migrateToRecipes();
    else if (stored.schema < 5) await migraceVkladu(stored);

    return cache;
  }

  /**
   * !!! HRANICE VKLADU 1 000 000 BYLA CHYBA, NE VOLBA !!!
   * Ukládání do banky se dělo teprve od milionu nad rezervou a odůvodněno to bylo
   * tím, že „vklad stojí energii“ – což je ZMĚŘENĚ nepravda (21 → 21 → 21 přes
   * vklad i výběr). Kdo si nastavil rezervu 100 a čekal, že se vloží zbytek,
   * nedostal nic.
   *
   * Snížení výchozí hodnoty samo nepomůže: komu se nastavení jednou uložilo, má
   * v něm ten milion dál. Přesná hodnota starého výchozího čísla se přitom nedá
   * odlišit od „nikdy jsem to nenastavil“, takže se převede – a je to schválně
   * jen tahle jedna hodnota, aby se nikomu nepřepsala vědomá volba jako 500 000.
   */
  async function migraceVkladu(stored) {
    const r = cache.read;
    if (+r.bankMinVklad === 1000000) r.bankMinVklad = DEFAULTS.read.bankMinVklad;
    await chrome.storage.local.set({ schema: 5, read: r });
    void stored;
  }

  async function migrateToRecipes() {
    cache.econ = clone(DEFAULTS.econ);
    cache.read = { ...clone(DEFAULTS.read), ...pickUserRead(cache.read) };
    await chrome.storage.local.set({ schema: 4, econ: cache.econ, read: cache.read });
  }

  /** Z nastavení čtení si necháme jen to, co si uživatel opravdu nastavil. */
  function pickUserRead(read) {
    const out = {};
    for (const k of ['autoRefresh', 'refreshSeconds', 'cashSelector', 'bankSelector', 'bankManual', 'countDirty']) {
      if (read && read[k] !== undefined) out[k] = read[k];
    }
    return out;
  }

  async function migrateFromAuto(stored) {
    const legacy = await chrome.storage.local.get(['whiskyBuildingId', 'farmBuildingId']);
    const b = cache.read.buildings;
    if (legacy.whiskyBuildingId) b[0].id = legacy.whiskyBuildingId;
    if (legacy.farmBuildingId) b[1].id = legacy.farmBuildingId;
    await chrome.storage.local.set({ schema: DEFAULTS.schema, read: cache.read });
    // klíče staré automatizace už nikdo nečte – ať nezůstávají ve storage
    await chrome.storage.local.remove([
      'running', 'tickSeconds', 'jitterSeconds', 'collectMoney', 'planeFrom', 'planeTo',
      'whisky', 'whiskyBuildingId', 'whiskyAutoBuyWheat', 'whiskyWheatAmount', 'whiskyMaxSpend',
      'farm', 'farmBuildingId', 'farmAutoBuySeeds', 'farmSeedsAmount', 'maxActionsPerSession'
    ]);
  }

  /** Synchronní přístup k načtené konfiguraci (po await load()). */
  function get() { return cache; }

  async function put(key, value) {
    cache[key] = value;
    await chrome.storage.local.set({ [key]: value });
  }

  async function patch(key, partial) {
    return put(key, { ...cache[key], ...partial });
  }

  /** cb(touchedKeys) při změně z jiného kontextu (popup ↔ panel). */
  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !cache) return;
      const touched = [];
      for (const k in changes) {
        if (!KEYS.includes(k)) continue;
        cache[k] = withDefaults(k, changes[k].newValue);
        touched.push(k);
      }
      if (touched.length) cb(touched);
    });
  }

  /** Celý obsah storage jako objekt (pro export do souboru). */
  async function dump() {
    return chrome.storage.local.get(KEYS);
  }

  /** Nahradí data z importovaného objektu (jen známé klíče). */
  async function restore(obj) {
    const patchObj = {};
    for (const k of KEYS) if (k in obj) patchObj[k] = obj[k];
    if (!Object.keys(patchObj).length) throw new Error('Soubor neobsahuje žádná data rozšíření.');
    await chrome.storage.local.set(patchObj);
    return load();
  }

  NS.store = { DEFAULTS, KEYS, load, get, put, patch, onChange, dump, restore };
})();
