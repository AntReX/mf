/* =============================================================================
 * captcha.js – hra se ptá, jestli jsi člověk: automatika OKAMŽITĚ stojí
 *
 * !!! TENHLE MODUL S CAPTCHOU NIKDY NEINTERAGUJE !!!
 * Nevyplňuje ji, neřeší, nezavírá, neklika do ní a NEOBNOVUJE stránku, aby
 * zmizela. Dělá jedinou věc: pozná ji, zastaví veškerou automatiku a předá
 * řízení člověku. Obcházení kontroly proti botům do tohohle rozšíření nepatří.
 *
 * !!! ODKUD SE TO VZALO !!!
 * Uživatel hlásil, že „karta celé hry je kompletně šedivá/černá a nic tam není“
 * a že musí obnovit stránku – nejčastěji, když byl na jiné kartě. Příčina je
 * v CSS hry:
 *
 *   .captcha-modal.active { background: rgba(0, 0, 0, 0.75); z-index: 1020; }
 *
 * Modal má `width: 100%` a `max-width: 100%`, takže překryje celou stránku 75%
 * černou. Obsah se do něj dosazuje až při spuštění, takže dokud se nenačte
 * (nebo se nenačte vůbec), je vidět jen ta tmavá plocha – tedy „nic tam není“.
 *
 * `display` je u `.modal-box` VŽDY `flex` a otevřenost se pozná PŘIDANOU třídou
 * `active` (stejná past jako u `.confirm-modal` v bank.js, kde detekce podle
 * `display` znamenala, že se nepřevedlo ani jednou).
 *
 * !!! AUTOMATIKA SE NEROZJEDE SAMA !!!
 * Zapne se hlavní pauza, takže po vyřešení musí uživatel automatiku spustit
 * ručně. Je to schválně: hra právě dala najevo, že provoz vypadá jako robot.
 * Kdyby se to samo rozjelo dál, spustí se kontrola znovu – a to je přesně to,
 * čemu se chceme vyhnout.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /**
   * Je kontrola na obrazovce? Řídí se to třídou `active`, ne `display` –
   * `display` je u modalů hry vždycky `flex`.
   */
  function jeVidet() {
    for (const el of document.querySelectorAll('.captcha-modal')) {
      if (el.classList.contains('active')) return el;
    }
    return null;
  }

  const blokuje = () => !!jeVidet();

  /*
   * Pauza se zapíná jen JEDNOU za výskyt, ne při každém tiku – jinak by se
   * uživateli přepínala pod rukama, kdykoli by ji chtěl pustit zpátky.
   */
  let ohlaseno = false;

  /**
   * Zavolá se z tiku lišty. Vrací `true`, když se nemá dělat nic dalšího.
   * Sama nikdy do captchy neklikne ani neobnoví stránku.
   */
  async function hlidej() {
    if (!blokuje()) { ohlaseno = false; return false; }

    if (NS.gym && NS.gym.setStatus) {
      NS.gym.setStatus('⛔ hra zobrazila kontrolu „jsi člověk?“ – automatika stojí.'
        + ' Vyřeš ji prosím sám v okně hry; rozšíření do ní záměrně nesahá.'
        + ' Pak pusť automatiku ručně tlačítkem ⏸/▶.', true);
    }
    if (NS.queue) NS.queue.clear();

    /*
     * !!! ZÁPIS PRO BACKGROUND !!!
     * Noční obnovování řídí `background.js` a ten se karty ptá, jestli se smí
     * obnovit. U ZASEKNUTÉ karty ale žádná odpověď nepřijde, takže by mu captcha
     * unikla a obnovením by ji smazal – tedy obešel kontrolu proti botům. Proto
     * se výskyt zapisuje do storage, odkud si ho background přečte sám.
     * (Zaseknutá karta captchu vykreslit neumí, takže je to spíš pojistka –
     * mít ji ale musí, protože na téhle úvaze nesmí nic záležet.)
     */
    try { await NS.store.put('captchaAt', Date.now()); } catch (e) { /* sirotek */ }

    if (!ohlaseno) {
      ohlaseno = true;
      try {
        // hlavní pauza, ať se to po vyřešení nerozjede samo (viz hlavička)
        if (NS.store.get().read.autoPaused !== true) {
          await NS.store.patch('read', { autoPaused: true });
          if (NS.gym && NS.gym.collect) NS.gym.collect();
        }
      } catch (e) { /* sirotek po reloadu rozšíření – aspoň se nekliká */ }
    }
    return true;
  }

  NS.captcha = { jeVidet, blokuje, hlidej };
})();
