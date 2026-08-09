/* =============================================================================
 * fleet.js – rychlá tlačítka letadel a lodí do dalších řádků lišty
 *
 * Letiště (#60) i přístav (#30) mají dopravní prostředky v mřížce a u každého se
 * klikáním prochází dvě modalová okna. Lišta je dá do jednoho řádku:
 *
 *   LETADLA: L1/99  L2/99  L3/12  L4/1  L5 🔒 …
 *   LODĚ:    S1/99  S2/99  S3/58  S4/11 S5 🔒 …
 *
 * Na tlačítku je číslo prostředku, za lomítkem počet zbývajících plných jízd
 * (strop 99, ať tam není pětimístný údaj). Stav nese barva – zeleně přivezlo
 * peníze, vínově se dá vypravit, šedě je venku, zámek = nekoupené. Co se stane,
 * s jakým nákladem a přesný počet jízd řekne tooltip; legenda visí na popisku
 * řádku.
 *
 * Číslo = ID prostředku ve hře (`/map/plane/{n}`, `/map/boat/{n}`), ať popisky
 * neskáčou, když jeden nejde přečíst.
 *
 * !!! STEJNÁ HRANICE JAKO U TRÉNINKU !!!
 * Klik vloží fragment do herního modálního kontejneru a klikne na skutečné
 * tlačítko hry v něm; požadavek posílá hra. Jeden tvůj klik = jedna akce, žádný
 * časovač, nic se neděje samo. Fragment se vkládá celý, protože handlery hry si
 * čtou okolí (stejný důvod jako u kasáren).
 *
 * !!! JAK SE POZNÁ STAV !!!
 * Ne podle tlačítek – „Odeslat“ / „Vyplout“ je ve fragmentu VŽDY, i u letadla ve
 * vzduchu. Hra nemožnost vypravit značí obalem `.box-ins.shipSendDisabled`
 * (ověřeno: doma 0×, s nesebranými penězi 1×, na cestě 1×). Peníze mají přednost
 * před odesláním, protože dokud se neseberou, hra odeslání blokuje – a za pozdní
 * sběr se navíc platí pokuta.
 *
 * !!! VÝBĚR NÁKLADU !!!
 * Handler hry (`.static-inv` v app.js) čte `data-id`, přehodí `.selected`
 * a nastaví `#smuggle-selection input[name=amountOfDrugs]` na
 * `.capacity-amounts .max-{náklad}-amount`. Opakovaný klik na už vybraný náklad
 * nic nerozbije (žádné odvybrání – ověřeno), takže se klikne vždy a množství tím
 * dopočítá hra sama.
 *
 * Vybere se **první náklad, který zaplní celou kapacitu**, jinak ten poslední:
 *   letadla – whisky, a když jí není na plný náklad dost, pivo
 *   lodě    – pervitin, a když ho není na plný náklad dost, konopí
 * Pro plnost se bere `min(zásoba z popisku, max-{náklad}-amount)`, ať to platí
 * bez ohledu na to, kterou z těch dvou hodnot hra omezuje. Počet jízd se ale
 * počítá ze SAMOTNÉ zásoby – `max-{náklad}-amount` je omezené kapacitou, takže
 * by z něj u plné zásoby vyšla vždycky jedna jízda.
 *
 * Ověřeno v síťovém logu:
 *   GET  /map/plane/2/collect → 200   (stav sebrat → odeslat)
 *   POST /map/plane/2/send    → 200   (stav odeslat → letí)
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const STATE_TTL = 2 * 60 * 1000;

  /** Druhy dopravy. Liší se URL, popiskem a nabídkou nákladu. */
  const KINDS = [
    {
      id: 'plane',
      flag: 'planeBar',
      autoFlag: 'autoPlane',
      row: 'Letadla:',
      prefix: 'L',
      what: 'letadlo',
      building: '/map/building/show/60',
      unit: n => '/map/plane/' + n,
      unitPath: '/map/plane/',
      buy: 'buyPlane/',
      away: 'letí',
      awayTitle: 'je ve vzduchu',
      cargo: [{ id: 'whisky', label: 'whisky' }, { id: 'beer', label: 'pivo' }]
    },
    {
      id: 'boat',
      flag: 'boatBar',
      autoFlag: 'autoBoat',
      row: 'Lodě:',
      prefix: 'S',
      what: 'loď',
      building: '/map/building/show/30',
      unit: n => '/map/boat/' + n,
      unitPath: '/map/boat/',
      buy: 'buyShip/',                       // kupuje se přes shipyard, ale stav je /map/boat/
      away: 'na cestě',
      awayTitle: 'je na cestě',
      cargo: [{ id: 'meth', label: 'pervitin' }, { id: 'marijuana', label: 'konopí' }]
    }
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const doc = html => new DOMParser().parseFromString(html, 'text/html');
  const text = d => (d.body ? d.body.textContent : '').replace(/\s+/g, ' ').trim();

  const kindById = id => KINDS.find(k => k.id === id);
  const cargoLabel = (kind, id) => (kind.cargo.find(c => c.id === id) || {}).label || id;

  const states = {};     // { [kind.id]: { list, at } }
  const inflight = {};   // rozjeté čtení – další zájemci se přidají na něj

  /* ---- čtení stavu -------------------------------------------------------- */

  /** Číslo z popisku nákladu („Konopí: 32 827 137 g“ → 32827137). */
  const stockOf = el => (el ? NS.parse.byRe(el.textContent.replace(/\s+/g, ' '), /:\s*(\d[\d\s .,]*)/) : null);

  /**
   * Který náklad se vypraví: první, co zaplní celou kapacitu, jinak poslední.
   *
   * Rozlišují se DVĚ různá čísla, protože se pletou:
   *   available = `min(max-{id}-amount, zásoba)` – kolik hra pošle na JEDNU jízdu,
   *               tedy podle čeho se pozná plný náklad
   *   stock     = zásoba z popisku („Whisky: 5 165 146 L“) – z ní se počítá,
   *               na kolik plných jízd to vystačí
   * Z `available` počítat jízdy NELZE: `max-{id}-amount` je samo omezené
   * kapacitou, takže by z něj u plné zásoby vyšla vždycky jedna jízda.
   */
  function pickCargo(kind, d, capacity) {
    const zvazene = kind.cargo.map(o => {
      const el = d.querySelector('[data-id="' + o.id + '"]');
      if (!el) return null;
      const max = NS.parse.toNum((d.querySelector('.max-' + o.id + '-amount') || {}).textContent || '');
      const stock = stockOf(el);
      const kolik = [max, stock].filter(x => x != null);
      const zaklad = stock != null ? stock : max;
      return {
        ...o,
        stock,
        available: kolik.length ? Math.min(...kolik) : null,
        runs: capacity > 0 && zaklad != null ? Math.floor(zaklad / capacity) : null
      };
    }).filter(Boolean);

    if (!zvazene.length) return null;

    /*
     * !!! PRÁZDNÁ ZÁSOBA NENÍ NÁKLAD !!!
     * Dřív se při nenalezení plného nákladu vzal prostě POSLEDNÍ z nabídky, i když
     * na něm bylo nula. Odeslání pak hra odmítla hláškou, že množství musí být
     * aspoň 1 – a protože automatika zkouší dál, psalo to tu chybu pořád. Naživo
     * to nastalo, když uživatel prodal všechno.
     *
     * Vybírá se proto jen z toho, na čem doopravdy něco je. Když není nic, vrací
     * se `null` a nevypravuje se – není to chyba, jen není co poslat.
     */
    const maCo = zvazene.filter(o => (o.available || 0) > 0);
    if (!maCo.length) return null;

    const plny = maCo.find(o => capacity != null && o.available != null && o.available >= capacity);
    const vybrany = plny || maCo[maCo.length - 1];
    return { ...vybrany, full: !!plny };
  }

  /** Stav jednoho prostředku z jeho fragmentu. */
  async function unitState(kind, n) {
    const { status, raw } = await NS.parse.apiGet(kind.unit(n));
    if (status !== 200 || /"errors"/.test(raw.slice(0, 60))) return null;
    const d = doc(raw);
    const t = text(d);
    // jméno je v záhlaví modalu (`.box-h` = „Grasswing“); textContent se na to
    // spolehnout nedá – mezi tagy nemusí být mezera
    const head = d.querySelector('.box-h');
    const name = (head ? head.textContent.replace(/\s+/g, ' ').trim() : '')
      || (t.match(/^\S+/) || [])[0] || (kind.what + ' ' + n);

    let mode = 'idle';
    if (d.querySelector('[action$="/collect"]')) mode = 'collect';
    else if (d.querySelector('.shipSendDisabled')) mode = 'away';
    else if (d.querySelector('[action$="/send"]')) mode = 'send';

    const capacity = NS.parse.byRe(t, /Kapacita\s*:\s*(\d[\d\s .,]*)/i);
    return {
      n, name, mode, capacity,
      // náklad se čte i u prostředku, který je venku nebo čeká na sběr – počet
      // zbývajících jízd je informace o zásobě, ne o tom, kde právě je
      cargo: pickCargo(kind, d, capacity),
      money: NS.parse.byRe(t, /přivez\w*\s*([\d\s.,]+)\s*Kč/i),
      lost: NS.parse.byRe(t, /Přišel jsi o\s*([\d\s.,]+)\s*Kč/i)
    };
  }

  /**
   * Kompletní seznam. Vlastněné mají ID 1..(nejnižší buy − 1), nekoupené se
   * vezmou z fragmentu budovy včetně požadované úrovně – v mřížce jsou totiž
   * vidět jen prostředky, které právě někde stojí.
   */
  function load(kind, force) {
    const cur = states[kind.id];
    if (!force && cur && Date.now() - cur.at < STATE_TTL) return Promise.resolve(cur.list);
    if (inflight[kind.id]) return inflight[kind.id];
    inflight[kind.id] = doLoad(kind).finally(() => { inflight[kind.id] = null; });
    return inflight[kind.id];
  }

  async function doLoad(kind) {
    const stary = states[kind.id] ? states[kind.id].list : null;
    const { status, raw } = await NS.parse.apiGet(kind.building);
    if (status !== 200) return stary;
    const d = doc(raw);

    // nekoupené: buy/{id} + požadovaná úroveň z jejich karty
    const kupitelne = [];
    for (const el of d.querySelectorAll('[action*="' + kind.buy + '"]')) {
      const id = +(el.getAttribute('action') || '').split(kind.buy)[1];
      if (!id) continue;
      const karta = el.closest('.static-inv, [class*="holder"]');
      // v kartě je `.over-name` = „Aerofox Požadovaná úroveň letiště: 32“
      const jmeno = karta && karta.querySelector('.over-name');
      const t = karta ? karta.textContent.replace(/\s+/g, ' ') : '';
      kupitelne.push({
        n: id,
        name: (jmeno ? jmeno.textContent.replace(/\s+/g, ' ').split(/Požadovan|Kapacita/)[0].trim() : '')
          || (t.match(/^\s*(\S+)/) || [])[1] || (kind.what + ' ' + id),
        mode: 'locked',
        level: NS.parse.byRe(t, /úrov[^:]{0,20}:\s*(\d+)/i),   // „úroveň“, ne „úrovni“
        capacity: NS.parse.byRe(t, /Kapacita\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|tis\.?))?)/i)
      });
    }

    const prvniKupitelny = kupitelne.length ? Math.min(...kupitelne.map(p => p.n)) : 1;
    const vlastnene = [];
    for (let n = 1; n < prvniKupitelny; n++) {
      const u = await unitState(kind, n);
      if (u) vlastnene.push(u);
      await sleep(120);
    }

    const list = vlastnene.concat(kupitelne.sort((a, b) => a.n - b.n))
      .map(u => ({ ...u, label: kind.prefix + u.n }));
    states[kind.id] = { list, at: Date.now() };
    return list;
  }

  /** Obnoví jeden prostředek (po akci), bez čtení celé budovy. */
  async function refreshOne(kind, n) {
    const cur = states[kind.id];
    if (!cur) return;
    const fresh = await unitState(kind, n);
    if (!fresh) return;
    cur.list = cur.list.map(u => (u.n === n ? { ...u, ...fresh } : u));
  }

  /* ---- evidence výdělku --------------------------------------------------- */

  const PRAZDNY = { name: '', runs: 0, total: 0, lost: 0, first: null, last: null, cargo: {}, pending: null };

  const zapis = async (kind, n, uprav) => {
    const cely = NS.store.get().fleetLog || {};
    const podle = { ...(cely[kind.id] || {}) };
    podle[n] = uprav({ ...PRAZDNY, ...(podle[n] || {}) });
    await NS.store.put('fleetLog', { ...cely, [kind.id]: podle });
  };

  /**
   * Zapamatuje, co se právě vypravilo. Sebrané peníze totiž samy neříkají, z čeho
   * jsou – sběr je jiná událost než odeslání, a hra u peněz náklad neuvádí. Aby
   * šlo výdělek rozpadnout na whisky/pivo a pervitin/konopí, drží se u prostředku
   * `pending` a při sběru se peníze připíšou tomuhle nákladu.
   */
  async function logSend(kind, u, cargoId, cargoLabel, amount) {
    if (!cargoId) return;
    await zapis(kind, u.n, stav => ({
      ...stav,
      name: u.name || stav.name,
      pending: { id: cargoId, label: cargoLabel, amount: amount || 0, at: Date.now() }
    }));
  }

  /**
   * Přičte sebranou částku k danému prostředku. Evidence je per prostředek, ať
   * je vidět, kolik která loď / letadlo doopravdy vydělalo – hra nikde
   * nesčítá, kolik ti co přineslo.
   *
   * Vede se i `lost`: co odteklo pozdním sběrem (hra strhává 3 % za každých
   * 10 minut). To je jediné číslo, které jde vlastním chováním snížit na nulu.
   */
  async function logCollect(kind, u, money, lost) {
    if (!(money > 0) && !(lost > 0)) return;
    await zapis(kind, u.n, stav => {
      /*
       * Bez `pending` náklad neznáme – to je případ, kdy prostředek odešleš ručně
       * v herním okně a sebereš přes lištu. Radši „neznámo“ než tipovat.
       */
      const p = stav.pending || { id: 'unknown', label: 'neznámo', amount: 0 };
      const bucket = stav.cargo[p.id] || { label: p.label, runs: 0, total: 0, amount: 0 };
      return {
        ...stav,
        name: u.name || stav.name,
        runs: stav.runs + 1,
        total: stav.total + (money || 0),
        lost: stav.lost + (lost || 0),
        first: stav.first || Date.now(),
        last: Date.now(),
        cargo: {
          ...stav.cargo,
          [p.id]: {
            label: p.label || bucket.label,
            runs: bucket.runs + 1,
            total: bucket.total + (money || 0),
            amount: bucket.amount + (p.amount || 0)
          }
        },
        pending: null
      };
    });
  }

  /** Součty pro panel: řádky za prostředek, rozpad podle nákladu a celek. */
  function earnings() {
    const cely = NS.store.get().fleetLog || {};
    const radky = [];
    const naklady = {};

    for (const kind of KINDS) {
      const podle = cely[kind.id] || {};
      for (const id of Object.keys(podle)) {
        const z = podle[id];
        const cargo = Object.keys(z.cargo || {}).map(cid => ({
          id: cid, ...z.cargo[cid],
          perUnit: z.cargo[cid].amount > 0 ? z.cargo[cid].total / z.cargo[cid].amount : null
        })).sort((a, b) => b.total - a.total);

        for (const c of cargo) {
          const g = naklady[c.id] || { id: c.id, label: c.label, runs: 0, total: 0, amount: 0 };
          naklady[c.id] = {
            ...g,
            runs: g.runs + c.runs,
            total: g.total + c.total,
            amount: g.amount + c.amount
          };
        }

        radky.push({
          kind: kind.id,
          kindLabel: kind.row.replace(':', ''),
          label: kind.prefix + id,
          n: +id,
          name: z.name,
          runs: z.runs || 0,
          total: z.total || 0,
          lost: z.lost || 0,
          perRun: z.runs ? z.total / z.runs : 0,
          cargo,
          pending: z.pending || null,
          first: z.first,
          last: z.last
        });
      }
    }
    radky.sort((a, b) => b.total - a.total);

    /*
     * Náklad se dopočítává TEĎ, z aktuálních receptů – ne že by se zamrazil při
     * odeslání. Ceny vstupů si rozšíření čte ze hry, takže když se ve hře změní,
     * přepočítá se i minulost konzistentně. Zamrazená čísla by se rozjela s tím,
     * co ti hra ukazuje.
     */
    const recepty = NS.store.get().econ.recipes || [];
    const podleNakladu = Object.values(naklady).map(c => {
      const ek = NS.econ ? NS.econ.cargoEconomics(c.id, recepty) : null;
      const cena = ek && ek.cost != null ? ek.cost : null;
      const cost = cena != null ? cena * c.amount : null;
      const profit = cost != null ? c.total - cost : null;
      const r = ek && ek.recipeObj;
      const naJizdu = c.runs > 0 ? c.amount / c.runs : 0;
      return {
        ...c,
        unit: ek ? ek.unit : null,
        unitCost: cena,
        market: ek ? ek.market : null,
        cost,
        profit,
        margin: cost != null && c.total > 0 ? ((c.total - cost) / c.total) * 100 : null,
        perUnit: c.amount > 0 ? c.total / c.amount : null,
        unitProfit: cena != null && c.amount > 0 ? c.total / c.amount - cena : null,
        // průměr na jednu jízdu – tohle je to hlavní srovnání mezi surovinami
        amountPerRun: naJizdu,
        totalPerRun: c.runs > 0 ? c.total / c.runs : null,
        costPerRun: cost != null && c.runs > 0 ? cost / c.runs : null,
        profitPerRun: profit != null && c.runs > 0 ? profit / c.runs : null,
        // rozpad materiálu po vstupech (pšenice, chmel, tablety…)
        inputs: r && NS.econ ? NS.econ.inputsFor(r, c.amount) : [],
        inputsPerRun: r && NS.econ ? NS.econ.inputsFor(r, naJizdu) : [],
        // co by to vyneslo, kdybys to místo vožení prostě prodal
        ifSold: ek && ek.market != null ? ek.market * c.amount : null
      };
    }).sort((a, b) => (b.profit ?? b.total) - (a.profit ?? a.total));

    const cost = podleNakladu.reduce((s, c) => s + (c.cost || 0), 0);
    const znamyCost = podleNakladu.some(c => c.cost != null);
    const total = radky.reduce((s, r) => s + r.total, 0);

    return {
      rows: radky,
      byCargo: podleNakladu,
      total,
      cost: znamyCost ? cost : null,
      profit: znamyCost ? total - cost : null,
      lost: radky.reduce((s, r) => s + r.lost, 0),
      runs: radky.reduce((s, r) => s + r.runs, 0)
    };
  }

  /* ---- hlídání příletů ----------------------------------------------------- */

  /**
   * Kdo je venku a za jak dlouho se vrátí – z JEDNOHO fragmentu budovy.
   * Karta odeslaného prostředku je `.box-ins.acc-ins` a odpočet v ní je strojově
   * čitelný: `.timer-down[time-left-secs="158"]`. Kdo dorazil, má místo odpočtu
   * „Vybrat“ s `data-modal="/map/boat/2"`.
   *
   * Díky tomu se nemusí periodicky obvolávat každý prostředek zvlášť: stačí
   * jeden požadavek a z nejbližšího odpočtu se odvodí, kdy má smysl se ozvat
   * příště.
   */
  async function pollDispatched(kind) {
    const { status, raw } = await NS.parse.apiGet(kind.building);
    if (status !== 200) return null;
    const d = doc(raw);
    const timers = [];
    const arrived = [];
    for (const card of d.querySelectorAll('.box-ins.acc-ins')) {
      // v kartě je jméno a za ním „Náklad: …“
      const name = card.textContent.replace(/\s+/g, ' ').split(/Náklad/)[0].trim();
      const timer = card.querySelector('.timer-down[time-left-secs]');
      const modal = card.querySelector('[data-modal*="' + kind.unitPath + '"]');
      if (timer) timers.push({ name, secs: +timer.getAttribute('time-left-secs') || 0 });
      else if (modal) arrived.push(+String(modal.getAttribute('data-modal')).split('/').pop());
    }
    return { timers, arrived };
  }

  /*
   * Spodní hranice, ať se hra nezasype; horní jen kvůli přesynchronizování –
   * velké prostředky se vracejí i za 4 hodiny a čekat na ně jedním timeoutem
   * by bylo křehké (uspání stroje, drift).
   */
  /* ---- automatické sbírání a vypravování (volitelné, výchozí vypnuto) ------ */

  /*
   * !!! TOHLE KLIKÁ BEZ TVÉHO KLIKNUTÍ !!!
   * Se zaškrtnutým „auto“ v řádku se u prostředků samo sebere, co dorazilo,
   * a vypraví, co stojí doma. Používá se stejná cesta jako u tvého kliku –
   * fragment se vloží do herního okna a klikne se na skutečné tlačítko hry,
   * požadavek posílá hra. Rozdíl je jen v tom, že klik nespouštíš ty.
   *
   * Náklad se vybírá stejně jako ručně (dražší, pokud je na plný náklad dost),
   * výdělek se zapisuje do evidence stejně, a mezi akcemi je PEVNÁ prodleva.
   */
  const AUTO_GAP = 1200;
  const AUTO_MAX_PER_ROUND = 8;
  let autoBusy = false;

  /** Co je NASTAVENÉ u daného druhu (bez ohledu na hlavní vypínač). */
  const autoSet = kind => NS.store.get().read[kind.autoFlag] === true;

  /**
   * Co se SMÍ spustit. Hlavní vypínač (`autoPaused`) je hradlo nad jednotlivými
   * volbami – ty zůstávají, takže po zapnutí se rozjede přesně to, co bylo.
   */
  const autoOn = kind => autoSet(kind) && NS.store.get().read.autoPaused !== true;

  /**
   * Jedno kolo automatiky: nejdřív sebrat (dokud se peníze neseberou, hra
   * odeslání blokuje a navíc strhává pokutu), pak vypravit, co stojí doma.
   * Vrací počet provedených akcí.
   */
  async function autoRound() {
    if (autoBusy) return 0;
    if (NS.jail && NS.jail.blocked()) return 0;   // ve vězení se neklika
    const kinds = KINDS.filter(k => autoOn(k) && states[k.id]);
    if (!kinds.length) return 0;

    autoBusy = true;
    let hotovo = 0;
    try {
      for (const kind of kinds) {
        for (const rezim of ['collect', 'send']) {
          /*
           * !!! CO NEMÁ NÁKLAD, SE NEZKOUŠÍ VYPRAVIT !!!
           * Bez toho se klikne na „odeslat“ i s prázdnou zásobou, hra to odmítne
           * hláškou „musí být aspoň 1“ a automatika to hlásí každé kolo znovu.
           * Prázdná zásoba není chyba – jen není co poslat.
           */
          const kandidati = states[kind.id].list.filter(x => x.mode === rezim
            && (rezim !== 'send' || x.cargo));
          for (const u of kandidati) {
            if (hotovo >= AUTO_MAX_PER_ROUND) return hotovo;
            if (!autoOn(kind)) return hotovo;
            if (NS.jail && NS.jail.blocked()) {
              NS.gym.setStatus('⚠ auto zastaveno: vězení', true);
              return hotovo;
            }
            try {
              const co = await NS.gym.withSuspend(() => act(kind, u.n));
              if (co && co.money != null) await logCollect(kind, u, co.money, co.lost);
              if (co && co.cargo) await logSend(kind, u, co.cargo, cargoLabel(kind, co.cargo), co.amount);
              await refreshOne(kind, u.n);
              hotovo++;
              NS.gym.setStatus('auto ' + u.label + ' ' + (co && co.text ? co.text : ''));
            } catch (e) {
              // jeden neúspěch nesmí zabít celé kolo (mohl mezitím odletět)
              NS.gym.setStatus('⚠ auto ' + u.label + ': ' + e.message, true);
            }
            await sleep(AUTO_GAP);
          }
        }
      }
      return hotovo;
    } finally {
      autoBusy = false;
    }
  }

  const TICK_MIN = 20 * 1000;
  const TICK_MAX = 10 * 60 * 1000;
  let timer = null;
  let onTick = null;      // překreslení lišty (dodá gym.js přes watch())

  /** Doplní k prostředkům odpočet, ať ho jde ukázat v tooltipu. */
  function mergeTimers(kind, timers) {
    const cur = states[kind.id];
    if (!cur) return;
    cur.list = cur.list.map(u => {
      const t = timers.find(x => x.name === u.name);
      return { ...u, eta: t ? t.secs : (u.mode === 'away' ? u.eta : null) };
    });
  }

  /**
   * Jedno kolo hlídání. Vrací, za jak dlouho se ozvat příště – podle nejbližšího
   * příletu, ne podle pevného intervalu. Když nikdo není venku, nehlídá se nic:
   * prostředek doma se sám z místa nehne, ten stav změníš jen ty.
   */
  async function tick() {
    const cfg = NS.store.get().read;
    const zajem = KINDS.filter(k => cfg[k.flag] !== false && states[k.id]
      && states[k.id].list.some(u => u.mode === 'away'));
    if (!zajem.length) return null;

    let nejblizsi = null;
    let zmena = false;
    for (const kind of zajem) {
      const res = await pollDispatched(kind);
      if (!res) continue;
      mergeTimers(kind, res.timers);

      // dorazilo → přečti ten jeden prostředek, ať máme i částku do tooltipu
      for (const n of res.arrived) {
        const u = states[kind.id].list.find(x => x.n === n);
        if (!u || u.mode === 'collect') continue;
        await refreshOne(kind, n);
        zmena = true;
      }
      const cekajici = res.timers.map(t => t.secs).filter(s => s > 0);
      if (cekajici.length) {
        const min = Math.min(...cekajici);
        nejblizsi = nejblizsi == null ? min : Math.min(nejblizsi, min);
      }
    }

    if (zmena && onTick) onTick();
    return nejblizsi == null ? TICK_MAX : Math.min(TICK_MAX, Math.max(TICK_MIN, (nejblizsi + 3) * 1000));
  }

  /**
   * Zapne hlídání. Neběží na pevný interval – po každém kole se naplánuje na
   * nejbližší přílet (+3 s), takže se zelené tlačítko objeví hned, jak něco
   * přiletí, a mezitím se hra nedotazuje zbytečně. Na skryté kartě se čekání
   * přeskočí – nemá komu co ukazovat.
   */
  function watch(repaint) {
    onTick = repaint;
    const plan = ms => {
      clearTimeout(timer);
      timer = setTimeout(run, Math.max(TICK_MIN, ms || TICK_MAX));
    };
    const run = async () => {
      if (document.hidden) return plan(TICK_MIN);
      let dalsi = null;
      try {
        dalsi = await tick();
        /*
         * Automatika musí běžet i tehdy, když `tick()` nic nenaplánoval – to je
         * přesně stav „všechno stojí doma a čeká na odeslání“, kdy není co
         * hlídat, ale je co udělat.
         */
        /*
         * I doprava jde přes frontu – má vlastní časovač (načasovaný na přílety),
         * takže by se s pětisekundovým tikem jinak potkávala na slepo.
         */
        /*
         * Při globální pauze se do fronty nezařazuje nic – jinak by řádek v liště
         * hlásil „teď doprava“, přestože `autoRound()` hned skončí (viz gym.js).
         */
        /*
         * Zámek na jednu kartu platí i tady: `queue.run` v kartě bez zámku
         * neudělá nic, takže se `autoRound()` nesmí volat mimo frontu.
         */
        const pauza = NS.store.get().read.autoPaused === true;
        const udelano = pauza ? 0
          : (NS.queue ? await NS.queue.run('doprava', () => autoRound()) : 0);
        if (udelano) {
          if (onTick) onTick();
          dalsi = TICK_MIN;      // po akci se stav mění, ať se přepočítá dřív
        }
      } catch (e) { /* hra neodpověděla – zkusí se zas za chvíli */ }
      plan(dalsi);
    };
    plan(TICK_MIN);
    // po návratu na kartu se zkontroluje hned, ne až za pět minut
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) plan(1000);
    });
  }

  /* ---- akce --------------------------------------------------------------- */

  /**
   * Provede to, co je právě na řadě. Fragment se vloží do herního kontejneru
   * a klikne se na skutečné tlačítko – požadavek posílá hra.
   */
  async function act(kind, n) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const { status, raw } = await NS.parse.apiGet(kind.unit(n));
    if (status !== 200) throw new Error(kind.what + ' nelze přečíst (HTTP ' + status + ')');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(150);   // ať se poskládá layout, handlery čtou offset()

      const sebrat = box.querySelector('[action$="/collect"]');
      if (sebrat) {
        /*
         * Částka se čte z ČERSTVÉHO fragmentu, ne ze zapamatovaného stavu –
         * u pozdního sběru hra průběžně strhává 3 % za každých 10 minut, takže
         * zapamatované číslo už nemusí platit.
         */
        const t2 = box.textContent.replace(/\s+/g, ' ');
        const money = NS.parse.byRe(t2, /přivez\w*\s*([\d\s.,]+)\s*Kč/i);
        const lost = NS.parse.byRe(t2, /Přišel jsi o\s*([\d\s.,]+)\s*Kč/i);
        sebrat.click();
        await sleep(300);
        return { text: 'sebráno' + (money ? ' ' + NS.fmt.kc(money) : ''), money, lost };
      }

      // stav v liště mohl zestárnout – ať se nevypravuje něco, co už je venku
      if (box.querySelector('.shipSendDisabled')) throw new Error(kind.what + ' ' + kind.awayTitle);

      const odeslat = box.querySelector('[action$="/send"]');
      if (!odeslat) throw new Error(kind.what + ' teď nic nenabízí');


      // náklad se vybere z ČERSTVÉHO fragmentu, ne ze zestaralé lišty
      // (pickCargo si vystačí s čímkoli, co umí querySelector – tedy i s prvkem)
      const naklad = pickCargo(kind, box, capacityOf(box));

      /*
       * !!! BEZ NÁKLADU SE NEODESÍLÁ !!!
       * `odeslat.click()` se dřív provedl vždycky, i když nebylo co poslat – hra
       * to odmítla hláškou, že množství musí být aspoň 1, a automatika to
       * zkoušela pořád znovu. Prázdná zásoba není chyba, jen není co vypravit,
       * takže se to řekne a nekliká se.
       */
      if (!naklad) {
        throw new Error(kind.what + ' nemá co vypravit – zásoby jsou prázdné');
      }

      const volba = box.querySelector('[data-id="' + naklad.id + '"]');
      if (volba) {
        volba.click();     // hra tím zároveň nastaví množství na max
        await sleep(120);
      }

      odeslat.click();
      await sleep(300);
      return {
        text: naklad ? 'vypraveno – ' + naklad.label : 'vypraveno',
        cargo: naklad ? naklad.id : null,
        amount: naklad ? naklad.available : null
      };
    } finally {
      box.remove();
    }
  }

  /** Kapacita z vloženého fragmentu (živý DOM, ne parsovaný dokument). */
  const capacityOf = box => NS.parse.byRe(
    box.textContent.replace(/\s+/g, ' '), /Kapacita\s*:\s*(\d[\d\s .,]*)/i);

  /* ---- řádky v liště ------------------------------------------------------ */

  /**
   * Stav nese barva, ne text – tlačítka jsou tak úzká, že se jich do lišty vejde
   * celá flotila. Slovní popis je v tooltipu tlačítka, v legendě u popisku řádku
   * a po akci se vypíše v liště, takže barva není jediná cesta k informaci.
   * Zámek u nekoupených zůstává, ten se pozná na první pohled.
   */
  const MODE_CLASS = {
    collect: 'cmc-gym-unit-ready',     // zeleně: čekají peníze
    send: 'cmc-gym-unit-send',         // vínově: dá se vypravit
    away: 'cmc-gym-unit-away',         // šedě, vypnuté: je venku
    locked: 'cmc-gym-btn-link',        // tmavě, vypnuté, se zámkem
    idle: 'cmc-gym-unit-away'
  };

  /*
   * Za lomítkem je počet zbývajících plných jízd („L1/12“). Strop je 99, aby
   * z tlačítka nebyl u velkých zásob pětimístný údaj – přesné číslo je
   * v tooltipu. Nekoupené mají zámek a žádné číslo.
   */
  const RUNS_MAX = 99;

  function labelFor(kind, u) {
    if (u.mode === 'locked') return u.label + ' 🔒';
    /*
     * Prostředek doma bez nákladu (všechno prodáno) dostane `/–`. Samotné „L1“
     * by vypadalo stejně jako kterýkoli jiný stav bez čísla, a přitom je to
     * jediný případ, kdy je tlačítko vypnuté, i když je prostředek doma.
     */
    if (u.mode === 'send' && !u.cargo) return u.label + '/–';
    const runs = u.cargo && u.cargo.runs;
    return u.label + (runs != null ? '/' + Math.min(RUNS_MAX, runs) : '');
  }

  /** Slovní stav – do tooltipu a do hlášky v liště. */
  function stateWord(kind, u) {
    if (u.mode === 'collect') return 'sebrat';
    if (u.mode === 'send') return u.cargo ? u.cargo.label : 'prázdno';
    if (u.mode === 'away') return kind.away;
    if (u.mode === 'locked') return 'nekoupené';
    return '—';
  }

  /** Legenda k barvám a číslu – visí na popisku řádku, ať nezabírá místo. */
  const legend = kind => kind.row.replace(':', '')
    + ': za lomítkem je počet zbývajících plných jízd (strop 99, přesně v tooltipu).'
    + ' Zeleně = přivezlo peníze (sebrat), vínově = dá se vypravit'
    + ' (v tooltipu je náklad), oranžový rámeček = náklad nebude plný,'
    + ' šedě = ' + kind.awayTitle + ', 🔒 = ještě není koupené';

  /**
   * Odpočet do příletu. `fmt.dur` se tu nehodí – zaokrouhluje na minuty, takže
   * u 158 s tvrdí „3 min“, i když jsou to 2:38. Hra sama ukazuje hodiny, minuty
   * a sekundy, tak se to drží stejně.
   */
  function etaText(sec) {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const dd = n => String(n).padStart(2, '0');
    return (h ? h + ':' + dd(m) : m) + ':' + dd(s % 60);
  }

  /** Kolik plných jízd zásoba unese – i s přesným číslem nad stropem. */
  function runsPart(u) {
    const c = u.cargo;
    if (!c || c.runs == null) return '';
    if (!c.runs) return '; zásoba ' + c.label + ' nestačí ani na jednu plnou jízdu';
    return '; zásoba ' + c.label + ' vystačí na ' + NS.fmt.num(c.runs)
      + ' ' + NS.fmt.plural(c.runs, 'plnou jízdu', 'plné jízdy', 'plných jízd');
  }

  function titleFor(kind, u) {
    if (u.mode === 'locked') {
      return u.name + ': ještě není koupené'
        + (u.level ? ' (potřeba úroveň ' + u.level + ')' : '')
        + (u.capacity ? ', kapacita ' + NS.fmt.num(u.capacity) : '');
    }
    const zaklad = u.name + (u.capacity ? ', kapacita ' + NS.fmt.num(u.capacity) : '');
    if (u.mode === 'collect') {
      return zaklad + ' – sebere peníze'
        + (u.money ? ' (' + NS.fmt.kc(u.money) + ')' : '')
        + (u.lost ? '; pozdním sběrem už přišlo o ' + NS.fmt.kc(u.lost) : '')
        + runsPart(u);
    }
    if (u.mode === 'send') {
      /*
       * Bez nákladu se vypravit NEDÁ: hra odmítne odeslání hláškou, že množství
       * musí být aspoň 1. Tlačítko je proto vypnuté a tooltip řekne proč – dřív
       * tam stálo „vypraví se“, což bylo zavádějící.
       */
      if (!u.cargo) return zaklad + ' – nemá co vypravit (zásoby jsou prázdné)';
      return zaklad + ' – vypraví ' + u.cargo.label
        + (u.cargo.full ? ' (plný náklad)'
          : ' (jen ' + NS.fmt.num(u.cargo.available) + ' – na plný náklad nestačí)')
        + runsPart(u);
    }
    if (u.mode === 'away') {
      return zaklad + ' – ' + kind.awayTitle
        + (u.eta > 0 ? ', vrátí se za ' + etaText(u.eta) : '') + runsPart(u);
    }
    return zaklad + ' – nic k akci' + runsPart(u);
  }

  /** Jeden řádek lišty pro daný druh dopravy. */
  function row(kind, onChange) {
    const cur = states[kind.id];
    if (!cur) {
      // první vykreslení: stav se dotáhne a lišta se pak překreslí
      load(kind).then(list => { if (list) onChange(); }).catch(() => {});
      return null;
    }
    // stav zestárl (mohlo se vrátit) – dotáhne se na pozadí
    if (Date.now() - cur.at >= STATE_TTL) load(kind).then(() => onChange()).catch(() => {});

    const wrap = document.createElement('div');
    wrap.className = 'cmc-gym-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = kind.row;
    label.title = legend(kind);
    wrap.appendChild(label);

    for (const u of cur.list) {
      // vypravit se dá jen s nákladem – prázdná zásoba tlačítko vypne
      const akcni = u.mode === 'collect' || (u.mode === 'send' && !!u.cargo);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-gym-unit ' + (MODE_CLASS[u.mode] || MODE_CLASS.idle);
      b.textContent = labelFor(kind, u);
      b.title = titleFor(kind, u);
      b.disabled = !akcni;
      // částečný náklad není chyba, ale ať to jde poznat bez otevírání tooltipu
      if (u.mode === 'send' && u.cargo && !u.cargo.full) b.classList.add('cmc-gym-unit-partial');

      if (akcni) {
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (b.disabled) return;
          b.disabled = true;
          NS.gym.setStatus(u.label + ': ' + stateWord(kind, u) + '…');
          try {
            // suspend drží lištu na místě, dokud klik neproběhne
            const co = await NS.gym.withSuspend(() => act(kind, u.n));
            if (co && co.money != null) await logCollect(kind, u, co.money, co.lost);
            if (co && co.cargo) await logSend(kind, u, co.cargo, cargoLabel(kind, co.cargo), co.amount);
            await refreshOne(kind, u.n);
            // až po odblokování suspendu, jinak by `collect()` vyskočil naprázdno
            setTimeout(() => {
              onChange();
              NS.gym.setStatus(u.label + ' ' + (co && co.text ? co.text : ''));
            }, 300);
          } catch (e) {
            NS.gym.setStatus('⚠ ' + u.label + ': ' + e.message, true);
            b.disabled = false;
          }
        });
      }
      wrap.appendChild(b);
    }

    wrap.appendChild(autoBox(kind, onChange));
    return wrap;
  }

  /**
   * Zaškrtávátko na konci řádku. Je to jediná věc v řádku, která klikne bez
   * tebe, takže je vidět přímo tady – ne schovaná v nastavení.
   */
  function autoBox(kind, onChange) {
    const zapnuto = autoSet(kind);
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává zapnutá. '
      : '') + (zapnuto
      ? 'Automatika je ZAPNUTÁ: jak něco doletí, samo se sebere, a co stojí doma, '
        + 'se samo vypraví (' + kind.cargo[0].label + ', jinak ' + kind.cargo[kind.cargo.length - 1].label
        + '). Klikání nespouštíš ty – odškrtnutím to hned přestane.'
      : 'Zapne automatiku: jak něco doletí, samo se sebere, a co stojí doma, se '
        + 'samo vypraví. Pozor, tohle klikne BEZ tvého kliknutí.');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { [kind.autoFlag]: cb.checked });
      onChange();
    });

    const txt = document.createElement('span');
    txt.textContent = zapnuto && pozastaveno ? 'auto ⏸' : 'auto';

    wrap.append(cb, txt);
    return wrap;
  }

  /** Řádky pro zapnuté druhy dopravy (letadla, lodě). */
  function rows(onChange) {
    const cfg = NS.store.get().read;
    return KINDS.filter(k => cfg[k.flag] !== false).map(k => row(k, onChange));
  }

  NS.fleet = {
    rows, row, load, act, refreshOne, unitState, pickCargo, kindById, KINDS,
    watch, tick, pollDispatched, etaText, logCollect, logSend, earnings,
    autoRound, autoOn, autoSet,
    get states() { return states; }
  };
})();
