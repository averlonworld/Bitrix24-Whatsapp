/* Client-side scripts for the three Bitrix24 frames. Plain ES2017, no build step. Data from the
   server or WhatsApp is only ever rendered through textContent; innerHTML is used solely for the
   constant icon strings in ICONS. */

export const COMMON_JS = String.raw`
var BOOT = window.__BOOT__ || {};
var app = document.getElementById('app');

/* ---------- icons (constant markup only) ---------- */
function S(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
var ICONS = {
  wa: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.2c-5 0-9 3.5-9 7.9 0 2.3 1.1 4.4 2.9 5.8L5 21.2l4.5-1.8c.8.2 1.6.3 2.5.3 5 0 9-3.5 9-7.9s-4-8.6-9-8.6z"/></svg>',
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  more: S('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  check: S('<path d="M20 6 9 17l-5-5"/>'),
  x: S('<path d="M18 6 6 18M6 6l12 12"/>'),
  refresh: S('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>'),
  pencil: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: S('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  logout: S('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
  pause: S('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  star: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  alert: S('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  info: S('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  inbox: S('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'),
  crm: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 9h3M15 13h3M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/>'),
  zap: S('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
  users: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  send: S('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
  chat: S('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/>'),
  phone: S('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  qr: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/>'),
  external: S('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  bill: S('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'),
  history: S('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>'),
  download: S('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  clip: S('<path d="m21.4 11-8.5 8.5a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>'),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  route: S('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>')
};
function icon(name, cls) { var s = document.createElement('span'); s.className = 'ico' + (cls ? ' ' + cls : ''); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[name] || ''; return s; }

/* ---------- DOM ---------- */
function h(tag, attrs, children) {
  var el = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  (children || []).forEach(function add(c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function fit() { try { if (window.BX24) BX24.fitWindow(); } catch (e) {} }
function bxReady(cb) { if (window.BX24 && BX24.init) BX24.init(cb); else cb(); }
function openApp() { try { BX24.openApplication(); } catch (e) { toast('Open WhatsApp from the left menu of your portal.', 'bad'); } }

/* ---------- API ---------- */
function api(method, path, body) {
  return fetch(path, {
    method: method,
    headers: { 'Content-Type': 'application/json', 'X-App-Session': BOOT.session },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401) throw new Error('Your session expired. Reload the page to continue.');
      if (!r.ok) throw new Error(j.message || j.error || ('Request failed (' + r.status + ')'));
      return j;
    });
  }, function () { throw new Error('Cannot reach the WhatsApp server. Check your connection and try again.'); });
}
function busy(btn, on) {
  if (!btn) return;
  if (on) { btn.disabled = true; btn.__label = Array.prototype.slice.call(btn.childNodes); clear(btn); btn.appendChild(h('span', { 'class': 'spin' })); }
  else { btn.disabled = false; if (btn.__label) { clear(btn); btn.__label.forEach(function (n) { btn.appendChild(n); }); } }
}

/* ---------- formatting ---------- */
/* ITU country codes: 1 and 7 are one digit, this list is two digits, everything else is three. */
var CC2 = ' 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 ';
function fmtPhone(p) {
  if (!p) return ''; p = String(p).replace(/\D/g, '');
  if (p.length < 8) return '+' + p;
  var n = p[0] === '1' || p[0] === '7' ? 1 : CC2.indexOf(' ' + p.slice(0, 2) + ' ') >= 0 ? 2 : 3;
  return '+' + p.slice(0, n) + ' ' + p.slice(n);
}
function relTime(sec) {
  if (!sec) return 'No activity yet';
  var d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 60) return 'Just now';
  if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  var days = Math.floor(d / 86400);
  return days === 1 ? 'Yesterday' : days + ' days ago';
}
var STATE = {
  connected: { t: 'ok', l: 'Online' }, qr: { t: 'warn', l: 'Waiting for QR scan' }, connecting: { t: 'warn', l: 'Connecting…' },
  disconnected: { t: 'bad', l: 'Disconnected' }, logged_out: { t: 'bad', l: 'Logged out on the phone' },
  'new': { t: 'idle', l: 'Not linked yet' }, offline: { t: 'bad', l: 'Offline' }
};
function st(s) { return STATE[s] || { t: 'idle', l: s }; }
function stateTag(s) { var x = st(s); return h('span', { 'class': 'st' }, [h('span', { 'class': 'dot ' + x.t }), h('span', { 'class': 'state-txt ' + x.t, text: x.l })]); }
function footer() {
  return h('div', { 'class': 'foot' }, ['WhatsApp connector for Bitrix24 · v' + (BOOT.appVersion || '') + ' · ',
    h('a', { href: '/legal/terms', target: '_blank', rel: 'noopener', text: 'Licence agreement' }), ' · ',
    h('a', { href: '/legal/privacy', target: '_blank', rel: 'noopener', text: 'Privacy policy' })]);
}

/* ---------- toasts ---------- */
var toasts = document.getElementById('toasts');
function toast(msg, kind) {
  var t = h('div', { 'class': 'toast' + (kind === 'bad' ? ' bad' : '') }, [icon(kind === 'bad' ? 'alert' : 'check', 'sm'), h('span', { text: msg })]);
  toasts.appendChild(t);
  setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250); }, kind === 'bad' ? 6000 : 3500);
}

/* ---------- dialog ---------- */
var modal = document.getElementById('modal'), modalBox = document.getElementById('modal-box');
var modalOpts = null;
function openModal(nodes, opts) {
  modalOpts = opts || {};
  clear(modalBox);
  modalBox.className = 'box' + (modalOpts.narrow ? ' narrow' : '');
  nodes.forEach(function (n) { if (n) modalBox.appendChild(n); });
  modal.classList.add('open');
  window.scrollTo(0, 0);
  try { BX24.scrollParentWindow(0); } catch (e) {}
  document.body.style.minHeight = (modalBox.offsetHeight + 120) + 'px';
  fit();
  var f = modalBox.querySelector('[autofocus]') || modalBox.querySelector('input,button.primary');
  if (f) setTimeout(function () { f.focus(); }, 30);
}
function closeModal() {
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  document.body.style.minHeight = '';
  var cb = modalOpts && modalOpts.onClose; modalOpts = null;
  if (cb) cb();
  fit();
}
function resizeModal() { document.body.style.minHeight = (modalBox.offsetHeight + 120) + 'px'; fit(); }
modal.addEventListener('mousedown', function (e) { if (e.target === modal && modalOpts && modalOpts.dismissable !== false) closeModal(); });
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var m = document.querySelector('.menu.open'); if (m) { m.classList.remove('open'); return; }
  if (modalOpts && modalOpts.dismissable !== false) closeModal();
});
function dlgHead(title, sub, kicker) {
  return h('div', { 'class': 'dlg-h' }, [
    h('div', { style: 'flex:1;min-width:0' }, [kicker ? h('div', { 'class': 'kicker', text: kicker }) : null, h('h2', { text: title }), sub ? h('p', { text: sub }) : null]),
    h('button', { 'class': 'btn ghost icon', 'aria-label': 'Close', onclick: closeModal }, [icon('x')])
  ]);
}
function confirmDialog(o) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(v) { if (done) return; done = true; resolve(v); closeModal(); }
    var ok = h('button', { 'class': 'btn ' + (o.danger ? 'danger solid' : 'primary'), text: o.ok || 'Confirm', onclick: function () { finish(true); } });
    openModal([
      dlgHead(o.title, null),
      h('div', { 'class': 'dlg-b', style: 'padding-top:8px;color:var(--text-2)', text: o.text }),
      h('div', { 'class': 'dlg-f' }, [h('button', { 'class': 'btn', text: 'Cancel', onclick: function () { finish(false); } }), ok])
    ], { narrow: true, onClose: function () { if (!done) { done = true; resolve(false); } } });
    setTimeout(function () { ok.focus(); }, 30);
  });
}

/* ---------- menus ---------- */
document.addEventListener('click', function (e) {
  document.querySelectorAll('.menu.open').forEach(function (m) { if (!m.parentNode.contains(e.target)) m.classList.remove('open'); });
});
function menu(items) {
  var list = h('div', { 'class': 'menu', role: 'menu' });
  var trigger = h('button', { 'class': 'btn ghost icon', 'aria-label': 'More actions', 'aria-haspopup': 'menu', onclick: function (e) {
    e.stopPropagation();
    var open = list.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach(function (m) { m.classList.remove('open'); });
    if (!open) { list.classList.add('open'); var b = list.querySelector('button'); if (b) b.focus(); }
  } }, [icon('more')]);
  items.forEach(function (it) {
    if (!it) return;
    if (it === '-') return list.appendChild(h('hr'));
    list.appendChild(h('button', { role: 'menuitem', 'class': it.danger ? 'danger' : '', onclick: function () { list.classList.remove('open'); it.run(); } }, [icon(it.icon, 'sm'), h('span', { text: it.label })]));
  });
  return h('div', { 'class': 'menu-wrap' }, [trigger, list]);
}
function switchCtl(o) {
  var input = h('input', { type: 'checkbox', checked: o.checked, disabled: o.disabled, onchange: function () { o.onchange(input.checked, input); } });
  return h('label', { 'class': 'switch' }, [input, h('span', { 'class': 'track' }), h('span', { 'class': 't' }, [h('b', { text: o.title }), o.text ? h('span', { text: o.text }) : null])]);
}
`;

