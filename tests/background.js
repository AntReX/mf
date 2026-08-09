/* Rozvrh nočního obnovování mimo stránku (MV3 service worker).
 *
 * Proč to nesmí být v obsahu stránky – a proč to tenhle test hlídá:
 *  1. Chrome v kartě NA POZADÍ časovače brzdí a po delší nečinnosti kartu zmrazí,
 *     takže `setInterval` v content skriptu se přes noc nemusel spustit ani raz.
 *  2. Když JavaScript stránky stojí, `location.reload()` z té stránky nikdy
 *     nedojde k vykonání – lék byl uvnitř pacienta.
 *
 * A hlavní nová schopnost: MLČENÍ KARTY je diagnóza. Z vnitřku stránky se nedá
 * poznat, že se nemaluje (DOM i layout jsou v pořádku), zvenčí ano.
 */
const fs = require('fs'), path = require('path');
/* cesta k rozšíření se odvozuje od umístění testu – v repu nesmí být
 * absolutní cesta z jednoho počítače, jinak testy nikde jinde nespustíš */
const EXT = path.join(__dirname, '..', 'extension');

/* ---- falešné chrome API --------------------------------------------------- */

const ULOZ = {};
let KARTY = [];
/* co která karta odpoví na dotaz „smí se obnovit?“; `null` = mlčí (zaseknutá) */
let ODPOVEDI = {};
const RELOADY = [];
const ZPRAVY = [];
const ALARMY = [];

globalThis.chrome = {
  runtime: {
    id: 'test',
    lastError: null,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} }
  },
  alarms: {
    onAlarm: { addListener(fn) { globalThis.__alarm = fn; } },
    async create(name, opts) { ALARMY.push({ name, ...opts }); }
  },
  storage: { local: {
    async get(keys) {
      const o = {};
      for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in ULOZ) o[k] = ULOZ[k];
      return o;
    },
    async set(obj) { Object.assign(ULOZ, obj); }
  } },
  tabs: {
    async query() { return KARTY.slice(); },
    sendMessage(tabId, msg, cb) {
      ZPRAVY.push({ tabId, msg });
      const odp = ODPOVEDI[tabId];
      if (odp === undefined || odp === null) {
        // karta mlčí: Chrome v takovém případě vůbec nezavolá callback…
        return;
      }
      chrome.runtime.lastError = null;
      setTimeout(() => cb && cb(odp), 0);
    },
    async reload(tabId) { RELOADY.push(tabId); }
  }
};
globalThis.self = globalThis;

