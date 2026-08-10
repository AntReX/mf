/* =============================================================================
 * popup.js – nastavení: které budovy se čtou, jak často, a záloha dat
 * ===========================================================================*/

(() => {
  'use strict';
  const store = globalThis.CMC.store;

  /*
   * Akce, které smí automatický trénink dostat. Musí odpovídat `AUTO_ALLOWED`
   * v src/gym.js – popup gym.js nenačítá, takže je to tady zvlášť. Záměrně to
   * NENÍ odvozené z <option> v HTML: pak by kontrola neuhlídala nic, protože by
   * povolila cokoli, co v nabídce je.
   */
  const AUTO_KEYS = ['speed', 'strength', 'defense', 'army_guards', 'army_warriors'];

  const KINDS = [
    { value: 'whisky', label: 'whisky' },
    { value: 'farm', label: 'konopí' },
    { value: 'meth', label: 'pervitin' },
    { value: 'brewery', label: 'pivovar' },
    { value: 'bank', label: 'banka' },
    { value: 'generic', label: 'ostatní' }
  ];

  const METRICS = [
    { value: 'stock', label: 'surovina' },
    { value: 'free', label: 'volná kapacita' }
  ];

  const $ = id => document.getElementById(id);
  let buildings = [];
  let fleet = [];

  function msg(text, isErr) {
    const el = $('msg');
    el.textContent = text;
    el.className = 'ok' + (isErr ? ' err' : '');
    if (text) setTimeout(() => { el.textContent = ''; }, 2500);
  }

  function buildingRow(b, index) {
    const wrap = document.createElement('div');
    wrap.className = 'b-row';

    const id = document.createElement('input');
    id.type = 'number';
    id.min = '1';
    id.value = b.id;
    id.addEventListener('input', () => { buildings[index].id = +id.value || 0; });

    const label = document.createElement('input');
    label.type = 'text';
    label.value = b.label || '';
    label.placeholder = 'název';
    label.addEventListener('input', () => { buildings[index].label = label.value; });

    const kind = document.createElement('select');
    for (const k of KINDS) {
      const o = document.createElement('option');
      o.value = k.value;
      o.textContent = k.label;
      if (k.value === (b.kind || 'generic')) o.selected = true;
      kind.appendChild(o);
    }
    kind.addEventListener('change', () => { buildings[index].kind = kind.value; });

    // celková kapacita – použije se, když ji nelze přečíst ze hry
    const cap = document.createElement('input');
    cap.type = 'number';
    cap.min = '0';
    cap.value = b.capacity == null ? '' : b.capacity;
    cap.placeholder = 'kap.';
    cap.title = 'kolik sudů / hektarů budova má celkem (nepovinné)';
    cap.addEventListener('input', () => {
      buildings[index].capacity = cap.value === '' ? null : +cap.value;
    });

    const del = document.createElement('button');
    del.className = 'x';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'odebrat';
    del.addEventListener('click', () => {
      buildings.splice(index, 1);
      renderBuildings();
    });

    wrap.append(id, label, kind, cap, del);
    return wrap;
  }

  function renderBuildings() {
    const box = $('buildings');
    box.textContent = '';
    buildings.forEach((b, i) => box.appendChild(buildingRow(b, i)));
    if (!buildings.length) {
      const p = document.createElement('div');
      p.className = 'hint';
      p.textContent = 'Žádná budova – panel nebude mít co číst.';
      box.appendChild(p);
    }
  }

  // ---- dopravní prostředky ------------------------------------------------

  function inputEl(type, value, placeholder, onInput, extra = {}) {
    const el = document.createElement('input');
    el.type = type;
    if (type === 'number') el.min = extra.min != null ? extra.min : '0';
    el.value = value == null ? '' : value;
    if (placeholder) el.placeholder = placeholder;
    if (extra.title) el.title = extra.title;
    el.addEventListener('input', () => onInput(type === 'number'
      ? (el.value === '' ? null : +el.value)
      : el.value));
    return el;
  }

  function selectEl(value, options, onChange, title) {
    const sel = document.createElement('select');
    if (title) sel.title = title;
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (String(o.value) === String(value == null ? '' : value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function fleetRow(f, i) {
    const box = document.createElement('div');

    const top = document.createElement('div');
    top.className = 'f-row';
    top.append(
      inputEl('text', f.name, 'název (loď, letadlo…)', v => { fleet[i].name = v; }),
      inputEl('number', f.capacity, 'kapacita', v => { fleet[i].capacity = v; }, { title: 'kapacita jednoho vyslání' }),
      inputEl('number', f.count, 'ks', v => { fleet[i].count = v; }, { title: 'kolik jich máš' }));

    const del = document.createElement('button');
    del.className = 'x';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'odebrat';
    del.addEventListener('click', () => { fleet.splice(i, 1); renderFleet(); });
    top.appendChild(del);

    const bottom = document.createElement('div');
    bottom.className = 'f-row2';
    const sourceOpts = [{ value: '', label: 'zásoba ručně' }].concat(
      buildings.filter(b => +b.id > 0).map(b => ({ value: b.id, label: 'z ' + (b.label || ('#' + b.id)) })));
    bottom.append(
      selectEl(f.sourceBuildingId || '', sourceOpts,
        v => { fleet[i].sourceBuildingId = v ? +v : null; }, 'odkud brát zásobu'),
      selectEl(f.sourceMetric || 'stock', METRICS,
        v => { fleet[i].sourceMetric = v; }, 'která hodnota budovy'),
      inputEl('number', f.cost, 'poplatek', v => { fleet[i].cost = v; },
        { title: 'poplatek za jedno vyslání (Kč)' }));

    box.append(top, bottom);
    return box;
  }

  function renderFleet() {
    const box = $('fleet');
    box.textContent = '';
    fleet.forEach((f, i) => box.appendChild(fleetRow(f, i)));
    if (!fleet.length) {
      const p = document.createElement('div');
      p.className = 'hint';
      p.textContent = 'Žádný prostředek – sekce „Kolik ještě vyšleš“ se v panelu nezobrazí.';
      box.appendChild(p);
    }
  }

  function fillForm(cfg) {
    buildings = cfg.read.buildings.map(b => ({ ...b }));
    fleet = (cfg.fleet || []).map(f => ({ ...f }));
    renderBuildings();
    renderFleet();
    $('autoRefresh').checked = !!cfg.read.autoRefresh;
    $('refreshSeconds').value = cfg.read.refreshSeconds;
    $('cashSelector').value = cfg.read.cashSelector || '';
    $('bankSelector').value = cfg.read.bankSelector || '';
    $('auctionFill').checked = cfg.read.auctionFill !== false;
    $('gymBar').checked = cfg.read.gymBar !== false;
    $('gymEverywhere').checked = !!cfg.read.gymEverywhere;
    $('gymRemote').checked = !!cfg.read.gymRemote;
    $('gymAlertEnergy').value = cfg.read.gymAlertEnergy || 0;
    $('autoPaused').checked = !!cfg.read.autoPaused;
    fillCrimes(cfg);
    $('autoTrain').value = cfg.read.autoTrain || '';
    // uložená hodnota nemusí být v nabídce (starší nastavení, ruční zásah)
    setSelect('autoTrainPct', cfg.read.autoTrainPct ?? 100, 100);
    setSelect('autoTrainFloor', cfg.read.autoTrainFloor ?? 70, 70);
    $('autoTrainLuck').value = cfg.read.autoTrainLuck ?? 100;
    $('autoTrainGap').value = cfg.read.autoTrainGap ?? 1000;
    $('planeBar').checked = cfg.read.planeBar !== false;
    $('boatBar').checked = cfg.read.boatBar !== false;
    $('crimeBar').checked = cfg.read.crimeBar !== false;
    $('mineBar').checked = cfg.read.mineBar !== false;
    $('workBar').checked = cfg.read.workBar !== false;
    $('workAuto').checked = cfg.read.workAuto === true;
    $('workAutoMinHours').value = cfg.read.workAutoMinHours ?? 1;
    $('workAutoEverySec').value = cfg.read.workAutoEverySec ?? 120;
    $('brothelBar').checked = cfg.read.brothelBar !== false;
    $('brothelAuto').checked = cfg.read.brothelAuto === true;
    $('farmBar').checked = cfg.read.farmBar !== false;
    $('rpsBar').checked = cfg.read.rpsBar !== false;
    $('bankBar').checked = cfg.read.bankBar !== false;
    $('usporAnimace').value = cfg.read.usporAnimace ?? 'napozadi';
    $('reloadAuto').checked = !!cfg.read.reloadAuto;
    $('vyrBar').checked = cfg.read.vyrBar !== false;
    $('vyrAuto').checked = cfg.read.vyrAuto === true;
    $('bankAuto').checked = cfg.read.bankAuto === true;
    $('bankUloz').checked = cfg.read.bankUloz === true;
    $('bankKeep').value = cfg.read.bankKeep ?? 0;
    $('bankKeepDirty').value = cfg.read.bankKeepDirty ?? 0;
    $('bankMinVklad').value = cfg.read.bankMinVklad ?? 10000;
    $('bankMinEnergie').value = cfg.read.bankMinEnergie ?? 0;
    $('rpsStake').value = cfg.read.rpsStake ?? 100;
    $('farmAuto').checked = cfg.read.farmAuto === true;
    $('farmReservePct').value = cfg.read.farmReservePct ?? 25;
    const cl = cfg.casinoLog || {};
    $('casinoLogInfo').textContent = cl.plays
      ? '(' + cl.plays + '× sázek)' : '(prázdné)';
    $('bjStake').value = cfg.read.bjStake ?? 10;
    $('bjReserve').value = cfg.read.bjReserve ?? 0;
    $('bjLoop').checked = cfg.read.bjLoop !== false;
    $('pkStake').value = cfg.read.pkStake ?? 10;
    $('pkReserve').value = cfg.read.pkReserve ?? 0;
    $('pkPrah').value = cfg.read.pkPrah ?? 0;
    $('pkStopSigma').value = cfg.read.pkStopSigma ?? 2.2;
    $('pkStopVychyleni').checked = cfg.read.pkStopVychyleni !== false;
    $('pkMereni').checked = cfg.read.pkMereni === true;
    $('pkMereniAnte').value = cfg.read.pkMereniAnte ?? '10,20';
    $('pkMereniBlok').value = cfg.read.pkMereniBlok ?? 100;
    $('upgBar').checked = cfg.read.upgBar !== false;
    $('upgAuto').checked = cfg.read.upgAuto === true;
    $('upgMaxCena').value = cfg.read.upgMaxCena ?? 0;
    $('upgRezerva').value = cfg.read.upgRezerva ?? 0;
    $('atkBar').checked = cfg.read.atkBar !== false;
    $('atkAuto').checked = cfg.read.atkAuto === true;
    $('atkDruh').value = cfg.read.atkDruh === 'not-active-gang'
      ? 'not-active-gang' : 'not-active';
    $('atkMinUroven').value = cfg.read.atkMinUroven ?? 0;
    $('atkPodil').value = cfg.read.atkPodil ?? 70;
    $('atkPodilAuto').value = cfg.read.atkPodilAuto ?? 50;
    $('atkRezerva').value = cfg.read.atkRezerva ?? 0;
    $('atkPauza').value = cfg.read.atkPauza ?? 60;
    $('atkOdmlka').value = cfg.read.atkOdmlka ?? 2;
    $('pkVzorku').value = cfg.read.pkVzorku ?? 3000;
    $('pkLoop').checked = cfg.read.pkLoop !== false;
    const pl = cfg.pkLog || {};
    $('pkLogInfo').textContent = pl.rounds ? '(' + pl.rounds + '× kol)' : '(prázdné)';
    const pr = cfg.prijmyLog || {};
    const prN = Object.values(pr).reduce((a, z) => a + ((z && z.n) || 0), 0);
    $('prijmyInfo').textContent = prN ? '(' + prN + '× výběrů)' : '(prázdné)';
    const pt = cfg.pkTrace || [];
    $('pkTraceInfo').textContent = pt.length ? '(' + pt.length + '× kol)' : '(prázdné)';
    const bl = cfg.bjLog || {};
    $('bjLogInfo').textContent = bl.rounds ? '(' + bl.rounds + '× kol)' : '(prázdné)';
    const bt = cfg.bjTrace || [];
    $('bjTraceInfo').textContent = bt.length ? '(' + bt.length + '× kol)' : '(prázdné)';
    const sl = cfg.slotsLog || {};
    $('slotsLogInfo').textContent = sl.spins
      ? '(' + sl.spins + '× zatočení)' : '(prázdné)';
    $('farmLimitVal').textContent = cfg.read.farmLimit
      ? cfg.read.farmLimit + ' zahrad' : 'ještě nezjištěn';
    $('casinoBar').checked = cfg.read.casinoBar === true;
    $('casinoAuto').value = String(cfg.read.casinoAuto || '');
    $('casinoAutoContinue').checked = cfg.read.casinoAutoContinue === true;
    $('casinoProgress').checked = cfg.read.casinoProgress !== false;
    $('casinoStep').value = cfg.read.casinoStep ?? 1.5;
    $('casinoPhase1').value = cfg.read.casinoPhase1 ?? 0;
    $('casinoStep2').value = cfg.read.casinoStep2 ?? 1.5;
    renderCasinoPreview();
    $('casinoReserve').value = cfg.read.casinoReserve ?? 0;
    $('casinoMaxSteps').value = cfg.read.casinoMaxSteps ?? 6;
    $('casinoMax').value = cfg.read.casinoMax ?? 0;
    $('autoPlane').checked = !!cfg.read.autoPlane;
    $('autoBoat').checked = !!cfg.read.autoBoat;
  }

  $('addBuilding').addEventListener('click', () => {
    buildings.push({ id: 0, label: '', kind: 'generic', capacity: null });
    renderBuildings();
  });

  $('addFleet').addEventListener('click', () => {
    fleet.push({
      id: 'f' + Date.now().toString(36),
      name: '', capacity: null, count: 1, cost: 0,
      sourceBuildingId: null, sourceMetric: 'stock', stock: null
    });
    renderFleet();
  });

  /*
   * Horní a dolní hranice automatického tréninku. Dolní musí být nižší – jinak
   * by se dávka spustila a hned se zastavila, tedy by se navenek „nic nedělo“.
   */
  const autoPct = () => Math.min(100, Math.max(1, +$('autoTrainPct').value || 100));

  function autoFloor() {
    const pct = autoPct();
    const dno = Math.min(99, Math.max(0, +$('autoTrainFloor').value || 0));
    if (dno < pct) return dno;
    /*
     * Srovnat na nejbližší NABÍZENOU hodnotu pod horní hranicí. Spočítat si
     * `pct - 10` nestačí: číslo, které v nabídce není, select nepřijme a zůstane
     * prázdný – hodnota by se uložila správně, ale uživatel by v UI viděl nic.
     */
    const opraveno = Array.from($('autoTrainFloor').options)
      .map(o => +o.value)
      .filter(v => v < pct)
      .sort((a, b) => b - a)[0] ?? 0;
    $('autoTrainFloor').value = String(opraveno);
    return opraveno;
  }

  /*
   * Náhled progrese sázek. Musí počítat TOTOŽNĚ jako `schedule()` v src/casino.js
   * (popup casino.js nenačítá) – kumulativní násobení a zaokrouhlení každé sázky.
   * Bez náhledu se dvě fáze nastavují naslepo: „prvních 1 sázek“ vypadá jako
   * „první kolo jinak“, ale znamená žádnou první fázi.
   */
  function casinoSchedule(zaklad, f1, faze1, f2, n) {
    const out = [];
    let cur = Math.max(1, zaklad);
    for (let k = 1; k <= n; k++) {
      out.push(Math.round(cur));
      cur *= (faze1 > 0 && k < faze1) ? f1 : (faze1 > 0 ? f2 : f1);
    }
    return out;
  }

  // desetinná čárka, ne tečka – jinak to v českém textu vypadá jako cizí číslo
  const des = (v, d) => v.toFixed(d).replace('.', ',');
  const kcShort = v => (v >= 1e9 ? des(v / 1e9, 2) + ' mld.'
    : v >= 1e6 ? des(v / 1e6, 1) + ' mil.'
      : v >= 1e3 ? Math.round(v / 1e3) + ' tis.' : String(Math.round(v))) + ' Kč';

  function renderCasinoPreview() {
    const el = $('casinoPreview');
    if (!el) return;
    // základní vklad se zadává v liště, ne tady – bere se z uloženého nastavení
    const zaklad = Math.max(1, Math.round(+store.get().read.casinoStake || 10));
    const f1 = Math.max(1, +$('casinoStep').value || 1.5);
    const faze1 = Math.max(0, Math.round(+$('casinoPhase1').value || 0));
    const f2 = Math.max(1, +$('casinoStep2').value || f1);
    const kol = Math.max(1, Math.round(+$('casinoMaxSteps').value || 6));
    const s = casinoSchedule(zaklad, f1, faze1, f2, kol);
    const celkem = s.reduce((a, b) => a + b, 0);
    const zisk = 3 * s[s.length - 1] - celkem;

    el.textContent = '';
    const radek = t => { const d = document.createElement('div'); d.textContent = t; return d; };
    el.appendChild(radek('základ ' + kcShort(zaklad) + ' (mění se v liště)'));
    el.appendChild(radek('sázky: ' + s.slice(0, 7).map(x => kcShort(x)).join(' → ')
      + (s.length > 7 ? ' → … → ' + kcShort(s[s.length - 1]) : '')));
    const b = document.createElement('div');
    b.innerHTML = 'na ' + kol + ' sázek potřebuješ <b>' + kcShort(celkem)
      + '</b>, zisk uzavřené série <b>' + kcShort(zisk) + '</b>';
    el.appendChild(b);
    // 1 = žádná první fáze; ať se to nezjišťuje až z čísel
    if (faze1 === 1) {
      const w = radek('„prvních 1 sázek“ = žádná první fáze, celá série jede ×' + f2);
      w.className = 'warn2';
      el.appendChild(w);
    }
    if (f1 < 1.5 || (faze1 > 0 && f2 < 1.5)) {
      const w = radek('násobek pod 1,5: výhra už nemusí pokrýt celou sérii');
      w.className = 'warn2';
      el.appendChild(w);
    }
  }

  /**
   * Nabídka zločinů pro automatiku. Plní se z toho, co už rozšíření ze hry
   * přečetlo – dokud se zločiny nenačetly, je tam jen „vypnuto“, ať se nenabízí
   * něco, co se nedá spustit.
   */
  function fillCrimes(cfg) {
    const sel = $('autoCrime');
    sel.textContent = '';
    const off = document.createElement('option');
    off.value = '0';
    off.textContent = 'vypnuto';
    sel.appendChild(off);
    for (const c of ((cfg.crimes || {}).list || [])) {
      const o = document.createElement('option');
      o.value = String(c.n);
      o.textContent = c.courage + ' · ' + c.name;
      sel.appendChild(o);
    }
    sel.value = String(+cfg.read.autoCrime || 0);
    if (sel.value === '') sel.value = '0';
    if (sel.options.length === 1) {
      off.textContent = 'vypnuto (zločiny se ještě nenačetly)';
    }
  }

  /** Hodnota do selectu; když v nabídce není, vezme se nejbližší nižší. */
  function setSelect(id, value, fallback) {
    const el = $(id);
    el.value = String(value);
    if (el.value !== '') return;
    const nizsi = Array.from(el.options).map(o => +o.value)
      .filter(v => v <= +value).sort((a, b) => b - a)[0];
    el.value = String(nizsi ?? fallback);
  }

  let fleetSeq = 0;
  $('save').addEventListener('click', async () => {
    const cfgFloorPred = $('autoTrainFloor').value;
    const clean = buildings
      .filter(b => +b.id > 0)
      .map(b => ({
        id: +b.id,
        label: (b.label || '').trim() || ('Budova ' + b.id),
        kind: b.kind || 'generic',
        capacity: b.capacity > 0 ? +b.capacity : null
      }));

    const cleanFleet = fleet
      .filter(f => (f.name || '').trim() || f.capacity > 0)
      .map(f => ({
        id: f.id || ('f' + Date.now().toString(36) + '_' + (++fleetSeq)),
        name: (f.name || '').trim() || 'Prostředek',
        capacity: +f.capacity || 0,
        count: +f.count || 0,
        cost: +f.cost || 0,
        sourceBuildingId: f.sourceBuildingId && clean.some(b => b.id === +f.sourceBuildingId)
          ? +f.sourceBuildingId : null,
        sourceMetric: f.sourceMetric || 'stock',
        stock: f.stock == null ? null : +f.stock
      }));

    await store.patch('read', {
      buildings: clean,
      autoRefresh: $('autoRefresh').checked,
      refreshSeconds: Math.max(60, +$('refreshSeconds').value || 180),
      cashSelector: $('cashSelector').value.trim(),
      bankSelector: $('bankSelector').value.trim(),
      auctionFill: $('auctionFill').checked,
      gymBar: $('gymBar').checked,
      gymEverywhere: $('gymEverywhere').checked,
      gymRemote: $('gymRemote').checked,
      gymAlertEnergy: Math.max(0, +$('gymAlertEnergy').value || 0),
      autoPaused: $('autoPaused').checked,
      autoCrime: +$('autoCrime').value || 0,
      autoTrain: AUTO_KEYS.includes($('autoTrain').value) ? $('autoTrain').value : '',
      autoTrainPct: autoPct(),
      autoTrainFloor: autoFloor(),
      autoTrainLuck: Math.max(0, +$('autoTrainLuck').value || 0),
      autoTrainGap: Math.max(200, +$('autoTrainGap').value || 1000),
      planeBar: $('planeBar').checked,
      boatBar: $('boatBar').checked,
      crimeBar: $('crimeBar').checked,
      mineBar: $('mineBar').checked,
      workBar: $('workBar').checked,
      workAuto: $('workAuto').checked,
      workAutoMinHours: Math.min(24, Math.max(0, Math.round(+$('workAutoMinHours').value || 0))),
      workAutoEverySec: Math.max(30, Math.round(+$('workAutoEverySec').value || 120)),
      brothelBar: $('brothelBar').checked,
      brothelAuto: $('brothelAuto').checked,
      farmBar: $('farmBar').checked,
      rpsBar: $('rpsBar').checked,
      bankBar: $('bankBar').checked,
      usporAnimace: ['nikdy', 'napozadi', 'vzdy'].includes($('usporAnimace').value)
        ? $('usporAnimace').value : 'napozadi',
      reloadAuto: $('reloadAuto').checked,
      vyrBar: $('vyrBar').checked,
      vyrAuto: $('vyrAuto').checked,
      bankAuto: $('bankAuto').checked,
      // ruční volba v nastavení má přednost – automatika už praní neřídí
      bankPratPozastaveno: false,
      bankUloz: $('bankUloz').checked,
      bankKeep: Math.max(0, Math.round(+$('bankKeep').value || 0)),
      bankKeepDirty: Math.max(0, Math.round(+$('bankKeepDirty').value || 0)),
      // 10 tis. je tvrdé dno: vklad stojí energii, míň nedává smysl nikdy
      /*
       * Bere se, jak je zadané – dřív se tu tiše zvedalo na 10 000, takže kdo si
       * napsal 100, dostal 10 000 a nevkládalo se nic. Nula = vlož všechno nad
       * rezervu; vklad energii nestojí (změřeno).
       */
      bankMinVklad: Math.max(0, Math.round(+$('bankMinVklad').value || 0)),
      bankMinEnergie: Math.max(0, Math.round(+$('bankMinEnergie').value || 0)),
      // minimum vynucuje i server (422) – tady se jen neposílá zbytečně nízké
      rpsStake: Math.max(100, Math.round(+$('rpsStake').value || 100)),
      farmAuto: $('farmAuto').checked,
      farmReservePct: Math.max(0, Math.min(99, +$('farmReservePct').value || 0)),
      casinoBar: $('casinoBar').checked,
      casinoAuto: ['1', '2', '3', 'slots', 'blackjack', 'poker'].includes($('casinoAuto').value)
        ? $('casinoAuto').value : '',
      // sázka se skládá z žetonů po 10, takže jen desítky
      bjStake: Math.max(10, Math.round((+$('bjStake').value || 10) / 10) * 10),
      bjReserve: Math.max(0, Math.round(+$('bjReserve').value || 0)),
      bjLoop: $('bjLoop').checked,
      pkStake: Math.max(10, Math.round((+$('pkStake').value || 10) / 10) * 10),
      pkReserve: Math.max(0, Math.round(+$('pkReserve').value || 0)),
      pkPrah: Math.max(0, Math.min(50, Math.round(+$('pkPrah').value || 0))),
      /* prah hlídače v σ; okno zůstává pevných 300 kol */
      pkStopSigma: Math.min(20, Math.max(0.1,
        Math.round((+$('pkStopSigma').value || 2.2) * 10) / 10)),
      pkStopVychyleni: $('pkStopVychyleni').checked,
      upgBar: $('upgBar').checked,
      upgAuto: $('upgAuto').checked,
      upgMaxCena: Math.max(0, Math.round(+$('upgMaxCena').value || 0)),
      upgRezerva: Math.max(0, Math.round(+$('upgRezerva').value || 0)),
      atkBar: $('atkBar').checked,
      atkAuto: $('atkAuto').checked,
      atkDruh: $('atkDruh').value === 'not-active-gang' ? 'not-active-gang' : 'not-active',
      /* podíl úrovně je procento – mimo 1..100 nemá smysl */
      atkMinUroven: Math.max(0, Math.round(+$('atkMinUroven').value || 0)),
      atkPodil: Math.max(1, Math.min(100, Math.round(+$('atkPodil').value || 70))),
      atkPodilAuto: Math.max(1, Math.min(100, Math.round(+$('atkPodilAuto').value || 50))),
      atkRezerva: Math.max(0, Math.round(+$('atkRezerva').value || 0)),
      atkPauza: Math.max(5, Math.round(+$('atkPauza').value || 60)),
      /* dolní mez 1 min – aby z odmlky nešlo udělat tlučení bez pauzy */
      atkOdmlka: Math.max(1, Math.round(+$('atkOdmlka').value || 2)),
      pkMereni: $('pkMereni').checked,
      /*
       * Ante ke střídání se čistí až tady: v poker.js by se špatný zápis
       * projevil až za sto kol, kdežto tady se rovnou uloží použitelná hodnota.
       */
      pkMereniAnte: (String($('pkMereniAnte').value || '10,20').split(',')
        .map(x => Math.max(10, Math.round(+x) || 0))
        .filter((x, i, a) => x >= 10 && a.indexOf(x) === i).join(',') || '10,20'),
      pkMereniBlok: Math.max(20, Math.min(1000, Math.round(+$('pkMereniBlok').value || 100))),
      pkVzorku: Math.max(200, Math.min(20000, Math.round(+$('pkVzorku').value || 3000))),
      pkLoop: $('pkLoop').checked,
      casinoAutoContinue: $('casinoAutoContinue').checked,
      casinoProgress: $('casinoProgress').checked,
      casinoStep: Math.min(5, Math.max(1, +$('casinoStep').value || 1.5)),
      casinoPhase1: Math.min(30, Math.max(0, Math.round(+$('casinoPhase1').value || 0))),
      casinoStep2: Math.min(5, Math.max(1, +$('casinoStep2').value || 1.5)),
      casinoReserve: Math.max(0, Math.round(+$('casinoReserve').value || 0)),
      casinoMaxSteps: Math.min(30, Math.max(1, Math.round(+$('casinoMaxSteps').value || 6))),
      casinoMax: Math.max(0, Math.round(+$('casinoMax').value || 0)),
      autoPlane: $('autoPlane').checked,
      autoBoat: $('autoBoat').checked
    });
    await store.put('fleet', cleanFleet);

    buildings = clean.map(b => ({ ...b }));
    fleet = cleanFleet.map(f => ({ ...f }));
    renderBuildings();
    renderFleet();
    // autoFloor() mohlo dolní hranici při ukládání posunout – ať se to ví
    const dnoZmeneno = $('autoTrainFloor').value !== cfgFloorPred;
    msg(dnoZmeneno
      ? 'Uloženo. Dolní hranice musí být nižší než horní – posunul jsem ji na '
        + $('autoTrainFloor').value + ' %.'
      : 'Uloženo. Panel ve hře se sám překreslí.');
  });

  $('export').addEventListener('click', async () => {
    const data = await store.dump();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'czechmafie-companion-zaloha.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg('Záloha uložena.');
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());

  $('importFile').addEventListener('change', async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      fillForm(await store.restore(JSON.parse(await file.text())));
      msg('Data obnovena.');
    } catch (e) {
      msg('Nepodařilo se: ' + e.message, true);
    } finally {
      ev.target.value = '';
    }
  });

  /*
   * Limit osetých zahrad se zjistí z odmítnutí hrou, takže po zvýšení úrovně je
   * potřeba ho zapomenout – jinak by se držel ten starý, nižší, a prázdná pole
   * by se dál nenabízela.
   */
  /*
   * Mazání záznamů. Dvoukrokové: první klik jen potvrdí – jsou to data, která se
   * sbírají dlouho a jedno omylem kliknuté tlačítko by je zahodilo.
   */
  function zapojMazani(id, akce, hotovo) {
    const b = $(id);
    let armed = false, t = null;
    b.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        b.textContent = 'opravdu?';
        b.classList.add('danger');
        t = setTimeout(() => { armed = false; b.textContent = 'smazat'; b.classList.remove('danger'); }, 4000);
        return;
      }
      clearTimeout(t);
      armed = false;
      b.textContent = 'smazat';
      b.classList.remove('danger');
      await akce();
      fillForm(await store.load());
      msg(hotovo);
    });
  }
  /*
   * Popup načítá jen `store.js`, takže moduly hry tu nejsou. Zápis `null` je
   * proto lepší než opisovat seznam klíčů: `withDefaults` z něj udělá čistý
   * výchozí objekt, a ten seznam žije na jediném místě (store.js).
   */
  zapojMazani('casinoLogClear', () => store.put('casinoLog', null), 'Bilance kasina smazána.');
  zapojMazani('slotsLogClear', () => store.put('slotsLog', null), 'Záznam automatu smazán.');
  zapojMazani('bjLogClear', () => store.put('bjLog', null), 'Záznam blackjacku smazán.');
  zapojMazani('bjTraceClear', () => store.put('bjTrace', []), 'Ladicí průběh smazán.');
  zapojMazani('pkLogClear', () => store.put('pkLog', null), 'Záznam pokeru smazán.');
  zapojMazani('pkTraceClear', () => store.put('pkTrace', []), 'Ladicí průběh pokeru smazán.');
  zapojMazani('prijmyClear', () => store.put('prijmyLog', {}), 'Příjmy budov smazány.');

  $('farmLimitReset').addEventListener('click', async () => {
    await store.patch('read', { farmLimit: null });
    $('farmLimitVal').textContent = 'ještě nezjištěn';
    msg('Limit zahrad se zjistí znovu při prvním zasazení.');
  });

  // náhled se překresluje při každé změně parametrů progrese
  for (const id of ['casinoStep', 'casinoPhase1', 'casinoStep2', 'casinoMaxSteps']) {
    const el = $(id);
    if (el) el.addEventListener('input', renderCasinoPreview);
  }

  /*
   * !!! POPISY SE SCHOVÁVAJÍ POD „i“ !!!
   * Nastavení má třicet popisů a některé jsou na deset řádků, takže se v tom
   * samotné volby ztrácely. Zahodit ten text ale nejde: většina čísel je změřená
   * (kurzy, ceny, prodlevy) a bez vysvětlení se nedá rozhodnout, co nastavit.
   *
   * Dělá se to tady v JS, ne ručně v HTML: popisů je třicet, přibývají a takhle
   * se to týká i těch budoucích bez zásahu do značkování.
   *
   * Tlačítko se dává vedle POPISKU volby, ne nad text – aby bylo poznat, ke které
   * volbě se vysvětlení váže.
   */
  function schovejPopisy() {
    for (const hint of document.querySelectorAll('.hint')) {
      // po druhém průchodu by se tlačítka množila – značka na popisu tomu brání
      if (hint.dataset.cmcInfo) continue;
      hint.dataset.cmcInfo = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-btn';
      btn.textContent = 'i';
      btn.title = 'Zobrazit popis a proč to tak je';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', ev => {
        /*
         * Bez tohohle by klik přepnul zaškrtávátko: část popisů je UVNITŘ
         * <label>, a tam se každý klik přenáší na ovládací prvek.
         */
        ev.preventDefault();
        ev.stopPropagation();
        const otevreno = hint.classList.toggle('open');
        btn.classList.toggle('open', otevreno);
        btn.title = (otevreno ? 'Skrýt' : 'Zobrazit') + ' popis a proč to tak je';
        btn.setAttribute('aria-expanded', otevreno ? 'true' : 'false');
      });

      const vPopisku = hint.closest('.lbl');
      if (vPopisku) {
        // popis je součástí popisku volby – tlačítko patří před něj
        hint.parentNode.insertBefore(btn, hint);
        continue;
      }
      // jinak k popisku předchozího řádku, ať je vidět, čeho se to týká
      const pred = hint.previousElementSibling;
      const lbl = pred && pred.querySelector ? pred.querySelector('.lbl') : null;
      if (lbl) lbl.appendChild(btn);
      else hint.parentNode.insertBefore(btn, hint);
    }
  }

  schovejPopisy();
  store.load().then(fillForm);
})();
