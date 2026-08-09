/* =============================================================================
 * jail.js – ve vězení ani v nemocnici automatika neklikne
 *
 * V obou stavech hra akce odmítá. Kdyby automatika jela dál, mlela by naprázdno –
 * v nejlepším případě by jen zahltila hru požadavky, v horším by se o akci
 * pokoušela pořád znovu (uživateli to zacyklilo hru, než to vypnul).
 *
 * !!! HRA TO BERE JAKO JEDEN STAV !!!
 * V hlavičce hry je ikona `.icon.status-med` s popiskem „Hráč je v nemocnici
 * NEBO ve vězení.“ – hra sama ty dva stavy nerozlišuje, takže je nerozlišuje
 * ani tenhle modul. Jméno souboru zůstalo historické.
 *
 * Ta ikona je hlavní znak, protože je to CSS třída, ne text: nezmizí s jazykem
 * ani s přeformulováním hlášky. Texty zůstávají jako záloha pro případ, že by
 * se ikona nevykreslila (a kvůli `inText()`, které kouká do fragmentu budovy,
 * kde hlavička není).
 *
 * Zámek je JEDNOSTRANNÝ – blokuje jen automatické klikání. Tvoje vlastní kliknutí
 * na tlačítka v liště nikdy neblokuje: když se ve vězení dá něco udělat (zaplatit
 * kauci, počkat), je to tvoje rozhodnutí a hra si to pořeší sama.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /*
   * Znaky vězení. Musí být dost specifické, aby to nespustil běžný text hry –
   * proto „ve vězení“ a ne jen „vězení“ (to je i v popisech budov a zločinů),
   * a proto se hledá jen ve VIDITELNÝCH prvcích.
   */
  /**
   * Ikona stavu v hlavičce hry – hlavní a nejspolehlivější znak. Popisek u ní
   * říká „Hráč je v nemocnici nebo ve vězení.“, takže pokrývá oba stavy.
   */
  const IKONA = '.icon.status-med';

  /*
   * !!! JEN DRUHÁ OSOBA – O MNĚ, NE O KOMKOLI !!!
   * Původně tu byl i `/hráč je v nemocnici/`, což je popisek stavové IKONY
   * („Hráč je v nemocnici nebo ve vězení.“). Ten se ale píše u KAŽDÉHO hráče,
   * kterého hra někde vypsala – a kasino (#18) má tabuli „Největší výhry /
   * Poslední výhry“ s cizími jmény:
   *
   *   1 DestroyerX Zlín 3 Hráč je v nemocnici nebo ve vězení. Výhra 1Kč
   *
   * Stačilo, aby byl v nemocnici NĚKDO CIZÍ na té tabuli, a poker se zastavil
   * hláškou „jsi ve vězení“. Přicházelo a odcházelo to podle toho, kdo je právě
   * na tabuli – naživo sedm pokusů v padesáti sekundách a pak samo přestalo.
   * Ještě horší bylo, že totéž platí pro `detect()` nad otevřeným oknem kasina,
   * takže se tím dala zastavit CELÁ automatika.
   *
   * Vlastní stav se pozná jinak a lépe: ikonou `.icon.status-med` v hlavičce
   * (viz `IKONA`), která patří mně. Texty proto smí být jen ty, které hra píše
   * ve druhé osobě.
   */
  const MARKERS = [
    /jsi\s+ve\s+vězení/i,
    // nemocnice – hra o ní mluví takhle
    /ležíš\s+v\s+nemocnici/i,
    /jsi\s+v\s+nemocnici/i,
    /v\s+nemocnici\s+(?:strávíš|budeš|zbývá|ležíš)/i,
    /musíš\s+se\s+(?:vyléčit|uzdravit)/i,
    /jsi\s+ve\s+vazbě/i,
    /ve\s+vězení\s+(?:strávíš|budeš|zbývá)/i,
    /byl\s+jsi\s+(?:zatčen|dopaden|chycen)/i,
    /propuštěn\s+za/i,
    /zaplatit\s+kauci/i,
    /složit\s+kauci/i
  ];

  /** Kontejnery, ve kterých hra takové okno ukazuje. */
  const BOXES = '.modal-box, [class*="jail" i], [class*="prison" i], [class*="alert"],'
    + ' [class*="toast"], [class*="notif"], [class*="msg"], .swal2-container';

  /**
   * Jsi ve vězení? Čte se jen z DOM (žádný požadavek do hry) a jen z viditelných
   * prvků – skryté okno z minulého pokusu by jinak automatiku zablokovalo natrvalo.
   */
  function detect() {
    /*
     * Nejdřív ikona v hlavičce: je to CSS třída, takže nezávisí na jazyku ani
     * na formulaci hlášky. Musí být VIDITELNÁ – hra si prvek nechává v DOM
     * i ve zdravém stavu a jen ho skrývá, takže bez téhle kontroly by
     * automatika stála pořád.
     */
    for (const el of document.querySelectorAll(IKONA)) {
      if (el.closest('#cmc-gym-bar') || el.closest('#cmc-panel')) continue;
      if (el.closest('.cmc-gym-offscreen') || !el.offsetParent) continue;
      const popis = (el.closest('.icon-h') || el).textContent.replace(/\s+/g, ' ').trim();
      return {
        inJail: true,
        text: popis.slice(0, 80) || 'ikona nemocnice/vězení v hlavičce',
        cls: IKONA
      };
    }

    for (const el of document.querySelectorAll(BOXES)) {
      if (el.closest('#cmc-gym-bar') || el.closest('#cmc-panel')) continue;
      if (el.closest('.cmc-gym-offscreen')) continue;   // náš vložený fragment
      if (!el.offsetParent) continue;                    // skryté se nepočítá
      /*
       * Popisky se vynechávají ze stejného důvodu jako v `textOdpovedi()`:
       * v okně kasina visí u cizích jmen na tabuli výher a stav MŮJ neříkají.
       */
      const kopie = el.cloneNode(true);
      kopie.querySelectorAll('.tooltip-i, [class*="tooltip"]').forEach(e => e.remove());
      const t = kopie.textContent.replace(/\s+/g, ' ');
      const m = MARKERS.find(re => re.test(t));
      if (m) {
        const uryvek = (t.match(m) || [])[0];
        return { inJail: true, text: uryvek, cls: String(el.className).slice(0, 60) };
      }
    }
    return { inJail: false };
  }

  /** Jen odpověď ano/ne, ať se to dá dát do podmínky. */
  const blocked = () => detect().inJail;

  /**
   * Totéž nad odpovědí hry – použije se před automatickou akcí, protože fragment
   * může vězení hlásit dřív, než se objeví okno na stránce.
   *
   * !!! HLEDÁ SE JEN VE VIDITELNÉM TEXTU, NE V HTML !!!
   * Dřív se výrazy pouštěly na surové HTML. To je past: fragment kasina (#18)
   * má 145 715 znaků, ale VIDITELNÉHO textu je z toho 3 641 – tedy 98 % je
   * značkování a atributy (tisíce obrázků karet, `title`, `alt`, `data-message`).
   * Stačila tedy jediná vězeňská formulace v atributu a poker se zablokoval
   * hláškou „jsi ve vězení“, i když hráč ve vězení nebyl. Naživo se to takhle
   * projevilo sedmkrát v jednom padesátisekundovém okně a pak samo přestalo.
   *
   * Když se HTML nepodaří rozebrat, spadne se zpátky na surový text – to je
   * horší, ale lepší než akce naslepo ve vězení.
   */
  function textOdpovedi(raw) {
    const s = String(raw || '');
    if (!/<[a-z!/]/i.test(s)) return s.replace(/\s+/g, ' ');   // čistá věta, ne HTML
    try {
      const d = new DOMParser().parseFromString(s, 'text/html');
      const telo = d.body;
      if (!telo) return s.replace(/\s+/g, ' ');
      /*
       * Skripty a styly nejsou text pro uživatele. Popisky (`.tooltip-i`) taky
       * ne v tomhle smyslu – jsou to nápovědy k čemukoli na stránce, klidně
       * k cizímu hráči, takže se v nich stav MŮJ hledat nemá.
       */
      telo.querySelectorAll('script, style, .tooltip-i, [class*="tooltip"]')
        .forEach(e => e.remove());
      return (telo.textContent || '').replace(/\s+/g, ' ');
    } catch (e) {
      return s.replace(/\s+/g, ' ');
    }
  }

  /**
   * Co přesně se našlo – aby log neříkal jen „jsi ve vězení“, ale i podle čeho.
   * Bez toho se taková hláška nedá vyvrátit ani potvrdit (a přesně na tom jsem
   * jednou uvízl: v logu bylo sedm stejných řádků a nic víc).
   */
  function nalezVText(raw) {
    const t = textOdpovedi(raw);
    const re = MARKERS.find(x => x.test(t));
    if (!re) return { ok: false };
    const i = t.search(re);
    return {
      ok: true,
      znak: String(re),
      uryvek: t.slice(Math.max(0, i - 40), i + 60).trim()
    };
  }

  const inText = raw => nalezVText(raw).ok;

  /**
   * Pojistka pro automatiku: když to vypadá na vězení, vyhodí chybu, která ROVNOU
   * říká, čím se to spustilo. Používají to všechny moduly, aby ta hláška byla
   * všude stejná a všude dohledatelná.
   */
  function zkontrolujText(raw) {
    const n = nalezVText(raw);
    if (n.ok) throw new Error('jsi ve vězení – podle textu „' + n.uryvek + '“');
  }

  /* ---- odchyt podoby okna -------------------------------------------------- */

  /*
   * Vězeňské okno se nám dvakrát nepovedlo zachytit naživo (stránka mezitím
   * ztuhla), takže si ho rozšíření uloží samo, jak se objeví. Ukládá se jen
   * STRUKTURA – názvy tagů a tříd a viditelný text – ne celé HTML s atributy,
   * aby v tom neskončily tokeny. Jde o jednorázovou pomůcku k nahrazení odhadu
   * v `MARKERS` přesným selektorem; pak se dá odstranit.
   */
  function fingerprint(el) {
    const struktura = [];
    const walk = (node, depth) => {
      if (depth > 4 || struktura.length > 40) return;
      for (const kid of node.children) {
        struktura.push('  '.repeat(depth) + kid.tagName.toLowerCase()
          + (kid.className ? '.' + String(kid.className).trim().split(/\s+/).join('.') : ''));
        walk(kid, depth + 1);
      }
    };
    walk(el, 0);
    return {
      at: Date.now(),
      root: el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\s+/).join('.'),
      struktura,
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 600),
      akce: Array.from(el.querySelectorAll('[action], [data-modal], button'))
        .map(e => (e.getAttribute('action') || e.getAttribute('data-modal') || e.tagName)
          + ' | ' + String(e.className).slice(0, 40)
          + ' | ' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 24))
        .slice(0, 12)
    };
  }

  /**
   * Zachytí okno, které vypadá jako vězení, i když se na něj `MARKERS` nechytí –
   * proto se sem bere každý viditelný `.modal-box` obsahující „vězení“ nebo
   * „kauci“ v jakémkoli tvaru. Ukládá se jen první nález (ten stačí).
   */
  async function capture() {
    if ((NS.store.get().jailSample || {}).at) return null;
    const siroke = /vězen|vazb|zatč|kauc|dopaden|mříž/i;
    for (const el of document.querySelectorAll('.modal-box, [class*="jail" i], [class*="prison" i]')) {
      if (el.closest('#cmc-gym-bar') || el.closest('#cmc-panel')) continue;
      if (el.closest('.cmc-gym-offscreen') || !el.offsetParent) continue;
      const t = el.textContent.replace(/\s+/g, ' ');
      if (!siroke.test(t)) continue;
      const vzorek = fingerprint(el);
      await NS.store.put('jailSample', vzorek);
      console.info('[CMC] vězeňské okno zachyceno – podoba je v nastavení (jailSample)');
      return vzorek;
    }
    return null;
  }

  NS.jail = { detect, blocked, inText, nalezVText, zkontrolujText, textOdpovedi,
    capture, fingerprint, MARKERS, IKONA };
})();