export const ADMIN_JS = String.raw`
var ADMIN = !!BOOT.isAdmin;
var state = { numbers: [], lines: [], defaultNumberId: null, missingScopes: [], userId: null, selfLinkEnabled: true, loaded: false, error: null };
var SCOPE_NAMES = { im: 'Chat and notifications (im)', imconnector: 'External messenger connectors (imconnector)', imopenlines: 'Open Channels (imopenlines)',
  crm: 'CRM (crm)', placement: 'Application embedding (placement)', bizproc: 'Business Processes (bizproc)', messageservice: 'Messaging service (messageservice)' };

function load() {
  return Promise.all([api('GET', '/api/state'), api('GET', '/api/lines').catch(function () { return { lines: [] }; })])
    .then(function (r) {
      state.numbers = r[0].numbers; state.defaultNumberId = r[0].defaultNumberId; state.lines = r[1].lines || [];
      state.missingScopes = r[0].missingScopes || [];
      state.userId = r[0].userId || null; state.selfLinkEnabled = r[0].selfLinkEnabled !== false;
      state.billing = r[0].billing || { enabled: false };
      state.autoReplies = r[0].autoReplies || null;
      state.loaded = true; state.error = null; render();
    })
    .catch(function (e) { state.error = e.message; state.loaded = true; render(); });
}
function act(p, okMsg) {
  return p.then(function () { return load(); }).then(function () { if (okMsg) toast(okMsg); if (ADMIN) loadAudit(true); })
    .catch(function (e) { toast(e.message, 'bad'); return load(); });
}
function userIsBusy() {
  if (modal.classList.contains('open') || document.querySelector('.menu.open') || document.querySelector('.name-input')) return true;
  var saveAuto = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent === 'Save automatic replies'; })[0];
  if (saveAuto && !saveAuto.disabled) return true; // unsaved automatic-reply edits
  var a = document.activeElement;
  return !!(a && app.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
}
function lineName(id) { var l = state.lines.filter(function (x) { return x.id === id; })[0]; return l ? l.name : 'Open Line #' + id; }
function lineOwner(lineId, exceptId) { return state.numbers.filter(function (n) { return n.line_id === lineId && n.id !== exceptId; })[0] || null; }
function live(n) { return n.live_status || n.status; }
/* ---------- billing (Stripe, per WhatsApp number) ---------- */
function lic() { return (state.billing && state.billing.license) || { state: 'disabled' }; }
function openExternal(url) {
  var w = null; try { w = window.open(url, '_blank', 'noopener'); } catch (e) {}
  if (!w) openModal([dlgHead('Continue in a new tab', 'Your browser blocked the new tab. Open it here:'),
    h('div', { 'class': 'dlg-b' }, [h('a', { href: url, target: '_blank', rel: 'noopener', 'class': 'btn primary', text: 'Open secure payment page' })])], { narrow: true });
}
function billingGo(path, body, btn) {
  busy(btn, true);
  api('POST', path, body || {}).then(function (r) { if (r.url) openExternal(r.url); })
    .catch(function (e) { toast(e.message, 'bad'); }).then(function () { busy(btn, false); });
}
function fmtDate(sec) { try { return new Date(sec * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
function billingAlert() {
  var L = lic(), used = state.billing && state.billing.numbersUsed || 0;
  if (L.state === 'expired') return h('div', { 'class': 'alert bad', style: 'margin:0 0 14px' }, [icon('alert'), h('div', { 'class': 'grow' }, [h('b', { text: 'Your WhatsApp subscription has ended' }),
    'Sending is paused for all numbers. Incoming messages still arrive. ' + (ADMIN ? 'Subscribe to continue.' : 'Ask a Bitrix24 administrator to renew it.')]),
    ADMIN ? h('button', { 'class': 'btn primary sm', onclick: function (e) { billingGo('/api/billing/checkout', { quantity: Math.max(1, used) }, e.currentTarget); } }, [icon('bill', 'sm'), 'Subscribe']) : null]);
  if (L.state === 'past_due' && ADMIN) return h('div', { 'class': 'alert bad', style: 'margin:0 0 14px' }, [icon('alert'), h('div', { 'class': 'grow' }, [h('b', { text: 'The last payment failed' }),
    'WhatsApp keeps working while the payment is retried, but you cannot add numbers. Update your card to avoid interruption.']),
    h('button', { 'class': 'btn primary sm', onclick: function (e) { billingGo('/api/billing/portal', null, e.currentTarget); } }, [icon('bill', 'sm'), 'Update card'])]);
  if (L.state === 'trial' && ADMIN && L.trialDaysLeft <= 3) return h('div', { 'class': 'alert warn', style: 'margin:0 0 14px' }, [icon('bill'), h('div', { 'class': 'grow' }, [h('b', { text: 'Your free trial ends in ' + L.trialDaysLeft + (L.trialDaysLeft === 1 ? ' day' : ' days') }),
    'Subscribe now so sending does not pause.']),
    h('button', { 'class': 'btn primary sm', onclick: function (e) { billingGo('/api/billing/checkout', { quantity: Math.max(1, used) }, e.currentTarget); } }, ['Subscribe'])]);
  return null;
}
function billingCard() {
  var L = lic(), used = state.billing.numbersUsed || 0;
  var title, sub, actions = [];
  if (L.state === 'trial') {
    title = 'Free trial · ' + L.trialDaysLeft + (L.trialDaysLeft === 1 ? ' day' : ' days') + ' left';
    sub = 'Up to ' + L.maxNumbers + ' WhatsApp numbers during the trial (' + used + ' in use). After the trial you pay per linked number, monthly.';
    actions.push(h('button', { 'class': 'btn primary', onclick: function (e) { billingGo('/api/billing/checkout', { quantity: Math.max(1, used) }, e.currentTarget); } }, [icon('bill', 'sm'), 'Subscribe']));
  } else if (L.state === 'active' || L.state === 'past_due') {
    title = (L.state === 'active' ? 'Subscribed' : 'Payment failed') + ' · ' + L.paidNumbers + (L.paidNumbers === 1 ? ' number' : ' numbers');
    sub = used + ' of ' + L.paidNumbers + ' in use' + (L.periodEnd ? ' · next payment ' + fmtDate(L.periodEnd) : '') + '. Change the number of WhatsApp numbers at any time; the difference is prorated.';
    var qty = h('input', { type: 'number', min: String(Math.max(1, used)), max: '50', value: String(L.paidNumbers || 1), style: 'width:90px', 'aria-label': 'Numbers paid for' });
    var save = h('button', { 'class': 'btn', text: 'Update', onclick: function () {
      var q = Number(qty.value);
      if (q === L.paidNumbers) return;
      confirmDialog({ title: 'Pay for ' + q + ' WhatsApp numbers?', text: 'Your subscription changes to ' + q + ' numbers. Stripe adds or credits the prorated difference on the next invoice.', ok: 'Change plan' })
        .then(function (yes) { if (yes) act(api('POST', '/api/billing/seats', { quantity: q }), 'Plan updated to ' + q + ' numbers.'); });
    } });
    actions.push(h('div', { 'class': 'row' }, [qty, save]));
    actions.push(h('button', { 'class': 'btn ghost', onclick: function (e) { billingGo('/api/billing/portal', null, e.currentTarget); } }, [icon('external', 'sm'), 'Invoices & card']));
  } else if (L.state === 'expired') {
    title = 'Subscription ended';
    sub = 'Sending is paused. Subscribe to continue with ' + Math.max(1, used) + (used === 1 ? ' number.' : ' numbers.');
    actions.push(h('button', { 'class': 'btn primary', onclick: function (e) { billingGo('/api/billing/checkout', { quantity: Math.max(1, used) }, e.currentTarget); } }, [icon('bill', 'sm'), 'Subscribe']));
    if (state.billing.hasCustomer) actions.push(h('button', { 'class': 'btn ghost', onclick: function (e) { billingGo('/api/billing/portal', null, e.currentTarget); } }, [icon('external', 'sm'), 'Invoices']));
  } else return null;
  return h('div', { 'class': 'card pad', style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' }, [
    h('div', { 'class': 'fi', style: 'width:40px;height:40px;border-radius:10px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center' }, [icon('bill')]),
    h('div', { 'class': 'grow', style: 'min-width:220px' }, [h('b', { text: title }), h('div', { 'class': 'muted', style: 'font-size:13px', text: sub })]),
    h('div', { 'class': 'row' }, actions)
  ]);
}

/* ---------- activity log (administrators) ---------- */
var audit = { category: '', entries: [], next: null, loaded: false, loading: false };
function loadAudit(reset) {
  if (!ADMIN || audit.loading) return Promise.resolve();
  audit.loading = true;
  var q = '/api/audit?limit=30' + (audit.category ? '&category=' + audit.category : '') + (!reset && audit.next ? '&before=' + audit.next : '');
  return api('GET', q).then(function (r) {
    audit.entries = reset ? r.entries : audit.entries.concat(r.entries);
    audit.next = r.entries.length === 30 ? r.next : null;
    audit.loaded = true; audit.loading = false;
    var box = document.getElementById('audit-box'); if (box) fillAudit(box);
  }).catch(function (e) { audit.loading = false; toast(e.message, 'bad'); });
}
var ACTOR_ICON = { user: 'user', system: 'wa', bitrix: 'crm', stripe: 'bill' };
function auditWho(e) { return e.actorName || (e.actorType === 'user' ? 'User #' + (e.actorUserId || '?') : e.actorType === 'stripe' ? 'Stripe' : e.actorType === 'bitrix' ? 'Bitrix24' : 'System'); }
function fillAudit(box) {
  clear(box);
  if (!audit.loaded) { box.appendChild(h('div', { 'class': 'sk', style: 'height:120px' })); return fit(); }
  if (!audit.entries.length) { box.appendChild(h('p', { 'class': 'muted', style: 'margin:8px 0', text: 'Nothing recorded yet. Changes to numbers, settings and billing, and WhatsApp connection events, appear here.' })); return fit(); }
  audit.entries.forEach(function (e) {
    var when = new Date(e.at * 1000);
    box.appendChild(h('div', { 'class': 'step', style: 'padding:10px 0;align-items:flex-start' }, [
      h('div', { 'class': 'mark', style: 'border:0;background:var(--sunken);color:var(--text-2)' }, [icon(ACTOR_ICON[e.actorType] || 'info', 'sm')]),
      h('div', { 'class': 'txt' }, [
        h('b', { style: 'font-weight:500;text-decoration:none;color:var(--text)', text: e.text }),
        h('span', { title: when.toLocaleString() }, [auditWho(e) + ' · ' + relTime(e.at) + ' · ' + when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (e.ip ? ' · IP ' + e.ip : '')])
      ])
    ]));
  });
  if (audit.next) box.appendChild(h('div', { style: 'padding-top:12px' }, [h('button', { 'class': 'btn sm', text: 'Show older', onclick: function (ev) { busy(ev.currentTarget, true); loadAudit(false); } })]));
  fit();
}
function exportAudit(btn) {
  busy(btn, true);
  fetch('/api/audit.csv' + (audit.category ? '?category=' + audit.category : ''), { headers: { 'X-App-Session': BOOT.session } })
    .then(function (r) { if (!r.ok) throw new Error('Export failed (' + r.status + ')'); return r.blob(); })
    .then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = 'whatsapp-activity-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Exported the latest 500 entries.');
    }).catch(function (e) { toast(e.message, 'bad'); }).then(function () { busy(btn, false); });
}
function activityCard() {
  var box = h('div', { id: 'audit-box' });
  var cats = [['', 'All'], ['numbers', 'Numbers'], ['connection', 'Connection'], ['settings', 'Settings'], ['billing', 'Billing']];
  var tabs = h('div', { 'class': 'tabs', role: 'tablist', style: 'margin:0' }, cats.map(function (c) {
    return h('button', { 'class': audit.category === c[0] ? 'on' : '', text: c[1], onclick: function () {
      audit.category = c[0]; audit.loaded = false; audit.next = null;
      Array.prototype.forEach.call(tabs.children, function (b) { b.className = b.textContent === c[1] ? 'on' : ''; });
      fillAudit(box); loadAudit(true);
    } });
  }));
  fillAudit(box);
  if (!audit.loaded) loadAudit(true);
  return h('div', { 'class': 'card pad' }, [
    h('div', { 'class': 'row', style: 'justify-content:space-between;margin-bottom:8px' }, [tabs,
      h('div', { 'class': 'row' }, [
        h('button', { 'class': 'btn ghost sm', title: 'Refresh', onclick: function () { loadAudit(true); } }, [icon('refresh', 'sm'), 'Refresh']),
        h('button', { 'class': 'btn sm', onclick: function (ev) { exportAudit(ev.currentTarget); } }, [icon('download', 'sm'), 'Export CSV'])])]),
    h('p', { 'class': 'help', style: 'margin:0 0 4px', text: 'Who linked, removed or changed numbers and settings, and what WhatsApp, Bitrix24 and Stripe did. Kept for 12 months. Message content is never recorded.' }),
    box
  ]);
}

/* ---------- automatic replies (Open Line messages sent to customers) ---------- */
function autoRepliesCard() {
  var a = JSON.parse(JSON.stringify(state.autoReplies));
  var rows = [
    { key: 'welcome', title: 'Welcome message', text: 'Sent when a customer starts a new conversation.' },
    { key: 'away', title: 'Away message', text: 'Sent if no one in your team answers in time.' },
    { key: 'closing', title: 'Closing message', text: 'Sent when the conversation is closed.' },
    { key: 'rating', title: 'Ask for a rating', text: 'Bitrix24 asks the customer to rate the conversation after it closes.' }
  ];
  var dirty = false;
  var save = h('button', { 'class': 'btn primary', text: 'Save automatic replies', disabled: true });
  function changed() { dirty = true; save.disabled = false; }
  var list = h('div', { 'class': 'toggles', style: 'gap:18px' }, rows.map(function (r) {
    var body = h('div', { style: 'margin:8px 0 0 50px' + (a[r.key].on && r.key !== 'rating' ? '' : ';display:none') });
    if (r.key !== 'rating') {
      var ta = h('textarea', { maxlength: '1000', 'aria-label': r.title, style: 'min-height:64px', oninput: function () { a[r.key].text = ta.value; changed(); } });
      ta.value = a[r.key].text;
      body.appendChild(ta);
      if (r.key === 'away') {
        var sel = h('select', { style: 'width:auto;margin-top:8px', 'aria-label': 'Wait before the away message', onchange: function () { a.away.minutes = Number(sel.value); changed(); } },
          [1, 5, 15, 30, 60].map(function (m) { var o = h('option', { value: String(m), text: 'after ' + m + (m === 1 ? ' minute' : ' minutes') + ' without an answer' }); if (m === a.away.minutes) o.selected = true; return o; }));
        body.appendChild(sel);
      }
    }
    return h('div', {}, [switchCtl({ title: r.title, text: r.text, checked: a[r.key].on, onchange: function (v) {
      a[r.key].on = v; if (r.key !== 'rating') body.style.display = v ? '' : 'none'; changed(); fit();
    } }), body]);
  }));
  save.addEventListener('click', function () {
    busy(save, true);
    api('PUT', '/api/auto-replies', a).then(function (r) {
      state.autoReplies = r.autoReplies; dirty = false;
      var n = r.applied.length;
      if (r.failed.length) toast('Saved. Applied to ' + n + ' Open Line' + (n === 1 ? '' : 's') + '; ' + r.failed.length + ' could not be updated (' + r.failed[0].error + ').', 'bad');
      else toast(n ? 'Saved and applied to ' + n + ' WhatsApp Open Line' + (n === 1 ? '' : 's') + '.' : 'Saved. It applies as soon as a WhatsApp number uses an Open Line.');
      busy(save, false); save.disabled = true;
    }).catch(function (e) { busy(save, false); toast(e.message, 'bad'); });
  });
  var allOff = !rows.some(function (r) { return a[r.key].on; });
  return h('div', { 'class': 'card pad' }, [
    h('p', { style: 'margin:0 0 16px;color:var(--text-2)', text: allOff
      ? 'Off: customers only receive messages your team writes. Switch on the automatic messages you want and word them your way.'
      : 'Customers receive the automatic messages switched on below, on WhatsApp.' }),
    list,
    h('div', { 'class': 'row', style: 'margin-top:18px;justify-content:space-between' }, [
      h('span', { 'class': 'help', style: 'margin:0;max-width:560px', text: 'Applies to every Open Line your WhatsApp numbers use. If an Open Line also serves other channels, they get the same messages.' }),
      save
    ])
  ]);
}

/* Sales team mode: a number may belong to one employee (their own WhatsApp). */
function mine(n) { return n.owner_user_id != null && n.owner_user_id === state.userId; }
function canManage(n) { return ADMIN || mine(n); }
function myNumber() { return state.numbers.filter(mine)[0] || null; }
function ownerLabel(n) { return mine(n) ? 'You' : (n.owner_name || 'Team member'); }
function personalLine(n) { return api('POST', '/api/numbers/' + n.id + '/personal-line'); }
function setupPersonalLine(n) {
  return act(personalLine(n).then(function (r) { if (r.line && r.line.name) state.lines.push(r.line); }),
    'Done. Customer replies to ' + (mine(n) ? 'your WhatsApp' : n.label) + ' now arrive in a personal Open Line.');
}
function startPersonal() {
  api('POST', '/api/numbers', { personal: true })
    .then(function (r) { load(); scanStep(r.number, { total: 0, at: 0 }); })
    .catch(function (e) { toast(e.message, 'bad'); });
}

/* ---------- actions ---------- */
function reconnect(n) {
  if (!n.phone || live(n) === 'logged_out') return scanStep(n, null);
  act(api('POST', '/api/numbers/' + n.id + '/connect'), 'Reconnecting ' + n.label + '…');
}
function pause(n) { act(api('POST', '/api/numbers/' + n.id + '/disconnect'), n.label + ' paused. Messages will not sync until you reconnect.'); }
function logout(n) {
  confirmDialog({ title: 'Log out ' + fmtPhone(n.phone) + '?', text: 'This unlinks the device from WhatsApp. To use this number again you will need to scan a new QR code.', ok: 'Log out', danger: true })
    .then(function (yes) { if (yes) act(api('POST', '/api/numbers/' + n.id + '/logout'), 'Logged out. Scan a QR code to link again.'); });
}
function remove(n) {
  confirmDialog({ title: 'Delete "' + n.label + '"?', text: 'The number is unlinked from WhatsApp and removed from this app. Existing chats and CRM history stay in Bitrix24.', ok: 'Delete number', danger: true })
    .then(function (yes) { if (yes) act(api('DELETE', '/api/numbers/' + n.id), '"' + n.label + '" deleted.'); });
}
function setLine(n, lineId) {
  var owner = lineId ? lineOwner(lineId, n.id) : null;
  var go = function () { return act(api('POST', '/api/numbers/' + n.id + '/line', { lineId: lineId }), lineId ? 'Chats for ' + n.label + ' now arrive in "' + lineName(lineId) + '".' : n.label + ' is no longer routed to an Open Line.'); };
  if (!owner) return go();
  confirmDialog({ title: 'Move "' + lineName(lineId) + '"?', text: 'This Open Line currently receives chats from "' + owner.label + '". An Open Line can serve one number, so ' + owner.label + ' will stop routing chats until you pick another line for it.', ok: 'Move Open Line' })
    .then(function (yes) { if (yes) go(); else render(); });
}
function rename(n, nameEl) {
  var input = h('input', { 'class': 'name-input', type: 'text', value: n.label, maxlength: '60', 'aria-label': 'Number name' });
  var done = false;
  function save(commit) {
    if (done) return; done = true;
    var v = input.value.trim();
    if (!commit || !v || v === n.label) return render();
    act(api('POST', '/api/numbers/' + n.id + '/label', { label: v }), 'Renamed to "' + v + '".');
  }
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(true); if (e.key === 'Escape') { e.stopPropagation(); save(false); } });
  input.addEventListener('blur', function () { save(true); });
  nameEl.parentNode.replaceChild(input, nameEl);
  input.focus(); input.select();
}

/* ---------- wizard: name → scan → route ---------- */
function stepper(total, at) {
  if (!total || total < 2) return null;
  var s = h('div', { 'class': 'stepper' });
  for (var i = 1; i <= total; i++) s.appendChild(h('div', { 'class': i <= at ? 'on' : '' }));
  return s;
}
function startAdd() {
  var input = h('input', { type: 'text', placeholder: 'e.g. Sales, Support, Main office', maxlength: '60', autofocus: true, 'aria-label': 'Number name' });
  var err = h('div', { 'class': 'help warn' });
  var next = h('button', { 'class': 'btn primary', text: 'Continue', onclick: submit });
  function submit() {
    var label = input.value.trim();
    if (!label) { err.textContent = 'Give the number a name so your team can recognise it.'; input.focus(); return; }
    busy(next, true);
    api('POST', '/api/numbers', { label: label, personal: own.checked })
      .then(function (r) { load(); scanStep(r.number, own.checked ? { total: 2, at: 2 } : { total: 3, at: 2 }); })
      .catch(function (e) { busy(next, false); err.textContent = e.message; });
  }
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  var own = h('input', { type: 'checkbox' });
  var ownRow = h('label', { 'class': 'switch', style: 'margin-top:16px' }, [own, h('span', { 'class': 'track' }),
    h('span', { 'class': 't' }, [h('b', { text: 'This is my own WhatsApp' }), h('span', { text: 'Only you can use it in CRM, and replies come to a personal Open Line.' })])]);
  var chips = h('div', { 'class': 'chips' }, ['Sales', 'Support', 'Marketing', 'Main office'].map(function (c) {
    return h('button', { type: 'button', text: c, onclick: function () { input.value = c; input.focus(); err.textContent = ''; } });
  }));
  openModal([
    stepper(3, 1),
    dlgHead('Name this number', 'Your team sees this name in Bitrix24. Customers never do.', 'Step 1 of 3'),
    h('div', { 'class': 'dlg-b' }, [h('div', { 'class': 'field' }, [input, err]), chips, ownRow]),
    h('div', { 'class': 'dlg-f' }, [h('button', { 'class': 'btn ghost', text: 'Cancel', onclick: closeModal }), next])
  ]);
}

function scanStep(n, ctx) {
  ctx = ctx || { total: n.line_id ? 0 : 2, at: 1 };
  var stop = false, timer = null, linked = false;
  var qrBox = h('div', { 'class': 'qr' }, [h('div', { 'class': 'sk', style: 'width:236px;height:236px' })]);
  var statusLine = h('div', { 'class': 'qr-status' }, [h('span', { 'class': 'spin', style: 'width:14px;height:14px;border-width:2px' }), h('span', { text: 'Preparing a secure QR code…' })]);
  function setStatus(dotTone, text) { clear(statusLine); statusLine.appendChild(h('span', { 'class': 'dot ' + dotTone })); statusLine.appendChild(h('span', { text: text })); }
  function veil(nodes) { var v = h('div', { 'class': 'veil' }, nodes); var old = qrBox.querySelector('.veil'); if (old) qrBox.removeChild(old); qrBox.appendChild(v); }

  var qrPane = h('div', { 'class': 'pair' }, [
    h('ol', { 'class': 'howto' }, [
      h('li', {}, [h('span', {}, ['Open ', h('b', { text: 'WhatsApp' }), ' on the phone you want to link'])]),
      h('li', {}, [h('span', {}, ['Tap ', h('b', { text: 'Menu ⋮' }), ' (Android) or ', h('b', { text: 'Settings' }), ' (iPhone), then ', h('b', { text: 'Linked devices' })])]),
      h('li', {}, [h('span', {}, ['Tap ', h('b', { text: 'Link a device' }), ' and point the phone at this code'])]),
      h('li', {}, [h('span', { text: 'Keep the phone connected to the internet. Chats sync automatically.' })])
    ]),
    h('div', {}, [qrBox, statusLine])
  ]);

  var phoneInput = h('input', { type: 'tel', placeholder: 'Phone with country code, e.g. 919876543210', 'aria-label': 'Phone number' });
  var codeOut = h('div', {});
  var getCode = h('button', { 'class': 'btn primary', text: 'Get code', onclick: function () {
    busy(getCode, true);
    api('POST', '/api/numbers/' + n.id + '/pairing-code', { phone: phoneInput.value }).then(function (r) {
      clear(codeOut);
      codeOut.appendChild(h('div', { 'class': 'code', text: r.code }));
      codeOut.appendChild(h('div', { 'class': 'help', text: 'On the phone: WhatsApp → Linked devices → Link a device → Link with phone number instead, then type this code.' }));
      resizeModal();
    }).catch(function (e) { clear(codeOut); codeOut.appendChild(h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow', text: e.message })])); })
      .then(function () { busy(getCode, false); });
  } });
  var phonePane = h('div', { style: 'display:none' }, [
    h('p', { style: 'margin:0 0 12px;color:var(--text-2)', text: 'No camera handy? Link with an 8-character code instead.' }),
    h('div', { 'class': 'row' }, [h('div', { 'class': 'grow' }, [phoneInput]), getCode]),
    codeOut
  ]);
  var tQr = h('button', { 'class': 'on', text: 'QR code', onclick: function () { tab(true); } });
  var tPh = h('button', { text: 'Phone number', onclick: function () { tab(false); } });
  function tab(qr) { tQr.className = qr ? 'on' : ''; tPh.className = qr ? '' : 'on'; qrPane.style.display = qr ? '' : 'none'; phonePane.style.display = qr ? 'none' : ''; resizeModal(); }

  function onLinked(phone) {
    linked = true; stop = true;
    veil([h('div', { 'class': 'badge-ok' }, [icon('check')]), h('b', { text: 'Linked' }), h('span', { text: fmtPhone(phone) })]);
    setStatus('ok', 'Connected to WhatsApp');
    n.phone = phone;
    load().then(function () {
      var fresh = state.numbers.filter(function (x) { return x.id === n.id; })[0] || n;
      setTimeout(function () {
        if (fresh.owner_user_id && !fresh.line_id) {
          setStatus('warn', 'Creating your personal Open Line…');
          personalLine(fresh).then(function () {
            closeModal(); load();
            toast('All set! Customer replies to ' + (mine(fresh) ? 'your WhatsApp' : fresh.label) + ' now arrive in a personal Open Line.');
          }).catch(function (e) {
            if (ADMIN) return routeStep(fresh, { total: ctx.total, at: ctx.total || 0, fromWizard: true });
            closeModal(); load(); toast(e.message, 'bad');
          });
        } else if (!fresh.line_id && ADMIN) routeStep(fresh, { total: ctx.total, at: ctx.total || 0, fromWizard: true });
        else { closeModal(); toast(fresh.label + ' is connected.' + (fresh.line_id ? ' Chats arrive in "' + lineName(fresh.line_id) + '".' : '')); }
      }, 1100);
    });
  }
  function poll() {
    if (stop) return;
    api('GET', '/api/numbers/' + n.id + '/qr').then(function (r) {
      if (stop) return;
      if (r.status === 'connected') return onLinked(r.phone);
      if (r.qr) {
        var img = qrBox.querySelector('img');
        if (!img) { clear(qrBox); img = h('img', { alt: 'WhatsApp QR code' }); qrBox.appendChild(img); }
        if (img.getAttribute('src') !== r.qr) img.setAttribute('src', r.qr);
        var v = qrBox.querySelector('.veil'); if (v) qrBox.removeChild(v);
        setStatus('warn', 'Waiting for you to scan… the code refreshes automatically');
      } else if (r.status === 'connecting') {
        veil([h('span', { 'class': 'spin', style: 'width:28px;height:28px;border-width:3px;color:var(--brand)' }), h('b', { text: 'Scanned! Finishing up…' })]);
        setStatus('warn', 'Connecting to WhatsApp…');
      }
      if (r.status === 'disconnected' || r.status === 'logged_out') {
        veil([icon('refresh', 'lg'), h('b', { text: 'QR code expired' }), h('span', { text: r.error || 'For your security the code stops after a few minutes.' }),
          h('button', { 'class': 'btn primary sm', text: 'Get a new code', onclick: start })]);
        setStatus('bad', 'Not linked');
        return;
      }
      timer = setTimeout(poll, 2000);
    }).catch(function (e) { setStatus('bad', e.message); timer = setTimeout(poll, 4000); });
  }
  function start() {
    stop = false;
    clear(qrBox); qrBox.appendChild(h('div', { 'class': 'sk', style: 'width:236px;height:236px' }));
    api('POST', '/api/numbers/' + n.id + '/connect').then(poll).catch(function (e) { setStatus('bad', e.message); });
  }
  openModal([
    stepper(ctx.total, ctx.at),
    dlgHead(mine(n) || !ADMIN ? 'Link your WhatsApp' : 'Link "' + n.label + '" to WhatsApp', null, ctx.total ? 'Step ' + ctx.at + ' of ' + ctx.total : 'Link device'),
    h('div', { 'class': 'dlg-b' }, [h('div', { 'class': 'tabs', role: 'tablist' }, [tQr, tPh]), qrPane, phonePane]),
    h('div', { 'class': 'dlg-f' }, [h('span', { 'class': 'grow muted', style: 'font-size:12px;align-self:center', text: 'Your messages stay end-to-end encrypted.' }),
      h('button', { 'class': 'btn', text: 'Do this later', onclick: closeModal })])
  ], { onClose: function () { stop = true; if (timer) clearTimeout(timer); if (!linked) load(); } });
  start();
}

function routeStep(n, ctx) {
  ctx = ctx || {};
  var free = state.lines.filter(function (l) { return !lineOwner(l.id, n.id); });
  var choice = ctx.create || !free.length ? 'new' : String(free[0].id);
  var newName = h('input', { type: 'text', value: 'WhatsApp · ' + n.label, maxlength: '80', 'aria-label': 'New Open Line name', onfocus: function () { pick('new'); } });
  var err = h('div', {});
  var opts = h('div', { 'class': 'options', role: 'radiogroup' });
  var rows = [];
  function pick(v) { choice = v; rows.forEach(function (r) { var on = r.v === choice; r.el.classList.toggle('on', on); r.input.checked = on; }); }
  function option(v, title, sub, extra, recommended) {
    var input = h('input', { type: 'radio', name: 'route', value: v });
    var el = h('label', { 'class': 'opt', onclick: function () { pick(v); } }, [input, h('div', { 'class': 't' }, [
      h('b', {}, [title, recommended ? h('span', { 'class': 'chip ok', style: 'margin-left:8px', text: 'Recommended' }) : null]),
      sub ? h('span', { text: sub }) : null, extra || null])]);
    rows.push({ v: v, el: el, input: input });
    opts.appendChild(el);
  }
  option('new', 'Create a new Open Line', 'Set up automatically. You can change queue and working hours later in Contact Center.', newName, !free.length);
  state.lines.forEach(function (l) {
    var owner = lineOwner(l.id, n.id);
    option(String(l.id), l.name, owner ? 'Now used by "' + owner.label + '". It will move to this number.' : 'Available', null, false);
  });
  pick(choice);
  var finish = h('button', { 'class': 'btn primary', text: ctx.fromWizard ? 'Finish setup' : 'Save', onclick: function () {
    busy(finish, true); clear(err);
    var p = choice === 'new'
      ? api('POST', '/api/lines', { name: newName.value.trim() || ('WhatsApp · ' + n.label) }).then(function (r) { state.lines.push(r.line); return r.line.id; })
      : Promise.resolve(Number(choice));
    p.then(function (lineId) {
      return api('POST', '/api/numbers/' + n.id + '/line', { lineId: lineId }).then(function () { return lineId; });
    }).then(function (lineId) {
      closeModal();
      toast(ctx.fromWizard ? 'All set! WhatsApp chats for ' + n.label + ' now arrive in "' + lineName(lineId) + '".' : 'Saved. Chats arrive in "' + lineName(lineId) + '".');
      load();
    }).catch(function (e) {
      busy(finish, false);
      err.appendChild(h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow', text: e.message })]));
      resizeModal();
    });
  } });
  openModal([
    stepper(ctx.total, ctx.at),
    dlgHead('Where should chats go?', 'Pick the Contact Center Open Line where your team will answer WhatsApp messages for "' + n.label + '".',
      ctx.total ? 'Step ' + ctx.at + ' of ' + ctx.total : 'Open Line'),
    h('div', { 'class': 'dlg-b' }, [opts, err]),
    h('div', { 'class': 'dlg-f' }, [h('button', { 'class': 'btn ghost', text: ctx.fromWizard ? 'Skip for now' : 'Cancel', onclick: closeModal }), finish])
  ], { onClose: function () { render(); } });
}

/* ---------- rendering ---------- */
function header() {
  var online = state.numbers.filter(function (n) { return live(n) === 'connected'; }).length;
  var total = state.numbers.length;
  return h('div', { 'class': 'top' }, [
    h('div', { 'class': 'logo' }, [icon('wa')]),
    h('div', { 'class': 'titles' }, [h('h1', { text: 'WhatsApp' }), h('p', { text: 'Your WhatsApp numbers, connected to Contact Center and CRM.' })]),
    total ? h('span', { 'class': 'summary' }, [h('span', { 'class': 'dot ' + (online === total ? 'ok' : online ? 'warn' : 'bad') }),
      online + ' of ' + total + (total === 1 ? ' number' : ' numbers') + ' online']) : null,
    total && ADMIN ? h('button', { 'class': 'btn primary', onclick: startAdd }, [icon('plus', 'sm'), 'Add number']) : null
  ]);
}

function guide() {
  if (!ADMIN) return null;
  var linked = state.numbers.filter(function (n) { return n.phone; });
  var unrouted = linked.filter(function (n) { return !n.line_id; })[0];
  var steps = [
    { done: linked.length > 0, title: 'Link a WhatsApp number', text: 'Scan a QR code with the phone, just like WhatsApp Web.',
      btn: linked.length ? null : h('button', { 'class': 'btn primary sm', text: 'Link number', onclick: function () { var n = state.numbers.filter(function (x) { return !x.phone; })[0]; n ? scanStep(n) : startAdd(); } }) },
    { done: linked.length > 0 && !unrouted, title: 'Send chats to an Open Line', text: 'Choose where your team answers WhatsApp messages in Contact Center.',
      btn: linked.length && unrouted ? h('button', { 'class': 'btn primary sm', text: 'Choose Open Line', onclick: function () { routeStep(unrouted); } }) : null },
    { done: state.numbers.some(function (n) { return n.stats && (n.stats.received > 0 || n.stats.chats > 0); }), title: 'Receive your first message',
      text: linked.length ? 'From another phone, send "Hi" to ' + fmtPhone(linked[0].phone) + '. It appears in Contact Center within seconds.' : 'Once linked, send a test message from another phone.' }
  ];
  var done = steps.filter(function (s) { return s.done; }).length;
  if (done === steps.length) return null;
  return h('div', { 'class': 'card guide' }, [
    h('div', { 'class': 'guide-h' }, [h('h2', { text: 'Finish setting up' }), h('span', { 'class': 'muted', style: 'font-size:13px', text: done + ' of ' + steps.length + ' done' }),
      h('div', { 'class': 'progress' }, [h('i', { style: 'width:' + Math.round(done / steps.length * 100) + '%' })])]),
    steps.map(function (s, i) {
      return h('div', { 'class': 'step' + (s.done ? ' done' : '') }, [
        h('div', { 'class': 'mark' }, [s.done ? icon('check', 'sm') : String(i + 1)]),
        h('div', { 'class': 'txt' }, [h('b', { text: s.title }), h('span', { text: s.text })]),
        s.done ? null : s.btn
      ]);
    })
  ]);
}

function problem(n) {
  var el = problemAlert(n);
  if (el && !canManage(n)) Array.prototype.slice.call(el.querySelectorAll('button')).forEach(function (b) { b.parentNode.removeChild(b); });
  return el;
}
function problemAlert(n) {
  var s = live(n);
  var detail = n.last_error ? ' (' + n.last_error + ')' : '';
  if (s === 'new') return h('div', { 'class': 'alert info' }, [icon('qr'), h('div', { 'class': 'grow' }, [h('b', { text: 'Not linked yet' }), 'Scan a QR code with WhatsApp on the phone to start receiving chats.']),
    h('button', { 'class': 'btn primary sm', text: 'Scan QR code', onclick: function () { scanStep(n); } })]);
  if (s === 'qr') return h('div', { 'class': 'alert warn' }, [icon('qr'), h('div', { 'class': 'grow' }, [h('b', { text: 'Waiting for the QR scan' }), 'The link is not finished yet.']),
    h('button', { 'class': 'btn sm', text: 'Show QR code', onclick: function () { scanStep(n); } })]);
  if (s === 'connecting') return h('div', { 'class': 'alert warn' }, [h('span', { 'class': 'spin', style: 'width:16px;height:16px;border-width:2px' }), h('div', { 'class': 'grow', text: 'Connecting to WhatsApp…' })]);
  if (s === 'logged_out') return h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow' }, [h('b', { text: 'Logged out on the phone' }), 'This device was removed from WhatsApp. Scan a new QR code to continue.']),
    h('button', { 'class': 'btn primary sm', text: 'Scan QR code', onclick: function () { scanStep(n); } })]);
  if (s === 'disconnected' || s === 'offline') return h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow' }, [h('b', { text: 'Disconnected' }), 'Messages are not syncing right now' + detail + '.']),
    h('button', { 'class': 'btn primary sm', onclick: function () { reconnect(n); } }, [icon('refresh', 'sm'), 'Reconnect'])]);
  if (s === 'connected' && !n.line_id && n.owner_user_id) return h('div', { 'class': 'alert warn' }, [icon('route'), h('div', { 'class': 'grow' }, [h('b', { text: 'Replies have nowhere to go yet' }), 'Create a personal Open Line so customer replies reach ' + (mine(n) ? 'you' : ownerLabel(n)) + ' in Bitrix24.']),
    h('button', { 'class': 'btn primary sm', text: 'Create personal Open Line', onclick: function () { setupPersonalLine(n); } })]);
  if (s === 'connected' && !n.line_id) return h('div', { 'class': 'alert warn' }, [icon('route'), h('div', { 'class': 'grow' }, [h('b', { text: 'Choose where chats go' }), 'Incoming messages wait (up to 24 h) until this number is connected to an Open Line.']),
    ADMIN ? h('button', { 'class': 'btn primary sm', text: 'Choose Open Line', onclick: function () { routeStep(n); } }) : null]);
  return null;
}

function stats(n) {
  if (!n.phone) return null;
  var s = n.stats || { received: 0, sent: 0, chats: 0, lastActivityAt: null };
  function tile(v, k, small) { return h('div', { 'class': 'stat' }, [h('div', { 'class': 'v' + (small ? ' sm' : ''), text: String(v) }), h('div', { 'class': 'k', text: k })]); }
  return h('div', { 'class': 'stats' }, [
    tile(s.received, 'Received · 24 h'), tile(s.sent, 'Sent · 24 h'), tile(s.chats, 'Conversations'), tile(relTime(s.lastActivityAt), 'Last activity', true)
  ]);
}

function lineField(n) {
  var sel = h('select', { 'aria-label': 'Open Line', disabled: !ADMIN, onchange: function () {
    if (sel.value === '__new') { sel.value = n.line_id ? String(n.line_id) : ''; return routeStep(n, { create: true }); }
    setLine(n, sel.value ? Number(sel.value) : null);
  } }, [h('option', { value: '', text: n.line_id ? 'Not connected (stop routing)' : 'Choose an Open Line…' })]);
  var known = false;
  state.lines.forEach(function (l) {
    var owner = lineOwner(l.id, n.id);
    var o = h('option', { value: String(l.id), text: l.name + (owner ? '  ·  used by ' + owner.label : '') });
    if (n.line_id === l.id) { o.selected = true; known = true; }
    sel.appendChild(o);
  });
  if (n.line_id && !known) { var o = h('option', { value: String(n.line_id), text: 'Open Line #' + n.line_id }); o.selected = true; sel.appendChild(o); }
  sel.appendChild(h('option', { value: '__new', text: '＋ Create a new Open Line…' }));
  return h('div', { 'class': 'field' }, [
    h('span', { 'class': 'lbl', text: 'Contact Center Open Line' }), sel,
    h('div', { 'class': 'help' + (n.line_id ? '' : ' warn'), text: n.line_id ? 'Operators of this Open Line receive and answer the chats.' : 'Not routed. Pick an Open Line to start receiving chats.' })
  ]);
}

function numberCard(n) {
  var s = live(n), x = st(s);
  var isDefault = state.defaultNumberId === n.id;
  var nameEl = h('h3', { 'class': 'name', text: n.label, title: n.label });
  var items = [
    { icon: 'pencil', label: 'Rename', run: function () { rename(n, nameEl); } },
    s !== 'connected' ? { icon: n.phone && s !== 'logged_out' ? 'refresh' : 'qr', label: n.phone && s !== 'logged_out' ? 'Reconnect' : 'Scan QR code', run: function () { reconnect(n); } } : null,
    n.phone && ADMIN ? { icon: 'route', label: 'Change Open Line', run: function () { routeStep(n); } } : null,
    s === 'connected' || s === 'connecting' ? { icon: 'pause', label: 'Pause syncing', run: function () { pause(n); } } : null,
    n.phone ? { icon: 'logout', label: 'Log out device', run: function () { logout(n); } } : null,
    '-',
    { icon: 'trash', label: mine(n) ? 'Remove my WhatsApp' : 'Delete number', danger: true, run: function () { remove(n); } }
  ];
  return h('div', { 'class': 'card num' }, [
    h('div', { 'class': 'num-h' }, [
      h('div', { 'class': 'avatar ' + (x.t === 'ok' ? '' : x.t) }, [icon('wa'), h('span', { 'class': 'dot ' + x.t })]),
      h('div', { 'class': 'who' }, [
        h('div', { 'class': 'name-row' }, [nameEl,
          !canManage(n) ? null : h('button', { 'class': 'btn ghost icon rename', 'aria-label': 'Rename', title: 'Rename', style: 'width:28px;height:28px', onclick: function () { rename(n, nameEl); } }, [icon('pencil', 'sm')]),
          n.owner_user_id ? h('span', { 'class': 'chip info', title: 'Personal number of ' + ownerLabel(n) }, [icon('user'), ownerLabel(n)]) : null,
          isDefault ? h('span', { 'class': 'chip star', title: 'Used by CRM, robots and SMS when no number is chosen' }, [icon('star'), 'Default']) : null]),
        h('div', { 'class': 'sub-row' }, [h('span', { text: n.phone ? fmtPhone(n.phone) : 'No phone linked' }), h('span', { 'class': 'sep' }), stateTag(s),
          n.line_id ? h('span', { 'class': 'sep' }) : null, n.line_id ? h('span', { text: lineName(n.line_id) }) : null])
      ]),
      canManage(n) ? menu(items) : null
    ]),
    problem(n),
    stats(n),
    !n.phone || !ADMIN ? null : h('div', { 'class': 'settings' }, [
      lineField(n),
      h('div', { 'class': 'toggles' }, [
        switchCtl({ title: 'Forward group chats', text: 'WhatsApp groups also appear in Contact Center.', checked: n.groups_enabled, disabled: !ADMIN,
          onchange: function (v) { act(api('POST', '/api/numbers/' + n.id + '/groups', { enabled: v }), v ? 'Group chats will be forwarded.' : 'Group chats will no longer be forwarded.'); } }),
        switchCtl({ title: 'Default number', text: isDefault ? 'Used by CRM, robots and SMS when no number is chosen.' : 'Use for CRM, robots and SMS when no number is chosen.',
          checked: isDefault, disabled: isDefault || !ADMIN,
          onchange: function () { act(api('POST', '/api/numbers/' + n.id + '/default'), n.label + ' is now the default number.'); } })
      ])
    ])
  ]);
}

function features() {
  function f(ic, title, text) { return h('div', { 'class': 'card feature' }, [h('div', { 'class': 'fi' }, [icon(ic)]), h('b', { text: title }), h('span', { text: text })]); }
  return h('div', { 'class': 'features' }, [
    f('inbox', 'Answer in Contact Center', 'Every WhatsApp chat lands in your Open Line queue with the client\'s name and photo.'),
    f('crm', 'Message from any CRM record', 'Open a Lead, Deal, Contact, Company or Smart Process and use the WhatsApp tab.'),
    f('zap', 'Automate with robots', 'Add the "Send WhatsApp message" robot to a pipeline stage, or use WhatsApp as your SMS provider.')
  ]);
}

function emptyState() {
  return h('div', { 'class': 'card empty' }, [
    h('div', { 'class': 'art' }, [icon('wa')]),
    h('h2', { text: 'Connect your first WhatsApp number' }),
    h('p', { text: 'Link a WhatsApp or WhatsApp Business number by QR code. Chats arrive in Contact Center and your team replies from Bitrix24.' }),
    ADMIN ? h('button', { 'class': 'btn primary lg', onclick: startAdd }, [icon('plus'), 'Link WhatsApp number'])
      : h('p', { 'class': 'muted', style: 'margin:0', text: 'Ask a Bitrix24 administrator to link a number.' }),
    h('div', { 'class': 'ticks' }, [
      h('span', {}, [icon('check', 'sm'), 'Set up in about a minute']),
      h('span', {}, [icon('check', 'sm'), 'No Meta approval needed']),
      h('span', {}, [icon('check', 'sm'), 'Works with your existing number'])
    ])
  ]);
}

function teamCard(count) {
  return h('div', { 'class': 'card pad', style: 'margin-bottom:14px' }, [
    switchCtl({ title: 'Let employees link their own WhatsApp', checked: state.selfLinkEnabled,
      text: 'Each salesperson opens this app and scans their own phone. They message clients from CRM with their own number, and replies go to a personal Open Line only they answer.',
      onchange: function (v) { act(api('PUT', '/api/settings', { selfLinkEnabled: v }), v ? 'Employees can now link their own WhatsApp.' : 'Employees can no longer link new numbers.'); } }),
    count ? null : h('div', { 'class': 'hint-row' }, [icon('info', 'sm'), h('span', { text: state.selfLinkEnabled
      ? 'No one has linked their own WhatsApp yet. Ask your team to open WhatsApp from the left menu and click "Link my WhatsApp".'
      : 'Switch this on to let your sales team link their own numbers.' })])
  ]);
}

function renderMine() {
  var my = myNumber();
  if (my) {
    app.appendChild(h('div', { 'class': 'section-h', text: 'My WhatsApp' }));
    app.appendChild(numberCard(my));
    app.appendChild(h('div', { 'class': 'hint-row' }, [icon('info', 'sm'), h('span', { text: 'Message clients from the WhatsApp tab in any Lead, Deal, Contact or Company. Their replies arrive in Contact Center' + (my.line_id ? ' (' + lineName(my.line_id) + ').' : '.') })]));
  } else if (state.selfLinkEnabled) {
    app.appendChild(h('div', { 'class': 'card empty' }, [
      h('div', { 'class': 'art' }, [icon('wa')]),
      h('h2', { text: 'Link your WhatsApp' }),
      h('p', { text: 'Scan a QR code with your phone, just like WhatsApp Web. Then message your clients from any CRM record with your own number. Their replies come straight to you in Bitrix24.' }),
      h('button', { 'class': 'btn primary lg', onclick: startPersonal }, [icon('qr'), 'Link my WhatsApp']),
      h('div', { 'class': 'ticks' }, [
        h('span', {}, [icon('check', 'sm'), 'Takes about a minute']),
        h('span', {}, [icon('check', 'sm'), 'Your own number']),
        h('span', {}, [icon('check', 'sm'), 'Chats stay linked to your CRM records'])
      ])
    ]));
  } else {
    app.appendChild(h('div', { 'class': 'card empty small' }, [h('div', { 'class': 'art' }, [icon('wa')]),
      h('h2', { text: 'Linking your own WhatsApp is switched off' }),
      h('p', { text: 'Ask a Bitrix24 administrator to switch on "Let employees link their own WhatsApp" in this app. You can still message clients from company numbers in the WhatsApp tab of any CRM record.' })]));
  }
  app.appendChild(h('div', { 'class': 'section-h', text: 'What you can do' }));
  app.appendChild(features());
  app.appendChild(footer());
  fit();
}

function render() {
  clear(app);
  app.appendChild(header());
  if (state.error) app.appendChild(h('div', { 'class': 'alert bad', style: 'margin:0 0 14px' }, [icon('alert'), h('div', { 'class': 'grow' }, [h('b', { text: 'Something went wrong' }), state.error]),
    h('button', { 'class': 'btn sm', text: 'Try again', onclick: load })]));
  var ba = state.billing && state.billing.enabled ? billingAlert() : null; if (ba) app.appendChild(ba);
  if (!ADMIN) return renderMine();
  if (ADMIN && state.missingScopes.length) app.appendChild(h('div', { 'class': 'alert bad', style: 'margin:0 0 14px' }, [icon('alert'),
    h('div', { 'class': 'grow' }, [h('b', { text: 'Bitrix24 permission missing: ' + state.missingScopes.map(function (x) { return SCOPE_NAMES[x] || x; }).join(', ') }),
      'Some features fail without it (for example: messages typed on the phone, copies of CRM sends in the chat, disconnect alerts). Fix: Developer resources → Integrations → this app → Edit → Assign permissions → add it → Save → Reinstall.'])]));
  if (!state.numbers.length) {
    if (!state.error) app.appendChild(emptyState());
    if (state.autoReplies) { app.appendChild(h('div', { 'class': 'section-h', text: 'Automatic replies' })); app.appendChild(autoRepliesCard()); }
    var bc0 = state.billing && state.billing.enabled ? billingCard() : null;
    if (bc0) { app.appendChild(h('div', { 'class': 'section-h', text: 'Billing' })); app.appendChild(bc0); }
    if (ADMIN) { app.appendChild(h('div', { 'class': 'section-h' }, [icon('history', 'sm'), 'Activity log'])); app.appendChild(activityCard()); }
    app.appendChild(h('div', { 'class': 'section-h', text: 'What you can do' }));
    app.appendChild(features());
    app.appendChild(footer());
    return fit();
  }
  var g = guide(); if (g) app.appendChild(g);
  var company = state.numbers.filter(function (n) { return !n.owner_user_id; });
  var team = state.numbers.filter(function (n) { return n.owner_user_id; });
  if (company.length) {
    app.appendChild(h('div', { 'class': 'section-h' }, ['Company numbers', h('span', { 'class': 'count', text: String(company.length) })]));
    company.forEach(function (n) { app.appendChild(numberCard(n)); });
  }
  app.appendChild(h('div', { 'class': 'section-h' }, ['Sales team', h('span', { 'class': 'count', text: String(team.length) })]));
  app.appendChild(teamCard(team.length));
  team.forEach(function (n) { app.appendChild(numberCard(n)); });
  if (state.autoReplies) { app.appendChild(h('div', { 'class': 'section-h', text: 'Automatic replies' })); app.appendChild(autoRepliesCard()); }
  var bc = state.billing && state.billing.enabled ? billingCard() : null;
  if (bc) { app.appendChild(h('div', { 'class': 'section-h', text: 'Billing' })); app.appendChild(bc); }
  app.appendChild(h('div', { 'class': 'section-h' }, [icon('history', 'sm'), 'Activity log']));
  app.appendChild(activityCard());
  app.appendChild(h('div', { 'class': 'section-h', text: 'What you can do' }));
  app.appendChild(features());
  app.appendChild(footer());
  fit();
}
bxReady(function () { load(); setInterval(function () { if (!userIsBusy() && !document.hidden) load(); }, 10000); });
`;

