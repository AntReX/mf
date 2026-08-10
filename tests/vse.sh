#!/bin/zsh
# Spustí všechny testy a hlásí i to, co se NESPUSTILO.
#
# !!! PROČ SE KOUKÁ NA NÁVRATOVÝ KÓD !!!
# Dřív tenhle běžeč hledal v výstupu jen slova FAIL / VÝJIMKA. Když se ale soubor
# vůbec nenačetl (úklid /tmp smazal čtyři testy), node vypsal MODULE_NOT_FOUND –
# a to ani jedno z těch slov neobsahuje, takže se to ohlásilo jako „✓ (0)“.
# Nula kontrol není úspěch; teď se hlásí zvlášť.
cd "$(dirname "$0")" || exit 1

TESTY=(verze poker-sigma vypadky oblibene aukce lista panel-poloha kasino-pole attack upgrade rps fleet bank vyrobny market
       tabs background reload captcha)

celkem=0
spadlo=0
chybi=0
for t in "${TESTY[@]}"; do
  if [[ ! -f "$t.js" ]]; then
    print -- "  CHYBÍ  $t.js"
    (( chybi++ ))
    continue
  fi
  out=$(node "$t.js" 2>&1)
  kod=$?
  n=$(print -- "$out" | grep -c "^  ok  ")
  if (( kod != 0 )) || print -- "$out" | grep -q "FAIL\|VÝJIMKA"; then
    print -- "  ✗ $t (kód $kod)"
    print -- "$out" | grep "FAIL\|VÝJIMKA\|Error" | head -3
    (( spadlo++ ))
  elif (( n == 0 )); then
    print -- "  ? $t – žádná kontrola neproběhla"
    (( spadlo++ ))
  else
    print -- "  ✓ $t ($n)"
    (( celkem += n ))
  fi
done
print -- "\n  kontrol: $celkem   spadlo: $spadlo   chybí soubor: $chybi"
(( spadlo == 0 && chybi == 0 ))
