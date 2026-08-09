/* =============================================================================
 * main-world.js – JEDINÝ kousek rozšíření, který běží v HLAVNÍM světě stránky
 *
 * Zbytek rozšíření je v izolovaném světě: vidí DOM, ale ne proměnné hry. To
 * obvykle nevadí (klika se na skutečná tlačítka a stav se čte z DOM), ale
 * blackjack v kasinu #18 na tom padá:
 *
 *   window.blackjack_currentBet = 0; window.blackjack_isBusy = false;
 *   window.blackjackUpdateUI();
 *
 * Tenhle inline skript je uvnitř fragmentu budovy a `innerHTML` ho nespustí.
 * Bez těch proměnných hra o sázce neví, „HRÁT“ zůstane `disabled` a nedá se
 * ani začít. Pokus vyrobit `<script>` znovu a nechat ho proběhnout se
 * NEOSVĚDČIL – v ostrém provozu se sázka pořád nezapočítala (log to ukázal
 * jasně: „oživení skriptu=2“ a hned „vsazeno … vidiHra=0“).
 *
 * Deklarovaný skript v `world: "MAIN"` je proti tomu spolehlivý: není inline,
 * neřeší ho CSP stránky a spustí se vždy. Komunikuje se zbytkem rozšíření
 * přes DOM události, protože to je jediný kanál, který mají oba světy společný.
 *
 * Totéž platí pro poker v téže budově (`poker_ante`, `poker_isBusy`).
 *
 * !!! NIC TU NEKLIKÁ A NIC NEPOSÍLÁ DO HRY !!!
 * Jen nastaví proměnné, které si hra sama inicializuje ve svém fragmentu,
 * a zavolá její vlastní `blackjackUpdateUI()`. Žádná herní logika se tu
 * neobchází – kliká se pořád na skutečná tlačítka z izolovaného světa.
 * ===========================================================================*/

(() => {
  'use strict';

  const DOTAZ = 'cmc-main-req';
  const ODPOVED = 'cmc-main-res';

  function odpovez(id, data) {
    document.dispatchEvent(new CustomEvent(ODPOVED, { detail: { id, ...data } }));
  }

  const UKOLY = {
    /**
     * Inicializace blackjacku – přesně to, co dělá inline skript ve fragmentu.
     * Vrací i hodnoty, aby druhá strana viděla, že se to opravdu povedlo.
     */
    'bj-init'() {
      window.blackjack_currentBet = 0;
      window.blackjack_isBusy = false;
      if (typeof window.blackjackUpdateUI === 'function') window.blackjackUpdateUI();
      return {
        bet: window.blackjack_currentBet,
        busy: window.blackjack_isBusy,
        maUpdateUI: typeof window.blackjackUpdateUI === 'function'
      };
    },

    /** Kolik hra právě eviduje jako sázku – kontrola pro diagnostiku. */
    'bj-stav'() {
      return {
        bet: window.blackjack_currentBet,
        busy: window.blackjack_isBusy
      };
    },

    /** Uvolní zaseknutý příznak, kdyby hra zůstala „zaneprázdněná“. */
    'bj-unlock'() {
      window.blackjack_isBusy = false;
      return { busy: window.blackjack_isBusy };
    },

    /*
     * Poker (#18) má stejnou past jako blackjack: sázku (`poker_ante`) drží
     * proměnná hlavního světa a inicializuje ji inline skript ve fragmentu.
     */
    'pk-init'() {
      window.poker_ante = 0;
      window.poker_isBusy = false;
      return { ante: window.poker_ante, busy: window.poker_isBusy };
    },

    'pk-stav'() {
      return { ante: window.poker_ante, busy: window.poker_isBusy };
    },

    'pk-unlock'() {
      window.poker_isBusy = false;
      return { busy: window.poker_isBusy };
    }
  };

  document.addEventListener(DOTAZ, ev => {
    const d = (ev && ev.detail) || {};
    const ukol = UKOLY[d.co];
    if (!ukol) {
      odpovez(d.id, { ok: false, err: 'neznámý úkol ' + d.co });
      return;
    }
    try {
      odpovez(d.id, { ok: true, ...ukol(d) });
    } catch (e) {
      odpovez(d.id, { ok: false, err: String((e && e.message) || e) });
    }
  });

  // ať je z izolovaného světa poznat, že tenhle skript vůbec běží
  document.documentElement.setAttribute('data-cmc-main', '1');
})();
