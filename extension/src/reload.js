/* =============================================================================
 * reload.js – strana STRÁNKY u nočního obnovování; rozvrh drží background
 *
 * Hra po delší době přestane reagovat (černá obrazovka, nic se nemaluje)
 * a obnovení stránky to spraví – jenže v noci u toho nikdo nesedí.
 *
 * !!! ROZVRH TADY BÝT NESMÍ !!!
 * Původně to byl `setInterval` v tomhle modulu a mělo to dvě vady, které uhodí
 * právě tehdy, kdy je funkce potřeba:
 *
 *   1. Chrome v kartě NA POZADÍ časovače brzdí a po delší nečinnosti kartu
 *      zmrazí. Přes noc je karta na pozadí celou dobu, takže se obnovení
 *      nemuselo spustit ani jednou.
 *   2. Když JavaScript stránky stojí, `location.reload()` z téhle stránky nikdy
 *      nedojde k vykonání. Lék byl uvnitř pacienta.
 *
 * Rozvrh proto vlastní `background.js` (`chrome.alarms` + `chrome.tabs.reload`).
 * Tenhle modul dělá tři věci:
 *
 *   – zaškrtávátko a popisek v liště (odpočet čte z rozvrhu v storage)
 *   – ODPOVÍ backgroundu na dotaz „smí se obnovit?“
 *   – na jeho pokyn udělá odpočet a obnoví se sám
 *
 * Ten odpočet je jediný důvod, proč obnovení nedělá background rovnou: bez
 * hlášky vypadá obnovení jako pád stránky a člověk hledá chybu, která není.
 * Když se karta neozve nebo slib nesplní, background ji obnoví zvenčí – slib se
 * nepočítá, výsledek ano.
 *
 * !!! OSIŘELÝ SKRIPT SE UŽ NEŘEŠÍ TADY !!!
 * Po reloadu rozšíření nemá odpojený skript `chrome.*`, takže na dotaz
 * backgroundu neodpoví – a ten ho podle mlčení obnoví zvenčí. Vyšlo to lépe než
 * předchozí obcházka s pamatováním nastavení: sirotek se teď spraví sám.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /**
   * Kolik sekund se před obnovením napíše do lišty. Není to zdvořilost: bez
   * toho vypadá obnovení jako pád stránky.
   */
  const VAROVANI_S = 5;

  const zapnuto = () => NS.store.get().read.reloadAuto === true;

  let obnovuje = false;

  /**
   * Je bezpečné obnovit? Rozdělaná akce má vždycky přednost – termín počká.
   * Fronta se kontroluje na obojí: `busy` je právě běžící akce, `length` jsou
   * ty, které na ni čekají.
   *
   * !!! A NIKDY, KDYŽ HRA ZOBRAZILA KONTROLU „JSI ČLOVĚK?“ !!!
   * Obnovením by captcha zmizela, tedy by se obcházela kontrola proti botům.
   * Zrovna tady na to musí být výslovná podmínka: ta tmavá prázdná stránka,
   * kterou captcha vyrobí, je přesně stav, kdy člověk sáhne po F5.
   */
  function bezpecne() {
    if (NS.captcha && NS.captcha.blokuje()) return false;
    const q = NS.queue;
    if (!q) return true;
    return !q.busy && q.length === 0;
  }

  /** Proč to nejde – jde do rozhodování backgroundu i do logu. */
  function duvod() {
    if (NS.captcha && NS.captcha.blokuje()) return 'hra zobrazila kontrolu „jsi člověk?“';
    const q = NS.queue;
    if (q && q.busy) return 'právě běží akce';
    if (q && q.length) return 've frontě čekají akce';
    return null;
  }

  /** Odpočet a pak obnovení. Do lišty se to napíše, ať to není překvapení. */
  async function proved() {
    if (obnovuje) return false;
    obnovuje = true;
    try {
      for (let s = VAROVANI_S; s > 0; s--) {
        if (NS.gym && NS.gym.setStatus) {
          NS.gym.setStatus('⟳ obnovuji stránku za ' + s + ' s – noční obnovování'
            + ' je zapnuté v liště.');
        }
        await new Promise(r => setTimeout(r, 1000));
        // kdyby se mezitím něco rozjelo, ustoupit – background to zkusí znovu
        if (!bezpecne()) return false;
      }
      /*
       * Zámek se pouští sám v `pagehide` (queue.js), takže se o něj tady nikdo
       * starat nemusí – jiná karta ho může vzít hned.
       */
      location.reload();
      return true;
    } finally {
      obnovuje = false;
    }
  }

  /* ---- komunikace s backgroundem ------------------------------------------- */

  function start() {
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener((m, odesilatel, odpovez) => {
      if (!m || !m.cmc) return undefined;
      if (m.cmc === 'zdravi') {
        /*
         * Že tahle odpověď vůbec přijde, je pro background informace sama o sobě:
         * mlčení znamená zaseknutou stránku a ta se obnoví zvenčí.
         */
        odpovez({ ok: bezpecne(), duvod: duvod(), zapnuto: zapnuto() });
        return undefined;
      }
      if (m.cmc === 'obnov') {
        proved().catch(() => {});
        odpovez({ prijato: true });
        return undefined;
      }
      return undefined;
    });
  }

  /* ---- zaškrtávátko do lišty ------------------------------------------------ */

  /** Kolik sekund zbývá podle rozvrhu backgroundu; `null`, když se neplánuje. */
  function zbyva() {
    const plan = NS.store.get().reloadPlan;
    if (!plan) return null;
    let nejblizsi = null;
    for (const k of Object.keys(plan)) {
      const t = plan[k] && plan[k].do;
      if (!t) continue;
      if (nejblizsi == null || t < nejblizsi) nejblizsi = t;
    }
    if (nejblizsi == null) return null;
    return Math.max(0, Math.round((nejblizsi - Date.now()) / 1000));
  }

  /**
   * Patří k ovládání v pravém horním koutu, ne k automatikám – je to vlastnost
   * KARTY, ne herní akce, stejně jako „hraje tady“. A hlavně je tam vidět vždycky:
   * sloupec fronty se schovává, když neběží žádná automatika.
   */
  function box(onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-reload';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto();
    inp.addEventListener('change', async () => {
      await NS.store.patch('read', { reloadAuto: inp.checked });
      if (onChange) onChange();
    });
    wrap.appendChild(inp);

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = '⟳';
    wrap.appendChild(txt);

    wrap.classList.toggle('cmc-gym-reload-on', inp.checked);
    wrap.title = popis();
    return wrap;
  }

  function popis() {
    if (!zapnuto()) {
      return 'Noční obnovování stránky je VYPNUTÉ. Když ho zapneš, stránka se'
        + ' sama obnoví každých 30–60 minut (prodleva se losuje). Hra po delší'
        + ' době přestane reagovat – černá obrazovka, nic se nemaluje – a obnovení'
        + ' to spraví. Rozvrh drží rozšíření mimo stránku, takže funguje i tehdy,'
        + ' když je karta na pozadí nebo když v ní JavaScript stojí.';
    }
    const z = zbyva();
    return 'Noční obnovování je ZAPNUTÉ'
      + (z != null ? ': nejbližší obnovení za ' + NS.fmt.dur(z) : '')
      + '. Nikdy uprostřed rozdělané akce – čeká se, až je fronta prázdná.'
      + ' Když se karta neozve (zaseknutý JavaScript), obnoví ji rozšíření zvenčí.';
  }

  NS.reload = { box, popis, start, proved, bezpecne, duvod, zbyva, zapnuto,
    VAROVANI_S };
})();
