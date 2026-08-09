/* =============================================================================
 * upgrade.js – vylepšování budov (Továrna, Dům zločinů, Posilovna, Nemocnice,
 *              Závody, Kasárna)
 *
 * ID zjištěná ze živé hry (6. 8. 2026) průchodem `/map/building/show/<id>`:
 *   20 Kasárna · 23 Dům zločinů · 25 Továrna · 26 Posilovna · 28 Závody
 *   31 Nemocnice
 * (Pivovar/farma/palírna/přístav vylepšení taky mají, ale ty řeší vyrobny.js
 * a fleet.js – míchat to sem by znamenalo dvě automatiky na jednu budovu.)
 *
 * !!! DVA STAVY, DVĚ ÚPLNĚ JINÉ ZNAČKY !!!
 * Naměřeno na všech šesti – tři byly volné a tři zrovna vylepšovaly, takže
 * obojí je opsané z reality, ne odhadnuté:
 *
 *   VOLNO   <a class="btn btn-primary btn-sm upgradeBuilding tw-l"
 *              action="/map/building/upgrade/25">Vylepšit 79 359Kč</a>
 *
 *   BĚŽÍ    <div class="btn-badge hours">00</div>
 *           <div class="btn-badge minutes">06</div>
 *           <div class="btn-badge seconds">44</div>
 *           <a class="btn open-confirm …" id="confirm"
 *              data-action="skipBuildingUpgrade('…/skip-upgrade/31', '11', …,
 *                                               'Nemocnice Úroveň:44')">
 *              Urychlit 52</a>
 *
 * Rozdíl je podstatný: u běžící budovy NENÍ co zmáčknout (jen „Urychlit“ za
 * diamanty, do toho rozšíření nesahá) a hlavně se z ní dá přečíst, kdy bude
 * hotovo – takže se do té doby nemusí čtení opakovat.
 *
 * !!! PENÍZE SI MUSÍ SÁHNOUT DO BANKY !!!
 * Vylepšení se platí ČISTÝMI penězi v hotovosti a ta bývá skoro nulová (3 499 Kč
 * proti ceně 79 359 Kč). Před kliknutím se proto z banky vybere, co chybí – a
 * ověří se, že hotovost opravdu stoupla. Bez toho by to kliklo naprázdno a
 * hlásilo úspěch, což je chyba, která se v tomhle projektu opakovala u banky
 * i u výroben.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC;
  if (!NS) return;

  const BUDOVY = [
    { id: 25, label: 'Továrna', zn: '🏭' },
    { id: 23, label: 'Dům zločinů', zn: '🎭' },
    { id: 26, label: 'Posilovna', zn: '💪' },
    { id: 31, label: 'Nemocnice', zn: '🏥' },
    { id: 28, label: 'Závody', zn: '🏁' },
    { id: 20, label: 'Kasárna', zn: '🎖' }
  ];

  const URL_OF = id => '/map/building/show/' + id;
  const AKCE = id => new RegExp('/map/building/upgrade/' + id + '\\b');

  const S = {
    tlacitko: 'a.upgradeBuilding, .upgradeBuilding',
    skip: '[data-action^="skipBuildingUpgrade"]',
    dny: '.btn-badge.days',
    hodiny: '.btn-badge.hours',
    minuty: '.btn-badge.minutes',
    sekundy: '.btn-badge.seconds'
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cfg = () => NS.store.get().read;
  const num = x => (x == null ? null : NS.parse.toNum(x));

  /* ---- čtení stavu -------------------------------------------------------- */

  /*
   * Běžící budovu nemá cenu čtvrt hodiny čtenou znovu – hra sama říká, kolik
   * zbývá. Termín se drží v paměti karty (ne v úložišti: po reloadu se stejně
   * čte znovu a špatně zapamatovaný termín by budovu umlčel).
   */
  const hotovoV = new Map();
  const REZERVA_MS = 3000;
  const beziAz = id => {
    const kdy = hotovoV.get(id);
    return kdy && kdy > Date.now() ? kdy : null;
  };
  const zapomen = id => hotovoV.delete(id);

  /** Zbývající čas z odpočtu; `null`, když tam odpočet není. */
  function zbyvaZ(el) {
    const kus = sel => {
      const e = el.querySelector(sel);
      if (!e) return null;
      const v = parseInt(String(e.textContent).replace(/\D/g, ''), 10);
      return Number.isFinite(v) ? v : null;
    };
    const d = kus(S.dny), h = kus(S.hodiny), m = kus(S.minuty), s = kus(S.sekundy);
    if (d == null && h == null && m == null && s == null) return null;
    return ((d || 0) * 86400 + (h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000;
  }

  /**
   * Stav jedné budovy z jejího fragmentu.
   *
   * `stav` je jedno ze:
   *   'volno'  – dá se vylepšit, `cena` je kolik to stojí
   *   'bezi'   – vylepšení probíhá, `zbyva` je v ms a `urychli` diamanty
   *   'nevim'  – ani jedno; ohlásí se, nedomýšlí se
   */
  function zeStranky(raw, def) {
    const box = document.createElement('div');
    box.innerHTML = raw;
    const text = box.textContent.replace(/\s+/g, ' ');

    const uroven = (() => {
      const m = text.match(/Úroveň:?\s*(\d+)/i);
      return m ? +m[1] : null;
    })();

    const tl = [...box.querySelectorAll('[action]')]
      .find(e => AKCE(def.id).test(e.getAttribute('action') || ''));
    if (tl) {
      /*
       * Cena je v textu tlačítka („Vylepšit 79 359Kč“). Číst ji jde jenom odtud –
       * jinde v okně není a hádat ji z úrovně nelze.
       */
      const m = tl.textContent.replace(/\s+/g, ' ').match(/([\d\s  .,]+)\s*Kč/);
      return {
        ...def, stav: 'volno', uroven,
        cena: m ? Math.round(num(m[1])) : null,
        popis: tl.textContent.replace(/\s+/g, ' ').trim()
      };
    }

    const skip = box.querySelector(S.skip);
    if (skip) {
      const zbyva = zbyvaZ(box);
      const m = skip.textContent.replace(/\s+/g, ' ').match(/(\d[\d\s  ]*)/);
      return {
        ...def, stav: 'bezi', uroven, zbyva,
        urychli: m ? Math.round(num(m[1])) : null
      };
    }

    return { ...def, stav: 'nevim', uroven };
  }

  /** Přečte budovu (GET). Vrací i `raw`, ať se na akci nemusí číst dvakrát. */
  async function precti(def) {
    const o = await NS.parse.apiGet(URL_OF(def.id));
    if (o.status !== 200) {
      throw new Error(def.label + ' nejde přečíst (HTTP ' + o.status + ')');
    }
    const s = zeStranky(o.raw, def);
    if (s.stav === 'bezi' && s.zbyva != null) {
      hotovoV.set(def.id, Date.now() + s.zbyva + REZERVA_MS);
    } else {
      zapomen(def.id);
    }
    return { ...s, raw: o.raw };
  }

  /** Stav všech budov. Běžící se přeskočí, dokud jim neuplyne termín. */
  async function stav(force = false) {
    const out = [];
    for (const def of BUDOVY) {
      const kdy = beziAz(def.id);
      if (kdy && !force) {
        out.push({ ...def, stav: 'bezi', zbyva: kdy - Date.now(), zPameti: true });
        continue;
      }
      try { out.push(await precti(def)); } catch (e) {
        out.push({ ...def, stav: 'chyba', duvod: e.message });
      }
    }
    return out;
  }

  /* ---- peníze ------------------------------------------------------------- */

  const hotovost = () => {
    const el = document.querySelector('.renew-money');
    return el ? num(el.textContent) : null;
  };

  /*
   * !!! HALÉŘE !!!
   * Peníze ve hře mají desetinná místa (hotovost 858,90 Kč) a výběr z banky se
   * podlahuje na celé koruny. Spočítat „chybí 1 910,10“ a vybrat 1 910 tedy dá
   * 2 768,90 proti ceně 2 769 – chybí deset haléřů a hra vylepšení odmítne.
   * Přesně tohle to shazovalo.
   *
   * Vybírá se proto o `NAVIC` víc a zaokrouhluje se NAHORU. Sto korun je proti
   * cenám v desetitisících zanedbatelné a peníze nikam nemizí – zůstanou
   * v hotovosti a příště se použijí.
   */
  const NAVIC = 100;

  /**
   * Zajistí aspoň `potreba` ČISTÝCH peněz v hotovosti. Vrací `{ok, duvod}` –
   * nevyhazuje, aby volající měl jednu cestu, jak důvod napsat do lišty.
   *
   * !!! VÝBĚR SE OVĚŘUJE !!!
   * Kdyby se jen kliklo a šlo dál, vypadalo by „vylepšeno“ i tam, kde hra
   * peníze nepřipsala – a tenhle typ chyby už tu byl u banky i u výroben.
   */
  async function penize(potreba) {
    /*
     * Cena z tlačítka je celé koruny, ale hotovost má haléře – strop se drží
     * nahoru, ať se nestane, že „mám 2 768,90 a potřebuju 2 769“ projde.
     */
    const cil = Math.ceil(potreba);
    const mam = hotovost();
    if (mam == null) return { ok: false, duvod: 'hotovost nejde přečíst' };
    if (mam >= cil) return { ok: true, vybrano: 0 };
    if (!NS.bank) return { ok: false, duvod: 'chybí ' + NS.fmt.kc(cil - mam, { short: true })
      + ' a banka není k ruce' };

    /* nutné je celé koruny nahoru, chtěné je nutné + rezerva na haléře */
    const nutne = Math.ceil(cil - mam);
    const chtene = nutne + NAVIC;

    /*
     * !!! JEDNO ZAŠKOBRTNUTÍ NESMÍ ZABÍT CELOU AKCI !!!
     * Naměřeno: čtení banky trvá 137–198 ms, ale jednou spadlo na 12s timeout
     * (`Hra neodpověděla do 12 s`) – a protože se selhání vracelo hned, tlačítko
     * ohlásilo chybu a vypadalo to, že vylepšování nefunguje. Zkouší se proto
     * třikrát; pořadové číslo je v hlášce, ať je poznat, že šlo o výpadek.
     */
    const POKUSU = 3;
    let s = null, potiz = null;
    for (let i = 1; i <= POKUSU; i++) {
      try { s = await NS.bank.load(); break; } catch (e) {
        potiz = e.message;
        if (i < POKUSU) await sleep(900);
      }
    }
    if (!s) {
      return { ok: false, duvod: 'banku nejde přečíst ani po ' + POKUSU
        + ' pokusech: ' + potiz };
    }
    const vBance = Math.floor(s.kVyberu != null ? s.kVyberu : 0);
    /*
     * Posuzuje se NUTNÉ, ne chtěné: kdyby v bance chybělo právě na tu
     * stokorunovou rezervu, bylo by hloupé akci odmítnout, když na cenu peníze
     * jsou. Vybere se pak, co tam je.
     */
    if (vBance < nutne) {
      return { ok: false, duvod: 'ani s bankou to nestačí – chybí '
        + NS.fmt.kc(nutne - vBance, { short: true }) };
    }
    const vybrat = Math.min(chtene, vBance);

    try {
      await NS.bank.vybrat(vybrat, s.raw);
    } catch (e) {
      return { ok: false, duvod: 'výběr z banky selhal: ' + e.message };
    }

    await sleep(400);
    const po = hotovost();
    /*
     * Měří se to, na čem záleží: jestli hotovost DOSÁHLA ceny. Dřív se hlídal
     * jen podíl vybrané částky, takže „vybráno skoro všechno“ prošlo jako
     * úspěch – a přitom na zaplacení chybělo.
     */
    if (po == null || po < cil) {
      return { ok: false,
        duvod: 'po výběru pořád nestačí – ' + NS.fmt.kc(mam) + ' → '
          + NS.fmt.kc(po) + ', potřeba ' + NS.fmt.kc(cil)
          + ' (vybíralo se ' + NS.fmt.kc(vybrat) + ')' };
    }
    return { ok: true, vybrano: vybrat };
  }

  /* ---- akce --------------------------------------------------------------- */

  /**
   * Vylepší jednu budovu. Kliká se na SKUTEČNÉ tlačítko z fragmentu vloženého do
   * herního okna – přímý POST hra odmítá („Spausk per mygtuką, o ne per
   * nuorodą!“), stejně jako u výroben.
   */
  async function klikni(def, raw) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-upg-box';
    box.innerHTML = raw;
    host.appendChild(box);
    try {
      await sleep(200);
      const el = [...box.querySelectorAll('[action]')]
        .find(e => AKCE(def.id).test(e.getAttribute('action') || ''));
      if (!el) throw new Error('tlačítko „Vylepšit“ v okně není');
      el.click();
      await sleep(500);
    } finally {
      box.remove();
    }
  }

  let posledni = null;

  /**
   * Vylepší budovu podle ID: přečte stav, došáhne si pro peníze, klikne a
   * OVĚŘÍ, že se stav změnil. Vrací `{label, cena, uroven, zbyva}`.
   */
  async function vylepsi(id) {
    const def = BUDOVY.find(b => b.id === id);
    if (!def) throw new Error('neznámá budova ' + id);
    if (NS.captcha && NS.captcha.blokuje()) throw new Error('hra ukazuje captchu');
    if (NS.jail && NS.jail.blocked()) throw new Error('jsi ve vězení/nemocnici');

    zapomen(id);
    const s = await precti(def);

    if (s.stav === 'bezi') {
      throw new Error(def.label + ' už se vylepšuje – hotovo za ' + NS.fmt.dur(s.zbyva));
    }
    if (s.stav !== 'volno') {
      throw new Error(def.label + ': tlačítko „Vylepšit“ tam není (stav „' + s.stav + '“)');
    }
    if (!(s.cena > 0)) {
      throw new Error(def.label + ': nejde přečíst cena (' + (s.popis || '?') + ')');
    }

    const strop = Math.max(0, Math.round(+cfg().upgMaxCena || 0));
    if (strop && s.cena > strop) {
      throw new Error(def.label + ' stojí ' + NS.fmt.kc(s.cena, { short: true })
        + ', strop je ' + NS.fmt.kc(strop, { short: true }));
    }

    const p = await penize(s.cena);
    if (!p.ok) throw new Error(def.label + ': ' + p.duvod);

    /*
     * Po výběru se okno čte ZNOVU. Fragment z doby před výběrem o penězích neví
     * a klikat do něj znamená klikat do zastaralého stavu – přesně tady se
     * v tomhle projektu peníze „ztrácely“.
     */
    const s2 = p.vybrano > 0 ? await precti(def) : s;
    if (s2.stav !== 'volno') {
      throw new Error(def.label + ': po výběru z banky už není volno ('
        + s2.stav + ')');
    }

    await klikni(def, s2.raw);

    /* Ověření: budova musí buď běžet, nebo mít vyšší úroveň. */
    zapomen(id);
    const po = await precti(def);
    const zmena = po.stav === 'bezi'
      || (po.uroven != null && s2.uroven != null && po.uroven > s2.uroven);
    if (!zmena) {
      throw new Error(def.label + ': klik neudělal nic (pořád „' + po.stav + '“'
        + (po.cena ? ', cena ' + NS.fmt.kc(po.cena, { short: true }) : '') + ')');
    }

    posledni = {
      at: Date.now(), id, label: def.label, cena: s2.cena,
      uroven: s2.uroven, zbyva: po.zbyva, vybrano: p.vybrano
    };
    return posledni;
  }

  /* ---- automatika --------------------------------------------------------- */

  /*
   * Vylepšuje se OD NEJLEVNĚJŠÍHO. Za stejné peníze to dá víc úrovní a hlavně
   * to neuvázne na jedné drahé budově, na kterou se šetří, zatímco tři levné
   * stojí. Kdo chce jinak, může strop ceny nastavit.
   */
  const PAUZA_MS = 15000;
  const autoSet = () => cfg().upgAuto === true;
  const autoOn = () => autoSet() && cfg().autoPaused !== true;
  const rezerva = () => Math.max(0, Math.round(+cfg().upgRezerva || 0));

  let posledniAkce = 0;
  let bezi = false;
  let selhani = 0;
  const MAX_SELHANI = 3;
  const pocty = { upgradu: 0, utraceno: 0 };

  async function autoTick() {
    if (bezi || !autoOn()) return false;
    if (NS.jail && NS.jail.blocked()) return false;
    if (NS.captcha && NS.captcha.blokuje()) return false;
    if (Date.now() - posledniAkce < PAUZA_MS) return false;

    bezi = true;
    try {
      const vse = await stav();
      const strop = Math.max(0, Math.round(+cfg().upgMaxCena || 0));
      const volne = vse.filter(x => x.stav === 'volno' && x.cena > 0)
        .filter(x => !strop || x.cena <= strop)
        .sort((a, b) => a.cena - b.cena);

      if (!volne.length) {
        /*
         * Nic volného není normální stav (všechno se vylepšuje), ne porucha –
         * tak se z toho nepočítá selhání. Čtení stejně nic nestojí, protože
         * běžící budovy mají termín v paměti.
         */
        return false;
      }

      /*
       * Rezerva se počítá z hotovosti I banky: peníze se pro vylepšení stejně
       * vybírají, takže hlídat jen hotovost by rezervu neochránilo.
       */
      const cil = volne[0];
      if (rezerva()) {
        let vBance = 0;
        try { const s = await NS.bank.load(); vBance = s.kVyberu || 0; } catch (e) { /* neznám */ }
        const celkem = (hotovost() || 0) + vBance;
        if (celkem - cil.cena < rezerva()) {
          NS.gym.setStatus('vylepšení: ' + cil.label + ' za '
            + NS.fmt.kc(cil.cena, { short: true }) + ' by porušilo rezervu '
            + NS.fmt.kc(rezerva(), { short: true }), true);
          posledniAkce = Date.now();
          return false;
        }
      }

      const r = await vylepsi(cil.id);
      posledniAkce = Date.now();
      selhani = 0;
      pocty.upgradu++;
      pocty.utraceno += r.cena || 0;
      NS.gym.setStatus('vylepšení: ' + r.label + ' → úr. '
        + ((r.uroven || 0) + 1) + ' za ' + NS.fmt.kc(r.cena, { short: true })
        + (r.zbyva ? ' · hotovo za ' + NS.fmt.dur(r.zbyva) : ''), true);
      return true;
    } catch (e) {
      posledniAkce = Date.now();
      const zprava = String(e.message || e);
      if (/captch/i.test(zprava)) {
        NS.gym.setStatus('⚠ vylepšení: ' + zprava, false);
        return false;
      }
      /* Nedostatek peněz není porucha – je to stav, ze kterého se to samo dostane. */
      if (/nestačí|rezerv|strop/.test(zprava)) {
        NS.gym.setStatus('vylepšení: ' + zprava, true);
        return false;
      }
      selhani++;
      if (selhani >= MAX_SELHANI) {
        await NS.store.patch('read', { upgAuto: false });
        selhani = 0;
        NS.gym.setStatus('⚠ vylepšení: ' + MAX_SELHANI + '× po sobě chyba ('
          + zprava + ') – automatiku jsem vypnul', false);
        return false;
      }
      NS.gym.setStatus('⚠ vylepšení: ' + zprava
        + ' (' + selhani + '/' + MAX_SELHANI + ')', false);
      return false;
    } finally {
      bezi = false;
    }
  }

  /* ---- lišta -------------------------------------------------------------- */

  let cache = null;
  let cacheAt = 0;
  const TTL = 60000;

  function buttons(onChange) {
    if (!cache || Date.now() - cacheAt > TTL) {
      stav().then(v => { cache = v; cacheAt = Date.now(); onChange(); }).catch(() => {});
      if (!cache) return [];
    }

    return cache.map(b => {
      const t = document.createElement('button');
      t.type = 'button';
      const volno = b.stav === 'volno' && b.cena > 0;
      t.className = 'cmc-gym-btn cmc-gym-unit '
        + (volno ? 'cmc-gym-unit-send' : 'cmc-gym-unit-away');
      t.textContent = b.zn + (b.stav === 'bezi' ? ' ⏳' : (volno ? ' ↑' : ' –'));
      t.disabled = !volno;
      t.title = b.label + ' (#' + b.id + ')'
        + (b.uroven ? ' · úroveň ' + b.uroven : '')
        + (b.stav === 'bezi'
          ? ' · vylepšuje se, hotovo za ' + NS.fmt.dur(b.zbyva)
            + (b.urychli ? ' (urychlit za ' + b.urychli + ' 💎 – do toho nesahám)' : '')
          : volno ? ' · vylepšit za ' + NS.fmt.kc(b.cena)
            + (b.cena > (hotovost() || 0) ? ' (dojde se pro ně do banky)' : '')
          : b.stav === 'chyba' ? ' · ' + b.duvod : ' · tlačítko tam není');

      if (volno) {
        t.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          t.disabled = true;
          NS.gym.setStatus('vylepšení: ' + b.label + '…', true);
          try {
            const r = await NS.queue.run('vylepšení', () => vylepsi(b.id));
            NS.gym.setStatus('vylepšení: ' + r.label + ' → úr. '
              + ((r.uroven || 0) + 1) + ' za ' + NS.fmt.kc(r.cena, { short: true })
              + (r.vybrano ? ' (z banky ' + NS.fmt.kc(r.vybrano, { short: true }) + ')' : '')
              + (r.zbyva ? ' · hotovo za ' + NS.fmt.dur(r.zbyva) : ''), true);
          } catch (e) {
            NS.gym.setStatus('⚠ vylepšení: ' + e.message, false);
          }
          cache = null;
          onChange();
        });
      }
      return t;
    });
  }

  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = cfg().autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '')
      + 'Vylepšuje samo, vždycky NEJLEVNĚJŠÍ volnou budovu – za stejné peníze to'
      + ' dá víc úrovní a neuvázne to na jedné drahé. Peníze si vybere z banky'
      + ' a ověří, že se hotovost zvedla. Běžící budovy nečte znovu, dokud jim'
      + ' neuplyne odpočet. Strop ceny i rezervu nastavíš v popupu.';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto;
    inp.addEventListener('change', async () => {
      await NS.store.patch('read', { upgAuto: inp.checked });
      onChange();
    });
    wrap.appendChild(inp);
    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto' + (zapnuto && pozastaveno ? ' ⏸' : '');
    wrap.appendChild(txt);
    return wrap;
  }

  const POPIS_SKUPINY = 'Vylepšování budov: Továrna, Dům zločinů, Posilovna,'
    + ' Nemocnice, Závody, Kasárna. ⏳ = zrovna se vylepšuje.';

  NS.upgrade = {
    BUDOVY, S, vylepsi, stav, precti, zeStranky, penize, hotovost,
    buttons, autoBox, autoTick, autoSet, autoOn, pocty, POPIS_SKUPINY,
    get posledni() { return posledni; },
    __reset() {
      hotovoV.clear(); posledniAkce = 0; selhani = 0; bezi = false;
      cache = null; cacheAt = 0; pocty.upgradu = 0; pocty.utraceno = 0;
    },
    /*
     * Jen pro testy: zapomene pauzu mezi akcemi, ale NE počítadlo chyb – bez toho
     * by se nedalo změřit, že se automatika po třech chybách vypne.
     */
    __resetPauzu() { posledniAkce = 0; hotovoV.clear(); }
  };
})();
