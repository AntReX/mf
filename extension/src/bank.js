/* =============================================================================
 * bank.js – Banka (#22): vyprat špinavé peníze a sebrat vyprané
 *
 * Proměřeno naživo (odpovědi serveru, ne odhad):
 *   POST /map/building/bank/startLaundering       {amount}  → 200, prázdné tělo
 *   POST /map/building/bank/collectLaunderedMoney {}        → 200
 *        {"money":"70Kč","confirm":"Sesbíral jsi …70Kč"}
 *
 *   Cyklus: 100 špinavých −100 → praní → „Sebrat peníze“ → +70 čistých.
 *   Kurz je 100 Kč = 70 Kč, tedy hra si bere 30 %.
 *
 * !!! PRANÍ CHVÍLI BĚŽÍ A MEZITÍM SE NEDÁ NIC !!!
 * Během praní vrací server 403 „Banka už nyní pere peníze, počkej, až skončí“
 * – a to jak na další praní, tak na sebrání. V okně to přitom NENÍ poznat:
 * dokud praní běží, žádný `.laundering-box` tam není a odpočet v sekci taky ne
 * (ten jediný `timer-down` v okně patří vylepšení budovy, ne praní). Stav se
 * tedy pozná až z odpovědi, a proto se to nebere jako chyba – automatika prostě
 * počká na další tik.
 *
 * !!! JSOU TO DVA KROKY !!!
 * `startLaundering` jen ODEBERE špinavé peníze; čisté přijdou až po sebrání.
 * Kdo vypere a nesebere, má peníze zamrzlé v budově. Proto se v automatice
 * SBÍRÁ DŘÍV, než se pere – jinak by se hromadilo nevyzvednuté.
 *
 * !!! ČÁSTKA SE BERE Z OKNA HRY !!!
 * Kolik jde vyprat, závisí na úrovni budovy (u nás 15 402 198 Kč) a na tom,
 * kolik špinavých peněz zrovna je. Hra to za nás spočítá a předvyplní do
 * `#laundering input[name=amount]`, takže se nic nedopočítává – vezme se, co
 * tam je. Nižší z obojího tím pádem vyjde samo.
 *
 * Sebrání nemá parametr: `collectLaunderedMoney` sebere, co je hotové.
 * Hotové praní pozná podle `.laundering-box` s tlačítkem `.collectLaunderedMoney`.
 *
 * !!! UKLÁDÁNÍ DO SKLADU SE MUSÍ KLIKAT !!!
 * `insertToBank` a `takeFromBank` odmítají přímý požadavek se 404 „Spausk per
 * mygtuką, o ne per nuorodą!“ (klikni na tlačítko, ne na odkaz) – a to i s
 * hlavičkou XMLHttpRequest a CSRF. Praní a sebrání ho přitom berou; proč je
 * v tom hra nekonzistentní, nevím, ale změřeno je to takhle. Ukládání proto
 * jde přes vložený fragment a klik na skutečné tlačítko, jako u výroben.
 *
 * Částka se píše do `input[name=deposit]` (výběr do `withdraw`) – hra ji
 * z pole vezme sama a pošle jako `amount`.
 *
 * !!! SÁHNOUT JEN NA SVÉ POLE A SVÉ TLAČÍTKO !!!
 * Sekce `#deposit` má DVĚ pole – `deposit` (vložit) a `withdraw` (vybrat) –
 * a ke každému patří vlastní tlačítko. Když se nastaví jen to správné a klikne
 * se na tlačítko UVNITŘ `#deposit`, sedí částka na korunu (ověřeno: vybráno
 * 777 777, vloženo 777 777, konečný stav přesně jako na začátku).
 *
 * Pokazit se to dá dvěma způsoby a oba jsem si vyzkoušel:
 *   – nastavit „pro jistotu“ i `input[name=amount]` (praní, převodník) →
 *     hra vzala jejich hodnotu a přesunula úplně jinou částku (997 místo 1 mil.),
 *   – hledat tlačítko v celém okně místo v `#deposit`.
 *
 * `ulozVse()` přesto kliká ve smyčce, dokud na účtu nezůstane jen rezerva – je
 * to pojistka pro případ, že by hra někdy poslala míň. Pokrok se měří z OKNA
 * banky (`kVkladu`), ne z HUD, který se překresluje se zpožděním.
 *
 * Energii vklad ani výběr NESTOJÍ (změřeno: 21 → 21 → 21 přes obojí), takže
 * `bankMinVklad` není kvůli energii, ale kvůli tomu, aby se to nedělalo pořád.
 *
 * !!! ŠPINAVÉ SE NEPEROU VŠECHNY !!!
 * Materiál pro výrobny se platí ŠPINAVÝMI, takže vyprat je do posledního by
 * výrobny vyhladovělo – a zpátky by se čisté dostaly jen převodem, kdežto
 * praní stojí 30 %. Proto je u praní rezerva (`bankKeepDirty`): kolik
 * špinavých nechat nedotčených. Pere se `min(co hra nabízí, špinavé − rezerva)`.
 *
 * !!! PENÍZE Z BANKY NA MATERIÁL: TŘI KROKY, ŽÁDNÉ PLÝTVÁNÍ !!!
 * Banka drží ČISTÉ peníze, ale materiál pro výrobny se platí ŠPINAVÝMI, takže
 * se z banky nedá platit přímo. Řetězec je:
 *
 *   sklad (čisté) → takeFromBank → účet (čisté) → convertToDirty → špinavé
 *
 * Převod je **1:1** – banka u převodníku píše „1 Kč = 1 Kč“, takže se na tom
 * neztrácí nic (na rozdíl od praní za 30 %). Přesto se převádí jen tolik, kolik
 * doopravdy chybí: čisté peníze jsou potřeba na vylepšování budov a jednou
 * převedené zpátky bez ztráty nepůjdou (opačný směr je praní za 30 %).
 *
 * Pořadí je proto: nejdřív se použije, co je na ÚČTU, a teprve zbytek se
 * vybere z banky. Zbytečný výběr a vklad tam a zpátky by jen mlel naprázdno.
 *
 * !!! PŘEVODNÍK MÁ JINÉ TLAČÍTKO A JEŠTĚ SE PTÁ !!!
 * Vklad a výběr mají cíl v `action`, převod ale v
 * `data-action="convertMoneyToDirty('/map/building/bank/convertToDirty')"`,
 * a navíc nese `data-message`, takže hra napřed otevře vlastní potvrzení.
 * Dokud se nepotvrdí, NEODEJDE ANI JEDEN POŽADAVEK – změřeno odposlechem
 * `fetch`/XHR: po kliku prázdno.
 *
 * !!! POTVRZOVACÍ DIALOGY JSOU DVA A POZNAJÍ SE RŮZNĚ !!!
 *   `.confirm-box` v `.middle-top-alert`   zavřený = `display: none`,
 *                                          třída `active` na něm zůstává vždy
 *   `.confirm-modal` (`.modal-box.center`) `display` je VŽDY `flex`,
 *                                          otevřený = přidaná třída `active`
 *
 * Převod otevírá TEN DRUHÝ. Detekce koukala jen na první a jen na `display`,
 * takže „Ano“ se nikdy nekliklo a nepřevedlo se ANI JEDNOU – zatímco banka
 * hlásila „převedeno 9,1 mil. Kč“. Peníze zůstaly ČISTÉ na účtu, materiál se
 * platí ŠPINAVÝMI, takže pivovar, palírna i konopná farma stály se zásobou 0.
 * `offsetParent` nepomůže, u `.confirm-modal` je `null` v obou stavech.
 * `#confirmYes` je v dokumentu DVAKRÁT, proto se hledá UVNITŘ toho dialogu,
 * který je otevřený.
 * Hledalo se přitom jen `[action]`, takže převod padal na „tlačítko v okně banky
 * není“ a v liště svítilo `⚠ Pivo: tlačítko v okně banky není` – vypadalo to na
 * chybu výroben, ale peníze prostě nikdy nedorazily.
 *
 * Ověřeno naostro s 1 Kč: čisté −1, špinavé +1, tedy opravdu 1:1.
 *
 * !!! KOLIK JDE ULOŽIT SE ČTE Z OKNA, NE Z HUD !!!
 * HUD ukazuje ZAOKROUHLENÉ peníze, kdežto skutečný zůstatek má haléře:
 * HUD „2 742 863“ proti oknu „Vložit peníze? 2742862.99“. Kdo počítá z HUD,
 * pošle o korunu víc, než doopravdy má, a hra vklad odmítne. Bere se proto
 * číslo z okna a zaokrouhluje se DOLŮ.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const BUILDING = '/map/building/show/22';
  const PRAT = '/map/building/bank/startLaundering';
  const SEBRAT = '/map/building/bank/collectLaunderedMoney';
  const VLOZIT = /insertToBank/;
  const VYBRAT = /takeFromBank/;
  const PREVEST = /convertToDirty/;

  /** Pod tuhle částku se prát nevyplatí – 30 % z drobných je zbytečný klik. */
  const MIN_PRANI = 1000;
  /**
   * !!! ŽÁDNÉ TVRDÉ DNO NA VKLAD NENÍ !!!
   * Bývalo tu `MIN_VKLAD = 10000` s odůvodněním, že „vklad stojí energii, takže
   * deset malých stojí desetkrát tolik co jeden velký“. To je ale ZMĚŘENĚ
   * NEPRAVDA – vklad ani výběr energii nestojí (21 → 21 → 21 přes obojí) a je to
   * napsané i v hlavičce tohohle souboru. Dno tedy nemělo důvod existovat.
   *
   * Horší bylo, že se tím uživateli TIŠE PŘEPISOVALO nastavení: kdo si napsal
   * rezervu 100 a hranici vkladu 100, dostal stejně 10 000 – a v UI o tom nebylo
   * ani slovo. Naživo to znamenalo, že se nevkládalo NIC, protože výchozí hranice
   * je milion.
   *
   * Zůstává jen sanita: vložit se nedá nula. Zbytek rozhoduje `bankMinVklad`
   * a ten se bere, jak je zadaný – včetně nuly, což znamená „vlož všechno nad
   * rezervu“.
   */
  const MIN_VKLAD = 1;
  const TTL = 20000;
  /** Hláška serveru, když praní právě běží – není to chyba, jen „ještě ne“. */
  const PERE_SE = /už nyní pere|počkej, až skončí/i;

  let state = null;
  let stateAt = 0;

  /**
   * Kolikrát po sobě smí uložení selhat, než se automatika vypne. Vklad je
   * zdarma, takže přechodné odmítnutí nemá cenu brát jako rozsudek.
   */
  const MAX_SELHANI = 3;
  let selhaniVkladu = 0;
  /** Aby hláška „neukládá se, protože…“ nepřebíjela všechno každých 5 s. */
  const HLASKA_KAZDYCH = 5 * 60 * 1000;
  let hlaskaAt = 0;
  let poslednDuvod = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function csrf() {
    const m = document.querySelector('meta[name=csrf-token]');
    return m ? m.content : null;
  }

  async function posli(url, telo) {
    const t = csrf();
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(t ? { 'X-CSRF-TOKEN': t } : {})
      },
      body: telo ? new URLSearchParams(telo).toString() : ''
    });
    const txt = await r.text();
    let data = null;
    try { data = JSON.parse(txt); } catch (e) { /* prázdná odpověď je v pořádku */ }
    if (r.status !== 200) {
      const zprava = (data && (data.message
        || (typeof data.errors === 'string' ? data.errors
          : (data.errors && Object.values(data.errors).flat()[0]))))
        || 'banka odmítla (HTTP ' + r.status + ')';
      const e = new Error(zprava);
      // „už se pere“ není chyba – volající se podle toho zachová jinak
      e.pereSe = PERE_SE.test(zprava);
      throw e;
    }
    return data || {};
  }

  /**
   * Klik na skutečné tlačítko v okně banky. Používá se na ukládání a výběr,
   * které přímý požadavek odmítají – viz hlavička.
   */
  /**
   * Zapíše částku do JEDNOHO konkrétního pole. Sahat i na ostatní `amount`
   * v okně je chyba – hra pak vezme jejich hodnotu (ověřeno: 997 místo milionu).
   */
  function nastav(box, jmeno, castka, sekce) {
    const kde = sekce ? (box.querySelector(sekce) || box) : box;
    const pole = kde.querySelector('input[name=' + jmeno + ']');
    if (!pole) throw new Error('pole „' + jmeno + '“ v okně banky není');
    pole.value = String(castka);
    pole.dispatchEvent(new Event('input', { bubbles: true }));
    pole.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * !!! DVA DRUHY TLAČÍTEK !!!
   * Vklad a výběr mají cíl v `action`, ALE PŘEVODNÍK NE – ten má
   * `data-action="convertMoneyToDirty('/map/building/bank/convertToDirty')"`.
   * Hledat jen `[action]` proto na převodu spadlo na „tlačítko v okně banky
   * není“ a výrobny kvůli tomu stály bez peněz. Prohledávají se obě.
   */
  function najdiTlacitko(kde, kam) {
    return [...kde.querySelectorAll('[action], [data-action]')]
      .find(e => kam.test(e.getAttribute('action') || '')
        || kam.test(e.getAttribute('data-action') || ''));
  }

  /*
   * !!! PŘEVOD SE JEŠTĚ POTVRZUJE – A DIALOGY JSOU DVA !!!
   * Tlačítko převodníku nese `data-message` a hra na ně otevře potvrzení.
   * Bez potvrzení se NEODEŠLE NIC (změřeno odposlechem `fetch`/XHR: po kliku
   * prázdno). Jenže hra má na potvrzování DVĚ různé věci a poznají se různě:
   *
   *   `.confirm-box` v `.middle-top-alert`   zavřený = `display: none`,
   *                                          třída `active` na něm zůstává vždy
   *   `.confirm-modal` (`.modal-box.center`) `display` je VŽDY `flex`,
   *                                          otevřený = přidaná třída `active`
   *
   * Převod otevírá TEN DRUHÝ. Původní detekce koukala jen na `.confirm-box`
   * a jen na `display`, takže u převodu nenašla nic, „Ano“ se nikdy nekliklo
   * a nepřevedlo se ANI JEDNOU. A protože `klikni()` výsledek nekontroloval,
   * banka přitom hlásila „převedeno 9,1 mil. Kč“ – peníze zůstaly ČISTÉ na účtu,
   * materiál se platí ŠPINAVÝMI, takže výrobny stály se zásobou 0 a v panelu
   * to vypadalo, že peníze dorazily.
   *
   * Ani `offsetParent` nepomůže: u `.confirm-modal` je `null` v obou stavech.
   *
   * Proto se otevřený dialog hledá takhle: `.confirm-modal` podle třídy `active`,
   * `.confirm-box` podle `display`. A „Ano“ se hledá UVNITŘ toho dialogu – `#confirmYes`
   * je v dokumentu dvakrát, jeden v každém z nich.
   */
  function otevrenyDialog() {
    for (const d of document.querySelectorAll('.confirm-modal')) {
      if (d.classList.contains('active')) return d;
    }
    for (const d of document.querySelectorAll('.confirm-box')) {
      if (getComputedStyle(d).display !== 'none') return d;
    }
    return null;
  }
  const dialogOtevreny = () => !!otevrenyDialog();
  const tlacitkoDialogu = (d, id) => (d ? d.querySelector('[id=' + id + ']') : null);

  /*
   * !!! DIALOG SE PŘI VLASTNÍM KLIKU SCHOVÁVÁ !!!
   * Ptát se uživatele „opravdu?“ na akci, kterou si sám zapnul zaškrtávátkem,
   * nemá smysl – a probliklo by mu to přes obrazovku při každém převodu.
   * Schovává se proto JEN na tu chvíli, co si ho odklepává automatika, a hned
   * se to zase pouští: kdyby zůstala třída viset, měl by uživatel neviditelný
   * dialog, který by mu blokoval každý další klik ve hře.
   *
   * Je to `visibility`, ne `display` – podle `display` se pozná otevřený dialog
   * a `display: none` by nám ho schoval i před vlastní kontrolou.
   *
   * Cizí dialog se neschovává nikdy: `klikni()` na otevřený dialog rovnou couvne.
   */
  const TICHO = 'cmc-tichy-dialog';
  const ticho = zap => document.documentElement.classList.toggle(TICHO, !!zap);

  /**
   * `raw` se předává, když už okno banky někdo právě přečetl – jinak se stahuje
   * dvakrát na jednu akci. Bez něj se přečte jako dřív (ruční tlačítka v liště).
   */
  async function klikni(kam, priprav, sekce, raw) {
    const host = NS.gym.gameHost();
    if (!host) throw new Error('herní okno nenalezeno – otevři mapu hry');

    /*
     * Cizí otevřený dialog se nepotvrzuje. Je jen jeden pro celou stránku, takže
     * kdyby se uživatel zrovna na něco rozhodoval, odklepla by mu automatika
     * jeho vlastní akci – a to může být cokoli, třeba prodej.
     */
    if (dialogOtevreny()) throw new Error('hra se na něco ptá – potvrď to nejdřív sám');

    if (raw == null) {
      const o = await NS.parse.apiGet(BUILDING);
      if (o.status !== 200) throw new Error('banka nejde přečíst (HTTP ' + o.status + ')');
      raw = o.raw;
    }

    const box = document.createElement('div');
    box.className = 'cmc-gym-offscreen cmc-bank-box';
    box.innerHTML = raw;
    host.appendChild(box);
    try {
      await sleep(200);
      /*
       * Tlačítko se hledá v jeho vlastní sekci: každé pole má to své a záměna
       * znamená, že hra přesune jinou částku.
       */
      const kde = sekce ? (box.querySelector(sekce) || box) : box;
      const el = najdiTlacitko(kde, kam);
      if (!el) throw new Error('tlačítko v okně banky není');
      if (priprav) priprav(box, el);
      // ticho se zapíná až těsně před klikem, ať okno hry zaslepené co nejkratší dobu
      ticho(true);
      el.click();
      await sleep(400);
      /*
       * Potvrzení se odklepne AŽ TEĎ a fragment se do té doby nechává v DOM –
       * hra si při potvrzení sahá zpátky na pole s částkou.
       */
      const d = otevrenyDialog();
      if (d) {
        // „Ano“ musí být z TOHO dialogu – v dokumentu je `#confirmYes` dvakrát
        const ano = tlacitkoDialogu(d, 'confirmYes');
        if (!ano) throw new Error('hra se ptá, ale tlačítko „Ano“ v dialogu není');
        ano.click();
        await sleep(600);
      }
    } finally {
      box.remove();
      /*
       * Kdyby akce spadla s otevřeným dialogem, zavře se – otevřený dialog
       * blokuje každý další klik (a příště by se na něj narazilo jako na „cizí“).
       */
      const zbyl = otevrenyDialog();
      if (zbyl) {
        const ne = tlacitkoDialogu(zbyl, 'confirmNo');
        if (ne) ne.click();
      }
      // AŽ TEĎ, a bezpodmínečně: viset tu nesmí za žádných okolností
      ticho(false);
    }
  }

  /* ---- stav ---------------------------------------------------------------- */

  /**
   * Co banka umí právě teď. `kPrani` je částka, kterou hra sama předvyplnila –
   * je v ní už zohledněná úroveň budovy i to, kolik špinavých peněz je.
   */
  async function load() {
    const { status, raw } = await NS.parse.apiGet(BUILDING);
    if (status !== 200) throw new Error('banka nejde přečíst (HTTP ' + status + ')');
    if (NS.jail) NS.jail.zkontrolujText(raw);

    const d = document.createElement('div');
    d.innerHTML = raw;
    const vstup = d.querySelector('#laundering input[name=amount]');
    const hotove = [...d.querySelectorAll('.laundering-box')]
      .filter(b => b.querySelector('[action*=collectLaunderedMoney]'));

    const text = (d.textContent || '').replace(/\s+/g, ' ');
    const vBanceM = text.match(/v bance uloženo\s*([\d\s  ]+)/i);
    // „Vložit peníze? 2742862.99“ – skutečný zůstatek i s haléři
    const kVkladuM = text.match(/Vložit peníze\?\s*([\d\s  .,]+)/i);
    // „Vybrat 16317671.11“ – kolik leží ve skladu, taky s haléři
    const kVyberuM = text.match(/Vybrat\s*([\d\s  .,]+)/i);

    state = {
      /*
       * Surové HTML si nechává `klikni()`, ať se okno banky nestahovalo dvakrát
       * na jednu akci – změřeno u výroben jako čistá ztráta jednoho round-tripu.
       */
      raw,
      // číslo z okna může mít desetinná místa (15402197.96) – dolů, ať to projde
      kPrani: vstup ? Math.floor(NS.parse.toNum(vstup.value) || 0) : 0,
      vBance: vBanceM ? (NS.parse.toNum(vBanceM[1]) || 0) : null,
      // dolů: 2742862,99 → 2742862, ať se neposílá víc, než na účtu je
      kVkladu: kVkladuM ? Math.floor(NS.parse.toNum(kVkladuM[1]) || 0) : null,
      kVyberu: kVyberuM ? Math.floor(NS.parse.toNum(kVyberuM[1]) || 0) : null,
      spinave: NS.parse.toNum((d.querySelector('#laundering') || {}).textContent || '') || 0,
      hotovych: hotove.length,
      // kolik čeká na sebrání – z textu „Dokončil praní peněz 70Kč“
      kSebrani: hotove.reduce((s, b) => {
        const m = (b.textContent || '').match(/([\d\s  ]+)\s*Kč/);
        return s + (m ? (NS.parse.toNum(m[1]) || 0) : 0);
      }, 0)
    };
    stateAt = Date.now();
    return state;
  }

  const cerstvy = () => (state && Date.now() - stateAt < TTL) ? state : null;

  /* ---- akce ---------------------------------------------------------------- */

  /** Vypere maximum, které hra nabízí – mínus rezerva špinavých. */
  async function prat() {
    const s = await load();
    const p = kPrani(s);
    if (p.castka < MIN_PRANI) {
      throw new Error('není co prát (' + NS.fmt.kc(p.castka, { short: true })
        + (p.omezeno ? ', rezerva ' + NS.fmt.kc(p.nechat, { short: true }) : '') + ')');
    }
    await posli(PRAT, { amount: String(p.castka) });
    state = null;
    return { vyprano: p.castka, dostanu: Math.round(p.castka * 0.7), rezerva: p.nechat };
  }

  const ciste = () => {
    const el = document.querySelector('.value.renew-money');
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /**
   * Kolik se má právě teď vyprat: co hra nabízí, ale nejvýš tolik, aby
   * špinavých zbyla nastavená rezerva.
   *
   * Rezerva má smysl: špinavými se platí materiál pro výrobny, takže vyprat je
   * do posledního znamená, že se pak nemá za co nakupovat – a čisté zpátky na
   * špinavé sice jdou 1:1, ale to je zbytečné kolečko.
   */
  function kPrani(s) {
    const nechat = Math.max(0, Math.round(+NS.store.get().read.bankKeepDirty || 0));
    const nabizi = s && s.kPrani != null ? s.kPrani : 0;
    const mam = spinave();
    const strop = mam != null ? Math.max(0, Math.floor(mam - nechat)) : nabizi;
    return {
      castka: Math.max(0, Math.min(nabizi, strop)),
      nabizi, nechat, mam,
      // proč se pere míň, než hra nabízí – do popisku, ať se nikdo nediví
      omezeno: mam != null && strop < nabizi
    };
  }

  /**
   * Kolik se má právě teď uložit: peníze nad rezervou.
   *
   * Přednost má číslo z OKNA banky (`kVkladu`) – HUD je zaokrouhlený a o korunu
   * vyšší, takže by se poslalo víc, než na účtu je, a hra by vklad odmítla.
   * HUD slouží jen jako záloha, když okno ještě není načtené.
   */
  function kUlozeni(s) {
    const cfg = NS.store.get().read;
    const nechat = Math.max(0, Math.round(+cfg.bankKeep || 0));
    /*
     * Hranice se bere PŘESNĚ, jak je zadaná – nula znamená „vlož všechno nad
     * rezervu“. Dřív se tu zvedala na 10 000, takže nastavení pod tu hodnotu
     * nešlo a nikde to nebylo vidět.
     */
    const zadano = +cfg.bankMinVklad;
    const prah = Number.isFinite(zadano) ? Math.max(0, Math.round(zadano)) : 0;
    const zOkna = s && s.kVkladu != null ? s.kVkladu : null;
    const mam = zOkna != null ? zOkna : ciste();
    if (mam == null) {
      return { castka: 0, mam: null, nechat, prah, staci: false, zdroj: 'neznámo' };
    }
    const castka = Math.max(0, Math.floor(mam - nechat));
    return {
      castka, mam, nechat, prah,
      /*
       * Vklad energii NESTOJÍ (změřeno), takže `prah` není kvůli ceně, ale jen
       * proti tomu, aby se to klikalo pořád po drobných. Nula = vkládej všechno
       * nad rezervu.
       */
      staci: castka >= Math.max(MIN_VKLAD, prah),
      zdroj: zOkna != null ? 'okno banky' : 'HUD (zaokrouhlený)'
    };
  }

  /**
   * Zbývá dost energie na vklad?
   *
   * Změřeno, že vklad ani výběr energii NESTOJÍ (21 → 21 → 21 přes obojí),
   * takže je hranice ve výchozím stavu nulová a nic neblokuje. Zůstává jen pro
   * případ, že by to hra změnila – pak stačí nastavit číslo, ne psát kód.
   */
  function energieStaci() {
    const min = Math.max(0, Math.round(+NS.store.get().read.bankMinEnergie || 0));
    if (!min) return { ok: true, energie: null, min };
    const e = NS.gym && NS.gym.readEnergy ? NS.gym.readEnergy() : null;
    // když se energie přečíst nedá, radši se neblokuje
    return { ok: e == null || e >= min, energie: e, min };
  }

  /**
   * Uloží peníze do skladu banky. Částka se píše do `input[name=deposit]`
   * a klikne se na skutečné tlačítko – přímý požadavek hra odmítá.
   */
  async function vlozit(castka, raw) {
    const c = Math.floor(castka);
    if (!(c > 0)) throw new Error('není co ukládat');

    const pred = ciste();
    await klikni(/insertToBank/, (box) => nastav(box, 'deposit', c), '#deposit', raw);
    state = null;

    // kolik doopravdy ubylo z účtu – hra si částku řídí po svém
    await sleep(600);
    const po = ciste();
    const skutecne = (pred != null && po != null) ? pred - po : null;
    return { vlozeno: c, skutecne, sedi: skutecne == null || Math.abs(skutecne - c) <= 1 };
  }

  /** Kolik kliknutí nejvýš – pojistka, aby se to nezacyklilo. */
  const MAX_KROKU = 12;

  /**
   * Uloží všechno nad rezervu, klidně na víc kroků. Hra si u jednoho kliknutí
   * částku řídí po svém, takže se prostě kliká dál, dokud na účtu nezůstane
   * jen rezerva.
   *
   * Pokrok se měří z OKNA banky (`kVkladu`): HUD se překresluje se zpožděním
   * a mezikrok by z něj vypadal jako „nic se nestalo“.
   */
  async function ulozVse() {
    const kroky = [];
    let celkem = 0;

    for (let i = 0; i < MAX_KROKU; i++) {
      const s = await load();
      const u = kUlozeni(s);
      /*
       * Tady se nekouká na `MIN_VKLAD` ani na `bankMinVklad`: ty rozhodují,
       * jestli se vůbec ZAČNE ukládat. Když se jednou začne, dotáhne se to až
       * k rezervě – jinak by po prvním kroku zůstal na účtu zbytek pod prahem
       * a nikdy by se neuložil.
       */
      if (u.castka <= 0) {
        return { ok: true, hotovo: true, celkem, kroky, zbyva: u.castka };
      }

      await vlozit(u.castka, s.raw);
      const po = await load();
      const pohyb = (s.kVkladu != null && po.kVkladu != null)
        ? s.kVkladu - po.kVkladu : null;

      if (!(pohyb > 0)) {
        // jeden krok nepohnul ničím – dál by to jen mlelo naprázdno
        return {
          ok: celkem > 0, hotovo: false, celkem, kroky,
          duvod: 'hra vklad nepřijala'
        };
      }
      celkem += pohyb;
      kroky.push(pohyb);
    }
    return { ok: true, hotovo: false, celkem, kroky, duvod: 'strop kroků' };
  }

  const spinave = () => {
    const el = document.querySelector('.value.renew-dirty_money');
    return el ? NS.parse.toNum(el.textContent) : null;
  };

  /** Vybere ze skladu banky. Částka se píše do `input[name=withdraw]`. */
  async function vybrat(castka, raw) {
    const c = Math.floor(castka);
    if (!(c > 0)) throw new Error('není co vybírat');
    await klikni(VYBRAT, (box) => nastav(box, 'withdraw', c), '#deposit', raw);
    state = null;
    return { vybrano: c };
  }

  /**
   * Převede čisté peníze na špinavé. Kurz je 1:1, takže se neztrácí nic – ale
   * převádí se jen to, co je opravdu potřeba: opačný směr je praní za 30 %.
   */
  /**
   * !!! ÚSPĚCH SE MĚŘÍ, NEPŘEDPOKLÁDÁ !!!
   * Tohle jen kliklo a vrátilo „převedeno“, aniž by se kdokoli podíval, jestli
   * se peníze pohnuly. Když se pak rozbilo potvrzování dialogu, banka hlásila
   * „převedeno 9,1 mil. Kč“ a přitom nepřevedla NIC – peníze zůstaly čisté,
   * materiál se platí špinavými a výrobny stály se zásobou 0. V panelu to
   * přitom vypadalo, že všechno proběhlo.
   *
   * Proto se špinavé peníze přečtou před a po. Přírůstek nemusí být přesný na
   * korunu (mezitím může doběhnout praní nebo zločin), takže se hlídá, že se
   * pohnul aspoň o většinu žádané částky – ne že se rovná.
   */
  const POHNUTO_MIN = 0.9;

  async function prevest(castka, raw) {
    const c = Math.floor(castka);
    if (!(c > 0)) throw new Error('není co převádět');
    const pred = spinave();
    await klikni(PREVEST, (box) => nastav(box, 'amount', c, '#converter'), '#converter', raw);
    state = null;
    /*
     * HUD se překresluje se zpožděním, takže se chvíli počká a zkusí to
     * několikrát – jinak by se ohlásila chyba tam, kde jen ještě nedošel zápis.
     */
    if (pred != null) {
      let po = pred;
      for (let i = 0; i < 6; i++) {
        await sleep(400);
        po = spinave();
        if (po != null && po - pred >= c * POHNUTO_MIN) break;
      }
      if (po == null || po - pred < c * POHNUTO_MIN) {
        throw new Error('převod neproběhl – špinavé se nezvedly ('
          + NS.fmt.kc(pred, { short: true }) + ' → ' + NS.fmt.kc(po, { short: true })
          + ', čekáno +' + NS.fmt.kc(c, { short: true }) + ')');
      }
      return { prevedeno: c, skutecne: po - pred };
    }
    return { prevedeno: c };
  }

  /**
   * Zajistí, aby bylo aspoň `potreba` ŠPINAVÝCH peněz – a ani o korunu víc, než
   * je nutné. Nejdřív se použije, co je na účtu, teprve zbytek se vybere
   * z banky; jinak by se peníze házely tam a zpátky.
   *
   * Vrací, co se udělalo, ať to jde napsat do stavu a nikdo nemusí hádat.
   */
  async function zajisti(potreba) {
    const cil = Math.ceil(potreba);
    const mam = spinave();
    if (mam == null) return { ok: false, duvod: 'špinavé peníze nejde přečíst' };
    /*
     * !!! CELÉ KORUNY NAHORU – KVŮLI HALÉŘŮM !!!
     * Špinavé peníze mají desetinná místa (603,45) a `prevest()`/`vybrat()`
     * částku PODLAHUJÍ. Spočítat „chybí 2 165,55“ a převést 2 165 znamená zůstat
     * o 55 haléřů pod cílem a hra akci odmítne. Stejná chyba shazovala
     * vylepšování budov (tam chybělo 10 haléřů).
     *
     * Přidává se jen zaokrouhlení, ne rezerva jako u vylepšení: převod čistých
     * na špinavé je JEDNOSMĚRNÝ – zpátky se dostanou jen praním za 30 %, takže
     * převádět „pro jistotu“ o sto korun víc by tiše ubíralo majetek.
     */
    const chybi = Math.ceil(cil - mam);
    if (chybi <= 0) return { ok: true, chybelo: 0, kroky: [] };

    let s;
    try { s = await load(); } catch (e) { return { ok: false, duvod: e.message }; }

    const naUctu = s.kVkladu != null ? s.kVkladu : (ciste() || 0);
    const vBance = s.kVyberu != null ? s.kVyberu : 0;
    if (naUctu + vBance < chybi) {
      return {
        ok: false, chybi,
        duvod: 'ani s bankou to nestačí – chybí '
          + NS.fmt.kc(chybi - naUctu - vBance, { short: true })
      };
    }

    const kroky = [];
    // z banky se bere jen to, co na účtu nezbývá
    const zBanky = Math.max(0, chybi - naUctu);
    /*
     * Selhání se vrací jako `{ ok: false, duvod }`, ne vyhozením – stejně jako
     * ostatní důvody výš. Volající tak má jednu cestu, jak to napsat do stavu,
     * a nemůže se stát, že se selhání někde po cestě spolkne a bude to vypadat
     * jako úspěch. (Přesně tím to bylo nepoznatelné: banka hlásila „převedeno“
     * a peníze zůstaly čisté.)
     */
    try {
      if (zBanky > 0) {
        await vybrat(zBanky, s.raw);
        kroky.push('vybráno ' + NS.fmt.kc(zBanky, { short: true }));
        await zapis('vyber', zBanky);
      }
      /*
       * Převod si okno přečte ZNOVU: výběr z banky mezitím změnil zůstatek na
       * účtu a pracovat s fragmentem z doby před výběrem by znamenalo klikat do
       * okna, které o těch penězích ještě neví. Ušetřený požadavek za to nestojí
       * – tohle je přesně to místo, kde se v tomhle projektu ztrácely peníze.
       */
      const p = await prevest(chybi);
      kroky.push('převedeno ' + NS.fmt.kc(chybi, { short: true }));
      await zapis('prevod', chybi);
      return { ok: true, chybelo: chybi, zBanky, kroky, skutecne: p.skutecne };
    } catch (e) {
      return { ok: false, chybi, zBanky, kroky, duvod: e.message };
    }
  }

  /** Sebere hotové praní. Vrací, co hra připsala. */
  async function sebrat() {
    const data = await posli(SEBRAT);
    state = null;
    return { castka: data.money ? NS.parse.toNum(data.money) : null, zprava: data.confirm };
  }

  /* ---- evidence ------------------------------------------------------------ */

  async function zapis(co, castka) {
    const log = NS.store.get().bankLog || {};
    await NS.store.put('bankLog', {
      ...log,
      prani: (log.prani || 0) + (co === 'prani' ? 1 : 0),
      vyprano: (log.vyprano || 0) + (co === 'prani' ? castka : 0),
      sebrani: (log.sebrani || 0) + (co === 'sebrani' ? 1 : 0),
      sebrano: (log.sebrano || 0) + (co === 'sebrani' ? (castka || 0) : 0),
      vklady: (log.vklady || 0) + (co === 'vklad' ? 1 : 0),
      vlozeno: (log.vlozeno || 0) + (co === 'vklad' ? (castka || 0) : 0),
      vybery: (log.vybery || 0) + (co === 'vyber' ? 1 : 0),
      vybrano: (log.vybrano || 0) + (co === 'vyber' ? (castka || 0) : 0),
      prevody: (log.prevody || 0) + (co === 'prevod' ? 1 : 0),
      prevedeno: (log.prevedeno || 0) + (co === 'prevod' ? (castka || 0) : 0),
      firstAt: log.firstAt || Date.now(),
      lastAt: Date.now()
    });
  }

  function stats() {
    const log = NS.store.get().bankLog || {};
    const vyprano = log.vyprano || 0;
    const sebrano = log.sebrano || 0;
    return {
      prani: log.prani || 0, vyprano,
      sebrani: log.sebrani || 0, sebrano,
      vklady: log.vklady || 0, vlozeno: log.vlozeno || 0,
      vybery: log.vybery || 0, vybrano: log.vybrano || 0,
      prevody: log.prevody || 0, prevedeno: log.prevedeno || 0,
      // co je vyprané, ale ještě nesebrané, tady chybí – proto zvlášť
      poplatek: vyprano ? vyprano - Math.round(vyprano * 0.7) : 0,
      firstAt: log.firstAt || null, lastAt: log.lastAt || null
    };
  }

  const reset = () => NS.store.put('bankLog', {});

  /* ---- automatika ----------------------------------------------------------- */

  const autoSet = () => NS.store.get().read.bankAuto === true;
  const autoOn = () => autoSet() && NS.store.get().read.autoPaused !== true;
  /*
   * Ukládání je zvlášť od praní schválně: praní stojí 30 %, ukládání je zdarma.
   * Kdo chce mít peníze v bezpečí, nemusí kvůli tomu platit poplatek.
   */
  const ulozSet = () => NS.store.get().read.bankUloz === true;
  const ulozOn = () => ulozSet() && NS.store.get().read.autoPaused !== true;

  /**
   * Jedno kolo automatiky. SBÍRÁ SE DŘÍV, než se pere – vyprané peníze leží
   * v budově, dokud se nevyzvednou, a nové praní je tam nechá ležet dál.
   */
  /* ---- praní se dočasně vypíná, když výrobny stojí ------------------------- */

  /*
   * !!! PRANÍ JDE PROTI VÝROBNÁM A JEDNA OBRÁTKA STOJÍ 30 % !!!
   * Materiál se platí ŠPINAVÝMI, banka drží ČISTÉ. Převod čisté→špinavé je 1:1,
   * ale praní špinavé→čisté bere 30 %. Ve frontě přitom běží banka PŘED
   * výrobnami, takže bez brzdy vzniká mlýnek na peníze:
   *
   *   tik N    výrobny převedou čisté → špinavé (1:1)
   *   tik N+1  banka je vypere zpátky na čisté (−30 %)
   *   tik N+2  výrobny je zase převedou…
   *
   * Dokud tedy něco stojí a čeká na materiál, praní se VYPNE – a jakmile je
   * všechno odeslané, zase zapne.
   *
   * !!! KDO TEN PŘEPÍNAČ VYPNUL !!!
   * Zapnout se smí jen to, co vypnula automatika. Drží se to v
   * `bankPratPozastaveno`; bez toho by se stalo obojí špatně – zapnulo by se
   * praní, které měl uživatel vypnuté, nebo by zůstalo vypnuté to, které měl
   * zapnuté. Ruční přepnutí příznak maže (viz `autoBox`), takže rozhodnutí
   * uživatele má vždycky přednost.
   *
   * Spíná se to na PŘECHODU, ne podle stavu. Kdyby se to řídilo stavem, tak by
   * automatika a uživatel spolu zápasili: on by praní zapnul, ona by ho hned
   * zase vypnula. Takhle se do rozdělané situace nevrací.
   */
  let drivStalo = null;

  async function hlidejVyrobny() {
    const stoji = !!(NS.vyrobny && NS.vyrobny.necoStoji && NS.vyrobny.necoStoji());
    const bylo = drivStalo;
    drivStalo = stoji;
    if (bylo === null || bylo === stoji) return false;   // jen přechody

    const cfg = NS.store.get().read;
    if (stoji && cfg.bankAuto === true && cfg.bankPratPozastaveno !== true) {
      await NS.store.patch('read', { bankAuto: false, bankPratPozastaveno: true });
      NS.gym.setStatus('banka: praní dočasně vypnuto – výrobny čekají na materiál'
        + ' a praní by jim špinavé bralo za 30 %. Zapne se samo, až bude'
        + ' všechno odeslané.');
      NS.gym.collect();
      return true;
    }
    if (!stoji && cfg.bankPratPozastaveno === true) {
      await NS.store.patch('read', { bankAuto: true, bankPratPozastaveno: false });
      NS.gym.setStatus('banka: praní zase zapnuto – výrobny běží.');
      NS.gym.collect();
      return true;
    }
    return false;
  }

  async function autoTick() {
    if (NS.jail && NS.jail.blocked()) return false;
    /*
     * Hlídání běží PŘED kontrolou zapnutosti: když si praní automatika vypnula,
     * musí ho mít jak zapnout zpátky. Proto je `bankPratPozastaveno` i mezi
     * podmínkami, za kterých se banka vůbec zařadí do fronty (viz gym.js).
     */
    await hlidejVyrobny().catch(() => {});
    if (!ulozOn() && !autoOn()) return false;

    /*
     * Stav se čte JEDNOU na začátku a použije se pro obojí. Kdyby se ukládání
     * počítalo z HUD, poslalo by o korunu víc, než na účtu je (HUD je
     * zaokrouhlený), a hra by vklad odmítla.
     */
    let s;
    try { s = await load(); } catch (e) {
      NS.gym.setStatus('⚠ banka: ' + e.message, true);
      return false;
    }

    /*
     * Ukládání jde první a nezávisle na praní: je zdarma a smyslem je nemít
     * peníze na účtu, odkud se dají ukrást. Praní naopak stojí 30 %, takže
     * kdo chce jen bezpečí, zapne si tohle a praní ne.
     */
    if (ulozOn()) {
      const u = kUlozeni(s);
      const en = energieStaci();
      if (u.staci && !en.ok) {
        NS.gym.setStatus('banka: čeká se s uložením '
          + NS.fmt.kc(u.castka, { short: true }) + ' – energie '
          + NS.fmt.num(en.energie) + ' pod hranicí ' + NS.fmt.num(en.min), true);
      } else if (!u.staci) {
        /*
         * !!! MLČENÍ JE HORŠÍ NEŽ HLÁŠKA !!!
         * Když hranice vkladu brání uložení, dřív se nedělo NIC a nic se
         * neřeklo – zvenčí to vypadá jako rozbité ukládání. Právě takhle
         * vypadala hranice 1 000 000: uživatel měl na účtu tisíce, čekal, že se
         * uloží zbytek nad rezervou, a v liště ani slovo.
         *
         * Neopakuje se to každý tik (to by přebíjelo všechno ostatní), ale jednou
         * za `HLASKA_KAZDYCH` a při změně důvodu.
         */
        const prah = Math.max(MIN_VKLAD, u.prah);
        const ted = Date.now();
        const klic = u.castka + '/' + prah;
        if (u.mam != null && (klic !== poslednDuvod || ted - hlaskaAt > HLASKA_KAZDYCH)) {
          poslednDuvod = klic;
          hlaskaAt = ted;
          NS.gym.setStatus('banka: neukládá se – nad rezervou '
            + NS.fmt.kc(u.nechat, { short: true }) + ' je '
            + NS.fmt.kc(u.castka, { short: true }) + ', ukládá se až od '
            + NS.fmt.kc(prah, { short: true })
            + ' (změň v nastavení, 0 = vlož všechno nad rezervu).');
        }
      } else if (u.staci) {
        try {
          /*
           * Klika se dokud není hotovo – hra u jednoho kliknutí přesune, kolik
           * uzná za vhodné, takže jeden pokus nestačí.
           */
          const v = await ulozVse();
          if (v.celkem > 0) await zapis('vklad', v.celkem);

          if (!v.ok) {
            /*
             * !!! JEDNO SELHÁNÍ AUTOMATIKU NEVYPÍNÁ !!!
             * Dřív se po prvním neúspěchu `bankUloz` vypnul natrvalo. Stačilo
             * jedno přechodné odmítnutí (nebo doba, kdy byla chybná hranice
             * vkladu) a ukládání zůstalo vypnuté – uživatel to viděl jako
             * „ukládání do banky nefunguje“ a hlášku v liště už dávno přepsala
             * jiná. A na rozdíl od pokeru tu selhání nic NESTOJÍ: vklad je
             * zdarma, takže vypínat po prvním pokusu je nepřiměřené.
             */
            selhaniVkladu++;
            if (selhaniVkladu < MAX_SELHANI) {
              NS.gym.setStatus('⚠ banka: uložit se nepovedlo (' + v.duvod
                + ') – zkusím to znovu (' + selhaniVkladu + '/' + MAX_SELHANI + ').',
              true);
              return false;
            }
            await NS.store.patch('read', { bankUloz: false });
            NS.gym.setStatus('⛔ banka: uložit se nepovedlo ' + MAX_SELHANI
              + '× za sebou (' + v.duvod + ') – automatické ukládání vypnuto.'
              + ' Zapneš ho zaškrtávátkem „ukládat“ v liště.', true);
            NS.gym.collect();
            return false;
          }
          selhaniVkladu = 0;

          NS.gym.setStatus('banka: uloženo ' + NS.fmt.kc(v.celkem, { short: true })
            + (v.kroky.length > 1 ? ' na ' + v.kroky.length + ' kroků' : '')
            + (u.nechat ? ', necháno ' + NS.fmt.kc(u.nechat, { short: true }) : '')
            + (!v.hotovo ? ' – zbytek příště' : ''));
          NS.gym.collect();
          return true;
        } catch (e) {
          if (!e.pereSe) NS.gym.setStatus('⚠ banka: ' + e.message, true);
          return false;
        }
      }
    }

    if (!autoOn()) return false;

    /*
     * Sebrání jde první: vyprané peníze leží v budově, dokud se nevyzvednou,
     * a nové praní by je tam nechalo ležet dál.
     */
    if (s.hotovych) {
      try {
        const v = await sebrat();
        await zapis('sebrani', v.castka);
        NS.gym.setStatus('banka: sebráno '
          + (v.castka != null ? NS.fmt.kc(v.castka, { short: true }) : 'vyprané'));
        NS.gym.collect();
        return true;
      } catch (e) {
        if (!e.pereSe) NS.gym.setStatus('⚠ banka: ' + e.message, true);
        return false;
      }
    }

    if (kPrani(s).castka >= MIN_PRANI) {
      try {
        const v = await prat();
        await zapis('prani', v.vyprano);
        NS.gym.setStatus('banka: pere se ' + NS.fmt.kc(v.vyprano, { short: true })
          + ' → ' + NS.fmt.kc(v.dostanu, { short: true }) + ' (pak sebrat)');
        NS.gym.collect();
        return true;
      } catch (e) {
        // běžící praní se přejde mlčky – za pět sekund to zkusí znovu
        if (!e.pereSe) NS.gym.setStatus('⚠ banka: ' + e.message, true);
        return false;
      }
    }
    return false;
  }

  /* ---- lišta --------------------------------------------------------------- */

  /**
   * Dvě tlačítka do řádku budov. Stav se načítá na pozadí, takže se při prvním
   * vykreslení ještě neví, co banka umí – řádek se pak sám překreslí.
   */
  function buttons(onChange) {
    const s = cerstvy();
    if (!s) {
      load().then(() => onChange()).catch(() => {});
      return [];
    }
    if (Date.now() - stateAt >= TTL) load().then(() => onChange()).catch(() => {});

    const tlacitko = (text, aktivni, popis, akce) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cmc-gym-btn cmc-gym-unit '
        + (aktivni ? 'cmc-gym-unit-send' : 'cmc-gym-unit-away');
      b.textContent = text;
      b.disabled = !aktivni;
      b.title = popis;
      if (aktivni) {
        b.addEventListener('click', async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (b.disabled) return;
          b.disabled = true;
          try { await akce(); } catch (e) {
            // „už se pere“ není chyba hráče – nemá cenu na to křičet červeně
            NS.gym.setStatus((e.pereSe ? 'banka: ' : '⚠ banka: ') + e.message, !e.pereSe);
            b.disabled = false;
          }
          onChange();
        });
      }
      return b;
    };

    const p = kPrani(s);
    const lzePrat = p.castka >= MIN_PRANI;

    /*
     * Rezerva ŠPINAVÝCH: kolik nechat nevypraných. Špinavými se platí materiál
     * pro výrobny, takže vyprat je do posledního by je vyhladovělo.
     */
    const rezervaSpinave = document.createElement('input');
    rezervaSpinave.type = 'number';
    rezervaSpinave.className = 'cmc-casino-input cmc-bank-keep-dirty';
    rezervaSpinave.min = '0';
    rezervaSpinave.step = '100000';
    rezervaSpinave.value = String(p.nechat);
    rezervaSpinave.title = 'Kolik ŠPINAVÝCH nechat nevypraných. Platí se jimi'
      + ' materiál pro výrobny, takže vyprat všechno by je nechalo bez nákupu.'
      + ' Pere se nejvýš tolik, aby tahle částka zbyla.';
    rezervaSpinave.addEventListener('click', e => e.stopPropagation());
    rezervaSpinave.addEventListener('change', async () => {
      const v = Math.max(0, Math.round(+rezervaSpinave.value || 0));
      rezervaSpinave.value = String(v);
      await NS.store.patch('read', { bankKeepDirty: v });
      onChange();
    });

    const prani = tlacitko('🧼 Prát', lzePrat,
      lzePrat
        ? 'Vypere ' + NS.fmt.kc(p.castka, { short: true }) + ' špinavých → dostaneš '
          + NS.fmt.kc(Math.round(p.castka * 0.7), { short: true })
          + ' čistých (hra si bere 30 %).'
          + (p.omezeno ? ' Hra by nabídla ' + NS.fmt.kc(p.nabizi, { short: true })
            + ', ale rezerva ' + NS.fmt.kc(p.nechat, { short: true })
            + ' zůstane nevypraná.' : ' Víc hra na téhle úrovni nenabízí.')
          + ' POZOR: čisté peníze přijdou až po sebrání.'
        : 'Není co prát – zbývá jen ' + NS.fmt.kc(p.castka, { short: true })
          + (p.omezeno ? ' (rezerva ' + NS.fmt.kc(p.nechat, { short: true })
            + ' se nepere)' : '') + '.',
      async () => {
        NS.gym.setStatus('banka: peru ' + NS.fmt.kc(p.castka, { short: true }) + '…');
        const v = await NS.gym.withSuspend(() => prat());
        await zapis('prani', v.vyprano);
        NS.gym.setStatus('banka: pere se ' + NS.fmt.kc(v.vyprano, { short: true })
          + ' → ' + NS.fmt.kc(v.dostanu, { short: true }) + ' (pak sebrat)');
      });

    const sber = tlacitko('💰 Sebrat', s.hotovych > 0,
      s.hotovych
        ? 'Sebere vyprané peníze'
          + (s.kSebrani ? ' (' + NS.fmt.kc(s.kSebrani, { short: true }) + ')' : '')
          + '. Dokud se nesebere, leží v budově.'
        : 'Není co sebrat – nic vypraného nečeká.',
      async () => {
        const v = await NS.gym.withSuspend(() => sebrat());
        await zapis('sebrani', v.castka);
        NS.gym.setStatus('banka: sebráno '
          + (v.castka != null ? NS.fmt.kc(v.castka, { short: true }) : 'vyprané'));
      });

    /*
     * Ukládání: políčko „kolik nechat“ a tlačítko. Rezerva je tu schválně
     * v liště a ne jen v předvolbách – mění se podle toho, co člověk zrovna
     * plánuje kupovat, takže má být po ruce.
     */
    const rezerva = document.createElement('input');
    rezerva.type = 'number';
    rezerva.className = 'cmc-casino-input cmc-bank-keep';
    rezerva.min = '0';
    rezerva.step = '100000';
    rezerva.value = String(Math.max(0, Math.round(+NS.store.get().read.bankKeep || 0)));
    rezerva.title = 'Kolik ČISTÝCH peněz nechat mimo banku. Zbytek se uloží do'
      + ' skladu – tam na ně nikdo nedosáhne. Nula znamená uložit všechno.';
    rezerva.addEventListener('click', e => e.stopPropagation());
    rezerva.addEventListener('change', async () => {
      const v = Math.max(0, Math.round(+rezerva.value || 0));
      rezerva.value = String(v);
      await NS.store.patch('read', { bankKeep: v });
      onChange();
    });

    const u = kUlozeni(s);
    const en = energieStaci();
    /*
     * Ručně jde uložit i pod nastaveným prahem – ten je proti tomu, aby
     * AUTOMATIKA cucala energii po drobných. Klikne-li si člověk sám, ví, co
     * dělá; jen se mu to řekne v popisku.
     */
    const lzeUlozit = u.castka >= MIN_VKLAD;
    const uloz = tlacitko('🏦 Uložit', lzeUlozit,
      lzeUlozit
        ? 'Uloží ' + NS.fmt.kc(u.castka, { short: true }) + ' do skladu banky'
          + (u.nechat ? ' a nechá ' + NS.fmt.kc(u.nechat, { short: true })
            + ' na účtu' : '')
          + (s.vBance != null ? '. Ve skladu už je ' + NS.fmt.kc(s.vBance, { short: true })
            + '.' : '')
          + ' POZOR: vklad stojí ENERGII, takže se vyplatí ukládat po větších'
          + ' částkách – jeden velký vklad stojí stejně jako deset malých.'
          + (!u.staci ? ' Automatika zatím čeká na '
            + NS.fmt.kc(u.prah, { short: true }) + '.' : '')
          + (!en.ok ? ' Automatika čeká i na energii (teď ' + NS.fmt.num(en.energie)
            + ', hranice ' + NS.fmt.num(en.min) + ').' : '')
        : 'Není co ukládat – nad rezervou '
          + NS.fmt.kc(u.nechat, { short: true }) + ' zbývá jen '
          + NS.fmt.kc(u.castka, { short: true }) + ' (minimum je '
          + NS.fmt.kc(MIN_VKLAD, { short: true }) + ').',
      async () => {
        NS.gym.setStatus('banka: ukládám ' + NS.fmt.kc(u.castka, { short: true }) + '…');
        const v = await NS.gym.withSuspend(() => ulozVse());
        if (v.celkem > 0) await zapis('vklad', v.celkem);
        NS.gym.setStatus(v.celkem > 0
          ? 'banka: uloženo ' + NS.fmt.kc(v.celkem, { short: true })
            + (v.kroky.length > 1 ? ' na ' + v.kroky.length + ' kroků' : '')
            + (!v.hotovo ? ' – zbytek zůstal' : '')
          : '⚠ banka: uložit se nepovedlo (' + (v.duvod || 'neznámo') + ')',
          v.celkem === 0);
      });

    return [rezervaSpinave, prani, sber, rezerva, uloz];
  }

  const POPIS_SKUPINY = 'Budova #22. Vypere maximum, které hra nabídne, a pak se'
    + ' vyprané musí SEBRAT – do té doby leží v budově. Hra si bere 30 %'
    + ' (100 Kč = 70 Kč), takže to není zdarma.';

  /** Obecné zaškrtávátko, ať se to nepíše dvakrát. */
  function box(onChange, zapnuto, klic, popisek, popis) {
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává. ' : '') + popis;

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto;
    inp.addEventListener('change', async () => {
      /*
       * Ruční přepnutí = rozhodl uživatel, takže automatika ztrácí vlastnictví
       * praní. Bez smazání příznaku by mu praní buď zase vypnula, nebo by ho
       * později zapnula, i když si ho vypnul sám.
       */
      await NS.store.patch('read',
        { [klic]: inp.checked, bankPratPozastaveno: false });
      onChange();
    });
    wrap.appendChild(inp);

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = popisek + (zapnuto && pozastaveno ? ' ⏸' : '');
    wrap.appendChild(txt);
    return wrap;
  }

  /**
   * Dvě zaškrtávátka: praní a ukládání. Zvlášť schválně – praní stojí 30 %,
   * ukládání je zdarma, takže kdo chce jen bezpečí, nemusí platit poplatek.
   */
  function autoBox(onChange) {
    const obal = document.createElement('span');
    obal.className = 'cmc-gym-bank-autos';
    obal.appendChild(box(onChange, autoSet(), 'bankAuto', 'prát',
      'Automaticky sebere vyprané a pak vypere maximum, co hra nabídne.'
      + ' Sbírá se dřív než pere, aby peníze nezůstávaly ležet v budově.'
      + ' Hra si z praní bere 30 %, takže to není zdarma – zapíná se schválně.'));
    obal.appendChild(box(onChange, ulozSet(), 'bankUloz', 'ukládat',
      'Automaticky ukládá čisté peníze nad rezervou do skladu banky – tam na ně'
      + ' nikdo nedosáhne. Je to ZDARMA – žádný poplatek jako u praní (30 %)'
      + ' a ani energie (změřeno). Čeká se jen na nastavenou částku, ať se to'
      + ' nedělá pořád dokola. POZOR: hra si částku vkladu řídí po svém, takže'
      + ' se po každém vkladu ověří, kolik se doopravdy přesunulo – když to'
      + ' nesedí, ukládání se samo vypne.'));
    return obal;
  }

  /** Původní jednoduché zaškrtávátko – zůstává pro zpětnou kompatibilitu. */
  function autoBoxPrani(onChange) {
    const zapnuto = autoSet();
    const pozastaveno = NS.store.get().read.autoPaused === true;
    const wrap = document.createElement('label');
    wrap.className = 'cmc-gym-auto-box'
      + (zapnuto && !pozastaveno ? ' cmc-gym-auto-on' : '')
      + (zapnuto && pozastaveno ? ' cmc-gym-auto-paused' : '');
    wrap.title = (zapnuto && pozastaveno
      ? 'POZASTAVENO hlavním vypínačem – volba zůstává. '
      : '')
      + 'Automaticky sebere vyprané a pak vypere maximum, co hra nabídne.'
      + ' Sbírá se dřív než pere, aby peníze nezůstávaly ležet v budově.'
      + ' Hra si z praní bere 30 %, takže to není zdarma – zapíná se to schválně.';

    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = zapnuto;
    inp.addEventListener('change', async () => {
      await NS.store.patch('read', { bankAuto: inp.checked });
      onChange();
    });
    wrap.appendChild(inp);

    const txt = document.createElement('span');
    txt.className = 'cmc-gym-auto-label';
    txt.textContent = 'auto' + (zapnuto && pozastaveno ? ' ⏸' : '');
    wrap.appendChild(txt);
    return wrap;
  }

  NS.bank = {
    load, prat, sebrat, vlozit, ulozVse, vybrat, prevest, zajisti, nastav,
    kUlozeni, kPrani,
    MAX_KROKU,
    energieStaci, klikni,
    autoTick, autoSet, autoOn, ulozSet, ulozOn, buttons, autoBox, autoBoxPrani,
    POPIS_SKUPINY,
    MIN_VKLAD,
    stats, reset, zapis, state: () => state, MIN_PRANI, BUILDING, PRAT, SEBRAT
  };
})();
