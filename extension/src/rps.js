/* =============================================================================
 * rps.js – Kámen–Nůžky–Papír (#17): vypsat výzvu jedním klikem
 *
 * Proměřeno naživo (odpovědi serveru, ne odhad):
 *   POST /map/building/casino/createSSP  {amount, sign}
 *     sign ∈ fist | paper | scissors     (hodnoty z `data-choice` v okně hry)
 *     200 → {"confirm":"Úspěšně umístěno"}
 *     422 → {"message":"Minimální číslo může být 100","errors":{…}}
 *   POST /map/building/casino/playSSP/<id>  – hraní CIZÍ výzvy, tady se nedělá
 *
 * Platí se ŠPINAVÝMI penězi a sázka se strhne HNED při vytvoření (změřeno přes
 * `/user/minute-refresh`: 102 417 912 → 102 417 812, tedy přesně −100).
 *
 * !!! VÝSLEDEK PŘIJDE DO ZPRÁV !!!
 * Vytvořením se výzva jen vyvěsí; rozhodne se, až ji někdo přijme – a hra o tom
 * napíše do `/notifications/notifications`:
 *
 *   „Vyhrál jsi 190 ve hře kámen-nůžky-papír“              → připsáno 190
 *   „Prohrál jsi 100 ve hře kámen-nůžky-papír“             → sázka 100 pryč
 *   „Hra Kámen-Nůžky-Papír skončila remízou. 100 ti bylo vráceno“
 *
 * Z toho se dá spočítat PŘESNÁ bilance, a to i pro hry vypsané ručně ve hře –
 * evidence tedy nestojí na tom, jestli šly přes tlačítko v liště. Výhra je
 * 1,9× sázky (sázka zpět + soupeřova mínus 10 %), takže ze „Vyhrál jsi 190“
 * plyne sázka 100 a čistý zisk +90.
 *
 * Každá zpráva má `data-notification-id`, podle kterého se pozná, že už se
 * započítala – jinak by se při každém čtení sečetla znovu.
 *
 * !!! POZOR: ZPRÁVY SE DAJÍ SMAZAT !!!
 * Hra má „Smazat vše“ a starší zprávy sama odklízí. Co se nestihne přečíst,
 * je nenávratně pryč, proto se kontroluje průběžně (tik lišty, nejvýš jednou
 * za minutu), ne až když se otevře panel.
 *
 * !!! NA ÚKOLY, NE NA VÝDĚLEK !!!
 * Z výhry se strhává 10 %, takže proti náhodnému soupeři je to
 * ⅓ × 1,9 + ⅓ × 1 + ⅓ × 0 = 0,967 vsazeného, tedy −3,3 % na hru.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/17';
  const CREATE = '/map/building/casino/createSSP';
  /** Minimum vynucuje server – hlídá se i tady, ať se zbytečně neposílá. */
  const MIN = 100;
  const ZNAMENI = ['fist', 'paper', 'scissors'];
  const POPIS = { fist: '✊ kámen', paper: '✋ papír', scissors: '✌️ nůžky' };

  const nahodneZnameni = () => ZNAMENI[Math.floor(Math.random() * ZNAMENI.length)];

  function csrf() {
    const m = document.querySelector('meta[name=csrf-token]');
    return m ? m.content : null;
  }

  /**
   * Vypíše výzvu. Znamení se volí náhodně – v kámen-nůžky-papír proti neznámému
   * soupeři je každá volba stejně dobrá a náhoda navíc znemožní, aby si někdo
   * všiml vzorce.
   */
  /**
   * Důvod odmítnutí z odpovědi hry.
   *
   * !!! `errors` NEMÁ VŽDY LARAVELOVSKÝ TVAR !!!
   * Naměřeno naživo na dvou různých odmítnutích:
   *   422 {"message":"Minimální číslo může být 100","errors":{"amount":[...]}}
   *   403 {"errors":"Nemáš dostatek špinavých peněz. Potřebuješ <b…>1 000Kč</b>…"}
   *
   * U toho druhého je `errors` prostý TEXT a `message` chybí. `Object.values()`
   * nad textem ho rozeberou na jednotlivé znaky, takže z celé hlášky zbylo
   * jediné „N“ – v liště pak svítilo „⚠ KNP: N“ a nebylo poznat vůbec nic.
   *
   * Text může obsahovat HTML (`<b>`, `<span class=icon-…>`), tak se značky
   * odstraní – jinak by se v liště objevilo `<b class=pretty-points-value>`.
   */
  function duvodOdmitnuti(data, status) {
    const cistTxt = x => String(x)
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const zNeceho = x => {
      if (x == null) return null;
      if (typeof x === 'string') return cistTxt(x) || null;
      if (Array.isArray(x)) {
        for (const v of x) { const t = zNeceho(v); if (t) return t; }
        return null;
      }
      if (typeof x === 'object') {
        for (const v of Object.values(x)) { const t = zNeceho(v); if (t) return t; }
        return null;
      }
      return null;
    };

    return zNeceho(data && data.message)
      || zNeceho(data && data.errors)
      || 'hra odmítla výzvu (HTTP ' + status + ')';
  }

  async function vytvor(castka) {
    const c = Math.max(MIN, Math.round(+castka || MIN));
    const sign = nahodneZnameni();
    const t = csrf();
    const r = await fetch(CREATE, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(t ? { 'X-CSRF-TOKEN': t } : {})
      },
      body: new URLSearchParams({ amount: String(c), sign }).toString()
    });

    const txt = await r.text();
    let data = null;
    try { data = JSON.parse(txt); } catch (e) { /* server poslal HTML */ }

    if (r.status !== 200) {
      // hra hlásí důvod srozumitelně (minimum, málo peněz) – ať se to nepřebíjí
      throw new Error(duvodOdmitnuti(data, r.status));
    }
    return { castka: c, sign, popis: POPIS[sign], zprava: data && data.confirm };
  }

  /* ---- výsledky ze zpráv --------------------------------------------------- */

  const ZPRAVY = '/notifications/notifications';
  /** Výhra je 1,9× sázky: sázka zpět plus soupeřova mínus 10 % poplatku. */
  const NASOBEK_VYHRY = 1.9;
  /** Kolik id se pamatuje, aby se zpráva nezapočítala dvakrát. */
  const VIDENYCH_MAX = 400;
  /** Nejčastěji jednou za minutu – víc nemá cenu, zprávy nechodí po sekundách. */
  const KONTROLA_MS = 60000;

  const VZORY = [
    { re: /Vyhrál jsi\s+([\d\s  ]+)\s+ve hře kámen-nůžky-papír/i, typ: 'výhra' },
    { re: /Prohrál jsi\s+([\d\s  ]+)\s+ve hře kámen-nůžky-papír/i, typ: 'prohra' },
    { re: /Kámen-Nůžky-Papír skončila remízou\.\s*([\d\s  ]+)\s*ti bylo vráceno/i,
      typ: 'remíza' }
  ];

  /** Rozebere jednu zprávu. Vrací null, když o kámen-nůžky-papír není. */
  function zprava(text) {
    for (const v of VZORY) {
      const m = String(text || '').match(v.re);
      if (!m) continue;
      const castka = NS.parse.toNum(m[1]);
      if (!castka && castka !== 0) return null;
      /*
       * U výhry hra hlásí, co PŘIPSALA (1,9× sázky), u prohry a remízy samotnou
       * sázku. Aby šlo počítat návratnost, převádí se obojí na dvojici
       * vsazeno/vráceno.
       */
      if (v.typ === 'výhra') {
        const sazka = Math.round(castka / NASOBEK_VYHRY);
        return { typ: v.typ, sazka, vraceno: castka };
      }
      if (v.typ === 'remíza') return { typ: v.typ, sazka: castka, vraceno: castka };
      return { typ: v.typ, sazka: castka, vraceno: 0 };
    }
    return null;
  }

  /** Přečte zprávy a vrátí jen ty o kámen-nůžky-papír, s jejich id. */
  async function novinky() {
    const { status, raw } = await NS.parse.apiGet(ZPRAVY);
    if (status !== 200) throw new Error('zprávy nejdou přečíst (HTTP ' + status + ')');
    const d = document.createElement('div');
    d.innerHTML = raw;
    const out = [];
    for (const e of d.querySelectorAll('[data-notification-id]')) {
      const z = zprava((e.querySelector('.content') || e).textContent);
      if (z) out.push({ id: e.getAttribute('data-notification-id'), ...z });
    }
    return out;
  }

  /**
   * Započítá zprávy, které ještě nebyly viděné. Vrací, kolik jich přibylo –
   * ať se dá poznat, jestli má cenu překreslovat.
   */
  async function nactiVysledky() {
    const log = NS.store.get().rpsLog || {};
    const videne = log.videne || [];
    const zname = new Set(videne);

    let vse;
    try { vse = await novinky(); } catch (e) { return { chyba: e.message, nove: 0 }; }
    const nove = vse.filter(z => !zname.has(z.id));
    if (!nove.length) {
      await NS.store.put('rpsLog', { ...log, kontrolaAt: Date.now() });
      return { nove: 0 };
    }

    const v = { vyhry: 0, prohry: 0, remizy: 0, vsazeno: 0, vraceno: 0,
      ...(log.vysledky || {}) };
    for (const z of nove) {
      if (z.typ === 'výhra') v.vyhry++;
      else if (z.typ === 'prohra') v.prohry++;
      else v.remizy++;
      v.vsazeno += z.sazka;
      v.vraceno += z.vraceno;
    }

    await NS.store.put('rpsLog', {
      ...log,
      vysledky: v,
      kontrolaAt: Date.now(),
      // pamatují se jen nedávná id; starší zprávy hra stejně smaže
      videne: [...nove.map(z => z.id), ...videne].slice(0, VIDENYCH_MAX)
    });
    return { nove: nove.length };
  }

  /** Kontrola z tiku lišty – sama se drží zpátky, ať se neptá každých pět sekund. */
  async function zkontrolujObcas() {
    if (NS.store.get().read.rpsBar === false) return null;
    const log = NS.store.get().rpsLog || {};
    if (Date.now() - (log.kontrolaAt || 0) < KONTROLA_MS) return null;
    return nactiVysledky();
  }

  /* ---- evidence ------------------------------------------------------------ */

  /**
   * Které výzvy jsou právě vyvěšené a které z nich jsou moje. Vlastní hra má
   * v seznamu své `data-game-id`, takže se dá sledovat, kdy zmizí – to znamená,
   * že ji někdo přijal.
   */
  async function vypsane() {
    const { status, raw } = await NS.parse.apiGet(BUILDING);
    if (status !== 200) throw new Error('budova #17 nejde přečíst (HTTP ' + status + ')');
    const d = document.createElement('div');
    d.innerHTML = raw;
    const id = e => {
      const n = e.matches('[data-game-id]') ? e : e.querySelector('[data-game-id]');
      return n ? n.getAttribute('data-game-id') : null;
    };
    return [...d.querySelectorAll('.ssp-games-list-block > *')]
      .map(id).filter(Boolean);
  }

  /**
   * Projde uložené vlastní výzvy a ty, které už v seznamu nejsou, označí za
   * vyřízené. Kdo vyhrál, se poznat nedá – viz hlavička.
   */
  async function zkontroluj() {
    const log = NS.store.get().rpsLog || {};
    const cekajici = log.cekajici || [];
    if (!cekajici.length) return { vyrizeno: 0, ceka: 0 };

    let vypsaneId;
    try { vypsaneId = await vypsane(); } catch (e) { return { chyba: e.message }; }

    const porad = cekajici.filter(h => vypsaneId.includes(h.id));
    const vyrizene = cekajici.filter(h => !vypsaneId.includes(h.id));
    if (!vyrizene.length) return { vyrizeno: 0, ceka: porad.length };

    await NS.store.put('rpsLog', {
      ...log,
      cekajici: porad,
      vyrizeno: (log.vyrizeno || 0) + vyrizene.length,
      vyrizenoCastka: (log.vyrizenoCastka || 0) + vyrizene.reduce((s, h) => s + h.castka, 0)
    });
    return { vyrizeno: vyrizene.length, ceka: porad.length };
  }

  /** Zapíše vypsanou výzvu – včetně jejího `id`, aby šlo poznat vyřízení. */
  async function zapis(vysledek, id) {
    const log = NS.store.get().rpsLog || {};
    await NS.store.put('rpsLog', {
      ...log,
      n: (log.n || 0) + 1,
      vsazeno: (log.vsazeno || 0) + vysledek.castka,
      znameni: { ...(log.znameni || {}),
        [vysledek.sign]: ((log.znameni || {})[vysledek.sign] || 0) + 1 },
      firstAt: log.firstAt || Date.now(),
      lastAt: Date.now(),
      cekajici: [...(log.cekajici || []),
        ...(id ? [{ id, castka: vysledek.castka, sign: vysledek.sign, at: Date.now() }] : [])]
    });
  }

  /**
   * Vypíše výzvu a zaeviduje ji. `id` se zjistí porovnáním seznamu před a po –
   * odpověď serveru ho nevrací.
   */
  async function vytvorAZapis(castka) {
    let pred = [];
    try { pred = await vypsane(); } catch (e) { /* bez id se to obejde */ }

    const vysledek = await vytvor(castka);

    let id = null;
    try {
      const po = await vypsane();
      const nove = po.filter(x => !pred.includes(x));
      // právě jedna nová výzva = ta moje; při víc nových se id radši nehádá
      if (nove.length === 1) [id] = nove;
    } catch (e) { /* id je nepovinné */ }

    await zapis(vysledek, id);
    return { ...vysledek, id };
  }

  function stats() {
    const log = NS.store.get().rpsLog || {};
    const cekajici = log.cekajici || [];
    const v = { vyhry: 0, prohry: 0, remizy: 0, vsazeno: 0, vraceno: 0,
      ...(log.vysledky || {}) };
    const dohrano = v.vyhry + v.prohry + v.remizy;
    return {
      // co se vypsalo tlačítkem v liště
      n: log.n || 0,
      vsazeno: log.vsazeno || 0,
      znameni: log.znameni || {},
      ceka: cekajici.length,
      cekaCastka: cekajici.reduce((s, h) => s + h.castka, 0),
      vyrizeno: log.vyrizeno || 0,
      vyrizenoCastka: log.vyrizenoCastka || 0,
      firstAt: log.firstAt || null,
      lastAt: log.lastAt || null,
      /*
       * Skutečné výsledky ze zpráv – platí i pro hry vypsané ručně ve hře,
       * takže se nemusí shodovat s počtem vypsaných tlačítkem.
       */
      vysledky: {
        ...v, dohrano,
        bilance: v.vraceno - v.vsazeno,
        rtp: v.vsazeno > 0 ? (v.vraceno / v.vsazeno) * 100 : null,
        uspesnost: dohrano > 0 ? (v.vyhry / dohrano) * 100 : null
      },
      kontrolaAt: log.kontrolaAt || null
    };
  }

  const reset = () => NS.store.put('rpsLog', {});

  /* ---- lišta --------------------------------------------------------------- */

  /**
   * Políčko s částkou a tlačítko „vypsat“ – vrací pole, ať si je `row()` poskládá.
   *
   * Kliká se ručně, takže se to NEDÁVÁ do fronty – ta řadí jen automatiku.
   * Nic se přitom neklikne v okně hry: posílá se rovnou požadavek, protože
   * obsluha znamení v okně visí na skriptu hry a ve vloženém fragmentu se
   * neváže (vyzkoušeno – klik na ruku tam neudělá nic).
   */
  function buttons(onChange) {
    const cfg = NS.store.get().read;
    const s = stats();

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'cmc-casino-input cmc-rps-input';
    inp.min = String(MIN);
    inp.step = '100';
    inp.value = String(Math.max(MIN, Math.round(+cfg.rpsStake || MIN)));
    inp.title = 'Sázka ve špinavých penězích, minimum ' + NS.fmt.num(MIN)
      + ' (vynucuje hra).';
    inp.addEventListener('change', async () => {
      const v = Math.max(MIN, Math.round(+inp.value || MIN));
      inp.value = String(v);
      await NS.store.patch('read', { rpsStake: v });
    });
    // klik do políčka nesmí probublat na herní prvky pod lištou
    inp.addEventListener('click', e => e.stopPropagation());

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-gym-btn cmc-gym-unit cmc-gym-unit-send';
    b.textContent = '✊✋✌️ Vypsat';
    b.title = 'Vypíše výzvu v Kámen–Nůžky–Papír (#17) za zadanou částku'
      + ' ŠPINAVÝCH peněz; znamení se zvolí náhodně.'
      + ' Sázka se strhne hned a nejde stáhnout – výsledek přijde, až výzvu'
      + ' někdo přijme.'
      + (s.n ? ' Zatím vypsáno ' + NS.fmt.num(s.n) + '× za '
        + NS.fmt.kc(s.vsazeno, { short: true })
        + (s.ceka ? ', čeká ' + NS.fmt.num(s.ceka) : '') + '.' : '')
      + ' Z výhry si hra bere 10 %, takže na výdělek to není.';

    b.addEventListener('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      const castka = Math.max(MIN, Math.round(+inp.value || MIN));
      NS.gym.setStatus('KNP: vypisuji za ' + NS.fmt.kc(castka, { short: true }) + '…');
      try {
        const v = await vytvorAZapis(castka);
        NS.gym.setStatus('KNP: vypsáno ' + NS.fmt.kc(v.castka, { short: true })
          + ' · ' + v.popis + (v.id ? ' · hra ' + v.id : ''));
        onChange();
      } catch (e) {
        NS.gym.setStatus('⚠ KNP: ' + e.message, true);
        b.disabled = false;
      }
    });

    return [inp, b];
  }

  /**
   * Vlastní řádek lišty. Nesedí v řádku budov schválně: šachty, mzda,
   * nevěstinec a zahrady jsou sbírání hotového, kdežto tady se PLATÍ a sázka
   * nejde vzít zpět – v jedné řadě s „vybrat mzdu“ by se to kliklo omylem.
   */
  function row(onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'cmc-gym-row cmc-gym-rps-row';

    const label = document.createElement('span');
    label.className = 'cmc-gym-label';
    label.textContent = 'Kámen-nůžky-papír:';
    label.title = 'Budova #17. Vypíše výzvu za zadanou částku ŠPINAVÝCH peněz'
      + ' a znamení zvolí náhodně. Z výhry si hra bere 10 %, takže na výdělek'
      + ' to není – návratnost 96,7 %.';
    wrap.appendChild(label);

    buttons(onChange).forEach(e => wrap.appendChild(e));

    /*
     * Kolik výzev visí, je jediné číslo, které má v liště cenu: sázka je pryč
     * a dokud je někdo nepřijme, nic se nerozhodne. Zbytek je v Příjmech.
     */
    const s = stats();
    const v = s.vysledky;
    if (s.n || v.dohrano) {
      const info = document.createElement('span');
      info.className = 'cmc-gym-rps-info'
        + (v.bilance > 0 ? ' cmc-good' : (v.bilance < 0 ? ' cmc-bad' : ''));
      info.textContent = v.dohrano
        ? NS.fmt.num(v.dohrano) + '× · ' + NS.fmt.signed(v.bilance, ' Kč')
          + (s.ceka ? ' · čeká ' + NS.fmt.num(s.ceka) : '')
        : NS.fmt.num(s.n) + '× vypsáno · čeká ' + NS.fmt.num(s.ceka);
      info.title = v.dohrano
        ? 'Dohráno ' + NS.fmt.num(v.dohrano) + ' her: '
          + NS.fmt.num(v.vyhry) + '× výhra, ' + NS.fmt.num(v.remizy) + '× remíza, '
          + NS.fmt.num(v.prohry) + '× prohra. Vsazeno '
          + NS.fmt.kc(v.vsazeno, { short: true }) + ', vráceno '
          + NS.fmt.kc(v.vraceno, { short: true })
          + (v.rtp != null ? ' (' + NS.fmt.pct(v.rtp) + ')' : '')
          + '. Počítá se ze zpráv hry, takže i hry vypsané ručně.'
        : 'Vypsáno ' + NS.fmt.num(s.n) + ' výzev za '
          + NS.fmt.kc(s.vsazeno, { short: true })
          + '. Výsledky se objeví, až je někdo přijme – čtou se ze zpráv hry.';
      wrap.appendChild(info);
    }
    return wrap;
  }

  NS.rps = {
    vytvor, vytvorAZapis, vypsane, zkontroluj, zapis, stats, reset, buttons, row,
    zprava, novinky, nactiVysledky, zkontrolujObcas, NASOBEK_VYHRY, ZPRAVY,
    nahodneZnameni, duvodOdmitnuti, MIN, ZNAMENI, POPIS, BUILDING, CREATE
  };
})();