export const CONNECTOR_JS = String.raw`
var lineId = BOOT.placement && BOOT.placement.lineId;
var picked = null;
function head() {
  return h('div', { 'class': 'crm-h' }, [h('div', { 'class': 'logo sm' }, [icon('wa')]),
    h('div', { 'class': 'titles' }, [h('h1', { text: 'WhatsApp channel' }), h('p', { text: lineId ? 'Choose which WhatsApp number feeds Open Line #' + lineId + '.' : 'Open Line settings' })])]);
}
function render(numbers) {
  clear(app);
  app.appendChild(head());
  if (!lineId) { app.appendChild(h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow', text: 'Bitrix24 did not say which Open Line is being configured. Close this window and open it again from Contact Center.' })])); return fit(); }
  if (!numbers.length) {
    app.appendChild(h('div', { 'class': 'card empty small' }, [h('div', { 'class': 'art' }, [icon('wa')]), h('h2', { text: 'No WhatsApp number linked yet' }),
      h('p', { text: 'Link a number in the WhatsApp app first. It takes about a minute, then come back here.' }),
      h('button', { 'class': 'btn primary', onclick: openApp }, [icon('external', 'sm'), 'Open WhatsApp app'])]));
    return fit();
  }
  var current = numbers.filter(function (n) { return n.line_id === lineId; })[0] || null;
  if (!BOOT.isAdmin) {
    app.appendChild(h('div', { 'class': 'alert info' }, [icon('info'), h('div', { 'class': 'grow', text: current
      ? 'This Open Line receives chats from "' + current.label + '" (' + fmtPhone(current.phone) + '). Only Bitrix24 administrators can change it.'
      : 'No WhatsApp number feeds this Open Line. Only Bitrix24 administrators can change it.' })]));
    return fit();
  }
  if (picked === null) picked = current ? current.id : numbers[0].id;
  var rows = [];
  var save = h('button', { 'class': 'btn primary', text: 'Save' });
  function sync() { rows.forEach(function (r) { var on = r.id === picked; r.el.classList.toggle('on', on); r.input.checked = on; }); save.disabled = !!current && picked === current.id; }
  var list = h('div', { 'class': 'options', role: 'radiogroup' }, numbers.map(function (n) {
    var input = h('input', { type: 'radio', name: 'num', value: n.id });
    var s = n.live_status || n.status;
    var el = h('label', { 'class': 'opt', onclick: function () { picked = n.id; sync(); } }, [input,
      h('div', { 'class': 't' }, [h('b', {}, [n.label, n.line_id === lineId ? h('span', { 'class': 'chip ok', style: 'margin-left:8px', text: 'On this line' }) : null]),
        h('span', {}, [n.phone ? fmtPhone(n.phone) + ' · ' : '', st(s).l, n.line_id && n.line_id !== lineId ? ' · now on Open Line #' + n.line_id + ', it will move here' : ''])]),
      h('span', { 'class': 'dot ' + st(s).t })]);
    rows.push({ id: n.id, el: el, input: input });
    return el;
  }));
  save.addEventListener('click', function () {
    busy(save, true);
    api('POST', '/api/numbers/' + picked + '/line', { lineId: lineId })
      .then(function () { return api('GET', '/api/state'); })
      .then(function (r) { toast('Saved. Messages to this number now arrive on this Open Line.'); render(r.numbers); })
      .catch(function (e) { busy(save, false); toast(e.message, 'bad'); });
  });
  var off = current ? h('button', { 'class': 'btn ghost danger', text: 'Disconnect this line', onclick: function () {
    confirmDialog({ title: 'Disconnect WhatsApp from this Open Line?', text: '"' + current.label + '" will stop sending new chats here. Existing chats are kept.', ok: 'Disconnect', danger: true }).then(function (yes) {
      if (!yes) return;
      api('POST', '/api/numbers/' + current.id + '/line', { lineId: null }).then(function () { return api('GET', '/api/state'); })
        .then(function (r) { picked = null; toast('Line disconnected.'); render(r.numbers); }).catch(function (e) { toast(e.message, 'bad'); });
    });
  } }) : null;
  app.appendChild(h('div', { 'class': 'card pad' }, [list, h('div', { 'class': 'row', style: 'margin-top:16px;justify-content:space-between' }, [off || h('span'), save])]));
  app.appendChild(h('div', { 'class': 'hint-row' }, [icon('info', 'sm'), h('span', {}, ['Manage numbers, QR codes and defaults in the ', h('button', { 'class': 'link', text: 'WhatsApp app', onclick: openApp }), '.'])]));
  sync();
  fit();
}
bxReady(function () {
  api('GET', '/api/state').then(function (r) { render(r.numbers); })
    .catch(function (e) { clear(app); app.appendChild(h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow', text: e.message })])); fit(); });
});
`;

