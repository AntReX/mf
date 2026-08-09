/* =============================================================================
 * items.js – evidence předmětů a jejich celkové ceny
 *
 * Hra ti řekne, co předmět stál teď. Neřekne ti, kolik jsi do něj nasypal
 * celkem – od aukce nebo jiného pořízení přes každý upgrade. Tohle to počítá.
 *
 * Předmět:
 * {
 *   id, name, category,
 *   source: 'aukce'|'obchod'|'výroba'|'dar'|'úkol'|'jiné',
 *   acquiredAt: 'YYYY-MM-DD',
 *   acquirePrice: number,          // 0 u daru / úkolu
 *   upgrades: [{ at, label, cost }],
 *   sold: null | { at, price },
 *   note: string
 * }
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const SOURCES = ['aukce', 'obchod', 'výroba', 'dar', 'úkol', 'jiné'];
  const CATEGORIES = ['zbraň', 'auto', 'nemovitost', 'budova', 'oblečení', 'zvíře', 'jiné'];

  const num = v => (Number.isFinite(+v) ? +v : 0);
  const today = () => new Date().toISOString().slice(0, 10);

  let seq = 0;
  function newId() {
    seq += 1;
    return 'it_' + Date.now().toString(36) + '_' + seq;
  }

  const all = () => NS.store.get().items;

  async function save(items) {
    await NS.store.put('items', items);
  }

  // ---- výpočty -------------------------------------------------------------

  /** Součet upgradů. */
  const upgradesCost = it => (it.upgrades || []).reduce((s, u) => s + num(u.cost), 0);

  /** Celková cena vlastnictví: pořízení + všechny upgrady. */
  const total = it => num(it.acquirePrice) + upgradesCost(it);

  /** Výsledek po prodeji, nebo null u předmětu, který ještě máš. */
  const net = it => (it.sold ? num(it.sold.price) - total(it) : null);

  /** Kolik z celkové ceny tvoří upgrady (v %). */
  function upgradeShare(it) {
    const t = total(it);
    return t ? (upgradesCost(it) / t) * 100 : null;
  }

  /** Souhrn portfolia. */
  function summary(items = all()) {
    const active = items.filter(i => !i.sold);
    const sold = items.filter(i => i.sold);
    return {
      count: items.length,
      activeCount: active.length,
      soldCount: sold.length,
      investedActive: active.reduce((s, i) => s + total(i), 0),
      investedTotal: items.reduce((s, i) => s + total(i), 0),
      upgradesTotal: items.reduce((s, i) => s + upgradesCost(i), 0),
      realizedPnL: sold.reduce((s, i) => s + (net(i) || 0), 0)
    };
  }

  /** Kolik jsi celkem utratil v jednotlivých kategoriích (pro graf). */
  function byCategory(items = all()) {
    const map = new Map();
    for (const it of items) {
      const key = it.category || 'jiné';
      map.set(key, (map.get(key) || 0) + total(it));
    }
    return Array.from(map, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  // ---- CRUD ----------------------------------------------------------------

  async function add(data) {
    if (!data.name || !String(data.name).trim()) throw new Error('Předmět musí mít název.');
    const it = {
      id: newId(),
      name: String(data.name).trim(),
      category: data.category || 'jiné',
      source: SOURCES.includes(data.source) ? data.source : 'jiné',
      acquiredAt: data.acquiredAt || today(),
      acquirePrice: num(data.acquirePrice),
      upgrades: [],
      sold: null,
      note: data.note || ''
    };
    await save([...all(), it]);
    return it;
  }

  async function update(id, partial) {
    await save(all().map(i => (i.id === id ? { ...i, ...partial } : i)));
  }

  async function remove(id) {
    await save(all().filter(i => i.id !== id));
  }

  async function addUpgrade(id, { label, cost, at }) {
    const items = all().map(i => i.id === id
      ? { ...i, upgrades: [...(i.upgrades || []), { at: at || today(), label: label || 'upgrade', cost: num(cost) }] }
      : i);
    await save(items);
  }

  async function removeUpgrade(id, index) {
    const items = all().map(i => i.id === id
      ? { ...i, upgrades: (i.upgrades || []).filter((_, k) => k !== index) }
      : i);
    await save(items);
  }

  async function markSold(id, price, at) {
    await update(id, { sold: { at: at || today(), price: num(price) } });
  }

  async function unmarkSold(id) {
    await update(id, { sold: null });
  }

  // ---- řazení / filtr ------------------------------------------------------

  const SORTS = {
    total: (a, b) => total(b) - total(a),
    name: (a, b) => a.name.localeCompare(b.name, 'cs'),
    date: (a, b) => String(b.acquiredAt).localeCompare(String(a.acquiredAt)),
    upgrades: (a, b) => upgradesCost(b) - upgradesCost(a)
  };

  function view({ query = '', sort = 'total', showSold = true } = {}) {
    const q = query.trim().toLowerCase();
    return all()
      .filter(i => showSold || !i.sold)
      .filter(i => !q || i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q))
      .sort(SORTS[sort] || SORTS.total);
  }

  // ---- export --------------------------------------------------------------

  function toCsv(items = all()) {
    const cell = v => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [['nazev', 'kategorie', 'zdroj', 'porizeno', 'cena_porizeni',
      'pocet_upgradu', 'cena_upgradu', 'celkem', 'prodano', 'cena_prodeje', 'vysledek', 'poznamka']
      .join(';')];
    for (const it of items) {
      lines.push([
        it.name, it.category, it.source, it.acquiredAt, num(it.acquirePrice),
        (it.upgrades || []).length, upgradesCost(it), total(it),
        it.sold ? it.sold.at : '', it.sold ? num(it.sold.price) : '',
        net(it) ?? '', it.note
      ].map(cell).join(';'));
    }
    return lines.join('\n');
  }

  NS.items = {
    SOURCES, CATEGORIES, today,
    all, add, update, remove, addUpgrade, removeUpgrade, markSold, unmarkSold,
    total, upgradesCost, net, upgradeShare, summary, byCategory, view, toCsv
  };
})();
