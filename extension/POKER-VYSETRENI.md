# Poker (#18) – co víme, co nevíme, a jak v tom pokračovat

Pracovní zápisník k vyšetřování, proč poker nevydělává. Není to dokumentace kódu
(ta je v `README.md` a v hlavičkách modulů) – tohle je stav pátrání, ať se k němu
dá vrátit bez čtení celé historie.

**Stav k 1. 8. 2026, verze rozšíření 0.81.0.**
Celkem odehráno ~7 000 kol, bilance **−6 910 💎** z ~335 000 💎 obratu.

---

## 0b. Nalezená chyba: špatně oceněné žetony (2. 8. 2026)

Ante se neposílá jako číslo – **skládá se klikáním na žetony** a v okně pokeru
není žádné číselné pole. Nominály měl modul natvrdo v tabulce a **tři ze šesti
byly špatně**:

| třída | hra (`data-val`) | bylo v kódu |
|---|---|---|
| `poker_chip-10x` | 1 000 | 500 |
| `poker_chip-50x` | 5 000 | 1 000 |
| `poker_chip-100x` | 9 000 | 2 000 |

Názvy tříd k tomu vybízejí („10x“ jsem přečetl jako desetinásobek nejmenšího
žetonu), ale hra si hodnotu píše sama. Důsledek:

| chtěné ante | doopravdy vsazeno |
|---|---|
| do 100 | správně |
| 2 000 | **9 000** (jeden `-100x`) |
| 3 000 | **14 000** (`-100x` + `-50x`) |

A protože se z zapsané sázky odvozuje i „vráceno“ (`sazka * 2`), byl **log
vnitřně konzistentní, ale odtržený od skutečnosti**: návratnost v panelu vycházela
normálně, zatímco diamanty ubývaly násobně rychleji. Rozdíl se nedal poznat
odnikud než z reálného stavu diamantů.

**Co to vysvětluje a co ne.** Ante 10 a 20 jsou složené jen z desetikorunového
žetonu, takže **všechna měření při ante 10/20 tím zasažená nejsou** – včetně toho
podezřelého 1,43× u ante 20. Zasažené je jen ante **≥ 500**, tedy ta sezení, kde
si uživatel stěžoval „od dvou/tří tisíc jsem začal prohrávat, a přitom panel
vypadal normálně“. To je na tu chybu přesný popis. Ověřit to už ale **nejde** –
ta kola v logu nejsou. Zůstává to tedy jako pravděpodobné vysvětlení, ne jako
prokázaná příčina.

**Oprava:** hodnoty se čtou z okna (`data-val`, jinak text žetonu), takže se
nemůžou rozejít, a navíc se po naskládání porovná, co eviduje hra – **nesedí-li
to na korunu, kolo se nehraje**. Dřív se hlídala jen nula, což tenhle případ
propustilo. Stejná chyba byla i v blackjacku a je opravená stejně.

---

## 0. Kde to stojí teď (2. 8. 2026, verze 1.3.0)

**Log pokeru je vynulovaný** – oněch ~7 000 kol z oddílu 1 už v rozšíření není,
zůstávají jen jako čísla v tomhle zápisníku. Nová série začala od nuly:

| | |
|---|---|
| kol | 96 (2. 8. 13:15–13:34, tedy ~5 kol/min) |
| vsazeno / vráceno | 1 290 💎 / 1 340 💎 |
| bilance | **+50 💎**, návratnost 104 % |
| zdvojeno | 33 × = **34 %** (čekáno ~46 %) → −2,3 σ |
| „Vsadit 2×“ | 33 kol, 61 % výher, 124 % |
| „Pokračovat“ | 63 kol, 30 % výher, 83 % |

**Nedá se z toho vyvozovat nic.** Při 96 kolech je i u poctivě hrané strategie
~86 % šance, že bilance ukazuje plus. Test poctivosti se zapne od 100 kol, měřený
práh zdvojení od 250. Jediné, co stojí za pohled, je ten deficit zdvojení – sedí
na obrázek „hráč dostává slabší karty“, ale sám o sobě neprokazuje nic.

**Experiment z oddílu 5 se zatím nespouští** – uživatel 2. 8. rozhodl nechat
nastavení, jak je (ante 10, měřicí režim vypnutý). Otázka „vadí vyšší ante?“
tedy zůstává otevřená přesně tam, kde je popsaná v oddílu 2: naměřeno ante 10 →
1,01× a ante 20 → 1,43×, jenže ante 20 se hrálo jen v jednom časovém okně, takže
sázku a čas z těch dat rozplést nejde.

---

## 1. Závěry, které považuji za prokázané

### Rozdání není rovnoměrné

Devět karet kola (hráčovy 2 + stůl 5 + dealerovy 2) je při poctivém míchání
rozdáno tak, že **kterákoli dvojice z nich mohla být dealerova**. Stačí je tedy
přeházet a porovnat – test nezávisí na pravidlech hry ani na hodnocení kombinací.

Na 804 kolech s kompletními kartami:

