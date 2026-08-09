/* =============================================================================
 * background.js – rozvrh obnovování hry mimo stránku (MV3 service worker)
 *
 * !!! PROČ TO NESMÍ BÝT V OBSAHU STRÁNKY !!!
 * Původně to byl `setInterval` v content skriptu. Vypadalo to funkčně, ale mělo
 * to dvě zásadní vady, a obě uhodí právě tehdy, kdy je funkce potřeba:
 *
 *   1. Chrome v kartě NA POZADÍ časovače brzdí (typicky na 1×/min) a po delší
 *      nečinnosti kartu zmrazí úplně. Noční obnovování se tedy nemuselo spustit
 *      ani jednou – a přes noc je karta na pozadí celou dobu.
 *   2. Když JavaScript stránky stojí (to je právě ten stav, kdy je obrazovka
 *      černá a nic nereaguje), `location.reload()` z té stránky nikdy nedojde
 *      k vykonání. Lék byl uvnitř pacienta.
 *
 * `chrome.alarms` tomuhle nepodléhá a `chrome.tabs.reload()` funguje bez ohledu
 * na to, v jakém stavu je stránka.
 *
 * !!! MLČENÍ KARTY JE DIAGNÓZA, NE CHYBA !!!
 * Z vnitřku stránky se nedá poznat, že se nemaluje – DOM i layout jsou v pořádku
 * a chybí jen vykreslení, do kterého stránka nevidí. ZVENČÍ to ale poznat jde:
 * když se obsahový skript do `ODPOVED_MS` neozve, je stránka zaseknutá. Tohle je
 * ta detekce, kterou jsem předtím prohlásil za nemožnou.
 *
 * Rozdělení práce:
 *   background   drží rozvrh, ptá se karty a rozhoduje
 *   stránka      odpoví, jestli se smí, a udělá odpočet (ať to není překvapení)
 *   background   když se stránka neozve nebo slib nesplní, obnoví ji sám
 *
 * !!! KONTROLA „JSI ČLOVĚK?“ SE NEOBCHÁZÍ ANI ODSUD !!!
 * Obnovit stránku s captchou by tu kontrolu smazalo. Stránka to hlásí v odpovědi,
 * ale u zaseknuté karty žádná odpověď není – proto si content skript píše do
 * storage `captchaAt` a background ho respektuje i při mlčení. (Zaseknutá karta
 * captchu vykreslit neumí, takže je to spíš pojistka než reálný případ; mít ji
 * ale musí, protože na tom nesmí záležet.)
 * ===========================================================================*/

'use strict';

const ALARM = 'cmc-reload';
const HRA = 'https://*.czechmafie.cz/*';

/** Rozsah prodlevy v minutách; losuje se po každém obnovení. */
const MIN_MIN = 30;
const MAX_MIN = 60;
/**
 * Perioda alarmu. Minutu dolů to Chrome stejně nepustí a častěji to nemá smysl –
 * rozvrh se počítá z termínu, ne z počtu tiků.
 */
const ALARM_MIN = 1;
/** Kolik se čeká na odpověď karty. Když neodpoví, je zaseknutá. */
const ODPOVED_MS = 2500;
/** O kolik se termín posune, když karta má rozdělanou akci. */
const ODKLAD_MIN = 3;
/**
 * Karta slíbila, že se obnoví (dělá odpočet). Když to do téhle doby nestihne,
 * obnoví ji background sám – slib se nepočítá, výsledek ano.
 */
const SLIB_MS = 30000;
/** Jak dlouho se věří zápisu o captché, když se karta neozývá. */
const CAPTCHA_TTL = 5 * 60000;

const nacti = async () => chrome.storage.local.get(['read', 'reloadPlan', 'captchaAt']);

/** Vylosuje termín pro jednu kartu. */
function novyTermin(ted) {
  const min = MIN_MIN + Math.random() * (MAX_MIN - MIN_MIN);
  return { do: ted + Math.round(min * 60000), min: Math.round(min) };
}

/**
 * Zeptá se karty, jestli se smí obnovit. `null` znamená, že se neozvala –
 * tedy že stránka stojí.
 */
function zeptejSe(tabId) {
  return new Promise(hotovo => {
    let done = false;
    const dokonci = v => { if (!done) { done = true; hotovo(v); } };
    setTimeout(() => dokonci(null), ODPOVED_MS);
    try {
      chrome.tabs.sendMessage(tabId, { cmc: 'zdravi' }, odp => {
        // `lastError` se MUSÍ přečíst, jinak Chrome loguje nezpracovanou chybu
        const chyba = chrome.runtime.lastError;
        dokonci(chyba ? null : (odp || null));
      });
    } catch (e) {
      dokonci(null);
    }
  });
}

