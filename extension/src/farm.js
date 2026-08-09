/* =============================================================================
 * farm.js – Zahrady (20 polí, sloty 35–54): sklidit a zasadit
 *
 *   ŠACHTY: D30 D31 … │ Mzda │ Nevěstinec │ 🌾 15  🌱 3  ☑auto
 *
 * !!! TOHLE JE JEDINÉ MÍSTO, KDE SE NEKLIKÁ DO MODALU BUDOVY !!!
 * Pole nemají žádné okno – `/map/farm/show/35` vrací 404. Celý stav nesou
 * atributy slotu přímo v mapě a klikací plocha je SVG cesta nad ní:
 *
 *   <div slot="35" class="farm-slot slot-35"
 *        data-tooltip="Sklidit" time-left="0" data-state="1"
 *        data-harvest-src=… data-growing-src=… data-empty-src=…
 *        data-harvest-action="/map/farm/harvest/35"
 *        data-plant-action="/map/farm/plant/35"><img …></div>
 *   <svg …><path data-sl="35" type="farm" d="…"></path></svg>
 *
 * Klikat se musí na tu SVG cestu (`path[type=farm][data-sl]`) – herní handler je
 * `$(document).on('click', '[type=farm]')`. Klik na `div.farm-slot` NIC NEUDĚLÁ;
 * zkusil jsem to a hra ani neposlala požadavek. A protože `path` není
 * `HTMLElement`, nemá metodu `.click()` – posílá se `MouseEvent`.
 *
 * Stav se pozná z OBRÁZKU, ne z tooltipu: slot si vedle sebe nese všechny tři
 * možné obrázky (`data-harvest-src` / `data-growing-src` / `data-empty-src`), a
 * který z nich je právě v `<img>`, ten stav platí. Tooltip („Sklidit“, „Zasadit
 * zeleninu“, „za 2 hodiny“) je až záložní cesta – je česky, takže by se rozbil
 * při jakékoli změně textu ve hře.
 *
 * !!! ENERGIE JE TADY TO HLAVNÍ OMEZENÍ !!!
 * Ověřeno naživo s vypnutou automatikou (jinak měření kazí trénink):
 *   sklidit  −3 energie  → „Sklidils a získal jsi 300 kg zeleniny“
 *   zasadit  −3 energie  → roste 8 999 s (2,5 h), pak 300 kg
 * !!! SKLIZEŇ A ZASAZENÍ JSOU JEDNA AKCE !!!
 * Sklidit a nechat pole ležet prázdné nemá smysl – pole se hned zasadí zpátky,
 * takže jedno „obsloužení pole“ stojí VŽDY 6 energie a nikdy se nezačne, když
 * na obě poloviny nestačí. Prázdné pole (nesklizené, jen nezaseté) je jediná
 * výjimka: to je samotné zasazení za 3.
 *
 * Obsloužit všech 20 polí tedy stojí ~120 energie, což je při maximu 59 víc,
 * než kolik jde mít najednou – proto se dávka VŽDY zastaví na energii a nikdy
 * se nespoléhá na to, že to vyjde.
 *
 * Energie se odečítá i lokálně (`NS.gym.bump` + `syncEnergyBar`), protože hra
 * si HUD přepisuje sama až s `user/minute-refresh`, tedy po minutách. Bez toho
 * by dávka jela podle zastaralého čísla a zbytek by hra jen odmítala.
 *
 * !!! POČET OSETÝCH ZAHRAD JE OMEZENÝ ÚROVNÍ !!!
 * Slotů je 20, ale hra osetí nad limit odmítne s HTTP 403:
 *   „Na své úrovni můžeš osít maximálně 17 zahrad. Zvyš na 54 úroveň…“
 * Osetá je zahrada rostoucí i vzrostlá – prázdné se nepočítají. Proto:
 *   • sklizeň se zasazením zpátky projde VŽDY (místo se uvolní a hned zaplní),
 *   • samotné zasazení prázdného pole jen dokud je pod limitem.
 * Limit se z DOM přečíst nedá, takže se bere z té hlášky a uloží (`farmLimit`).
 * Do prvního odmítnutí se sází opatrně po jednom a pak už se ví, kolik jich je.
 *
 * Rezerva proti tréninku: automatický trénink umí energii sníst do svého dna,
 * a pak by na pole nikdy nic nezbylo. Dokud mají pole co dělat, drží tenhle
 * modul spodní hranici (`farmReservePct`) a `gym.autoBurst` ji respektuje.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /** Ověřená cena v energii za jeden klik. */
  const KLIK = 3;
  /**
   * Cena jednoho „obsloužení“: u vzrostlého pole se sklízí A hned zasazuje, tedy
   * dva kliky. Podle tohohle čísla se rozhoduje, jestli se do pole vůbec pustit.
   */
  const CENA = { harvest: 2 * KLIK, plant: KLIK };
  const VYNOS_KG = 300;          // „získal jsi 300 kg zeleniny“
  const RUST_SEC = 8999;         // hra hlásí „za 2 hodiny“, reálně 2,5 h
  const PAUZA = 350;             // mezi akcemi, ať hra stíhá
  const STROP = 40;              // strop na jednu dávku, ať se to nezacyklí

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- stav (čte se jen z DOM, žádný požadavek do hry) --------------------- */

  /** Slot v mapě. Vlastní vložené fragmenty se vynechávají. */
  function slots() {
    return Array.from(document.querySelectorAll('.farm-slot[slot]'))
      .filter(el => !el.closest('.cmc-gym-offscreen') && !el.closest('#cmc-gym-bar'));
  }

  /**
   * Stav jednoho pole. Primárně podle obrázku (jazykově neutrální), tooltip je
   * jen záloha – kdyby hra obrázky přejmenovala, ať to nespadne úplně.
   */
  function stavSlotu(el) {
    const img = (el.querySelector('img') || {}).src || '';
    const H = el.getAttribute('data-harvest-src');
    const G = el.getAttribute('data-growing-src');
    const E = el.getAttribute('data-empty-src');

    let mode = null;
    if (img && img === H) mode = 'harvest';
    else if (img && img === G) mode = 'growing';
    else if (img && img === E) mode = 'plant';
    else {
      const tip = (el.getAttribute('data-tooltip') || '').trim();
      const ht = (el.getAttribute('data-harvest-text') || 'Sklidit').trim();
      if (tip && tip === ht) mode = 'harvest';
      else if (/zasa[dď]/i.test(tip)) mode = 'plant';
      else mode = 'growing';
    }

    const left = parseFloat(el.getAttribute('time-left'));
    return {
      id: NS.parse.toNum(el.getAttribute('slot')),
      mode,
      left: Number.isFinite(left) ? Math.max(0, Math.round(left)) : 0,
      tip: el.getAttribute('data-tooltip') || null
    };
  }

  /** Přehled všech polí. Vrací `null`, když v DOM žádná nejsou (mapa zavřená). */
  function read() {
    const pole = slots().map(stavSlotu).filter(p => p.id != null)
      .sort((a, b) => a.id - b.id);
    if (!pole.length) return null;

    const harvest = pole.filter(p => p.mode === 'harvest');
    const plant = pole.filter(p => p.mode === 'plant');
    const growing = pole.filter(p => p.mode === 'growing');
    const casy = growing.map(p => p.left).filter(x => x > 0);

    return {
      pole, harvest, plant, growing,
      celkem: pole.length,
      nejblizsi: casy.length ? Math.min(...casy) : null
    };
  }

  /** „maximálně 17 zahrad“ z odmítnutí hrou – jediný zdroj limitu, jaký je. */
  const LIMIT_RE = /maxim[áa]ln[ěe]\s*(\d+)\s*zahrad/i;

  /** Osetá zahrada = rostoucí i vzrostlá. Prázdná se do limitu nepočítá. */
  const osete = s => s.growing.length + s.harvest.length;

  /**
   * Kolik prázdných polí se ještě smí osít. Dokud limit neznáme, povolí se jedno –
   * když ho hra odmítne, limit se z hlášky uloží a víc se to nezkouší.
   */
  function volno(s) {
    const limit = NS.store.get().read.farmLimit;
    if (!limit) return Math.min(s.plant.length, 1);
    return Math.max(0, Math.min(s.plant.length, limit - osete(s)));
  }

  /** Kolik POLÍ ještě unese energie (bez rezervy – ta platí jen pro trénink). */
  function unese(mode) {
    const en = NS.gym.readEnergy();
    if (en == null) return null;
    return Math.max(0, Math.floor(en / CENA[mode]));
  }

  /**
   * Spodní hranice energie, kterou si pole drží proti automatickému tréninku.
   * Nula, když je automatika polí vypnutá nebo pole nic nepotřebují – jinak by
   * rezerva blokovala trénink zbytečně.
   */
  function energyReserve() {
    const cfg = NS.store.get().read;
    if (cfg.farmAuto !== true || cfg.autoPaused === true) return 0;
    const s = read();
    // prázdná pole nad limitem se nepočítají – rezerva by držela energii pro nic
    if (!s || (!s.harvest.length && !volno(s))) return 0;
    return Math.max(0, Math.min(99, cfg.farmReservePct ?? 25));
  }

  /* ---- akce --------------------------------------------------------------- */

  /**
   * Text chybové hlášky hry. `notification-box error` je vlastní okno pro
   * odmítnutí; hledá se i mezi skrytými, protože hra ho zavírá animací a než na
   * něj přijde řada, `offsetParent` už může být pryč.
   */
  function chybaHry() {
    for (const el of document.querySelectorAll('.notification-box.error, .notification-box.active')) {
      if (el.closest('#cmc-gym-bar')) continue;
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (t && !/^(Ano|Ne)( Ne)?$/.test(t)) return t;
    }
    return null;
  }

  /** Klikací plocha pole. */
  const plocha = id => document.querySelector('path[type="farm"][data-sl="' + id + '"]');

  /**
   * Jedna akce na jednom poli – přesně to, co udělá tvůj klik do mapy. Čeká, až
   * se stav slotu SKUTEČNĚ změní; když se nezmění, hra akci odmítla a dávka se
   * zastaví (typicky nedostatek energie).
   */
  async function act(id) {
    const el = document.querySelector('.farm-slot[slot="' + id + '"]');
    if (!el) throw new Error('pole ' + id + ' není v mapě – otevři mapu hry');
    const p = plocha(id);
    if (!p) throw new Error('pole ' + id + ': klikací plocha v mapě chybí');

    const pred = stavSlotu(el).mode;
    const max = NS.gym.readEnergyMax();
    const chybaPred = chybaHry();

    // `path` je SVG, takže žádné .click() – herní handler čeká na click event
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    for (let i = 0; i < 12; i++) {
      await sleep(150);
      const nyni = stavSlotu(el).mode;
      if (nyni !== pred) {
        // HUD hra přepisuje až po minutách, tak se energie odečte i lokálně
        NS.gym.bump(document.querySelector('.value.renew-energy'), -KLIK);
        NS.gym.syncEnergyBar(max);
        return nyni;
      }
      /*
       * Odmítnutí se pozná dřív než po vypršení čekání – a hlavně se z něj dá
       * vyčíst limit zahrad, který jinde ve hře k dispozici není.
       */
      const chyba = chybaHry();
      if (chyba && chyba !== chybaPred) {
        const m = chyba.match(LIMIT_RE);
        if (m) await NS.store.patch('read', { farmLimit: +m[1] });
        throw new Error(chyba);
      }
    }
    throw new Error('pole ' + id + ': hra nereagovala (nejspíš nedostatek energie)');
  }

  /**
   * Obslouží jedno vzrostlé pole: sklidí a HNED zasadí zpátky. Kdyby druhý klik
   * selhal, pole zůstane prázdné – proto se do toho nepouští bez energie na
   * obojí a případné selhání se hlásí, ne zamlčí.
   */
  async function cycleOne(id) {
    const po = await act(id);
    if (po !== 'plant') return 'sklizeno';    // hra dala jiný stav, než se čekalo
    await sleep(PAUZA);
    await act(id);
    return 'obslouzeno';
  }

  /**
   * Dávka. Zastaví se na energii, na vězení, na stropu nebo na prvním odmítnutí
   * hrou – nikdy nejede „na slepo“. U vzrostlých polí je jednou položkou celé
   * sklidit+zasadit, tedy 6 energie.
   */
  async function runBatch(mode, onStatus) {
    const s = read();
    if (!s) throw new Error('pole nejsou v mapě – otevři mapu hry');
    /*
     * U sázení se seznam krátí limitem osetých zahrad – jinak by se klikalo do
     * polí, která hra odmítne, a na každé z nich by vyskočilo chybové okno.
     */
    const seznam = mode === 'harvest' ? s.harvest : s.plant.slice(0, volno(s));
    if (!seznam.length) {
      const limit = NS.store.get().read.farmLimit;
      return {
        hotovo: 0,
        duvod: mode === 'plant' && s.plant.length && limit
          ? 'limit ' + limit + ' osetých zahrad'
          : 'není co dělat',
        nedotazeno: 0
      };
    }

    let hotovo = 0;
    let nedotazeno = 0;      // sklizeno, ale nezaseto – smí se stát jen při chybě
    let duvod = null;
    for (const p of seznam) {
      if (hotovo >= STROP) { duvod = 'strop dávky ' + STROP; break; }
      if (NS.jail && NS.jail.blocked()) { duvod = 'vězení'; break; }
      const en = NS.gym.readEnergy();
      // na půl pole se nezačíná: buď je energie na sklizeň i zasazení, nebo nic
      if (en != null && en < CENA[mode]) { duvod = 'energie ' + NS.fmt.num(en); break; }
      if (onStatus) onStatus(hotovo + 1, seznam.length);
      try {
        if (mode === 'harvest') {
          const vysledek = await cycleOne(p.id);
          if (vysledek !== 'obslouzeno') nedotazeno++;
        } else {
          await act(p.id);
        }
      } catch (e) {
        duvod = e.message;
        break;
      }
      hotovo++;
      await sleep(PAUZA);
    }
    if (nedotazeno) {
      duvod = (duvod ? duvod + ', ' : '') + nedotazeno + '× zůstalo nezaseto';
    }
    return { hotovo, duvod, nedotazeno };
  }

  /* ---- automatika --------------------------------------------------------- */

  let autoBusy = false;
  let dueAt = 0;

  const autoSet = () => NS.store.get().read.farmAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;

  /**
   * Jedno kolo: nejdřív dozasadit prázdná pole (3 energie), potom obsluhovat
   * vzrostlá (sklidit + zasadit, 6 energie). Prázdná mají přednost schválně –
   * jsou levnější a rozjezd trvá 2,5 h, zatímco vzrostlá zelenina na poli čeká,
   * jak dlouho chce. Po kole tak nezůstane žádné pole ležet prázdné.
   */
  async function autoRound() {
    if (autoBusy || !autoOn()) return 0;
    if (NS.jail && NS.jail.blocked()) return 0;
    if (Date.now() < dueAt) return 0;

    const s = read();
    if (!s) { dueAt = Date.now() + 60 * 1000; return 0; }
    if (!volno(s) && !s.harvest.length) {
      // nic k obsloužení: příští kolo až s nejbližším dozráním (+3 s)
      dueAt = Date.now() + (s.nejblizsi != null
        ? Math.min(s.nejblizsi * 1000 + 3000, 15 * 60 * 1000)
        : 5 * 60 * 1000);
      return 0;
    }

    autoBusy = true;
    let celkem = 0;
    const casti = [];
    try {
      await NS.gym.withSuspend(async () => {
        for (const mode of ['plant', 'harvest']) {
          if (!autoOn()) break;
          const r = await runBatch(mode, (i, z) =>
            NS.gym.setStatus('auto zahrady: ' + (mode === 'plant' ? 'sázím ' : 'sklízím ')
              + i + '/' + z + '…'));
          celkem += r.hotovo;
          if (r.hotovo) {
            casti.push((mode === 'plant' ? 'zasazeno ' : 'sklizeno a zasazeno ')
              + r.hotovo + '×');
          }
          /*
           * Energie ani vězení nepustí druhou polovinu, ale limit zahrad ano:
           * ten sázení jen zakazuje, sklizeň se zasazením zpátky je na něm
           * nezávislá (uvolní místo a hned ho zaplní).
           */
          if (r.duvod && !/není co dělat|limit \d+ osetých/.test(r.duvod)) {
            casti.push('(' + r.duvod + ')');
            break;
          }
        }
      });

      const po = read();
      /*
       * Když energie nestačila, nemá smysl čekat na dozrání – zkusí se to znovu
       * za pět minut, až se energie obnoví.
       */
      const hotovoVse = po && !volno(po) && !po.harvest.length;
      dueAt = Date.now() + (hotovoVse && po.nejblizsi != null
        ? Math.min(po.nejblizsi * 1000 + 3000, 15 * 60 * 1000)
        : 5 * 60 * 1000);

      if (celkem) {
        NS.gym.setStatus('auto zahrady: ' + casti.join(', ')
          + ' → ' + NS.fmt.num(celkem * VYNOS_KG) + ' kg');
      }
      return celkem;
    } catch (e) {
      dueAt = Date.now() + 60 * 1000;
      NS.gym.setStatus('⚠ auto zahrady: ' + e.message, true);
      return celkem;
    } finally {
      autoBusy = false;
    }
  }

  /* ---- lišta -------------------------------------------------------------- */

  /** Souhrn do tooltipu – ať je vidět, na čem to stojí. */
  function popis(s) {
    const limit = NS.store.get().read.farmLimit;
    const casti = [s.celkem + '× pole'
      + (limit ? ', oseto ' + osete(s) + '/' + limit : '')];
    if (s.harvest.length) casti.push('ke sklizni ' + s.harvest.length);
    if (s.plant.length) casti.push('k zasazení ' + s.plant.length);
    if (s.growing.length) {
      casti.push('roste ' + s.growing.length
        + (s.nejblizsi != null && NS.fleet
          ? ' (první za ' + NS.fleet.etaText(s.nejblizsi) + ')' : ''));
    }
    return casti.join(', ');
  }

  /**
   * Dvě tlačítka, ne dvacet. Pole jsou vzájemně nerozlišitelná (všechna dávají
   * 300 kg za 2,5 h), takže jediné, co se u nich rozhoduje, je „kolik“ – a to
   * stejně určuje energie, ne který slot.
   */
  function buttons(onChange) {
    const s = read();
    if (!s) return null;

    const limit = NS.store.get().read.farmLimit;
    const lze = volno(s);
    const DRUHY = [
      { mode: 'harvest', ikona: '🌾', pocet: s.harvest.length,
        slovo: 'Sklidit a hned zasadit', kratce: 'sklidit a zasadit',
        cls: 'cmc-gym-unit-ready' },
      /*
       * Na tlačítku je počet, který SKUTEČNĚ jde zasadit – ne počet prázdných
       * polí. Nad limitem osetých zahrad hra osetí odmítne s chybovým oknem, a
       * tlačítko slibující 3 pole, z nichž nejde ani jedno, je horší než nic.
       */
      { mode: 'plant', ikona: '🌱', pocet: lze, prazdna: s.plant.length,
        slovo: 'Zasadit', kratce: 'zasadit',
        cls: 'cmc-gym-unit-send' }
    ];

    return DRUHY.map(d => {
      const kolik = unese(d.mode);
      const zvladne = kolik == null ? d.pocet : Math.min(d.pocet, kolik);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-gym-farm '
        + (d.pocet && zvladne ? d.cls : 'cmc-gym-unit-away');
      b.textContent = d.ikona + ' ' + d.pocet;
      b.disabled = !d.pocet || !zvladne;
      b.title = (d.pocet
        ? d.slovo + ': ' + zvladne + ' z ' + d.pocet + ' polí'
          + ' (energie stačí na ' + (kolik == null ? '?' : kolik) + ', '
          + CENA[d.mode] + ' za pole'
          + (d.mode === 'harvest' ? ' – 3 sklizeň + 3 zasazení' : '') + ')'
          + (zvladne < d.pocet ? ' – na zbytek energie nemáš' : '')
          + (d.mode === 'harvest'
            ? ', výnos ' + NS.fmt.num(zvladne * VYNOS_KG) + ' kg zeleniny a pole běží dál'
            : ', za 2,5 h ' + NS.fmt.num(zvladne * VYNOS_KG) + ' kg')
        : d.mode === 'plant' && d.prazdna && limit
          ? 'Zasadit nejde: hra dovolí osít jen ' + limit + ' zahrad a máš oseto '
            + osete(s) + '. Ta ' + d.prazdna + ' prázdná se uvolní až s úrovní'
            + ' – sklizeň se zasazením zpátky ale projde vždy, protože místo'
            + ' uvolní a hned zaplní.'
          : 'Teď není co ' + d.kratce)
        + '. ' + popis(s);

      if (!b.disabled) {
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          b.disabled = true;
          try {
            const r = await NS.gym.withSuspend(() => runBatch(d.mode, (i, z) =>
              NS.gym.setStatus('zahrady: ' + d.kratce + ' ' + i + '/' + z + '…')));
            setTimeout(() => {
              onChange();
              NS.gym.setStatus('zahrady: ' + d.kratce + ' ' + r.hotovo + '×'
                + (r.hotovo && d.mode === 'harvest'
                  ? ' → ' + NS.fmt.num(r.hotovo * VYNOS_KG) + ' kg' : '')
                + (r.duvod ? ' (' + r.duvod + ')' : ''),
                (!r.hotovo && !!r.duvod) || !!r.nedotazeno);
            }, 300);
          } catch (e) {
            NS.gym.setStatus('⚠ zahrady: ' + e.message, true);
            onChange();
          }
        });
      }
      return b;
    });
  }

  /** Zaškrtávátko automatiky. */
  function autoBox(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const rezerva = Math.max(0, Math.min(99, NS.store.get().read.farmReservePct ?? 25));

    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává zapnutá. ' : '')
      + 'Automatická sklizeň se ZASAZENÍM zpátky – pole se nikdy nenechá ležet'
      + ' prázdné, takže jedno pole stojí vždy 6 energie (3 + 3).'
      + ' Nejdřív se dozasadí prázdná pole (těch 3), pak se obsluhují vzrostlá.'
      + ' Do pole se nezačne, když na obě poloviny nestačí energie, takže dávka'
      + ' vždycky skončí na energii a zbytek dojede v dalším kole.'
      + ' Dokud je co dělat, drží se energie nad ' + rezerva + ' % i proti'
      + ' automatickému tréninku – jinak by na pole nikdy nic nezbylo.';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = zapnuto;
    cb.addEventListener('change', async () => {
      await NS.store.patch('read', { farmAuto: cb.checked });
      dueAt = 0;
      onChange();
    });
    const txt = document.createElement('span');
    txt.textContent = zapnuto && pozastaveno ? 'auto ⏸' : 'auto';
    wrap.append(cb, txt);
    return wrap;
  }

  NS.farm = {
    read, buttons, autoBox, autoRound, act, cycleOne, runBatch, energyReserve, unese, autoSet,
    stavSlotu, plocha, chybaHry, osete, volno, CENA, KLIK, VYNOS_KG, RUST_SEC, LIMIT_RE,
    resetTimer() { dueAt = 0; }
  };
})();