| | vysokých karet (J,Q,K,A) | mělo patřit | odchylka |
|---|---|---|---|
| dealer | **632** | 516 | **+7,0 σ** |
| hráč | 423 | 516 | −5,6 σ |
| stůl *(kontrola metody)* | rovnoměrně | rovnoměrně | ✓ |

p-hodnota: **0 z 20 000 přeházení**. Dealer dostal dámu 178×, kluka 156×, eso
153×; hráč pětku 157×, sedmičku 154×, dvojku 151×.

**Že je stůl v normě, je kontrola metody** – kdyby byl postup chybný, projevilo
by se to i tam. **Duplikáty: 0** – hraje se s normálním balíčkem, nejde o karty
„navíc“, ale o to, komu z rozdaných karet padnou ty dobré.

### Vychýlení se v čase mění

Poměr (dostal / měl dostat) po oknech 200 kol: **0,97× · 1,14× · 1,00× · 0,95× ·
1,41×**. Rozptyl ±0,19, kdežto při stálém vychýlení by mohl být jen ±0,07.
Vylučuje to pevně zabudovanou výhodu kasina – ta by byla konstantní.

### Kolik to stojí

Vztah je skoro monotónní (okna po 150 kolech):

| vychýlení | −2,8 σ | −1,4 σ | +0,4 σ | +0,9 σ | +2,0 σ | +3,0 σ | +5,6 σ |
|---|---|---|---|---|---|---|---|
| návratnost | 107 % | 110 % | 101 % | 93 % | 96 % | 84 % | 77 % |

Regrese: **každá 1 σ vychýlení stojí ~3,6 pb návratnosti.**

### Při poctivém rozdání je hra na nule, ne v plusu

Simulace slibovala 109 %. Skutečnost při σ ≈ 0: **100,4 %** (451 kol), za všechna
poctivá sezení **97,4 % až 100,5 %** podle výběru. Poker tedy sám o sobě
nevydělává – vydělá jedině tehdy, když má dealer smůlu.

### Pravidla hry (proměřeno)

- výplata **1:1 z celkové sázky**, remíza vrací sázku, prohra bere vše
- **síla kombinace na výplatu nemá vliv** (trojice platí jako pár)
- **fold neexistuje**: „Pokračovat“ = sázka 1 ante, „Vsadit 2×“ = 2 ante
- hra **ignoruje kickery**: porovnává kategorii a hlavní rank, u dvou párů i
  druhý pár → shoda se skutečnými výsledky **99,6 %** (804 kol)
- **rozehrané kolo se nedá opustit**: ante se strhne při dealu a po opuštění
  propadne (ověřeno 2×, 27 490 → 27 480 → po reloadu 27 480). Dohrát je vždy
  lepší: opuštění je −1,00 ante, dohrání i v nejhorším pásmu −0,42 ante.

### Rozhodovací pravidlo

EV(Pokračovat) = navrch, EV(Vsadit 2×) = 2 × navrch → **zdvojit právě když je
navrch kladný.** To platí, pokud je odhad nezkreslený. Při vychýleném rozdání
odhad přestřeluje, a to nerovnoměrně – nejvíc u mírné převahy (tam rozhoduje,
jestli dealer chytne vysokou kartu), u hotové silné ruky sedí.

---

## 2. Co prokázané NENÍ

- **Záměr.** Statistika odliší nerovnoměrnost, ne úmysl. Může to být mechanika,
  chyba v míchání, nebo něco třetího. *(Dvakrát jsem tohle přestřelil – nejdřív
  „hra se změnila“, pak „hra reaguje na hráče“ – a musel to vzít zpět.)*
- **Že to způsobuje výše sázky.** Naměřeno ante 10 → 1,01×, ante 20 → 1,43×
  (+6,7 σ), jenže **ante 20 se hrálo jen v jednom časovém úseku** (00:13–00:46),
  takže ve stejné době neexistuje ani jedno kolo s ante 10. Čas a sázka se
  změnily naráz a nedají se rozpletat.
- **Že to roste s časem nebo počtem kol.** Korelace pořadí okna s vychýlením je
  **−0,37**, tedy proti hypotéze. A u ante 20 nastoupilo vychýlení **naráz**
  (prvních 50 kol 1,42×), nenarůstalo.
- **Že hra kazí karty tomu, kdo vyhrává.** Korelace „výsledek okna N → vychýlení
  okna N+1“ = **+0,55**, ale jen ze **6 párů**, kde je ±0,6 běžný šum. Stopa,
  ne zjištění.
- **Jestli bylo rozdání poctivé v prvních ~2 253 kolech**, kdy návratnost byla
  111 % (+5 150 💎). Ta kola už v logu nejsou. Nepřímo: zisk +5 150 💎 by ve hře
  s −9,8 % byl ~10 σ, tedy prakticky nemožný.

---

## 3. Chyby, které jsem v tomhle vyšetřování udělal

Zapsané schválně – dvě z nich se opakovaly a stály reálné diamanty.

