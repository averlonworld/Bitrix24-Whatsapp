/* Client-side scripts for the three Bitrix24 frames. Plain ES2017, no build step, no innerHTML
   with data: everything user- or WhatsApp-provided is rendered through textContent. */

export const COMMON_JS = String.raw`
var BOOT = window.__BOOT__ || {};
var app = document.getElementById('app');
function api(method, path, body) {
  return fetch(path, {
    method: method,
    headers: { 'Content-Type': 'application/json', 'X-App-Session': BOOT.session },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j.message || j.error || ('HTTP ' + r.status));
      return j;
    });
  });
}
function h(tag, attrs, children) {
  var el = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function fit() { try { if (window.BX24) BX24.fitWindow(); } catch (e) {} }
function bxReady(cb) { if (window.BX24 && BX24.init) BX24.init(cb); else cb(); }
var STATUS = { connected: 'Connected', qr: 'Waiting for QR scan', connecting: 'Connecting…', disconnected: 'Disconnected',
  logged_out: 'Logged out', 'new': 'Not linked', offline: 'Offline' };
function badge(status) { return h('span', { 'class': 'badge b-' + status, text: STATUS[status] || status }); }
var modal = document.getElementById('modal'), modalBox = document.getElementById('modal-box');
var onModalClose = null;
function openModal(nodes, onClose) { clear(modalBox); nodes.forEach(function (n) { modalBox.appendChild(n); }); modal.classList.add('open'); onModalClose = onClose || null; }
function closeModal() { modal.classList.remove('open'); if (onModalClose) { var f = onModalClose; onModalClose = null; f(); } }
function fmtPhone(p) { return p ? '+' + p : ''; }
function footer() { return h('div', { 'class': 'foot', text: 'WhatsApp connector v' + (BOOT.appVersion || '') }); }
`;

