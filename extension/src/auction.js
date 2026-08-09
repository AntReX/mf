/* =============================================================================
 * auction.js – aukce (#2): pomocník pro vyplnění sázky + automatické přihazování
 *
 * !!! HRANICE SE ZMĚNILA – PŘEČTI SI TO !!!
 * Dřív tu stálo, že se na „Nabídnout cenu“ (`.bidAuction`) NIKDY nesahá a že
 * odeslání zůstává na hráči. To už neplatí: na výslovné zadání tu je hlídka,
 * která umí přihodit sama. Platí ale tři pojistky, bez kterých by to byla
 * sázkařská mašina:
 *   1. přihazuje se JEN u položek, kde je ručně nastavený STROP,
 *   2. nikdy se nepřehodí strop – ani o korunu,
 *   3. přihazuje se jen v posledních minutách a jen když nevedeš.
 *
 * ---------------------------------------------------------------------------
 * CO SE DALO ZMĚŘIT (živá hra, 9. 8. 2026) A CO NE
 *
 * Položka `.static-inv.holder`:
 *   .auction-price .sum        → „200 000 987Kč“ (ŠPINAVÉ peníze)
 *   data-time="10149.178005"   → zbývající SEKUNDY; přesnější než odpočet
 *   .time .timer-down          → tentýž čas po číslicích (.hours/.minutes/.seconds)
 *   input[name=amount]         → pole pro sázku (step 0.01)
 *   button.bidAuction[action=…/map/building/auctionSpecial/bid/666]
 *                              → odeslání; z adresy se bere IDENTITA dražby
 *
 * !!! HRA NEUKAZUJE, KDO VEDE !!!
 * Ve výpisu není žádné jméno – ani tvoje. „Vedu?“ se proto nedá přečíst a musí
 * se odvodit: pamatuje se VLASTNÍ poslední nabídka u každé dražby a srovnává se
 * s aktuální cenou. Když je cena vyšší, někdo tě přehodil; když je stejná, vede
 * pořád tvoje (hra nižší ani stejnou nabídku nepřijme, takže rovnost může být
 * jedině tvoje). Bez uložené nabídky se bere, že nevedeš.
 *
 * Nepřímé potvrzení existuje ve zprávách hry: „Někdo v aukci nabídl více než ty.
 * Proto ti bylo 17 574 000Kč vráceno.“ – z toho plyne i to, že prohraná sázka
 * se VRACÍ, takže přihazování nezmrazí peníze natrvalo.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const ITEM = '.static-inv.holder';
  const PRICE = '.auction-price .sum';
  const INPUT = 'input[name="amount"]';
  const BID = '.bidAuction';
  const MARK = 'cmcFillReady';          // aby se lišta nepřidávala dvakrát

  /* Hlídka běží každých 30 s – tak to bylo zadané. */
  const KONTROLA_MS = 30000;
  /*
   * Přihazuje se až v posledních třech minutách. Dřív by to jen zvedalo cenu
   * proti sobě: každý příhoz je vidět a ostatní mají čas reagovat.
   */
  const OKNO_MS = 3 * 60 * 1000;
  /*
   * !!! MINIMÁLNÍ PŘEBITÍ JE 2 % Z ČÁSTKY, NE KORUNA !!!
   * Dřív tu bylo `+1` s odůvodněním „z pravidel plyne, že stačí o korunu víc“.
   * To byl odhad z textu pravidel („předmět získá ten, kdo vsadí nejvíc“) a byl
   * špatný – hra vyžaduje o 2 % vyšší nabídku. Nižší příhoz neprojde, takže by
   * hlídka klikala naprázdno až do konce dražby.
   *
   * Zaokrouhluje se NAHORU a na celé koruny: pole má sice step 0.01, ale
   * s haléři se tady už jednou ztrácely peníze (viz upgrade.js).
   */
  const PRIHOZ_PCT = 2;
  const prihozZ = cena => Math.ceil(cena * (1 + PRIHOZ_PCT / 100));

  const data = () => NS.store.get().aukce || {};
  const zaznam = id => data()[id] || {};

  /*
   * !!! DIAMANTOVÁ AUKCE SE NEŘEŠÍ !!!
   * Na stránce jsou TŘI druhy dražeb a poznají se jedině z adresy tlačítka:
   *   /map/building/auction/bid/32038         předměty          ← ANO
   *   /map/building/auctionSpecial/bid/666    speciální předmět ← ANO
   *   /map/building/pointsAuction/bid/12486   DIAMANTY          ← NE
   * Diamanty (v DOM „points“) se přihazovat nemají, tak je hlídka úplně přeskočí
   * – nedostanou ani pole na strop.
   */
  const DRUHY = ['auction', 'auctionSpecial'];

  /**
   * Identita dražby z adresy tlačítka: `…/auction/bid/32038` → „auction:32038“.
   * `null` u diamantů a u čehokoli, co neumíme zařadit.
   *
   * Druh je součástí klíče schválně: `pointsAuction/bid/12486` a
   * `auction/bid/12486` jsou dvě různé dražby se stejným číslem, a kdyby se
   * ukládaly pod totéž, zdědila by jedna „moje nabídka“ od druhé.
   */
  function lotId(item) {
    const b = item.querySelector(BID);
    const a = b ? (b.getAttribute('action') || '') : '';
    const m = a.match(/\/map\/building\/(\w+)\/bid\/(\w+)/);
    if (!m || !DRUHY.includes(m[1])) return null;
    return m[1] + ':' + m[2];
  }

  /** Je to diamantová dražba? Jen pro hlášku, ať je poznat, proč se nic nedělá. */
  const jeDiamantova = item => {
    const b = item.querySelector(BID);
    return /\/pointsAuction\/bid\//.test(b ? (b.getAttribute('action') || '') : '');
  };

  /**
   * Zbývající čas v ms. Bere se `data-time` (sekundy s desetinami) – odpočet po
   * číslicích je totéž, ale musel by se skládat ze tří prvků.
   */
  function zbyva(item) {
    const v = parseFloat(item.getAttribute('data-time'));
    if (Number.isFinite(v)) return Math.max(0, v * 1000);
    const kus = sel => {
      const e = item.querySelector('.timer-down ' + sel);
      const n = e ? parseInt(String(e.textContent).replace(/\D/g, ''), 10) : NaN;
      return Number.isFinite(n) ? n : 0;
    };
    const t = kus('.hours') * 3600 + kus('.minutes') * 60 + kus('.seconds');
    return t ? t * 1000 : null;
  }

  /**
   * Denní limit příhozů. Hra ho píše jako „Můžeš přihazovat v aukcích 4/4 krát
   * denně“.
   *
   * !!! NEVÍM, JESTLI JE PRVNÍ ČÍSLO „ZBÝVÁ“ NEBO „UTRACENO“ !!!
   * Obojí se dá přečíst stejně a spletená interpretace by hlídku buď zbytečně
   * vypnula, nebo naopak nechala klikat naprázdno. Proto se limit jen UKAZUJE
   * a o ničem nerozhoduje – když je vyčerpaný, hra příhoz odmítne a ověření
   * v `prihod()` to pozná. Až se to změří, dá se z toho udělat podmínka.
   */
  function limitDne() {
    const t = (document.body ? document.body.textContent : '').replace(/\s+/g, ' ');
    const m = t.match(/přihazovat v aukcích\s*(\d+)\s*\/\s*(\d+)\s*krát denně/i);
    return m ? { prvni: +m[1], celkem: +m[2], text: m[1] + '/' + m[2] } : null;
  }

  const spinave = () => {
    const el = document.querySelector('.value.renew-dirty_money');
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /** Aktuální nejvyšší sázka u položky. */
  function currentBid(item) {
    const el = item.querySelector(PRICE);
    if (!el) return null;
    // částka může být zkrácená („3.4 mld“), proto se bere i zkratka
    return NS.parse.toNum((el.textContent.match(/\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|tis\.?)|\s*[KMBT](?![\wá-žÁ-Ž]))?/i) || [])[0]);
  }

  /** Vloží hodnotu do pole a řekne stránce, že se změnilo. Nic neodesílá. */
  function fill(input, value) {
    input.value = String(Math.round(value * 100) / 100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  function button(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-bid-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();       // ať klik nespustí nic v UI hry
      onClick();
    });
    return b;
  }

  /** Přidá k jedné položce lištu s nabídkami hodnot. */
  function decorate(item) {
    if (item.dataset[MARK]) return;
    /* diamantová dražba: ani pole na strop – tady se přihazovat nemá */
    if (jeDiamantova(item)) { item.dataset[MARK] = 'diamanty'; return; }
    const input = item.querySelector(INPUT);
    const bid = currentBid(item);
    if (!input || bid == null) return;
    item.dataset[MARK] = '1';

    const bar = document.createElement('div');
    bar.className = 'cmc-bid-bar';

    const F = NS.fmt;
    const id = lotId(item);

    bar.appendChild(document.createTextNode('vložit:'));
    bar.appendChild(button(F.num(bid), 'stejná částka jako nejvyšší sázka (' + F.kc(bid) + ')',
      () => fill(input, bid)));
    /*
     * „+1“ tady bylo, ale zrušené je záměrně: minimální přebití dělá hlídka sama
     * a ručně je užitečnější rezerva proti dalšímu přihazujícímu.
     */
    /*
     * +2 % je MINIMUM, které hra přijme – proto je tu místo dřívějšího +1 %,
     * které by odmítla.
     */
    bar.appendChild(button('+2 %', 'minimum, které hra přijme ('
      + F.kc(prihozZ(bid)) + ')', () => fill(input, prihozZ(bid))));
    bar.appendChild(button('+5 %', '+5 % (' + F.kc(bid * 1.05) + ')', () => fill(input, Math.ceil(bid * 1.05))));

    /*
     * Strop pro automatické přihazování. Je to pole u KONKRÉTNÍ dražby, ne
     * globální nastavení – u každé věci chce člověk jinou hranici. Prázdno =
     * vypnuto, takže hlídka o položku nezavadí.
     */
    if (id) {
      const z = zaznam(id);
      const stitek = document.createElement('span');
      stitek.className = 'cmc-bid-stitek';
      stitek.textContent = 'přihazovat do:';
      bar.appendChild(stitek);

      const strop = document.createElement('input');
      strop.type = 'number';
      strop.min = '0';
      strop.step = '1';
      strop.className = 'cmc-bid-strop';
      strop.placeholder = 'strop';
      if (z.strop) strop.value = String(z.strop);
      strop.title = 'Do téhle částky bude rozšíření přihazovat samo:'
        + ' kontroluje každých ' + (KONTROLA_MS / 1000) + ' s a přihodí,'
        + ' když už nevedeš a do konce zbývá méně než '
        + (OKNO_MS / 60000) + ' min. Nikdy nepřehodí strop. Prázdno = vypnuto.'
        + ' Platí se ŠPINAVÝMI penězi; přebitá sázka se vrací.';
      const ulozStrop = async () => {
        const v = Math.max(0, Math.round(+strop.value || 0));
        const stary = zaznam(id);
        await NS.store.put('aukce', { ...data(), [id]: { ...stary, strop: v || null } });
        stav(item, id);
      };
      strop.addEventListener('change', ulozStrop);
      strop.addEventListener('blur', ulozStrop);
      bar.appendChild(strop);

      const info = document.createElement('span');
      info.className = 'cmc-bid-stav';
      bar.appendChild(info);
      item._cmcStav = info;
    }

    // lišta patří k poli, ne k tlačítku odeslání
    const holder = input.parentElement || item;
    holder.insertBefore(bar, input.nextSibling);
    if (id) stav(item, id);
  }

  /* ---- kdo vede a co se má stát ------------------------------------------- */

  /**
   * Vedu u téhle dražby? Hra to neukazuje (viz hlavička), takže se to odvozuje
   * z vlastní poslední nabídky. `null` = ještě jsem nepřihazoval.
   */
  function veduJa(id, cena) {
    const moje = zaznam(id).moje;
    if (moje == null) return false;
    /*
     * Rovnost je moje: hra nižší ani stejnou nabídku od nikoho jiného nepřijme.
     * Malá tolerance kvůli haléřům (pole má step 0.01).
     */
    return cena <= moje + 0.01;
  }

  /** Co by hlídka udělala – vrací i důvod, aby to šlo napsat k položce. */
  function rozhodni(item, id) {
    const cena = currentBid(item);
    const z = zaznam(id);
    const strop = z.strop || 0;
    const cas = zbyva(item);

    if (!strop) return { co: 'vypnuto', text: '' };
    if (cena == null) return { co: 'necti', text: 'cenu nejde přečíst' };
    if (veduJa(id, cena)) {
      return { co: 'vedu', text: 'vedeš ' + NS.fmt.kc(cena, { short: true }) };
    }
    const cil = prihozZ(cena);
    if (cil > strop) {
      return { co: 'strop', cil,
        text: 'nad strop (' + NS.fmt.kc(cil, { short: true }) + ' > '
          + NS.fmt.kc(strop, { short: true }) + ')' };
    }
    if (cas == null) return { co: 'necti', text: 'čas nejde přečíst' };
    if (cas > OKNO_MS) {
      return { co: 'ceka', cil, cas,
        text: 'čeká na poslední ' + (OKNO_MS / 60000) + ' min (zbývá '
          + NS.fmt.dur(cas) + ')' };
    }
    const mam = spinave();
    if (mam != null && mam < cil) {
      return { co: 'penize', cil,
        text: 'chybí špinavé (' + NS.fmt.kc(cil, { short: true }) + ')' };
    }
    const l = limitDne();
    return { co: 'prihodit', cil, cas,
      text: 'přihodí ' + NS.fmt.kc(cil, { short: true }) + ' (+' + PRIHOZ_PCT + ' %)'
        + (l ? ' · denní limit ' + l.text : '') };
  }

  /** Napíše k položce, co se děje – bez toho by hlídka byla neviditelná. */
  function stav(item, id) {
    const el = item._cmcStav;
    if (!el) return;
    const r = rozhodni(item, id);
    el.textContent = r.text;
    el.className = 'cmc-bid-stav'
      + (r.co === 'vedu' ? ' cmc-bid-vedu' : '')
      + (r.co === 'strop' || r.co === 'penize' ? ' cmc-bid-blok' : '');
  }

  /**
   * Přihodí u jedné dražby a OVĚŘÍ to.
   *
   * !!! ÚSPĚCH SE MĚŘÍ !!!
   * Klik na „Nabídnout cenu“ může projít bez následku (captcha, málo peněz,
   * mezitím někdo přihodil). Proto se po kliku znovu přečte cena – musí být
   * aspoň taková, jakou jsem poslal. Jinak se to NEZAPÍŠE jako moje nabídka,
   * protože pak by hlídka mylně věřila, že vede, a nikdy by nepřihodila.
   */
  async function prihod(item, id, cil) {
    const input = item.querySelector(INPUT);
    const btn = item.querySelector(BID);
    if (!input || !btn) throw new Error('pole nebo tlačítko v položce není');

    fill(input, cil);
    btn.click();

    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 400));
      const cena = currentBid(item);
      if (cena != null && cena >= cil) {
        await NS.store.put('aukce', {
          ...data(), [id]: { ...zaznam(id), moje: cil, at: Date.now() }
        });
        return { cil, cena };
      }
    }
    throw new Error('cena se nezvedla na ' + NS.fmt.kc(cil, { short: true })
      + ' – nabídka neprošla');
  }

  /* ---- hlídka ------------------------------------------------------------- */

  let hlidkaTimer = null;

  async function kolo() {
    const cfg = NS.store.get().read;
    if (cfg.auctionFill === false) return 0;
    if (cfg.autoPaused === true) return 0;
    if (NS.captcha && NS.captcha.blokuje()) return 0;
    if (NS.jail && NS.jail.blocked()) return 0;

    let udelano = 0;
    for (const item of document.querySelectorAll(ITEM)) {
      const id = lotId(item);
      if (!id) continue;
      const r = rozhodni(item, id);
      stav(item, id);
      if (r.co !== 'prihodit') continue;
      try {
        const v = await prihod(item, id, r.cil);
        udelano++;
        if (NS.gym) {
          NS.gym.setStatus('aukce: přihozeno ' + NS.fmt.kc(v.cil, { short: true })
            + ' (strop ' + NS.fmt.kc(zaznam(id).strop, { short: true }) + ')', true);
        }
      } catch (e) {
        if (NS.gym) NS.gym.setStatus('⚠ aukce: ' + e.message, false);
      }
      stav(item, id);
      /* jedna dražba na kolo – ať se nezaplní fronta a nezdvojí kliky */
      break;
    }
    return udelano;
  }

  function hlidka() {
    clearTimeout(hlidkaTimer);
    const tik = async () => {
      try {
        if (NS.queue) await NS.queue.run('aukce', () => kolo());
        else await kolo();
      } catch (e) { /* zkusí se za dalších 30 s */ }
      hlidkaTimer = setTimeout(tik, KONTROLA_MS);
    };
    hlidkaTimer = setTimeout(tik, KONTROLA_MS);
  }

  function scan() {
    if (!NS.store.get().read.auctionFill) return;
    for (const item of document.querySelectorAll(ITEM)) {
      try {
        decorate(item);
      } catch (e) {
        console.warn('[CMC] aukce', e.message);
      }
    }
  }

  /**
   * Aukce se sama přenačítá (odpočty, „Načítání“), takže se lišty musí doplnit
   * i po výměně DOM. Observer je omezený na tělo dokumentu a jen doplňuje.
   */
  /**
   * Observer se zapíná vždy – aukci obvykle otevřeš klikem na mapě, tedy až po
   * načtení stránky, takže při startu tu ještě žádná položka být nemusí.
   */
  function start() {
    scan();
    hlidka();
    const obs = new MutationObserver(() => {
      clearTimeout(start._t);
      start._t = setTimeout(scan, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  NS.auction = { start, scan, currentBid, lotId, jeDiamantova, zbyva, veduJa,
    rozhodni, prihod, kolo, limitDne, prihozZ,
    KONTROLA_MS, OKNO_MS, PRIHOZ_PCT, DRUHY };
})();
