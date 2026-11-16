/* Visual language: Bitrix24's light, airy cards and neutral greys, with WhatsApp green as the
   single accent so the app feels native inside the portal and still recognisable. */
export const STYLES = `
:root{
  --bg:#eef2f4;--card:#fff;--sunken:#f6f8f9;--text:#333d47;--text-2:#525c69;--muted:#828b95;--faint:#a8adb4;
  --line:#e6eaed;--line-2:#d5dbe0;
  --brand:#00a884;--brand-d:#008f70;--brand-soft:#e7f7f2;--brand-ink:#05624d;
  --blue:#2067b0;--blue-soft:#e8f1fb;
  --ok:#16a34a;--ok-soft:#e8f6ee;--warn:#d97706;--warn-soft:#fff5e1;--warn-ink:#8a4b00;
  --bad:#dc2626;--bad-soft:#fdecec;--bad-ink:#a11d1d;--idle:#94a3b8;--idle-soft:#eef1f4;
  --r-sm:8px;--r:12px;--r-lg:16px;
  --sh-1:0 1px 2px rgba(16,24,40,.05);--sh-2:0 4px 16px rgba(16,24,40,.08);--sh-3:0 18px 48px rgba(16,24,40,.18);
  --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box}
html,body{margin:0}
body{font:14px/1.5 "Inter","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif;
  background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.wrap{max-width:1040px;margin:0 auto;padding:24px 20px 48px}
.wrap.compact{padding:16px 16px 24px}
.ico{display:inline-flex;width:18px;height:18px;flex:none}.ico svg{width:100%;height:100%}
.ico.sm{width:16px;height:16px}.ico.lg{width:22px;height:22px}

/* ---------- header ---------- */
.top{display:flex;align-items:center;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.logo{width:48px;height:48px;border-radius:14px;background:linear-gradient(140deg,#25d366,#00a884);display:flex;
  align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 18px rgba(0,168,132,.28);flex:none}
.logo .ico{width:28px;height:28px}
.top .titles{flex:1;min-width:200px}
.top h1{font-size:22px;line-height:1.25;margin:0;font-weight:650;letter-spacing:-.01em}
.top p{margin:2px 0 0;color:var(--muted)}
.summary{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);
  border-radius:99px;padding:6px 12px 6px 10px;font-size:13px;color:var(--text-2);box-shadow:var(--sh-1)}

/* ---------- buttons ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:var(--r-sm);
  border:1px solid var(--line-2);background:var(--card);color:var(--text);font-weight:550;cursor:pointer;white-space:nowrap;
  transition:background .15s,border-color .15s,box-shadow .15s,transform .05s}
.btn:hover{border-color:#bfc7ce;background:#fbfcfc}
.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:0 1px 2px rgba(0,168,132,.3)}
.btn.primary:hover{background:var(--brand-d);border-color:var(--brand-d)}
.btn.ghost{border-color:transparent;background:transparent;color:var(--text-2)}
.btn.ghost:hover{background:var(--sunken)}
.btn.danger{color:var(--bad)}.btn.danger.solid{background:var(--bad);border-color:var(--bad);color:#fff}
.btn.danger.solid:hover{background:#b91c1c}
.btn.sm{height:32px;padding:0 12px;font-size:13px}
.btn.lg{height:46px;padding:0 22px;font-size:15px;border-radius:10px}
.btn.icon{width:34px;height:34px;padding:0}
.btn:disabled{opacity:.55;cursor:default;transform:none}
.btn .spin{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
.link{background:none;border:0;padding:0;color:var(--blue);cursor:pointer;font-weight:550}
.link:hover{text-decoration:underline}

/* ---------- cards ---------- */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-1)}
.pad{padding:20px}
.section-h{display:flex;align-items:center;gap:8px;margin:28px 0 12px;font-size:13px;font-weight:650;color:var(--muted);
  text-transform:uppercase;letter-spacing:.06em}
.section-h .count{background:var(--line);color:var(--text-2);border-radius:99px;padding:0 8px;font-size:12px;letter-spacing:0}

/* ---------- setup guide ---------- */
.guide{padding:20px 20px 8px}
.guide-h{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.guide-h h2{font-size:16px;margin:0;flex:1}
.progress{height:6px;background:var(--line);border-radius:99px;overflow:hidden;width:140px}
.progress i{display:block;height:100%;background:var(--brand);border-radius:99px;transition:width .4s var(--ease)}
.step{display:flex;align-items:center;gap:14px;padding:14px 0;border-top:1px solid var(--line)}
.step .mark{width:28px;height:28px;border-radius:50%;border:2px solid var(--line-2);display:flex;align-items:center;
  justify-content:center;font-size:13px;font-weight:650;color:var(--muted);flex:none}
.step.done .mark{background:var(--brand);border-color:var(--brand);color:#fff}
.step .txt{flex:1;min-width:0}.step .txt b{display:block;font-weight:600}
.step .txt span{color:var(--muted);font-size:13px}
.step.done .txt b{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line-2)}

/* ---------- number card ---------- */
.num{padding:20px;margin-bottom:14px;transition:box-shadow .2s}
.num:hover{box-shadow:var(--sh-2)}
.num-h{display:flex;align-items:flex-start;gap:14px}
.avatar{position:relative;width:46px;height:46px;border-radius:50%;background:var(--brand-soft);color:var(--brand);
  display:flex;align-items:center;justify-content:center;flex:none}
.avatar .ico{width:24px;height:24px}
.avatar.idle{background:var(--idle-soft);color:var(--idle)}.avatar.warn{background:var(--warn-soft);color:var(--warn)}
.avatar.bad{background:var(--bad-soft);color:var(--bad)}
.avatar .dot{position:absolute;right:0;bottom:0;border:2.5px solid var(--card)}
.num-h .who{flex:1;min-width:0}
.name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.name{font-size:16px;font-weight:650;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.rename{opacity:0;transition:opacity .15s}.num:hover .rename,.rename:focus-visible{opacity:1}
.sub-row{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;margin-top:2px;flex-wrap:wrap}
.sep{width:3px;height:3px;border-radius:50%;background:var(--faint)}
.name-input{font-size:16px;font-weight:650;border:1px solid var(--brand);border-radius:6px;padding:2px 8px;width:min(320px,100%);
  box-shadow:0 0 0 3px var(--brand-soft);outline:none}

.dot{width:10px;height:10px;border-radius:50%;background:var(--idle);display:inline-block;flex:none}
.dot.ok{background:var(--ok);box-shadow:0 0 0 0 rgba(22,163,74,.5);animation:pulse 2.4s infinite}
.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.state-txt.ok{color:var(--ok)}.state-txt.warn{color:var(--warn-ink)}.state-txt.bad{color:var(--bad-ink)}
.chip{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:1px 9px;font-size:12px;font-weight:600;line-height:20px}
.chip.star{background:#fff6dd;color:#8a5d00}.chip.ok{background:var(--ok-soft);color:#166534}
.chip.info{background:var(--blue-soft);color:var(--blue)}.chip.muted{background:var(--idle-soft);color:var(--text-2)}
.chip .ico{width:13px;height:13px}

.alert{display:flex;align-items:center;gap:12px;border-radius:var(--r);padding:12px 14px;margin-top:16px;font-size:13px}
.alert .ico{flex:none}.alert .grow{flex:1;min-width:0}.alert b{display:block;font-size:14px}
.alert.warn{background:var(--warn-soft);color:var(--warn-ink)}
.alert.bad{background:var(--bad-soft);color:var(--bad-ink)}
.alert.info{background:var(--blue-soft);color:#1b4f86}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:var(--r);overflow:hidden;margin-top:18px}
.stat{background:var(--sunken);padding:12px 14px}
.stat .v{font-size:20px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums}
.stat .v.sm{font-size:15px;padding-top:4px}
.stat .k{color:var(--muted);font-size:12px;margin-top:2px}

.settings{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:18px 28px;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}
.field .lbl{display:block;font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px}
.field .help{font-size:12px;color:var(--muted);margin-top:6px}
.field .help.warn{color:var(--warn-ink)}
.toggles{display:flex;flex-direction:column;gap:14px}

input[type=text],input[type=tel],input[type=number],select,textarea{width:100%;height:40px;border:1px solid var(--line-2);border-radius:var(--r-sm);
  padding:0 12px;background:#fff;transition:border-color .15s,box-shadow .15s}
select{appearance:none;-webkit-appearance:none;padding-right:34px;cursor:pointer;
  background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23828b95'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E") no-repeat right 10px center/18px}
textarea{height:auto;min-height:96px;padding:10px 12px;resize:vertical;line-height:1.5}
input:hover,select:hover,textarea:hover{border-color:#bfc7ce}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}

/* switch */
.switch{display:flex;align-items:flex-start;gap:12px;cursor:pointer}
.switch input{position:absolute;opacity:0;width:0;height:0}
.switch .track{position:relative;width:38px;height:22px;border-radius:99px;background:var(--line-2);flex:none;transition:background .2s;margin-top:1px}
.switch .track:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s var(--ease)}
.switch input:checked+.track{background:var(--brand)}
.switch input:checked+.track:after{transform:translateX(16px)}
.switch input:focus-visible+.track{outline:2px solid var(--brand);outline-offset:2px}
.switch input:disabled+.track{opacity:.6}
.switch .t b{display:block;font-weight:600;font-size:14px}.switch .t span{display:block;color:var(--muted);font-size:12px}

/* menu */
.menu-wrap{position:relative}
.menu{position:absolute;right:0;top:calc(100% + 6px);min-width:220px;background:#fff;border:1px solid var(--line);border-radius:var(--r);
  box-shadow:var(--sh-2);padding:6px;z-index:20;display:none;animation:pop .14s var(--ease)}
.menu.open{display:block}
.menu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:9px 10px;border-radius:7px;cursor:pointer;color:var(--text)}
.menu button:hover,.menu button:focus-visible{background:var(--sunken);outline:none}
.menu button.danger{color:var(--bad)}.menu hr{border:0;border-top:1px solid var(--line);margin:6px 2px}

/* ---------- features ---------- */
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.feature{padding:18px}
.feature .fi{width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;margin-bottom:10px}
.feature b{display:block;margin-bottom:2px}.feature span{color:var(--muted);font-size:13px}

/* ---------- empty state ---------- */
.empty{text-align:center;padding:48px 24px}
.empty .art{width:84px;height:84px;margin:0 auto 18px;border-radius:24px;background:linear-gradient(140deg,#25d366,#00a884);color:#fff;
  display:flex;align-items:center;justify-content:center;box-shadow:0 12px 30px rgba(0,168,132,.3)}
.empty .art .ico{width:44px;height:44px}
.empty h2{font-size:20px;margin:0 0 6px}.empty p{color:var(--muted);margin:0 auto 22px;max-width:460px}
.empty.small{padding:28px 20px}.empty.small .art{width:56px;height:56px;border-radius:16px;margin-bottom:12px}
.empty.small .art .ico{width:28px;height:28px}.empty.small h2{font-size:16px}
.ticks{display:flex;justify-content:center;gap:22px;flex-wrap:wrap;margin-top:22px;color:var(--text-2);font-size:13px}
.ticks span{display:inline-flex;align-items:center;gap:6px}.ticks .ico{color:var(--brand)}

/* ---------- dialog ---------- */
.modal{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:flex-start;justify-content:center;
  padding:48px 16px;z-index:50;overflow-y:auto;backdrop-filter:blur(2px)}
.modal.open{display:flex;animation:fade .15s ease}
.modal .box{position:relative;background:#fff;border-radius:18px;width:100%;max-width:560px;box-shadow:var(--sh-3);animation:rise .2s var(--ease)}
.modal .box.narrow{max-width:420px}
.dlg-h{display:flex;align-items:flex-start;gap:12px;padding:22px 24px 0}
.dlg-h h2{font-size:18px;margin:0;flex:1;line-height:1.3}
.dlg-h p{margin:4px 0 0;color:var(--muted);font-size:13px}
.dlg-b{padding:18px 24px}
.dlg-f{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px 20px;flex-wrap:wrap}
.dlg-f .grow{flex:1}

.stepper{display:flex;gap:6px;padding:16px 24px 0}
.stepper div{flex:1;height:4px;border-radius:99px;background:var(--line);transition:background .3s}
.stepper div.on{background:var(--brand)}
.kicker{font-size:12px;font-weight:650;color:var(--brand);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}

.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chips button{border:1px solid var(--line-2);background:#fff;border-radius:99px;padding:5px 12px;font-size:13px;cursor:pointer;color:var(--text-2)}
.chips button:hover{border-color:var(--brand);color:var(--brand-ink);background:var(--brand-soft)}

.tabs{display:inline-flex;background:var(--sunken);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px;margin-bottom:16px}
.tabs button{border:0;background:none;border-radius:7px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer}
.tabs button.on{background:#fff;color:var(--text);box-shadow:var(--sh-1)}

.pair{display:grid;grid-template-columns:1fr 252px;gap:22px;align-items:center}
.howto{margin:0;padding:0;list-style:none;counter-reset:s}
.howto li{counter-increment:s;display:flex;gap:10px;margin-bottom:12px;color:var(--text-2);font-size:13px;line-height:1.45}
.howto li:before{content:counter(s);width:22px;height:22px;border-radius:50%;background:var(--brand-soft);color:var(--brand-ink);
  font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex:none}
.howto b{color:var(--text)}
.qr{position:relative;width:252px;height:252px;border-radius:14px;border:1px solid var(--line);background:#fff;display:flex;
  align-items:center;justify-content:center;overflow:hidden}
.qr img{width:236px;height:236px;image-rendering:pixelated}
.qr .veil{position:absolute;inset:0;background:rgba(255,255,255,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  text-align:center;padding:18px;font-size:13px;color:var(--text-2)}
.qr .badge-ok{width:64px;height:64px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .3s var(--ease)}
.qr .badge-ok .ico{width:34px;height:34px}
.qr-status{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;font-size:13px;color:var(--muted);min-height:20px}
.code{font:700 30px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:6px;text-align:center;padding:14px;
  background:var(--sunken);border:1px dashed var(--line-2);border-radius:var(--r);margin:14px 0 8px;user-select:all}

.options{display:flex;flex-direction:column;gap:10px}
.opt{display:flex;align-items:center;gap:12px;border:1.5px solid var(--line);border-radius:var(--r);padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s}
.opt:hover{border-color:var(--line-2)}
.opt.on{border-color:var(--brand);background:var(--brand-soft)}
.opt input[type=radio]{accent-color:var(--brand);width:18px;height:18px;margin:0;flex:none}
.opt .t{flex:1;min-width:0}.opt .t>b{display:block;font-weight:600}.opt .t>span{display:block;color:var(--muted);font-size:12px}
.opt input[type=text]{margin-top:8px;height:36px}

/* ---------- toast ---------- */
.toasts{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:60;align-items:center;pointer-events:none}
.toast{display:flex;align-items:center;gap:10px;background:#1f2937;color:#fff;border-radius:10px;padding:10px 14px 10px 12px;box-shadow:var(--sh-3);
  font-size:13px;max-width:min(520px,calc(100vw - 32px));animation:rise .2s var(--ease);pointer-events:auto}
.toast .ico{color:#4ade80}.toast.bad .ico{color:#f87171}.toast.out{opacity:0;transform:translateY(6px);transition:all .2s}

/* ---------- skeleton ---------- */
.sk{background:linear-gradient(90deg,#eceff1 25%,#f5f7f8 37%,#eceff1 63%);background-size:400% 100%;animation:shimmer 1.4s ease infinite;border-radius:8px}

/* ---------- CRM tab / connector frame ---------- */
.crm-h{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.crm-h .titles{flex:1;min-width:180px}.crm-h h1{font-size:17px;margin:0}.crm-h p{margin:0;color:var(--muted);font-size:13px}
.logo.sm{width:38px;height:38px;border-radius:11px}.logo.sm .ico{width:22px;height:22px}
.from{display:flex;align-items:center;gap:8px}.from select{width:auto;min-width:220px;height:36px}
.phones{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.phones button{display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--line-2);background:#fff;border-radius:99px;padding:6px 14px;cursor:pointer;font-weight:600}
.phones button span{color:var(--muted);font-weight:400;font-size:12px}
.phones button.on{border-color:var(--brand);background:var(--brand-soft);color:var(--brand-ink)}
.composer{padding:16px}
.composer textarea{border:0;box-shadow:none;padding:4px 2px;min-height:110px;resize:none;font-size:15px}
.composer textarea:focus{box-shadow:none}
.composer-f{display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:12px;margin-top:6px;flex-wrap:wrap}
.composer-f .grow{flex:1;color:var(--muted);font-size:12px;min-width:140px}
.counter{font-variant-numeric:tabular-nums}.counter.bad{color:var(--bad)}
kbd{font:600 11px ui-monospace,Menlo,monospace;border:1px solid var(--line-2);border-bottom-width:2px;border-radius:4px;padding:0 4px;background:#fff}
.hint-row{display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--muted);font-size:12px}

.foot{color:var(--faint);font-size:12px;text-align:center;margin-top:28px}.foot a{color:var(--muted)}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.grow{flex:1;min-width:0}.muted{color:var(--muted)}
.help{font-size:12px;color:var(--muted);margin-top:6px}.help.warn{color:var(--warn-ink)}
.st{display:inline-flex;align-items:center;gap:6px}.st .dot{width:8px;height:8px}
.btn.ghost.danger{color:var(--bad)}.btn.ghost.danger:hover{background:var(--bad-soft)}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.45)}70%{box-shadow:0 0 0 7px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
@media (max-width:760px){
  .settings{grid-template-columns:1fr}.features{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}
  .pair{grid-template-columns:1fr}.pair .qr{margin:0 auto}
}
@media (max-width:480px){.wrap{padding:16px 12px 32px}.top h1{font-size:19px}.from select{min-width:0;width:100%}.from{width:100%}}
`;