| chyba | jak se projevila | poučení |
|---|---|---|
| **Zombie karta** | Nechával jsem si hru otevřenou kvůli čtení logu; po reloadu rozšíření skript dál hrál, ale nemohl logovat ani se vypnout. Celonoční ztráta. | Řeší zámek + kontrola `chrome.runtime.id` (0.72–0.73) |
| **Záměna jednotek** | `log()` ukládá navrch v pb (45,0), kalibrace ho násobila stem znovu → všechny prahy vyšly identicky a „degenerovaný“ prah 1 169 pb byl ve skutečnosti 11,7 pb. Stálo 3,5 pb návratnosti. | Fixture musí kopírovat **skutečný tvar zápisu** |
| **Test zrcadlil chybu** | Testovací data měla pole `stul`, kód četl `stul`, ale ukládá se `board` → test poctivosti neviděl ani jedno kolo. Podruhé totéž s jednotkami. | **Dvakrát stejný vzorec.** Fixture odvozovat z `log()`, ne psát ručně |
| **Prah z cizího režimu** | Prah nafitovaný na vychýlených kolech jel dál v poctivém sezení, kde je správná nula → zdvojovalo se v 18 % místo 42 %, ze 103,9 % zůstalo 100,4 % | Prah se počítá z **okna 400 kol**, ne z celé historie |
| **Srovnávání sezení v σ** | σ roste s odmocninou z počtu kol, takže větší sezení vypadalo vychýleněji | Srovnávat **poměrem**, ne v σ |
| **Panel jen varoval** | „NEHRÁT“ v panelu, ale automatika hrála dál – včetně úseku s +5,6 σ a návratností 77 %. 1 180 💎 za 549 kol. | Hlídač vypíná automatiku sám (0.80) |

---

## 4. Co je v rozšíření hotové

- **`poctivost(okno, minKol)`** – permutační test rozdání, vrací poměr i σ
- **`poctivostKol(kola)`** – totéž pro libovolnou skupinu (sdílí ho měření)
- **hlídač** – nad **3 σ** (okno 300 kol) vypne volbu v liště a napíše proč;
  kontroluje se **před** herním oknem, aby to platilo i při zavřené hře;
  vypínatelné přes `pkStopVychyleni`
- **naměřený prah zdvojení** – kandidáti 0/5/10/15/20/30/45 pb se vyhodnotí na
  posledních **400** kolech, přepne se jen při překonání vlastního šumu
  (σ ≈ √počet lišících se kol), jinak zůstává nula
- **měřicí režim** (`pkMereni`, `pkMereniAnte`, `pkMereniBlok`) – střídá ante po
  blocích, do logu píše `mBlok`/`mAnte`, panel ukazuje tabulku **podle sázky**
  a **podle bloku v čase**
- **historie 1 000 kol**, CSV export včetně `mereni_blok`, `mereni_ante`

Testy: **1 394 kontrol** (poker 149), vše prochází.

---

## 5. Jak pokračovat

### Naplánovaný experiment

1. **24h pauza** (uživatelův nápad – stojí nic).
   Sama o sobě nerozhodne: „před“ data kolísají 0,95×–1,51×, takže jedno měření
   po pauze se od běžného kolísání neodliší.
2. Pak **měřicí režim**: `pkMereniAnte = 10,20`, `pkMereniBlok = 100`,
   nechat dojet **~600 kol** (3 bloky na podmínku).
3. Číst z panelu:
   - poměr jde **s výší sázky**, ne s pořadím bloku → příčinou je **sázka**
   - poměr jde **s pořadím bloku** napříč oběma sázkami → **čas / počet kol**
   - poměr jde za dobrými bloky → **reakce na výsledky**

### Kolik kol je potřeba (2 σ)

| vychýlení | na rozpoznání | na rozdíl mezi dvěma podmínkami |
|---|---|---|
| 1,05× | 1 558 | 3 116 na podmínku |
| 1,10× | 390 | 779 na podmínku |
| 1,20× | 97 | 195 na podmínku |
| 1,40× | 24 | 49 na podmínku |

Cena experimentu 6 × 100 kol: obrat ~12 600 💎, čekaná ztráta **~380 💎 ± 465**.

### Otevřené otázky

- Vrátí se po pauze rozdání k poctivému?
- Je spouštěčem výše sázky, nebo něco časového?
- Vyskytuje se vychýlení i u jiných her v kasinu (automat #18, blackjack)?
  Stejný permutační test tam nejde – nemají sdílené karty – ale dala by se
  měřit distribuce dealerových karet u blackjacku.
- Platí bonus za postupku a lepší kombinace? Neověřeno, při měření se
  nevyskytly.

---

## 6. Doporučení uživateli (stav k 1. 8. 2026)

**Poker nehrát.** Ne kvůli jednomu špatnému sezení, ale proto, že při poctivém
rozdání je hra na nule a při vychýleném hluboko v minusu – takže očekávaná
hodnota přes dlouhou dobu je záporná. Diamanty spolehlivě nesou šachty, doprava
a mzda.

Hrát má smysl jedině **jako měření**, a k tomu stačí ante 10 a pár set kol.

Zvyšování ante nic nezlepší: výhoda i kolísání rostou se sázkou stejně, takže
poměr drží – jen se zvětší čísla v obou směrech. (A pokud se potvrdí hypotéza
o sázce, bylo by zvyšování přímo škodlivé.)
