# Historie změn

Verze se drží v `extension/manifest.json`; nejvyšší číslo tady mu musí odpovídat
(hlídá `tests/verze.js`).

Záznamy začínají u 1.13.0 – od starších verzí se nevedly, takže dopisovat je
zpětně by znamenalo si je domyslet.

## 1.23.4

- **★ se přestěhovala do pravého dolního kouta** – vlevo nahoře má hra rank
  a vzácnost. Ne úplně dolů: změřená karta (206 × 290) má dole pruh statů, kde
  „spd“ končí 10 px od pravého okraje, takže doslovný `bottom: 4px` by hvězdičku
  položil na číslo rychlosti. Sedí 32 px nad spodkem – pod pruhem akcí
  (nasadit / vylepšit / prodat / do aukce) a nad staty.

## 1.23.3

- **Deset pokusů místo tří a od pátého delší pauza.** Prvních čtyři pokusy po
  0,7 s (většina výpadků je okamžik), od pátého se interval prodlužuje
  (1,4 · 2,1 · 2,8 · 3,5 · 4,2 s, strop 8 s) – deset pokusů tak trvá ~17 s, ne
  minuty. Prodloužení platí jen v rámci jednoho čtení: po úspěchu se začíná
  zas od 0,7 s, nikde se nepamatuje.

## 1.23.2

- **Poker se přestane sám vypínat po výpadku čtení.** Dvě čtení kasina po sobě
  vrátila HTTP 404 (10:57:58 a 10:58:01), přitom budova jinak odpovídala – a
  protože se každé selhání počítá do `AUTO_MAX_FAILS`, krátká série výpadků
  vypnula celou hru. Nový `NS.parse.apiGetTry()` čtení třikrát zkusí; použit
  v pokeru, blackjacku, automatu i kuličkách. `apiGet()` zůstává bez opakování,
  protože některá 404 jsou očekávaná („Spausk per mygtuką, o ne per nuorodą!“).

## 1.23.1

- **Denní limit u předmětů zmizel.** „Můžeš přihazovat v aukcích 4/4 krát denně“
  je limit DIAMANTOVÉ aukce (`pointsAuction`), ne dražeb předmětů – u těch žádný
  denní strop není. Ukazovat ho u předmětů znamenalo hlásit omezení, které
  neexistuje, tak se limit nečte vůbec.

## 1.23.0

- **Minimální příhoz v aukci je 2 % z částky, ne koruna.** Dřív tu bylo „+1“
  s odůvodněním, že z pravidel plyne „o korunu víc“ – byl to odhad a byl špatný.
  Hlídka by klikala naprázdno až do konce dražby. Ruční `+1 %` proto nahrazeno
  za `+2 %` (minimum, které hra přijme).
- **Diamantová aukce se neřeší.** Na stránce jsou tři druhy dražeb a poznají se
  jedině z adresy: `auction` a `auctionSpecial` jsou předměty, `pointsAuction`
  jsou diamanty. Do těch se nepřihazuje a nedostanou ani pole na strop.
- **Klíč dražby nese i druh** (`auction:32038`). `pointsAuction/bid/12486`
  a `auction/bid/12486` jsou dvě různé dražby se stejným číslem – pod jedním
  klíčem by si zdědily „moji nabídku“.

## 1.22.1

- **Hvězdička rozhodila inventář.** Dostala `position: relative` na
  `.col-card-inner`, aby se měla čeho držet – ale `.col` je ve hře UŽ `relative`
  a všechny absolutně pozicované prvky karty (rohy, odznak vzácnosti, ikony
  akcí) se pozicují proti němu. Bližší `relative` jim změnil vztažný rámec
  a karta se rozsypala. Hvězdička teď visí přímo na `.col` a rozšíření
  nepřidává pozicování žádnému hernímu prvku.

## 1.22.0

- **Aukce: pole „přihazovat do“** u každé dražby. Hlídka kontroluje každých 30 s
  a přihodí o korunu, když už nevedeš a do konce zbývá méně než 3 minuty. Nikdy
  nepřehodí strop. Tlačítko `+1` zrušeno – minimální přebití dělá hlídka.
  Hra NEUKAZUJE, kdo vede, takže se to odvozuje z vlastní poslední nabídky.
- **★ oblíbené předměty** v inventáři (hra oblíbené nemá, `.stars` je vzácnost)
  a řádek `Oblíbené:` v liště: jeden klik = jedno běžné vylepšení předmětu,
  s ověřením, že úroveň nebo kvalita opravdu stoupla. **Turbo za diamanty se
  nepoužívá** (4 800 / 24 000 / 48 000 💎) a hlídá to i test nad zdrojákem.

## 1.21.0

