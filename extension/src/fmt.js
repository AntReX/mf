/* =============================================================================
 * fmt.js – formátování čísel, času a peněz pro české prostředí
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const n0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

  const isNum = v => v != null && Number.isFinite(+v);

  /** Číslo; malá čísla s desetinami, velká zaokrouhleně. */
  function num(v) {
    if (!isNum(v)) return '–';
    const a = Math.abs(+v);
    if (a < 10) return n2.format(+v);
    if (a < 1000) return n1.format(+v);
    return n0.format(+v);
  }

  /**
   * Peníze. Nad 100 tis. lze zkrátit (1,2 mil.). Drobné hodnoty si nechávají
   * desetiny – u ceny pšenice za kilo je rozdíl mezi 2,50 a 3 Kč podstatný.
   */
  function kc(v, { short = false } = {}) {
    if (!isNum(v)) return '–';
    const x = +v;
    const a = Math.abs(x);
    if (short && a >= 1e12) return n1.format(x / 1e12) + ' trln Kč';
    if (short && a >= 1e9) return n1.format(x / 1e9) + ' mld Kč';
    if (short && a >= 1e6) return n1.format(x / 1e6) + ' mil. Kč';
    if (short && a >= 1e5) return n0.format(x / 1e3) + ' tis. Kč';
    if (a > 0 && a < 10) return n2.format(x) + ' Kč';
    return n0.format(x) + ' Kč';
  }

  /** Peníze se znaménkem (zisk / ztráta). */
  function signed(v, unit = 'Kč') {
    if (!isNum(v)) return '–';
    const s = +v > 0 ? '+' : '';
    return s + n0.format(+v) + (unit ? ' ' + unit : '');
  }

  /** Diamanty – jiná valuta než koruny, tak ať se nesčítají omylem. */
  function gems(v) {
    return isNum(v) ? n0.format(+v) + ' 💎' : '–';
  }

  function pct(v, digits = 0) {
    if (!isNum(v)) return '–';
    return (digits ? n1 : n0).format(+v) + ' %';
  }

  /** Sekundy → "2 h 15 min" / "45 min" / "30 s". */
  function dur(sec) {
    if (!isNum(sec)) return '–';
    const s = Math.max(0, Math.round(+sec));
    if (s < 60) return s + ' s';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 48) return h + ' h' + (rm ? ' ' + rm + ' min' : '');
    return Math.round(h / 24) + ' dní';
  }

  /** Hodiny → "18 h" / "3,5 dne". */
  function hours(h) {
    if (!isNum(h)) return '–';
    return +h < 48 ? n1.format(+h) + ' h' : n1.format(+h / 24) + ' dne';
  }

  /** České skloňování po čísle: plural(4, 'sud', 'sudy', 'sudů') → 'sudy'. */
  function plural(n, one, few, many) {
    const a = Math.abs(+n);
    if (a === 1) return one;
    if (Number.isInteger(a) && a >= 2 && a <= 4) return few;
    return many;
  }

  /** Číslo se správným tvarem: count(4, 'sud', 'sudy', 'sudů') → '4 sudy'. */
  const count = (n, one, few, many) => num(n) + ' ' + plural(n, one, few, many);

  /** Velké první písmeno – popisky ze receptů začínají malým. */
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const time = t => new Date(t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const date = t => new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  const stamp = t => date(t) + ' ' + time(t);

  /** "před 12 min" */
  function ago(t) {
    const d = (Date.now() - t) / 1000;
    if (d < 45) return 'právě teď';
    return 'před ' + dur(d);
  }

  NS.fmt = { num, kc, signed, gems, pct, dur, hours, plural, count, cap, time, date, stamp, ago };
})();
