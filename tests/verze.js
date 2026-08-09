/* Verze musí být na všech místech stejná.
 *
 * Zdroj pravdy je `extension/manifest.json` – to je jediné číslo, které vidí
 * prohlížeč. README a CHANGELOG ho jen opisují, a právě proto se rozejdou:
 * hlavička rozšíření tvrdila „READ-ONLY, neposílá žádnou akci“ ještě v době, kdy
 * kód hrál poker a útočil na hráče. Tenhle test je proti tomu, aby se dokumentace
 * zas začala rozcházet s tím, co se doopravdy vydává.
 */
const fs = require('fs'), path = require('path');
const KOREN = path.join(__dirname, '..');

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  ok   ' : '  FAIL ') + n); };
const eq = (n, g, w) => ok(n + (String(g) === String(w) ? '' : `  got ${JSON.stringify(g)} want ${JSON.stringify(w)}`), String(g) === String(w));

const cti = p => fs.readFileSync(path.join(KOREN, p), 'utf8');

const manifest = JSON.parse(cti('extension/manifest.json'));
const verze = manifest.version;

console.log('\n[verze] manifest je zdroj pravdy');
ok('má tvar x.y.z (' + verze + ')', /^\d+\.\d+\.\d+$/.test(verze));

console.log('\n[verze] README v korenu ji nese na začátku');
{
  const r = cti('README.md');
  const hlava = r.split('\n').slice(0, 6).join('\n');
  const m = hlava.match(/Verze rozšíření:\s*(\d+\.\d+\.\d+)/);
  ok('je v prvních řádcích, ne někde dole', !!m);
  if (m) eq('a souhlasí s manifestem', m[1], verze);
  ok('odkazuje na historii změn', /CHANGELOG\.md/.test(hlava));
}

console.log('\n[verze] README rozšíření taky');
{
  const r = cti('extension/README.md');
  const m = r.split('\n').slice(0, 6).join('\n').match(/Verze:\s*(\d+\.\d+\.\d+)/);
  ok('je na začátku', !!m);
  if (m) eq('a souhlasí', m[1], verze);
}

console.log('\n[verze] CHANGELOG má nejvyšší záznam právě pro tuhle verzi');
{
  const ch = cti('CHANGELOG.md');
  const zaznamy = [...ch.matchAll(/^## (\d+\.\d+\.\d+)/gm)].map(x => x[1]);
  ok('nějaké záznamy tam jsou', zaznamy.length > 0);
  eq('první je aktuální verze', zaznamy[0], verze);

  /* Pořadí musí být od nejnovějšího – jinak se „první“ nedá brát jako aktuální. */
  const cislo = v => v.split('.').map(Number);
  const vetsi = (a, b) => {
    const x = cislo(a), y = cislo(b);
    for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; }
    return false;
  };
  let serazeno = true;
  for (let i = 1; i < zaznamy.length; i++) {
    if (!vetsi(zaznamy[i - 1], zaznamy[i])) serazeno = false;
  }
  ok('a jsou od nejnovějšího (' + zaznamy.slice(0, 3).join(' › ') + '…)', serazeno);
  ok('žádná verze dvakrát', new Set(zaznamy).size === zaznamy.length);
}

console.log('\n[popis] dokumentace netvrdí, že se nic neposílá');
{
  /*
   * Kód kliká – výrobny, kasino, útoky, vylepšování. Tvrzení o opaku není
   * nepřesnost, ale nepravda o tom, co program dělá, a v public repu obzvlášť.
   */
  for (const f of ['extension/README.md', 'extension/content.js']) {
    const t = cti(f);
    ok(f + ': netvrdí „neprovádí herní akce“', !/neprovádí herní akce/.test(t));
    ok(f + ': ani „READ-ONLY“ jako popis dneška',
      !/Rozšíření je READ-ONLY/.test(t));
  }
  ok('content.js přiznává klikání', /KLIKÁ/.test(cti('extension/content.js')));
}

console.log(fails ? `\n✗ ${fails} kontrol selhalo` : '\n✓ verze souhlasí');
process.exit(fails ? 1 : 0);
