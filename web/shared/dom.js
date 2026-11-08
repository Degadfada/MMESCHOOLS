// web/shared/dom.js — a tiny element builder and UI helpers (no framework).

/** h('div.card#id', {onclick, ...attrs}, ...children) */
export function h(tag, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function mount(target, ...kids) { target.replaceChildren(); append(target, kids); return target; }

let toastTimer;
export function toast(msg, { bad = false, ms = 2600 } = {}) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div.toast', { class: bad ? 'bad' : '' }, msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/** Show a modal; returns {close, el}. content may be a function receiving close. */
export function modal(title, content, { onClose } = {}) {
  const back = h('div.modal-back');
  const close = () => { back.remove(); if (onClose) onClose(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const box = h('div.modal', h('h2', title), typeof content === 'function' ? content(close) : content);
  back.appendChild(box);
  document.body.appendChild(back);
  const first = box.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, el: box };
}

export function confirmBox(title, text, okLabel = 'Yes') {
  return new Promise((resolve) => {
    const m = modal(title, (close) => h('div.stack',
      h('p', text),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button', { onclick: () => { close(); resolve(false); } }, 'Cancel'),
        // Resolve first: close() fires onClose, which would otherwise answer "no".
        h('button.primary', { onclick: () => { resolve(true); m.close(); } }, okLabel))
    ), { onClose: () => resolve(false) });
  });
}

export function field(label, input) { return h('div.field', h('label', label), input); }

export const fmtDate = (t) => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
