/* =============================================================================
 * gym.js – lišta s tréninkovými tlačítky (posilovna #26, kasárna #20)
 *
 * Obě budovy mají tlačítko „Trénovat“ až za popisem a cenami, takže se mezi
 * nimi jinak dá jen scrollovat. Lišta u spodní hrany je dá na jedno místo.
 *
 * !!! JAK TO FUNGUJE A KDE JE HRANICE !!!
 * Lišta má VLASTNÍ tlačítka. Klik se přepošle na odpovídající tlačítko hry
 * (`orig.click()`), takže rozšíření samo neposílá do hry žádný požadavek –
 * jen předá tvůj klik prvku, který na stránce je. Jeden tvůj klik = jedna akce.
 *
 * VÝJIMKA: „automatický trénink“ na konci tohoto souboru. Ten na časovač klikne
 * bez tvého kliknutí. Je výchozí vypnutý, v liště má viditelný odznak a jde
 * zastavit – ale je to automatizace hry, ne jen zjednodušení klikání.
 *
 * Přemísťovat herní tlačítka do lišty nefunguje: hra klik obsluhuje delegovaným
 * listenerem na svém kontejneru, takže tlačítko vytržené pod `body` přestane
 * reagovat. Proto originály zůstávají, kde jsou.
 *
 * Turbo varianty (za diamanty) v liště nejsou, aby se drahé tlačítko nedalo
 * zmáčknout omylem.
 *
 * !!! REŽIM „TRÉNOVAT ODKUDKOLI“ (volitelný, výchozí vypnuto) !!!
 * Mimo budovu žádné herní tlačítko na stránce není. Se zapnutou volbou si ho
 * rozšíření na tvůj klik doplní do herního modálního kontejneru, klikne a hned
 * uklidí. Požadavek posílá pořád hra – ověřeno v síťovém logu
 * (`POST /map/building/gym/… → 200`, `POST /map/building/army/… → 200`).
 * Funkčně je to „otevři budovu na pozadí“, tedy nejblíž automatizaci, co tu je.
 *
 * Dva režimy, protože handlery hry nejsou stejně tolerantní:
 *   local    – vyrobí se jen odkaz s `action` (rychlé, stačí posilovně)
 *   fragment – vloží se celý fragment budovy a klikne se na skutečné tlačítko
 *              v něm; kasárna to potřebují, protože handler volá
 *              `.parents('.army-item')`, `offset()` a `after()`, takže na
 *              osamocený odkaz vůbec nezareaguje
 *
 * Tlačítka ve hře:
 *   a.trainGym[action=/map/building/gym/{speed|strength|defense}]
 *   a.trainArmy[action=/map/building/army/{army_guards|army_warriors}]
 *   …/{2|10|100|1000|10000} = Turbo (nebereme)
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BAR_ID = 'cmc-gym-bar';
  const TRAIN = '[action*="/map/building/gym/"], [action*="/map/building/army/"]';

  /** Skupiny tréninků: jedna budova = jedna skupina tlačítek v liště. */
  const GROUPS = [
    {
      id: 'gym',
      label: 'Posilovna',
      icon: '🏋',
      url: '/map/building/show/26',
      base: '/map/building/gym/',
      cls: 'btn btn-danger btn-sm trainGym',
      remote: true,
      remoteMode: 'local',   // stačí vyrobený odkaz – rychlé
      items: [
        { key: 'speed', label: 'Rychlost' },
        { key: 'strength', label: 'Síla' },
        { key: 'defense', label: 'Obrana' }
      ],
      // ceny pro odečtení z HUD („-35 -3 -6Kč“ u sekce)
      costRe: {
        speed: /Rychlost[^-]{0,60}?-\s*(\d[\d\s]*)\s*-\s*(\d[\d\s]*)\s*-\s*([\d\s.,]+)\s*Kč/i,
        strength: /Síla[^-]{0,60}?-\s*(\d[\d\s]*)\s*-\s*(\d[\d\s]*)\s*-\s*([\d\s.,]+)\s*Kč/i,
        defense: /Obrana[^-]{0,60}?-\s*(\d[\d\s]*)\s*-\s*(\d[\d\s]*)\s*-\s*([\d\s.,]+)\s*Kč/i
      }
    },
    {
      id: 'army',
      label: 'Kasárna',
      icon: '🎖',
      url: '/map/building/show/20',
      base: '/map/building/army/',
      cls: 'btn btn-danger btn-sm trainArmy',
      remote: true,
      /*
       * Kasárna potřebují celý fragment: handler dělá `.parents('.army-item')`
       * a `offset()`, takže vyrobený odkaz v prázdném divu ignoruje. S vloženým
       * fragmentem projde `POST … → 200` a strážci narostou (ověřeno).
       */
      remoteMode: 'fragment',
      items: [
        { key: 'army_guards', label: 'Strážci' },
        { key: 'army_warriors', label: 'Bojovníci' }
      ]
    }
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** Kontejner, do kterého hra sama lije obsah otevřené budovy. */
  const gameHost = () =>
    document.querySelector('.modal-box.main-box') || document.querySelector('.modal-box');

  /** Rozpad action → { group, key, mult }. Turbo má mult > 1. */
  function parseAction(el) {
    const a = el.getAttribute('action') || '';
    for (const g of GROUPS) {
      const i = a.indexOf(g.base);
      if (i === -1) continue;
      const rest = a.slice(i + g.base.length).split('?')[0];
      const [key, mult] = rest.split('/');
      if (!g.items.some(x => x.key === key)) continue;
      return { group: g.id, key, mult: mult ? +mult : 1 };
    }
    return null;
  }

  const groupById = id => GROUPS.find(g => g.id === id);

  /** Základní tréninková tlačítka na stránce (bez Turba), podle klíče akce. */
  function findButtons() {
    const out = {};
    for (const el of document.querySelectorAll(TRAIN)) {
      if (el.closest('#' + BAR_ID) || el.closest('.cmc-gym-offscreen')) continue;
      const info = parseAction(el);
      if (!info || info.mult !== 1) continue;
      if (!out[info.key]) out[info.key] = el;
    }
    return out;
  }

  /* ---- odečítání HUD ------------------------------------------------------ */

  let costCache = null;
  let costAt = 0;
  const COST_TTL = 60 * 1000;      // ceny se mění s úrovní budovy

  function resetCosts() {
    costCache = null;
    costAt = 0;
  }

  /** Ceny tréninku z fragmentu budovy: { key: {awake, energy, money} }. */
  async function loadCosts() {
    if (costCache && Date.now() - costAt < COST_TTL) return costCache;
    const g = groupById('gym');
    const { status, raw } = await NS.parse.apiGet(g.url);
    if (status !== 200) return null;
    const text = NS.parse.flatten(new DOMParser().parseFromString(raw, 'text/html'));
    const out = {};
    for (const key in g.costRe) {
      const m = text.match(g.costRe[key]);
      // pořadí ve hře: štěstí, energie, peníze („-50 -3 -25Kč“)
      if (m) out[key] = { awake: NS.parse.toNum(m[1]), energy: NS.parse.toNum(m[2]), money: NS.parse.toNum(m[3]) };
    }
    costCache = Object.keys(out).length ? out : null;
    costAt = Date.now();
    return costCache;
  }

  /**
   * Číslo v prvku HUD posune o `delta`. Čte se VŽDY aktuální hodnota – hra mohla
   * mezitím HUD sama obnovit (energie se regeneruje) a pak se má odečítat od
   * toho nového čísla. Formát se drží podle původního textu.
   */
  function bump(el, delta) {
    if (!el || !delta) return;
    const cur = NS.parse.toNum(el.textContent);
    if (cur == null) return;
    const next = Math.max(0, cur + delta);
    const mezery = /[\s ]/.test(el.textContent.trim());
    el.textContent = mezery || next >= 1000
      ? String(Math.round(next)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
      : String(Math.round(next * 100) / 100);
  }

  /**
   * Hra po tréninku na pozadí HUD nepřekreslí (dělá to jen s otevřeným modalem
   * a její funkce jsou v jiném světě), takže cenu odečteme sami.
   *   .value.renew-energy → energie   .value.renew-awake → ŠTĚSTÍ
   * Pozor na jméno: hra tomu v DOM říká `awake`, ale v HUD to má ikonu
   * `resources-happy` a je to štěstí – ne bdělost. Klíč `awake` se drží podle
   * hry, texty mluví o štěstí.
   *   .mparam s currency-money → čisté peníze
   */
  function subtractCost(key) {
    const c = costCache && costCache[key];
    if (!c) return;
    // maximum se odvodí, DOKUD je ukazatel ještě v souladu s číslem
    const max = readEnergyMax();
    bump(document.querySelector('.value.renew-energy'), -c.energy);
    bump(document.querySelector('.value.renew-awake'), -c.awake);
    syncEnergyBar(max);
    const money = Array.from(document.querySelectorAll('.mparam'))
      .find(e => !e.closest('#' + BAR_ID) && e.querySelector('[class*="currency-money"]:not([class*="dirty"])'));
    if (money) {
      const val = Array.from(money.querySelectorAll('*')).find(x => !x.children.length && /\d/.test(x.textContent));
      bump(val || money, -c.money);
    }
  }

  /* ---- trénink ------------------------------------------------------------ */

  /*
   * Počítadlo, ne vypínač: akce mohou skončit v jiném pořadí, než začaly, a
   * jeden boolean by překreslení pustil hned po první z nich – tedy uprostřed
   * cizího kliknutí. Fronta (queue.js) drží akce za sebou, ale doprava má
   * vlastní časovač, takže překryv se pořád stát může.
   */
  let suspendDepth = 0;
  const isSuspended = () => suspendDepth > 0;

  /**
   * Po dobu akce se lišta nepřerenderovává – jinak by se tlačítko pod rukou
   * vyměnilo za nové (a odložený `collect()` by proběhl uprostřed kliknutí).
   * Používá to i fleet.js.
   */
  /*
   * Pojistka: akce, která by nikdy nedoběhla (hra neodpoví a promise zůstane
   * viset), by s počítadlem zablokovala překreslení lišty NAVŽDY – dřív to
   * shodou okolností nevadilo, protože vypínač pustil kdokoli. Limit je proto
   * velkorysý, ale konečný: nejdelší legitimní držení je dávka zahrad
   * (40 polí × 2 kliky × 350 ms ≈ 28 s).
   */
  const SUSPEND_MAX = 90 * 1000;

  async function withSuspend(fn) {
    let uvolneno = false;
    const uvolni = () => {
      if (uvolneno) return;
      uvolneno = true;
      suspendDepth = Math.max(0, suspendDepth - 1);
    };
    suspendDepth++;
    const pojistka = setTimeout(uvolni, SUSPEND_MAX);
    try {
      return await fn();
    } finally {
      setTimeout(() => { clearTimeout(pojistka); uvolni(); }, 250);
    }
  }

  const trainRemote = key => withSuspend(() => doTrain(key));

  /**
   * Tréninkové tlačítko hry vyrobené lokálně – je to prostý odkaz s atributem
   * `action`, žádný token, takže není co stahovat (dřív se kvůli tomu tahal celý
   * fragment budovy, což byla ta pomalá odezva).
   */
  function makeGameButton(key) {
    const g = GROUPS.find(x => x.items.some(i => i.key === key));
    const a = document.createElement('a');
    a.href = '#';
    a.setAttribute('action', location.origin + g.base + key);
    a.className = g.cls;
    a.textContent = 'Trénovat';
    return a;
  }

  async function doTrain(key) {
    const host = gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');
    const g = GROUPS.find(x => x.items.some(i => i.key === key));

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';

    if (g.remoteMode === 'fragment') {
      // handler hry potřebuje okolí z fragmentu, ne jen odkaz
      const { status, raw } = await NS.parse.apiGet(g.url);
      if (status !== 200) throw new Error(g.label + ': HTTP ' + status);
      box.innerHTML = raw;
      host.appendChild(box);
      await sleep(150);        // ať se poskládá layout (handler čte offset())
      const btn = Array.from(box.querySelectorAll(TRAIN)).find(el => {
        const i = parseAction(el);
        return i && i.key === key && i.mult === 1;
      });
      if (!btn) {
        box.remove();
        throw new Error('tlačítko „Trénovat“ ve fragmentu není');
      }
      try {
        btn.click();
        await sleep(300);
      } finally {
        box.remove();
      }
      return true;
    }

    box.appendChild(makeGameButton(key));
    host.appendChild(box);
    try {
      box.firstChild.click();   // klik obslouží delegace hry, požadavek pošle hra
      await sleep(120);
    } finally {
      box.remove();
    }
    return true;
  }

  /* ---- lišta -------------------------------------------------------------- */

  let bar = null;
  let statusEl = null;

  function removeBar() {
    if (bar) bar.remove();
    bar = null;
    statusEl = null;
    queueEl = null;
    kartaEl = null;
    document.body.classList.remove('cmc-gym-padded');
  }

  /** Text stavu – potřebuje ho crimes.js, aby hláška přežila přerender. */
  const statusText = () => (statusEl ? statusEl.textContent : '');

  /*
   * Poslední hláška se pamatuje i mimo DOM, protože přerender ji jinak smaže –
   * a přerender spustí každá změna v okně hry, včetně chybového okna, které tu
   * hlášku zavinilo („zahrady: hra dovolí osít jen 17…“ zmizelo přesně takhle).
   * Přenáší se jen chvíli: stará hláška v liště nemá co dělat.
   */
  let lastStatus = { text: '', err: false, at: 0 };
  const STATUS_TTL = 15 * 1000;

  /** Vpravo v liště je místo jen pro chybu, žádné počty. */
  function setStatus(text, isErr) {
    lastStatus = { text: text || '', err: !!isErr, at: Date.now() };
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('cmc-gym-err-text', !!isErr);
  }

  /*
   * Řádek „co právě běží“. Aktualizuje se sám na vlastním časovači, ne
   * překreslením lišty: fronta se mění po stovkách milisekund a překreslovat
   * kvůli tomu celou lištu by bylo špatně (a `withSuspend` to během akce blokuje –
   * tedy právě tehdy, kdy je ten text nejzajímavější). Mění se jen text, takže
   * observer to ignoruje (filtruje změny uvnitř lišty).
   */
  let queueEl = null;
  let frontaEl = null;      // obal sloupce fronty – skrývá se, když nic neběží
  let kartaEl = null;       // fajfka „hraje tady“ (vstup uvnitř `.cmc-gym-karta`)

  /**
   * Fajfka „hraje tady“ – ruční přebití zámku mezi kartami.
   *
   * Zámek se jinak předává jen vypršením (20 s bez ozvání), což nestačí ve dvou
   * případech popsaných v queue.js: u sirotka po reloadu rozšíření se zámek
   * nevezme NIKDY a v liště přitom svítí „běží v jiné kartě“, takže to vypadá
   * na cizí kartu, i když žádná není. Fajfka z toho dělá rozhodnutí uživatele:
   * zaškrtnu = hraje se tady, ostatní karty se samy stáhnou.
   *
   * Není to uložené nastavení, ale stav TÉHLE karty – proto nejde do storage
   * (ta je společná a přepnula by i ostatní).
   */
  function kartaBox() {
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-karta';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.addEventListener('change', async () => {
      if (inp.checked) await NS.queue.prevezmi().catch(() => {});
      else await NS.queue.vzdejSe().catch(() => {});
      syncQueue();
    });
    wrap.appendChild(inp);

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'hraje tady';
    wrap.appendChild(txt);
    kartaEl = wrap;
    return wrap;
  }

  /**
   * Spodní řádek se dvěma sloupci: vlevo STAV AKCE (co se právě stalo), vpravo
   * FRONTA (co se právě dělá a co čeká).
   *
   * Dřív byl stav akce nalepený na konci řádku tréninku a fronta měla řádek
   * vlastní. Vedle sebe dávají větší smysl: obojí je průběžná informace o tomtéž
   * a nemusí se pak přeskakovat očima přes celou lištu.
   *
   * Sloupce se nepřebíjejí, protože každý říká něco jiného – stav je HISTORIE
   * (co se stalo naposledy), fronta je PŘÍTOMNOST (co běží teď).
   */
  function stavRow() {
    const row = document.createElement('div');
    row.className = 'cmc-gym-row cmc-gym-stav-row';

    statusEl = document.createElement('span');
    statusEl.className = 'cmc-gym-status';
    statusEl.title = 'Co se stalo naposledy – píší sem všechny moduly,'
      + ' takže poslední akce přepíše předchozí.';
    row.appendChild(statusEl);
    restoreStatus();

    if (NS.queue) {
      frontaEl = document.createElement('span');
      frontaEl.className = 'cmc-gym-fronta';

      const label = document.createElement('span');
      label.className = 'cmc-gym-label';
      label.textContent = 'Automatika:';
      label.title = 'Automatika kliká jednu věc po druhé – tady je vidět kterou.'
        + ' Rostoucí počet sekund u běžící akce znamená, že se něco drhne.';
      frontaEl.appendChild(label);

      queueEl = document.createElement('span');
      queueEl.className = 'cmc-gym-queue';
      frontaEl.appendChild(queueEl);
      frontaEl.appendChild(kartaBox());
      row.appendChild(frontaEl);
      syncQueue();
    }
    return row;
  }

  /**
   * Přepíše text řádku, když se změnil. Pauza má přednost nad vším ostatním –
   * je to ta jediná informace, kterou v tu chvíli chceš vidět.
   */
  function syncQueue() {
    if (!queueEl || !NS.queue) return;
    /*
     * Sloupec fronty se schová, když není zapnutá žádná automatika – jinak by
     * tam pořád svítilo „klidno“. Stav akce vlevo zůstává vždycky.
     */
    if (frontaEl) frontaEl.classList.toggle('cmc-gym-fronta-skryta', !queueVisible());
    const pauza = autoPaused();
    const r = NS.queue.radek();
    /*
     * Běžící akce se při pauze dokončuje (přerušit klik uprostřed by nechalo hru
     * v rozdělaném stavu), takže se to řekne – jinak by „pozastaveno“ a zároveň
     * viditelná činnost vypadaly jako chyba.
     */
    const jinde = !!(NS.queue && !NS.queue.mamZamek);
    const text = pauza
      ? 'pozastaveno' + (r.running ? ' · dobíhá ' + r.running : '')
      : r.text;
    if (queueEl.textContent !== text) queueEl.textContent = text;
    queueEl.classList.toggle('cmc-gym-queue-on', !pauza && !jinde && r.aktivni);
    queueEl.classList.toggle('cmc-gym-queue-paused', pauza && !jinde);
    // zámek má přednost: v téhle kartě se nekliká, i kdyby nebyla pauza
    queueEl.classList.toggle('cmc-gym-queue-jinde', jinde && !pauza);
    queueEl.title = jinde && NS.queue ? NS.queue.popis() : '';

    /*
     * Fajfka jen ZRCADLÍ skutečný stav zámku – když ho přebere jiná karta, tady
     * se sama odškrtne. Přiřazuje se jen při změně, aby se uživateli nepřepisovalo
     * pod rukou to, na co zrovna kliká.
     */
    if (kartaEl) {
      const inp = kartaEl.querySelector('input');
      const hraje = !!NS.queue.mamZamek;
      if (inp && inp.checked !== hraje) inp.checked = hraje;
      // sirotek zámek nedostane, ať fajfku přepneš jakkoli – radši ji zamknout
      const sirotek = NS.queue.sirotek();
      if (inp && inp.disabled !== sirotek) inp.disabled = sirotek;
      kartaEl.classList.toggle('cmc-gym-karta-on', hraje);
      kartaEl.title = hraje
        ? 'Automatika hraje v téhle kartě. Odškrtnutím ji tu vypneš (ruční'
          + ' tlačítka fungují dál).'
        : NS.queue.popis();
    }
  }

  /** Obnoví hlášku do právě vyrobeného `statusEl`. */
  function restoreStatus() {
    if (!statusEl || !lastStatus.text) return;
    if (Date.now() - lastStatus.at > STATUS_TTL) return;
    statusEl.textContent = lastStatus.text;
    statusEl.classList.toggle('cmc-gym-err-text', lastStatus.err);
  }

  /** Aktuální energie z HUD (lokální DOM, žádný požadavek do hry). */
  function readEnergy() {
    const el = document.querySelector('.value.renew-energy');
    return el ? NS.parse.toNum(el.textContent) : null;
  }

  /**
   * Energie v procentech. Nemusí se nic odhadovat – hra si plnost sama píše do
   * šířky ukazatele (`.ins.renew-energyPercent` → `style="width: 100%"`), takže
   * „100 %“ je skutečná hodnota ze hry a ne dohadování maxima.
   */
  function readEnergyPct() {
    const el = document.querySelector('.ins.renew-energyPercent');
    if (!el) return null;
    const w = parseFloat((el.style && el.style.width) || '');
    return Number.isFinite(w) ? w : null;
  }

  /**
   * Štěstí z HUD. Hra to v DOM pojmenovala `renew-awake`, ale ikonu má
   * `resources-happy` a v posilovně o tom píše: „Čím více máš štěstí, tím
   * efektivněji se využívá tvá energie. Množství štěstí závisí na špercích.“
   * Trénink ho spotřebovává (u mě 50 na jeden), takže se s ním dá vyčerpat
   * dřív než energie.
   */
  function readLuck() {
    const el = document.querySelector('.value.renew-awake');
    return el ? NS.parse.toNum(el.textContent) : null;
  }

  /** Maximum energie: absolutní hodnota vůči plnosti ukazatele. */
  function readEnergyMax() {
    const en = readEnergy();
    const pct = readEnergyPct();
    if (en == null || !pct) return null;
    return Math.round(en / (pct / 100));
  }

  /**
   * Dorovná šířku ukazatele podle absolutní hodnoty. Bez toho by po tréninku na
   * pozadí zůstal ukazatel plný (hra ho z modalu na pozadí nepřekreslí) – a co
   * je horší, automatický trénink by se podle procent nikdy nezastavil.
   */
  function syncEnergyBar(max) {
    const el = document.querySelector('.ins.renew-energyPercent');
    const en = readEnergy();
    if (!el || en == null || !max) return;
    el.style.width = Math.max(0, Math.min(100, (en / max) * 100)).toFixed(1) + '%';
  }

  /**
   * Signál „máš plno energie“. Nic neklikne – jen zvýrazní lištu a spočítá,
   * kolik tréninků z energie vyjde.
   */
  function checkEnergy() {
    if (!bar) return;
    const limit = NS.store.get().read.gymAlertEnergy;
    const en = readEnergy();
    if (!limit || en == null) {
      bar.classList.remove('cmc-gym-ready');
      return;
    }
    const ready = en >= limit;
    bar.classList.toggle('cmc-gym-ready', ready);
    if (!ready) {
      if (statusEl && /energie/.test(statusEl.textContent)) setStatus('');
      return;
    }
    const cost = costCache && Object.values(costCache)[0];
    const kolik = cost && cost.energy > 0 ? Math.floor(en / cost.energy) : null;
    setStatus('energie ' + NS.fmt.num(en) + (kolik ? ' → ' + kolik + '× trénink' : ''));
  }

  /* ---- automatický trénink (volitelný, výchozí vypnuto) -------------------- */

  /*
   * !!! TOHLE JE JEDINÉ MÍSTO V ROZŠÍŘENÍ, KDE SE KLIKÁ BEZ TVÉHO KLIKNUTÍ !!!
   * Všechno ostatní je 1:1 s tvým klikem. Se zapnutou volbou se při dosažení
   * horní hranice (výchozí 100 %) spustí dávka a klikne se, dokud energie
   * neklesne na dolní hranici (výchozí 70 %) – energie se tedy nevyčerpává do
   * nuly. Je to automatizace hry, proto výchozí vypnuto, viditelný odznak
   * v liště a tlačítko na okamžité zastavení.
   *
   * Interval je PEVNÝ a nastavitelný. Schválně tu není žádné náhodné rozptýlení
   * časování „aby to nevypadalo jako robot“ – maskovat, že jde o klikátko, je
   * něco jiného než si klikání zjednodušit.
   */
  const AUTO_MAX_BURST = 100;      // strop na jednu dávku, ať se to nezacyklí
  let autoRunning = false;
  let autoStop = false;

  /** Povolené akce automatiky = všechno, co lišta umí (posilovna i kasárna). */
  const AUTO_ALLOWED = GROUPS.flatMap(g => g.items.map(i => i.key));

  /** Co je NASTAVENÉ (bez ohledu na hlavní vypínač). */
  function autoSetting() {
    const k = NS.store.get().read.autoTrain;
    return k && AUTO_ALLOWED.includes(k) ? k : null;
  }

  /**
   * Hlavní vypínač veškeré automatiky. Je to hradlo, ne mazání: jednotlivé volby
   * zůstanou, jak jsou, takže po zapnutí se všechno rozjede přesně tam, kde to
   * bylo. Kdyby to volby přepisovalo, „zapnout zpátky“ by znamenalo nastavit si
   * to celé znovu.
   */
  const autoPaused = () => NS.store.get().read.autoPaused === true;

  /** Co se SMÍ spustit – tedy nastavené a zároveň nepozastavené. */
  const autoKey = () => (autoPaused() ? null : autoSetting());

  /**
   * Známe cenu tréninku v energii? Posilovna ji ve fragmentu uvádí („-35 -3 -6Kč“),
   * KASÁRNA NE – v jejich fragmentu není ani cena, ani ikony zdrojů (ověřeno).
   * Bez ceny se nedá odečítat z HUD, takže se nedá spolehnout ani na procenta.
   */
  const costKnown = key => !!(costCache && costCache[key] && costCache[key].energy > 0);

  /*
   * Když cenu neznáme: hra si HUD po akci na pozadí obnoví sama, ale se
   * zpožděním (ověřeno v běžící hře: energie 58 → 38 po tréninku strážců, tedy
   * 20 za kus). Proto se u takové akce klikne v jedné dávce JEN JEDNOU a pak se
   * počká, než hra HUD přepíše – jinak by se klikalo podle zastaralých procent
   * a dno by se přestřelilo. Kasárna stojí velký díl energie, takže jeden klik
   * na cyklus je i tak celá dávka.
   */
  const UNKNOWN_COOLDOWN = 15 * 1000;
  let autoCooldownUntil = 0;

  const itemLabel = key => {
    for (const g of GROUPS) {
      const i = g.items.find(x => x.key === key);
      if (i) return i.label;
    }
    return key;
  };

  /** Jeden trénink – přes tlačítko na stránce, nebo na pozadí. */
  async function trainOnce(key) {
    const orig = findButtons()[key];
    if (orig) return withSuspend(async () => { orig.click(); await sleep(150); });
    if (!NS.store.get().read.gymRemote) throw new Error('zapni „Trénovat i mimo posilovnu“');
    return trainRemote(key);
  }

  /**
   * Dávka: klikat, dokud energie vystačí. Zastaví se na odmítnutí hrou, na
   * stropu dávky, při vypnutí volby nebo tlačítkem Stop.
   */
  async function autoBurst(key) {
    if (autoRunning) return;
    autoRunning = true;
    autoStop = false;
    let hotovo = 0;
    try {
      const gap = Math.max(200, NS.store.get().read.autoTrainGap || 1000);
      const cena = () => {
        const c = costCache && costCache[key];
        return c && c.energy > 0 ? c.energy : null;
      };
      await loadCosts().catch(() => {});

      /*
       * Dno tréninku se zvedne o rezervu zahrad: pole stojí 3 energie za akci a
       * kdyby si trénink vzal všechno až po své dno, na zahrady by nikdy nic
       * nezbylo. Rezerva platí jen dokud mají pole co dělat (viz farm.js).
       */
      const dnoZaklad = Math.max(0, Math.min(99, NS.store.get().read.autoTrainFloor ?? 70));
      const rezerva = NS.farm ? NS.farm.energyReserve() : 0;
      const dno = Math.max(dnoZaklad, rezerva);
      if (rezerva > dnoZaklad) {
        setStatus('auto ' + itemLabel(key) + ': dno ' + dno + ' % (rezerva zahrad)');
      }

      const jednoraz = !costKnown(key);   // bez známé ceny jen jeden klik na dávku

      const minStesti = Math.max(0, NS.store.get().read.autoTrainLuck ?? 100);
      let duvod = null;         // proč dávka skončila – ať to nepřepíše „hotovo“

      while (!autoStop && hotovo < AUTO_MAX_BURST && autoKey() === key) {
        /*
         * Štěstí je druhá spotřebovávaná měna (trénink z něj bere ~50) a na rozdíl
         * od energie se nedoplňuje samo – závisí na špercích. Bez téhle podmínky
         * by dávka jela dál, hra by ji odmítla a zbylo by po ní jen „Nemáš
         * dostatek štěstí“.
         */
        if (NS.jail && NS.jail.blocked()) {
          duvod = 'vězení';
          break;
        }

        const stesti = readLuck();
        if (stesti != null && stesti < minStesti) {
          duvod = 'štěstí ' + NS.fmt.num(stesti) + ' < ' + NS.fmt.num(minStesti);
          break;
        }

        // dávka jde jen do zadaného dna, energie se nevyčerpává do nuly
        const pct = readEnergyPct();
        if (pct != null && pct <= dno) break;

        const energie = readEnergy();
        const c = cena();
        if (energie != null && c != null && energie < c) break;   // na další už nemáš

        setStatus('auto ' + itemLabel(key) + ': ' + (hotovo + 1) + '×…');
        await trainOnce(key);
        hotovo++;
        loadCosts().then(() => subtractCost(key)).catch(() => {});

        await sleep(250);
        const odmitnuto = gameRefusal();
        if (odmitnuto) {
          setStatus('⚠ auto zastaveno: ' + odmitnuto, true);
          return hotovo;
        }
        if (jednoraz) {
          // počkat, až hra HUD přepíše; dno se pak vyhodnotí z jejích čísel
          autoCooldownUntil = Date.now() + UNKNOWN_COOLDOWN;
          setStatus('auto ' + itemLabel(key) + ': 1× (čekám na HUD hry)');
          return hotovo;
        }
        await sleep(gap);
      }
      setStatus('auto ' + itemLabel(key) + ': ' + hotovo + '× hotovo'
        + (autoStop ? ' (zastaveno)' : duvod ? ' (' + duvod + ')' : ''), !!duvod);
      return hotovo;
    } catch (e) {
      setStatus('⚠ auto: ' + e.message, true);
      return hotovo;
    } finally {
      autoRunning = false;
      // hlášku přes překreslení přenese `restoreStatus()` v `render()`
      collect();
    }
  }

  /** Hlídá plnost energie; při dosažení prahu spustí dávku. */
  function autoCheck() {
    const key = autoKey();
    if (!key || autoRunning || !bar) return;
    if (NS.jail && NS.jail.blocked()) return;   // ve vězení se neklika
    if (Date.now() < autoCooldownUntil) return;   // čeká se na obnovu HUD hrou
    const prah = Math.min(100, Math.max(1, NS.store.get().read.autoTrainPct || 100));
    const pct = readEnergyPct();
    if (pct == null || pct < prah) return;
    // štěstí musí stačit, jinak by to hra jen odmítala
    const minStesti = Math.max(0, NS.store.get().read.autoTrainLuck ?? 100);
    const stesti = readLuck();
    if (stesti != null && stesti < minStesti) return;
    autoBurst(key);
  }

  /**
   * Ovládání automatiky přímo v liště: výběr akce, hranice a zastavení. Je tady,
   * aby bylo na první pohled vidět, že je něco zapnuté, a aby se to dalo vypnout
   * na jeden klik. Totéž je i v nastavení, včetně hranic a prodlevy – kdyby byla
   * lišta vypnutá, nesmí to skončit tak, že se automatika nedá vypnout.
   */
  function autoControl() {
    const cfg = NS.store.get().read;
    const key = autoSetting();
    const pozastaveno = autoPaused();
    const prah = Math.min(100, Math.max(1, cfg.autoTrainPct || 100));
    const dno = Math.max(0, Math.min(99, cfg.autoTrainFloor ?? 70));

    const wrap = document.createElement('span');
    wrap.className = 'cmc-gym-auto'
      + (key && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (key && pozastaveno ? ' cmc-gym-auto-paused' : '');
    const rezervaZahrad = NS.farm ? NS.farm.energyReserve() : 0;
    wrap.title = (key && pozastaveno ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
      + (rezervaZahrad > dno
        ? 'Dno je teď ' + rezervaZahrad + ' % – rezerva energie pro zahrady. ' : '')
      + (key
      ? 'Automatický trénink je ZAPNUTÝ: při energii ≥ ' + prah + ' % se klikne „'
        + itemLabel(key) + '“, dokud energie neklesne na ' + dno + ' % (max '
        + AUTO_MAX_BURST + '× na dávku, prodleva '
        + Math.max(200, cfg.autoTrainGap || 1000) + ' ms). Jede jen se štěstím ≥ '
        + NS.fmt.num(Math.max(0, cfg.autoTrainLuck ?? 100))
        + ' (teď ' + NS.fmt.num(readLuck()) + '). Klikání nespouštíš ty –'
        + ' přepnutím na „vypnuto“ to hned přestane, ■ zastaví běžící dávku.'
      : 'Automatický trénink: vyber akci a při energii ≥ ' + prah + ' % se bude'
        + ' klikat sama, dokud energie neklesne na ' + dno + ' %. Pozor, tohle'
        + ' klikne BEZ tvého kliknutí. Hranice a prodlevu nastavíš v ikoně rozšíření.');

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto';
    wrap.appendChild(txt);

    const sel = document.createElement('select');
    sel.className = 'cmc-gym-auto-select';
    for (const o of [{ key: '', label: 'vypnuto' }, ...GROUPS.flatMap(g2 => g2.items)]) {
      const opt = document.createElement('option');
      opt.value = o.key;
      opt.textContent = o.label;
      if (o.key === (key || '')) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', async () => {
      await NS.store.patch('read', {
        autoTrain: AUTO_ALLOWED.includes(sel.value) ? sel.value : ''
      });
      autoStop = true;          // přepnutí zastaví i právě běžící dávku
      collect(true);            // vlastní změna přerender chce, pojistka se obejde
    });
    wrap.appendChild(sel);

    if (key) {
      if (pozastaveno) {
        const pauza = document.createElement('span');
        pauza.className = 'cmc-gym-auto-label';
        pauza.textContent = 'pozastaveno';
        wrap.appendChild(pauza);
      }
      const hranice = document.createElement('span');
      hranice.className = 'cmc-gym-auto-label';
      hranice.textContent = prah + '→' + dno + ' %';
      wrap.appendChild(hranice);

      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'cmc-gym-auto-stop';
      stop.textContent = '■';
      stop.title = 'zastavit běžící dávku (volba zůstane zapnutá)';
      stop.addEventListener('click', () => {
        autoStop = true;
        setStatus('auto: zastavuji…');
      });
      wrap.appendChild(stop);
    }
    return wrap;
  }

  /*
   * Hra odmítnutí (málo energie, štěstí, peněz) hlásí ve svém okně. Při
   * tréninku na pozadí ho není kde vidět, takže se hláška přečte a zobrazí
   * v liště – jinak to vypadá, že klik nic neudělal.
   *
   * Hledají se jen VIDITELNÉ hlášky; ta z předchozího pokusu zůstává v DOM
   * skrytá a nesmí se počítat jako odezva na tenhle klik.
   */
  const REFUSAL_RE = /Nemáš dostatek [^.!]{0,40}[.!]?|Potřebuješ [\d\s]+ (?:energie|štěstí|bdělosti)|Nemáš dost [^.!]{0,40}/i;

  function gameRefusal() {
    const boxy = document.querySelectorAll(
      '[class*="toast"], [class*="notif"], [class*="alert"], [class*="msg"], .swal2-container, .modal-box');
    for (const el of boxy) {
      if (el.closest('#' + BAR_ID) || !el.offsetParent) continue;
      const m = el.textContent.replace(/\s+/g, ' ').match(REFUSAL_RE);
      if (m) return m[0].trim();
    }
    return null;
  }

  /** Potvrzení bez posunu layoutu: krátké bliknutí rámečku. */
  async function blink(btn) {
    btn.classList.add('cmc-gym-ok');
    await sleep(400);
    btn.classList.remove('cmc-gym-ok');
  }

  function actionButton(item, onClick, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-btn';
    b.textContent = item.label;
    b.title = title;
    b.dataset.key = item.key;
    b.addEventListener('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      let err = null;
      try {
        await onClick();
      } catch (e) {
        err = e.message;
      }
      b.disabled = false;
      if (err) {
        setStatus('⚠ ' + err, true);
        return;
      }

      // hra mohla akci odmítnout (málo energie) – to není úspěch
      await sleep(250);
      const odmitnuto = gameRefusal();
      if (odmitnuto) {
        setStatus('⚠ ' + odmitnuto, true);
        return;
      }

      setStatus('');
      blink(b);
      loadCosts().then(() => subtractCost(item.key)).catch(() => {});
    });
    return b;
  }

  /**
   * Hlavní vypínač automatiky. Ukazuje se jen tehdy, když je vůbec co vypínat –
   * u prázdného nastavení by to byl mrtvý knoflík. Vypnutí navíc hned zastaví
   * rozjetou dávku, ať se to nedoklikává „ještě do konce“.
   */
  /** Je zapnutá (nebo pozastavená) aspoň jedna automatika? */
  function queueVisible() {
    const cfg = NS.store.get().read;
    if (cfg.autoPaused === true) return true;
    return !!(autoSetting() || cfg.autoPlane || cfg.autoBoat || cfg.farmAuto
      || (NS.crimes && NS.crimes.autoSetting())
      || (NS.casino && NS.casino.autoShape())
      || (NS.slots && NS.slots.autoSet())
      || (NS.blackjack && NS.blackjack.autoSet())
      || (NS.poker && NS.poker.autoSet())
      || (NS.mines && NS.mines.autoSet())
      || (NS.work && NS.work.autoSet())
      || (NS.bank && NS.bank.autoSet())
      || (NS.bank && NS.bank.ulozSet())
      || (NS.vyrobny && NS.vyrobny.autoSet())
      || (NS.brothel && NS.brothel.autoSet()));
  }

  function masterButton() {
    const cfg = NS.store.get().read;
    const zlocin = NS.crimes ? NS.crimes.autoSetting() : null;
    const kasino = NS.casino ? NS.casino.autoShape() : null;
    const sachty = NS.mines ? NS.mines.autoSet() : false;
    const mzda = NS.work ? NS.work.autoSet() : false;
    const nevestinec = NS.brothel ? NS.brothel.autoSet() : false;
    const zahrady = cfg.farmAuto === true;
    // automat (#18) je jiná hra než kuličky, `autoShape()` ho schválně nevrací
    const automat = NS.slots ? NS.slots.autoSet() : false;
    const bj = NS.blackjack ? NS.blackjack.autoSet() : false;
    const pk = NS.poker ? NS.poker.autoSet() : false;
    const banka = NS.bank ? NS.bank.autoSet() : false;
    const ukladani = NS.bank ? NS.bank.ulozSet() : false;
    const vyrobny = NS.vyrobny ? NS.vyrobny.autoSet() : false;
    const zapnuto = !!(autoSetting() || cfg.autoPlane || cfg.autoBoat || zlocin || kasino
      || sachty || mzda || nevestinec || zahrady || automat || bj || pk || banka
      || ukladani || vyrobny);
    const pozastaveno = autoPaused();
    if (!zapnuto && !pozastaveno) return null;

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-master' + (pozastaveno ? ' cmc-gym-master-off' : '');
    b.textContent = pozastaveno ? '▶' : '⏸';
    const co = [
      autoSetting() ? 'trénink (' + itemLabel(autoSetting()) + ')' : null,
      cfg.autoPlane ? 'letadla' : null,
      cfg.autoBoat ? 'lodě' : null,
      zlocin ? 'zločin (' + zlocin.name + ')' : null,
      kasino ? 'kasino (' + kasino.name + ')' : null,
      automat ? 'automat (#18)' : null,
      bj ? 'blackjack (#18)' : null,
      pk ? 'poker (#18)' : null,
      sachty ? 'šachty' : null,
      mzda ? 'mzda' : null,
      nevestinec ? 'nevěstinec' : null,
      zahrady ? 'zahrady' : null,
      banka ? 'banka (praní)' : null,
      ukladani ? 'banka (ukládání)' : null,
      vyrobny ? 'výrobny' : null
    ].filter(Boolean).join(', ') || 'nic';
    b.title = (pozastaveno
      ? 'Automatika je POZASTAVENÁ. Kliknutím se rozjede zpátky přesně to, co bylo'
        + ' zapnuté: ' + co + '. Jednotlivé volby se nikam neztratily.'
      : 'Pozastavit VEŠKEROU automatiku jedním klikem (' + co + ').'
        + ' Volby zůstanou nastavené, takže se to dá stejně tak zapnout zpátky.')
      + ' Kliká se vždy jen jedna věc – ostatní čekají ve frontě.'
      + (NS.queue && NS.queue.popis() ? ' ' + NS.queue.popis() : '');
    /*
     * !!! PAUZA MUSÍ ZABRAT VŽDYCKY !!!
     * Dvě věci ji dokázaly spolknout a obě byly vidět jako „nejde kliknout“:
     *
     * 1. ČEKÁNÍ NA ÚLOŽIŠTĚ. Handler začínal `await NS.store.patch(...)`, takže
     *    se do té doby nezastavila dávka, nevyprázdnila fronta ani nepřekreslilo
     *    tlačítko. Když bylo úložiště zaneprázdněné, klik chvíli nedělal nic –
     *    a člověk klikl znovu, čímž pauzu vzal zpátky.
     *
     * 2. STAV Z DOBY VYKRESLENÍ. `nove = !pozastaveno` bralo hodnotu z okamžiku,
     *    kdy se lišta kreslila. Když se mezitím pauza změnila odjinud (popup,
     *    hlídač captchy), klik přepnul podle staré hodnoty – tedy přesně naopak,
     *    než uživatel chtěl.
     *
     * Proto: stav se čte TEĎ, zastavení proběhne HNED a zápis se posílá bez
     * čekání (`put()` aktualizuje mezipaměť synchronně, takže moduly to vidí
     * okamžitě). Rozdělaná úloha dobíhá – to je záměr, ne zpoždění.
     */
    let prepinam = false;

    const prepni = () => {
      if (prepinam) return;
      prepinam = true;
      setTimeout(() => { prepinam = false; }, 300);

      const nove = !autoPaused();

      if (nove) {
        autoStop = true;              // rozjetá dávka se zastaví hned
        if (NS.crimes) NS.crimes.stopAuto();
        // co ještě nezačalo, nemá po vypnutí co dobíhat
        if (NS.queue) NS.queue.clear();
      }

      /* odezva na tlačítku nečeká na překreslení lišty ani na úložiště */
      b.textContent = nove ? '▶' : '⏸';
      b.classList.toggle('cmc-gym-master-off', nove);
      setStatus(nove
        /*
         * Doběhnutí rozdělané úlohy je záměr („maximálně aby doběhla“), takže se
         * to napíše – jinak by to vypadalo, že pauza nezabrala.
         */
        ? 'automatika pozastavena' + (() => {
          const b2 = NS.queue && NS.queue.info().running;
          return b2 ? ' – dobíhá ' + b2 : '';
        })()
        : 'automatika zapnuta');

      NS.store.patch('read', { autoPaused: nove }).catch(() => {});
      collect(true);
    };

    /*
     * `pointerdown`, ne jen `click`: lišta se překresluje sama a když výměna
     * uzlu padne mezi stisk a uvolnění, `click` se nikdy nespustí – tlačítko
     * pak vypadá jako mrtvé. Na stisk se to stihne vždycky. `click` zůstává
     * jako záloha a `prepinam` hlídá, aby se nepřepnulo dvakrát.
     */
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); prepni(); });
    b.addEventListener('click', ev => { ev.preventDefault(); prepni(); });
    return b;
  }

  /** Přepínač dočasného skrytí (funkce zůstává zapnutá). */
  /**
   * Úchyt na zmenšení lišty. `kam` je jen pro testy – v provozu se pracuje
   * s lištou modulu, ale bez parametru by se stav tlačítka nedal změřit.
   */
  function toggleButton(kam) {
    const lista = () => kam || bar;
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'cmc-gym-toggle';
    /*
     * Ve zmenšeném stavu je tohle JEDINÝ ovládací prvek na obrazovce, takže musí
     * být vidět a snadno se do něj klikne – proto se přepíná i třída, na kterou
     * visí větší rozměr, a šipky jsou dvojité (výraznější než „‹“).
     */
    const paint = () => {
      const el = lista();
      const hidden = !!el && el.classList.contains('cmc-gym-hidden');
      t.textContent = hidden ? '»' : '«';
      t.classList.toggle('cmc-gym-toggle-big', hidden);
      t.title = hidden
        ? 'rozbalit lištu'
        : 'zmenšit na úchyt (lišta se nedá vypnout, jen zmenšit)';
    };
    t.addEventListener('click', () => {
      const el = lista();
      if (!el) return;
      const hidden = !el.classList.contains('cmc-gym-hidden');
      el.classList.toggle('cmc-gym-hidden', hidden);
      NS.store.patch('ui', { gymHidden: hidden });
      paint();
    });
    t._paint = paint;
    return t;
  }

  /** Řádek „Trénovat:“ – vrací element, nebo null když není co nabídnout. */
  function trainRow(found) {
    const cfg = NS.store.get().read;
    const remote = !!cfg.gymRemote;

    /*
     * Pro každou budovu se rozhodne, co lišta nabídne:
     *   proxy  – tlačítka jsou na stránce, klik se na ně přepošle
     *   remote – trénink na pozadí (jen kde to hra dovolí)
     *   link   – zkratka do budovy, když ani jedno nejde
     */
    const groups = GROUPS.map(g => {
      const onPage = g.items.filter(i => found[i.key]);
      if (onPage.length) return { g, items: onPage, mode: 'proxy' };
      if (remote && g.remote) return { g, items: g.items, mode: 'remote' };
      if (remote || cfg.gymEverywhere) return { g, items: [], mode: 'link' };
      return null;
    }).filter(Boolean);

    if (!groups.some(x => x.items.length || x.mode === 'link')) return null;

    const row = document.createElement('div');
    row.className = 'cmc-gym-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = 'Trénovat:';
    row.appendChild(label);

    for (const { g, items, mode } of groups) {
      const box = document.createElement('span');
      box.className = 'cmc-gym-group';

      if (mode === 'link') {
        // budova, která trénink na pozadí neumí – klik ji aspoň otevře
        for (const item of g.items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cmc-gym-btn cmc-gym-btn-link';
          b.textContent = item.label + ' ↗';
          b.title = item.label + ': klik otevře ' + g.label;
          b.dataset.key = item.key;
          b.addEventListener('click', () => { location.href = g.url; });
          box.appendChild(b);
        }
      } else {
        for (const item of items) {
          const orig = found[item.key];
          box.appendChild(actionButton(item,
            orig ? async () => { orig.click(); } : () => trainRemote(item.key),
            orig ? 'klikne na „Trénovat“ v sekci ' + item.label
                 : 'otevře budovu na pozadí, klikne a uklidí – jeden klik = jeden trénink'));
        }
      }
      row.appendChild(box);
    }

    row.appendChild(autoControl());
    // stav akce má vlastní řádek dole vedle fronty – viz `stavRow()`
    return row;
  }

  /**
   * Řádek postavený z toho, co modul nabídne (`buttons()` a `autoBox()`).
   * Výrobny a banka mají každá svůj – banka má dvě rezervy, dvě akce a dvě
   * zaškrtávátka, takže vedle čtyř výroben se to na jeden řádek netrefí.
   */
  function modulRow(modul, zapnuto, popis, trida, onChange) {
    if (!modul || !zapnuto) return null;
    const tlacitka = (modul.buttons(onChange) || []).filter(Boolean);
    if (!tlacitka.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'cmc-gym-row ' + trida;
    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = popis;
    label.title = modul.POPIS_SKUPINY || '';
    wrap.appendChild(label);
    tlacitka.forEach(t => wrap.appendChild(t));
    if (modul.autoBox) wrap.appendChild(modul.autoBox(onChange));
    return wrap;
  }

  /**
   * Postaví lištu. `found` jsou herní tlačítka na stránce (klik se přepošle),
   * v režimu „odkudkoli“ se tlačítko vyrobí a klikne na pozadí. Další řádky
   * (letadla, lodě, zločiny) si staví fleet.js a crimes.js – lišta je jen
   * pověsí pod trénink.
   */
  function render(found) {
    const cfg = NS.store.get().read;

    // uklidit se musí PŘED stavbou řádků – removeBar() nuluje statusEl
    removeBar();

    const rows = [trainRow(found)];
    if (NS.fleet) rows.push(...NS.fleet.rows(collect));
    if (cfg.mineBar !== false && NS.mines) rows.push(NS.mines.row(collect));
    if (cfg.rpsBar !== false && NS.rps) rows.push(NS.rps.row(collect));
    const cfg2 = NS.store.get().read;
    // výrobny a banka mají každá vlastní řádek – banka jich má na sdílený moc
    const vyroba = modulRow(NS.vyrobny, cfg2.vyrBar !== false,
      'Výrobny:', 'cmc-gym-vyr-row', collect);
    if (vyroba) rows.push(vyroba);
    const banka2 = modulRow(NS.bank, cfg2.bankBar !== false,
      'Banka:', 'cmc-gym-bank-row', collect);
    if (banka2) rows.push(banka2);
    const boj = modulRow(NS.attack, cfg2.atkBar !== false,
      'Boj:', 'cmc-gym-atk-row', collect);
    if (boj) rows.push(boj);
    const vylep = modulRow(NS.upgrade, cfg2.upgBar !== false,
      'Vylepšit:', 'cmc-gym-upg-row', collect);
    if (vylep) rows.push(vylep);
    // zločiny vracejí DVA řádky (je jich dvacet) – rozbalit stejně jako flotilu
    if (cfg.crimeBar !== false && NS.crimes) rows.push(...[].concat(NS.crimes.row(collect) || []));
    if (cfg.casinoBar === true && NS.casino) rows.push(NS.casino.row(collect));
    const live = rows.filter(Boolean);
    if (!live.length) return;

    /*
     * Spodní řádek je vždycky – stav akce potřebuje kam psát i tehdy, když
     * automatika neběží. Skrývá se jen sloupec fronty (viz `syncQueue`).
     */
    queueEl = null;
    frontaEl = null;
    kartaEl = null;
    statusEl = null;
    live.push(stavRow());

    bar = document.createElement('div');
    bar.id = BAR_ID;
    if (cfg.gymRemote) bar.classList.add('cmc-gym-remote');

    const stack = document.createElement('div');
    stack.className = 'cmc-gym-rows';
    live.forEach(r => stack.appendChild(r));
    bar.appendChild(stack);

    /*
     * Ovládání (hlavní vypínač, minimalizace, zavření) jde do vlastního obalu
     * v pravém HORNÍM koutu – tam ho člověk hledá u každého okna. Bez něj
     * sedělo hned za obsahem, takže s každým přidaným tlačítkem uskakovalo
     * jinam a minimalizace se hledala očima.
     */
    const ovladani = document.createElement('div');
    ovladani.className = 'cmc-gym-ctrl';

    const master = masterButton();
    if (master) ovladani.appendChild(master);

    /*
     * Noční obnovování stránky patří sem, a ne k automatikám: je to vlastnost
     * KARTY, ne herní akce. Navíc je tady vidět vždycky – sloupec fronty se
     * schovává, když neběží žádná automatika, takže tam by občas zmizelo.
     */
    if (NS.reload) ovladani.appendChild(NS.reload.box(collect));

    /*
     * !!! ŽÁDNÝ KŘÍŽEK !!!
     * Dřív tu bylo „×“, které lištu vypnulo úplně a zapnout ji šlo jen
     * v nastavení rozšíření – sedělo přitom hned vedle minimalizace, takže se
     * dalo snadno splést. Lišta je teď vždycky k dispozici a jediné, co se s ní
     * dá udělat, je zmenšit ji na úchyt. Vypnout ji jde dál v popupu (`gymBar`).
     */
    const t = toggleButton();
    ovladani.appendChild(t);
    bar.appendChild(ovladani);

    if (NS.store.get().ui.gymHidden) bar.classList.add('cmc-gym-hidden');
    t._paint();

    document.body.appendChild(bar);
    document.body.classList.add('cmc-gym-padded');
    checkEnergy();
  }

  /** Mimo budovy a bez režimu „odkudkoli“: jen zkratka do posilovny. */
  function renderShortcut() {
    removeBar();
    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.classList.add('cmc-gym-shortcut');

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-btn';
    b.textContent = '🏋 Posilovna';
    b.title = 'otevře posilovnu – trénovat jde jen tam, kde jsou herní tlačítka';
    b.addEventListener('click', () => { location.href = groupById('gym').url; });
    bar.appendChild(b);

    /* i tady bez křížku – vypíná se jedině v nastavení, viz `render()` */
    document.body.appendChild(bar);
    document.body.classList.add('cmc-gym-padded');
  }

  /**
   * Pracuje uživatel právě v nějakém poli lišty? Přerender by prvek vyměnil za
   * nový: u rozbaleného `<select>` by se zavřela nabídka, u `<input>` by se
   * ztratilo rozepsané číslo. Nativní select drží fokus, dokud je rozbalený,
   * takže na obojí stačí `activeElement`.
   */
  const EDITABLE = ['SELECT', 'INPUT', 'TEXTAREA'];

  function selectOpen() {
    const a = document.activeElement;
    return !!(a && EDITABLE.includes(a.tagName) && a.closest && a.closest('#' + BAR_ID));
  }

  function collect(force) {
    // pozastavení se hlídá i tady: odložený přerender by proběhl uprostřed kliknutí
    if (isSuspended()) return;
    if (!force && selectOpen()) return;
    if (!NS.store.get().read.gymBar) {
      removeBar();
      return;
    }
    render(findButtons());
  }

  /**
   * Observer se zapíná vždy – budovu obvykle otevřeš klikem na mapě, tedy dávno
   * po načtení stránky.
   */
  function start() {
    collect();
    /*
     * !!! JEDNA VĚC PO DRUHÉ !!!
     * Tik jen NABÍDNE všechny automatiky frontě; ta je pustí za sebou. Dřív se
     * tady volaly bez `await`, takže běžely vedle sebe a tahaly ze stejné
     * energie i ze stejného HUD (viz queue.js). Jestli je vůbec co dělat,
     * rozhoduje pořád každý modul sám.
     */
    /*
     * !!! VYPNUTÁ AUTOMATIKA SE DO FRONTY NEZAŘAZUJE !!!
     * Dřív se každý tik zařadilo všech dvanáct a modul se sám ukončil, když byl
     * vypnutý. Vypadalo to nevinně, ale fronta mezi každými dvěma položkami čeká
     * `MEZERA` (300 ms), takže dvanáct položek znamená 3,6 s na průchod – a tik
     * chodí každých 5 s. Fronta tím byla pořád zaneprázdněná, v liště svítěl
     * dlouhý seznam „čeká …“ a jediná zapnutá automatika se dostala ke slovu až
     * po těch, které nic nedělají.
     *
     * Třetí prvek je proto předpoklad „je to vůbec zapnuté“. Musí být LEVNÝ –
     * jen čtení nastavení, žádný požadavek do hry ani čtení DOM – protože se
     * vyhodnocuje dvanáctkrát za každý tik.
     *
     * Není to duplikace kontroly v modulech: ty si vypnutí hlídají dál (na tom
     * závisí i ruční tlačítka). Tady jde jen o to nezdržovat frontu.
     */

    const AUTOMATY = [
      ['trénink', () => autoCheck(), () => !!autoSetting()],
      ['zločiny', () => NS.crimes && NS.crimes.autoCheck(),
        () => !!(NS.crimes && NS.crimes.autoSetting())],
      ['kasino', () => NS.casino && NS.casino.autoTick(),
        () => !!(NS.casino && NS.casino.autoShape && NS.casino.autoShape())],
      ['automat', () => NS.slots && NS.slots.autoTick(),
        () => !!(NS.slots && NS.slots.autoSet())],
      ['blackjack', () => NS.blackjack && NS.blackjack.autoTick(),
        () => !!(NS.blackjack && NS.blackjack.autoSet())],
      ['poker', () => NS.poker && NS.poker.autoTick(),
        () => !!(NS.poker && NS.poker.autoSet())],
      ['šachty', () => NS.mines && NS.mines.autoRound(),
        () => !!(NS.mines && NS.mines.autoSet())],
      ['mzda', () => NS.work && NS.work.autoTick(),
        () => !!(NS.work && NS.work.autoSet())],
      ['nevěstinec', () => NS.brothel && NS.brothel.autoTick(),
        () => !!(NS.brothel && NS.brothel.autoSet())],
      ['zahrady', () => NS.farm && NS.farm.autoRound(),
        () => !!(NS.farm && NS.farm.autoSet())],
      /*
       * Banka má tři důvody běžet: praní, ukládání – a navíc stav, kdy si praní
       * sama dočasně vypnula kvůli výrobnám. Bez toho třetího by se po vypnutí
       * přestala zařazovat a neměla by ho jak zapnout zpátky.
       */
      ['banka', () => NS.bank && NS.bank.autoTick(),
        () => {
          if (!NS.bank) return false;
          const c = NS.store.get().read;
          return c.bankAuto === true || c.bankUloz === true
            || c.bankPratPozastaveno === true;
        }],
      ['výrobny', () => NS.vyrobny && NS.vyrobny.autoTick(),
        () => !!(NS.vyrobny && NS.vyrobny.autoSet())],
      ['boj', () => NS.attack && NS.attack.autoTick(),
        () => !!(NS.attack && NS.attack.autoSet())],
      ['vylepšení', () => NS.upgrade && NS.upgrade.autoTick(),
        () => !!(NS.upgrade && NS.upgrade.autoSet())]
    ];

    setInterval(async () => {
      checkEnergy();
      // jednorázově si uložit podobu vězeňského okna, až se objeví (i při pauze)
      if (NS.jail && NS.jail.capture) NS.jail.capture().catch(() => {});

      /*
       * !!! VE VĚZENÍ ANI V NEMOCNICI SE NIC NENABÍZÍ !!!
       * Moduly si to hlídají samy, ale zastavit to už tady má dva důvody:
       * fronta se vůbec nezaplní (jinak by se každých pět sekund plnila
       * a hned zahazovala) a hlavně je v liště VIDĚT, proč se nic nedělá.
       * Uživateli to jinak vypadalo jako zacyklení – automatika se pokoušela
       * o akci pořád znovu, dokud ji nevypnul.
       */
      /*
       * !!! KONTROLA „JSI ČLOVĚK?“ MÁ PŘEDNOST PŘED VŠÍM !!!
       * Když hra zobrazí captchu, znamená to, že jí provoz připadá robotický.
       * Klikat dál by bylo to nejhorší možné – proto se zastaví všechno a řízení
       * se předá člověku. Rozšíření do captchy záměrně nesahá (viz captcha.js).
       */
      if (NS.captcha && NS.captcha.blokuje()) {
        NS.captcha.hlidej().catch(() => {});
        syncQueue();
        return;
      }

      if (NS.jail && NS.jail.blocked()) {
        const d = NS.jail.detect();
        setStatus('⏸ ' + (d.text || 'jsi ve vězení nebo v nemocnici')
          + ' – automatika stojí', true);
        NS.queue.clear();
        syncQueue();
        return;
      }

      /*
       * !!! JEN JEDNA KARTA HRAJE !!!
       * Rozšíření běží v každé otevřené kartě hry, ale hru drží server – dvě
       * karty by si přebíjely rozehraná kola (podrobně v queue.js). Zámek se
       * zkouší/obnovuje tady, protože tenhle tik chodí pravidelně.
       */
      /*
       * `.catch` je tu kvůli sirotkům po reloadu rozšíření: `chrome.storage`
       * jim rejectuje a bez catchi by tik každých pět sekund házel unhandled
       * rejection. Sirotek prostě nehraje.
       */
      /*
       * Výsledky kámen-nůžky-papíru chodí do zpráv a hra je po čase maže, takže
       * se čtou průběžně (modul si sám hlídá, aby se neptal častěji než jednou
       * za minutu). Nezávisí to na zámku – jde jen o čtení a duplicitám brání
       * `data-notification-id`.
       */
      if (NS.rps && NS.rps.zkontrolujObcas) {
        NS.rps.zkontrolujObcas().then(v => { if (v && v.nove) collect(true); })
          .catch(() => {});
      }

      /*
       * Evidence předmětů: aukce se obměňuje po minutách, takže se čte průběžně
       * (modul si sám hlídá interval – 3 min aukce, 30 min inventář). Nezávisí
       * to na zámku ani na pauze, protože je to ČTENÍ, nic se ve hře nemění.
       */
      if (NS.market && NS.market.zkontrolujObcas) {
        NS.market.zkontrolujObcas().catch(() => {});
      }

      const smim = await NS.queue.zkusZamek().catch(() => false);
      if (!smim) {
        syncQueue();
        return;
      }

      /*
       * !!! PŘI PAUZE SE DO FRONTY NIC NEDÁVÁ !!!
       * Každý modul si pauzu hlídá i sám, takže by se hned ukončil – ale to je
       * pozdě: položka už je ve frontě a řádek v liště napíše „teď trénink“.
       * Vypadá to pak, že automatika jede, i když se nic nedělá.
       */
      if (autoPaused()) {
        NS.queue.clear();
        syncQueue();
        return;
      }
      for (const [jmeno, fn, zapnuto] of AUTOMATY) {
        // vypnuté se nezařazuje – jinak by jen platilo mezeru ve frontě
        try { if (zapnuto && !zapnuto()) continue; } catch (e) { /* radši zařadit */ }
        NS.queue.run(jmeno, fn).catch(() => {});   // chybu hlásí modul sám
      }
    }, 5000);                          // čte se HUD z DOM, nic to nestojí

    // řádek „co právě běží“ se obnovuje častěji – je to jen přepis textu
    setInterval(syncQueue, 500);

    /*
     * Při zavření karty se zámek pustí hned, ať nemusí jiná karta čekat, než
     * vyprší. `pagehide` chodí spolehlivěji než `unload`.
     */
    window.addEventListener('pagehide', () => {
      if (NS.queue && NS.queue.mamZamek) NS.queue.uvolniZamek();
    });
    // hlídání příletů letadel a lodí – načasované na odpočty, ne na pevný interval
    if (NS.fleet) NS.fleet.watch(collect);

    const obs = new MutationObserver(muts => {
      if (isSuspended()) return;
      const outside = muts.some(m => {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el || !el.closest) return false;
        return !el.closest('#' + BAR_ID) && !el.closest('.cmc-gym-offscreen');
      });
      if (!outside) return;
      if (selectOpen()) return;
      clearTimeout(start._t);
      start._t = setTimeout(() => collect(), 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  NS.gym = {
    start, collect, removeBar, renderShortcut, trainRemote, withSuspend,
    parseAction, findButtons, gameHost, setStatus, statusText, selectOpen,
    loadCosts, resetCosts, subtractCost, bump, readEnergy, readEnergyPct, readEnergyMax,
    restoreStatus,
    syncEnergyBar, readLuck, checkEnergy, gameRefusal, GROUPS,
    autoBurst, autoCheck, autoKey, autoSetting, autoPaused, autoControl, masterButton, itemLabel, AUTO_MAX_BURST, AUTO_ALLOWED, costKnown,
    stavRow, queueVisible, syncQueue, toggleButton,
    resetAutoCooldown() { autoCooldownUntil = 0; },
    get autoRunning() { return autoRunning; },
    // kolik akcí právě drží překreslení – jen pro testy a diagnostiku
    get suspendDepth() { return suspendDepth; },
    stopAuto() { autoStop = true; }
  };
})();