export const CRM_JS = String.raw`
var ref = BOOT.placement;
var ctx = null, phoneIdx = 0, fromId = null, draft = '', attached = null;
function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function upload(file) {
  var fd = new FormData(); fd.append('file', file);
  return fetch('/api/crm/upload', { method: 'POST', headers: { 'X-App-Session': BOOT.session }, body: fd }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || 'Upload failed (' + r.status + ')'); return j; });
  });
}
var MAX = 4096;
function openChat(chatId) { try { BX24.im.openMessenger('chat' + chatId); } catch (e) { toast('Open the chat from Contact Center (chat #' + chatId + ').', 'bad'); } }
function head(right) {
  return h('div', { 'class': 'crm-h' }, [h('div', { 'class': 'logo sm' }, [icon('wa')]),
    h('div', { 'class': 'titles' }, [h('h1', { text: 'WhatsApp' }), h('p', { text: 'Message this client on WhatsApp' })]), right || null]);
}
function emptyCard(title, text, btn) {
  return h('div', { 'class': 'card empty small' }, [h('div', { 'class': 'art' }, [icon('wa')]), h('h2', { text: title }), h('p', { text: text }), btn || null]);
}
function render() {
  clear(app);
  if (!ref) { app.appendChild(head()); app.appendChild(emptyCard('Save the record first', 'WhatsApp becomes available once this record is saved. Save it, then reopen this tab.')); return fit(); }
  if (!ctx.numbers.length) {
    app.appendChild(head());
    app.appendChild(emptyCard('No WhatsApp number connected', 'An administrator can link a number by QR code in the WhatsApp app.', h('button', { 'class': 'btn primary', onclick: openApp }, [icon('external', 'sm'), 'Open WhatsApp app'])));
    return fit();
  }
  if (!ctx.phones.length) {
    app.appendChild(head());
    app.appendChild(emptyCard('No phone number on this record', 'Add a phone number to this record, or to its contact or company, to start a WhatsApp chat.'));
    return fit();
  }
  if (!fromId || !ctx.numbers.some(function (n) { return n.id === fromId; })) {
    var def = ctx.numbers.filter(function (n) { return n.id === ctx.myNumberId; })[0]
      || ctx.numbers.filter(function (n) { return n.id === ctx.defaultNumberId && n.status === 'connected'; })[0]
      || ctx.numbers.filter(function (n) { return n.status === 'connected'; })[0] || ctx.numbers[0];
    fromId = def.id;
  }
  if (phoneIdx >= ctx.phones.length) phoneIdx = 0;
  var from = h('select', { 'aria-label': 'Send from', onchange: function () { fromId = from.value; draft = text.value; render(); } });
  ctx.numbers.forEach(function (n) {
    var o = h('option', { value: n.id, text: (n.id === ctx.myNumberId ? 'My WhatsApp' : n.label) + (n.phone ? '  ' + fmtPhone(n.phone) : '') + (n.status !== 'connected' ? '  (offline)' : '') });
    if (n.id === fromId) o.selected = true; from.appendChild(o);
  });
  var num = ctx.numbers.filter(function (n) { return n.id === fromId; })[0];
  app.appendChild(head(h('label', { 'class': 'from' }, [h('span', { 'class': 'muted', style: 'font-size:13px', text: 'From' }), from])));

  if (ctx.phones.length > 1) {
    app.appendChild(h('div', { 'class': 'phones', role: 'tablist' }, ctx.phones.map(function (p, i) {
      return h('button', { 'class': i === phoneIdx ? 'on' : '', onclick: function () { phoneIdx = i; draft = text.value; render(); } }, [icon('phone', 'sm'), fmtPhone(p.phone), p.label ? h('span', { text: p.label }) : null]);
    })));
  }
  var p = ctx.phones[phoneIdx];
  var chat = ctx.chats.filter(function (c) { return c.phone === p.phone && c.numberId === fromId; })[0];

  if (num && num.status !== 'connected') app.appendChild(h('div', { 'class': 'alert warn', style: 'margin:0 0 12px' }, [icon('alert'),
    h('div', { 'class': 'grow', text: '"' + num.label + '" is offline right now. Messages are queued and sent when it reconnects.' })]));

  var text = h('textarea', { placeholder: 'Write a WhatsApp message to ' + fmtPhone(p.phone) + '…', maxlength: String(MAX), 'aria-label': 'Message' });
  text.value = draft;
  var counter = h('span', { 'class': 'counter' });
  function count() { var n = text.value.length; counter.textContent = n ? n + ' / ' + MAX : ''; counter.className = 'counter' + (n > MAX - 100 ? ' bad' : ''); send.disabled = !text.value.trim() && !attached; }
  var fileInput = h('input', { type: 'file', style: 'display:none', onchange: function () {
    var f = fileInput.files && fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    if (f.size > 32 * 1048576) return toast('Files can be up to 32 MB.', 'bad');
    busy(attachBtn, true);
    upload(f).then(function (r) { attached = { fileKey: r.fileKey, name: r.name, size: r.size }; showFile(); count(); })
      .catch(function (e) { toast(e.message, 'bad'); }).then(function () { busy(attachBtn, false); });
  } });
  var attachBtn = h('button', { 'class': 'btn', title: 'Attach a file, e.g. a quotation PDF', onclick: function () { fileInput.click(); } }, [icon('clip', 'sm'), 'Attach']);
  var fileRow = h('div', { 'class': 'phones', style: 'margin:8px 0 0' });
  function showFile() {
    clear(fileRow);
    if (!attached) return fit();
    fileRow.appendChild(h('button', { 'class': 'on', title: 'Remove attachment', onclick: function () { attached = null; showFile(); count(); } },
      [icon('clip', 'sm'), attached.name, h('span', { text: fmtSize(attached.size) + '  ✕' })]));
    fit();
  }
  function grow() { text.style.height = 'auto'; text.style.height = Math.min(320, Math.max(110, text.scrollHeight)) + 'px'; fit(); }
  var send = h('button', { 'class': 'btn primary', onclick: doSend }, [icon('send', 'sm'), 'Send']);
  function doSend() {
    var body = text.value.trim(); if (!body && !attached) return text.focus();
    busy(send, true);
    api('POST', '/api/crm/send', { numberId: fromId, phone: p.phone, text: body, fileKey: attached ? attached.fileKey : null, entityTypeId: ref.entityTypeId, entityId: ref.entityId })
      .then(function () { text.value = ''; draft = ''; attached = null; showFile(); count(); grow(); toast('Queued for WhatsApp. Once sent it is recorded in the timeline and the chat.'); })
      .catch(function (e) { toast(e.message, 'bad'); })
      .then(function () { busy(send, false); count(); text.focus(); });
  }
  text.addEventListener('input', function () { draft = text.value; count(); grow(); });
  text.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); } });
  var openBtn = h('button', { 'class': 'btn', onclick: function () {
    if (chat) return openChat(chat.bitrixChatId);
    busy(openBtn, true);
    api('POST', '/api/crm/open', { numberId: fromId, phone: p.phone, entityTypeId: ref.entityTypeId, entityId: ref.entityId })
      .then(function (r) { openChat(r.bitrixChatId); return load(); })
      .catch(function (e) { toast(e.message, 'bad'); }).then(function () { busy(openBtn, false); });
  } }, [icon('chat', 'sm'), chat ? 'Open chat' : 'Start chat']);

  app.appendChild(h('div', { 'class': 'card composer' }, [text, fileRow, fileInput,
    h('div', { 'class': 'composer-f' }, [
      h('span', { 'class': 'grow' }, [h('span', { text: '*bold*  _italic_  ~strike~' }), '  ·  ', h('kbd', { text: 'Ctrl' }), ' + ', h('kbd', { text: 'Enter' }), ' to send  ', counter]),
      attachBtn, openBtn, send
    ])]));
  showFile();
  app.appendChild(h('div', { 'class': 'hint-row' }, chat
    ? [icon('check', 'sm'), h('span', { text: 'A conversation with ' + fmtPhone(p.phone) + ' already exists in Contact Center. Replies arrive there.' })]
    : [icon('info', 'sm'), h('span', { text: 'Replies from the client arrive in Contact Center and are linked to this record.' })]));
  app.appendChild(footer());
  count(); grow();
}
function load() {
  if (!ref) { ctx = { numbers: [], phones: [], chats: [] }; return Promise.resolve(render()); }
  return api('GET', '/api/crm/context?entityTypeId=' + ref.entityTypeId + '&entityId=' + ref.entityId).then(function (r) { ctx = r; render(); })
    .catch(function (e) { clear(app); app.appendChild(head()); app.appendChild(h('div', { 'class': 'alert bad' }, [icon('alert'), h('div', { 'class': 'grow', text: e.message }),
      h('button', { 'class': 'btn sm', text: 'Try again', onclick: load })])); fit(); });
}
bxReady(load);
`;
