/* =============================================================================
 * crimes.js – zločiny z mapy jako řádek úzkých tlačítek
 *
 *   ZLOČINY: 1  2  4  5  7  9  12  14  17  20  25  30  34  38  42  46🔒 …
 *
 * Na tlačítku je POŽADOVANÁ ODVAHA – ta je pro každý zločin jiná, takže slouží
 * i jako jeho označení. Zbytek (název, rychlost, odměna, proč to zrovna nejde)
 * je v tooltipu. Řadí se podle odvahy, ne podle ID na mapě: mapa má nejtěžší
 * zločin jako `crime/1`, což by v liště bylo na přeskáčku.
 *
 * !!! STEJNÁ HRANICE JAKO U TRÉNINKU !!!
 * Klik vloží fragment zločinu do herního modálního kontejneru a klikne na
 * skutečné „Spáchat zločin“ v něm; požadavek posílá hra. Jeden tvůj klik = jeden
 * zločin, žádný časovač, nic se neděje samo.
 *
 * Fragment se vkládá celý, protože handler hry (`$(document).on('click',
 * '.doCrime', …)`) volá v těle `offset()` a `find()` – stejný důvod jako
 * u kasáren. Turbo varianty (`…/crimes/{n}/{2|10|100|1000}`) jsou za diamanty
 * a v liště NEJSOU, aby se drahé tlačítko nedalo zmáčknout omylem.
 *
 * !!! CO ROZHODUJE, JESTLI ZLOČIN JDE !!!
 * Fragment uvádí „Odvaha: 34“ a „Rychlost: 261 607“ jako požadavky a k tomu
 * procento úspěšnosti. Na všech 20 zločinech platí: je to 90 %, když tvoje
 * rychlost na požadavek má, a 0 %, když ne – žádné plynulé škálování. Proto se
 * stav neurčuje z toho procenta, ale z FAKTŮ:
 *   rychlost < požadavek → zamčeno (zámek), s tím se nedá nic dělat hned
 *   odvaha  < požadavek → počkat, odvaha se sama obnovuje
 *   jinak               → jde spáchat
 * Odvaha i rychlost se čtou z HUD při každém překreslení, takže se nepracuje
 * se zastaralým číslem.
 *
 * Požadavky samotné se nemění, tak se drží v `chrome.storage` (6 h) – jinak by
 * každé načtení stránky znamenalo 20 požadavků na hru.
 *
 * !!! HUD SE TU NEODEČÍTÁ !!!
 * Na rozdíl od posilovny si hra u zločinu HUD obnoví sama i při akci z modalu na
 * pozadí – ověřeno v běžící hře: odvaha 18 → 14 u zločinu za 4 odvahy, bez
 * jakéhokoli zásahu rozšíření. Ruční odečet jako v gym.js by proto ubral dvakrát.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const COUNT = 20;                        // /map/crime/1..20
  const URL_OF = n => '/map/crime/' + n;
  const ACTION_BASE = '/map/building/crimes/';
  const TTL = 6 * 60 * 60 * 1000;          // požadavky jsou statické, stačí občas

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const doc = html => new DOMParser().parseFromString(html, 'text/html');

  let inflight = null;

  /* ---- co má hráč (z HUD, žádný požadavek do hry) -------------------------- */

  /** Číslo z prvku HUD – bere se list s číslicí, ne celý kontejner s popiskem. */
  function hudNum(el) {
    if (!el) return null;
    if (el.closest('#cmc-gym-bar')) return null;
    const leaf = Array.from(el.querySelectorAll('*')).find(x => !x.children.length && /\d/.test(x.textContent));
    return NS.parse.toNum((leaf || el).textContent);
  }

  /** Odvaha z HUD: číslo v `.param`, který obsahuje ikonu `resources-courage`. */
  function readCourage() {
    const icon = Array.from(document.querySelectorAll('[class*="resources-courage"]'))
      .find(e => !e.closest('#cmc-gym-bar'));
    const box = icon && (icon.closest('.param') || icon.parentElement);
    if (!box) return null;
    // v `.param` je ikona i hodnota; ikona číslo nemá, tak se vezme text celku
    return NS.parse.toNum(box.textContent);
  }

  const readSpeed = () => hudNum(document.querySelector('.value.renew-modded-speed'))
    ?? NS.parse.toNum((document.querySelector('.value.renew-modded-speed') || {}).textContent || '');

  /* ---- čtení požadavků ---------------------------------------------------- */

  /** Jeden zločin z jeho fragmentu. */
  async function readCrime(n) {
    const { status, raw } = await NS.parse.apiGet(URL_OF(n));
    if (status !== 200 || /"errors"/.test(raw.slice(0, 60))) return null;
    const d = doc(raw);
    const t = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ').trim();

    // požadavky jsou jen v úseku mezi „Budeš potřebovat:“ a „Odměna:“ –
    // kdekoli jinde v textu by se dalo narazit na jiná čísla
    const req = (t.match(/Budeš potřebovat:(.*?)(?:Odměna:|$)/) || [])[1] || '';
    const num = (s, re) => NS.parse.byRe(s, re);

    return {
      n,
      // název stojí mezi procentem a „Budeš potřebovat“ (v `.box-h` je „Zločin 0%“)
      name: ((t.match(/%\s*(.+?)\s*Budeš potřebovat/) || [])[1] || ('Zločin ' + n)).trim(),
      courage: num(req, /Odvaha:\s*(\d[\d\s .,]*)/i),
      speed: num(req, /Rychlost:\s*(\d[\d\s .,]*)/i),
      chance: num(t, /(\d+)\s*%/),
      moneyFrom: num(t, /Peníze:\s*od\s*(\d[\d\s .,]*)\s*Kč/i),
      moneyTo: num(t, /Peníze:\s*od\s*[\d\s .,]*\s*Kč\s*až do\s*(\d[\d\s .,]*)\s*Kč/i),
      xpFrom: num(t, /Zkušenosti:\s*od\s*(\d[\d\s .,]*)/i),
      xpTo: num(t, /Zkušenosti:\s*od\s*[\d\s .,]*\s*až do\s*(\d[\d\s .,]*)/i)
    };
  }

  /**
   * Seznam zločinů. Drží se v `chrome.storage`, protože požadavky se nemění –
   * bez toho by každé načtení herní stránky znamenalo 20 požadavků.
   */
  function load(force) {
    const cache = NS.store.get().crimes;
    if (!force && cache && cache.list.length && Date.now() - cache.at < TTL) {
      return Promise.resolve(cache.list);
    }
    if (inflight) return inflight;
    inflight = doLoad().finally(() => { inflight = null; });
    return inflight;
  }

  async function doLoad() {
    const list = [];
    for (let n = 1; n <= COUNT; n++) {
      const c = await readCrime(n);
      if (c) list.push(c);
      await sleep(90);      // ať to hru nezasypeme dvaceti požadavky naráz
    }
    if (!list.length) return NS.store.get().crimes.list;
    // podle odvahy: mapa má nejtěžší zločin jako crime/1, což je na přeskáčku
    list.sort((a, b) => (a.courage || 0) - (b.courage || 0));
    await NS.store.put('crimes', { at: Date.now(), list });
    return list;
  }

  /* ---- akce --------------------------------------------------------------- */

  /**
   * Spáchá zločin: fragment se vloží do herního kontejneru a klikne se na
   * skutečné „Spáchat zločin“ – požadavek posílá hra.
   */
  async function commit(n) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const { status, raw } = await NS.parse.apiGet(URL_OF(n));
    if (status !== 200) throw new Error('zločin nelze přečíst (HTTP ' + status + ')');
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen';
    box.innerHTML = raw;
    host.appendChild(box);

    try {
      await sleep(150);   // ať se poskládá layout – handler čte offset()

      // jen základní tlačítko; `…/crimes/{n}/{násobek}` je Turbo za diamanty
      const btn = Array.from(box.querySelectorAll('.doCrime, [action*="' + ACTION_BASE + '"]'))
        .find(el => {
          const a = el.getAttribute('action') || '';
          const rest = a.split(ACTION_BASE)[1];
          return rest && rest.split('?')[0] === String(n);
        });
      if (!btn) throw new Error('tlačítko „Spáchat zločin“ ve fragmentu není');

      btn.click();
      await sleep(300);
      return true;
    } finally {
      box.remove();
    }
  }

  /* ---- automatické páchání (volitelné, výchozí vypnuto) -------------------- */

  /*
   * !!! KLIKÁ BEZ TVÉHO KLIKNUTÍ !!!
   * Vybraný zločin se páchá sám, dokud na něj stačí odvaha. Používá se stejná
   * cesta jako u tvého kliku – fragment do herního okna a klik na skutečné
   * „Spáchat zločin“, požadavek posílá hra.
   *
   * Po každém kliku se ČEKÁ, až odvaha v HUD opravdu klesne. Hra si HUD u zločinů
   * obnovuje sama, ale ne okamžitě (ověřeno: 18 → 14 chvíli po akci), a bez toho
   * čekání by se klikalo podle zastaralého čísla a přestřelilo by se to.
   * Když odvaha neklesne do limitu, dávka se ukončí – radši méně než naslepo.
   */
  const AUTO_MAX_BURST = 20;
  const AUTO_GAP = 1000;
  const HUD_WAIT = 2500;

  let autoRunning = false;
  let autoStop = false;

  /** Co je NASTAVENÉ (bez ohledu na hlavní vypínač). */
  function autoSetting() {
    const id = +NS.store.get().read.autoCrime || 0;
    if (!id) return null;
    const list = (NS.store.get().crimes || {}).list || [];
    return list.find(c => c.n === id) || null;
  }

  /** Co se SMÍ spustit – nastavené a zároveň nepozastavené hlavním vypínačem. */
  const autoOn = () => (NS.store.get().read.autoPaused === true ? null : autoSetting());

  /** Počká, až hra sama přepíše odvahu v HUD. Vrací novou hodnotu, nebo null. */
  async function waitForCourageDrop(pred) {
    const do_ = Date.now() + HUD_WAIT;
    while (Date.now() < do_) {
      await sleep(200);
      const now = readCourage();
      if (now != null && now < pred) return now;
    }
    return null;
  }

  /** Dávka: páchat, dokud stačí odvaha. */
  async function autoBurst(crime) {
    if (autoRunning) return 0;
    autoRunning = true;
    autoStop = false;
    let hotovo = 0;
    try {
      while (!autoStop && hotovo < AUTO_MAX_BURST) {
        const cur = autoOn();
        if (!cur || cur.n !== crime.n) break;

        if (NS.jail && NS.jail.blocked()) {
          NS.gym.setStatus('⚠ auto zastaveno: vězení', true);
          return hotovo;
        }

        const odvaha = readCourage();
        const rychlost = readSpeed();
        if (stateOf(crime, odvaha, rychlost) !== 'ready') break;

        NS.gym.setStatus('auto ' + crime.name + ': ' + (hotovo + 1) + '×…');
        await NS.gym.withSuspend(() => commit(crime.n));
        hotovo++;

        const odmitnuto = NS.gym.gameRefusal();
        if (odmitnuto) {
          NS.gym.setStatus('⚠ auto zastaveno: ' + odmitnuto, true);
          return hotovo;
        }
        // bez potvrzení z HUD se dál neklikne
        if (odvaha != null && (await waitForCourageDrop(odvaha)) == null) {
          NS.gym.setStatus('auto ' + crime.name + ': ' + hotovo + '× (HUD se neozval, končím)');
          return hotovo;
        }
        await sleep(AUTO_GAP);
      }
      NS.gym.setStatus('auto ' + crime.name + ': ' + hotovo + '× hotovo'
        + (autoStop ? ' (zastaveno)' : ''));
      return hotovo;
    } catch (e) {
      NS.gym.setStatus('⚠ auto ' + crime.name + ': ' + e.message, true);
      return hotovo;
    } finally {
      autoRunning = false;
      const zprava = NS.gym.statusText ? NS.gym.statusText() : '';
      NS.gym.collect();
      if (zprava) NS.gym.setStatus(zprava);
    }
  }

  /** Hlídá odvahu; jakmile na vybraný zločin stačí, spustí dávku. */
  function autoCheck() {
    if (autoRunning) return;
    if (NS.jail && NS.jail.blocked()) return;   // ve vězení se neklika
    const crime = autoOn();
    if (!crime) return;
    if (stateOf(crime, readCourage(), readSpeed()) !== 'ready') return;
    autoBurst(crime);
  }

  /* ---- řádek v liště ------------------------------------------------------ */

  /** Stav zločinu podle toho, co hráč právě má. */
  function stateOf(c, courage, speed) {
    if (c.speed != null && speed != null && speed < c.speed) return 'locked';
    if (c.courage != null && courage != null && courage < c.courage) return 'wait';
    return 'ready';
  }

  const MODE_CLASS = {
    ready: 'cmc-gym-unit-send',                              // vínově: jde spáchat
    wait: 'cmc-gym-unit-away cmc-gym-unit-partial',           // šedě s oranžovým rámečkem: chybí odvaha
    locked: 'cmc-gym-btn-link'                                // se zámkem: nestačí rychlost
  };

  const legend = 'Zločiny: na tlačítku je potřebná odvaha. Vínově = jde spáchat,'
    + ' oranžový rámeček = odvaha se ještě musí obnovit, 🔒 = nestačí rychlost.'
    + ' Řazeno podle odvahy; podrobnosti jsou v tooltipu tlačítka.';

  function titleFor(c, stav, courage, speed) {
    const kdy = stav === 'locked'
      ? 'nestačí rychlost: máš ' + NS.fmt.num(speed) + ', potřeba ' + NS.fmt.num(c.speed)
        + ' (chybí ' + NS.fmt.num(c.speed - speed) + ')'
      : stav === 'wait'
        ? 'chybí odvaha: máš ' + NS.fmt.num(courage) + ', potřeba ' + NS.fmt.num(c.courage)
        : 'klik spáchá zločin';
    // „25–41 Kč“, ne „25 Kč–41 Kč“; fmt.kc si drží desetiny u drobných částek
    const bezKc = v => NS.fmt.kc(v).replace(/\s*Kč$/, '');
    const odmena = c.moneyFrom != null
      ? '; odměna ' + bezKc(c.moneyFrom) + '–' + NS.fmt.kc(c.moneyTo || c.moneyFrom) + ' špinavých'
        + (c.xpFrom != null ? ', ' + NS.fmt.num(c.xpFrom) + '–' + NS.fmt.num(c.xpTo || c.xpFrom) + ' xp' : '')
      : '';
    return c.name
      + ' – odvaha ' + NS.fmt.num(c.courage)
      + (c.speed ? ', rychlost ' + NS.fmt.num(c.speed) : '')
      + odmena + '; ' + kdy;
  }

  /**
   * Postaví řádek. `onChange` se zavolá po akci, aby lišta překreslila.
   * Vrací null, dokud nejsou požadavky načtené (dotáhnou se na pozadí).
   */
  /*
   * !!! DVA ŘÁDKY, NE JEDEN !!!
   * Zločinů je dvacet a v jednom řádku z nich byla přes celou lištu čára, ve
   * které se špatně hledalo. Dělí se proto na půl: první řádek nese popisek
   * a levou polovinu, druhý zbytek a volbu automatiky. Vrací se pole – lišta
   * si ho rozbalí stejně jako u letadel a lodí.
   */
  function row(onChange) {
    const cache = NS.store.get().crimes;
    const list = cache && cache.list;
    if (!list || !list.length) {
      load().then(l => { if (l && l.length) onChange(); }).catch(() => {});
      return null;
    }
    if (Date.now() - cache.at >= TTL) load().then(() => onChange()).catch(() => {});

    const courage = readCourage();
    const speed = readSpeed();

    const prvni = document.createElement('div');
    prvni.className = 'cmc-gym-row cmc-gym-crime-row';
    const druhy = document.createElement('div');
    druhy.className = 'cmc-gym-row cmc-gym-crime-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = 'Zločiny:';
    label.title = legend;
    prvni.appendChild(label);

    /*
     * Druhý řádek dostane prázdný popisek téže šířky, aby tlačítka začínala
     * pod sebou – bez něj by se druhá polovina posunula doleva.
     */
    const odsazeni = document.createElement('span');
    odsazeni.className = 'cmc-gym-label cmc-gym-label-prazdny';
    odsazeni.setAttribute('aria-hidden', 'true');
    druhy.appendChild(odsazeni);

    // dělí se na půl, lichý počet nechá o jedno víc nahoře
    const pulka = Math.ceil(list.length / 2);

    for (const [i, c] of list.entries()) {
      const stav = stateOf(c, courage, speed);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-gym-unit cmc-gym-crime ' + MODE_CLASS[stav];
      b.textContent = NS.fmt.num(c.courage) + (stav === 'locked' ? ' 🔒' : '');
      b.title = titleFor(c, stav, courage, speed);
      b.disabled = stav !== 'ready';

      if (stav === 'ready') {
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (b.disabled) return;
          b.disabled = true;
          NS.gym.setStatus(c.name + '…');
          try {
            await NS.gym.withSuspend(() => commit(c.n));

            /*
             * Odvaha se tady NEODEČÍTÁ. U zločinů si hra HUD obnoví sama i při
             * akci z modalu na pozadí (ověřeno: 18 → 14 u zločinu za 4 odvahy),
             * takže ruční odečet jako u posilovny by ubral dvakrát. Řádek si
             * odvahu čte z HUD při každém překreslení, takže stačí počkat, až
             * hra HUD přepíše, a překreslit.
             */
            const odmitnuto = NS.gym.gameRefusal();
            setTimeout(() => {
              onChange();
              NS.gym.setStatus(odmitnuto ? '⚠ ' + odmitnuto : 'spácháno: ' + c.name, !!odmitnuto);
            }, 700);
          } catch (e) {
            NS.gym.setStatus('⚠ ' + c.name + ': ' + e.message, true);
            b.disabled = false;
          }
        });
      }
      (i < pulka ? prvni : druhy).appendChild(b);
    }

    druhy.appendChild(autoControl(list, courage, speed, onChange));
    return [prvni, druhy];
  }

  /**
   * Výběr zločinu pro automatiku. Nabídka je řazená podle odvahy stejně jako
   * tlačítka, aby se hledalo na stejném místě; co nejde kvůli rychlosti, je
   * v nabídce vypnuté – nemá smysl to nabízet.
   */
  function autoControl(list, courage, speed, onChange) {
    const vybrany = autoSetting();
    const pozastaveno = NS.store.get().read.autoPaused === true;

    const wrap = document.createElement('span');
    wrap.className = 'cmc-gym-auto'
      + (vybrany && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (vybrany && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (vybrany && pozastaveno ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
      + (vybrany
        ? 'Automaticky se páchá „' + vybrany.name + '“ (odvaha ' + NS.fmt.num(vybrany.courage)
          + '), dokud odvaha stačí – max ' + AUTO_MAX_BURST + '× na dávku, prodleva '
          + AUTO_GAP + ' ms. Klikání nespouštíš ty; „vypnuto“ to hned ukončí.'
        : 'Vybraný zločin se bude páchat sám, dokud stačí odvaha. Pozor, tohle klikne'
          + ' BEZ tvého kliknutí.');

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto';
    wrap.appendChild(txt);

    const sel = document.createElement('select');
    sel.className = 'cmc-gym-auto-select';
    const vypnuto = document.createElement('option');
    vypnuto.value = '';
    vypnuto.textContent = 'vypnuto';
    sel.appendChild(vypnuto);
    for (const c2 of list) {
      const o = document.createElement('option');
      o.value = String(c2.n);
      o.textContent = NS.fmt.num(c2.courage) + ' · ' + c2.name;
      // zamčené rychlostí nemá smysl nabízet
      if (stateOf(c2, courage, speed) === 'locked') o.disabled = true;
      if (vybrany && vybrany.n === c2.n) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', async () => {
      await NS.store.patch('read', { autoCrime: +sel.value || 0 });
      autoStop = true;
      NS.gym.collect(true);
    });
    wrap.appendChild(sel);

    if (vybrany) {
      if (pozastaveno) {
        const p = document.createElement('span');
        p.className = 'cmc-gym-auto-label';
        p.textContent = 'pozastaveno';
        wrap.appendChild(p);
      }
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'cmc-gym-auto-stop';
      stop.textContent = '■';
      stop.title = 'zastavit běžící dávku (volba zůstane zapnutá)';
      stop.addEventListener('click', () => {
        autoStop = true;
        NS.gym.setStatus('auto: zastavuji…');
      });
      wrap.appendChild(stop);
    }
    return wrap;
  }

  NS.crimes = {
    row, load, commit, readCrime, readCourage, readSpeed, stateOf, COUNT,
    autoCheck, autoBurst, autoSetting, autoOn, autoControl, AUTO_MAX_BURST,
    stopAuto() { autoStop = true; }
  };
})();
