import { STYLES } from './styles.js';
import { ADMIN_JS, CONNECTOR_JS, CRM_JS, COMMON_JS } from './scripts.js';

export type View = 'admin' | 'connector-settings' | 'crm-tab';

/** Server-rendered shell; data rides in a JSON bootstrap and is rendered with textContent only. */
export function renderPage(view: View, bootstrap: Record<string, unknown>): string {
  const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  const script = view === 'admin' ? ADMIN_JS : view === 'connector-settings' ? CONNECTOR_JS : CRM_JS;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp</title><style>${STYLES}</style>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body><div class="wrap" id="app"><p class="muted">Loading…</p></div>
<div class="modal" id="modal"><div class="box" id="modal-box"></div></div>
<script>window.__BOOT__=${json};</script>
<script>${COMMON_JS}${script}</script>
</body></html>`;
}

export function installFinishedPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>WhatsApp</title>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body style="font:14px/1.5 system-ui;padding:24px;color:#1f2a33">
<p>WhatsApp connector installed. Open the app from the left menu to link your first number.</p>
<script>BX24.init(function(){BX24.installFinish();});</script></body></html>`;
}