new Function(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8')).call(globalThis);
const BG = globalThis.self.CMCBG;

let fails = 0;
const eq = (n, g, w) => { const o = String(g) === String(w); if (!o) fails++; console.log((o ? '  ok   ' : '  FAIL ') + n + (o ? '' : `  got ${JSON.stringify(String(g))} want ${JSON.stringify(String(w))}`)); };
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const reset = () => { RELOADY.length = 0; ZPRAVY.length = 0; };
const plan = () => ULOZ.reloadPlan || {};

(async () => {
  console.log('\n[alarm] zakládá se, aby přežil uspání workeru');
  /*
   * MV3 service worker se po ~30 s nečinnosti vypne. `chrome.alarms` ho probudí,
   * ale alarm musí existovat – proto se zakládá při každém startu skriptu.
   */
  ok('alarm se založil', ALARMY.some(a => a.name === BG.ALARM));
  eq('perioda je minuta', ALARMY[0].periodInMinutes, 1);
  ok('a je na to obsluha', typeof globalThis.__alarm === 'function');

  console.log('\n[vypnuto] nic se neplánuje a rozvrh se uklidí');
  ULOZ.read = { reloadAuto: false };
  ULOZ.reloadPlan = { 7: { do: 1, min: 30 } };
  KARTY = [{ id: 7, status: 'complete' }];
  reset();
  const v = await BG.zkontroluj();
  ok('hlásí vypnuto', v.vypnuto);
  eq('rozvrh je prázdný', Object.keys(plan()).length, 0);
  eq('nic se neobnovilo', RELOADY.length, 0);

  console.log('\n[plánování] každá karta hry dostane vylosovaný termín');
  ULOZ.read = { reloadAuto: true };
  ULOZ.reloadPlan = {};
  KARTY = [{ id: 7, status: 'complete' }, { id: 9, status: 'complete' }];
  reset();
  await BG.zkontroluj();
  eq('obě karty mají termín', Object.keys(plan()).sort().join(','), '7,9');
  eq('a hned se neobnovuje', RELOADY.length, 0);
  for (const k of ['7', '9']) {
    ok('karta ' + k + ' má prodlevu 30–60 min',
      plan()[k].min >= 30 && plan()[k].min <= 60);
  }

  console.log('\n[plánování] prodleva se opravdu losuje');
  // pevná perioda je na serveru poznat víc než člověk, co si hru občas obnoví
  const vzorky = new Set();
  for (let i = 0; i < 40; i++) vzorky.add(BG.novyTermin(0).min);
  ok('různých hodnot je dost', vzorky.size > 10);
  ok('nikdy pod 30', Math.min(...vzorky) >= 30);
  ok('nikdy nad 60', Math.max(...vzorky) <= 60);

  console.log('\n[zmizelá karta] vypadne z rozvrhu');
  KARTY = [{ id: 7, status: 'complete' }];
  reset();
  await BG.zkontroluj();
  eq('zůstala jen ta živá', Object.keys(plan()).join(','), '7');

  console.log('\n[termín] karta v pořádku si obnoví sama (kvůli odpočtu)');
  /*
   * Obnovení nedělá background rovnou proto, aby stránka stihla napsat do lišty
   * odpočet – bez toho vypadá obnovení jako pád stránky.
   */
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  ODPOVEDI = { 7: { ok: true, duvod: null } };
  reset();
  const r1 = await BG.zkontroluj();
  ok('poslal se dotaz na zdraví', ZPRAVY.some(z => z.msg.cmc === 'zdravi'));
  ok('a pak pokyn k obnovení', ZPRAVY.some(z => z.msg.cmc === 'obnov'));
  eq('background sám neobnovoval', RELOADY.length, 0);
  ok('poznamenal si slib', !!plan()['7'].slib);
  ok('a je to v přehledu', r1.udalosti.some(u => /karta obnoví sama/.test(u.co)));

  console.log('\n[slib] nesplněný slib background dotáhne sám');
  /*
   * Karta slíbila odpočet, ale nedodala – typicky proto, že jí mezitím zamrzl
   * JavaScript. Slib se nepočítá, výsledek ano.
   */
  ULOZ.reloadPlan = { 7: { do: Date.now() - 99999, min: 42, slib: Date.now() - BG.SLIB_MS - 1000 } };
  reset();
  await BG.zkontroluj();
  eq('obnoveno zvenčí', RELOADY.join(','), '7');
  ok('a je nový termín', plan()['7'].do > Date.now());
  ok('slib je zapomenutý', !plan()['7'].slib);

  console.log('\n[slib] čerstvý slib se respektuje');
  ULOZ.reloadPlan = { 7: { do: Date.now() - 99999, min: 42, slib: Date.now() } };
  reset();
  await BG.zkontroluj();
  eq('nic se neobnovilo', RELOADY.length, 0);

  console.log('\n[rozdělaná akce] termín se odloží, nezahodí');
  /*
   * Obnovit stránku v půlce pokerového kola nebo mezi „Vybrat z banky“
   * a „Převést na špinavé“ znamená přijít o peníze.
   */
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  ODPOVEDI = { 7: { ok: false, duvod: 'právě běží akce' } };
  reset();
  const r2 = await BG.zkontroluj();
  eq('neobnovilo se', RELOADY.length, 0);
  ok('žádný pokyn k obnovení', !ZPRAVY.some(z => z.msg.cmc === 'obnov'));
  ok('termín se posunul dopředu', plan()['7'].do > Date.now());
  ok('a ví se proč', r2.udalosti.some(u => /běží akce/.test(String(u.duvod))));

  console.log('\n[MLČÍCÍ KARTA] to je ten zaseknutý stav – obnoví se zvenčí');
  /*
   * !!! TOHLE JE CELÝ DŮVOD, PROČ TO JE V BACKGROUNDU !!!
   * Z vnitřku stránky se nedá poznat, že se nemaluje: DOM i layout jsou
   * v pořádku, prvky mají správné rozměry, obrázky jsou `complete` – chybí jen
   * vykreslení a do té vrstvy stránka nevidí. Zvenčí to poznat jde: když se
   * obsahový skript neozve, je stránka zaseknutá.
   */
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  ODPOVEDI = {};                       // karta neodpovídá
  reset();
  const r3 = await BG.zkontroluj();
  eq('obnovilo se zvenčí', RELOADY.join(','), '7');
  ok('a je to v přehledu', r3.udalosti.some(u => /mlčí/.test(u.co)));
  ok('dostala nový termín', plan()['7'].do > Date.now());

  console.log('\n[CAPTCHA] mlčící karta s captchou se NEOBNOVUJE');
  /*
   * Obnovením by captcha zmizela, tedy by se obešla kontrola proti botům.
   * U mlčící karty se to nedá zjistit z odpovědi, proto si content skript píše
   * výskyt do storage a background ho respektuje.
   */
  ULOZ.captchaAt = Date.now();
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  ODPOVEDI = {};
  reset();
  const r4 = await BG.zkontroluj();
  eq('neobnovilo se', RELOADY.length, 0);
  ok('a řekne se proč', r4.udalosti.some(u => /captcha/.test(u.co)));

  console.log('\n[CAPTCHA] ani nesplněný slib ji neobejde');
  ULOZ.reloadPlan = { 7: { do: 1, min: 42, slib: Date.now() - BG.SLIB_MS - 1000 } };
  reset();
  await BG.zkontroluj();
  eq('pořád nic', RELOADY.length, 0);

  console.log('\n[CAPTCHA] po vyřešení se zas obnovovat smí');
  ULOZ.captchaAt = Date.now() - BG.CAPTCHA_TTL - 1000;
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  ODPOVEDI = {};
  reset();
  await BG.zkontroluj();
  eq('obnovilo se', RELOADY.join(','), '7');
  ULOZ.captchaAt = 0;

  console.log('\n[načítání] rozečtená stránka není zaseknutá');
  // jinak by se obnovovala stránka, která se právě načítá – nesmysl a smyčka
  ULOZ.reloadPlan = { 7: { do: Date.now() - 1000, min: 42 } };
  KARTY = [{ id: 7, status: 'loading' }];
  ODPOVEDI = {};
  reset();
  const r5 = await BG.zkontroluj();
  eq('neobnovilo se', RELOADY.length, 0);
  ok('a ví se proč', r5.udalosti.some(u => /načítá/.test(u.co)));
  KARTY = [{ id: 7, status: 'complete' }];

  console.log('\n[dotaz] mlčení se pozná do daného času');
  const zacatek = Date.now();
  ODPOVEDI = {};
  const odp = await BG.zeptejSe(7);
  const trvalo = Date.now() - zacatek;
  eq('mlčení vrátí null', String(odp), 'null');
  ok('a nečeká se dlouho', trvalo < BG.ODPOVED_MS + 500);

  console.log('\n[manifest] service worker a oprávnění');
  const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  eq('background je registrovaný', man.background.service_worker, 'background.js');
  ok('má oprávnění alarms', man.permissions.includes('alarms'));
  ok('a pořád jen storage k tomu', man.permissions.length === 2);
  ok('host_permissions míří na hru',
    man.host_permissions.some(h => /czechmafie\.cz/.test(h)));

  console.log('\n[stránka] rozvrh už si nedrží sama');
  /*
   * Kdyby si stránka plánovala i sama, byly by dva rozvrhy a jeden z nich by
   * v kartě na pozadí neběžel – tedy přesně ta chyba, kterou tahle změna řeší.
   */
  const rsrc = fs.readFileSync(path.join(EXT, 'src/reload.js'), 'utf8');
  // komentáře se musí odstranit – ten `setInterval` je v nich zmíněný jako
  // vysvětlení, proč tam BÝT nesmí, a hledat ho v textu by chytalo vlastní popis
  const rkod = rsrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  ok('žádný setInterval v kódu reload.js', !/setInterval/.test(rkod));
  ok('a odpovídá na dotaz backgroundu', /cmc === 'zdravi'|cmc: 'zdravi'|'zdravi'/.test(rsrc));
  ok('i na pokyn k obnovení', /'obnov'/.test(rsrc));

  console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ rozvrh drží background, mlčení karty je diagnóza');
  process.exit(fails ? 1 : 0);
})().catch(e => {
  console.log('VÝJIMKA:', e.message, '\n', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
