/* =============================================================================
 * ui.js – stavební prvky panelu
 *
 * Všechen text jde do DOM přes textContent (nikde innerHTML s uživatelskými
 * daty), takže název předmětu se nemůže stát HTML.
 * ===========================================================================*/

(() => {
  'use strict';
  const NS = globalThis.CMC || (globalThis.CMC = {});

  /** h('div', {class:'x', on:{click:fn}}, 'text', childEl) */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') e.textContent = v;
        else if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat(3)) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /**
   * Statová dlaždice: velké číslo s popiskem. Prázdný `sub` element vytvoří
   * (jen bez textu) – volající do něj může dopsat hodnotu později.
   */
  const tile = (label, value, sub) => h('div', { class: 'cmc-tile' },
    h('div', { class: 'cmc-tile-label', text: label }),
    h('div', { class: 'cmc-tile-value', text: value }),
    sub != null ? h('div', { class: 'cmc-tile-sub', text: sub || ' ' }) : null);

  /** Řádek popisek → hodnota. */
  const row = (label, value, cls) => h('div', { class: 'cmc-row' + (cls ? ' ' + cls : '') },
    h('span', { class: 'cmc-row-k', text: label }),
    h('span', { class: 'cmc-row-v', text: value }));

  /** Ukazatel průběhu (meter, ne graf) – doplňuje číselné %. */
  function meter(percent, { ready = false } = {}) {
    const p = Number.isFinite(+percent) ? Math.max(0, Math.min(100, +percent)) : null;
    return h('div', { class: 'cmc-meter' + (ready ? ' cmc-meter-ready' : ''), title: p == null ? 'neznámý průběh' : p + ' %' },
      h('div', { class: 'cmc-meter-fill', style: { width: (p == null ? 0 : p) + '%' } }));
  }

  /** Odznak se stavem – vždy s textem, nikdy jen barva. */
  const badge = (text, kind) => h('span', { class: 'cmc-badge' + (kind ? ' cmc-badge-' + kind : ''), text });

  const btn = (label, onClick, o = {}) => h('button', {
    class: 'cmc-btn' + (o.kind ? ' cmc-btn-' + o.kind : ''),
    type: 'button',
    disabled: o.disabled || null,
    title: o.title || null,
    on: { click: onClick }
  }, label);

  /** Číselné pole s popiskem; onInput dostane už převedené číslo. */
  function numField(label, value, onInput, o = {}) {
    const input = h('input', {
      type: 'number',
      class: 'cmc-input',
      value: value == null ? '' : value,
      step: o.step || 'any',
      min: o.min != null ? o.min : null,
      on: { input: ev => onInput(ev.target.value === '' ? null : +ev.target.value) }
    });
    return h('label', { class: 'cmc-field' },
      h('span', { class: 'cmc-field-label', text: label }),
      input,
      o.hint ? h('span', { class: 'cmc-hint', text: o.hint }) : null);
  }

  /** Textové pole; vrací {wrap, input} kvůli udržení focusu. */
  function textField(label, value, onInput, o = {}) {
    const input = h('input', {
      type: o.type || 'text',
      class: 'cmc-input',
      value: value == null ? '' : value,
      placeholder: o.placeholder || null,
      list: o.list || null,
      on: { input: ev => onInput(ev.target.value) }
    });
    const wrap = h('label', { class: 'cmc-field' },
      label ? h('span', { class: 'cmc-field-label', text: label }) : null,
      input);
    return { wrap, input };
  }

  /** Select z pole hodnot. */
  function selectField(label, value, options, onChange) {
    const sel = h('select', { class: 'cmc-input', on: { change: ev => onChange(ev.target.value) } },
      options.map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const txt = typeof o === 'string' ? o : o.label;
        return h('option', { value: val, selected: val === value || null, text: txt });
      }));
    return h('label', { class: 'cmc-field' },
      h('span', { class: 'cmc-field-label', text: label }), sel);
  }

  const section = (title, ...kids) => h('div', { class: 'cmc-section' },
    title ? h('div', { class: 'cmc-section-title', text: title }) : null, kids);

  const grid = (...kids) => h('div', { class: 'cmc-grid' }, kids);

  const note = text => h('div', { class: 'cmc-note', text });

  const errorBox = text => h('div', { class: 'cmc-error', text });

  /**
   * Dvoufázové potvrzení – žádné confirm(), které by zablokovalo stránku.
   * První klik přepne na "Opravdu?", druhý (do 4 s) provede akci.
   */
  function confirmBtn(label, confirmLabel, action, o = {}) {
    let armed = false, timer = null;
    const b = btn(label, async () => {
      if (!armed) {
        armed = true;
        b.textContent = confirmLabel;
        b.classList.add('cmc-btn-danger');
        timer = setTimeout(() => {
          armed = false; b.textContent = label; b.classList.remove('cmc-btn-danger');
        }, 4000);
        return;
      }
      clearTimeout(timer);
      await action();
    }, o);
    return b;
  }

  /** Uloží text jako soubor (CSV / JSON) – přes Blob, bez dalších oprávnění. */
  function download(filename, text, mime = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }));
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  NS.ui = {
    h, clear, tile, row, meter, badge, btn, numField, textField, selectField,
    section, grid, note, errorBox, confirmBtn, download
  };
})();