- **Lišta se nedá zavřít, jen zmenšit.** Křížek „×“ zmizel – sedělo hned vedle
  minimalizace a vypínal celou lištu, kterou pak šlo zapnout jen v nastavení.
- **Úchyt na zmenšení je výrazně větší** (44 × 38, zlatý), protože ve zmenšeném
  stavu je to jediný ovládací prvek na obrazovce.
- **Pravý kout má jeden rozměr** – vypínač, obnovování a minimalizace měly každý
  jinou výšku i písmo.
- **Panel se vrací do okna.** Poloha se pamatuje v pixelech zleva, takže po
  přechodu na menší monitor skončil za pravou hranou: nebyl vidět a nedal se
  chytit za hlavičku. Srovná se po načtení i po změně velikosti okna.
- **Pauza zabere vždycky.** Handler dřív čekal na zápis do úložiště (klik chvíli
  „nedělal nic“ a druhý klik pauzu vzal zpátky) a přepínal podle stavu z doby
  vykreslení (klik pauzu vypnul, když ji mezitím zapnul někdo jiný). Teď se stav
  čte při kliku, zastavení je okamžité a reaguje se na stisk, ne na uvolnění –
  překreslení lišty mezi stiskem a uvolněním klik spolklo.
- **Pole vkladu v kasinu je označené**, co zrovna nastavuje (`🎯 vklad`,
  `🃏 sázka`, `🂡 ante`). Ovládá tři různá nastavení podle volby v AUTO, takže
  částka zadaná před zapnutím pokeru spadla do sázky kuliček a vypadalo to, že
  se „vrátila původní“.

## 1.20.2

- **Haléře u vylepšení.** Hotovost má desetinná místa (858,90 Kč) a výběr z banky
  se podlahuje, takže „chybí 1 910,10 → vyber 1 910“ skončilo o deset haléřů pod
  cenou a hra vylepšení odmítla. Vybírá se v celých korunách nahoru + 100 Kč
  rezerva; u převodu čistých na špinavé jen zaokrouhlení, protože zpátky by šly
  jen praním za 30 %.
- Ověřuje se **výsledek**, ne vybraná částka: hotovost musí cenu dosáhnout.

## 1.20.1

- **Výpadek čtení banky se zkusí znovu** (3× s pauzou). Jeden dvanáctisekundový
  timeout dřív shodil celou akci, přitom banka běžně odpovídá za ~150 ms.

## 1.20.0

- **Vylepšování budov** – Továrna (25), Dům zločinů (23), Posilovna (26),
  Nemocnice (31), Závody (28), Kasárna (20). Řádek `Vylepšit:` s automatikou,
  peníze si vezme z banky. Budova, která se právě vylepšuje, má ⏳ a nečte se
  znovu, dokud jí neuplyne odpočet. Do „Urychlit“ za diamanty se nesahá.

## 1.19.0

- **Minimální úroveň soupeře** u útoků, do nastavení. Když je nad stropem,
  neútočí se a řekne se, že si nastavení odporuje.

## 1.18.0

- **Automatika útoků**, tempo drží energie (útok 30, dobíjí ~10/min). „Není koho“
  se odmlčí na 10 minut, pět skutečných chyb ji vypne.
- Strop úrovně zvlášť pro ruku (70 %) a pro automatiku (50 %), obojí v nastavení.

## 1.17.0

- **Staty u všech předmětů** – nese je i dražba, uložená cena a ruční kus, ne jen
  kus z inventáře. CSV má staty ve sloupcích.
- Tabulka předmětů má **rámečky** a panel je širší (420 px).

## 1.16.0

- **Staty ve sloupcích** místo jedné textové buňky; prázdné sloupce se
  nevykreslují a neznámý stat se nezařadí tiše, ale do sloupce „dává“.

## 1.15.1

- **Výsledek boje se čte ze třídy odkryté hlášky**, ne z textu okna. Ve scéně
  jsou oba popisky pořád („Vyhrál jsi“ i „Prohrál jsi“), takže hledání v textu
  hlásilo výhru vždycky – i po prohře.

## 1.15.0

- Druhé tlačítko: **napadnout neaktivního v gangu**.
- Strop úrovně soupeře (70 % vlastní), filtruje se už v seznamu.

## 1.14.0

- **Útok na neaktivního hráče** jedním tlačítkem. Ležící v nemocnici se
  přeskakují – v seznamu hledání to poznat NENÍ, pozná se až ve scéně útoku.
- Druh statu se čte z třídy ikony (`.rank.bottom .icon`), ne z textu.

## 1.13.0

- Noční obnovování stránky ze service workeru (`chrome.alarms`), protože
  časovačům na pozadí se v Chrome věřit nedá.
- Detekce kontroly „jsi člověk?“ – automatika se zastaví, rozšíření do ní nesahá.