export const ADMIN_JS = String.raw`
var state = { numbers: [], lines: [], defaultNumberId: null, error: null };
function load() {
  return Promise.all([api('GET', '/api/state'), api('GET', '/api/lines').catch(function () { return { lines: [] }; })])
    .then(function (r) { state.numbers = r[0].numbers; state.defaultNumberId = r[0].defaultNumberId; state.domain = r[0].domain; state.lines = r[1].lines || []; state.error = null; render(); })
    .catch(function (e) { state.error = e.message; render(); });
}
function act(p, after) { return p.then(function () { return load(); }).then(after || function () {}).catch(function (e) { alert(e.message); }); }
function lineSelect(n) {
  var sel = h('select', { onchange: function () {
    var v = sel.value ? Number(sel.value) : null;
    act(api('POST', '/api/numbers/' + n.id + '/line', { lineId: v }));
  } }, [h('option', { value: '', text: '— Not connected to Contact Center —' })]);
  state.lines.forEach(function (l) {
    var o = h('option', { value: String(l.id), text: l.name + ' (#' + l.id + ')' });
    if (n.line_id === l.id) o.selected = true;
    sel.appendChild(o);
  });
  if (n.line_id && !state.lines.some(function (l) { return l.id === n.line_id; })) {
    var o = h('option', { value: String(n.line_id), text: 'Open Line #' + n.line_id }); o.selected = true; sel.appendChild(o);
  }
  return sel;
}
function numberCard(n) {
  var live = n.live_status || n.status;
  var actions = h('div', { 'class': 'row' });
  if (live !== 'connected') actions.appendChild(h('button', { 'class': 'btn primary', text: live === 'qr' ? 'Show QR code' : 'Connect (scan QR)', onclick: function () { connect(n); } }));
  if (live === 'connected' || live === 'connecting') actions.appendChild(h('button', { 'class': 'btn', text: 'Disconnect', onclick: function () { act(api('POST', '/api/numbers/' + n.id + '/disconnect')); } }));
  if (n.phone) actions.appendChild(h('button', { 'class': 'btn', text: 'Log out', title: 'Unlink this device from WhatsApp', onclick: function () {
    if (confirm('Unlink ' + fmtPhone(n.phone) + ' from WhatsApp? You will need to scan a QR code again.')) act(api('POST', '/api/numbers/' + n.id + '/logout'));
  } }));
  actions.appendChild(h('button', { 'class': 'btn danger', text: 'Delete', onclick: function () {
    if (confirm('Delete "' + n.label + '"? Its chats stay in Bitrix24.')) act(api('DELETE', '/api/numbers/' + n.id));
  } }));
  var groups = h('input', { type: 'checkbox', checked: n.groups_enabled, onchange: function () { act(api('POST', '/api/numbers/' + n.id + '/groups', { enabled: groups.checked })); } });
  var def = h('input', { type: 'radio', name: 'default', checked: state.defaultNumberId === n.id, onchange: function () { act(api('POST', '/api/numbers/' + n.id + '/default')); } });
  return h('div', { 'class': 'card' }, [
    h('div', { 'class': 'num' }, [
      h('div', {}, [
        h('div', { 'class': 'row' }, [h('strong', { text: n.label }), badge(live)]),
        h('div', { 'class': 'meta', text: (n.phone ? fmtPhone(n.phone) : 'No phone linked yet') }),
        n.last_error ? h('div', { 'class': 'err', text: n.last_error }) : null
      ]),
      actions
    ]),
    h('div', { 'class': 'ctl' }, [
      h('label', {}, [h('span', { 'class': 'lbl', text: 'Contact Center Open Line' }), lineSelect(n)]),
      h('label', { 'class': 'row' }, [groups, h('span', { text: 'Forward WhatsApp group chats' })]),
      h('label', { 'class': 'row' }, [def, h('span', { text: 'Default number for CRM, robots and SMS' })])
    ])
  ]);
}
function addForm() {
  var input = h('input', { type: 'text', placeholder: 'Name, e.g. "Sales" or "Support"', maxlength: '60' });
  var btn = h('button', { 'class': 'btn primary', text: 'Add WhatsApp number', onclick: function () {
    var label = input.value.trim(); if (!label) { input.focus(); return; }
    btn.disabled = true;
    api('POST', '/api/numbers', { label: label }).then(function (r) { input.value = ''; return load().then(function () { connect(r.number); }); })
      .catch(function (e) { alert(e.message); }).then(function () { btn.disabled = false; });
  } });
  return h('div', { 'class': 'card' }, [h('h2', { text: 'Link a WhatsApp number' }), h('div', { 'class': 'row' }, [h('div', { 'class': 'grow' }, [input]), btn])]);
}
function connect(n) {
  var qrBox = h('div', { 'class': 'qr', text: 'Starting…' });
  var status = h('p', { 'class': 'muted', text: '' });
  var pairPhone = h('input', { type: 'tel', placeholder: 'Phone with country code, e.g. 971501234567' });
  var pairOut = h('div', {});
  var stop = false, timer = null;
  function poll() {
    if (stop) return;
    api('GET', '/api/numbers/' + n.id + '/qr').then(function (r) {
      if (stop) return;
      if (r.status === 'connected') { status.textContent = 'Connected as ' + fmtPhone(r.phone) + ' ✔'; clear(qrBox); qrBox.appendChild(h('div', { 'class': 'ok', text: 'Linked successfully' })); setTimeout(closeModal, 1200); return; }
      if (r.qr) { clear(qrBox); qrBox.appendChild(h('img', { src: r.qr, alt: 'WhatsApp QR code' })); status.textContent = 'Waiting for scan…'; }
      else { status.textContent = STATUS[r.status] || r.status; if (r.error) status.textContent += ' — ' + r.error; }
      if (r.status === 'disconnected' || r.status === 'logged_out') { clear(qrBox); qrBox.appendChild(h('button', { 'class': 'btn primary', text: 'Generate new QR', onclick: start })); return; }
      timer = setTimeout(poll, 2000);
    }).catch(function (e) { status.textContent = e.message; timer = setTimeout(poll, 4000); });
  }
  function start() { clear(qrBox); qrBox.textContent = 'Starting…'; api('POST', '/api/numbers/' + n.id + '/connect').then(poll).catch(function (e) { status.textContent = e.message; }); }
  openModal([
    h('h2', { text: 'Link "' + n.label + '"' }),
    h('ol', { 'class': 'steps' }, [h('li', { text: 'Open WhatsApp on the phone' }), h('li', { text: 'Settings → Linked devices → Link a device' }), h('li', { text: 'Point the phone at this QR code' })]),
    qrBox, status,
    h('details', {}, [h('summary', { text: 'Link with a phone number instead' }), h('div', { 'class': 'row', style: 'margin-top:8px' }, [
      h('div', { 'class': 'grow' }, [pairPhone]),
      h('button', { 'class': 'btn', text: 'Get code', onclick: function () {
        api('POST', '/api/numbers/' + n.id + '/pairing-code', { phone: pairPhone.value }).then(function (r) {
          clear(pairOut); pairOut.appendChild(h('div', { 'class': 'code', text: r.code })); pairOut.appendChild(h('div', { 'class': 'muted', text: 'WhatsApp → Linked devices → Link with phone number, then enter this code.' }));
        }).catch(function (e) { clear(pairOut); pairOut.appendChild(h('div', { 'class': 'err', text: e.message })); });
      } })]), pairOut]),
    h('p', {}, [h('button', { 'class': 'btn', text: 'Close', onclick: closeModal })])
  ], function () { stop = true; if (timer) clearTimeout(timer); load(); });
  start();
}
function render() {
  clear(app);
  app.appendChild(h('h1', { text: 'WhatsApp for Bitrix24' }));
  app.appendChild(h('p', { 'class': 'sub', text: 'Link numbers by QR code. Chats arrive in Contact Center and work in Leads, Deals, Contacts, Companies and Smart Processes.' }));
  if (state.error) app.appendChild(h('div', { 'class': 'card err', text: state.error }));
  if (!state.lines.length) app.appendChild(h('div', { 'class': 'card muted', text: 'Tip: create an Open Line in Contact Center first, then choose it for each number below.' }));
  state.numbers.forEach(function (n) { app.appendChild(numberCard(n)); });
  app.appendChild(addForm());
  app.appendChild(footer());
  fit();
}
bxReady(function () { load(); setInterval(function () { if (!modal.classList.contains('open')) load(); }, 15000); });
`;

