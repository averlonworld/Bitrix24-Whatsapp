import { STYLES } from './styles.js';
import { ADMIN_JS, CONNECTOR_JS, CRM_JS, COMMON_JS } from './scripts.js';

export type View = 'admin' | 'connector-settings' | 'crm-tab';

/** Server-rendered shell; data rides in a JSON bootstrap and is rendered with textContent only. */
export function renderPage(view: View, bootstrap: Record<string, unknown>): string {
  const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, '');
  const script = view === 'admin' ? ADMIN_JS : view === 'connector-settings' ? CONNECTOR_JS : CRM_JS;
  const compact = view === 'admin' ? '' : ' compact';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp</title><style>${STYLES}</style>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body><div class="wrap${compact}" id="app" aria-live="polite">
<div class="sk" style="height:48px;width:260px;margin-bottom:22px"></div>
<div class="sk" style="height:180px;border-radius:16px;margin-bottom:14px"></div>
<div class="sk" style="height:120px;border-radius:16px"></div></div>
<div class="modal" id="modal" role="dialog" aria-modal="true"><div class="box" id="modal-box"></div></div>
<div class="toasts" id="toasts" role="status"></div>
<script>window.__BOOT__=${json};</script>
<script>${COMMON_JS}${script}</script>
</body></html>`;
}

export function installFinishedPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>WhatsApp</title><style>${STYLES}</style>
<script src="https://api.bitrix24.com/api/v1/"></script></head>
<body><div class="wrap"><div class="card empty">
<div class="art"><span class="ico"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.2c-5 0-9 3.5-9 7.9 0 2.3 1.1 4.4 2.9 5.8L5 21.2l4.5-1.8c.8.2 1.6.3 2.5.3 5 0 9-3.5 9-7.9s-4-8.6-9-8.6z"/></svg></span></div>
<h2>WhatsApp is installed</h2><p>Open <b>WhatsApp</b> from the left menu to link your first number. It takes about a minute.</p>
</div></div>
<script>BX24.init(function(){BX24.installFinish();});</script></body></html>`;
}
