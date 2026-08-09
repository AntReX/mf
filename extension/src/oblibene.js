/* =============================================================================
 * oblibene.js – ★ oblíbené předměty v inventáři a jejich vylepšování
 *
 * !!! HRA OBLÍBENÉ PŘEDMĚTY NEMÁ !!!
 * V inventáři je `.stars`, ale to je VZÁCNOST, ne oblíbenost – žádná značka,
 * která by přežila ve hře, neexistuje. Hvězdička je proto naše a drží se
 * v úložišti pod `data-item-id` kusu (`oblibene`).
 *
 * ---------------------------------------------------------------------------
 * CO SE ZMĚŘILO V ŽIVÉ HŘE (10. 8. 2026)
 *
 * Karta v inventáři – `.col[data-item-id="161599"]`, akce mají adresu:
 *   /inventory/equip/161599              nasadit (třída `equipItem`)
 *   /inventory/item/upgrade/161599       vylepšit (otevře okno)
 *   /inventory/item/sell/161599          prodat
 *   /inventory/item/auction/161599       do aukce
 *
 * Okno vylepšení jde PŘEČÍST GETEM (vrací 200, na rozdíl od budov), takže cena
 * i kvalita se zjistí bez jediného kliku:
 *   „Úroveň: 0 … Kvůli vzácnosti předmětu získáš při vylepšování +0.15% navíc
 *    Obvyklá cena -9.99 -2.01 -2.36Kč“
 *   <a class="btn … upgrade" action="/inventory/item/upgrade/161599">Vylepšit +96</a>
 *
 * !!! TURBO SE NEPOUŽÍVÁ – NIKDY !!!
 * Vedle běžného vylepšení okno nabízí `…/turboUpgrade/<id>[/5|/10]` za
 * 4 800 / 24 000 / 48 000 DIAMANTŮ. Proti 2,36 Kč u běžného vylepšení je to
 * jiná liga a rozšíření na to nesmí sáhnout – hlídá to i test nad zdrojákem.
 *
 * !!! CO JEŠTĚ NEVÍM !!!
 * Z „Obvyklá cena -9.99 -2.01 -2.36Kč“ je jistá jen poslední položka: špinavé
 * peníze (ikona `currency-money-dirty`). První dvě jsou nejspíš energie a
 * štěstí, ale ikonu u sebe nemají, takže se to NEHÁDÁ: `cena()` je vrací jako
 * `zbyle` a rozhodnutí, jestli na to je, se dělá jen podle špinavých peněz.
 * Až první vylepšení změří HUD před/po, doplní se to sem.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC;
  if (!NS) return;

  const KARTA = '.col[data-item-id]';
  const MARK = 'cmcFav';
  const OKNO = id => '/inventory/item/upgrade/' + id;
  const AKCE = id => new RegExp('/inventory/item/upgrade/' + id + '(?:$|[?#])');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const data = () => NS.store.get().oblibene || {};
  const jeOblibeny = id => !!data()[id];

  const spinave = () => {
    const el = document.querySelector('.value.renew-dirty_money');
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /* ---- značka v inventáři -------------------------------------------------- */

  /** Master a obrázek z karty – ať se dá kus poznat i po zavření inventáře. */
  function popisKarty(karta) {
    const img = karta.querySelector('img');
    const src = img ? img.getAttribute('src') : null;
    const z = src && NS.market ? NS.market.zObrazku(src) : null;
    const jm = karta.querySelector('.over-name');
    /* `zObrazku()` vrací klíč produktu jako `id` (ne `master`) – viz market.js */
    return {
      master: z ? z.id : null,
      obrazek: z ? z.obrazek : null,
      /* novější karta inventáře `.over-name` nemá; název doplní okno vylepšení */
      nazev: jm ? jm.textContent.trim() : null
    };
  }

  async function prepni(id, karta) {
    const db = { ...data() };
    if (db[id]) delete db[id];
    else db[id] = { ...popisKarty(karta), at: Date.now() };
    await NS.store.put('oblibene', db);
    obarvi(id, karta);
    if (NS.gym) NS.gym.collect(true);
  }

  function obarvi(id, karta) {
    const b = karta.querySelector('.cmc-fav');
    if (!b) return;
    const je = jeOblibeny(id);
    b.textContent = je ? '★' : '☆';
    b.classList.toggle('cmc-fav-on', je);
    b.title = (je ? 'Oblíbený – ' : 'Označit jako oblíbený: ')
      + 'objeví se v liště v řádku „Oblíbené“, odkud se dá vylepšovat.'
      + ' Je to značka rozšíření, hra oblíbené předměty nemá.';
  }

  /** Přidá ★ na jednu kartu. */
  function ozdob(karta) {
    if (karta.dataset[MARK]) return;
    const id = karta.getAttribute('data-item-id');
    if (!id) return;
    karta.dataset[MARK] = '1';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-fav';
    b.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();      // ať klik neotevře akci předmětu
      prepni(id, karta).catch(() => {});
    });
    /*
     * Přímo do `.col`, ne do `.col-card-inner`: `.col` už hra pozicuje
     * (`position: relative`), takže se hvězdička má o co opřít a NIKOMU se
     * nemění vztažný rámec. Vkládat ji dovnitř karty znamenalo rozhodit
     * všechny herní absolutně pozicované prvky – viz panel.css.
     *
     * A ne k `.acts`: tam sedí „nasadit / prodat / do aukce“ a přidávat mezi ně
     * další tlačítko je koledování o omylem prodaný předmět.
     */
    karta.appendChild(b);
    obarvi(id, karta);
  }

  function scan() {
    for (const k of document.querySelectorAll(KARTA)) {
      try { ozdob(k); } catch (e) { /* jedna karta nesmí shodit ostatní */ }
    }
  }

  /* ---- čtení okna vylepšení ------------------------------------------------ */

  /**
   * Stav a cena vylepšení. Čte se GETem – okno vylepšení to na rozdíl od budov
   * dovoluje, takže se kvůli ceně nemusí nic klikat.
   */
  async function stav(id) {
    const o = await NS.parse.apiGet(OKNO(id));
    if (o.status !== 200) throw new Error('okno vylepšení nejde přečíst (HTTP ' + o.status + ')');
    const box = document.createElement('div');
    box.innerHTML = o.raw;
    const text = box.textContent.replace(/\s+/g, ' ');

    const tl = [...box.querySelectorAll('a.upgrade, .upgrade')]
      .find(e => AKCE(id).test(e.getAttribute('action') || ''));

    const uroven = (() => { const m = text.match(/Úroveň:\s*(\d+)/i); return m ? +m[1] : null; })();
    const kvalita = (() => {
      const m = text.match(/([+-]?\d+(?:[.,]\d+)?)\s*%\s*navíc/i)
        || text.match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
      return m ? parseFloat(String(m[1]).replace(',', '.')) : null;
    })();
    const nazev = (() => {
      const m = text.match(/Úroveň:\s*\d+\s+([^+]{2,40}?)\s+Síla/i);
      return m ? m[1].trim() : null;
    })();

    /*
     * „Obvyklá cena -9.99 -2.01 -2.36Kč“. Jistá je jen ta s „Kč“ – špinavé
     * peníze. Ostatní se vrací jako `zbyle` a nic se podle nich nerozhoduje.
     */
    const cena = (() => {
      const m = text.match(/Obvyklá cena([^V]*?)Vylepšit/i);
      if (!m) return { spinave: null, zbyle: [] };
      const cisla = (m[1].match(/-?\d+(?:[.,]\d+)?/g) || [])
        .map(x => parseFloat(String(x).replace(',', '.'))).map(Math.abs);
      const kc = m[1].match(/(-?\d+(?:[.,]\d+)?)\s*Kč/);
      return {
        spinave: kc ? Math.abs(parseFloat(String(kc[1]).replace(',', '.'))) : null,
        zbyle: kc ? cisla.slice(0, -1) : cisla
      };
    })();

    return { id, uroven, kvalita, nazev, cena, lzeVylepsit: !!tl, raw: o.raw };
  }

  /* ---- vylepšení ---------------------------------------------------------- */

  let posledni = null;

  /**
   * Vylepší jeden kus BĚŽNÝM vylepšením a ověří to.
   *
   * Kliká se na skutečný prvek z okna hry. Obal musí být `.inventory-action-modal`
   * – hra má posluchač navěšený jako `.inventory-control.items .upgrade,
   * .inventory-action-modal .upgrade`, takže na tlačítko mimo tyhle obaly
   * nezareaguje. (Tohle stálo jeden pokus.)
   */
  async function vylepsi(id) {
    if (NS.captcha && NS.captcha.blokuje()) throw new Error('hra ukazuje captchu');
    if (NS.jail && NS.jail.blocked()) throw new Error('jsi ve vězení/nemocnici');

    const pred = await stav(id);
    if (!pred.lzeVylepsit) throw new Error('okno nenabízí „Vylepšit“');
    const mam = spinave();
    if (pred.cena.spinave != null && mam != null && mam < pred.cena.spinave) {
      throw new Error('chybí špinavé peníze (' + NS.fmt.kc(pred.cena.spinave) + ')');
    }

    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');
    const box = document.createElement('div');
    /* obal se schválně jmenuje jako herní – jinak se klik nezachytí (viz výš) */
    box.className = 'cmc-gym-offscreen inventory-action-modal cmc-fav-box';
    box.innerHTML = pred.raw;
    host.appendChild(box);
    try {
      await sleep(200);
      /*
       * !!! JEN BĚŽNÉ VYLEPŠENÍ !!!
       * Turbo tlačítka mají v adrese `turboUpgrade` a stojí desítky tisíc
       * diamantů. Vybírá se výhradně přesná adresa běžného vylepšení.
       */
      const tl = [...box.querySelectorAll('[action]')].find(e => {
        const a = e.getAttribute('action') || '';
        return !/turboUpgrade/.test(a) && AKCE(id).test(a);
      });
      if (!tl) throw new Error('tlačítko „Vylepšit“ v okně není');
      tl.click();
      await sleep(600);
    } finally {
      box.remove();
    }

    /* ověření: musí stoupnout úroveň nebo kvalita – jinak to není úspěch */
    const po = await stav(id);
    const zmena = (po.uroven != null && pred.uroven != null && po.uroven > pred.uroven)
      || (po.kvalita != null && pred.kvalita != null && po.kvalita > pred.kvalita);
    if (!zmena) {
      throw new Error('klik nic nezměnil (úroveň ' + pred.uroven + '→' + po.uroven
        + ', kvalita ' + pred.kvalita + '→' + po.kvalita + ')');
    }

    posledni = { at: Date.now(), id, nazev: pred.nazev,
      uroven: { pred: pred.uroven, po: po.uroven },
      kvalita: { pred: pred.kvalita, po: po.kvalita },
      cena: pred.cena };
    return posledni;
  }

  /* ---- lišta -------------------------------------------------------------- */

  const cache = new Map();

  function buttons(onChange) {
    const db = data();
    const ids = Object.keys(db);
    if (!ids.length) return [];

    return ids.slice(0, 8).map(id => {
      const z = db[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-fav-btn';
      const s = cache.get(id);
      b.textContent = '★ ' + ((z.nazev || (s && s.nazev) || '#' + id).slice(0, 14))
        + (s && s.uroven != null ? ' ' + s.uroven : '');
      b.title = 'Vylepšit ' + (z.nazev || '#' + id)
        + (s ? ' · úroveň ' + s.uroven + ', kvalita ' + s.kvalita + ' %'
          + (s.cena.spinave != null ? ' · stojí ' + NS.fmt.kc(s.cena.spinave) : '')
          + (s.cena.zbyle.length ? ' + ' + s.cena.zbyle.join(' / ')
            + ' (další zdroje – ještě nevím které)' : '')
          : ' · cenu načtu při prvním kliknutí')
        + '. Turbo se nepoužívá.';

      if (!s) {
        stav(id).then(v => { cache.set(id, v); onChange(); }).catch(() => {});
      }

      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        b.disabled = true;
        NS.gym.setStatus('vylepšení: ' + (z.nazev || '#' + id) + '…', true);
        try {
          const r = await NS.queue.run('předmět', () => vylepsi(id));
          cache.delete(id);
          NS.gym.setStatus('vylepšení: ' + (r.nazev || '#' + id) + ' → úroveň '
            + r.uroven.po + ', kvalita ' + r.kvalita.po + ' %'
            + (r.cena.spinave != null ? ' (za ' + NS.fmt.kc(r.cena.spinave) + ')' : ''), true);
        } catch (e) {
          NS.gym.setStatus('⚠ vylepšení: ' + e.message, false);
        }
        b.disabled = false;
        onChange();
      });
      return b;
    });
  }

  const POPIS_SKUPINY = 'Oblíbené předměty (★ v inventáři). Klik = jedno BĚŽNÉ'
    + ' vylepšení; Turbo za diamanty se nepoužívá. Automatika tu záměrně není,'
    + ' dokud nevíme, co přesně vylepšení spotřebuje.';

  function start() {
    scan();
    const obs = new MutationObserver(() => {
      clearTimeout(start._t);
      start._t = setTimeout(scan, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  NS.oblibene = { start, scan, stav, vylepsi, buttons, jeOblibeny, prepni,
    POPIS_SKUPINY, get posledni() { return posledni; },
    __cache: cache };
})();
