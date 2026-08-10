# CzechMafie Companion

**Verze: 1.25.0** · [historie změn](../CHANGELOG.md)

Chrome rozšíření (Manifest V3) ke hře **czechmafie.cz**. Ukazuje, jak na tom
jsou tvoje budovy, počítá, jestli se výroba vyplácí, sleduje vývoj majetku
v čase a vede evidenci toho, **kolik tě každý předmět celkově stál** – od
pořízení přes všechny upgrady.

> **Rozšíření DĚLÁ herní akce.** Tenhle odstavec dřív tvrdil opak – že jde jen
> o čtení – a byla to pravda pro verzi 0.2. Dnes to neplatí: sklízí a spouští
> výrobny, ukládá a pere v bance, hraje poker, blackjack a automat, vypravuje
> letadla a lodě, páchá zločiny, vylepšuje budovy a útočí na neaktivní hráče.
> Všechno je vidět v liště dole, dá se to vypnout jedním tlačítkem (⏸) a nic
> z toho není zapnuté samo od sebe.
>
> Kliká se přitom na **skutečná tlačítka hry** (fragment budovy se vloží do
> herního okna a klikne se na jeho prvek) – přímé POSTy hra na většině adres
> odmítá. Výjimky, které do UI hry sahají, ale samy nic neposílají: v **aukci**
> vyplní pole „Tvá sázka?“ (odeslání je na tobě) a **lišta dole** přeposílá klik
> na herní tlačítko – „Trénovat“ v posilovně a kasárnách, „Sebrat peníze“ /
> „Odeslat“ u letadel a lodí, „Spáchat zločin“ u zločinů z mapy. Vždy **jeden
> tvůj klik = jeden klik ve hře**, žádná
> smyčka, žádný časovač. Všechno jde vypnout v nastavení.

## Instalace

1. Otevři `chrome://extensions`.
2. Vpravo nahoře zapni **Režim pro vývojáře**.
3. **Načíst rozbalené** → vyber složku `extension/`.
4. Otevři/obnov `https://s1.czechmafie.cz/` – vpravo naskočí panel.
5. Ikonou rozšíření v liště otevřeš nastavení (které budovy číst, jak často, záloha dat).

## Co panel umí

### Stav
Hotovost, kolik věcí čeká na sklizeň, a pro každou sledovanou budovu:
průběh v %, odhad kdy bude hotovo, aktuální zásoby a volné kapacity. K tomu
dopočet typu *„na 4 sudy chybí 1 116 kg pšenice ≈ 2 790 Kč“* – nemusíš
proklikávat budovu po budově, abys věděl, jestli má smysl jít do hry.

Podporované typy a jejich ID na s1 (ověřeno ve hře): **palírna whisky `24`,
konopná farma `27`, pivovar `29`, laboratoř pervitinu `21`, banka `22`**
a „ostatní“ (obecné čtení pro cokoliv dalšího). Profily jsou postavené na
skutečných fragmentech, ne na odhadu – reálné texty jsou ve fixtures testů.

Načtení je na tlačítko. Volitelný auto-refresh čte v intervalu (minimum 60 s).

Panel si **poslední přečtený stav pamatuje**, takže po přechodu na jinou
stránku hry hned vidíš čísla (označená „z posledního čtení před X“) a nemusíš
čekat na nové načtení. Během čtení tlačítko ukazuje průběh (`Pivovar (3/5)`),
každý požadavek má limit 12 s a zaseknuté čtení se po 90 s samo uvolní.

Dlaždice **Majetek** ukazuje součet peněz s rozpadem (`hotovost 412 tis. +
banka 100 tis. + špinavé 153,2 mil.`), vedle ní **Diamanty** zvlášť – je to
jiná valuta, sčítat ji s korunami by nedávalo smysl.

Čisté peníze, špinavé peníze i diamanty se čtou z **HUD hry** (`.money-set`),
takže jsou k dispozici na každé herní stránce. Zůstatek v bance v HUD není –
ten dá jedině budova **Banka**; když ji nesleduješ, jde zadat ručně v panelu
(stejně tak diamanty, kdyby HUD nebyl vidět).

#### Musím brzy koupit materiál?
Odpověď má dvě části:

1. **Pokryje materiál volnou kapacitu?** Hra sama uvádí „Máš dost ingrediencí
   na 679 sudů“ / „To stačí pro 679 chemiků“, takže se bere její číslo a
   porovná s počtem volných jednotek. Když nestačí, píše se kolik dokoupit
   a za kolik.
2. **Na kolik plných naplnění zásoba vystačí** a kolik je to hodin výroby:

> Plné vytížení: 66 892 sudů = 535 136 kg pšenice
> → Zásoba vystačí na 1 plné naplnění (~8 h výroby)

Při dvou a méně naplněních se hláška změní na varování s ⚠ – vždy s textem
a ikonou, nikdy jen barvou.

Celková kapacita se počítá jako **obsazené + volné jednotky** (u palírny
„Zraje: 14 358“ + „Prázdné a nepoužité sudy: 52 534“). Když se právě nic
nevyrábí, obsazené číslo ve fragmentu není – pak se použije ruční hodnota
ze sloupce **Kap.** v nastavení a karta na to upozorní.

U víc surovin (pivo = chmel + ječmen) se hlásí i **úzké hrdlo** – která
surovina limituje.

#### Kolik ještě vyšleš
Pro každý dopravní prostředek (loď, letadlo, kamion – definuješ si je sám)
spočítá ze zásoby a kapacity, **kolik plných vyslání ještě máš**, kolik z nich
vypravíš hned (podle počtu prostředků), na kolik vln to vyjde, co zbyde
a kolik chybí na další plné naložení. Zásoba se bere ze sledované budovy,
nebo ji zadáš přímo v panelu.

### Doprava – co vydělalo, co stálo, co zbylo
Hra nikde nesčítá, co ti co přineslo: u prostředku vidíš jen poslední částku,
a jak ji sebereš, zmizí. Záložka se proto plní **při každém sebrání peněz
tlačítkem v liště** a vede se **per prostředek**.

> **Hrubý výnos** 42 712 Kč · 15× sebrání ┃ **Materiál** − 6 827 Kč · 16 % z výnosu
> **Čistý zisk** 35 885 Kč · marže 84 % ┃ **Odteklo pozdním sběrem** 1 200 Kč · 2,7 %
>
> **CO SE VYPLATÍ VOZIT – NA JEDNU JÍZDU**
> 1. pervitin 32 673 Kč (2,28/g) · 2. whisky 4 021 Kč (1,83/l)
>
> **PODLE SUROVINY → pervitin** `32 673 Kč / jízda`
> *Na jednu jízdu:* vypraveno 14 497 g · výnos 34 793 · materiál −1 740 ·
> **čistý zisk 33 053** · tablet 4 349 ks × 0,40 = 1 740 Kč
> *Celkem – 3× jízdy:* 43 491 g · výnos 104 378 · materiál −5 219 ·
> **čistý zisk 99 159** · marže 95 %
> *Za jednu g:* výnos 2,40 · materiál −0,12 · **čistý zisk 2,28** · trh 1,40
> ✓ vozit se vyplatí – o 43 491 Kč proti prodeji na trhu
>
> **LODĚ** S4 Marvella — 3 jízdy · *vozilo: pervitin 3×*

#### Odkud se ví, co se vozilo
Sebrané peníze samy neříkají, z čeho jsou – **sběr je jiná událost než
odeslání** a hra u peněz náklad neuvádí. Proto se při vypravení zapamatuje, co
šlo na palubu (`pending`), a při sběru se tomu nákladu peníze připíšou. Když
prostředek odešleš ručně v herním okně a sebereš přes lištu, náklad se zapíše
jako **„neznámo“** a materiál se u něj netvrdí – radši mezera než tip.

#### Náklad na materiál
Recepty vědí, kolik čeho jde na jednotku a za kolik, takže náklad není odhad:

| Náklad | Materiál | Doprava platí | Čistý zisk | Trh |
|---|---|---|---|---|
| whisky | 8 kg pšenice × 2,50 ÷ 30 l = **0,67 Kč/l** | 2,50 Kč/l | 1,83 Kč/l | 1,60 |
| pivo | (15×0,60 + 30×0,20) ÷ 75 l = **0,20 Kč/l** | 1,00 Kč/l | 0,80 Kč/l | 0,60 |
| pervitin | 30 tablet × 0,40 ÷ 100 g = **0,12 Kč/g** | 2,40 Kč/g | 2,28 Kč/g | 1,40 |
| konopí | 100 semen × 0,10 ÷ 1 mil. g = **0,00001 Kč/g** | 0,60 Kč/g | 0,60 Kč/g | 0,30 |

Počítá to `econ.unitCost(recipe)` = `Σ(vstup.perUnit × vstup.price) ÷ output.perUnit`.
Ceny vstupů si rozšíření čte ze hry, takže se náklad **dopočítává z aktuálních
cen**, ne ze zamrazených při odeslání – jinak by se minulost rozešla s tím, co
ti hra ukazuje.

#### Doprava vs. prodejce
U každé suroviny je vidět i **kolik by za totéž dal prodejce** – v absolutní
částce na jízdu i celkem, a za jednotku vedle sebe:

| Surovina | Dopravou | U prodejce | Materiál | Zisk dopravou | Zisk prodejem |
|---|---|---|---|---|---|
| whisky | 2,50 Kč/l | 1,60 Kč/l | 0,67 | **1,83** | 0,93 |
| pivo | 1,00 Kč/l | 0,60 Kč/l | 0,20 | **0,80** | 0,40 |
| pervitin | 2,40 Kč/g | 1,40 Kč/g | 0,12 | **2,28** | 1,28 |
| konopí | 0,60 Kč/g | 0,30 Kč/g | ~0 | **0,60** | 0,30 |

Doprava u všech čtyř platí přesně **dvojnásobek** ceny u prodejce, takže vyhrává
vždycky – ale číslo je vidět, takže kdyby se to ve hře změnilo, pozná se to.
Materiál se spotřebuje stejně tak i tak, proto se srovnává výnos: rozdíl ve
výnosu je zároveň rozdíl v zisku.

#### Co se vyplatí vozit
Žebříček nahoře řadí suroviny podle **čistého zisku na jednu jízdu** a v závorce
přidává **zisk na jednotku**. To druhé číslo je poctivější srovnání: částka na
jízdu závisí i na tom, čím se vozilo (velká loď unese víc), zisk na jednotku ne.

Každá surovina je pak rozepsaná ve třech blocích – **na jednu jízdu**, **celkem**
a **za jednu jednotku** – včetně spotřeby konkrétních vstupů
(*„tablet 4 349 ks × 0,40 = 1 740 Kč“*), aby bylo vidět nejen kolik to stálo, ale
i čeho a kolik se na to spotřebovalo.

Prostředky jde řadit podle výdělku, částky na jízdu, počtu jízd nebo označení;
u každého je vidět, co vozil. CSV má řádek za prostředek a pak řádek za každou
jeho surovinu, včetně materiálu, zisku, zisku na jízdu a zisku na jednotku.

**Počítá se jen to, co projde lištou.** Sběr ručně v herním okně rozšíření
nevidí (nemá jak, hra o tom nikde nepíše) a záložka to říká nahlas.

### Příjmy – co přinesla mzda a nevěstinec

Hra ani jedno nesčítá: v okně je vždycky jen to, co čeká teď, a jak to vybereš,
zmizí. Záložka **Příjmy** drží součet za celou dobu, rozepsaný podle měn, kterými
která budova platí (ověřeno z ikon v jejích oknech):

