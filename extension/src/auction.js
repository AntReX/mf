/* =============================================================================
 * auction.js – pomocník pro vyplnění sázky v aukci (budova #2)
 *
 * !!! HRANICE !!!
 * Tohle je jediné místo, kde rozšíření něco ZAPISUJE do stránky hry – vloží
 * číslo do pole „Tvá sázka?“. Nic neposílá: na tlačítko „Nabídnout cenu“
 * (`.bidAuction`) se nikdy nesahá, odeslání i rozhodnutí zůstává na hráči.
 * Kdyby se to mělo změnit, byla by to už automatizace, a tu tenhle nástroj
 * záměrně nedělá.
 *
 * Struktura položky ve hře:
 *   .static-inv.holder
 *     .auction-price .sum .pretty-points-value  → "17 000 000Kč" (špinavé peníze)
 *     input[name="amount"]                      → pole pro sázku
 *     [action=…/bidAuction] .bidAuction         → odeslání (NESAHAT)
 *
 * Minimální příhoz hra nikde neuvádí; z pravidel („předmět získá ten, kdo vsadí
 * nejvíc“) plyne, že stačí o korunu víc – proto tlačítko +1 Kč. Procenta jsou
 * pro případ, že chceš mít rezervu proti dalšímu přihazujícímu.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const ITEM = '.static-inv.holder';
  const PRICE = '.auction-price .sum';
  const INPUT = 'input[name="amount"]';
  const MARK = 'cmcFillReady';          // aby se lišta nepřidávala dvakrát

  /** Aktuální nejvyšší sázka u položky. */
  function currentBid(item) {
    const el = item.querySelector(PRICE);
    if (!el) return null;
    // částka může být zkrácená („3.4 mld“), proto se bere i zkratka
    return NS.parse.toNum((el.textContent.match(/\d[\d\s .,]*(?:\s*(?:trln|bil|mld|mrd|mil\.?|tis\.?)|\s*[KMBT](?![\wá-žÁ-Ž]))?/i) || [])[0]);
  }

  /** Vloží hodnotu do pole a řekne stránce, že se změnilo. Nic neodesílá. */
  function fill(input, value) {
    input.value = String(Math.round(value * 100) / 100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  function button(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmc-bid-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();       // ať klik nespustí nic v UI hry
      onClick();
    });
    return b;
  }

  /** Přidá k jedné položce lištu s nabídkami hodnot. */
  function decorate(item) {
    if (item.dataset[MARK]) return;
    const input = item.querySelector(INPUT);
    const bid = currentBid(item);
    if (!input || bid == null) return;
    item.dataset[MARK] = '1';

    const bar = document.createElement('div');
    bar.className = 'cmc-bid-bar';

    const F = NS.fmt;
    bar.appendChild(document.createTextNode('vložit:'));
    bar.appendChild(button(F.num(bid), 'stejná částka jako nejvyšší sázka (' + F.kc(bid) + ')',
      () => fill(input, bid)));
    bar.appendChild(button('+1', 'minimální přebití – o korunu víc', () => fill(input, bid + 1)));
    bar.appendChild(button('+1 %', '+1 % (' + F.kc(bid * 1.01) + ')', () => fill(input, bid * 1.01)));
    bar.appendChild(button('+5 %', '+5 % (' + F.kc(bid * 1.05) + ')', () => fill(input, bid * 1.05)));

    // lišta patří k poli, ne k tlačítku odeslání
    const holder = input.parentElement || item;
    holder.insertBefore(bar, input.nextSibling);
  }

  function scan() {
    if (!NS.store.get().read.auctionFill) return;
    for (const item of document.querySelectorAll(ITEM)) {
      try {
        decorate(item);
      } catch (e) {
        console.warn('[CMC] aukce', e.message);
      }
    }
  }

  /**
   * Aukce se sama přenačítá (odpočty, „Načítání“), takže se lišty musí doplnit
   * i po výměně DOM. Observer je omezený na tělo dokumentu a jen doplňuje.
   */
  /**
   * Observer se zapíná vždy – aukci obvykle otevřeš klikem na mapě, tedy až po
   * načtení stránky, takže při startu tu ještě žádná položka být nemusí.
   */
  function start() {
    scan();
    const obs = new MutationObserver(() => {
      clearTimeout(start._t);
      start._t = setTimeout(scan, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  NS.auction = { start, scan, currentBid };
})();
