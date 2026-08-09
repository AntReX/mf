/* =============================================================================
 * CzechMafie Companion – content script (bootstrap)
 *
 * Rozšíření je READ-ONLY. Neposílá do hry žádnou akci: nekliká, nesklízí,
 * nekupuje, nespouští výrobu. Umí jen tři věci:
 *   1. přečíst stav budov přes GET (stejné adresy, jaké otevřeš v prohlížeči),
 *   2. spočítat ekonomiku a historii z toho, co přečetlo,
 *   3. vést tvoji vlastní evidenci předmětů a jejich celkové ceny.
 *
 * Dvě věci zasahují do UI hry, ale ani jedna nic neodesílá:
 *   – v aukci vloží číslo do pole „Tvá sázka?“ (odesíláš ty),
 *   – v posilovně přemístí tréninková tlačítka do lišty dole (klikáš ty).
 *
 * Pořadí načtení souborů určuje manifest.json; sdílí se přes globalThis.CMC.
 * ===========================================================================*/

(async () => {
  'use strict';
  const NS = globalThis.CMC;
  if (!NS || !NS.store) { console.error('[CMC] moduly se nenačetly'); return; }

  await NS.store.load();

  const start = () => {
    NS.panel.build();
    NS.panel.rescheduleAuto();
    NS.auction.start();       // vyplňování sázky v aukci (nic neodesílá)
    NS.gym.start();           // tlačítka posilovny do lišty (jen přemístění)
    NS.uspor.start();         // vypínání nekonečných animací hry (šetří baterii)
    NS.reload.start();        // noční obnovování stránky (zaseknutá hra se rozjede)
    // uložené termíny výroben – bez toho by se po každém reloadu čtly všechny znovu
    NS.vyrobny.nactiPamet();
    // změny z popupu (jiné budovy, jiný interval) se propíšou do panelu
    NS.store.onChange(keys => {
      if (keys.includes('read')) NS.panel.rescheduleAuto();
      NS.panel.render();
    });
    console.log('[CMC] panel připraven (read-only, žádné herní akce)');
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
