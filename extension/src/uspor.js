/* =============================================================================
 * uspor.js – šetřicí režim: zastavit nekonečné animace hry
 *
 * !!! PROČ TO ŽERE BATERII !!!
 * Změřeno v běžící hře (`document.getAnimations()`): hra drží **27 animací
 * a všechny jsou `infinite`** ve smyčce 1–2 s:
 *
 *   pulseAnim        13×      pulseAnimLittle   9×
 *   bounceAnim        2×      bounce            2×      bounceInAnim  1×
 *
 * Animují jen `transform` a `opacity`, takže nepřepočítávají layout – ale právě
 * proto běží NA KOMPOZITORU, který se kvůli nim nesmí uspat ani na chvíli.
 * Dokud je karta viditelná, kreslí se každý snímek pořád dokola, i když se
 * ve hře nic nemění.
 *
 * !!! ROZŠÍŘENÍ SAMO ZA TO NEMŮŽE !!!
 * Změřeno: z těch 27 animací je NAŠICH NULA. Naše jediná nekonečná animace je
 * ozubené kolečko u běžící akce (`cmc-gym-spin`) a to se točí jen během akce.
 * Lišta se přitom nepřestavuje – za 20 s nula změn DOM. Šetřit tedy nemá cenu
 * na naší straně, ale na animacích hry.
 *
 * !!! SKRYTÁ KARTA SE ŘEŠÍ SAMA !!!
 * Chrome zastaví kreslení, když je karta úplně skrytá nebo zakrytá jiným oknem
 * – tam už šetřit netřeba. Problém je karta VIDITELNÁ, ale nečinná: druhý
 * monitor, poloviční okno vedle prohlížeče. Proto má režim tři stupně:
 *
 *   'nikdy'     – nic se nevypíná (jak to bylo dřív)
 *   'napozadi'  – animace se vypnou, jen když karta není v popředí (výchozí)
 *   'vzdy'      – animace se nekreslí nikdy
 *
 * Vypnutí animací nic nerozbije: jsou to jen upoutávky („Vybrat mzdu“ pulzuje).
 * Co se dá udělat, je stejně v liště, takže o žádnou informaci se nepřichází.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const TRIDA = 'cmc-uspor';
  const REZIMY = ['nikdy', 'napozadi', 'vzdy'];

  const rezim = () => {
    const r = NS.store.get().read.usporAnimace;
    return REZIMY.includes(r) ? r : 'napozadi';
  };

  /** Má se právě teď kreslení potlačit? */
  function potlacit() {
    const r = rezim();
    if (r === 'nikdy') return false;
    if (r === 'vzdy') return true;
    // 'napozadi': stačí, že karta není vidět nebo není zaostřená
    return document.visibilityState !== 'visible' || !document.hasFocus();
  }

  function uplatnit() {
    const chci = potlacit();
    const el = document.body;
    if (!el) return chci;
    if (el.classList.contains(TRIDA) !== chci) el.classList.toggle(TRIDA, chci);
    return chci;
  }

  /** Kolik animací hra právě drží – do popisku, ať je vidět, že to funguje. */
  function bezicichAnimaci() {
    if (!document.getAnimations) return null;
    try {
      return document.getAnimations().filter(a => {
        const t = a.effect && a.effect.target;
        // naše kolečko se nepočítá, to se točí jen během akce
        return t && !String(t.className || '').includes('cmc-');
      }).length;
    } catch (e) {
      return null;
    }
  }

  function start() {
    uplatnit();
    /*
     * `blur`/`focus` jsou tu kvůli druhému monitoru: karta je pořád
     * `visible`, ale nekoukáš na ni, takže animace jsou zbytečné.
     */
    for (const ev of ['visibilitychange', 'blur', 'focus']) {
      (ev === 'visibilitychange' ? document : window)
        .addEventListener(ev, uplatnit, { passive: true });
    }
    // změna volby v popupu se má projevit hned, ne až po přepnutí karty
    NS.store.onChange(keys => { if (keys.includes('read')) uplatnit(); });
  }

  NS.uspor = { start, uplatnit, potlacit, rezim, bezicichAnimaci, TRIDA, REZIMY };
})();
