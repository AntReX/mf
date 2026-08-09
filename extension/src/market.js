/* =============================================================================
 * market.js – evidence předmětů: produkt → varianty → kusy, a k tomu ceny
 *
 * Hra ti u předmětu neřekne nic o jeho historii: kolik se za takový draží, jak
 * dobrý kus máš proti ostatním, ani co jsi za něj kdy dal. Tohle to sbírá.
 *
 * !!! TŘI ÚROVNĚ IDENTITY A KAŽDÁ JE Z JINÉHO MÍSTA !!!
 * Změřeno v běžící hře, ne odhadnuto:
 *
 *   MASTER (produkt)  cesta obrázku bez přípony
 *                     `/main/inventory/clothes/hats/rare/warrior_helmet.webp`
 *                     → `clothes/hats/rare/warrior_helmet`
 *                     Nese i KATEGORII (`clothes/hats`) a VZÁCNOST (`rare`),
 *                     což z názvu vyčíst nejde – proto ne název.
 *
 *   VARIANTA          produkt + kvalita v procentech + hodnota statu
 *                     Stejné boty viděné jako +0,62 % / +21 144 a +13,69 % /
 *                     +2 001 661. Kvalita je vlastnost KUSU, ne produktu.
 *
 *   KUS (instance)    `data-item-id` v inventáři (např. 158226)
 *
 * !!! AUKCE A INVENTÁŘ SE SPOJIT NEDAJÍ !!!
 * Aukce `data-item-id` NEMÁ (0 výskytů) a číslo `#4076` v jejím popisku není
 * identita kusu, ale POŘADÍ V ŽEBŘÍČKU – text zní „#4076 na místě“ a dražší boty
 * mají nižší číslo (#760). Koupený kus se proto v inventáři automaticky
 * nedohledá; cena se k němu přiřazuje RUČNĚ (tlačítko „uložit cenu“).
 *
 * !!! KONEČNÁ CENA AUKCE SE NEDOZVÍ !!!
 * Vidí se jen průběh do vypršení, ne kdo vyhrál a za kolik. Vedená cena je tedy
 * POSLEDNÍ VIDĚNÁ NABÍDKA, což je dolní odhad – a je to tak i pojmenované, ať to
 * nikdo nečte jako prodejní cenu.
 *
 * !!! OBRÁZEK SE UKLÁDÁ JAKO CESTA, NE JAKO DATA !!!
 * U masteru se drží cesta (`/main/inventory/...webp`) a vykresluje se z CDN hry.
 * Base64 by při stovkách produktů zabral megabajty ve storage a k ničemu by to
 * nebylo – hra je stejně potřeba mít dostupnou.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /** Kolik nabídek se drží u jednoho produktu. Starší se zahazují. */
  const NABIDEK_MAX = 40;
  /** Strop produktů, ať storage neroste bez konce. */
  const PRODUKTU_MAX = 400;

  const num = v => (Number.isFinite(+v) ? +v : null);

  /* ---- identita ------------------------------------------------------------ */

  /**
   * Master z cesty obrázku. Vrací i kategorii a vzácnost, protože jsou v ní –
   * `/main/inventory/clothes/hats/rare/warrior_helmet.webp`.
   *
   * Dotaz i cache-busting (`?v=…`) se odstřihnou, jinak by se stejný produkt
   * evidoval podle verze assetu vícekrát.
   */
  function zObrazku(src) {
    const cesta = String(src || '').split('?')[0].split('#')[0]
      .replace(/^https?:\/\/[^/]+/, '');
    const m = cesta.match(/\/inventory\/(.+)\.(webp|png|jpe?g|gif|svg)$/i);
    if (!m) return null;
    const kusy = m[1].split('/');
    const nazevSouboru = kusy[kusy.length - 1];
    /*
     * Vzácnost je předposledním prvkem cesty, ale jen když je to jedno ze
     * známých slov – u `drinks/luckelixir.webp` žádná není a nesmí se za ni
     * vzít „drinks“.
     */
    const VZACNOSTI = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    const mozna = kusy.length > 1 ? kusy[kusy.length - 2] : null;
    const vzacnost = VZACNOSTI.includes(mozna) ? mozna : null;
    const kategorie = kusy.slice(0, vzacnost ? -2 : -1).join('/') || null;
    return {
      id: m[1],                       // celá cesta bez přípony = master
      soubor: nazevSouboru,
      kategorie,
      vzacnost,
      obrazek: cesta
    };
  }

  /**
   * !!! DRUH STATU JE V TŘÍDĚ IKONY, NE V TEXTU !!!
   * Změřeno v běžící hře. Karta předmětu vypadá takhle:
   *
   *   <div class="badge">
   *     <div class="icon rarity-rare"></div>
   *     <div class="rank">+0.23%</div>        ← KVALITA
   *   </div>
   *   <div class="rank bottom">
   *     <div class="icon defense"></div>      ← DRUH STATU
   *     +1                                    ← HODNOTA
   *   </div>
   *
   * V TEXTU druh statu není vůbec – „Válečná helma +1.05% +5 263.24“ neřekne, že
   * je to obrana. Proto se čte z DOM.
   *
   * A pozor: stat je vlastnost PRODUKTU, ne kategorie. Dvě kočky ze `pets/rare/`
   * mají různý stat (zrzavá obranu, bílá rychlost), takže se odvozovat z cesty
   * obrázku nedá.
   */
  const STATY = {
    strength: 'síla',
    defense: 'obrana',
    speed: 'rychlost',
    'resources-happy': 'štěstí'
  };
  const nazevStatu = k => STATY[k] || k || null;

  /** Třída ikony bez `icon` – z ní se pozná stat i vzácnost. */
  const tridaIkony = el => (el
    ? [...el.classList].filter(c => c !== 'icon').join('.')
    : null);

  /**
   * Přečte kartu předmětu z DOM. Vrací i to, co v textu není – druh statu.
   *
   * Používá se pro inventář i aukci; aukce `.rank.bottom` NEMÁ (změřeno: nula
   * výskytů), takže tam `stat` vyjde `null` a doplní se z toho, co o produktu
   * víme z inventáře.
   */
  function zKarty(el) {
    if (!el || !el.querySelector) return {};
    const dolni = el.querySelector('.rank.bottom');
    const badge = el.querySelector('.badge');
    const kvalitaEl = badge ? badge.querySelector('.rank') : null;
    return {
      nazevZDom: ((el.querySelector('.over-name') || {}).textContent || '')
        .replace(/\s+/g, ' ').trim() || null,
      kvalitaZDom: kvalitaEl
        ? num(String(kvalitaEl.textContent || '').replace('%', '').replace(',', '.').trim())
        : null,
      stat: dolni ? tridaIkony(dolni.querySelector('.icon')) : null,
      hodnotaZDom: dolni
        ? num(String(dolni.textContent || '').replace(/[+\s ]/g, '').replace(',', '.'))
        : null,
      vzacnostIkona: badge
        ? (tridaIkony(badge.querySelector('.icon[class*=rarity-]')) || '')
          .replace(/^rarity-/, '') || null
        : null
    };
  }

  /**
   * Kvalita v procentech („+1.05%“) a hodnota statu („+5 263.24“) z TEXTU.
   * Používá se jako záloha, když se karta nedá přečíst z DOM.
   *
   * Pozor na pořadí: procento se musí vytáhnout PRVNÍ a z textu odstranit,
   * jinak by ho `hodnota` sebrala jako své číslo.
   */
  function zeStatu(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const mp = t.match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
    const kvalita = mp ? num(String(mp[1]).replace(',', '.')) : null;
    const bez = mp ? t.replace(mp[0], ' ') : t;
    const mh = bez.match(/[+-]\s*(\d[\d\s ]*(?:[.,]\d+)?)/);
    const hodnota = mh ? num(String(mh[1]).replace(/[\s ]/g, '').replace(',', '.')) : null;
    /*
     * Mazlíčci a karty mají tři staty zvlášť („Síla +3 606 Obrana +3 606
     * Rychlost +3 606“) – vypíšou se pojmenované, protože u nich jedno číslo
     * nestačí.
     */
    const jmenovane = {};
    for (const [jm, re] of [['sila', /Síla\s*\+?\s*([\d\s ]+)/i],
      ['obrana', /Obrana\s*\+?\s*([\d\s ]+)/i],
      ['rychlost', /Rychlost\s*\+?\s*([\d\s ]+)/i]]) {
      const m = t.match(re);
      if (m) jmenovane[jm] = num(String(m[1]).replace(/[\s ]/g, ''));
    }
    return { kvalita, hodnota, staty: Object.keys(jmenovane).length ? jmenovane : null };
  }

  /**
   * Název bez procent, statů a žebříčkového „#123 na místě“.
   *
   * !!! NA POŘADÍ NÁHRAD ZÁLEŽÍ !!!
   * Ceny se musí odstranit DŘÍV než osamocená čísla se znaménkem – jinak
   * „+21 144 | #4076 na místě 130 000Kč“ nechá za sebou samotné „Kč“, protože
   * číslo před ním už bylo snědeno. Sedmkrát to vyšlo správně a osmé přidání
   * pravidla to rozbilo, tak je to teď rozepsané v tomhle pořadí.
   */
  function ocistiNazev(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[+-]?\d+(?:[.,]\d+)?\s*%/g, ' ')          // kvalita
      .replace(/#\d+\s*na\s+místě/gi, ' ')                // žebříček
      .replace(/\d{2}:\d{2}:\d{2}/g, ' ')                 // odpočet
      .replace(/[\d\s .,]+(mld|mil|tis)?\.?\s*Kč/gi, ' ') // cena VČETNĚ jednotky
      .replace(/\b(Síla|Obrana|Rychlost)\b/gi, ' ')
      .replace(/[+-]\s*\d[\d\s .,]*/g, ' ')               // zbylé staty
      .replace(/Nabídnout cenu|Požadovaná úroveň[^]*$/gi, ' ')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---- čtení aukce --------------------------------------------------------- */

  /**
   * Nabídky z fragmentu aukce (budova #2). Vrací i speciální aukce, ale
   * označené – jsou to spotřebáky bez kvality a statů, takže se do statistik
   * produktů nemíchají.
   */
  function zAukce(raw) {
    const d = new DOMParser().parseFromString(String(raw || ''), 'text/html');
    const out = [];
    for (const lot of d.querySelectorAll('.static-inv')) {
      const bid = lot.querySelector('[action*="/bid/"]');
      if (!bid) continue;
      const akce = bid.getAttribute('action') || '';
      const img = lot.querySelector('img');
      const master = img ? zObrazku(img.getAttribute('src')) : null;
      if (!master) continue;

      const t = (lot.textContent || '').replace(/\s+/g, ' ').trim();
      const zt = zeStatu(t);
      const k = zKarty(lot);
      /*
       * V aukci `.rank.bottom` NENÍ (změřeno: nula výskytů), takže druh statu se
       * odsud nedozvíme. Doplní se při ukládání z toho, co o produktu víme
       * z inventáře – stat je vlastnost produktu.
       */
      out.push({
        master: master.id,
        nazev: k.nazevZDom || ocistiNazev(t),
        stat: k.stat,
        kategorie: master.kategorie,
        vzacnost: k.vzacnostIkona || master.vzacnost,
        obrazek: master.obrazek,
        lotId: (akce.match(/\/bid\/(\d+)/) || [])[1] || null,
        specialni: /auctionSpecial/.test(akce),
        cena: NS.parse.byRe(t, /([\d\s .,]+)\s*(?:mld|mil|tis)?\.?\s*Kč/i),
        // hra píše i „1.7 mld Kč“ – jednotka se dopočítá zvlášť
        jednotka: (t.match(/(mld|mil|tis)\.?\s*Kč/i) || [])[1] || null,
        kvalita: k.kvalitaZDom != null ? k.kvalitaZDom : zt.kvalita,
        hodnota: k.hodnotaZDom != null ? k.hodnotaZDom : zt.hodnota,
        staty: zt.staty,
        // pořadí v žebříčku, NE identita kusu (text zní „#4076 na místě“)
        poradi: num((t.match(/#(\d+)\s*na\s+místě/i) || [])[1]),
        konciZa: num(lot.getAttribute('data-time'))
      });
    }
    return out;
  }

  /* ---- čtení inventáře ----------------------------------------------------- */

  /** Kusy z fragmentu inventáře. `data-item-id` je identita kusu. */
  function zInventare(raw) {
    const d = new DOMParser().parseFromString(String(raw || ''), 'text/html');
    const out = [];
    for (const el of d.querySelectorAll('[data-item-id]')) {
      const img = el.querySelector('img');
      const master = img ? zObrazku(img.getAttribute('src')) : null;
      if (!master) continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const zt = zeStatu(t);
      const k = zKarty(el);
      out.push({
        instance: el.getAttribute('data-item-id'),
        master: master.id,
        nazev: k.nazevZDom || ocistiNazev(t),
        kategorie: master.kategorie,
        // vzácnost z ikony potvrzuje tu z cesty obrázku; ikona vyhrává
        vzacnost: k.vzacnostIkona || master.vzacnost,
        obrazek: master.obrazek,
        // DOM má přednost – v textu je jen číslo, ne druh statu
        kvalita: k.kvalitaZDom != null ? k.kvalitaZDom : zt.kvalita,
        hodnota: k.hodnotaZDom != null ? k.hodnotaZDom : zt.hodnota,
        stat: k.stat,
        // karty mají všechny tři staty pojmenované v textu, `.rank.bottom` nemají
        staty: zt.staty
      });
    }
    return out;
  }

  /* ---- ukládání ------------------------------------------------------------ */

  const prazdny = () => ({ produkty: {} });
  const data = () => {
    const s = NS.store.get().market;
    return s && s.produkty ? s : prazdny();
  };

  /** Založí nebo doplní produkt. Obrázek se drží jako cesta, ne jako data. */
  function produkt(db, zapis) {
    const p = db.produkty[zapis.master] || {
      id: zapis.master, nazev: zapis.nazev || zapis.master,
      kategorie: zapis.kategorie || null, vzacnost: zapis.vzacnost || null,
      obrazek: zapis.obrazek || null,
      kusy: {}, nabidky: [], ceny: []
    };
    // název i obrázek se doplní, když je poprvé známe (aukce je popisuje lépe)
    if (!p.nazev || p.nazev === p.id) p.nazev = zapis.nazev || p.nazev;
    if (!p.obrazek && zapis.obrazek) p.obrazek = zapis.obrazek;
    if (!p.kategorie && zapis.kategorie) p.kategorie = zapis.kategorie;
    if (!p.vzacnost && zapis.vzacnost) p.vzacnost = zapis.vzacnost;
    /*
     * !!! DRUH STATU JE VLASTNOST PRODUKTU !!!
     * V aukci ho hra neuvádí (`.rank.bottom` tam není), v inventáři ano. Jak ho
     * jednou uvidíme, platí pro produkt – takže i pro dražby téhož předmětu,
     * které jsme viděli dřív. Odvozovat ho z kategorie NELZE: dvě kočky ze
     * `pets/rare/` mají různý stat (zrzavá obranu, bílá rychlost).
     */
    if (!p.stat && zapis.stat) p.stat = zapis.stat;
    /*
     * Karty (`cards/…`) jediný `stat` nemají – vypisují síla/obrana/rychlost
     * v textu. Drží se tedy i pojmenovaná trojice, jinak by u karet nebylo
     * v tabulce vidět nic.
     */
    if (!p.staty && zapis.staty) p.staty = zapis.staty;
    db.produkty[zapis.master] = p;
    return p;
  }

  /**
   * Zapíše nabídky z aukce. Stejná dražba (`lotId`) se jen aktualizuje – jinak
   * by z jednoho lotu vzniklo tolik záznamů, kolikrát se aukce přečetla.
   */
  async function ulozAukci(nabidky, ted = Date.now()) {
    const db = data();
    let novych = 0, aktualizovanych = 0;
    for (const n of nabidky) {
      if (!n.master) continue;
      const p = produkt(db, n);
      const stary = n.lotId ? p.nabidky.find(x => x.lotId === n.lotId) : null;
      const zaznam = {
        lotId: n.lotId, cena: n.cena, jednotka: n.jednotka,
        kvalita: n.kvalita, hodnota: n.hodnota,
        /*
         * Staty se ukládají u KAŽDÉHO záznamu, ne jen u kusů z inventáře. Aukce
         * druh statu neuvádí, tak se bere z produktu – a zapíše se do záznamu,
         * ať v CSV i po smazání produktu sedí, co ta dražba nabízela.
         */
        stat: n.stat || p.stat || null,
        staty: n.staty || p.staty || null,
        specialni: !!n.specialni, poradi: n.poradi,
        prvni: stary ? stary.prvni : ted, at: ted
      };
      if (stary) { Object.assign(stary, zaznam); aktualizovanych++; }
      else { p.nabidky.unshift(zaznam); novych++; }
      if (p.nabidky.length > NABIDEK_MAX) p.nabidky.length = NABIDEK_MAX;
    }
    await uloz(db);
    return { novych, aktualizovanych };
  }

  /** Zapíše kusy z inventáře. Kus se pozná podle `data-item-id`. */
  async function ulozInventar(kusy, ted = Date.now()) {
    const db = data();
    let novych = 0;
    const videne = new Set();
    for (const k of kusy) {
      if (!k.master || !k.instance) continue;
      const p = produkt(db, k);
      videne.add(k.master + '|' + k.instance);
      if (!p.kusy[k.instance]) novych++;
      p.kusy[k.instance] = {
        ...(p.kusy[k.instance] || {}),
        kvalita: k.kvalita, hodnota: k.hodnota, staty: k.staty,
        stat: k.stat || (p.kusy[k.instance] || {}).stat || null,
        videnAt: ted
      };
    }
    await uloz(db);
    return { novych, kusu: videne.size };
  }

  /**
   * Slug z názvu – základ ručního masteru, když není z čeho vzít cestu obrázku.
   * Diakritika se rozkládá, ať `Válečná helma` nedá `v-le-n-helma`.
   */
  function slug(text) {
    return String(text || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /**
   * !!! RUČNĚ PŘIDANÝ PRODUKT !!!
   * Seznam se plní sám ze čtení aukce a inventáře, ale to nestačí: co v aukci
   * neproletělo a v inventáři není (nebo se z něj nepřečetlo), by se do evidence
   * nedostalo NIKDY a nešlo by k tomu vést ani cenu.
   *
   * Master se bere z cesty obrázku, když ji uživatel zadá – tím se ruční záznam
   * SPOJÍ s tím, co později najde sběr. Bez cesty vznikne `rucne/<slug názvu>`,
   * což je samostatná položka: sběr o ní neví a nespojí se s ní. Je to řečené
   * i v UI, ať to není překvapení.
   */
  async function pridejProdukt(zapis, ted = Date.now()) {
    const nazev = String((zapis && (zapis.nazev || zapis.name)) || '').trim();
    if (!nazev) throw new Error('produkt musí mít název');
    const zObr = zapis.obrazek ? zObrazku(zapis.obrazek) : null;
    const master = zObr ? zObr.id : ('rucne/' + slug(nazev));
    if (!master || master === 'rucne/') throw new Error('z názvu nejde udělat označení');

    const db = data();
    const jeNovy = !db.produkty[master];
    const p = produkt(db, {
      master, nazev,
      kategorie: zObr ? zObr.kategorie : (zapis.kategorie || null),
      vzacnost: zObr ? zObr.vzacnost : (zapis.vzacnost || null),
      obrazek: zObr ? zObr.obrazek : null
    });
    if (jeNovy) p.rucne = true;
    p.pridanoAt = p.pridanoAt || ted;
    await uloz(db);
    return { master, novy: jeNovy, rucne: !zObr };
  }


  /**
   * Ručně přidaný kus. Aukce identitu kusu nenese, takže když si někdo chce vést
   * konkrétní předmět, musí ho zadat – `instance` je nepovinná a když chybí,
   * vyrobí se vlastní označení, ať se dva ruční kusy nepřebijí.
   */
  async function pridejKus(masterId, zapis, ted = Date.now()) {
    if (!masterId) throw new Error('bez produktu není kam kus přidat');
    const db = data();
    if (!db.produkty[masterId]) throw new Error('takový produkt v evidenci není');
    const p = db.produkty[masterId];
    const id = String((zapis && zapis.instance) || '').trim() || ('r' + ted);
    const jeNovy = !p.kusy[id];
    p.kusy[id] = {
      ...(p.kusy[id] || {}),
      kvalita: num(zapis && zapis.kvalita),
      hodnota: num(zapis && zapis.hodnota),
      stat: (zapis && zapis.stat) || p.stat || null,
      staty: (zapis && zapis.staty) || null,
      rucne: true,
      videnAt: ted
    };
    await uloz(db);
    return { instance: id, novy: jeNovy };
  }

  /** Smaže jeden produkt – ruční záznam se dá zadat i špatně. */
  async function smazProdukt(masterId) {
    const db = data();
    if (!db.produkty[masterId]) return false;
    delete db.produkty[masterId];
    await uloz(db);
    return true;
  }

  /** Smaže jeden kus. */
  async function smazKus(masterId, instance) {
    const db = data();
    const p = db.produkty[masterId];
    if (!p || !p.kusy[instance]) return false;
    delete p.kusy[instance];
    await uloz(db);
    return true;
  }

  /**
   * Ručně uložená cena. Váže se na PRODUKT a nepovinně na kus – aukce a inventář
   * se spojit nedají, takže přiřazení ke kusu je rozhodnutí uživatele.
   */
  async function ulozCenu(masterId, zapis, ted = Date.now()) {
    if (!masterId) throw new Error('bez produktu není co uložit');
    const cena = num(zapis && zapis.cena);
    if (!(cena > 0)) throw new Error('cena musí být kladné číslo');
    const db = data();
    const p = produkt(db, { master: masterId, ...(zapis || {}) });
    p.ceny.unshift({
      cena,
      kvalita: num(zapis.kvalita),
      hodnota: num(zapis.hodnota),
      stat: zapis.stat || p.stat || null,
      staty: zapis.staty || p.staty || null,
      instance: zapis.instance || null,
      poznamka: zapis.poznamka ? String(zapis.poznamka).slice(0, 120) : null,
      at: ted
    });
    if (p.ceny.length > NABIDEK_MAX) p.ceny.length = NABIDEK_MAX;
    await uloz(db);
    return p.ceny[0];
  }

  async function uloz(db) {
    // strop produktů: nejdřív padají ty bez vlastních kusů a bez uložených cen
    const klice = Object.keys(db.produkty);
    if (klice.length > PRODUKTU_MAX) {
      const skore = k => {
        const p = db.produkty[k];
        return (Object.keys(p.kusy).length ? 2 : 0) + (p.ceny.length ? 1 : 0);
      };
      klice.sort((a, b) => skore(b) - skore(a)
        || ((db.produkty[b].nabidky[0] || {}).at || 0) - ((db.produkty[a].nabidky[0] || {}).at || 0));
      for (const k of klice.slice(PRODUKTU_MAX)) delete db.produkty[k];
    }
    await NS.store.put('market', db);
  }

  const smaz = () => NS.store.put('market', prazdny());

  /* ---- dotazy ------------------------------------------------------------- */

  /**
   * Přehled jednoho produktu: varianty (kusy i nabídky) a ceny.
   *
   * Varianty se skládají z kvality – dvě stejné helmy se stejným procentem jsou
   * tatáž varianta, i když je to jiný kus.
   */
  function prehled(masterId) {
    const p = data().produkty[masterId];
    if (!p) return null;
    const kusy = Object.entries(p.kusy).map(([instance, k]) => ({ instance, ...k }))
      .sort((a, b) => (b.kvalita || 0) - (a.kvalita || 0));
    const nabidky = p.nabidky.slice()
      .map(n => ({ ...n, zaBod: n.cena > 0 && n.hodnota > 0 ? n.cena / n.hodnota : null }));
    /*
     * U každé ceny se počítá „kolik jsem zaplatil za jeden bod statu“. O ceně
     * rozhodují hlavně staty; kvalita rozlišuje kusy v rámci jedné skupiny, ale
     * napříč kusy se srovnává právě tohle číslo.
     */
    const ceny = p.ceny.slice().map(c => ({
      ...c,
      zaBod: c.cena > 0 && c.hodnota > 0 ? c.cena / c.hodnota : null,
      zaProcento: c.cena > 0 && c.kvalita > 0 ? c.cena / c.kvalita : null
    }));
    const kvality = [...kusy, ...nabidky].map(x => x.kvalita).filter(x => x != null);
    return {
      ...p, kusy, nabidky, ceny,
      statNazev: nazevStatu(p.stat),
      staty: p.staty || null,
      pocetKusu: kusy.length,
      nejlepsiKvalita: kvality.length ? Math.max(...kvality) : null,
      nejhorsiKvalita: kvality.length ? Math.min(...kvality) : null,
      /*
       * Cena za procentní bod kvality. Přímé srovnání cen nemá smysl: viděné
       * boty za 130 tis. měly +0,62 %, jiné za 1,7 mld měly +13,69 %.
       */
      naProcento: (() => {
        const s = ceny.filter(c => c.cena > 0 && c.kvalita > 0);
        if (!s.length) return null;
        return s.reduce((a, c) => a + c.cena / c.kvalita, 0) / s.length;
      })(),
      /*
       * Cena za JEDEN BOD statu – to je vlastně odpověď na „vyplatí se to?“.
       * Kvalita v procentech je dobrá na srovnání kusů téhož produktu, ale napříč
       * produkty se dá porovnat jedině to, co ten předmět doopravdy dá.
       */
      naBodStatu: (() => {
        const s = ceny.filter(c => c.cena > 0 && c.hodnota > 0);
        if (!s.length) return null;
        return s.reduce((a, c) => a + c.cena / c.hodnota, 0) / s.length;
      })()
    };
  }

  /** Seznam produktů pro kartu v panelu. */
  function seznam(opts = {}) {
    const q = String(opts.query || '').trim().toLowerCase();
    const db = data();
    let out = Object.keys(db.produkty).map(k => {
      const p = prehled(k);
      const posledni = p.nabidky[0] || null;
      return {
        id: p.id, nazev: p.nazev, kategorie: p.kategorie, vzacnost: p.vzacnost,
        obrazek: p.obrazek,
        stat: p.stat, statNazev: nazevStatu(p.stat), staty: p.staty || null,
        pocetKusu: p.pocetKusu,
        pocetNabidek: p.nabidky.length,
        pocetCen: p.ceny.length,
        nejlepsiKvalita: p.nejlepsiKvalita,
        posledniCena: posledni ? posledni.cena : null,
        posledniAt: posledni ? posledni.at : null,
        naProcento: p.naProcento,
        naBodStatu: p.naBodStatu
      };
    });
    if (q) {
      out = out.filter(p => p.nazev.toLowerCase().includes(q)
        || p.id.toLowerCase().includes(q)
        || String(p.kategorie || '').toLowerCase().includes(q)
        || String(p.vzacnost || '').toLowerCase().includes(q));
    }
    if (opts.jenSve) out = out.filter(p => p.pocetKusu > 0);
    const razeni = {
      nazev: (a, b) => a.nazev.localeCompare(b.nazev, 'cs'),
      kusy: (a, b) => b.pocetKusu - a.pocetKusu,
      kvalita: (a, b) => (b.nejlepsiKvalita || 0) - (a.nejlepsiKvalita || 0),
      cena: (a, b) => (b.posledniCena || 0) - (a.posledniCena || 0),
      /* Nejvýhodnější nákup = nejnižší cena za bod statu; bez ceny až na konec. */
      bodStatu: (a, b) => (a.naBodStatu == null ? Infinity : a.naBodStatu)
        - (b.naBodStatu == null ? Infinity : b.naBodStatu)
    };
    out.sort(razeni[opts.sort] || razeni.nazev);
    return out;
  }

  function souhrn() {
    const db = data();
    const klice = Object.keys(db.produkty);
    let kusu = 0, nabidek = 0, cen = 0;
    for (const k of klice) {
      kusu += Object.keys(db.produkty[k].kusy).length;
      nabidek += db.produkty[k].nabidky.length;
      cen += db.produkty[k].ceny.length;
    }
    return { produktu: klice.length, kusu, nabidek, cen };
  }

  /** CSV pro tabulkový procesor – jeden řádek na kus i na nabídku. */
  function csv() {
    const hlava = ['co', 'produkt', 'nazev', 'kategorie', 'vzacnost',
      'instance_nebo_lot', 'kvalita_pct', 'stat', 'hodnota',
      'sila', 'obrana', 'rychlost', 'cena', 'kdy'];
    /* Staty patří do CSV taky ve sloupcích – jinak se v tabulkovém procesoru
     * nedá filtrovat „ukaž mi jen obranu“. */
    const st = x => [nazevStatu(x.stat) || '', x.hodnota,
      (x.staty || {}).sila, (x.staty || {}).obrana, (x.staty || {}).rychlost];
    const radky = [];
    const db = data();
    for (const id of Object.keys(db.produkty)) {
      const p = db.produkty[id];
      for (const [inst, k] of Object.entries(p.kusy)) {
        radky.push(['kus', id, p.nazev, p.kategorie, p.vzacnost, inst,
          k.kvalita, ...st({ ...k, stat: k.stat || p.stat }), '',
          new Date(k.videnAt || 0).toISOString()]);
      }
      for (const n of p.nabidky) {
        radky.push(['nabidka', id, p.nazev, p.kategorie, p.vzacnost, n.lotId,
          n.kvalita, ...st({ ...n, stat: n.stat || p.stat }), n.cena,
          new Date(n.at || 0).toISOString()]);
      }
      for (const c of p.ceny) {
        radky.push(['cena', id, p.nazev, p.kategorie, p.vzacnost, c.instance || '',
          c.kvalita, ...st({ ...c, stat: c.stat || p.stat }), c.cena,
          new Date(c.at || 0).toISOString()]);
      }
    }
    return [hlava, ...radky].map(r => r.map(x => x == null ? '' : x).join(';')).join('\n');
  }

  /* ---- sběr na pozadí ------------------------------------------------------ */

  const AUKCE_URL = '/map/building/show/2';
  const INVENTAR_URL = '/inventory';
  /*
   * Aukce se obměňuje po minutách (odpočty 2–14 min), takže častěji než jednou
   * za tři minuty nemá čtení co přinést. Inventář se mění jen když něco získáš,
   * proto desetkrát méně často. Je to jeden GET – proti tomu, co dělá automatika,
   * je to nic.
   */
  const AUKCE_KAZDYCH = 3 * 60 * 1000;
  const INVENTAR_KAZDYCH = 30 * 60 * 1000;

  let aukceAt = 0, inventarAt = 0;

  const zapnuto = () => NS.store.get().read.marketSbirat === true;

  /**
   * Jedno kolo sběru. Vrací, co se stalo – volající to může napsat do lišty.
   *
   * !!! V NEMOCNICI A VE VĚZENÍ HRA NEVRACÍ NIC POUŽITELNÉHO !!!
   * Změřeno: `/inventory` i aukce v tom stavu vrátí **404** s tělem
   * `{"errors":"Momentálně ležíš v nemocnici…"}`. Parsery by z toho vytáhly
   * prázdno (nezapsalo by se nic), ale číst to dokola je zbytečné – tak se to
   * přeskočí a čas posledního čtení se NEPOSUNE, aby se to zkusilo hned, jak
   * bude z čeho.
   */
  async function zkontrolujObcas(ted = Date.now()) {
    if (!zapnuto()) return null;
    if (NS.captcha && NS.captcha.blokuje()) return null;
    if (NS.jail && NS.jail.blocked()) return null;

    const out = { aukce: null, inventar: null };

    if (ted - aukceAt >= AUKCE_KAZDYCH) {
      try {
        const { status, raw } = await NS.parse.apiGet(AUKCE_URL);
        if (status === 200 && !(NS.jail && NS.jail.inText(raw))) {
          const nab = zAukce(raw);
          if (nab.length) out.aukce = await ulozAukci(nab, ted);
          aukceAt = ted;
        }
      } catch (e) { /* jedno neúspěšné čtení nic neznamená */ }
    }

    if (ted - inventarAt >= INVENTAR_KAZDYCH) {
      try {
        const { status, raw } = await NS.parse.apiGet(INVENTAR_URL);
        if (status === 200 && !(NS.jail && NS.jail.inText(raw))) {
          const kusy = zInventare(raw);
          if (kusy.length) out.inventar = await ulozInventar(kusy, ted);
          inventarAt = ted;
        }
      } catch (e) { /* dtto */ }
    }

    return (out.aukce || out.inventar) ? out : null;
  }

  /** Ruční načtení – tlačítko v panelu, ať se nemusí čekat na interval. */
  async function nactiHned(ted = Date.now()) {
    aukceAt = 0;
    inventarAt = 0;
    const puvodni = NS.store.get().read.marketSbirat;
    /*
     * Ruční načtení nesmí záviset na tom, jestli je sběr zapnutý – uživatel si
     * ho může chtít prohlédnout, než ho zapne.
     */
    if (puvodni !== true) await NS.store.patch('read', { marketSbirat: true });
    try {
      return await zkontrolujObcas(ted);
    } finally {
      if (puvodni !== true) await NS.store.patch('read', { marketSbirat: puvodni });
    }
  }

  NS.market = { zObrazku, zeStatu, zKarty, nazevStatu, STATY, ocistiNazev, zAukce, zInventare,
    ulozAukci, ulozInventar, ulozCenu, smaz, prehled, seznam, souhrn, csv,
    zkontrolujObcas, nactiHned, zapnuto,
    pridejProdukt, pridejKus, smazProdukt, smazKus, slug,
    NABIDEK_MAX, PRODUKTU_MAX, AUKCE_KAZDYCH, INVENTAR_KAZDYCH };
})();
