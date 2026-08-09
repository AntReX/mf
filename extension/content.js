/* =============================================================================
 * CzechMafie Companion – content script (bootstrap)
 *
 * !!! TENHLE POPIS BYL DLOUHO ŠPATNĚ !!!
 * Stálo tu „rozšíření je READ-ONLY, neposílá do hry žádnou akci“. To platilo pro
 * verzi 0.2; od té doby se sem přidaly automatiky a hlavička se neopravila –
 * takže soubor tvrdil pravý opak toho, co kód dělá.
 *
 * Co rozšíření DĚLÁ:
 *   1. čte stav budov přes GET (stejné adresy, jaké otevřeš v prohlížeči),
 *   2. počítá ekonomiku, historii a evidenci předmětů,
 *   3. KLIKÁ – výrobny, banka, kasino (automat/blackjack/poker), letadla a lodě,
 *      šachty, zločiny, vylepšování budov, útoky na neaktivní hráče.
 *
 * Kliká se na SKUTEČNÁ tlačítka hry: fragment budovy se vloží do herního okna
 * a klikne se na jeho prvek. Přímé POSTy hra na většině adres odmítá
 * („Spausk per mygtuką, o ne per nuorodą!“).
 *
 * Nic z toho není zapnuté samo – každá automatika má svoje zaškrtávátko a nad
 * nimi je hlavní vypínač ⏸. Do kontroly „jsi člověk?“ se nesahá: pozná se,
 * automatika se zastaví a řízení má člověk (viz captcha.js).
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