export const CONNECTOR_JS = String.raw`
var lineId = BOOT.placement && BOOT.placement.lineId;
function render(numbers, msg) {
  clear(app);
  app.appendChild(h('h1', { text: 'WhatsApp on this Open Line' }));
  if (!lineId) { app.appendChild(h('p', { 'class': 'err', text: 'Bitrix24 did not say which Open Line is being configured.' })); return fit(); }
  app.appendChild(h('p', { 'class': 'sub', text: 'Choose which linked WhatsApp number feeds Open Line #' + lineId + '.' }));
  if (!numbers.length) {
    app.appendChild(h('div', { 'class': 'card', text: 'No WhatsApp number is linked yet. Open the WhatsApp app from the left menu and link one by QR code, then come back here.' }));
    return fit();
  }
  var card = h('div', { 'class': 'card' });
  numbers.forEach(function (n) {
    var radio = h('input', { type: 'radio', name: 'num', value: n.id, checked: n.line_id === lineId });
    card.appendChild(h('label', { 'class': 'row phone' }, [radio, h('strong', { text: n.label }), h('span', { 'class': 'muted', text: fmtPhone(n.phone) }), badge(n.live_status || n.status),
      n.line_id && n.line_id !== lineId ? h('span', { 'class': 'muted', text: '(now on line #' + n.line_id + ')' }) : null]));
  });
  var save = h('button', { 'class': 'btn primary', text: 'Save', onclick: function () {
    var picked = card.querySelector('input[name=num]:checked');
    if (!picked) return;
    save.disabled = true;
    api('POST', '/api/numbers/' + picked.value + '/line', { lineId: lineId })
      .then(function () { return api('GET', '/api/state'); })
      .then(function (r) { render(r.numbers, 'Saved. Messages to this number now arrive on this Open Line.'); })
      .catch(function (e) { render(numbers, null); alert(e.message); });
  } });
  var off = h('button', { 'class': 'btn', text: 'Disconnect this line', onclick: function () {
    var bound = numbers.filter(function (n) { return n.line_id === lineId; })[0];
    if (!bound) return;
    api('POST', '/api/numbers/' + bound.id + '/line', { lineId: null }).then(function () { return api('GET', '/api/state'); }).then(function (r) { render(r.numbers, 'Line disconnected.'); });
  } });
  card.appendChild(h('div', { 'class': 'row', style: 'margin-top:12px' }, [save, off]));
  if (msg) card.appendChild(h('p', { 'class': 'ok', text: msg }));
  app.appendChild(card);
  fit();
}
bxReady(function () { api('GET', '/api/state').then(function (r) { render(r.numbers, null); }).catch(function (e) { clear(app); app.appendChild(h('p', { 'class': 'err', text: e.message })); }); });
`;