| budova | platí |
|---|---|
| Mzda (#9) | **čisté peníze** (`icon-currency-money`) + **diamanty** |
| Nevěstinec (#19) | **špinavé peníze** (`icon-currency-money-dirty`) |

U mzdy je navíc sazba **za hodinu práce** (a diamanty za hodinu), protože „na
výběr“ o ničem nevypovídá – záleží, jak dlouho se čekalo.

#### Jak se to měří

Přesnou částku hra nikde neuvádí (u nevěstince ani předem – jen rozsah), takže
se snímá **HUD před akcí a po ní** a zapíše se rozdíl. Snímají se všechny tři
měny, i když se u dané budovy nečekají: kdyby jednou přišlo něco jiného,
evidence to ukáže s výstražným „(!)“ místo aby to zahodila do nesprávné kolonky.

**HUD se nemění hned** – hra si čísla přepisuje animací a `user/minute-refresh`
chodí po minutách – takže se čeká, dokud se hodnota nepohne (max 5 s). Když se
nepohne vůbec, u mzdy se doplní částka z okna („vydělal 882.40Kč + 0“) a výběr
se označí jako **nezměřený**; u nevěstince zůstane nula, protože není čím
doplnit. Neurčité výběry se počítají zvlášť, aby součty nelhaly.

Automatika je sériová (`queue.js`), takže do měření nemůže spadnout příjem
odjinud. U ručního kliknutí to vyloučit nejde a je to cena za to, že hra jinou
možnost nedává.

> **Cestou opravená chyba ve `work.js`:** `hoursNum` bralo z „Pracuješ už 120
> minut“ jen to číslo, takže z toho vyšlo 120 **hodin**. Sazba Kč/h byla o dva
> řády mimo a podmínka „vybírej nejdřív po N hodinách“ se nikdy neuplatnila
> (120 není menší než 1). Teď se čte i jednotka – minuty, hodiny i dny.

### Historie
Každé načtení stavu uloží bod. Sleduje se **majetek = čisté peníze + zůstatek
v bance + špinavé peníze**, takže přesun do banky ani vklad nevypadá jako
ztráta – hotovost sama klesne, ale křivka majetku jde plynule dál. Špinavé
peníze jde do součtu nezapočítávat (praní bere 30 %) – vypínač je v Stavu.

**Diamanty** mají vlastní dlaždici (s přírůstkem za den), vlastní graf a
vlastní sloupec v CSV. Do majetku v korunách se nikdy nepřičítají.

Z bodů se počítá **skutečný přírůstek majetku za hodinu** (proložením přímky,
ne rozdílem prvního a posledního bodu), graf s rozsahem 6 h / 24 h / 7 dní /
vše a graf zásob vstupů. Tooltip grafu rozepisuje celek na hotovost a banku,
**Poslední záznamy** mají tři záložky, protože pět sloupců by se do panelu
čitelně nevešlo:

| Záložka | Sloupce |
|---|---|
| **Hotovost** | Čas · Hotovost · Banka · Dohromady (likvidní peníze) |
| **Špinavé** | Čas · Špinavé · Změna proti předchozímu bodu |
| **Diamanty** | Čas · Diamanty · Změna |

Tabulka je zároveň textovou alternativou ke grafu. Export do CSV má všechny
sloupce včetně `diamanty`.

Když se hodnoty nepodaří přečíst z UI hry, jde celý bod zapsat ručně
(prázdné pole se uloží jako „neznámo“, ne jako nula).

### Aukce – vyplnění sázky
V aukci (budova **#2**, hned u letadel) přidá pod pole „Tvá sázka?“ lištu:

> vložit: **17 000 000** · **+1** · **+1 %** · **+5 %**

První vloží stejnou částku jako nejvyšší sázka, `+1` je minimální přebití
(hra minimální příhoz nikde neuvádí – z pravidel plyne, že stačí o korunu víc),
procenta jsou rezerva proti dalšímu přihazujícímu. Kliknutí **jen vyplní pole**;
odesíláš sám. Aukce se sama přenačítá, takže se lišta doplňuje i po výměně DOM.

Platí se **špinavými penězi** (cena má ikonu `currency-money-dirty`).

### Umístění lišty

Lišta stojí vlevo dole, **zvednutá 65 px** od spodní hrany (`--cmc-gym-lift`
v `panel.css`) – dole v hře jsou vlastní ovládací prvky. Je to jedno číslo
schválně: mění se s ním i odsazení stránky (`body.cmc-gym-padded`), aby lišta
nikdy nepřekryla obsah hry. Protože se odlepila od hrany, má okraj a zaoblení
dokola, ne jen nahoře.

### Posilovna a kasárna – lišta s tréninkem
V posilovně (**#26**) i kasárnách (**#20**) je „Trénovat“ až za popisem a cenami,
takže se mezi tlačítky jinak dá jen scrollovat. Lišta **vlevo u spodní hrany**
(odsazená 60 px) je dá na jedno místo, oddělené po budovách:

> ‹ TRÉNOVAT: **Rychlost** · **Síla** · **Obrana** | **Strážci** · **Bojovníci** ×

Šipkou **‹** lištu dočasně skryješ na malý úchyt — funkce zůstane zapnutá,
tlačítka jen nezabírají místo, a stav se pamatuje. Křížek **×** lištu vypne
úplně (znovu zapneš v nastavení).

Když hra akci odmítne (**„Nemáš dostatek energie. Potřebuješ 30 energie.“**),
ukáže se to v liště. Bez toho by při tréninku na pozadí nebylo poznat, že se
nic nestalo — hra svoje hlášky zobrazuje ve vlastním okně, které tam není.
Čtou se jen viditelné hlášky, aby se za odezvu nepočítala ta z minulého pokusu.

Ceny se mezi budovami liší (posilovna ~3 energie, kasárna 30), takže je běžné,
že na jednu akci energii máš a na druhou ne.

#### Co jde na pozadí

Se zapnutou volbou fungují **obě budovy** – lišta je použitelná odkudkoli:

| Budova | Režim | Jak |
|---|---|---|
| Posilovna `#26` | `local` | vyrobí se jen odkaz s `action` – rychlé, jednotky ms |
| Kasárna `#20` | `fragment` | vloží se celý fragment budovy a klikne se na skutečné tlačítko v něm |

**Proč dva režimy.** Handlery hry nejsou stejně tolerantní. Oba jsou navěšené
identicky (`$(document).on('click', '.trainGym' / '.trainArmy', …)`), ale oba
v těle volají `.parents('.gym-item')` / `.parents('.army-item')`, `offset()`
a `after()`. Posilovně stačí osamocený odkaz, kasárna na něj **vůbec
nezareagují** – handler se nespustí. S vloženým fragmentem projde
`POST /map/building/army/army_guards → 200` a strážci narostou (ověřeno
v síťovém logu: `626 888 → 626 977`).

Proto má offscreen kontejner v CSS skutečné rozměry (900×600) – handler si čte
`offset()` a `scrollTop()`, takže prvek bez layoutu mu nestačí.

Fragment se stahuje jen v režimu `fragment`, tedy u kasáren; posilovna žádný
požadavek navíc nepotřebuje.

### Ve vězení ani v nemocnici automatika neklikne

V obou stavech hra akce odmítá, takže by automatika mlela naprázdno – a naživo
se to projevilo hůř: **pokoušela se o akci pořád znovu, dokud to uživatel
nevypnul.**

Hra to bere jako **jeden stav**. V hlavičce je ikona s popiskem „Hráč je
v nemocnici **nebo ve vězení**.“:

```
.gadges .icons-l .icon-h.tooltip-over > .icon.status-med
```

Ta ikona je hlavní znak, protože je to **CSS třída, ne text** – nezmizí s jazykem
ani s přeformulováním hlášky. Ověřeno na živé stránce: je právě jedna, viditelná,
a ostatní stavové ikony jsou `status-vip` a `status-shild`, takže `status-med` je
specifická. Vyžaduje se `offsetParent` – kdyby si hra prvek nechávala v DOM i ve
zdravém stavu a jen ho skrývala, automatika by jinak stála natrvalo.

> **Proč to dřív nefungovalo:** stará detekce hledala jen texty o *vězení*
> a jen v modálních oknech (`.modal-box`, toasty). Stav nemocnice ale hra hlásí
> ikonou v hlavičce, ne modálem – takže se na nic nechytila.

Texty zůstávají jako záloha a pro `inText()`, které kouká do fragmentu budovy,
kde hlavička není: „ležíš v nemocnici“, „jsi v nemocnici“, „musíš se vyléčit“
a původní vězeňské formulace.

#### Jen druhá osoba – a jen viditelný text

Dvě pasti, které naživo **zastavily poker, i když hráč ve vězení nebyl**:

**1. Popisek ve třetí osobě.** V seznamu byl i `/hráč je v nemocnici/` – jenže
„Hráč je v nemocnici nebo ve vězení.“ je popisek stavové **ikony** a hra ho píše
u **každého** hráče, kterého někde vypsala. Kasino (#18) má tabuli „Největší
výhry / Poslední výhry“ s cizími jmény, takže tam ta věta vyskočí, kdykoli je
v nemocnici někdo úplně jiný:

```
1 DestroyerX Zlín 3 Hráč je v nemocnici nebo ve vězení. Výhra 1Kč
```

Projevilo se to sedmi pokusy během padesáti sekund a pak to samo přestalo –
podle toho, kdo je právě na tabuli. Horší je, že totéž platilo pro `detect()` nad
otevřeným oknem kasina, takže se tím dala zastavit **celá** automatika. Marker
je pryč; vlastní stav se pozná ikonou v hlavičce, ta patří mně. Popisky
(`.tooltip-i`) se z textu vyhazují úplně – jsou to nápovědy k čemukoli.

**2. Hledání v HTML místo v textu.** Výrazy se pouštěly na surovou odpověď.
Fragment kasina má **145 715 znaků, ale viditelného textu jen 3 641** – 98 % je
značkování a atributy (tisíce obrázků karet, `title`, `alt`, `data-message`).
Jediná vězeňská formulace v atributu tedy stačila. Teď se odpověď rozebere
a hledá se jen ve viditelném textu bez `<script>` a `<style>`.

Hláška navíc říká **podle čeho** se to poznalo: `jsi ve vězení – podle textu
„…“`. Původní „jsi ve vězení“ se nedalo ani potvrdit, ani vyvrátit – v logu bylo
sedm stejných řádků a nic víc.

Zastavuje se to na **dvou místech**: každý modul si to hlídá sám a navíc tik
lišty vůbec nic nezařadí do fronty a napíše do stavu `⏸ Hráč je v nemocnici nebo
ve vězení – automatika stojí`. Bez té hlášky to vypadalo jako zacyklení.

**Ruční klikání v liště blokované není** – když se dá zaplatit kauce nebo se
vyléčit, je to tvoje rozhodnutí.

### Automatický trénink
Jediná funkce, která klikne bez tvého kliknutí. **Výchozí vypnuto.**

| Nastavení | Výchozí | K čemu |
|---|---|---|
| `autoTrain` | vypnuto | Rychlost / Síla / Obrana / Strážci / Bojovníci |
| `autoCrime` | vypnuto | který zločin se má páchat sám (select v řádku Zločiny) |
| `autoTrainPct` | 100 | při jaké plnosti energie se dávka spustí (100 / 90 / 80 / 75 %) |
| `autoTrainFloor` | 70 | dokud energie neklesne sem (80 … 10 %, nebo 0 % = vyčerpat) |
| `autoTrainLuck` | 100 | minimum **štěstí**, aby se dávka rozjela |
| `autoTrainGap` | 1000 ms | pevná prodleva mezi kliky |

Plnost energie se nemusí odhadovat – hra si ji sama píše do šířky ukazatele
`.ins.renew-energyPercent` (`style="width: 100%"`), takže „100 %“ je skutečná
hodnota ze hry.

**Pozor na jednu past.** Hra při akci z modalu na pozadí HUD nepřekreslí, takže
si rozšíření energii odečítá samo (`subtractCost`) – ale to měnilo jen absolutní
číslo, ne šířku ukazatele. Procenta by tak zůstala na 100 % a dávka by se podle
nich **nikdy nezastavila**. Proto `subtractCost` dorovnává i ukazatel
(`syncEnergyBar`): odvodí maximum z čísla a plnosti *před* zásahem a po odečtení
přepíše šířku. Vedlejší efekt je, že HUD po tréninku na pozadí konečně vypadá
správně i vizuálně.

Obě hranice jsou v popupu jako **select**, ne volné číslo. Dolní musí být nižší
než horní – jinak by se dávka spustila a hned zastavila, tedy by se navenek „nic
nedělo“; nastavení ji proto samo posune a napíše to.

#### Štěstí je druhá měna
Trénink nebere jen energii: v HUD hned vedle energie je **štěstí** a jeden klik
z něj bere ~50. Hra o něm v posilovně píše *„Čím více máš štěstí, tím efektivněji
se využívá tvá energie. Množství štěstí závisí na špercích, které nosíš.“* – tedy
**neregeneruje se samo** jako energie.

Pozor na jméno: v DOM se to jmenuje `renew-awake`, ale ikonu má `resources-happy`
a je to štěstí, ne bdělost (dřív to tak bylo v kódu i v textech špatně
pojmenované). Cena tréninku ve fragmentu je v pořadí **štěstí, energie, peníze**
(`-50 -3 -25Kč`).

Automatika se proto rozjede jen se štěstím **≥ `autoTrainLuck`** a při poklesu
pod tu hranici se zastaví – jinak by jela dál, hra by ji odmítala a v liště by
zbylo jen „Nemáš dostatek štěstí“. Důvod zastavení je vidět ve stavu
(*„auto Rychlost: 3× hotovo (štěstí 90 < 100)“*).

Dávka se zastaví na: dolní hranici, ceně dalšího tréninku, odmítnutí hrou (málo
štěstí nebo peněz), stropu 100 kliků na dávku, vypnutí volby nebo tlačítku
**■** v liště.

#### Posilovna dávkuje, kasárna klikají po jednom
Posilovna uvádí cenu tréninku ve fragmentu (`-35 -3 -6Kč`), takže si rozšíření
energii odečte samo a dávka jde plynule až na dno.

**Kasárna cenu neuvádějí nikde** – v jejich fragmentu není ani cena, ani ikony
zdrojů (ověřeno). Bez ceny se nedá odečítat z HUD, a tím ani spoléhat na
procenta. Hra si HUD po akci na pozadí obnoví sama, ale **se zpožděním** (změřeno
v běžící hře: energie 58 → 38 po tréninku strážců, tedy 20 za kus). Kdyby se
klikalo dál podle zastaralých procent, dno by se přestřelilo.

Proto: u akce **bez známé ceny** se v dávce klikne **jednou** a pak se 15 s čeká,
než hra HUD přepíše; dno se vyhodnotí z jejích čísel. Jeden strážce stojí velký
díl energie, takže jeden klik na cyklus je i tak skoro celá dávka.

`autoKey()` kontroluje vybranou akci i v kódu (`AUTO_ALLOWED`), aby nabídka
v popupu odpovídala tomu, co se opravdu pustí.

#### Hlavní vypínač automatiky
Tlačítko **⏸ / ▶** v liště (a `autoPaused` v nastavení) vypne nebo zapne
**veškerou** automatiku – trénink i dopravu – jedním klikem. Je to **hradlo nad
jednotlivými volbami, ne jejich mazání**: `autoTrain`, `autoPlane` a `autoBoat`
zůstanou, jak byly, takže po zapnutí pokračuje přesně to, co běželo předtím.
Kdyby to volby přepisovalo, „zapnout zpátky“ by znamenalo nastavit si to celé
znovu.

Proto se v kódu rozlišuje **co je nastavené** od **co se smí spustit**:
`autoSetting()` / `fleet.autoSet(kind)` vrací nastavení, `autoKey()` /
`fleet.autoOn(kind)` k tomu přidávají vypínač. UI ukazuje obojí – select drží
vybranou akci, zaškrtávátko zůstává zaškrtnuté, ale místo oranžové je šedá
a `auto ⏸`, aby bylo poznat, že to teď neběží.

Vypnutí navíc **zastaví i právě běžící dávku**, ne až tu příští. Tlačítko se
ukazuje jen tehdy, když je vůbec co vypínat – u prázdného nastavení by to byl
mrtvý knoflík.

Výběr akce je na konci řádku **Trénovat** v liště (a taky v nastavení, kde se
nastavují hranice a prodleva – kdyby byla lišta vypnutá, nesmí to skončit tak, že
se automatika nedá vypnout). Přepnutí na „vypnuto“ zastaví i právě běžící dávku,
■ zastaví dávku a volbu nechá zapnutou.

**Otevřená nabídka a přerender.** Herní HUD se pořád mění, takže observer lištu
překresluje – a to by rozbalený `<select>` zavřelo (klikneš a nabídka zmizí).
`collect()` proto přerender přeskočí, když je fokus na `<select>` uvnitř lišty
(`selectOpen()`); vlastní změna volby si vynutí překreslení přes `collect(true)`.

Prodleva je **pevná**. Žádné náhodné rozptýlení časování tu záměrně není –
zjednodušit si klikání je jedna věc, maskovat, že jde o klikátko, druhá.

### Výrobny surovin (#27, #21, #24, #29)

Čtyři tlačítka a **jedno** zaškrtávátko automatiky pro všechny. Sdílejí řádek
s bankou – **nejdřív výrobny, pak banka** –, protože obojí je práce se surovinami
a penězi a u obojího se **platí** (materiál, poplatek za praní); do řádku budov,
kde se jen sbírá hotové, nepatří ani jedno. Řádek skládá `gym.js` z `buttons()`
jednotlivých modulů, každá skupina má vlastní popisek i zaškrtávátko.
Proměřeno naživo:

| budova | sběr | spuštění | materiál | cena |
|---|---|---|---|---|
| #27 Konopná farma | `agriculture/harvest/<id>` | `agriculture/plant-pot` | 100 semen / ha | 0,10 |
| #21 Laboratoř pervitinu | `methlab/collect/<id>` | `methlab/boil` | 30 pilulek / chemik | 0,40 |
| #24 Palírna whisky | `whiskydistillery/harvest/<id>` | `…/makewhisky` | 8 kg pšenice / sud | 2,50 |
| #29 Pivovar | `beerbrewery/harvest/<id>` | `…/boilBeer` | **15 kg chmele + 30 kg ječmene** / sud | 0,60 / 0,20 |

Materiál se platí **špinavými penězi**. Pivovar je jediný, který potřebuje dvě
suroviny, a hlídají se obě zvlášť.

#### Přímý požadavek server nepřijme

`POST /map/building/methlab/collect/68933` vrátí **404 a „Spausk per mygtuką, o ne
per nuorodą!“** (klikni na tlačítko, ne na odkaz). Akce se proto provádějí jako
u šachet: fragment budovy se vloží do herního okna mimo obraz a klikne se na
**skutečné tlačítko**, takže požadavek pošle hra sama.

#### Tlačítkům v okně nejde věřit – hlídá se odpočet

**Pivovar nabízí „Vařit pivo“, i když fermentace ještě běží**, a hra pak požadavek
odmítne litevským **„Verslas visdar dirba, turi sulaukti kada baigs“** (podnik ještě
pracuje). Ostatní tři budovy v tom stavu tlačítko neukážou, takže je to vada jen
u pivovaru – ale kontroluje se to u všech čtyř.

Rozhoduje `.working` v sekci `#land`: `data-time` (nebo `data-timedone` mínus
`data-timenow`) říká, kolik sekund zbývá.

| odpočet | co to znamená | co se dělá |
|---|---|---|
| kladný | ještě běží | **nic** – ani sběr, ani start |
| záporný | hotovo a po termínu (hra odpařuje %) | sbírá se |
| chybí `.working` | nic neběží | dokupuje a spouští se |

Záporné číslo se nesmí brát jako „ještě běží“ – právě v tom stavu se sbírat
**musí**, protože hra za zdržení odpařuje 2–3 % produktu.

> Bez téhle kontroly to automatika zkoušela každých pět sekund a uživateli
> vyskakovala hláška, dokud auto nevypnul. Tlačítko běžící výrobny je teď
> zašedlé a s ⏳; v popisku je, kolik zbývá.

#### Jedno volání = jedna úloha

`kolo()` udělá vždycky **jednu** věc a skončí:

| pořadí | úloha |
|---|---|
| 1 | **sebrat** – uvolní kapacitu, proto první |
| 2 | **dorovnat peníze** z banky (výběr + převod) |
| 3 | **koupit JEDNU surovinu** – druhá přijde v dalším tiku |
| 4 | **spustit** výrobu |

Nic se nespojuje do jednoho kroku. Fronta (`queue.js`) řadí akce po jedné
a nechává mezi nimi mezeru, takže se rozdělené úlohy navzájem nerozhodí a v liště
je vidět, co se zrovna děje. Pivovar se dvěma surovinami tak zabere dva tiky
místo jednoho – při tiku po pěti sekundách to nevadí.

#### Nedostatek peněz nesmí zastavit výrobu

Materiál se kupuje na plnou kapacitu, ale když na to nejsou peníze **ani
v bance**, výroba se přesto rozjede s tím, co na skladě je.

> Naživo tohle stálo výrobu: pivovar měl chmel a ječmen **na 25 600 sudů**, ale
> čekal na dokoupení za 918 tis. Kč, které nešlo zaplatit – a modul vracel jen
> „nedostatek“. Stojící výrobna je horší než menší dávka.

#### Pořadí: sebrat → dokoupit → spustit

Kolik se dá vyrobit, určuje volná kapacita (sudy, hektary, chemici) – a ta se
uvolní **teprve sběrem**. Materiál na plnou kapacitu se proto kupuje až po sběru;
jinak by se kupovalo na kapacitu, která ještě není volná.

#### Chybějící množství se počítá, ne opisuje

Předvyplněné množství v nákupním poli **nejde věřit**: u konopí hra předvyplní
přesně chybějících 33 165 000 semen, u whisky nechá pole prázdné, i když pšenice
na plnou kapacitu **nestačí** (827 536 kg proti potřebným 2 653 200). Počítá se
tedy `kapacita × naJednotku − sklad`.

**„Může zde pracovat X chemiků“ NENÍ kapacita.** U laboratoře (#21) hra píše dvě
čísla a jen první z nich je kapacita:

| v okně | co to je |
| --- | --- |
| `Dostupní chemici: 127 622` | kapacita budovy |
| `Může zde pracovat 0 chemiků` | `floor(pilulky / 30)`, tedy **důsledek zásob** |

Původně se z nich bralo **minimum** („ať se nepřestřelí“). Znělo to opatrně, ale
kapacita pak nikdy nepřerostla to, na co už materiál byl – takže si laboratoř
**nikdy nedokoupila** pilulky. Při nule to uvázlo úplně: kapacita 0 → nic
nechybí → není co kupovat → nikdy se nekoupí, i když v okně svítí „Koupit“
a špinavých je 28 milionů.

Že je to odvozené číslo, potvrdily dva nezávislé údaje: naživo 0 tablet →
„Může zde pracovat 0 chemiků“, a v testovací fixtuře 989 280 ÷ 30 = 32 976, což
bylo přesně to číslo. `kapacitaRe` je proto **seznam alternativ** (vyhrává první
nalezený), ne vstup do minima.

> Kontrola proti hře: pivovar má 66 892 volných sudů, chmele 1 022 620 kg
> a ječmene 1 545 240 kg. Modul spočítá úzké hrdlo na ječmeni (1 545 240 ÷ 30 =
> 51 508 sudů) – a hra sama píše „Máš dost ingrediencí na 51 508 sudů“.

Za tik se řeší **jedna** budova a střídají se, aby ze čtyř výroben nešlo osm
požadavků do hry v jednom okamžiku. Když na materiál nejsou špinavé peníze, kolo
to řekne a **nic nekoupí** – prodej surovin ani peníze z banky se do toho zatím
nezapojují, to je další fáze.

### Šetření baterie: zastavit animace hry

Změřeno v běžící hře přes `document.getAnimations()`:

| co běží | kolik | vlastnost | smyčka |
|---|---|---|---|
| `pulseAnim` | 13× | transform | 1 s |
| `pulseAnimLittle` | 9× | transform | 1 s |
| `bounceAnim` | 2× | transform | 1 s |
| `bounce` | 2× | transform | 2 s |
| `bounceInAnim` | 1× | transform + opacity | 1 s |
| **celkem** | **27–28, všechny `infinite`** | | |

Animují jen `transform`/`opacity`, takže **nepřepočítávají layout** – ale právě
proto běží na kompozitoru, který se kvůli nim nesmí uspat: karta se překresluje
každý snímek, i když se ve hře nic nemění.

**Rozšíření za to nemůže** – z těch 27 je našich **nula** (změřeno). Jediná naše
nekonečná animace je ozubené kolečko u běžící akce, které se točí jen během akce.
Lišta se navíc nepřestavuje: za 20 s nula změn DOM, nula požadavků při pauze.

Volba **Zastavit animace hry** má tři stupně:

| režim | co dělá |
|---|---|
| `napozadi` *(výchozí)* | vypne je, když karta není vidět **nebo není zaostřená** |
| `vzdy` | nekreslí se nikdy |
| `nikdy` | nechá vše běžet |

Skrytou nebo zakrytou kartu zastaví Chrome sám, tam šetřit netřeba. Problém je
karta **viditelná, ale nečinná** – druhý monitor nebo poloviční okno vedle
prohlížeče; proto se hlídá i `blur`/`focus`, ne jen `visibilitychange`.

Ověřeno naživo: se zapnutým režimem spadl počet běžících animací **z 28 na 0**
a po vypnutí se vrátil. Nic se tím nerozbije – jsou to jen upoutávky („Vybrat
mzdu“ pulzuje) a co se dá udělat, je stejně v liště. Prvky rozšíření se ze
pravidla vylučují (`:not([class*='cmc-'])`), včetně pseudoprvků.

### Tmavá prázdná stránka = kontrola „jsi člověk?“

Uživatel hlásil, že *„karta celé hry je kompletně šedivá/černá a nic tam není“*
a že musí obnovit stránku – nejčastěji, když byl na jiné kartě. Příčina je v CSS
hry:

```css
.captcha-modal.active { background: rgba(0, 0, 0, 0.75); z-index: 1020; }
```

Modal má `width: 100%` a `max-width: 100%`, takže překryje **celou stránku** 75%
černou. Obsah se do něj dosazuje až při spuštění, takže dokud se nenačte (nebo
se nenačte vůbec), je vidět jen ta tmavá plocha – tedy „nic tam není“. Zahozená
karta od Chrome by byla bílá, a `document.wasDiscarded` je `false`; paměť taky
nedochází (28 MB ze 4192 MB, 1306 uzlů, **0 zapomenutých vložených fragmentů**).

Otevřenost se pozná **přidanou třídou `active`**, ne `display` – ten je u modalů
hry vždycky `flex`. Stejná past jako u `.confirm-modal` v bance, kde detekce
podle `display` znamenala, že se **nepřevedlo ani jednou**.

**Co s tím rozšíření dělá: zastaví se a řekne to.** Nic víc.

- captcha se v tiku vyhodnocuje **první**, před vězením i před pauzou – jinak by
  se při zapnuté pauze vůbec nezjistilo, že hra něco chce
- fronta se vyprázdní a zapne se **hlavní pauza**, takže se to po vyřešení
  nerozjede samo; hra právě dala najevo, že provoz vypadá robotický, a kdyby se
  automatika sama pustila dál, kontrola se spustí znovu
- pauza se zapne **jednou za výskyt**, ať se uživateli nepřepíná pod rukama

**Rozšíření s captchou nikdy neinteraguje.** Nevyplňuje ji, neřeší, neklika do
ní, nezavírá ji – a **neobnovuje kvůli ní stránku**. To poslední je snadné
přehlédnout: noční obnovování by tu tmavou stránku obnovilo a captcha by zmizela,
tedy by se kontrola obcházela. `reload.js` má proto na captchu **výslovnou
podmínku** a je na to test, protože je to přesně ten stav, kdy člověk sáhne po
F5. Test navíc kontroluje samotný **zdroj** modulu: žádný `.click(`, žádné
`.value =`, žádné `classList.remove` a žádný `location.reload`.

Skutečné řešení není v kódu: **méně automatiky**. Čím déle jede bez přerušení
(typicky když jsi na jiné kartě), tím spíš se kontrola spustí.

### Noční obnovování stránky (rozvrh drží background)

Hra po delší době přestane reagovat – **černá obrazovka, nic se nemaluje** –
a obnovení to spraví; jenže přes noc u toho nikdo nesedí. Zapíná se to
zaškrtávátkem **⟳** v ovládání lišty nebo v nastavení. **Výchozí vypnuto.**

#### Proč to nesmí být v obsahu stránky

První verze byl `setInterval` v content skriptu. Vypadalo to funkčně, ale mělo to
dvě zásadní vady – a **obě uhodí právě tehdy, kdy je funkce potřeba**:

| vada | důsledek |
|---|---|
| Chrome v kartě **na pozadí** časovače brzdí (typicky 1×/min) a po delší nečinnosti kartu **zmrazí** | přes noc je karta na pozadí celou dobu, takže se obnovení nemuselo spustit **ani jednou** |
| když **JavaScript stránky stojí**, `location.reload()` z té stránky nikdy nedojde k vykonání | lék byl uvnitř pacienta |

Rozvrh proto vlastní `background.js` (MV3 service worker): `chrome.alarms`
tomuhle brzdění nepodléhá a `chrome.tabs.reload()` funguje bez ohledu na stav
stránky. Oprávnění stačí přidat `alarms`; karty se hledají přes `host_permissions`,
které rozšíření má.

#### Mlčení karty je diagnóza, ne chyba

Z vnitřku stránky se **nedá poznat, že se nemaluje**: DOM i layout jsou
v pořádku, prvky mají správné rozměry, obrázky jsou `complete` – chybí jen
vykreslení a do té vrstvy stránka nevidí. Naměřeno při hledání příčiny: `body`
má pozadí `rgb(0,0,0)`, takže ta čerň **je pozadí stránky**; `document.wasDiscarded`
je `false`, JS halda 36 MB a **0 zapomenutých vložených fragmentů**, takže to není
ani paměť, ani rozšíření. Mapa je přitom **10,2 Mpx** a obrázky **27,8 Mpx
(≈ 106 MB dekódovaných)** – tedy přesně obsah, kterému Chrome na kartě v pozadí
uvolní GPU prostředky.

**Zvenčí to poznat jde:** když se obsahový skript do `ODPOVED_MS` neozve, je
stránka zaseknutá. To je detekce, kterou z prostředí stránky postavit nešlo.

#### Rozdělení práce

| kdo | co |
|---|---|
| background | drží rozvrh (termín per karta v `reloadPlan`), ptá se karty, rozhoduje |
| stránka | odpoví, jestli se smí, a udělá **odpočet** v liště |
| background | když se karta neozve **nebo slib nesplní**, obnoví ji sám |

Odpočet je jediný důvod, proč obnovení nedělá background rovnou: bez hlášky
vypadá obnovení jako pád stránky. Ale slib se nepočítá, výsledek ano – proto ten
`SLIB_MS` backstop.

**Prodleva je náhodná z 30–60 minut** a losuje se po každém obnovení. Pevná
perioda by z toho udělala hodinky, které jdou na sekundu.

**Nikdy uprostřed rozdělané akce.** Karta odpoví `{ ok: false, duvod }`, když
`queue.busy` nebo `queue.length` – obnovit stránku mezi `takeFromBank`
a `convertToDirty` znamená přijít o peníze. Termín se přitom **posune, nezahodí**;
kdyby se zahodil, čekalo by se dalších 30–60 minut. Rozečtená stránka
(`status !== 'complete'`) se za zaseknutou nepovažuje.

**Kontrola „jsi člověk?“ se neobchází ani odsud.** Karta ji hlásí v odpovědi, ale
u zaseknuté karty žádná odpověď není – proto si content skript píše do storage
`captchaAt` a background ho respektuje i při mlčení. Zaseknutá karta captchu
vykreslit neumí, takže je to spíš pojistka; mít ji ale musí, protože na téhle
úvaze nesmí nic záležet.

**Osiřelý skript se tím vyřešil sám.** Po reloadu rozšíření nemá odpojený skript
`chrome.*`, takže na dotaz neodpoví – a background ho podle mlčení obnoví zvenčí.
Vyšlo to lépe než předchozí obcházka s pamatováním nastavení v paměti modulu.

### Banka (#22) – praní peněz

`🧼 Prát`, `💰 Sebrat` a zaškrtávátko automatiky. Sdílí řádek s výrobnami a stojí
**za nimi**. V řádku budov není schválně – tam se sbírá hotové (šachty, mzda,
nevěstinec), kdežto praní je **směna se ztrátou**; v jedné řadě s „vybrat mzdu“
by se to kliklo omylem. Čísla (vypráno/sebráno) v liště nejsou: jde o směnu,
ne o zisk, takže dvě čísla vedle sebe na jeden pohled nic neříkají – souhrn je
v záložce Příjmy. Proměřeno naživo:

```
POST /map/building/bank/startLaundering       {amount}  → 200, prázdné tělo
POST /map/building/bank/collectLaunderedMoney {}        → 200
     {"money":"70Kč","confirm":"Sesbíral jsi …70Kč"}
```

Cyklus změřený na skutečných penězích: **špinavé −100 → praní → sebrat → čisté
+70**. Kurz je 100 Kč = 70 Kč, takže **hra si bere 30 %** – proto je automatika
ve výchozím stavu vypnutá a zapíná se vědomě.

**Částka se nezadává.** Kolik jde vyprat, závisí na úrovni budovy a na tom, kolik
špinavých peněz zrovna je; hra to spočítá sama a předvyplní do
`#laundering input[name=amount]`. Bere se, co tam je – nižší z obojího tím pádem
vyjde samo, bez dopočítávání na naší straně.

#### Peníze z banky na materiál: převede se přesně to, co chybí

Banka drží **čisté** peníze, ale materiál pro výrobny se platí **špinavými**,
takže z banky nejde platit přímo. Řetězec je:

```
sklad (čisté) → takeFromBank → účet (čisté) → convertToDirty → špinavé → materiál
```

**Převodník má jiné tlačítko a ještě se ptá.** Vklad a výběr mají cíl v `action`,
převod ale v `data-action="convertMoneyToDirty('…/convertToDirty')"`, a k tomu
nese `data-message` – hra proto napřed otevře vlastní potvrzení (`.confirm-box`
s `#confirmYes` / `#confirmNo`, delegovaně na `document`). Dokud se nepotvrdí,
**neodejde ani jeden požadavek** (změřeno odposlechem `fetch`/XHR: po kliku
prázdno). Hledalo se přitom jen `[action]`, takže převod padal na „tlačítko
v okně banky není“, v liště svítilo `⚠ Pivo: …` a vypadalo to na chybu výroben –
peníze prostě nikdy nedorazily. Fixtura v testu to maskovala tím, že měla
u převodníku obyčejné `action`; teď má obojí jako živá hra.

**Potvrzovací dialogy jsou dva a poznají se opačně.** Tohle zastavilo pivovar,
palírnu i konopnou farmu naráz:

| dialog | otevřený se pozná |
|---|---|
| `.confirm-box` v `.middle-top-alert` | `display` není `none`; třída `active` na něm zůstává **vždy** |
| `.confirm-modal` (`.modal-box.center`) | přidanou třídou **`active`**; `display` je **vždy** `flex` |

Převod otevírá **ten druhý**. Detekce koukala jen na první a jen na `display`,
takže „Ano“ se nikdy nekliklo a **nepřevedlo se ani jednou** – zatímco banka
hlásila `Whisky: z banky – převedeno 9,1 mil. Kč`. Peníze zůstaly **čisté** na
účtu, materiál se platí **špinavými**, takže tři výrobny stály se zásobou 0
a v panelu to vypadalo, že peníze dorazily. `offsetParent` nepomůže – u
`.confirm-modal` je `null` v obou stavech. A `#confirmYes` je v dokumentu
**dvakrát**, takže se hledá uvnitř toho dialogu, který je otevřený.

**Úspěch se měří, nepředpokládá.** Hlubší chyba byla, že `prevest()` jen kliklo
a vrátilo „převedeno“, aniž by se kdokoli podíval, jestli se peníze pohnuly –
proto se rozbité potvrzování nedalo poznat odnikud než z reálného stavu peněz.
Teď se špinavé čtou před a po; nezvednou-li se aspoň o 90 % žádané částky (HUD
se překresluje se zpožděním, tak se zkouší šestkrát), hlásí se **neúspěch**.
Selhání se z `zajisti()` vrací jako `{ ok: false, duvod }` stejně jako ostatní
důvody, aby se nemohlo cestou spolknout. Ptát se „opravdu?“ na akci, kterou sis sám zapnul
zaškrtávátkem, nemá smysl, a při každém převodu by to probliklo přes obrazovku,
takže se dialog na těch pár set milisekund schová (`html.cmc-tichy-dialog`).
Schovává se přes `visibility`, ne `display`: podle `display` se pozná otevřený
dialog a `display: none` by ho schoval i před vlastní kontrolou. Třída se
sundává v `finally` **bezpodmínečně** – kdyby zůstala viset, měl bys u každého
dalšího potvrzení hry neviditelné okno, tedy zaseknutou hru bez vysvětlení.
**Cizí otevřený dialog se nepotvrzuje**: je jen jeden pro celou stránku, takže
by ti automatika mohla odklepnout tvoji vlastní akci (třeba prodej) – `klikni()`
na něj rovnou couvne.

Převod je **1:1** – banka u převodníku píše „1 Kč = 1 Kč“ (ověřeno naostro s 1 Kč:
čisté −1, špinavé +1), takže se na tom
neztrácí nic (na rozdíl od praní za 30 %). Přesto se převádí **jen tolik, kolik
doopravdy chybí**: čisté peníze jsou potřeba na vylepšování budov a zpátky by
šly jen praním se ztrátou 30 %.

Pořadí v `bank.zajisti(potreba)`:

| krok | co se stane |
|---|---|
| 1 | spočítá se `chybí = potřeba − špinavé, co mám` |
| 2 | nejdřív se použije, co je **na účtu** (čisté) |
| 3 | z banky se vybere **jen zbytek**, který na účtu nebyl |
| 4 | převede se přesně `chybí` |
| — | nestačí-li to ani s bankou, **nic se neposílá** a řekne se, kolik chybí |

Výrobny to volají samy: když na materiál nestačí špinavé, zavolá se `zajisti()`
a teprve pak se kupuje. Zbytečný výběr a vklad tam a zpátky by jen mlel naprázdno,
proto se nikdy nevybírá „pro zásobu“.

#### Sáhnout jen na své pole a své tlačítko

Sekce `#deposit` má **dvě pole** – `deposit` (vložit) a `withdraw` (vybrat) –
a ke každému patří vlastní tlačítko. Když se nastaví jen to správné a klikne se
na tlačítko **uvnitř `#deposit`**, sedí částka na korunu:

| akce | zadáno | skutečně |
|---|---|---|
| Vybrat | 777 777 | **777 777** ✓ |
| Vložit | 777 777 | **777 777** ✓ |
| konečný stav | — | přesně jako na začátku |

> **Dvě věci to rozbijí a obě jsem si vyzkoušel:**
> nastavit „pro jistotu“ i `input[name=amount]` (praní, převodník) – hra pak vzala
> jejich hodnotu a přesunula **997 místo milionu**; a hledat tlačítko v celém okně
> místo v jeho sekci. Když se sáhne jen na své pole a své tlačítko, nic z okolí
> to nerozhodí.

`ulozVse()` přesto kliká ve smyčce, dokud na účtu nezůstane jen rezerva – je to
pojistka pro případ, že by hra někdy poslala míň. Pokrok se měří z **okna banky**
(`kVkladu`), ne z HUD, který se překresluje se zpožděním; smyčka končí při
dosažení rezervy, při nulovém pohybu (a to už se ukládání vypne) nebo na stropu
12 kroků. `MIN_VKLAD` a `bankMinVklad` rozhodují jen o tom, jestli se **začne** –
jakmile se začne, dotáhne se to k rezervě, aby nezůstával zbytek pod prahem.

> **Energii to nestojí.** Původně to vypadalo, že vklad bere energii; měření to
> vyvrátilo (21 → 21 → 21 přes výběr i vklad).

#### Ukládání do skladu: zdarma a zvlášť od praní

Druhé zaškrtávátko a políčko **rezervy** přímo v liště. Přesune čisté peníze
**nad rezervou** do skladu banky, kde na ně nikdo nedosáhne – a je to **zdarma**,
na rozdíl od praní za 30 %. Proto je to samostatná volba: kdo chce jen bezpečí
před krádeží, nemá platit poplatek.

| nastavení | co dělá |
|---|---|
| `bankUloz` | zapíná automatické ukládání |
| `bankKeep` | kolik nechat mimo banku (0 = uložit vše) |
| `MIN_VKLAD` | 10 tis. Kč – pod tím se neukládá, ať to neklikalo po korunách |

Rezerva je v liště schválně, ne jen v předvolbách: mění se podle toho, co člověk
zrovna plánuje kupovat, takže má být po ruce. V automatice jde ukládání **první**,
před praním.

> **Kolik jde uložit se čte z OKNA, ne z HUD.** HUD ukazuje **zaokrouhlené**
> peníze, kdežto skutečný zůstatek má haléře: HUD „2 742 863“ proti oknu
> „Vložit peníze? 2742862.99“. Kdo počítá z HUD, pošle **o korunu víc, než
> doopravdy má**, a hra vklad odmítne. Bere se proto číslo z okna a zaokrouhluje
> se **dolů**; HUD slouží jen jako záloha, dokud okno není načtené (a `kUlozeni()`
> to přizná v poli `zdroj`).

> **Ukládání a výběr se musí klikat.** `insertToBank` a `takeFromBank` vracejí na
> přímý požadavek **404 „Spausk per mygtuką, o ne per nuorodą!“** – a to i s CSRF
> a hlavičkou `X-Requested-With`. Praní a sebrání ho přitom berou; proč je v tom
> hra nekonzistentní, nevím, ale změřeno je to takhle. Ukládání proto jde přes
> vložený fragment a klik na skutečné tlačítko, jako u výroben. Částka se píše do
> `input[name=deposit]`.

#### Dva kroky, mezi nimi peníze leží v budově

`startLaundering` jen **odebere** špinavé; čisté přijdou až po sebrání. Kdo vypere
a nesebere, má peníze zamrzlé. Automatika proto **sbírá dřív, než pere** – jinak
by se nevyzvednuté hromadilo a hráč by o tom nevěděl.

#### Praní chvíli běží a mezitím se nedá nic

Během praní vrací server **403 „Banka už nyní pere peníze, počkej, až skončí“** –
na další praní i na sebrání. V okně to přitom **poznat není**: dokud praní běží,
žádný `.laundering-box` tam není a odpočet v sekci taky ne (jediný `timer-down`
v okně patří vylepšení budovy). Stav se tedy pozná až z odpovědi, a proto se
nebere jako chyba: automatika ho přejde mlčky a zkusí to za pět sekund znovu.
Skutečné chyby se hlásí červeně dál.

Záložka **Příjmy** vede praní zvlášť od budov, protože to není příjem, ale směna
se ztrátou: „vypráno“ (odešlo špinavých) proti „sebráno“ (přišlo čistých) a rozdíl
je poplatek hry. Ukazuje i odhad toho, co je vyprané, ale ještě nevyzvednuté.

### Kámen–Nůžky–Papír (#17)

**Vlastní řádek lišty**: zadáš částku, klikneš, **znamení se zvolí náhodně**.
V řádku budov schválně není – šachty, mzda a nevěstinec jsou sbírání hotového,
kdežto tady se **platí** a sázka nejde vzít zpět; v jedné řadě s „vybrat mzdu“
by se to kliklo omylem. Za tlačítkem je počet vypsaných výzev a kolik v nich leží.
Proměřeno naživo (odpovědi serveru, ne odhad):

```
POST /map/building/casino/createSSP  {amount, sign}
  sign ∈ fist | paper | scissors      (hodnoty z data-choice v okně hry)
  200 → {"confirm":"Úspěšně umístěno"}
  422 → {"message":"Minimální číslo může být 100", …}
```

Platí se **špinavými penězi** a sázka se strhne **hned** – ověřeno přes
`/user/minute-refresh`: 102 417 912 → 102 417 812, tedy přesně −100.

Nic se přitom neklikne v okně hry: posílá se rovnou požadavek, protože obsluha
znamení visí na skriptu hry a ve vloženém fragmentu se neváže (vyzkoušeno – klik
na ruku tam neudělá nic). Hláška hry se propíše beze změny, takže „Minimální
číslo může být 100“ uvidíš přesně tak, jak to řekl server.

> **Na úkoly, ne na výdělek.** Z výhry si hra bere 10 %, takže proti náhodnému
> soupeři je to ⅓ × 1,9 + ⅓ × 1 + ⅓ × 0 = **96,7 % vsazeného, tedy −3,3 % na hru**.

#### Bilance se čte ze ZPRÁV hry

Výsledek nepřijde hned – výzva visí, dokud ji někdo nepřijme. Hra o tom ale
napíše do `/notifications/notifications`:

```
Vyhrál jsi 190 ve hře kámen-nůžky-papír
Prohrál jsi 100 ve hře kámen-nůžky-papír
Hra Kámen-Nůžky-Papír skončila remízou. 100 ti bylo vráceno
```

Z toho jde spočítat **přesná** bilance. Výhra je **1,9× sázky** (sázka zpět plus
soupeřova mínus 10 % poplatku), takže ze „Vyhrál jsi 190“ plyne sázka 100 a čistý
zisk 90; u prohry a remízy hlásí hra samotnou sázku. Vše se převádí na dvojici
vsazeno/vráceno, aby šla spočítat návratnost.

Každá zpráva má `data-notification-id`, podle kterého se pozná, že už se
započítala – jinak by se při každém čtení sečetla znovu. Počítá se tak i to, co
se vypsalo **ručně ve hře**, ne jen tlačítkem v liště.

> **Zprávy se dají smazat.** Hra má „Smazat vše“ a starší sama odklízí, takže co
> se nestihne přečíst, je nenávratně pryč. Proto se čtou z tiku lišty průběžně
> (nejvýš jednou za minutu), ne až když se otevře panel.

Původně tu stálo, že se bilance spočítat nedá – to bylo špatně a přišel na to
uživatel odkazem na notifikace. HUD by k tomu opravdu nestačil (do špinavých
peněz zároveň teče nevěstinec), zprávy ano.

### Zločiny ve dvou řádcích

Zločinů je dvacet a v jednom řádku z nich byla přes celou lištu čára, ve které
se špatně hledalo. `crimes.row()` proto vrací **pole dvou řádků** (lišta si ho
rozbalí stejně jako u letadel a lodí):

```
Zločiny:  1  2  4  5  7  9  12  14  17  20
          25  30  34  38  42  46🔒 50🔒 56🔒 61🔒 64🔒   [auto ▾]
```

První řádek nese popisek a levou polovinu, druhý zbytek a volbu automatiky.
Druhý řádek dostane **prázdný popisek téže šířky** (`cmc-gym-label-prazdny`,
`visibility: hidden` plus `::before` s týmž textem), aby tlačítka začínala pod
sebou. Mezi oběma řádky není dělicí čára – patří k sobě.

Tlačítka zločinů jsou menší než jinde v liště (`padding: 2px 5px`, 10 px písmo),
protože jich je nejvíc.

> Lišta tím může mít až **10 řádků** (trénink, letadla, lodě, šachty,
> kámen-nůžky-papír, výrobny + banka, zločiny ×2, kasino, stav) – přesně tolik
> jich `body.cmc-gym-padded` pokrývá odsazením, aby lišta nezakryla obsah hry.

### Ovládání lišty drží pravý horní kout

Hlavní vypínač, minimalizace a zavření mají vlastní obal (`.cmc-gym-ctrl`)
zarovnaný `margin-left: auto` a `align-self: flex-start`, takže sedí v **pravém
horním** koutu lišty – tam, kde je člověk hledá u každého okna. Dřív visely hned
za obsahem, takže s každým přidaným tlačítkem uskakovaly jinam a minimalizace se
hledala očima.

**Lišta má pevnou šířku** `min(1180px, 100vw − 80px)`. Dřív se roztahovala podle
obsahu, takže s každou změnou hlášky („poker: výhra…“, „banka: ukládám…“)
poskočilo ovládání jinam a **nedalo se trefit do pauzy ani do křížku**. Teď drží
šířku bez ohledu na to, co se v ní zrovna píše; delší text se ořízne třemi
tečkami. Ve zmenšeném stavu se šířka pouští (`width: auto`), aby z lišty zbyl
jen úchyt.

Ověřeno naživo na osmiřádkové liště (přes `offsetTop`/`offsetLeft` – u téhle
lišty vrací `getBoundingClientRect()` nuly): **12 px od pravé hrany, 7 px od
horní a 244 px od spodní**, pořadí vypínač → minimalizace → zavření.

### Stav akce a fronta vedle sebe

Spodní řádek lišty má dva sloupce, protože jde o dvě různé informace, které se
nesmí přebíjet:

```
poker: výhra (2×) +20 💎 · 6023× · bilance −5 690 💎   │  Automatika: běží zahrady 3 s · čeká trénink
└─ STAV AKCE: co se stalo naposledy                     └─ FRONTA: co běží teď a co čeká
```

Do **stavu** píší všechny moduly (letadla, šachty, nevěstinec, kasino…), takže
poslední akce přepíše předchozí; chyby se přebarví. **Fronta** naopak ukazuje
přítomnost – kterou jedinou věc automatika právě kliká, jak dlouho už to trvá
a co stojí za ní.

Dřív byl stav nalepený na konci řádku tréninku a fronta měla řádek vlastní; vedle
sebe je nemusíš hledat očima přes celou lištu. Stav dostane zbylou šířku a ořízne
se třemi tečkami, fronta si drží místo vpravo za oddělovačem.

**Řádek je v liště vždycky** – stav akce potřebuje kam psát i tehdy, když
automatika neběží. Skrývá se jen sloupec fronty, jinak by tam pořád svítilo
„klidno“.

### Automatika běží jen v jedné kartě

Rozšíření se načte v **každé** otevřené kartě hry a každá by hrála sama za sebe.
To není jen dvojnásobné tempo – hru drží **server** a rozehrané kolo je jedno pro
celý účet, takže dvě karty si navzájem přebíjejí rozdání:

```
karta A zaplatí ante a nechá rozdat
karta B zaplatí ante a nechá rozdat znovu   → ante karty A propadne
karta A pošle „Vsadit 2×“ podle karet, které viděla
                                            → server to použije na kolo B
```

Výsledkem jsou **propadlé sázky a rozhodnutí podle karet, které v tom kole
vůbec nejsou** – tedy přesně obrázek „strategie přestala fungovat“, protože čísla
v panelu odpovídají tomu, co karta viděla, ne tomu, co hra hrála.

> Tohle nebyl teoretický problém: způsobil jsem ho sám, když jsem si kvůli čtení
> logu otevíral hru ve druhém okně a nechával ji tam běžet. Uživatel to poznal
> jako „od nějaké doby to začalo prohrávat“.

Proto si jedna karta bere **zámek**: v `autoOwner` je `{ id, at }`, vlastník
značku obnovuje v pětisekundovém tiku a po `ZAMEK_TTL` (20 s) bez ozvání ji smí
převzít jiná karta. `queue.run()` v kartě bez zámku neudělá nic, zámek se
kontroluje i **mezi úkoly** (kdyby ho karta ztratila uprostřed fronty) a při
zavření karty se pouští hned (`pagehide`), aby jiná nemusela čekat na vypršení.

Atomické operace `chrome.storage` nemá, takže se po zápisu ještě jednou přečte,
kdo tam zůstal – když se dvě karty potkají, jedna se stáhne.

**Ruční klikání v liště funguje ve všech kartách dál** – to je tvoje rozhodnutí,
ne automatika. V kartě bez zámku je v řádku „Automatika:“ vidět `🔒 běží v jiné
kartě`.

#### Fajfka „hraje tady“ – ruční přebití

Automatické předání umí jen **vypršení**, a to na dva případy nestačí: když chceš
hrát v téhle kartě hned (a ne čekat 20 s, až se druhá odmlčí), a hlavně u sirotka
po reloadu rozšíření, který si zámek nevezme **nikdy** (viz níže).

Fajfka `hraje tady` v řádku „Automatika:“ je proto tvoje rozhodnutí, ne pokus:
zaškrtnutí zapíše `autoOwner` **bez ohledu na to, kdo ho drží**. Druhé kartě se
nic neposílá – na svém dalším tiku si přečte cizí `id`, sama se stáhne a fajfka
se jí odškrtne. Fajfka totiž není samostatné nastavení, ale **zobrazení stavu
zámku**: `syncQueue()` ji při každém tiku srovná podle `mamZamek`, takže se
nemůže rozejít se skutečností.

Odškrtnutí je taky rozhodnutí a **drží**: karta si zámek nevezme, ani když je
volný (`rucne === false`). Tenhle příznak je schválně jen v **paměti karty**, ne
ve storage – ta je společná a přepnula by i ostatní karty, tedy přesně naopak,
než k čemu fajfka je.

#### Zombie karty po reloadu rozšíření

Reload rozšíření v `chrome://extensions` **nezastaví** skripty v už otevřených
kartách – Chrome jim jen odpojí `chrome.*` API. Osiřelý skript dál umí klikat
a posílat požadavky (hraje za skutečné peníze!), ale nemůže nic zapsat do logu
(v panelu je neviditelný) a nemůže se ani sám vypnout, protože vypnutí je zápis
do storage. Zámek ho nezastaví – pamatuje si, že ho měl.

Naživo takhle jedna ponechaná karta hrála celou noc paralelně s tou pravou
a způsobila ztráty ~9 σ pod očekáváním; po jejím zavření se návratnost okamžitě
vrátila na ~108 %. Poznávacím znamením sirotka je zmizelé `chrome.runtime.id`,
a proto ho (`ziju()`) kontroluje každé místo, které umí spustit akci: `queue.run`,
smyčka fronty i získávání zámku. **Po reloadu rozšíření vždy obnov i stránky hry**
– staré karty se teď samy zastaví, ale hrát začne až obnovená.

> **Hláška sirotka stála celý večer diagnostiky.** Osiřelá karta psala do lišty
> `🔒 běží v jiné kartě`, protože `radek()` tenhle text vracel na cokoli, co není
> vlastní zámek. Jenže žádná druhá karta neexistovala – vypadalo to na uváznutý
> zámek ve storage a hledala se příčina tam, zatímco skutečná příčina byla, že
> `zkusZamek()` skončil hned na `ziju()` a se storage vůbec nemluvil. Ven se
> přitom šlo dostat jen obnovením stránky, což z té hlášky nešlo uhodnout.
> Sirotek teď píše `obnov stránku (F5)` a fajfka `hraje tady` je u něj **zamčená**
> – přebít zámek nemůže, nemá kam zapsat. (Vedlejší škoda: vypadalo to, že stojí
> automatika výroben, a hledala se chyba v `vyrobny.js`, kde žádná nebyla.)

### Automatika kliká jednu věc po druhé

Dřív se v pětisekundovém tiku odpálilo všech sedm automatik **bez `await`**, takže
běžely vedle sebe. Každá měla vlastní zámek (sama sebe nepřekřížila), ale napříč
moduly zámek nebyl, a to dělalo tři konkrétní potíže:

| potíž | jak se projevovala |
|---|---|
| **energie** | trénink bere 3 na klik, zahrady 6 na pole, oba čtou totéž číslo z HUD – souběžně počítaly ze stejného stavu, dohromady přestřelily a hra jednomu akci odmítla |
| **překreslení** | `withSuspend` byl jeden vypínač pro všechny: konec akce A ho po 250 ms pustil, i když akce B ještě klikala, a lišta se překreslila uprostřed cizího kliknutí |
| **chyby hry** | chybové okno je jedno pro celou stránku, takže odmítnutí způsobené akcí A si mohl modul B vyhodnotit jako své vlastní |

`src/queue.js` je proto jednoduchý sériový řadič: tik jen **nabídne** všechny
automatiky (`trénink, zločiny, kasino, šachty, mzda, nevěstinec, zahrady`, plus
`doprava` z vlastního časovače) a fronta je pustí za sebou, s **mezerou 300 ms**
– ta není kosmetika, `withSuspend` pouští překreslení 250 ms po skončení akce.

**Fronta nic nespouští.** Je to jen řadič; jestli je vůbec co dělat, rozhoduje
pořád každý modul sám a hlavní vypínač je nad tím. Většina položek skončí tím,
že modul zjistí „není co dělat“, a to je v pořádku.

#### Vypnutá automatika se do fronty nezařazuje

Zařazovalo se **všech dvanáct** a modul se sám ukončil, když byl vypnutý. Vypadá
to nevinně, ale fronta drží mezi každými dvěma položkami **300 ms**, takže:

| zapnuto | položek ve frontě | průchod |
|---|---|---|
| dřív (vše) | 12 | **3,6 s** |
| jedna automatika | 1 | 0,3 s |

Tik chodí každých **5 s**, takže fronta byla prakticky pořád zaneprázdněná –
v liště svítil dlouhý seznam `čeká zločiny, kasino, automat, blackjack, poker, …`
a jediná zapnutá automatika se ke slovu dostala až po těch, které nedělají nic.

Každá položka má proto **předpoklad „je to vůbec zapnuté“** (`autoSet()` modulu,
u zločinů `autoSetting()`, u kuliček `autoShape()`). Musí být levný – jen čtení
nastavení, žádný požadavek do hry ani čtení DOM – protože se vyhodnocuje
dvanáctkrát za každý tik. Nezařadí se ani položka, jejíž **modul se nenačetl**.

Není to duplikace kontroly v modulech: ty si vypnutí hlídají dál, protože na tom
závisí i ruční tlačítka. Tady jde jen o to nezdržovat frontu.

Detaily, které z toho vypadly:

- **Deduplikace podle jména.** Tik nabídne totéž každých 5 s; bez ní by se ve
  frontě hromadily kopie a klikaly by se věci naplánované před minutami.
- **Strop 12 položek** – kdyby se něco drhlo, fronta by narůstala.
- **Hlavní vypínač frontu vyprázdní**, ale běžící akci nechá dojet: přerušit klik
  uprostřed by nechalo hru v rozdělaném stavu.
- **`withSuspend` je počítadlo, ne vypínač** (`suspendDepth`) – a má **pojistku
  90 s**. Akce, která by nikdy nedoběhla (hra neodpoví, promise zůstane viset), by
  s počítadlem zablokovala překreslení lišty navždy. Dřív to shodou okolností
  nevadilo, protože vypínač pustil kdokoli; počítadlo tuhle vadu odhalilo, když
  na ni v testech spadlo kasino.
- **Při globální pauze se do fronty nedává nic.** Každý modul si pauzu hlídá
  i sám, ale to je pozdě: položka už je ve frontě a řádek v liště napíše „teď
  trénink“, takže to vypadá, že automatika jede, i když se nic nedělá. Tik proto
  při pauze frontu vyprázdní a řádek hlásí `⏸ pozastaveno`. Běžící akce dobíhá
  (přerušit klik uprostřed by nechalo hru v rozdělaném stavu), a to se řekne:
  `⏸ pozastaveno · dobíhá zahrady`. Totéž platí pro dopravu, která má vlastní
  časovač.
- **Řádek „Automatika:“ v liště** ukazuje, co právě běží a co čeká
  (`⚙ teď zahrady (4 s) · čeká trénink, kasino`). Obnovuje se **vlastním
  časovačem každých 500 ms**, ne překreslením lišty: fronta se mění po stovkách
  milisekund a `withSuspend` překreslení během akce blokuje – tedy právě tehdy,
  kdy je ten text nejzajímavější. Mění se jen text, takže to observer ignoruje.
  Rostoucí počet sekund je jediné vodítko, že se něco drhne. Když není zapnutá
  žádná automatika, řádek se nekreslí (jinak by lišta rostla o řádek, který pořád
  hlásí „klidno“).
- **Hláška v liště přežije překreslení** (`restoreStatus`, životnost 15 s). Chybové
  okno hry totiž samo spustí překreslení, takže hlášku o tom, co se stalo, mazalo
  přesně to, co ji způsobilo. `autoBurst` si to dosud obcházel ručně.

### Letadla a lodě – další řádky lišty
Letiště (**#60**) i přístav (**#30**) mají prostředky v mřížce a u každého se
klikáním prochází dvě modalová okna. Lišta je dá do jednoho řádku,
**číslo = ID prostředku ve hře**:

> ‹ TRÉNOVAT: **Rychlost** · **Síla** · **Obrana** | **Strážci** · **Bojovníci**
> LETADLA: **L1/99** **L2/99** L3/99 L4/99 L5 🔒 L6 🔒
> LODĚ: **S1/99** **S2/99** S3/56 S4/11 S5 🔒 S6 🔒 ×

Na tlačítku je **číslo prostředku a za lomítkem, kolikrát ho ještě pošleš na
plný náklad** – jinak by se celá flotila (9 letadel + 9 lodí) do lišty nevešla.
Stav nese barva:

| Barva | Stav | Klik udělá |
|---|---|---|
| zeleně | přivezlo peníze | `GET /map/{plane,boat}/{n}/collect` |
| vínově | doma, dá se vypravit | `POST /map/{plane,boat}/{n}/send` |
| oranžový rámeček | vypraví se, ale náklad nebude plný | totéž |
| šedě, vypnuté | je venku (`letí` / `na cestě`) | nic |
| 🔒 vypnuté | ještě není koupené | nic |

#### Kolikrát ho ještě pošleš
Číslo za lomítkem je `zásoba ÷ kapacita` zaokrouhlené dolů, tedy počet
**plných** jízd, které zbývají. Strop je **99**, ať z tlačítka není pětimístný
údaj; přesné číslo je v tooltipu (*„zásoba whisky vystačí na 25 676 plných
jízd“*). `0` znamená, že zásoba nestačí ani na jednu plnou jízdu – jde to
poznat i podle oranžového rámečku.

Počítá se ze **zásoby z popisku** (*„Whisky: 5 165 146 L“*), ne z
`max-{náklad}-amount`. Ta hodnota je totiž sama omezená kapacitou prostředku,
takže by z ní u plné zásoby vždycky vyšla **jedna** jízda. Do rozhodování
o plnosti nákladu jde naopak `min(zásoba, max-{náklad}-amount)` – to je, kolik
hra pošle na jednu jízdu.

Číslo se ukazuje i u prostředku, který je právě venku nebo čeká na sběr – je to
informace o zásobě, ne o tom, kde se prostředek nachází. U letadel bývá `/99`
(whisky je jí obvykle dost), u lodí je to vidět: pervitinu vystačí na desítky
jízd velkou lodí, ale na stovky malou.

Barva není jediná cesta k informaci: **tooltip tlačítka** říká celou věc
(*„Windel, kapacita 302 – vypraví pervitin (plný náklad); zásoba pervitinu
vystačí na 532 plných jízd“*), **legenda** visí na popisku řádku a po akci se
výsledek vypíše v liště
(*„S2 vypraveno – pervitin“*). Vypnuté stavy navíc poznáš i bez barev –
nereagují a mají jiný kurzor.

**Jak se pozná stav.** Ne podle tlačítek – „Odeslat“ / „Vyplout“ je ve fragmentu
**vždy**, i u prostředku, který je venku. Hra nemožnost vypravit značí obalem
`.box-ins.shipSendDisabled` (ověřeno: doma 0×, s nesebranými penězi 1×,
venku 1×). Peníze mají přednost před odesláním – dokud se neseberou, hra
odeslání blokuje, a za pozdní sběr navíc strhává pokutu (ta je v tooltipu).
Tentýž test se dělá ještě raz nad čerstvým fragmentem při kliknutí, aby
zestaralý stav v liště nevypravil něco, co už je venku.

#### Náklad
Handler hry (`.static-inv` v `app.js`) čte `data-id`, přehodí `.selected`
a nastaví `#smuggle-selection input[name=amountOfDrugs]` na
`.capacity-amounts .max-{náklad}-amount`. Opakovaný klik na už vybraný náklad
nic nerozbije (žádné odvybrání – ověřeno klikáním), takže se klikne vždy
a množství dopočítá hra sama.

Vybere se **první náklad, který zaplní celou kapacitu**, jinak ten poslední –
tedy vždy to dražší, pokud ho je dost:

| | Nabídka | Volba | Výchozí volba hry |
|---|---|---|---|
| Letadla | whisky, pivo | **whisky**, jinak **pivo** | whisky |
| Lodě | pervitin, konopí | **pervitin**, jinak **konopí** | konopí |

Zásoba se bere jako `min(zásoba z popisku, max-{náklad}-amount)`, ať to platí bez
ohledu na to, kterou z těch dvou hodnot hra omezuje. Když ani náhradní náklad
kapacitu nezaplní, tlačítko dostane **oranžový rámeček** a tooltip řekne, kolik
se pošle – akce se nezablokuje, jen se to nepředstírá.

#### Prázdná zásoba není náklad

Vybíralo se jen z toho, co je v nabídce – takže když žádný náklad kapacitu
nezaplnil, vzal se prostě **poslední, i s nulou**, a odeslání se zkusilo. Hra ho
odmítla hláškou, že **množství musí být aspoň 1**, a protože to automatika zkouší
každé kolo, psala tu chybu pořád. Naživo to nastalo, když uživatel **prodal
všechno**.

Vybírá se proto jen z nákladů, na kterých doopravdy něco je. Když není nic:

- `pickCargo()` vrátí `null`
- `act()` na „Odeslat“ **vůbec neklikne** a řekne „nemá co vypravit – zásoby jsou
  prázdné“
- automatika ten prostředek **do vypravování ani nezařadí**, takže to nehlásí
  každé kolo znovu
- tlačítko v liště je **vypnuté** a má popisek `L1/–` – samotné „L1“ by vypadalo
  jako kterýkoli jiný stav bez čísla, a přitom je to jediný případ, kdy je
  tlačítko vypnuté, i když je prostředek doma

Prázdná zásoba **není chyba**, jen není co poslat – a tak se to i chová.

**Klik** funguje jako u kasáren – vloží fragment do herního okna, klikne na
skutečné „Sebrat peníze“ / „Odeslat“ a uklidí. Ověřeno v síťovém logu:

| Akce | Výsledek |
|---|---|
| `GET /map/plane/1/collect` | 200, stav `sebrat → odeslat` |
| `POST /map/plane/1/send` | 200, whisky, množství 201 = kapacita, stav `odeslat → letí` |
| `POST /map/boat/2/send` | 200, pervitin, množství 302 = kapacita, stav `vyplout → na cestě` |
| letadlo / loď venku | odmítnuto bez jediného kliknutí |

Seznam se čte z fragmentu budovy (nekoupené + potřebná úroveň) a stav každého
prostředku z `/map/plane/{n}` / `/map/boat/{n}`; vlastněné jsou
`1..(nejnižší buyPlane/buyShip − 1)`, protože budova v mřížce ukazuje jen ty,
které právě někde stojí. Lodě se kupují přes `shipyard/buyShip/{n}`, ale stav
mají na `/map/boat/{n}` – ne `/map/ship/{n}` (to je 404). Stav se drží
**2 minuty**, po akci se přečte jen dotyčný prostředek.

#### Kdy se zjišťuje, že něco přiletělo
Ne na pevný interval. Fragment budovy má u každého odeslaného prostředku kartu
`.box-ins.acc-ins` a v ní **strojově čitelný odpočet** `.timer-down[time-left-secs="158"]`;
kdo dorazil, má místo odpočtu „Vybrat“ s `data-modal="/map/boat/2"`. Takže:

1. jeden GET na budovu → kdo je venku, za jak dlouho se vrátí, kdo už dorazil
2. další kontrola se naplánuje na **nejbližší přílet + 3 s** (v mezích 20 s – 10 min)
3. kdo dorazil, se dočte zvlášť (1 GET) → tlačítko zezelená a v tooltipu je částka

Když **nikdo není venku, nekontroluje se nic** – prostředek doma se sám z místa
nehne, ten stav změníš jen ty. Na skryté kartě se čekání přeskočí a po návratu
se zkontroluje hned.

Prakticky to znamená **2 požadavky na kolo** (letiště + přístav) a zelené
tlačítko se objeví do několika sekund od příletu, místo aby se čekalo na
prošlou dvouminutovou platnost. Odpočet je i v tooltipu (*„je ve vzduchu,
vrátí se za 2:38“*) – formátuje se po sekundách, protože `fmt.dur` zaokrouhluje
na minuty a u 158 s by tvrdil „3 min“.

### Diamantové šachty
Šachta se střídavě pouští do práce a pak se z ní sbírají diamanty. Lišta z toho
udělá jedno tlačítko na šachtu, které dělá to, co je právě na řadě:

> ŠACHTY: **D30** **D31** D32 **D33** **D34** ☑auto │ **Mzda**

Na tlačítku je **jen číslo** – zbývající čas je v tooltipu, aby se řádek při
každém překreslení neposouval. Zeleně = diamanty k sebrání, vínově = dá se pustit
do práce, šedě = pracuje. **Vylepšení šachty v liště schválně není.**

#### Kolik diamantů za jaký čas
Hra sazbu nikde neuvádí, ale dá se dopočítat z toho, co je v atributech.
Délka cyklu je `data-timedone − data-timesent` (u mě **10 800 s = 3 h**):

| | Za cyklus | Za hodinu | Za den |
|---|---:|---:|---:|
| jedna šachta (úroveň 22) | 38 💎 | 12,7 💎 | 304 💎 |
| **5 šachet** | **190 💎** | **63,3 💎** | **1 520 💎** |

Je to v tooltipu u každého tlačítka i souhrnně na popisku řádku. Cyklus se bere
z kterékoli běžící šachty – nespuštěná `.working` nemá, takže by o sazbě sama
nic neřekla.

#### Mzda z úřadu práce (#9)
Za svislítkem je tlačítko **Mzda** – vybere nasbíranou výplatu
(`.getSalary` → `/map/building/mafiahouse/collectSalary`). Mzda **průběžně roste**
(u mě +26 Kč za minutu), takže se nedá propásnout jako sběr z lodí; dá se ale
zapomenout, protože nic nebliká. V tooltipu je zaměstnání, částka, diamanty i **přibližná sazba**
(*„Mezinárodní prodejce opia – vyber mzdu 13 201 Kč + 18 💎 (pracuješ 3 hodiny) –
přibližně 4 400 Kč/h + 6 💎/h“*). Sazba je odhad: hra ji neuvádí a hodiny jsou
v textu zaokrouhlené na celé. Koruny přitékají plynule, diamanty podle sledování
skokem po hodinách – proto „přibližně“.

**Přihlašování na pozice v liště není** (`.getWork` → `joinWork/{n}`). To je
rozhodnutí, ne rutina – omylem trefené tlačítko by ti změnilo práci.

> Podobu úřadu **po** výběru mzdy jsem neviděl, takže nevím, jestli zaměstnání
> pokračuje samo, nebo se musí znovu přihlásit. Když `.getSalary` chybí, tlačítko
> je vypnuté a tooltip to přiznává, místo aby si stav domýšlel.

#### Nevěstinec (#19)
Za dalším svislítkem je **Nevěstinec**. Cyklus má **tři stavy** a tlačítko dělá
vždy to, co je právě na řadě – stejně jako u šachet:

| stav | co je v okně | tlačítko |
|---|---|---|
| doma | `.startBusiness` → `/brothel/startWork` „Poslat prostitutky vydělávat“ | vínově, pošle do práce |
| pracují | `.working` s odpočtem (5 h, `data-time` ≈ 17 998) | šedě, v tooltipu čas |
| hotovo | `.collectMoney` → `/brothel/finishWork` „Vybrat peníze“ | zeleně, vybere |

> **Původně jsem počítal jen se dvěma stavy.** Stav „doma“ jsem neviděl a usoudil,
> že ho vidět nepotřebuju – načež nevěstinec zůstal čekat na poslání, tlačítko
> svítilo vypnuté a automatika nedělala nic. Tři stavy jsou ověřené naživo.

V tooltipu je počet prostitutek, výdělek na jednu (5–10 Kč) a výplata: ve stavu
„doma“ ji hra uvádí přímo (*„Vyděláš od 191 210Kč do 382 420Kč“*), jinak se
odhaduje jako `počet × průměr`. **Nábor ani prodej v liště nejsou**: stojí peníze
a nejde o rutinu.

**Tady se vybírá hned, na rozdíl od mzdy.** Hra varuje: *„při zpoždění 10 min se
odečte 2 %“*. U mzdy se čekáním na hranici hodiny nic neztrácí, tady ano – takže
se bere, jak to jde.

Automatika se proto **neplánuje na pevný interval, ale na konec cyklu**: z odpočtu
se spočítá, kdy to bude, a zkusí se to tři sekundy po tom. V jednom kole zvládne
**sebrat a hned poslat zpátky** – jinak by nevěstinec po sběru stál nečinně až do
dalšího kola. Tu samou akci ale nikdy neudělá dvakrát za sebou: hra chvíli po
sběru pořád hlásí „Vybrat peníze“, a bez té podmínky by se kliklo dvakrát. Stojí to **jeden
požadavek za cyklus** místo desítek, a je na to test (druhé zavolání během cyklu
fragment znovu nečte).

#### Zahrady (20 polí, sloty 35–54)
Za posledním svislítkem jsou dvě tlačítka: **🌾 15** (sklidit) a **🌱 3** (zasadit).
Dvě, ne dvacet – pole jsou vzájemně nerozlišitelná (každé dá 300 kg zeleniny za
2,5 h), takže jediné, co se u nich rozhoduje, je *kolik*, a to určuje energie.

**Pole jsou jediná věc ve hře bez modalu.** `/map/farm/show/35` vrací 404; celý
stav nesou atributy slotu přímo v mapě a klikat se musí na SVG plochu nad ním:

```html
<div slot="35" class="farm-slot slot-35" data-tooltip="Sklidit" time-left="0"
     data-harvest-src=… data-growing-src=… data-empty-src=…
     data-harvest-action="/map/farm/harvest/35"
     data-plant-action="/map/farm/plant/35"><img …></div>
<svg><path data-sl="35" type="farm" d="…"></path></svg>
```

Herní handler je `$(document).on('click', '[type=farm]')`, takže **klik na
`div.farm-slot` neudělá nic** – zkusil jsem to a hra ani neposlala požadavek.
A protože `path` není `HTMLElement`, nemá metodu `.click()`; posílá se
`MouseEvent`. Stav se pozná z **obrázku** (`data-harvest-src` / `data-growing-src`
/ `data-empty-src`), ne z českého tooltipu – ten je jen záložní cesta.

**Energie je tady to hlavní omezení.** Ověřeno naživo s pozastavenou automatikou
(jinak měření kazí trénink):

| akce | energie | výsledek |
|---|---|---|
| sklidit | −3 | „Sklidils a získal jsi 300 kg zeleniny“ |
| zasadit | −3 | roste 8 999 s (2,5 h), pak 300 kg |

**Sklizeň vždy zasadí pole zpátky**, takže jedna položka dávky je celé
sklidit + zasadit = **6 energie** a žádné pole nezůstane ležet prázdné. Do pole
se nezačne, když na obě poloviny nestačí – jinak by dávka pole sklidila a nechala
ho stát. Všech 20 polí je tedy ~120 energie, víc než kolik jde mít najednou
(maximum 59); tlačítko dopředu v tooltipu píše „Sklidit a hned zasadit: 9 z 15
polí“. Energie se odečítá i lokálně, protože hra si HUD přepisuje až
s `user/minute-refresh`, tedy po minutách – bez toho by dávka jela podle
zastaralého čísla a zbytek by hra jen odmítala.

**Limit osetých zahrad.** Slotů je 20, ale hra dovolí osít jen tolik, kolik
pustí úroveň, a nad limitem osetí odmítne s HTTP 403:

```json
{"errors":"Na své úrovni můžeš osít maximálně 17 zahrad. Zvyš na 54 úroveň
           a budeš moci pěstovat více zeleniny"}
```

Osetá je zahrada rostoucí i vzrostlá, prázdné se nepočítají. Limit v DOM nikde
není, takže se bere **z té hlášky** a uloží (`farmLimit`); do prvního odmítnutí
se sází opatrně po jednom. Prázdná pole nad limitem se pak na tlačítku vůbec
nenabízejí (`🌱 0` s vysvětlením v tooltipu), aby se neklikalo do polí, na
kterých hra jen vyhodí chybové okno. **Sklizeň se zasazením zpátky je na limitu
nezávislá** – místo uvolní a hned ho zaplní. Po zvýšení úrovně se limit
zapomene tlačítkem *zjistit znovu* v nastavení.

**Automatika** nejdřív dozasadí prázdná pole, pokud je pod limitem místo (3
energie), potom obsluhuje vzrostlá (6 energie). Prázdná mají přednost, protože
jsou levnější a rozjezd trvá 2,5 h.

**Rezerva proti tréninku** (`farmReservePct`, výchozí 25 %): automatický trénink
umí energii sníst do svého dna, a pak by na pole nikdy nic nezbylo. Dokud mají
pole co dělat, zvedne se dno tréninku na tuhle hranici – `gym.autoBurst` si ji
bere z `farm.energyReserve()` a napíše to do lišty. Když je automatika zahrad
vypnutá nebo pole nic nepotřebují, rezerva je nula a trénink nic neomezuje.

> Tři pole „nešla zasadit“. První pokus prošel (tam chyběla jen energie), takže
> jsem usoudil, že blokace neexistuje – špatně. Čtvrté pole už narazilo na limit
> osetých zahrad a hra to řekla přesně. Odtud se ten limit teď i čte.

#### Jak se dělá svislítko a jak přidat další budovu
Každá budova je vlastní `.cmc-gym-group` a druhá a další skupina v řadě dostává
z CSS levý rámeček – žádný prvek navíc. Přidat další budovu se stejným cyklem
„počkej a vyber“ je jeden řádek v `PRIDAVKY` (`src/mines.js`), pokud modul nabídne
`button()` a případně `autoBox()`.

Zaškrtávátko **auto** hotové šachty samo sebere a nespuštěné pustí do práce –
nejdřív se sbírá, pak spouští, takže jedno kolo zvládne celý cyklus. Z celé lišty
je to nejmíň sporná automatika: cyklus je pevný (3 h), nic se nevybírá a nedá se
tím nic prohrát, jen se nezapomene. Platí hlavní vypínač **⏸** i zámek ve vězení.

| Co | Kde |
|---|---|
| vlastněná šachta | `/map/mine/show/{n}` (nevlastněná vrací **404**) |
| sebrat | `.collectMineDiamonds` → `/map/mine/collect/{n}` |
| pustit do práce | `.startMine` → `/map/mine/start/{n}` |

Čísla šachet se berou **z mapy** (`[action*="/map/mine/show/"]`), což nestojí
žádný požadavek, a drží se v `chrome.storage` pro stránky, kde mapa není.
`/map/mine/build/{n}` k rozpoznání vlastnictví **nejde použít** – dialog
„Postav důl“ ukazuje i pro čísla, která ti nepatří.

**Nová šachta se přidá sama.** Seznam není pevný rozsah, takže jak se na mapě
`build/29` změní na `show/29`, objeví se D29 v liště bez zásahu do kódu –
seřazená podle čísla, s vlastní úrovní a výtěžkem. Na to je test. Kdyby se to
někdy zaseklo na uloženém seznamu (stránka bez mapy), `NS.mines.forget()` ho
zahodí a přečte znovu.

#### Odpočet není v `time-left-secs`
Ten je ve fragmentu šachty **vždycky 0**. Skutečný čas je na `.working`:

| Atribut | Význam |
|---|---|
| `data-time` | zbývající sekundy, **může být negativní** (`-3303` = hotovo před 55 min) |
| `data-timedone` | čas dokončení |
| `data-timenow` | čas serveru |

Kdyby se stav čekal z `time-left-secs`, jevila by se **každá** šachta jako hotová –
včetně těch, které ještě pracují. Na to je test se všemi třemi stavy.

### Kasino „Šťastný tip“ (#15)
Volitelný řádek v liště (**výchozí vypnuto** – na rozdíl od ostatních tady klik
utrácí peníze):

> KASINO: [ 10 ] ☑×1,5 auto[🔫 pistole ▾] **🔫** **❤️** **🔥**
> max 6× · 208 Kč · rezerva 5 mil. · 2× prohra → 23 Kč · 12× · −340 Kč

Budova má dvě hry se stejnou mechanikou: `casino/playBalls` za **špinavé peníze**
(pistole / srdce / oheň) a `casino/playFigures` za **diamanty** (hřebíček / duha /
zlato). V liště je jen ta za špinavé peníze – diamanty jsou drahá valuta a omylem
kliknutá sázka by bolela.

**Nevydělává to a je to spočítané, ne odhad.** Tři tvary, výplata trojnásobek,
žádné poplatky:

```
1/3 × (+2× sázka)  +  2/3 × (−1× sázka)  =  0
```

Očekávaná hodnota je **přesně nula** – kasino tu nemá výhodu, ale ani ty. Proto tu
**není žádná automatika**: jeden tvůj klik = jedna sázka. Automat by jen roztáčel
majetek dokola, dokud by ho rozptyl neodkrojil.

#### Jak se pozná výhra
Hra odpoví JSONem `{"confirm":"Gratulujeme! Uhodl jsi!…","winNumber":2}`, ale ten
čte **herní** javascript – rozšíření je v izolovaném světě a k odpovědi se
nedostane. Výsledek se proto čte z DOM, kam ho hra po animaci (~5 s) vykreslí:

| Co | Kde |
|---|---|
| vítězný tvar | `.lg-ball.winner` (třídu doplní hra) |
| tvůj tip | `.choose-ball.selected` (`data-ball` 1–3) |

**Z HUD to určovat nelze.** Při testovací sázce za 10 Kč, kterou jsem *prohrál*,
špinavé peníze v HUD **narostly o 827 Kč** – mezitím přiteklo něco jiného.
Detekce podle rozdílu v HUD by hlásila výhru. Bilance se proto počítá z výsledku
(výhra = +2×, prohra = −1×).

#### Dvě fáze navyšování
Násobek se může po zadaném počtu **sázek** přepnout na druhý (`casinoPhase1`,
`casinoStep2`; 0 = jedna fáze na celou sérii).

> ⚠ **Počítají se sázky, ne navýšení.** „První fáze platí pro prvních 6 sázek“
> znamená **pět** navýšení, protože první sázka je vždycky základ. Z toho plyne,
> že **`casinoPhase1 = 1` znamená žádnou první fázi** – celá série pak jede druhým
> násobkem. Kdo chce „první kolo ×2, pak ×1,5“, zadá `×2 · 2 sázky · ×1,5`.
>
> Kvůli téhle pasti je v popupu **živý náhled**: ukáže prvních sedm sázek,
> potřebnou částku, zisk uzavřené série a varuje jak u `casinoPhase1 = 1`, tak
> u násobku pod 1,5. Bez něj se to nastavuje naslepo – rozdíl mezi
> `×1,5 · 1 sázka · ×2` a `×2 · 2 sázky · ×1,5` je **21,4 mld. vs. 101,7 mil.** Logika je jasná: **násobek nad 1,5
zisk série navyšuje**, přesně 1,5 ho jen drží. Takže *délka první fáze určuje
výdělek* a přechod na 1,5 pak drží expozici co nejmenší.

Příklad z ostrého nastavení – vklad 5 100 Kč, prvních **6 kol ×2**, dál **×1,5**:

| | Jen ×1,5 | ×2 (6 kol) pak ×1,5 |
|---|---:|---:|
| Zisk uzavřené série | +10 200 Kč | **+168 300 Kč** |
| 26. sázka | 128,8 mil. | 542,7 mil. |
| Expozice na 26 kol | 386,3 mil. | **1,63 mld.** |
| Riziko : výnos | 1 : 9 400 | 1 : 1 900 |

Zisk roste jen během první fáze a od jejího konce je **konstantní** – u ×1,5 se
totiž série jen udržuje. Cena za 16,5× vyšší zisk je 4,2× vyšší expozice, poměr
riziko/výnos se tedy pětkrát zlepší. Na nulové očekávané hodnotě to ale nic nemění.

#### Navyšování po prohře (martingale)
Vklad se zadává **volným polem** přímo v liště. Po každé prohře se vynásobí
(`casinoStep`, výchozí **1,5**), po výhře se vrátí na základ. Vedle pole je
**přepínač `×1,5`** (`casinoProgress`) – s vypnutým se sází pořád základ; série se
dál eviduje, ale na výši sázky nemá vliv a řádek to pak přizná
(*„2× prohra“* bez šipky, tooltip říká, že tahle sázka sérii nedohoní).

**×1,5 není zvolené od oka, je to matematická hranice.** Výplata je trojnásobek
při šanci 1/3, takže aby výhra pokryla celou sérii, musí platit
`2 × nová sázka > dosud vsazeno`. Z `b = základ × f^k` z toho vychází `f > 1,5`:

| Násobek | Pokryje série ztrátu? | 10. sázka | Expozice po 10 prohrách |
|---|---|---:|---:|
| ×1,3 | **ne, od 4. kroku už v minusu** | 13,8× | 56× |
| ×1,4 | **ne, od 5. kroku** | 28,9× | 99× |
| **×1,5** | ano, vždy **+2× základ** | 57,7× | 171× |
| ×2,0 | ano, ale expozice roste zbytečně | 1 024× | 2 047× |

Při ×1,5 je čistý zisk uzavřené série **+2× základní vklad, ať výhra přijde
v kterémkoli kroku** – proto je to výchozí hodnota a proto je pod 1,5 v nastavení
varování.

**Co to nemění: očekávaná hodnota zůstává nula.** Navyšování jen přehází
rozdělení na „hodně malých výher a občas velká ztráta“. Šance na prohru je 2/3,
takže série jsou běžné:

| Proher v řadě | Pravděpodobnost |
|---|---|
| 3× | 29,6 % |
| 6× | 8,8 % (1 z 11) |
| 10× | 1,7 % (1 z 58) |
| 15× | 0,23 % (1 z 438) |

#### Strop na počet pokusů a co to bude stát
`casinoMaxSteps` (výchozí **6**) je to, co drží částku na uzdě – bez něj sázka
roste bez konce: při ×1,5 je 30. sázka **128 tisíc** základů a 50. už
**425 milionů**. Po vyčerpání pokusů se ztráta realizuje a jde se zas od základu
(záznam v logu má `abandoned: true` a celou ztrátu série).

V liště je vpravo vidět **`max 6× · 209 Kč`** – kolik celá série spolkne, když
dojde do stropu. Ukazuje se **i před první sázkou**, což je celý smysl: expozici
je potřeba znát dřív, než do ní člověk vleze.

Nepočítá se ze vzorce geometrické řady, ale **krok za krokem** – každá sázka se
zaokrouhluje na celé peníze a u dvou fází by uzavřený vzorec nesouhlasil vůbec.
U jedné fáze je rozdíl 1 Kč (vzorec dá 208, realita 209), u dvou fází řádový.

Při ×1,5 a základu 10 Kč:

| Pokusů | Poslední sázka | Celkem potřeba | Prohraje se všechno |
|---:|---:|---:|---:|
| 4 | 34 Kč | 82 Kč | 19,8 % |
| **6** | **76 Kč** | **209 Kč** | **8,8 %** |
| 10 | 384 Kč | 1 134 Kč | 1,7 % |
| 15 | 2 919 Kč | 8 738 Kč | 0,23 % |

`casinoMax` je navíc strop na **jednu** sázku (0 = bez stropu). Zastropovaná série
už ztrátu nedohoní, a řádek to proto oranžově hlásí.

Stav série je v liště vidět (`2× prohra → 225 Kč`) a v tooltipu je, co výhra touhle
sázkou udělá. Rozepsané číslo ve vkladu přerender nesmaže – `selectOpen()` hlídá
fokus v `SELECT` i `INPUT` uvnitř lišty.

#### Automatické sázení
Select `auto` v řádku (`casinoAuto`) vybere tvar a sází se **bez tvého kliknutí**,
jedna sázka na tik (~5 s), s navyšováním a stropy podle nastavení. Platí hlavní
vypínač **⏸** i zámek ve **vězení**.

Navíc má jednu pojistku, kterou ostatní automatiky nemají: **po vyčerpání pokusů
se sama vypne.** Očekávaná hodnota je nula, takže tu není co optimalizovat – kdyby
jela dál, jen by opakovala přesně tu ztrátu, proti které je strop pokusů
postavený.

**Tohle je nejčastější důvod, proč se select „sám“ přepne na vypnuto.** Při
6 pokusech se série vzdá v **8,8 %** případů, tedy asi každá jedenáctá – při
nepřetržitém sázení se to tedy stane po pár minutách. Kdo chce mlít dál,
zapne `casinoAutoContinue` a automatika po vzdané série pokračuje od základu
(počet vzdaných sérií se vede v `casinoLog.busts` a je v tooltipu).

**Přechodná selhání automatiku nevypínají.** Když hra neodpoví, chybí herní okno
nebo se nestihne animace, počítá se to jako zaškobrtnutí a zkusí se to znovu;
vypne se až po **třech neúspěších za sebou** a první úspěšná sázka počítadlo
nuluje. Dřív stačilo jedno zaškobrtnutí a celý běh skončil.

#### Rezerva špinavých peněz
`casinoReserve` je částka, pod kterou sázka **nesmí** jít. Bez ní může martingale
v nejhorší chvíli vysát účet do nuly. Špinavé peníze se čtou z HUD
(`renew-dirty_money`), takže se hlídá skutečný zůstatek.

Když by sázka rezervu porušila, **ruční tlačítka se vypnou** (tooltip řekne, kolik
chybí) a **automatika se zastaví a čeká** – nevypíná se, protože špinavé peníze
mohou přitéct z výroby nebo zločinů, a pak se pokračuje. V liště je vidět
`rezerva 5 mil.`, oranžově, když právě blokuje.

#### Logování
`casinoLog` vede **kolik jsi vložil** (`staked`), **kolik ti hra vrátila**
(`won`), bilanci (`net = won − staked`), počet sázek a uhodnutí, rozpad po
tvarech, posledních 60 sázek, počet vzdaných sérií (`busts`) a **nejvíc
nepovedených pokusů v řadě** (`maxLossRun`) i s pravděpodobností té série.

`maxLossRun` se vede **zvlášť od `streak`**, a to je podstatné: `streak` se nuluje
i vzdáním série (vyčerpáním pokusů), takže jeho rekord by nikdy nepřelezl strop
pokusů a neřekl by nic. `lossRun` nuluje jedině **výhra**, takže rekord je
skutečné „kolikrát to za sebou nepadlo“ – klidně 9, i když je strop 3. V liště je průběžně `12× · −340 Kč`, podrobně je
to v záložce **Historie** v sekci *Kasino* – včetně srovnání skutečné úspěšnosti
s teoretickými 33,3 % a CSV exportu po jednotlivých sázkách.

Je to hlavně proto, aby se na vlastních datech dalo ověřit, že hra s nulovým EV
opravdu nevydělává – ne aby se hledal „šťastný tvar“.

### Automaty (#18) – měření, jak je hra nevýhodná

Budova 18 je druhé kasino: tři válce, sázka ve špinavých penězích, „Točit“.
Ovládá se **stejným selectem `auto`** jako kuličky (volba 🎰 automat (#18)) –
dva selecty na totéž by nikomu nepomohly – ale je to **jiná hra**:

```
POST /map/building/casino/slotsMoney   tělo `amount=10`   → {"win":false}
```

| | kuličky (#15) | automat (#18) |
|---|---|---|
| výplata | vždy 3× sázka | **libovolná část** – naživo přišlo „Vyhrál jsi 4“ a „5“ při sázce 10 |
| maximum | 3× | ×6 (`input[name="price"]` = 6, v okně „Maximální výhra“) |
| navyšování po prohře | má smysl | **nepoužívá se** |

**Proč se tu nenavyšuje:** martingale stojí na tom, že jedna výhra pokryje
všechny předchozí sázky. U částečných výplat to neplatí – výhra menší než sázka
sérii neuzavře, jen zpomalí. Sází se proto vždy základní částka.

**Jak se pozná výsledek.** Rozšíření je v izolovaném světě, takže odpověď hry
(`{"win":…}`) přečíst nejde. Hra ale píše výhru do `.won-text` a dělá to i ve
fragmentu vloženém mimo obrazovku (ověřeno). Prázdný `.won-text` = prohra. Jako
druhá kontrola se bere **rozdíl špinavých peněz v HUD**, a když si obojí
odporuje, **platí HUD** – měření by jinak lhalo právě v tom, co má měřit. Rozpor
se zapíše a je vidět v tooltipu řádku.

Sázka i rezerva špinavých peněz se berou z nastavení kasina; je to stejná
peněženka, tak ať se to nezadává dvakrát.

#### Záložka Automat

Vloženo / Vyhráno / Celkem / **Návratnost** – kolik z každé vložené koruny se
vrátilo. U férové hry by dlouhodobě sedělo na 100 %, co je pod tím, je výhoda
domu. Vedle je vždy **počet zatočení**, protože na malých počtech je to číslo
šum: při ověřování vyšla z osmi zatočení návratnost 11 % (80 Kč dovnitř, 9 Kč
zpátky), a to o hře neříká nic. Pod 100 zatočení to tabulka nahlas přiznává.

Dál: průměrná a nejvyšší výhra, nejdelší série bez výhry, tabulka posledních
50 zatočení a export CSV. Zapisuje se jen to, co proběhne přes lištu – ruční
zatočení v herním okně rozšíření nevidí a tabulka to říká.

### Blackjack (#18) – hraný základní strategií

V selectu `auto` je 🃏 **blackjack (#18)** a pak to jede samo, kolo za kolem.
Jediný rozdíl proti ostatním hrám: **sázka je v diamantech**, takže má vlastní
pole (`bjStake`) i vlastní rezervu (`bjReserve`) – míchat diamanty a koruny do
jednoho čísla by znamenalo, že „500“ znamená pokaždé něco jiného. Pole v liště
se v tomhle režimu samo přepne na diamanty a je odlišené barvou.

**Změřená pravidla** (37 kol naživo, odečteno z `win_multiplier`):

| výsledek | násobek | ze 10 💎 |
|---|---|---|
| Blackjack | 2,5× (3:2) | 25 |
| Výhra | 2× (1:1) | 20 |
| Remíza | 1× (push) | 10 |
| Prohra | 0 | nic |

Dealer **stojí na 17, a to i na měkké** (`6+A = 17` a `4+2+A = 17` – v obou
případech nedobral, ověřeno na 48 dealerových rukou). Nikdy nezůstal pod 17.
Stání na měkké sedmnáctce je pro hráče příznivější varianta a tabulka strategie
je pro ni napsaná.

#### Strategie

`rozhodni(score, soft, dealerova karta)` je tabulka pro **hit/stand-only**
variantu, ne opsaná tabulka z běžného blackjacku – ta počítá s double, který
tady není:

| ruka | rozhodnutí |
|---|---|
| tvrdá 17+ | stát |
| tvrdá 13–16 | stát proti 2–6, brát proti 7–A |
| tvrdá 12 | stát proti 4–6, brát proti 2, 3 a 7–A |
| tvrdá 11 a méně | brát (nelze přebrat) |
| měkká 19+ | stát |
| měkká 18 | stát proti 2–8, brát proti 9, 10, A |
| měkká 17 a méně | brát |

**Součet se bere ze hry** (`#blackjack_player-score`), ne z vlastního počítání –
stačilo by se splést v esech a strategie by rozhodovala podle nesmyslu. Jestli je
ruka měkká, se pozná porovnáním: skóre o 10 vyšší než součet se všemi esy za 1.
Naivní „sečti esa po 11 a porovnej“ je špatně a spadlo to na tom v testech:
**A+A je měkká dvanáctka**, ne dvaadvacítka.

#### Sedm pastí, na které to naživo spadlo

Automatika hlásila chybu „u tlačítka“ a příčina byla jinde – pokaždé. Všechny
jsou ověřené na skutečné hře a mají svůj test:

**1. Fragment se musí oživit.** Blackjack si drží stav v proměnných hlavního
světa a inicializuje je **inline skript uvnitř fragmentu**:

```js
window.blackjack_currentBet = 0; window.blackjack_isBusy = false;
window.blackjackUpdateUI();
```

`innerHTML` skripty **nespouští** a rozšíření je v izolovaném světě, takže do
těch proměnných nedosáhne. Bez nich klik na žeton neudělá nic, sázka zůstane 0
a „HRÁT“ podrží atribut `disabled` – a na `disabled` tlačítko prohlížeč click
vůbec nevyvolá. Odtud ta hláška o tlačítku. Skripty se proto po vložení znovu
vytvoří (`replaceWith` nového `<script>`), čímž je prohlížeč spustí. Ověřeno:
bez oživení sázka 0, po oživení se žetony sčítají (10 → 60) a tlačítko se pustí.

#### Nominály žetonů se čtou z okna, ne z tabulky v kódu

Sázka i ante se **skládají klikáním na žetony** – v okně není žádné číselné pole,
takže sázka musí být složitelná z nominálů. Ty byly v kódu natvrdo a **tři ze
šesti byly špatně**:

| třída | hra | bylo v kódu |
|---|---|---|
| `*_chip-10x` | 1 000 | 500 |
| `*_chip-50x` | 5 000 | 1 000 |
| `*_chip-100x` | 9 000 | 2 000 |

Názvy tříd k tomu vybízejí („10x“ vypadá jako desetinásobek nejmenšího žetonu),
ale hodnotu si hra píše sama do `data-val` (poker) nebo do textu žetonu
(blackjack, `data-val` nemá).

Důsledek byl vážný: sázka **2 000 se složila jedním kliknutím na `-100x`**, takže
hra vzala **9 000**, kdežto modul si zapsal 2 000. A protože se ze zapsané sázky
odvozuje i výhra, byl log vnitřně konzistentní – **návratnost v panelu vycházela
normálně, zatímco diamanty ubývaly čtyřapůlkrát rychleji**. Rozdíl nebyl poznat
odnikud než z reálného stavu diamantů. Při 3 000 by to bylo 14 000.

Dvě opravy, obě potřebné:

1. **Hodnoty se čtou z okna** – hodnotu určuje hra, ne odhad, takže se rozejít
   nemůžou.
2. **Po naskládání se porovná, co eviduje hra.** Nesedí-li to na korunu, sázka se
   zruší a **kolo se nehraje**. Dřív se hlídala jen nula, což tenhle případ
   propustilo: 9 000 ≠ 0, takže „kontrola“ prošla.

Ante 10 a 20 jsou složené jen z desetikorunového žetonu, takže **měření při
malých sázkách zasažená nejsou**. Zasažené bylo jen ante ≥ 500.

Proto má pole v liště `step=10`: **12 hra složit neumí**, nejmenší žeton je 10.

**2. Součet se z okna přečíst nedá spolehlivě, tak se počítá z karet.** Hra
kartu dokreslí hned, ale `#blackjack_player-score` přepíše až po animaci – a
někdy vůbec: naživo byl ve **dvou kolech z pěti prázdný** a `toNum('')` z toho
udělala **nulu**, kterou strategie vzala jako platný součet a dobrala na
sedmnáctce (7♥ 10♥ = 17 → „ber" → 23). Karty v okně jsou proti tomu fakt, takže
se sčítají vlastními silami (esa 11 → 1) a číslo ze hry slouží jen ke kontrole;
rozpor se hlásí do logu. Bez smysluplného součtu se **nerozhoduje vůbec**.

**3. Po dobrání se součet změnit nemusí.** První verze čekala, „až se součet
změní“ – a to je špatně: **A+2 je měkkých 13 a po desítce je to 1+2+10 = zase
13**, protože eso spadne z jedenáctky na jedničku. Naživo na tom zasekla dvě kola
z pěti (16 s čekání a chyba). Čeká se proto na **novou kartu**, ne na jiné číslo.

**4. „Nová hra“ titulek nemaže.** `blackjack_resetBoard()` okno s výsledkem jen
schová (`fadeOut`), text v `#blackjack_msg-title` zůstane v DOM. Detekce konce
podle titulku proto po prvním kole platila navždy a druhé kolo se zaseklo. Konec
je teď „titulek je tam **a** okno není schované“, a po „Nové hře“ se čeká na
**sázkovou fázi**, ne na zmizení textu.

**5. Složené selektory s ID padají na cizí okno.** `#blackjack .chip` i
`#blackjack_player-cards .blackjack_card` se vyhodnocují proti **celému
dokumentu**, takže když je budova 18 otevřená i v herním okně, ID padne na tu
druhou kopii a žetony ani karty se v našem okně nenajdou. Uvnitř vloženého okna
se proto hledá buď samotná třída, nebo nejdřív kontejner a karty až v něm.

**6. „Nová hra“ po výhře občas nepřepne fázi.** Klik proběhl (log to potvrdil),
ale okno v sázkové fázi neskončilo – u prohry se to nestávalo, rozdíl je, že při
výhře hra pouští `coinShower()`. Příčinu nemám potvrzenou, takže se to zkouší
**dvakrát** a druhý pokus předem uvolní zaseknutý `blackjack_isBusy`
(úkol `bj-unlock` pro hlavní svět). Log ukáže oba pokusy.

**7. Výsledek z HUD se odhadovat nedá.** Když se nepřečetl titulek, dopočítával
se výsledek z rozdílu diamantů – ale tam mezitím přitékají šachty, mzda
a nevěstinec, takže u kola se sázkou 10 vyšlo „neznámý **+15 💎**“. HUD je teď
jen vodítko do logu; kolo bez přečteného výsledku se přizná jako **neurčité**
a do vsazeno/vráceno nejde, aby návratnost nelhala (v rozpisu je řádka
„Neurčitých“).

> Zbývá jedno riziko, které z DOM vyřešit nejde: hru drží server, takže když se
> kolo nedohraje (chyba, zavřená karta), rozšíření o tom z okna nic nepozná.
> Sázka je v tu chvíli už stržená. Proto se na vykreslení rozdání čeká 20 s
> a chyba to říká nahlas.

#### Smyčka: kolo, pak ostatní, pak zas kolo

Po **dohrané celé hře** (rozdání → ber/stůj → výsledek) se blackjack zařadí do
fronty **znovu, na konec**. Tím projde smyčka: když mezitím něco čeká (trénink,
zahrady, šachty), přijde to na řadu první, a až fronta nemá nic dalšího, hraje se
další kolo. Blackjack tedy **nikdy nedrží frontu na víc než jedno kolo**.

Dávka několika kol v jednom průchodu by naopak frontu blokovala na desítky sekund,
takže tady schválně není. Vypnout se to dá volbou *Po dohraném kole hrát hned
další* – pak se hraje jedno kolo na tik, tedy asi jedno za pět sekund.

Okno se před každým kolem uklidí: hru drží server, takže načtený fragment může
přijít **rozehraný** (pak se dohraje strategií) nebo **po konci** (pak stačí
„Nová hra“). Bez toho by tam rozehrané kolo uvízlo a další už by nešla.

#### Čemu to nepomůže

**Není double ani split** – v okně jsou jen „Vzít kartu“ a „Stát“. Právě tím se
výhoda domu stlačuje k půl procentu, takže tady zůstane **kolem 2 %** i při
bezchybné hře. Cíl není vydělat, ale prohrávat nejpomaleji možným tempem a mít
o tom čísla.

**Počítání karet nemá cenu.** Změřeno na barvách: v jednom kole se karta nikdy
nezopakovala (6 kol), ale mezi koly ano a často – ve 36 kartách byla K♠ třikrát,
2♥ třikrát. Míchá se tedy po každém rozdání, každé kolo začíná plným balíčkem
a minulé karty o příštích neříkají nic.

#### Diagnostický průběh

V záložce **Blackjack** je sekce **Průběh posledních kol** – každé kolo krok za
krokem, s časy od začátku kola:

```
=== 30. 7. 2026 12:36:06 — prohra −10 💎 (11 kroků)
  +     0 ms  start                  sazka=10 diamanty=32492
  +     2 ms  oživení                skriptu=1
  +   304 ms  okno při otevření      faze=sazka schovano=true tl={"deal":"disabled-attr…"}
  +   425 ms  sázím                  cil=10 dealPred=disabled-attr disabled-class ok
  +   497 ms  vsazeno                chtel=10 vidiHra=10 deal=ok
  +   497 ms  klik                   sel=#blackjack_btn-deal
  +   749 ms  rozdáno                score=13 moje=9♠ 4♦ dealerUp=5♥
  +   749 ms  rozhodnutí             akce=stand score=13 soft=false dealerUp=5
  +  1002 ms  závěr                  titul=Prohrál jsi dealer=5♥ 6♣ 7♦ …
```

Zapisuje se **i když kolo skončí chybou** – řádky velkými písmeny (`SELHALO`,
`CHYBA`) jsou přesně ta místa, kde se to zaseklo, a nesou úplný snímek okna:
fáze, součet, karty, počet rubových karet, sázka, jak ji vidí hra, a **stav všech
čtyř tlačítek** (`disabled-attr` / `disabled-class` / `ok`). Právě tenhle údaj
odhalil, že „chyba u tlačítka“ byl neoživený fragment.

Drží se posledních 5 kol; jde je uložit do souboru, zkopírovat i smazat
(v nastavení nebo v panelu). Za běhu funguje i `CMC.blackjack.dumpTrace()`
v konzoli.

> Dvě vady našel sám ten log, ještě než se dostal k tobě: název kroku
> „rozhodnutí“ přepisovala hodnota klíče `co` (kolize v zápisu detailu) a delší
> názvy se lepily k datům bez mezery.

#### Záložka Blackjack

Vsazeno / Vráceno / Celkem / Návratnost, a od 100 kol se návratnost **porovná
s očekávanými ~98 %** – když je výrazně jinde, je to buď málo kol, nebo něco
nechápu. Podíl blackjacků je kontrola sama pro sebe: má přijít v ~4,8 % kol.
V tabulce posledních 60 kol je v tooltipu vidět, **co strategie rozhodla a proti
čemu** (`hit@16v9 stand@20v9`), takže se to dá zpětně zkontrolovat.

#### Rozpis podle situací

Sdružuje odehraná kola podle **výchozí situace**: tvoje ruka (tvrdá 4–8, 9–11,
12–16, 17+, měkká, blackjack) × karta dealera (slabá 2–6, střední 7–9, desítka,
eso). U každé skupiny počet kol, podíl výher, bilance a návratnost, plus věta
„nejvíc bere …“.

**Strategii to nezlepší** – ta je pro tahle pravidla optimum. Slouží ke dvěma
věcem: zkontrolovat, že hra nerozdává v některých situacích jinak, a vidět, kde
to bere nejvíc. Skupiny pod 15 kol jsou označené ⚠, protože v pěti kolech je
návratnost cokoli. Kola s nepřečteným výsledkem se do rozpisu nepočítají.

Jednotlivých kombinací je 16 × 10, takže by v každé byla dvě kola a jen šum –
proto skupiny. Historie bez uloženého výchozího součtu se dopočítá **z tahů**
(`hit@18sv9` nese součet i to, že byl měkký), aby se starší data nemusela zahodit;
paměť posledních kol se zvětšila z 60 na 200.

#### Mazání záznamů

Obojí jde vynulovat na dvou místech: v panelu (kasino v záložce **Historie**,
automat v záložce **Automat**, blackjack v záložce **Blackjack**) a v nastavení
v sekci **Smazat záznamy her**, kde je u každého vidět, kolik dat tam je. Vždy
na dva kliky – sbírá se to dlouho.

> Mazání kasina si dřív opisovalo seznam klíčů natvrdo, a od té doby jich pět
> přibylo (`streak`, `sunk`, `busts`, `lossRun`, `maxLossRun`), takže by po
> „smazání“ zůstaly staré hodnoty. Teď to dělá `casino.reset()` v modulu, kde ten
> seznam žije.

### Poker (#18) – Casino Hold'em, jediná hra s plusem

V selectu `auto` je 🂡 **poker (#18)**. Ante v diamantech, po flopu se spočítá
šance a při převaze se sázka **zdvojnásobí**.

**Změřená pravidla** (18 kol naživo, z odpovědí serveru):

```
POST /map/building/casino/pokerPoints  {action:'deal', ante}
  → player_hand[2], community_cards[3], player_rank, ante
POST …                                 {action:'decision', choice}
  → dealer_hand[2], new_community[2], dealer_rank, title, payout
```

| | |
|---|---|
| „Pokračovat" (`check`) | sázka = ante |
| „Vsadit 2×" (`bet2x`) | sázka = 2× ante |
| výhra | 1:1 z celkové sázky |
| remíza | sázka zpět |
| **síla kombinace** | **na výplatu nemá vliv** (trojice platí jako pár) |
| kvalifikace dealera | není |

#### Proč se tu dá vydělat

Hráč i dealer mají dvě karty a **společný stůl**, takže hra je symetrická
a samotné hraní nevydělá ani neprohraje. Cenu má jen to rozhodnutí. Simulace
20 000 kol (vlastní hodnocení ruky, ověřené na 11 typech kombinací):

| strategie | zdvojeno | EV na kolo | návratnost |
|---|---|---|---|
| vždy Pokračovat | 0 % | −0,014 ante | 98,6 % |
| **zdvojit v převaze** | 42 % | **+0,132 ante** | **109,3 %** |
| zdvojit při +5 pb | 40 % | +0,130 ante | 109,4 % |

#### !!! Rozdání není poctivé – dealer dostává vysoké karty !!!

Všechna čísla o výhodnosti níž platila za předpokladu, že dealerovy karty jsou
náhodné. **Nejsou.** Test je bez jediného předpokladu o pravidlech hry: devět
karet kola (hráčovy 2, stůl 5, dealerovy 2) je při poctivém míchání rozdáno tak,
že kterákoli dvojice z nich mohla být dealerova – stačí je tedy přeházet a
porovnat. Na 804 kolech s kompletními kartami:

| | vysokých karet (J,Q,K,A) | čekáno | odchylka |
|---|---|---|---|
| **dealer** | **632** | 516 | **+7,0 σ** |
| hráč | 423 | 516 | −5,6 σ |
| stůl *(kontrola metody)* | rovnoměrně | rovnoměrně | ✓ |

p-hodnota: **0 z 20 000 přeházení**. Dealer dostal dámu 178×, kluka 156×, eso
153×; hráč pětku 157×, sedmičku 154×, dvojku 151×. Že je **stůl v normě**, je
zároveň kontrolou metody – kdyby byl postup chybný, projevilo by se to i tam.

Základní hra má tím **−9,8 % na kolo** (35,9 % výher proti 45,8 % proher). Na
týchž kolech:

| rozhodování | návratnost |
|---|---|
| vždy jen Pokračovat | 90,2 % |
| vždy Vsadit 2× | 90,2 % |
| **skutečně hraná strategie** | **96,5 %** |
| zdvojit až od +20 pb | 97,8 % |

Zdvojování tedy **pomáhá** (+6 pb proti pasivní hře), ale ztrátu nesmaže – a
smazat ji nemůže, protože přidat umí nejvýš pár procent. **Hra je nevýhodná a
strategií se přebít nedá.**

Dřív to takhle nebylo: prvních ~2 253 kol mělo návratnost 111 % (+5 150 💎), pak
se to zlomilo na ~96 %. Rozdíl mezi obdobími je ~4 σ. Rané rozdané karty už v logu
nejsou (přepsaly se), takže poctivost tehdejšího rozdání dokázat nelze – ale zisk
+5 150 💎 by ve hře s −9,8 % byl asi 10 σ, tedy prakticky nemožný.

**Vychýlení se navíc v čase mění.** Dvě sezení téhož dne, stejný kód i strategie:

| sezení | kol | návratnost | vychýlení dealera |
|---|---|---|---|
| dopoledne | 593 | 88,3 % | **+8,0 σ** |
| odpoledne | 407 | **101,6 %** | +3,4 σ |

Při +8 σ hra brala 12 % z každé sázky; při +3,4 σ zdvojování ztrátu zrovna
vyrovnalo a výsledek sedí na nule (+0,4 σ od ní). Proto se `poctivost()` počítá
průběžně a záložka varuje **„NEHRÁT“**, jakmile odchylka dealera přeleze 3 σ.

> **Pracovní zápisník k tomuhle pátrání je v [`POKER-VYSETRENI.md`](POKER-VYSETRENI.md)** –
> co je prokázané, co ne, jaké chyby jsem cestou udělal a jak experiment dokončit.

#### Měřicí režim: rozplétá, co vychýlení způsobuje

Vychýlení se v čase **mění** – naměřeno 0,95× až 1,51× mezi okny po 200 kolech,
což je čtyřnásobek toho, co dovoluje náhoda. Tím padá každé srovnání „před a po“:
jedno měření se od běžného kolísání odlišit nedá.

Kandidáti na příčinu byli tři a data mezi nimi nedokázala vybrat, protože ante se
v běžném hraní změní **jednou a naráz s časem** (207 kol s ante 20 leželo celé
v jednom úseku, takže ve stejné době neexistovalo ani jedno kolo s ante 10):

| co bylo naměřeno | hodnota |
|---|---|
| ante 10 (792 kol) | 1,01× (+0,2 σ) |
| ante 20 (207 kol) | **1,43× (+6,7 σ)** |
| korelace „výsledek okna N → vychýlení okna N+1“ | +0,55 (jen 6 párů – šum) |
| korelace „pořadí okna → vychýlení“ | −0,37 (**proti** hypotéze času) |
| vychýlení u ante 20 v prvních 50 kolech | 1,42× (nastoupilo **naráz**, nenarůstalo) |

Měřicí režim (`pkMereni`) proto ante **střídá po blocích** (`pkMereniAnte`,
`pkMereniBlok`, nejmíň 20 kol na blok). Každá podmínka tak dostane několik různých
okamžiků a jde oddělit vliv sázky od vlivu času i od průběžného výsledku. Ke
každému kolu se do logu připíše `mBlok` a `mAnte` (v CSV sloupce
`mereni_blok`, `mereni_ante`) a `mereniStats()` to sype do panelu ve dvou
tabulkách – **podle výše sázky** a **podle bloku v čase**.

Podmínky se srovnávají **poměrem** (dostal / měl dostat), ne v σ: σ roste
s odmocninou z počtu kol, takže podmínka s víc koly by vypadala vychýleněji,
i kdyby byla stejná. Kolik kol je potřeba na rozpoznání (2 σ):

| vychýlení | na jeho rozpoznání | na rozdíl mezi dvěma podmínkami |
|---|---|---|
| 1,05× | 1 558 kol | 3 116 na podmínku |
| 1,10× | 390 kol | 779 na podmínku |
| 1,20× | 97 kol | 195 na podmínku |
| 1,40× | 24 kol | 49 na podmínku |

Čtení výsledku: jde-li poměr **s výší sázky** a ne s pořadím bloku, je příčinou
sázka; jde-li **s pořadím bloku** napříč oběma sázkami, je to čas nebo počet kol.

#### Automatika se při vychýleném rozdání vypne sama

Vztah mezi vychýlením a výdělkem je skoro monotónní – změřeno na oknech po 150
kolech během jednoho dne:

| vychýlení dealera | −2,8 σ | −1,4 σ | +0,4 σ | +0,9 σ | +2,0 σ | +3,0 σ | +5,6 σ |
|---|---|---|---|---|---|---|---|
| návratnost | 107 % | 110 % | 101 % | 93 % | 96 % | 84 % | **77 %** |

Regrese přes všechna okna: **každá 1 σ vychýlení stojí ~3,6 pb návratnosti.**
A klíčové: **při poctivém rozdání (σ ≈ 0) je návratnost 100 %**, takže hra sama
o sobě nevydělává – vydělá jedině tehdy, když má dealer smůlu. Simulovaných
109 % se v praxi nikdy nedosáhlo.

Proto `autoTick()` před každým kolem změří poctivost posledních **300** kol a při
odchylce nad **3 σ** volbu v liště vypne a napíše proč. Kontroluje se to **před**
herním oknem, aby se volba vypnula i tehdy, když hra zrovna není otevřená. Vypnout
hlídače jde v předvolbách (`pkStopVychyleni`).

> Naživo tohle chybělo a stálo to **1 180 💎 za 549 kol**: panel varoval „NEHRÁT“,
> ale automatika hrála dál – včetně úseku, kde vychýlení dosáhlo +5,6 σ
> a návratnost spadla na 77 %.

#### Rozehrané kolo se nedá opustit – ante propadne (ověřeno)

Fold ve hře není, takže kola s negativním navrchem se hrát **musí**. Nabízelo se,
že by se nevýhodné kolo dalo opustit bez odpovědi a ante by se vrátila – pak by
se hrála jen ta výhodná, což by bylo silně ziskové. Změřeno naživo, dvě kola:

| krok | diamanty |
|---|---|
| před sázkou | 27 490 |
| po kliknutí na „Deal“ | **27 480** (ante se strhne hned) |
| po obnovení stránky bez rozhodnutí | **27 480** → ante **propadla** |

Server rozehrané kolo navíc nedrží – po obnovení je stůl čistý, ante 0 a „Deal“
zamčený. Opustit kolo je tedy **−1 ante**, kdežto dohrát ho je **−navrch**, a
navrch je vždy ≥ −1. Dohrát je proto vždycky aspoň tak dobré jako odejít, obvykle
výrazně lepší (i v nejhorším pásmu je skutečné W−L jen −0,42). **Žádná mezera tu
není** a strategie zůstává jediným pákovým bodem.

#### Prah zdvojení se MĚŘÍ na nedávných kolech

EV(Pokračovat) = navrch, EV(Vsadit 2×) = 2 × navrch, takže **zdvojit se má právě
když je navrch kladný** – ale jen pokud je odhad nezkreslený. Když je rozdání
vychýlené, odhad přestřeluje, a to **ne rovnoměrně**: nejvíc u mírné převahy,
protože tam rozhoduje, jestli dealer chytne vysokou kartu (a ty dostává navíc);
u hotové silné ruky mu vysoká karta nepomůže. Prah pak nemá být nula.

**Optimální prah ale závisí na tom, jak je rozdání ZROVNA vychýlené — a to se mění
po hodinách.** Naměřeno téhož dne: +8,0 σ, +4,9 σ, +3,3 σ, +0,3 σ. Na týchž kolech:

| prah | poctivé rozdání (+0,3 σ) | vychýlené (+3,3 a +4,9 σ) |
|---|---|---|
| **> 0 pb** | **103,9 %** | 97,2 % |
| > 20 pb | 102,4 % | **100,1 %** |
| > 45 pb | 100,4 % | 99,7 % |
| nikdy nezdvojovat | 90,9 % | 90,3 % |

> **Tohle stálo naživo 3,5 pb — a příčinou byla ZÁMĚNA JEDNOTEK.** `log()` ukládá
> navrch už v procentních bodech (45,0), ale kalibrace ho násobila stem znovu.
> Každý kandidátní prah byl proto překonán vždycky a **všechny vyšly identicky**
> (v panelu stálo u prahů 0 až 45 pb totéž: 38 %, +15 ante, 103 %). Ta samá chyba
> stojí i za „degenerovaným“ prahem 1 169 pb – je to 11,7 pb × 100, žádná
> degenerace regrese. Strop 45 pb to zamaskoval, takže o prahu rozhodoval strop,
> ne data, a v poctivém sezení se zdvojovalo jen v 18 % kol: ze 103,9 % zůstalo
> 100,4 %.
>
> Chyba prošla i testy, protože fixture držel navrch jako **zlomek** – tedy ve
> stejných jednotkách, v jakých se mýlil kód. Je to druhý případ téhož vzorce
> (viz `stul` vs `board` u testu poctivosti), takže fixture teď kopíruje skutečný
> tvar zápisu z `log()` a přidaná kontrola hlídá, že různé prahy dávají RŮZNÉ
> výsledky.

Nová podoba nic neextrapoluje: kandidátní prahy (0, 5, 10, 15, 20, 30, 45 pb) se
**vyhodnotí na posledních 400 kolech** a vybere se nejlepší – ale jen když nulu
překoná **víc než o vlastní šum**. Ten se počítá jen z kol, kde se rozhodnutí od
nuly liší (jinde je výsledek totožný), takže σ ≈ √(počet lišících se kol). Když se
nic neprokáže, zůstává nula. Krátké okno je schválně: prah tak jde s režimem.

Zabudovat vychýlení do odhadu šancí **nepomáhá** (simulace 3 000 kol při síle
1,2×: naivní odhad 107,9 %, poučený 108,2 %) – vychylka stlačuje všechny odhady
podobně, takže rozhodnutí změní jen u hraničních kol. Zkoušené prahy zdvojení na
skutečných kolech posledního sezení skončily všechny v pásmu 101–104 % s chybou
±4–6 pb, čili mezi sebou nerozeznatelné. Tohle měl panel hlídat od začátku – bez toho se
celý den ladila strategie ve hře, která se mezitím obrátila proti hráči.

#### Hra ignoruje kickery (nalezeno na 3 288 skutečných kolech)

První verze počítala šance plným pokerovým hodnocením. Data z ostrého provozu to
vyvrátila: hra vykázala **21,8 % remíz**, kdežto plné hodnocení dává 4 %. Ten
rozdíl (17,7 pb) přesně odpovídal tomu, co ubylo z výher i proher – takže hra
porovnává ruce **hruběji**. Ze čtyř zkoušených hrubostí sedí jediná:

| pravidlo | remíz | odchylka od hry |
|---|---|---|
| jen kategorie | 38,4 % | 16,6 pb |
| **kategorie + jeden hlavní rank** | **22,8 %** | **1,0 pb** ✓ |
| kategorie + dva ranky | 13,5 % | 8,3 pb |
| plné kickery | 4,0 % | 17,8 pb |

Takže „pár devítek“ proti „páru devítek“ je **remíza bez ohledu na zbytek karet**
a „nejvyšší karta A“ proti „nejvyšší kartě A“ taky. Přesnější měření na 804 kolech
se známými kartami i výsledkem pak ukázalo, že u **dvou párů** rozhoduje i druhý
pár – tahle podoba pravidla souhlasí s výsledkem hry v **99,6 %** kol (proti 97,8 %
u samotné „kategorie + 1 rank“ a 85,7 % u plných kickerů). Odhad šance to teď dělá stejně
(`porovnejHrou`); dřív rozhodoval podle jiné hry, než se hraje, což stálo
~1,4 procentního bodu návratnosti (107,9 % místo 109,3 %).

Je to jediná hra v kasinu s kladnou očekávanou hodnotou – automat i blackjack
mají výhodu domu, kuličky jsou přesně na nule.

> **Rozptyl je ale devítinásobek té výhody** (σ ≈ 1,2 ante na kolo proti 0,132).
> Šance, že jsi v plusu: po 20 kolech **69 %**, po 100 kolech **86 %**, po 500
> kolech **99,3 %**. Na krátkém úseku rozhoduje štěstí – panel to říká nahlas
> a pod 200 kol návratnost označuje jako šum.

> **A pozor na velikost ante.** Výhoda i kolísání rostou se sázkou stejně, takže
> poměr drží – ale v absolutních číslech se kolísání zvětší. Kdo vydělá tisíce
> s malým ante a pak ho zvýší desetinásobně, může celý dosavadní zisk smazat
> jedním horším úsekem, protože ten úsek se počítá v desetinásobných jednotkách.

#### Jak se rozhoduje

Po flopu je známo pět karet ze sedmi. Zbytek – dealerovy dvě, turn a river – se
**dosimuluje** (výchozích 3 000 náhodných dokončení, pár desítek milisekund,
chyba pod 2 procentní body). Zdvojí se, když je šance na výhru vyšší než na
prohru; remízy jsou neutrální, protože vracejí sázku. Práh jde zvednout, ale
simulace ukázala, že 0, +5 i +10 pb dávají skoro totéž.

Nic se přitom neposílá do hry – je to čistý výpočet nad tím, co je v okně, a
klikají se skutečná tlačítka. Poker má stejnou past s hlavním světem jako
blackjack (`poker_ante`), takže ho `main-world.js` inicializuje taky.

#### Past, na kterou to spadlo

Automatika se dvakrát vypnula a log ukázal proč:

```
+ 60004 ms  rozdání SELHALO   moje=7♦ 3♦  board=8♦ 2♦ J♥  faze=rozhodnuti
+ 60004 ms  CHYBA             hra nevykreslila rozdání
```

**Karty v okně byly** – dvě moje, tři na stole, správná fáze. Chyba byla v tom,
že se čekalo na **ustálený stav** (dvě stejná čtení po sobě), a poker karty
animuje 3D překlopením, takže se podpis stavu pořád mění a ustálení nenastane.
Minutu se čekalo na něco, co už tam dávno bylo, a tři taková selhání za sebou
automatiku vypnou.

U pokeru se proto **na ustálení nečeká** – podmínka je sama dost silná (dvě moje
karty, tři na stole, fáze rozhodování; konec kola pozná titulek). Zároveň:

- **strop selhání je 5**, ne 3, a v liště je vidět, kolik zbývá,
- po chybě se hraje dál hned, ne až za pětisekundový tik,
- historie logu je 12 kol místo 5, aby se dalo dohledávat zpětně.

#### Záložka Poker

Kromě bilance je tam **rozpis podle rozhodnutí**: kola se zdvojením proti těm
bez. Na tom se pozná, jestli výpočet dělá, co má – ve zdvojených kolech má být
návratnost výrazně nad 100 %, v ostatních pod. V tabulce je u každého kola
vidět, **o kolik procentních bodů byl navrch** v momentě rozhodnutí, a v logu
i celý výpočet (`vyhra=61.2% prohra=28.4% navrch=32.8pb volba=Vsadit 2×`).

### Zločiny – řádek s odvahou
Na mapě je **20 zločinů** (`[action="/map/crime/1..20"]`). Lišta je dá do řádku,
na tlačítku je **potřebná odvaha** – ta je u každého jiná, takže slouží
i jako označení:

> ZLOČINY: **1** **2** **4** **5** **7** **9** **12** **14** **17** **20** **25** **30** **34** **38** 42 46 🔒 50 🔒 56 🔒 61 🔒 64 🔒

Řadí se **podle odvahy**, ne podle ID na mapě – mapa má nejtěžší zločin jako
`crime/1`, což by v liště bylo na přeskáčku. Klik přepošle klik na herní
**„Spáchat zločin“**; Turbo varianty (`…/crimes/{n}/{2|10|100|1000}`) jsou za
diamanty a v liště **nejsou**.

| Barva | Stav |
|---|---|
| vínově | jde spáchat |
| oranžový rámeček, vypnuté | odvaha se ještě musí obnovit (v tooltipu kolik chybí) |
| 🔒 vypnuté | nestačí rychlost (v tooltipu kolik chybí) |

Tooltip má celou věc: *„Srazit cyklistu – odvaha 20, rychlost 52 913; odměna
25–41 Kč špinavých, 485–1 150 xp; klik spáchá zločin“*.

**Co rozhoduje, jestli zločin jde.** Fragment uvádí požadavky i procento
úspěšnosti. Na všech 20 zločinech platí, že je to **90 %, když tvoje rychlost na
požadavek má, a 0 %, když ne** – žádné plynulé škálování mezi tím. Stav se proto
neurčuje z toho procenta, ale z faktů: `rychlost < požadavek` → zámek,
`odvaha < požadavek` → počkat, jinak jde. Odvaha i rychlost se čtou z HUD při
každém překreslení (`.resources-courage`, `.value.renew-modded-speed`), takže se
nepracuje se zastaralým číslem.

**HUD se tu neodečítá.** Na rozdíl od posilovny si hra u zločinu HUD obnoví sama
i při akci z modalu na pozadí – ověřeno v běžící hře: odvaha **18 → 14**
u zločinu za 4 odvahy, bez jakéhokoli zásahu rozšíření. Ruční odečet jako
v `gym.js` by proto ubral dvakrát; řádek jen počká, až hra HUD přepíše,
a překreslí se.

Požadavky se nemění, takže se drží v `chrome.storage` (**6 h**) – jinak by každé
načtení herní stránky znamenalo 20 požadavků na hru. Poprvé se přečtou na pozadí
a řádek pak naskočí sám.

### Předměty
To, co hra sama nedává: **celková cena vlastnictví**. U každého předmětu se
eviduje pořízení (aukce / obchod / výroba / dar / úkol) a pak každý upgrade
zvlášť s cenou a datem. Předmět pak vidíš jako
`pořízení 45 000 + 3× upgrade 120 000 = 165 000 Kč`, včetně podílu upgradů na
celkové ceně. Po prodeji se dopočítá výsledek (prodejní cena minus všechno, co
jsi do předmětu nasypal).

Souhrn nad seznamem: kolik máš vázáno ve vlastněných předmětech, kolik z toho
tvoří upgrady, a realizovaný výsledek prodejů. Plus rozpad podle kategorií.
Export do CSV.

## Nastavení (ikona rozšíření)

**Popisy jsou schované pod „i“.** Nastavení má třicet vysvětlujících odstavců,
některé na deset řádků, takže se v nich samotné volby ztrácely. Zahodit ten text
ale nejde – většina čísel v něm je **změřená** (kurzy, ceny, prodlevy) a bez
vysvětlení se nedá rozhodnout, co nastavit. Vedle každého popisku volby je proto
kolečko **ⓘ**, které popis rozbalí; rozbaluje se po jednom.

Dělá to `schovejPopisy()` v `popup.js` za běhu, ne ruční úprava značkování –
popisů je třicet a přibývají, takhle se to týká i budoucích. Dvě věci, na kterých
to stojí:

- **`preventDefault()` na kliku.** Část popisů je *uvnitř* `<label>`, kde se každý
  klik přenáší na ovládací prvek – bez toho by rozbalení popisu **zapnulo tu
  volbu, kterou popisuje** (a u „Pozastavit veškerou automatiku“ zvlášť nemile).
- **Idempotence.** Značka `data-cmc-info` na popisu brání tomu, aby se při druhém
  průchodu tlačítka množila.

| Volba | K čemu |
|---|---|
| Sledované budovy | ID slotu + název + typ (`whisky` / `konopí` / `pervitin` / `pivovar` / `ostatní`) + **Kap.** = celkový počet sudů / hektarů. ID najdeš v URL hry: `/map/building/show/{id}`. Kapacitu vyplň jen tehdy, když ji panel neumí přečíst ze hry. |
| Dopravní prostředky | Název, kapacita jednoho vyslání, kolik jich máš, a odkud brát zásobu (napojení na budovu, nebo ručně v panelu). |
| Načítat samo + interval | Auto-refresh stavu, minimum 60 s. |
| Nabízet vyplnění sázky | Zapíná lištu v aukci. |
| Tlačítka do lišty dole | Zapíná lištu (Rychlost / Síla / Obrana + Strážci / Bojovníci, bez Turba). |
| Lištu zobrazovat i mimo posilovnu | Mimo posilovnu z lišty udělá zkratku, která ji otevře. |
| Trénovat i mimo posilovnu | Umožní trénink odkudkoli (stáhne fragment, přepošle klik). Nejblíž automatizaci – výchozí vypnuto. |
| Zvýraznit při energii ≥ | Obarví lištu zeleně a ukáže, kolik tréninků z energie vyjde. Jen signál – neklikne. 0 = vypnuto. |
| Řádek letadel / lodí v liště | Řádek s letadly `L1`…`L9` a lodí `S1`…`S9`, za lomítkem počet zbývajících plných jízd – tlačítko sebere peníze, nebo vypraví náklad. |
| Řádek zločinů v liště | Všech 20 zločinů z mapy; na tlačítku potřebná odvaha, klik spáchá zločin. Turbo za diamanty v liště není. |
| Selektor hotovosti / banky | Nepovinné CSS selektory pro čtení z živého UI. Čisté a špinavé peníze i diamanty se ale berou z HUD (`.money-set`) samy; zůstatek v bance dá budova **Banka**. Panel rozšíření je z hledání vyloučený, aby si nečetl vlastní čísla. |
| Záloha / obnovení | Celý obsah (nastavení, historie, předměty) do JSON a zpět. |

## Struktura

| Soubor | Účel |
|---|---|
| `manifest.json` | definice rozšíření (MV3), pořadí načtení modulů |
| `content.js` | bootstrap – načte konfiguraci a postaví panel |
| `src/store.js` | persistence nad `chrome.storage.local` (+ migrace z 0.1.x) |
| `src/parse.js` | **jediné místo, které komunikuje s hrou** – výhradně GET a parsování |
| `src/econ.js` | výpočty výrobního cyklu, restocku a **nákladu na jednotku** – používá je Stav, Doprava a graf zásob v Historii |
| `src/history.js` | snapshoty v čase (hotovost + banka + celek), přírůstek za hodinu, CSV |
| `src/items.js` | evidence předmětů, celková cena, souhrny, CSV |
| `src/fmt.js` | formátování čísel, peněz a času (cs-CZ) |
| `src/ui.js` | stavební prvky panelu (vše přes `textContent`) |
| `src/chart.js` | SVG grafy bez knihoven, s hover tooltipem |
| `src/tab-*.js` | záložky panelu: Stav, Doprava, Historie, Předměty |
| `src/panel.js` | skořápka panelu, tažení, auto-refresh |
| `src/auction.js` | vyplnění sázky v aukci (zapisuje do pole, nic neodesílá) |
| `src/gym.js` | lišta posilovny a kasáren – přeposílá klik na „Trénovat“ (nic neodesílá) |
| `src/fleet.js` | další řádky lišty: letadla `L1`…`L9` a lodě `S1`…`S9`, sebrat / vypravit podle stavu |
| `src/crimes.js` | řádek zločinů z mapy – na tlačítku potřebná odvaha, klik spáchá zločin |
| `src/jail.js` | detekce vězení – zastaví veškerou automatiku, ručních kliků se netýká |
| `src/mines.js` | diamantové šachty – jedno tlačítko: sebrat, nebo pustit do práce |
| `src/work.js` | úřad práce #9 – výběr mzdy (přihlašování na pozice ne) |
| `src/brothel.js` | nevěstinec #19 – poslat → 5 h → vybrat hned (nábor/prodej ne) |
| `src/farm.js` | zahrady, sloty 35–54 – sklidit+zasadit, 6 energie za pole |
| `src/queue.js` | sériový řadič automatiky – jedna akce v jednu chvíli |
| `src/slots.js` | automaty #18 – zatočení, měření návratnosti |
| `src/tab-automat.js` | záložka Automat – vloženo, vyhráno, návratnost |
| `src/blackjack.js` | blackjack #18 – základní strategie, sázka v 💎 |
| `src/main-world.js` | jediný skript v hlavním světě – inicializace blackjacku a pokeru |
| `src/tab-blackjack.js` | záložka Blackjack – bilance proti očekávání |
| `src/poker.js` | poker #18 – hodnocení ruky, odhad šance, zdvojení v převaze |
| `src/tab-poker.js` | záložka Poker – bilance podle rozhodnutí |
| `src/prijmy.js` | evidence příjmů z mzdy #9 a nevěstince #19 |
| `src/tab-prijmy.js` | záložka Příjmy – součty podle měn a sazba za hodinu |
| `src/casino.js` | kasino #15: sázka na klik + bilance (bez automatiky, EV = 0) |
| `popup.html/js` | nastavení a záloha dat |
| `panel.css` | styl panelu |

### Barvy grafů

Kategoriální paleta (dark varianty `#3987e5`, `#d95926`, `#199e70`) je
zvalidovaná proti povrchu panelu `#1c110e` – prošel lightness band, chroma
floor, CVD separace (nejhorší pár ΔE 9.4), normal-vision floor (ΔE 20.9)
i kontrast ≥ 3:1. Identita série nikdy nestojí jen na barvě: každý pruh má
popisek i hodnotu přímo u sebe.

### Zkrácená čísla

Hra velká čísla zkracuje: `384K`, `12.63 mld`, `1 trln`, `5.5 trln`. Parser je
rozpoznává (`K`/`M`/`B`/`T` jen velkým písmenem, slovní `tis.` / `mil.` / `mld`
/ `mrd` / `trln` / `bil` bez ohledu na velikost), protože bez toho by `3.4 mld`
znamenalo **3,4** – tedy miliardkrát méně.

Malé `k` se za zkratku nebere, jinak by `8 kg` bylo 8 000 a `30 ks` 30 000.
U zkráceného čísla je tečka vždy desetinná (`12.63 mld`), u plného může být
oddělovač tisíců (`12.000` = 12 000). Panel čísla zobrazuje stejným jazykem
jako hra – `3,4 mld Kč`.

## Ladění parserů

Každý typ budovy má v `src/parse.js` profil s **regexy proti skutečnému textu
fragmentu**. Všechny typy vracejí stejné metriky (`stock` hlavní surovina,
`free` volná kapacita, `used` obsazeno, `capacity` celkem, `enough` na kolik
jednotek zásoba vystačí podle hry, `perUnit` spotřeba, `yieldPerUnit` výnos),
plus pole `inputs` se všemi surovinami včetně jejich ceny.

Když hra formulaci změní, hodnota bude `–` a karta u té budovy vypíše, co se
z fragmentu přečíst dalo (*„Popisky tohoto typu se nepodařilo poznat“*) –
pošli mi ten výpis a regex opravíme. Nikdy se nerozbije celé čtení.

Čas do dokončení se bere **z výrobního elementu** (`.working[data-timedone]`,
resp. `time-left-secs`), nikoli z časovače upgradu budovy – ve fragmentu jsou
oba a záměna by ukazovala „hotovo za 6 h“ místo skutečných minut.

U typu `ostatní` se vypíše prvních šest dvojic „Popisek: číslo“, které se
ve fragmentu najdou.

Chyby čtení se vypisují v panelu i do konzole s prefixem `[CMC]`.
