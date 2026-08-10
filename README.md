# CzechMafie Companion

**Verze rozšíření: 1.23.2** · [historie změn](CHANGELOG.md)

Rozšíření Chrome (MV3) pro hru [czechmafie.cz](https://s1.czechmafie.cz) – lišta
s ovládáním, evidence a automatiky nad tím, co hra sama nabízí.

## Co je v repu

| cesta | co to je |
|---|---|
| `extension/` | samotné rozšíření – načti přes `chrome://extensions` → „Načíst nerozbalené" |
| `extension/src/` | moduly; každý řeší jednu budovu nebo jednu funkci |
| `tests/` | testy v jsdom, jeden soubor na modul |

## Testy

```sh
cd tests
npm install        # jednorázově (jsdom)
./vse.sh           # všechno; hlásí i to, co se NESPUSTILO
node poker.js      # jen jeden modul
```

`vse.sh` schválně kontroluje návratové kódy a chybějící soubory: dřív hlásil
nespuštěný test jako „✓ (0)", takže se dala nepozorovaně ztratit celá sada.

## Verzování

Číslo verze je na jednom místě – v `extension/manifest.json` – a odsud se opisuje
do prvního řádku tohohle souboru a do `CHANGELOG.md`. Že si ta tři místa
odpovídají, hlídá `tests/verze.js`; bez toho by se README rozešlo s manifestem
a nikdo by si toho nevšiml.

Zvedá se při každé změně, která se dostane do prohlížeče: druhé číslo u nové
funkce, třetí u opravy.

## Zásady, které se tu drží

**Úspěch se měří, nepředpokládá.** Nejčastější chybou v tomhle projektu bylo
hlášení „hotovo" u akce, která neproběhla – banka psala „převedeno" a peníze
zůstaly čisté, výrobny „koupeno" bez nákupu, poker si zapisoval jinou sázku, než
doopravdy vsadil. Každá akce proto po sobě čte skutečný stav (peníze před/po,
odpočet budovy, výsledek boje) a když se nic nezměnilo, je to chyba, ne úspěch.

**Odpovědi hry se opisují, ne odhadují.** Selektory a formáty v komentářích jsou
naměřené na živé hře, i s datem. Kde se to změřit nedalo, je to napsané.

**Do kontroly „jsi člověk?" se nesahá.** Captcha se pozná, automatika se zastaví
a řízení se předá člověku. Rozšíření ji neřeší ani neobchází.

**Nedomýšlet stav.** Když se něco nedá přečíst, řekne se to – místo dopočítání
hodnoty, která by pak tiše rozhodovala o penězích.