export const CRM_JS = String.raw`
var ref = BOOT.placement;
function openChat(chatId) { bxReady(function () { try { BX24.im.openMessenger('chat' + chatId); } catch (e) { alert('Open the chat from Contact Center (chat #' + chatId + ').'); } }); }
function render(ctx) {
  clear(app);
  if (!ref) { app.appendChild(h('p', { 'class': 'muted', text: 'Save the record first, then reopen this tab.' })); return fit(); }
  if (!ctx.numbers.length) { app.appendChild(h('div', { 'class': 'card', text: 'No WhatsApp number is connected. An administrator can link one from the WhatsApp app in the left menu.' })); return fit(); }
  if (!ctx.phones.length) { app.appendChild(h('div', { 'class': 'card', text: 'This record (and its contacts / company) has no phone number. Add one to start a WhatsApp chat.' })); return fit(); }
  var from = h('select', {});
  ctx.numbers.forEach(function (n) { var o = h('option', { value: n.id, text: n.label + (n.phone ? ' (' + fmtPhone(n.phone) + ')' : '') + (n.status !== 'connected' ? ' — offline' : '') }); if (n.id === ctx.defaultNumberId) o.selected = true; from.appendChild(o); });
  app.appendChild(h('div', { 'class': 'card' }, [h('label', {}, [h('span', { 'class': 'lbl', text: 'Send from' }), from])]));
  var card = h('div', { 'class': 'card' });
  ctx.phones.forEach(function (p) {
    var chats = ctx.chats.filter(function (c) { return c.phone === p.phone; });
    var text = h('textarea', { placeholder: 'Write a WhatsApp message to ' + fmtPhone(p.phone) + '…' });
    var out = h('div', {});
    var sendBtn = h('button', { 'class': 'btn primary', text: 'Send', onclick: function () {
      if (!text.value.trim()) return text.focus();
      sendBtn.disabled = true;
      api('POST', '/api/crm/send', { numberId: from.value, phone: p.phone, text: text.value, entityTypeId: ref.entityTypeId, entityId: ref.entityId })
        .then(function () { text.value = ''; clear(out); out.appendChild(h('span', { 'class': 'ok', text: 'Queued — it will appear in the chat and timeline.' })); })
        .catch(function (e) { clear(out); out.appendChild(h('span', { 'class': 'err', text: e.message })); })
        .then(function () { sendBtn.disabled = false; });
    } });
    var openBtn = h('button', { 'class': 'btn', text: chats.length ? 'Open chat' : 'Start chat in Contact Center', onclick: function () {
      var existing = chats.filter(function (c) { return c.numberId === from.value; })[0];
      if (existing) return openChat(existing.bitrixChatId);
      openBtn.disabled = true;
      api('POST', '/api/crm/open', { numberId: from.value, phone: p.phone, entityTypeId: ref.entityTypeId, entityId: ref.entityId })
        .then(function (r) { openChat(r.bitrixChatId); return load(); })
        .catch(function (e) { alert(e.message); }).then(function () { openBtn.disabled = false; });
    } });
    card.appendChild(h('div', { 'class': 'phone' }, [
      h('div', { 'class': 'row' }, [h('strong', { text: fmtPhone(p.phone) }), h('span', { 'class': 'muted', text: p.label }), chats.length ? h('span', { 'class': 'badge b-connected', text: 'Chat exists' }) : null]),
      h('div', { style: 'margin:8px 0' }, [text]),
      h('div', { 'class': 'row' }, [sendBtn, openBtn, out])
    ]));
  });
  app.appendChild(card);
  app.appendChild(footer());
  fit();
}
function load() {
  if (!ref) return render({ numbers: [], phones: [], chats: [] });
  return api('GET', '/api/crm/context?entityTypeId=' + ref.entityTypeId + '&entityId=' + ref.entityId).then(render)
    .catch(function (e) { clear(app); app.appendChild(h('p', { 'class': 'err', text: e.message })); fit(); });
}
bxReady(load);
`;
