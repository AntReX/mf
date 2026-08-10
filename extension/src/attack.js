/* =============================================================================
 * attack.js – jedno tlačítko: napadni prvního neaktivního hráče, který NELEŽÍ
 *
 * Postup je opsaný z živé hry (5. 8. 2026), ne odhadnutý. Čtyři věci na něm
 * nejsou samozřejmé a každá z nich stála jeden pokus:
 *
 * 1. DO HLEDÁNÍ SE NEDÁ VSTOUPIT PŘES ADRESU.
 *    `location.hash = '#/search'` hra ignoruje – `.modal-box.main-box` zůstane
 *    prázdný. Při jednom pokusu se na tom router navíc zacyklil tak, že zamrzlo
 *    celé vlákno stránky (nešel ani screenshot). Otevírá se KLIKEM na
 *    `a > span.icon-p.search` ve spodní liště.
 *
 * 2. HLEDAT SE MUSÍ TLAČÍTKEM „KOHO NAPADNOUT“.
 *    Formulář má dvě tlačítka. `.searchButton` (`/search/player`) vrací
 *    „Nic nenalezeno“ – i pro `all`, i pro `not-active`. Použitelné je jen
 *    `.attack-hunt` (`/search/playersAbleToAttack`).
 *
 * 3. !!! V SEZNAMU NENÍ VIDĚT, KDO LEŽÍ V NEMOCNICI !!!
 *    Naměřeno na hráči #30: řádek hledání má `status-away` + `status-boss`,
 *    ale scéna útoku má u TÉHOŽ hráče ještě `status-med` („Hráč je v nemocnici
 *    nebo ve vězení.“). Filtrovat ze seznamu tedy NELZE – u každého kandidáta
 *    se musí otevřít scéna a teprve tam se to pozná.
 *
 * 4. SCÉNA SE NEDÁ PŘEČÍST PŘES GET.
 *    `GET /attack-scene/79` vrací 404 („Spausk per mygtuką, o ne per nuorodą!“).
 *    Funguje ale podstrčený odkaz `<a data-modal="/attack-scene/79">` mimo
 *    obrazovku – hra má handler delegovaný na dokumentu. Stejný trik jako
 *    u výroben.
 *
 * Tlačítko „Další“ ve scéně (`.next-opponent`) se NEPOUŽÍVÁ: vede na AKTIVNÍ
 * protivníky (naskočili `tichej`, `JohnMafie`, `vaclavekvl`), ne na neaktivní.
 *
 * !!! VÝSLEDEK SE VŽDY OVĚŘUJE !!!
 * Klik na „Začít“ umí projít úplně bez následku – když hra vyhodí captchu,
 * handler skončí mlčky a nepošle nic. Proto se po kliku ČEKÁ na text výsledku
 * a bez něj se hlásí chyba, ne úspěch.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC;
  if (!NS) return;

  /* ---- co je změřené ------------------------------------------------------- */

  /*
   * Jeden útok = 30 energie (naměřeno: 59 → 29 na hráči #51). Pod tím klik nic
   * neudělá a hra to nijak neoznámí, takže se to musí hlídat samo.
   */
  const ENERGIE_UTOK = 30;

  /* Kolik scén se maximálně otevře, než se to vzdá – viz `KANDIDATU` v README. */
  const KANDIDATU = 4;

  /*
   * Napadá se jen hráč do daného podílu vlastní úrovně. Na rozdíl od nemocnice je
   * ÚROVEŇ VIDĚT UŽ V SEZNAMU (`.level` v řádku), takže se tím filtruje ještě
   * PŘED otevřením scény – silné hráče to vyřadí bez jediného dalšího kliku.
   *
   * Ruční a automatický podíl jsou ZVLÁŠŤ schválně: u ručního kliku se člověk
   * na soupeře podívá, automatika ne, tak si sahá na slabší.
   */
  const PODIL_RUCNE = 70;
  const PODIL_AUTO = 50;
  const cfg = () => NS.store.get().read;
  const podilRucne = () => Math.max(1, Math.min(100, +cfg().atkPodil || PODIL_RUCNE));
  const podilAuto = () => Math.max(1, Math.min(100, +cfg().atkPodilAuto || PODIL_AUTO));
  /* Nejnižší úroveň soupeře; 0 = bez omezení. Platí pro ruku i automatiku. */
  const minUroven = () => Math.max(0, Math.round(+cfg().atkMinUroven || 0));

  const MS_MODAL = 4000;      // než se okno hry vykreslí
  const MS_VYSLEDEK = 9000;   // než dojde boj (klik → text výsledku)
  const KROK = 150;

  const S = {
    hledani: '.icon-p.search',
    box: '.modal-box.main-box',
    typ: 'select[name="victimsType"]',
    hledat: '.attack-hunt',
    radek: '.result-user-i',
    scena: '[data-modal^="/attack-scene/"]',
    utok: '.attackButton.fight-round',
    panel: '.user-panel-i',
    med: '.icon.status-med',
    vysledek: '.result-details',
    popis: '.desc',
    // zavíráček má hra v každém okně v `.box-h`; `.m-close` je jeho obal
    zavri: '.js-close-modal, .m-close'
  };

  /*
   * !!! VÝSLEDEK SE ČTE ZE TŘÍDY, NE Z TEXTU !!!
   * Scéna má v DOMu OBA popisky pořád, jen skryté:
   *
   *   <div class="result-details won"  style="display:none">
   *     <div class="label">Vyhrál jsi</div><div class="desc"></div></div>
   *   <div class="result-details lost" style="display:none">…</div>
   *
   * Po boji se odkryje jeden. Hledat v textu „vyhrál jsi“ tedy NEJDE – najde se
   * vždycky, i po prohře. (Naměřeno: po vyhraném boji na TemnýSoldato bylo
   * v `textContent` „VYHRÁL JSI … Prohrál jsi …“ za sebou.) Rozhoduje proto to,
   * KTERÝ z těch dvou je vidět.
   */
  const VYSLEDKY = { won: 'vyhrál jsi', lost: 'prohrál jsi' };

  /*
   * Co hra v `select[name="victimsType"]` nabízí. Používají se dvě volby; ostatní
   * (`all`, `active-gang`, `enemies`) tu schválně nejsou – `all` vrací lidi, na
   * které se útočit nedá, a aktivní členové gangu jsou vlastní tým.
   */
  const DRUHY = {
    'not-active': { popis: 'neaktivního', kratce: 'neaktivní' },
    'not-active-gang': { popis: 'neaktivního v gangu', kratce: 'neaktivní v gangu' }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const box = () => document.querySelector(S.box);

  async function cekat(podminka, limit) {
    const do_ = Date.now() + limit;
    for (;;) {
      const v = podminka();
      if (v) return v;
      if (Date.now() > do_) return null;
      await sleep(KROK);
    }
  }

  /* ---- stav hráče ---------------------------------------------------------- */

  const cislo = sel => {
    const el = document.querySelector(sel);
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  const energie = () => cislo('.value.renew-energy');
  const mujLevel = () => cislo('.renew-level');

  /**
   * Nejvyšší úroveň soupeře, na kterou se smí jít. `null` = nevím svou úroveň –
   * a pak se neútočí vůbec, viz `zautoc()`.
   */
  function strop(podil) {
    const m = mujLevel();
    const p = podil == null ? podilRucne() : podil;
    return m ? Math.floor(m * (p / 100)) : null;
  }

  /* Captcha se nikdy neobchází – jen se pozná a práce se zastaví. */
  const captcha = () => !!document.querySelector('.captcha-modal.active');

  /* ---- kroky -------------------------------------------------------------- */

  /**
   * Zavře otevřené okno hry a řekne, jestli se to povedlo. Uživatel to chtěl
   * výslovně: „pak je nutné to zavřít a tlačítkem opakovat“. Kdyby zavíráček
   * nikde nebyl, další stisk stejně projde – `otevriHledani()` obsah okna
   * přepíše – ale mlčet o tom se nemá.
   */
  async function zavri() {
    const b = box();
    const x = b ? b.querySelector(S.zavri) : null;
    if (!x) return false;
    x.click();
    await sleep(400);
    return true;
  }

  /** Otevře hledání hráčů a vrátí okno. */
  async function otevriHledani() {
    const ikona = document.querySelector(S.hledani);
    const odkaz = ikona ? ikona.closest('a') : null;
    if (!odkaz) throw new Error('ve spodní liště není ikona hledání');
    odkaz.click();
    const b = await cekat(() => {
      const el = box();
      return el && el.querySelector(S.typ) ? el : null;
    }, MS_MODAL);
    if (!b) throw new Error('hledání se nevykreslilo');
    return b;
  }

  /** Vyhledá hráče daného druhu a vrátí řádky jako `[{id, jmeno, uroven}]`. */
  async function najdiNeaktivni(b, druh = 'not-active') {
    const typ = b.querySelector(S.typ);
    if (!DRUHY[druh]) throw new Error('neznámý druh hledání: ' + druh);
    /*
     * Volba musí v seznamu SKUTEČNĚ být. Kdyby ji hra přejmenovala, nastavení
     * `value` by tiše propadlo na prázdno a hledaly by se úplně jiní hráči –
     * tedy útok na někoho, koho jsi nechtěl.
     */
    if (![...typ.options].some(o => o.value === druh)) {
      throw new Error('hra volbu „' + DRUHY[druh].kratce + '“ nenabízí');
    }
    typ.value = druh;
    // hra si hodnotu čte při kliku, ale `change` posílá i tak – bez něj se
    // nepřekreslí popisek a nebylo by poznat, co je vybrané
    typ.dispatchEvent(new Event('change', { bubbles: true }));

    const hledat = b.querySelector(S.hledat);
    if (!hledat) throw new Error('tlačítko „koho napadnout“ v okně není');
    hledat.click();

    const radky = await cekat(() => {
      const r = document.querySelectorAll(S.radek);
      return r.length ? [...r] : null;
    }, MS_MODAL);
    if (!radky) throw new Error('hledání nic nevrátilo');

    return radky.map(r => {
      const a = r.querySelector(S.scena);
      return {
        id: a ? a.getAttribute('data-modal').split('/').pop() : null,
        jmeno: (r.querySelector('.name') || {}).textContent
          ? r.querySelector('.name').textContent.trim() : '?',
        uroven: (r.querySelector('.level') || {}).textContent
          ? r.querySelector('.level').textContent.trim() : null
      };
    }).filter(x => x.id);
  }

  /**
   * Otevře scénu útoku na daného hráče. Nekliká se na řádek v seznamu, ale na
   * podstrčený odkaz – seznam se tak nemusí kvůli každému kandidátovi hledat
   * znovu (viz hlavička, bod 4).
   */
  async function otevriScenu(id) {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'cmc-atk-offscreen';
    a.setAttribute('data-modal', '/attack-scene/' + id);
    a.setAttribute('data-setype', 'pashtas');
    a.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.body.appendChild(a);
    a.click();
    a.remove();

    const b = await cekat(() => {
      const el = box();
      return el && el.querySelector(S.utok) ? el : null;
    }, MS_MODAL);
    if (!b) throw new Error('scéna útoku se nevykreslila');
    return b;
  }

  /**
   * Který výsledek je ve scéně vidět. `null` = boj ještě nedoběhl.
   *
   * Skrytí dělá hra přes `display`, takže se čte spočítaný styl – ne
   * `offsetParent` (ten jsdom neumí) a ne text (viz `VYSLEDKY`).
   */
  function vysledekScenz(b) {
    /*
     * Odkrytí dělá hra jQuery `.show()`, což zapíše INLINE `display`. Skrytý stav
     * naopak přichází ze stylopisu (v HTML žádný `style` není). Proto se dívá
     * nejdřív na inline hodnotu a teprve pak na spočítaný styl – a ne naopak:
     * jsdom u vnořených prvků vrací spočítané `none` i pro odkrytý box, takže
     * test by měřil něco jiného než prohlížeč.
     */
    const videt = el => {
      const inline = el.style && el.style.display;
      if (inline) return inline !== 'none';
      const gcs = globalThis.getComputedStyle
        || (typeof window !== 'undefined' && window.getComputedStyle);
      if (!gcs) return false;              // nevím = neviditelné, hádat se nebude
      return gcs(el).display !== 'none';
    };

    const boxy = [...b.querySelectorAll(S.vysledek)].filter(videt);
    if (!boxy.length) return null;
    /*
     * Kdyby byly vidět oba, nevíme nic – a hádat se nesmí. Radši se to ohlásí
     * jako nejasný výsledek než aby se do lišty napsala jedna z možností.
     */
    if (boxy.length > 1) return { nejasne: boxy.map(e => e.className).join(' + ') };
    const el = boxy[0];
    const klic = Object.keys(VYSLEDKY).find(k => el.classList.contains(k));
    const popis = el.querySelector(S.popis);
    return {
      vysledek: VYSLEDKY[klic] || null,
      trida: el.className,
      zprava: (popis || el).textContent.replace(/\s+/g, ' ').trim()
    };
  }

  /**
   * Přečte soupeře ze scény. Soupeř je POSLEDNÍ `.user-panel-i` – první jsi ty.
   */
  function soupeR(b) {
    const panely = [...b.querySelectorAll(S.panel)];
    const s = panely[panely.length - 1];
    if (!s) return null;
    const jm = s.querySelector('.name');
    return {
      jmeno: jm ? jm.textContent.trim() : '?',
      lezi: !!s.querySelector(S.med),
      tlacitko: b.querySelector(S.utok)
    };
  }

  /* ---- akce --------------------------------------------------------------- */

  let posledni = null;

  /**
   * Napadne prvního neaktivního hráče, který neleží v nemocnici.
   * Vrací `{jmeno, id, vysledek, text, preskoceni}`; jinak hází s důvodem.
   */
  async function zautoc(druh = 'not-active', podil = null) {
    if (!DRUHY[druh]) throw new Error('neznámý druh hledání: ' + druh);
    if (captcha()) throw new Error('hra ukazuje captchu – klepni ji ručně');
    if (NS.jail && NS.jail.blocked()) throw new Error('jsi ve vězení/nemocnici');

    const e = energie();
    if (e != null && e < ENERGIE_UTOK) {
      throw new Error('energie ' + e + ' z ' + ENERGIE_UTOK + ' – útok by nic neudělal');
    }

    // druhý a další stisk musí začínat s čistým stolem (viz `zavri()`)
    await zavri();
    const okno = await otevriHledani();
    const vsichni = await najdiNeaktivni(okno, druh);
    if (!vsichni.length) throw new Error('nenašel se žádný '  + DRUHY[druh].popis);

    const preskoceni = [];

    /*
     * Strop úrovně se drží tvrdě: bez znalosti vlastní úrovně se NEÚTOČÍ.
     * Mlčky filtr vynechat by znamenalo praštit někoho o třídu silnějšího –
     * tedy tichý opak toho, co bylo zadané.
     */
    const pod = podil == null ? podilRucne() : podil;
    const max = strop(pod);
    if (max == null) {
      await zavri();
      throw new Error('nevím svoji úroveň, tak nemůžu držet strop ' + pod + ' %');
    }

    const min = minUroven();
    if (min > max) {
      await zavri();
      throw new Error('nastavení si odporuje: minimální úroveň ' + min
        + ' je nad stropem ' + max + ' (' + pod + ' % z ' + mujLevel() + ')');
    }

    const kandidati = vsichni.filter(k => {
      const u = k.uroven == null ? null : Number(k.uroven);
      if (u == null || !Number.isFinite(u)) {
        preskoceni.push(k.jmeno + ' (úroveň neznámá)');
        return false;
      }
      if (u > max) { preskoceni.push(k.jmeno + ' (úroveň ' + u + ' > ' + max + ')'); return false; }
      /*
       * Spodní hranice: úplní začátečníci nedávají zkušenosti ani peníze, takže
       * je útok jen spálená energie. 0 = bez omezení.
       */
      if (min && u < min) {
        preskoceni.push(k.jmeno + ' (úroveň ' + u + ' < ' + min + ')');
        return false;
      }
      return true;
    });

    if (!kandidati.length) {
      await zavri();
      throw new Error('nikdo v úrovni ' + (min || 1) + '–' + max
        + ' – ' + preskoceni.join(', '));
    }

    for (const k of kandidati.slice(0, KANDIDATU)) {
      if (captcha()) throw new Error('hra ukazuje captchu – klepni ji ručně');

      const b = await otevriScenu(k.id);
      const s = soupeR(b);
      if (!s) { preskoceni.push(k.jmeno + ' (scénu nešlo přečíst)'); continue; }
      if (s.lezi) { preskoceni.push(s.jmeno + ' (leží)'); continue; }
      if (!s.tlacitko) { preskoceni.push(s.jmeno + ' (bez tlačítka)'); continue; }

      const energiePred = energie();
      s.tlacitko.click();

      /*
       * Tady se nesmí věřit kliku. Když je nad stránkou captcha, handler hry
       * skončí mlčky – nic nepošle, nic nenapíše. Proto se čeká na VÝSLEDEK
       * a bez něj se hlásí chyba.
       */
      const v = await cekat(() => vysledekScenz(box() || b), MS_VYSLEDEK);

      if (!v) {
        const duvod = captcha() ? 'hra vyhodila captchu' : 'hra neodpověděla';
        throw new Error('útok na ' + s.jmeno + ' neproběhl – ' + duvod);
      }
      if (v.nejasne) {
        throw new Error('útok na ' + s.jmeno + ' proběhl, ale výsledek je nejasný ('
          + v.nejasne + ') – podívej se do hry');
      }
      if (!v.vysledek) {
        throw new Error('útok na ' + s.jmeno + ' proběhl, ale výsledek neznám'
          + ' (třída „' + v.trida + '“) – podívej se do hry');
      }

      posledni = {
        at: Date.now(), id: k.id, jmeno: s.jmeno, druh,
        uroven: k.uroven, strop: max, podil: pod, min,
        vysledek: v.vysledek, zprava: v.zprava, preskoceni,
        energie: { pred: energiePred, po: energie() }
      };
      // hra nechá scénu otevřenou; bez zavření by druhý stisk neotevřel hledání
      await zavri();
      return posledni;
    }

    await zavri();
    throw new Error('z prvních ' + Math.min(KANDIDATU, kandidati.length)
      + ' kandidátů nešel napadnout nikdo – ' + preskoceni.join(', '));
  }

  /* ---- automatika --------------------------------------------------------- */

  /*
   * Tempo neurčuje časovač, ale ENERGIE: útok stojí 30 a dobíjí se +10 za minutu
   * (naměřeno), takže víc než ~jeden útok za tři minuty fyzicky nejde. `PAUZA_MS`
   * je proti tomu, aby se při plné energii nevystřílely tři útoky za sebou –
   * hustý sled kliků je přesně to, na co hra reaguje captchou.
   */
  const PAUZA_MS = 60000;
  /*
   * Spodní mez je jen proti rozbité hodnotě (0/prázdno/text) – v popupu je
   * minimum 5 s. Není to „povolený burst“, jen pojistka, aby se z chyby
   * v nastavení nestalo klikání bez mezery.
   */
  const pauzaMs = () => Math.max(1, +cfg().atkPauza || 60) * 1000;

  /*
   * „Nikdo do úrovně X“ není porucha – jen zrovna není koho. Zkoušet to hned
   * znovu by jen zbytečně tlouklo do hledání, tak se na chvíli odmlčí.
   *
   * !!! NASTAVITELNÉ, DŘÍV NATVRDO 10 MINUT !!!
   * Jak rychle se seznam obmění, závisí na serveru i na tom, jak úzko máš
   * nastavený strop úrovně – jedno číslo pro všechny nesedělo. Výchozí jsou
   * 2 minuty; dolní mez je 1, aby z toho nešlo udělat tlučení bez pauzy.
   */
  const ODMLKA_MIN = 2;
  const odmlkaMs = () => Math.max(1, Math.round(+cfg().atkOdmlka || ODMLKA_MIN)) * 60000;

  /* Kolik chyb po sobě, než se automatika sama vypne (jako u pokeru). */
  const MAX_SELHANI = 5;
  /*
   * !!! „PO SOBĚ“ MUSÍ ZNAMENAT I „KRÁTCE PO SOBĚ“ !!!
   * Počítadlo se nulovalo jedině úspěšným útokem. Pět chyb rozprostřených třeba
   * přes celé odpoledne – pokaždé jiná drobnost – tak automatiku vyplo úplně
   * stejně jako pět chyb za minutu, jenže bez zjevné příčiny: uživatel ji pak
   * najde vypnutou a netuší proč.
   *
   * Série se proto po téhle době ticha zapomíná. Skutečná porucha se projeví
   * hned za sebou a vypnutí spustí; ojedinělé zakolísání ne.
   */
  const SELHANI_VYCHLADNE_MS = 30 * 60 * 1000;

  let posledniUtok = 0;
  let tichoDo = 0;
  let selhani = 0;
  let posledniSelhani = 0;
  let bezi = false;
  const pocty = { utoku: 0, vyher: 0, proher: 0, preskoku: 0 };

  const autoSet = () => cfg().atkAuto === true;
  const autoOn = () => autoSet() && cfg().autoPaused !== true;
  const druhAuto = () => (DRUHY[cfg().atkDruh] ? cfg().atkDruh : 'not-active');
  const rezerva = () => Math.max(0, Math.round(+cfg().atkRezerva || 0));

  /**
   * Jedno kolo automatiky. Vrací `true`, když se něco udělalo – fronta si podle
   * toho řídí mezery.
   */
  async function autoTick() {
    if (bezi || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (captcha()) return false;
    const ted = Date.now();
    if (ted < tichoDo) return false;
    if (ted - posledniUtok < pauzaMs()) return false;

    const e = energie();
    const potreba = ENERGIE_UTOK + rezerva();
    if (e != null && e < potreba) {
      // do lišty se to nepíše každých pět sekund – je to normální stav, ne chyba
      return false;
    }

    bezi = true;
    try {
      const r = await zautoc(druhAuto(), podilAuto());
      posledniUtok = Date.now();
      selhani = 0;
      posledniSelhani = 0;
      pocty.utoku++;
      if (r.vysledek === 'vyhrál jsi') pocty.vyher++;
      else if (r.vysledek === 'prohrál jsi') pocty.proher++;
      pocty.preskoku += r.preskoceni.length;
      NS.gym.setStatus('boj: ' + r.jmeno + ' (úr. ' + r.uroven + ') – '
        + r.vysledek + ' · ' + pocty.utoku + '× celkem', true);
      return true;
    } catch (err) {
      posledniUtok = Date.now();
      const zprava = String(err.message || err);

      /*
       * Rozlišuje se „není koho“ od skutečné poruchy. Odmlčet se je správná
       * odpověď na prázdný seznam; vypínat kvůli tomu automatiku by znamenalo,
       * že ji uživatel po hodině najde vypnutou bez příčiny.
       */
      if (/nikdo v úrovni|nenašel se žádný|nešel napadnout nikdo/.test(zprava)) {
        const odmlka = odmlkaMs();
        tichoDo = Date.now() + odmlka;
        NS.gym.setStatus('boj: ' + zprava + ' – zkusím za '
          + Math.round(odmlka / 60000) + ' min', true);
        return false;
      }

      /* Captcha není chyba automatiky – řízení má převzít člověk, viz captcha.js. */
      if (/captch/i.test(zprava)) {
        NS.gym.setStatus('⚠ boj: ' + zprava, false);
        return false;
      }

      // série starší než SELHANI_VYCHLADNE_MS se nepočítá – viz konstanta
      if (posledniSelhani && Date.now() - posledniSelhani > SELHANI_VYCHLADNE_MS) {
        selhani = 0;
      }
      posledniSelhani = Date.now();
      selhani++;
      if (selhani >= MAX_SELHANI) {
        await NS.store.patch('read', { atkAuto: false });
        selhani = 0;
        NS.gym.setStatus('⚠ boj: ' + MAX_SELHANI + '× po sobě neúspěch ('
          + zprava + ') – automatiku jsem vypnul', false);
        return false;
      }
      NS.gym.setStatus('⚠ boj: ' + zprava + ' (' + selhani + '/' + MAX_SELHANI + ')', false);
      return false;
    } finally {
      bezi = false;
    }
  }

  /**
   * Proč automatika PRÁVĚ neútočí. `null` = nic jí nebrání.
   *
   * !!! TICHÉ ČEKÁNÍ VYPADÁ JAKO PORUCHA !!!
   * `autoTick` se v půlce případů ukončí bez jediného slova – čeká na energii,
   * na pauzu mezi útoky nebo na konec odmlky, když nebylo koho napadnout. Zvenčí
   * je to k nerozeznání od rozbité automatiky a přesně tak to vypadalo:
   * „spouští se podle nálady“.
   *
   * Počítá se ze stavu, ne z toho, co si `autoTick` naposled zapamatoval –
   * tím pádem je údaj v liště správný i mezi jeho běhy.
   */
  function duvodCekani() {
    if (!autoSet()) return null;
    if (cfg().autoPaused === true) return 'pozastaveno';
    if (NS.jail && NS.jail.blocked()) return 'vězení';
    if (captcha()) return 'captcha';

    const ted = Date.now();
    if (ted < tichoDo) {
      return 'nikdo k napadení, zkusím za ' + Math.ceil((tichoDo - ted) / 60000) + ' min';
    }
    const doPauzy = pauzaMs() - (ted - posledniUtok);
    if (doPauzy > 0) return 'další za ' + Math.ceil(doPauzy / 1000) + ' s';

    const e = energie();
    const potreba = ENERGIE_UTOK + rezerva();
    if (e != null && e < potreba) return 'čeká na energii ' + e + '/' + potreba;
    if (selhani > 0) return 'po chybě (' + selhani + '/' + MAX_SELHANI + ')';
    return null;
  }

  /** Zaškrtávátko automatiky do lišty – stejné jako u ostatních modulů. */
  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = cfg().autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
      + 'Útočí sama na ' + DRUHY[druhAuto()].kratce + ' hráče v úrovni '
      + (minUroven() || 1) + '–' + (strop(podilAuto()) || '?') + ' (do '
      + podilAuto() + ' % tvé, ručně ' + podilRucne() + ' %). Tempo drží'
      + ' energie: útok stojí ' + ENERGIE_UTOK + ' a dobíjí se ~10/min, mezi'
      + ' útoky je pauza ' + Math.round(pauzaMs() / 1000) + ' s.'
      + ' Ležící v nemocnici přeskakuje. Vše se nastavuje v popupu.';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto;
    inp.addEventListener('change', async () => {
      await NS.store.patch('read', { atkAuto: inp.checked });
      onChange();
    });
    wrap.appendChild(inp);
    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto' + (zapnuto && pozastaveno ? ' ⏸' : '');
    wrap.appendChild(txt);
    return wrap;
  }

  /* ---- lišta -------------------------------------------------------------- */

  function buttons(onChange) {
    const e = energie();
    const malo = e != null && e < ENERGIE_UTOK;
    const max = strop();

    const tlacitko = (druh, text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-atk-btn';
      b.textContent = text;
      b.disabled = malo;
      b.title = malo
        ? 'energie ' + e + ' z ' + ENERGIE_UTOK
        : 'najde ' + DRUHY[druh].kratce + ' hráče, vezme jen úroveň '
          + (minUroven() || 1) + '–' + (max == null ? '?' : max) + ' ('
          + podilRucne() + ' % tvé), přeskočí ležící a na prvního volného'
          + ' zaútočí – stojí ' + ENERGIE_UTOK + ' energie';

      b.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        NS.gym.setStatus('útok: hledám ' + DRUHY[druh].kratce + '…', true);
        try {
          const r = await NS.queue.run('utok', () => zautoc(druh));
          const kus = r.preskoceni.length ? ' (přeskočeno: ' + r.preskoceni.join(', ') + ')' : '';
          NS.gym.setStatus('útok na ' + r.jmeno + ' (úr. ' + r.uroven + '): '
            + (r.vysledek || 'hotovo') + (r.zprava ? ' – ' + r.zprava : '') + kus, true);
        } catch (err) {
          NS.gym.setStatus('⚠ útok: ' + err.message, false);
        }
        b.disabled = false;
        if (onChange) onChange();
      });
      return b;
    };

    const stav = document.createElement('span');
    stav.className = 'cmc-gym-unit-label';
    const ceka = duvodCekani();
    stav.textContent = (posledni
      ? 'naposled ' + posledni.jmeno + ': ' + (posledni.vysledek || '?')
      : 'energie ' + (e == null ? '?' : e) + ' · úr. ' + (minUroven() || 1)
        + '–' + (max == null ? '?' : max))
      + (pocty.utoku ? ' · auto ' + pocty.vyher + '/' + pocty.utoku : '')
      /* důvod čekání až nakonec – je to doplněk, ne hlavní údaj */
      + (ceka ? ' · ' + ceka : '');
    stav.title = (ceka ? 'Automatika čeká: ' + ceka + '. ' : '')
      + (posledni && posledni.zprava ? posledni.zprava : '');

    return [
      tlacitko('not-active', '🔪 Neaktivního'),
      tlacitko('not-active-gang', '🔪 Neaktivního v gangu'),
      stav
    ];
  }

  NS.attack = {
    zautoc, buttons,
    // pro testy a diagnostiku
    S, ENERGIE_UTOK, KANDIDATU, VYSLEDKY, DRUHY, MAX_SELHANI, SELHANI_VYCHLADNE_MS,
    ODMLKA_MIN, odmlkaMs,
    PODIL_RUCNE, PODIL_AUTO, podilRucne, podilAuto, minUroven,
    autoSet, autoOn, autoTick, autoBox, pocty, duvodCekani,
    /*
     * Jen pro testy: stav automatiky (kdy byl poslední útok, odmlka, počítadlo
     * chyb) je záměrně v modulu, ne v úložišti – po obnovení stránky má začínat
     * načisto. Test ale potřebuje jednotlivá kola oddělit, jinak by mu odmlka
     * z jednoho případu zhasla všechny další.
     */
    __reset() { posledniUtok = 0; tichoDo = 0; selhani = 0; posledniSelhani = 0; bezi = false;
      pocty.utoku = 0; pocty.vyher = 0; pocty.proher = 0; pocty.preskoku = 0; },
    soupeR, vysledekScenz, najdiNeaktivni, otevriScenu, otevriHledani, zavri, strop, mujLevel,
    get posledni() { return posledni; }
  };
})();