/** Řekne kartě, ať se obnoví sama (udělá odpočet a napíše to do lišty). */
function rekniObnov(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { cmc: 'obnov' }, () => {
      void chrome.runtime.lastError;      // odpověď nás nezajímá
    });
  } catch (e) { /* karta mezitím zmizela */ }
}

async function obnov(tabId) {
  try { await chrome.tabs.reload(tabId); return true; } catch (e) { return false; }
}

/**
 * Jeden průchod: pro každou kartu hry zkontroluje termín a případně zařídí
 * obnovení. Vrací přehled, co se stalo – kvůli testům a ladění.
 */
async function zkontroluj(ted = Date.now()) {
  const { read = {}, reloadPlan = {}, captchaAt = 0 } = await nacti();
  const udalosti = [];

  if (read.reloadAuto !== true) {
    // vypnuto: rozvrh se zahodí, ať se po zapnutí začíná čistě
    if (Object.keys(reloadPlan).length) await chrome.storage.local.set({ reloadPlan: {} });
    return { vypnuto: true, udalosti };
  }

  let karty = [];
  try { karty = await chrome.tabs.query({ url: HRA }); } catch (e) { karty = []; }

  const plan = { ...reloadPlan };
  // karty, které zmizely, z rozvrhu vypadnou
  const zive = new Set(karty.map(t => String(t.id)));
  for (const k of Object.keys(plan)) if (!zive.has(k)) delete plan[k];

  const captchaSviti = ted - (+captchaAt || 0) < CAPTCHA_TTL;

  for (const t of karty) {
    const k = String(t.id);
    if (!plan[k]) {
      plan[k] = novyTermin(ted);
      udalosti.push({ tab: t.id, co: 'naplánováno', min: plan[k].min });
      continue;
    }

    /*
     * Karta slíbila, že se obnoví sama. Když to nestihla, udělá se to zvenčí –
     * přesně pro případ, že jí mezitím zamrzl JavaScript.
     */
    if (plan[k].slib) {
      if (ted - plan[k].slib < SLIB_MS) { udalosti.push({ tab: t.id, co: 'čekám na slib' }); continue; }
      if (captchaSviti) { udalosti.push({ tab: t.id, co: 'captcha – neobnovuji' }); continue; }
      await obnov(t.id);
      plan[k] = novyTermin(ted);
      udalosti.push({ tab: t.id, co: 'obnoveno zvenčí (slib nesplněn)' });
      continue;
    }

    if (ted < plan[k].do) continue;
    // rozečtená stránka se neobnovuje, to není zaseknutí
    if (t.status && t.status !== 'complete') { udalosti.push({ tab: t.id, co: 'načítá se' }); continue; }

    const odp = await zeptejSe(t.id);

    if (odp === null) {
      /*
       * Neozvala se → JavaScript stránky stojí. Tohle je ten zaseknutý stav
       * s černou obrazovkou, na který se z vnitřku stránky přijít nedá.
       */
      if (captchaSviti) { udalosti.push({ tab: t.id, co: 'captcha – neobnovuji' }); continue; }
      await obnov(t.id);
      plan[k] = novyTermin(ted);
      udalosti.push({ tab: t.id, co: 'karta mlčí → obnoveno zvenčí' });
      continue;
    }

    if (!odp.ok) {
      plan[k].do = ted + ODKLAD_MIN * 60000;
      udalosti.push({ tab: t.id, co: 'odloženo', duvod: odp.duvod || null });
      continue;
    }

    // karta je v pořádku a smí – ať to udělá sama, aby stihla odpočet v liště
    rekniObnov(t.id);
    plan[k] = { ...plan[k], slib: ted };
    udalosti.push({ tab: t.id, co: 'karta obnoví sama' });
  }

  await chrome.storage.local.set({ reloadPlan: plan });
  return { vypnuto: false, plan, udalosti };
}

/** Alarm musí existovat i po probuzení workeru – proto se zakládá při každém startu. */
async function zalozAlarm() {
  try {
    await chrome.alarms.create(ALARM, { periodInMinutes: ALARM_MIN });
  } catch (e) { /* v testech alarmy nejsou */ }
}

if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(a => {
    if (!a || a.name !== ALARM) return;
    zkontroluj().catch(() => {});
  });
}
if (typeof chrome !== 'undefined' && chrome.runtime) {
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => { zalozAlarm(); });
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { zalozAlarm(); });
}
zalozAlarm();

/* pro testy – v prohlížeči to nikdo nepoužívá */
if (typeof self !== 'undefined') {
  self.CMCBG = { zkontroluj, novyTermin, zeptejSe, zalozAlarm,
    ALARM, HRA, MIN_MIN, MAX_MIN, ALARM_MIN, ODPOVED_MS, ODKLAD_MIN, SLIB_MS,
    CAPTCHA_TTL };
}
