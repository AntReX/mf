/* =============================================================================
 * parse.js – ČTENÍ stavu ze hry
 *
 * Jediný způsob komunikace s hrou v celém rozšíření: HTTP GET na endpointy,
 * které hra volá při běžném prohlížení budovy. Žádný POST / DELETE, žádná
 * herní akce, žádná simulace kliknutí. Stav se pouze čte a parsuje.
 *
 * Profily níž jsou postavené na skutečných fragmentech ze s1.czechmafie.cz,
 * ne na odhadu – fixtures s reálnými texty jsou součástí testů.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});
  const ORIGIN = location.origin;

  /* ---------------------------------------------------------------------------
   * Čísla v herním formátu.
   *
   * Hra velká čísla zkracuje: "384K", "12.63 mld", "1 trln", "5.5 trln".
   * Bez rozpoznání zkratky by "3.4 mld" znamenalo 3,4 – tedy miliardkrát
   * méně. U zkráceného čísla je tečka VŽDY desetinná ("12.63 mld"), u plného
   * čísla může být oddělovač tisíců ("12.000") – proto dvě různé cesty.
   * ------------------------------------------------------------------------ */

  // slovní zkratky jsou nedvojznačné i bez ohledu na velikost písmen;
  // delší varianty musí být první, jinak by "mld" spadlo pod "m"
  const WORD_SCALE = [
    ['trln', 1e12], ['bil', 1e12],
    ['mld', 1e9], ['mrd', 1e9],
    ['mil', 1e6], ['mio', 1e6],
    ['tis', 1e3]
  ];
  // jednopísmenné zkratky jen VELKÝM písmenem – malé "k" je v "kg", "kus", "ks"
  const LETTER_SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

  /** Část regexu pro číslo včetně případné slovní zkratky (bezpečné i s /i). */
  const NUM_WORD = '\\d[\\d\\s .,]*(?:\\s*(?:trln|bil|mld|mrd|mil\\.?|mio|tis\\.?))?';

  function toNum(s) {
    if (s == null) return null;
    const str = String(s).replace(/\u00a0| /g, ' ').trim();

    // 1) zkrácené číslo: "12.63 mld", "5.5 trln", "384K"
    const word = str.match(/^([\d\s.,]+?)\s*(trln|bil|mld|mrd|mil\.?|mio|tis\.?)\b/i);
    const letter = str.match(/^([\d\s.,]+?)\s*([KMBT])(?![\wá-žÁ-Ž])/);
    const hit = word || letter;
    if (hit) {
      const base = parseFloat(hit[1].replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(base)) return null;
      const key = hit[2].replace(/\./g, '').toLowerCase();
      const mult = word
        ? (WORD_SCALE.find(([k]) => key.startsWith(k)) || [null, 1])[1]
        : LETTER_SCALE[hit[2]];
      return base * mult;
    }

    // 2) plné číslo: mezery jsou oddělovač tisíců, tečka před třemi
    //    číslicemi taky ("12.000"), jinak je tečka desetinná ("2.50")
    const n = parseFloat(str
      .replace(/\s/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Číslo ZA popiskem: numAfter(t, 'Pšenice') → 1416 z "Pšenice: 1 416 kg". */
  function numAfter(text, label) {
    const m = text.match(new RegExp(esc(label) + '\\s*:?\\s*([\\d\\s\\u00a0.,]+)', 'i'));
    return m ? toNum(m[1]) : null;
  }

  /** Číslo PŘED popiskem: numBefore(t, 'kg pšenice na sud') → 8. */
  function numBefore(text, label) {
    const m = text.match(new RegExp('([\\d\\s\\u00a0.,]+)\\s*' + esc(label), 'i'));
    return m ? toNum(m[1]) : null;
  }

  /** Číslo podle regexu (první zachytávající skupina). */
  function byRe(text, re) {
    if (!re) return null;
    const m = text.match(re);
    return m ? toNum(m[1]) : null;
  }

  const flatten = doc => (doc && doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim();

  /* ===========================================================================
   * PROFILY BUDOV – regexy odpovídají skutečným formulacím ve hře.
   * Když hra text změní, hodnota bude null a karta na to upozorní; nikdy se
   * nerozbije celé čtení.
   * ========================================================================= */
  const PROFILES = {
    whisky: {
      title: 'Palírna whisky',
      unitForms: ['sud', 'sudy', 'sudů'],
      unitAcc: 'sud',
      inputs: [{
        key: 'wheat', label: 'Pšenice', of: 'pšenice', unit: 'kg',
        stockRe: /Pšenice\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
        perUnitRe: /(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*kg pšenice na sud/i,
        priceRe: /Cena:\s*(\d[\d.,]*)\s*Kč\s*za\s*kg/i
      }],
      freeRe: /Prázdné a nepoužité sudy\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
      freeLabel: 'Volné sudy',
      usedRe: /Zraje\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*sud/i,
      usedLabel: 'Zraje',
      enoughRe: /Máš dost ingrediencí na\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*sud/i,
      // "Zraje: 14 358 sudy a dostane: 430 740 l" → výnos na sud dopočítáme
      batchYieldRe: /a dostane:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*l/i,
      output: { name: 'whisky', of: 'whisky', unit: 'l' }
    },

    farm: {
      title: 'Konopná farma',
      unitForms: ['hektar', 'hektary', 'hektarů'],
      unitAcc: 'hektar',
      inputs: [{
        key: 'seeds', label: 'Semena', of: 'semen', unit: 'ks',
        stockRe: /Semena konopí\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
        perUnitRe: /Zasít\s*1\s*hektar\s*[–\-]\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*semen/i,
        priceRe: /semínko stojí\s*(\d[\d.,]*)/i
      }],
      freeRe: /Neosazené hektary\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
      freeLabel: 'Volné hektary',
      enoughRe: /můžeš osít\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*ha/i,
      output: { name: 'úroda', of: 'úrody', unit: 'kg' }
    },

    brewery: {
      title: 'Pivovar',
      unitForms: ['sud', 'sudy', 'sudů'],
      unitAcc: 'sud',
      // pivo potřebuje DVĚ suroviny; limitem je ta, které je poměrově méně
      inputs: [
        {
          key: 'hops', label: 'Chmel', of: 'chmele', unit: 'kg',
          stockRe: /Chmel\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
          perUnitRe: /(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*kg chmele na sud/i,
          priceRe: /kg chmele stojí\s*(\d[\d.,]*)/i
        },
        {
          key: 'barley', label: 'Ječmen', of: 'ječmene', unit: 'kg',
          stockRe: /Ječmen\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
          perUnitRe: /(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*kg ječmene na sud/i,
          priceRe: /kg ječmene stojí\s*(\d[\d.,]*)/i
        }
      ],
      freeRe: /Prázdné a nepoužité sudy\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
      freeLabel: 'Volné sudy',
      enoughRe: /Máš dost ingrediencí na\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*sud/i,
      yieldPerUnitRe: /V jednom sudu se uvaří\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*l/i,
      output: { name: 'pivo', of: 'piva', unit: 'l' }
    },

    meth: {
      title: 'Laboratoř pervitinu',
      // jednotkou výroby je chemik, ne nádoba
      unitForms: ['chemik', 'chemici', 'chemiků'],
      unitAcc: 'chemika',
      inputs: [{
        key: 'pills', label: 'Tablety', of: 'tablet', unit: 'ks',
        stockRe: /Tablety proti nachlazení\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
        perUnitRe: /1 chemik potřebuje\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*pilulek/i,
        priceRe: /Jedna tableta stojí\s*(\d[\d.,]*)/i
      }],
      freeRe: /Dostupní chemici\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
      freeLabel: 'Dostupní chemici',
      enoughRe: /To stačí pro\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*chemik/i,
      output: { name: 'pervitin', of: 'pervitinu', unit: 'g' }
    },

    // banka není výrobní budova – čte se z ní majetek
    bank: {
      title: 'Banka',
      money: {
        bankRe: /v bance uloženo\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i,
        dirtyRe: /Momentálně máš\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*Kč\s*Kolik peněz vyprat/i,
        cleanRe: /Momentálně máš\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)\s*Kč\s*Kolik čistých/i,
        launderLimitRe: /můžeš vyprat\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i
      }
    }
  };

  // ---- HTTP (pouze GET) ----------------------------------------------------
  const TIMEOUT_MS = 12000;

  /**
   * GET s časovým limitem. Bez limitu by jediná neodpovídající odpověď zasekla
   * celé čtení a panel by tvrdošíjně hlásil „Načítám…“.
   */
  async function apiGet(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(ORIGIN + path, {
        method: 'GET',
        credentials: 'include',
        signal: ctrl.signal,
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/html' }
      });
      return { status: r.status, raw: await r.text() };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Hra neodpověděla do ' + (TIMEOUT_MS / 1000) + ' s.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadBuilding(id) {
    const { status, raw } = await apiGet('/map/building/show/' + id);
    if (status !== 200) throw new Error('HTTP ' + status + ' pro budovu ' + id);
    if (/"errors"\s*:\s*"Nenalezeno"/.test(raw)) throw new Error('Budova ' + id + ' neexistuje.');
    return new DOMParser().parseFromString(raw, 'text/html');
  }

  /**
   * Prodejní stránka produktu (/inventory/whisky, /beer, /marijuana, /meth).
   * Hra tu uvádí aktuální výkupní cenu a kolik zboží máš na skladě – bez toho
   * by kalkulačka počítala s cenou, kterou si někdo vymyslel.
   *
   * @returns {{qty, unit, price, priceUnit, totalIfSold}}
   */
  async function readSale(slug) {
    const { status, raw } = await apiGet('/inventory/' + slug);
    if (status !== 200) throw new Error('HTTP ' + status + ' pro /inventory/' + slug);
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const text = flatten(doc);
    const priceMatch = text.match(/Cena za (litr|gram|kus|kg)\s*:?\s*(\d[\d.,]*)/i);
    const UNIT = { litr: 'l', gram: 'g', kus: 'ks', kg: 'kg' };
    return {
      qty: byRe(text, /Množství\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i),
      unit: (text.match(/Množství\s*:\s*\d[\d\s .,]*([a-zA-Zá-žÁ-Ž]+)/) || [])[1] || null,
      price: priceMatch ? toNum(priceMatch[2]) : null,
      priceUnit: priceMatch ? (UNIT[priceMatch[1].toLowerCase()] || priceMatch[1]) : null,
      totalIfSold: byRe(text, /Celkem dostaneš\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i)
    };
  }

  /** Nabízí hra u budovy aktivní sklizeň / sběr? Jen zjištění, nic se neposílá. */
  function offersHarvest(doc) {
    return Array.from(doc.querySelectorAll('[action]')).some(e =>
      (e.getAttribute('action') || '').includes('/harvest/') &&
      !e.classList.contains('disabled') && !e.hasAttribute('disabled'));
  }

  /**
   * Zbývající čas VÝROBY v sekundách.
   *
   * Fragment obsahuje dva časovače: upgrade budovy (`.reward-line.with-timer`)
   * a probíhající výrobu (`.working`). Bere se výhradně výrobní – jinak by se
   * „budova bude vylepšena za 6 h“ tvářilo jako čas do sklizně.
   */
  function productionSeconds(doc) {
    const work = doc.querySelector('.working');
    if (!work) return null;

    const done = toNum(work.getAttribute('data-timedone'));
    const now = toNum(work.getAttribute('data-timenow'));
    if (done != null && now != null) return Math.max(0, done - now);

    const timer = work.querySelector('[time-left-secs]');
    const secs = timer ? toNum(timer.getAttribute('time-left-secs')) : null;
    return secs != null ? Math.max(0, secs) : null;
  }

  /** Nejvyšší % z progress barů (dozrání / rozpracovanost). */
  function percentOf(doc) {
    const vals = Array.from(doc.querySelectorAll('.progress-time-passed, .progress-bar, [class*="progress"]'))
      .map(e => {
        const byText = (e.textContent.match(/(\d{1,3})\s*%/) || [])[1];
        const byStyle = (e.getAttribute('style') || '').match(/width:\s*(\d{1,3})(?:\.\d+)?%/);
        return toNum(byText) ?? (byStyle ? toNum(byStyle[1]) : null);
      })
      .filter(v => v != null && v >= 0 && v <= 100);
    return vals.length ? Math.max(...vals) : null;
  }

  /** Fallback pro neznámý typ budovy: první dvojice "Popisek: číslo". */
  function genericFields(text, limit = 6) {
    const out = [];
    const re = /([A-ZÁ-Žá-ž][\wá-žÁ-Ž\s]{2,28}?)\s*:\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/g;
    let m;
    while ((m = re.exec(text)) && out.length < limit) {
      const v = toNum(m[2]);
      if (v != null) out.push({ k: m[1].trim(), v });
    }
    return out;
  }

  /**
   * Vytáhne z textu fragmentu vše, co jde: zásoby všech surovin, volnou
   * kapacitu, spotřebu, CENY a VÝNOS (hra je uvádí, takže se nemusí zadávat
   * ručně) a hlavně `enough` – na kolik jednotek zásoby vystačí.
   *
   * Oddělené od HTTP, aby se dalo testovat proti reálným fixtures.
   */
  function readFromText(text, spec) {
    const p = PROFILES[spec.kind];
    const out = { metrics: {}, fields: [], inputs: [], unmatched: false };

    if (!p) {
      out.fields = genericFields(text);
      out.metrics = Object.fromEntries(out.fields.map(f => [f.k, f.v]));
      return out;
    }

    out.unitForms = p.unitForms;
    out.unitAcc = p.unitAcc;
    out.output = p.output;

    // banka: jen peníze, žádná výroba
    if (p.money) {
      const m = p.money;
      out.isBank = true;
      out.metrics = {
        bank: byRe(text, m.bankRe),
        dirty: byRe(text, m.dirtyRe),
        clean: byRe(text, m.cleanRe),
        launderLimit: byRe(text, m.launderLimitRe)
      };
      out.fields = [
        { k: 'V bance', v: out.metrics.bank, unit: 'Kč' },
        { k: 'Čisté', v: out.metrics.clean, unit: 'Kč' },
        { k: 'Špinavé', v: out.metrics.dirty, unit: 'Kč' },
        { k: 'Lze vyprat', v: out.metrics.launderLimit, unit: 'Kč' }
      ];
      if (out.metrics.bank == null && out.metrics.clean == null) out.unmatched = true;
      return out;
    }

    // suroviny (pivovar má dvě)
    for (const inp of p.inputs || []) {
      const stock = byRe(text, inp.stockRe);
      const perUnit = byRe(text, inp.perUnitRe);
      const price = byRe(text, inp.priceRe);
      out.inputs.push({
        key: inp.key, label: inp.label, of: inp.of, unit: inp.unit,
        stock, perUnit, price
      });
      out.fields.push({ k: inp.label, v: stock, unit: inp.unit });
    }

    const free = byRe(text, p.freeRe);
    const used = byRe(text, p.usedRe);
    const enough = byRe(text, p.enoughRe);

    // výnos na jednotku: buď to hra řekne přímo, nebo se dopočítá z dávky
    let yieldPerUnit = byRe(text, p.yieldPerUnitRe);
    if (yieldPerUnit == null && p.batchYieldRe && used > 0) {
      const batch = byRe(text, p.batchYieldRe);
      if (batch != null) yieldPerUnit = Math.round((batch / used) * 100) / 100;
    }

    const first = out.inputs[0] || {};
    out.metrics = {
      stock: first.stock ?? null,          // hlavní surovina (kvůli grafům historie)
      perUnit: first.perUnit ?? null,
      free,
      used,
      enough,
      capacity: free != null && used != null ? free + used : null,
      yieldPerUnit
    };
    for (const inp of out.inputs) out.metrics['stock_' + inp.key] = inp.stock;

    out.fields.push({ k: p.freeLabel || 'Volné', v: free });
    if (used != null) out.fields.push({ k: p.usedLabel || 'Obsazeno', v: used });

    if (free == null && !out.inputs.some(i => i.stock != null)) {
      out.fields = out.fields.concat(genericFields(text, 4));
      out.unmatched = true;
    }
    return out;
  }

  /**
   * Přečte stav jedné budovy.
   * @param {{id:number,label:string,kind:string,capacity?:number}} spec
   */
  async function readBuilding(spec) {
    const doc = await loadBuilding(spec.id);
    const text = flatten(doc);
    if (!text) throw new Error('Prázdná odpověď – ID budovy ' + spec.id + ' asi neexistuje.');

    const parsed = readFromText(text, spec);

    // ruční kapacita z nastavení, když ji z fragmentu spočítat nelze
    let capacitySource = parsed.metrics.capacity != null ? 'ze hry' : null;
    if (parsed.metrics.capacity == null && spec.capacity > 0) {
      parsed.metrics.capacity = +spec.capacity;
      capacitySource = 'ručně';
    }

    return {
      id: spec.id,
      label: spec.label || (PROFILES[spec.kind] && PROFILES[spec.kind].title) || ('Budova ' + spec.id),
      kind: spec.kind || 'generic',
      at: Date.now(),
      percent: percentOf(doc),
      remainingSec: productionSeconds(doc),
      harvestReady: offersHarvest(doc),
      capacitySource,
      ...parsed
    };
  }

  // ---- peníze v živém UI hry ----------------------------------------------

  /** První číslo v textu prvku; vlastní panel rozšíření se ignoruje. */
  function numIn(el) {
    if (!el || (el.closest && el.closest('#cmc-panel'))) return null;
    return toNum((el.textContent.match(/\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|tis\.?)|\s*[KMBT](?![\wá-žÁ-Ž]))?/i) || [])[0]);
  }

  function bySelector(selector) {
    if (!selector) return null;
    try {
      return numIn(document.querySelector(selector));
    } catch {
      return null;
    }
  }

  /**
   * Valuty z HUD hry. Hlavička obsahuje `.money-set` s prvky `.mparam`, každý
   * s ikonou dané valuty – čisté peníze, špinavé peníze a diamanty
   * (v CSS „crystal“). Tohle je nejspolehlivější zdroj, protože HUD je na
   * každé herní stránce; hledá se jen v `.mparam`, takže ceny odměn ani
   * ceny urychlení se do toho nepletou.
   *
   * @returns {{clean:number|null, dirty:number|null, gems:number|null}}
   */
  function readHud() {
    const out = { clean: null, dirty: null, gems: null };
    for (const mp of document.querySelectorAll('.mparam')) {
      if (mp.closest('#cmc-panel')) continue;
      const icon = mp.querySelector('[class*="currency-"]');
      if (!icon) continue;
      const cls = String(icon.className);
      const v = toNum((mp.textContent.match(/[\d\s .,]{1,}/) || [])[0]);
      if (v == null) continue;
      if (/currency-crystal/.test(cls)) out.gems = out.gems ?? v;
      else if (/currency-money-dirty/.test(cls)) out.dirty = out.dirty ?? v;
      else if (/currency-money/.test(cls)) out.clean = out.clean ?? v;
    }
    return out;
  }

  /**
   * Hotovost z živého UI. Panel rozšíření je z hledání vyloučený – jinak by si
   * přečetl vlastní čísla a krmil se svým výstupem.
   */
  function readCash(selector) {
    const v = bySelector(selector);
    if (v != null) return v;

    const candidates = ['#money', '.money', '.cash', '#cash',
      '[class*="money"]', '[class*="cash"]', '[id*="money"]'];
    for (const sel of candidates) {
      for (const el of document.querySelectorAll(sel)) {
        const n = numIn(el);
        if (n != null && n > 0) return n;
      }
    }

    const head = Array.from(document.querySelectorAll('header, nav, .header, .top, .hud'))
      .filter(e => !e.closest('#cmc-panel'))
      .map(e => e.textContent).join(' ');
    const m = head.match(/([\d\s .,]{4,})\s*(?:K[čc]|\$)/);
    return m ? toNum(m[1]) : null;
  }

  /**
   * Zůstatek v bance z živého UI (záložní cesta). Spolehlivější je sledovat
   * budovu Banka jako typ `bank` – ta dá i špinavé peníze.
   */
  function readBankFromPage(selector) {
    const v = bySelector(selector);
    if (v != null) return v;

    for (const sel of ['#bank', '.bank', '[class*="bank"]', '[id*="bank"]']) {
      for (const el of document.querySelectorAll(sel)) {
        const n = numIn(el);
        if (n != null && n > 0) return n;
      }
    }
    const body = document.body ? document.body.textContent.replace(/\s+/g, ' ') : '';
    const m = body.match(/v bance uloženo\s*(\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|mio|tis\.?))?)/i);
    return m ? toNum(m[1]) : null;
  }

  NS.parse = {
    toNum, numAfter, numBefore, byRe, flatten, NUM_WORD,
    apiGet, loadBuilding, readBuilding, readFromText, readSale,
    productionSeconds, percentOf, offersHarvest,
    readCash, readBankFromPage, readHud, PROFILES
  };
})();
