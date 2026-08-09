/* =============================================================================
 * econ.js – ekonomika výroby
 *
 * Čisté funkce nad čísly: co stojí vstupy, co vynese výstup, kolik to dělá za
 * hodinu a kde je hranice, pod kterou se výroba nevyplatí. Nic tu nesahá na
 * DOM ani na hru.
 *
 * Výroba může mít VÍC surovin (pivo = chmel + ječmen), proto jsou vstupy pole.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  const num = v => (Number.isFinite(+v) ? +v : 0);
  const div = (a, b) => (b ? a / b : null);

  /**
   * Jeden výrobní cyklus.
   * @param {object} p
   * @param {number} p.units          počet jednotek (sudy / hektary / chemici)
   * @param {Array} p.inputs          [{ label, of, unit, perUnit, price }]
   * @param {number} p.outputPerUnit  výstup na jednotku
   * @param {number} p.outputPrice    cena výstupu
   * @param {number} p.hours          délka cyklu
   * @param {number} [p.overhead]     fixní náklad na cyklus
   */
  function cycle(p) {
    const units = num(p.units);
    const inputs = (p.inputs || []).map(i => {
      const qty = units * num(i.perUnit);
      return { ...i, qty, cost: qty * num(i.price) };
    });

    const inputCost = inputs.reduce((s, i) => s + i.cost, 0);
    const overhead = num(p.overhead);
    const cost = inputCost + overhead;

    const outputQty = units * num(p.outputPerUnit);
    const revenue = outputQty * num(p.outputPrice);
    const profit = revenue - cost;
    const hours = num(p.hours);

    // hranice ceny každé suroviny zvlášť – ostatní náklady se drží
    const breakEven = inputs.map(i => {
      const others = cost - i.cost;
      return { ...i, maxPrice: div(revenue - others, i.qty) };
    });

    return {
      units, inputs, inputCost, overhead, cost,
      outputQty, revenue, profit, hours,
      profitPerHour: div(profit, hours),
      revenuePerHour: div(revenue, hours),
      marginPct: revenue ? (profit / revenue) * 100 : null,
      profitPerUnit: div(profit, units),
      costPerUnit: div(cost, units),
      breakEven,
      breakEvenOutputPrice: div(cost, outputQty)
    };
  }

  /**
   * Cyklus podle receptu. `live` jsou hodnoty přečtené z budovy (spotřeba,
   * ceny surovin, výnos) – hra je uvádí, takže mají přednost před tím, co je
   * uložené v nastavení. Ručně zadané zůstává jen to, co hra neříká
   * (typicky cena, za kterou produkt prodáš).
   */
  function fromRecipe(r, units, live, sale) {
    const liveInputs = (live && live.inputs) || [];
    const inputs = (r.inputs || []).map((i, idx) => {
      const l = liveInputs.find(x => x.key === i.key) || liveInputs[idx] || {};
      return {
        key: i.key,
        label: i.label,
        of: i.of || i.label,
        unit: i.unit || '',
        perUnit: l.perUnit != null ? l.perUnit : i.perUnit,
        price: l.price != null ? l.price : i.price,
        fromGame: l.perUnit != null || l.price != null
      };
    });

    const out = r.output || {};
    const liveYield = live && live.metrics ? live.metrics.yieldPerUnit : null;
    const outputPerUnit = liveYield != null ? liveYield : out.perUnit;
    // výkupní cena z prodejní stránky produktu má přednost před uloženou
    const outputPrice = sale && sale.price != null ? sale.price : out.price;

    return {
      ...cycle({ units, inputs, outputPerUnit, outputPrice, hours: r.hours }),
      id: r.id,
      label: r.label,
      kind: r.kind,
      outputName: out.name,
      outputOf: out.of || out.name,
      outputUnit: out.unit || '',
      outputPerUnit,
      outputPrice,
      outputFromGame: liveYield != null,
      priceFromGame: !!(sale && sale.price != null),
      priceUnit: sale && sale.priceUnit ? sale.priceUnit : (out.unit || ''),
      stockQty: sale ? sale.qty : null,
      unitName: (r.unitForms || ['jednotka'])[0],
      unitAcc: r.unitAcc || (r.unitForms || ['jednotku'])[0],
      unitForms: r.unitForms || ['jednotka', 'jednotky', 'jednotek']
    };
  }

  /**
   * Kolik jednotek pokryjí zásoby. U víc surovin rozhoduje ta, které je
   * poměrově nejméně – ta je „úzké hrdlo“.
   * @param {Array} inputs [{ label, of, unit, stock, perUnit, price }]
   * @returns {{units:number, limiting:object|null, perUnit:Array}|null}
   */
  function unitsCovered(inputs) {
    const usable = (inputs || []).filter(i => num(i.perUnit) > 0 && i.stock != null);
    if (!usable.length) return null;

    const per = usable.map(i => ({ ...i, covers: Math.floor(num(i.stock) / num(i.perUnit)) }));
    const min = per.reduce((a, b) => (b.covers < a.covers ? b : a));
    return { units: min.covers, limiting: min, perUnit: per };
  }

  /**
   * Kolik surovin dokoupit, aby se pokrylo `units` jednotek (u všech surovin).
   * @returns {Array<{label, of, unit, need, missing, cost}>}
   */
  function restockAll(inputs, units) {
    return (inputs || []).map(i => {
      const need = num(units) * num(i.perUnit);
      const missing = Math.max(0, need - num(i.stock));
      return { ...i, need, missing, cost: missing * num(i.price) };
    });
  }

  /**
   * Na kolik plných dávek (naplnění celé budovy) vystačí zásoby.
   * @returns {{perBatch:Array, batches:number, hoursOfWork:number|null,
   *            missing:Array, costForNext:number}|null}
   */
  function batchesFromStock({ inputs, capacity, hours }) {
    const cap = num(capacity);
    const usable = (inputs || []).filter(i => num(i.perUnit) > 0 && i.stock != null);
    if (cap <= 0 || !usable.length) return null;

    const perBatch = usable.map(i => ({ ...i, needPerBatch: cap * num(i.perUnit) }));
    const batches = Math.min(...perBatch.map(i => Math.floor(num(i.stock) / i.needPerBatch)));

    const missing = perBatch.map(i => {
      const used = batches * i.needPerBatch;
      const leftover = num(i.stock) - used;
      const short = Math.max(0, i.needPerBatch - leftover);
      return { ...i, leftover, missing: short, cost: short * num(i.price) };
    });

    return {
      perBatch,
      batches,
      hoursOfWork: num(hours) ? batches * num(hours) : null,
      missing,
      costForNext: missing.reduce((s, i) => s + i.cost, 0)
    };
  }

  /**
   * Kolikrát ještě můžeš vyslat dopravní prostředek (loď, letadlo, kamion).
   * @returns {{trips, now, waves, loaded, leftover, missingForNext, cost}}
   */
  function dispatch({ stock, capacity, count, cost }) {
    const s = num(stock);
    const cap = num(capacity);
    if (cap <= 0) {
      return { trips: null, now: null, waves: null, loaded: 0, leftover: s, missingForNext: null, cost: null };
    }

    const trips = Math.floor(s / cap);
    const fleet = num(count);
    const loaded = trips * cap;
    const leftover = s - loaded;

    return {
      trips,
      now: fleet > 0 ? Math.min(trips, fleet) : trips,
      waves: fleet > 0 ? Math.ceil(trips / fleet) : (trips ? 1 : 0),
      loaded,
      leftover,
      missingForNext: cap - leftover,
      cost: trips * num(cost)
    };
  }

  /** Návratnost investice. */
  function payback(cost, gainPerHour) {
    const h = div(num(cost), num(gainPerHour));
    return { hours: h, days: h == null ? null : h / 24 };
  }

  /** Srovnání cyklů podle zisku za hodinu (nejlepší první). */
  function rank(cycles) {
    return cycles
      .filter(c => c && c.profitPerHour != null)
      .slice()
      .sort((a, b) => b.profitPerHour - a.profitPerHour);
  }

  /**
   * Náklad na JEDNU jednotku produktu (Kč/l, Kč/g). Recept říká spotřebu vstupů
   * na jednotku výroby a výnos z ní, takže:
   *   Σ(vstup.perUnit × vstup.price) ÷ output.perUnit
   * Příklad whisky: 8 kg pšenice × 2,50 Kč = 20 Kč na sud, ze sudu 30 l
   * → 0,67 Kč za litr.
   */
  function unitCost(recipe) {
    if (!recipe || !recipe.output || !(recipe.output.perUnit > 0)) return null;
    const vstupy = (recipe.inputs || []).reduce(
      (s, i) => s + (+i.perUnit || 0) * (+i.price || 0), 0);
    return vstupy / recipe.output.perUnit;
  }

  /**
   * Kolik a čeho spotřebuje `amount` jednotek produktu – rozpad po vstupech.
   * Z receptu se ví spotřeba na jednotku výroby a výnos z ní, takže:
   *   množství vstupu = amount ÷ output.perUnit × vstup.perUnit
   * Příklad: 2 412 l whisky = 80,4 sudů × 8 kg = 643 kg pšenice.
   */
  function inputsFor(recipe, amount) {
    if (!recipe || !(recipe.output || {}).perUnit || !(amount > 0)) return [];
    const davek = amount / recipe.output.perUnit;
    return (recipe.inputs || []).map(i => {
      const qty = davek * (+i.perUnit || 0);
      return {
        key: i.key,
        label: i.label,
        of: i.of,
        unit: i.unit,
        qty,
        price: +i.price || 0,
        cost: qty * (+i.price || 0)
      };
    });
  }

  /**
   * Ekonomika nákladu pro dopravu. `cargoId` je `data-id` z herního výběru
   * (whisky | beer | marijuana | meth) a páruje se na recept přes `saleSlug`.
   * `market` je cena, za kterou by se to dalo místo vožení prostě prodat – proti
   * ní se pozná, jestli se doprava vůbec vyplatí.
   */
  function cargoEconomics(cargoId, recipes) {
    const r = (recipes || []).find(x => x.saleSlug === cargoId);
    if (!r) return null;
    return {
      recipe: r.id,
      recipeObj: r,
      label: r.label,
      unit: r.output.unit,
      cost: unitCost(r),
      market: +r.output.price || null
    };
  }

  NS.econ = {
    cycle, fromRecipe, unitsCovered, restockAll, batchesFromStock,
    dispatch, payback, rank, unitCost, cargoEconomics, inputsFor
  };
})();
