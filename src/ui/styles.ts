export const STYLES = `
:root{--bg:#f5f7f8;--card:#fff;--text:#1f2a33;--muted:#6b7a86;--line:#e3e8eb;--brand:#1fa855;--brand-d:#178a45;--danger:#d93a3a;--warn:#c98a06;--radius:10px}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:980px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 12px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:14px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:180px}
.btn{border:1px solid var(--line);background:#fff;color:var(--text);border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer}
.btn:hover{border-color:#c5cfd5}.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}.btn.primary:hover{background:var(--brand-d)}
.btn.danger{color:var(--danger)}.btn:disabled{opacity:.5;cursor:default}
input[type=text],input[type=tel],select,textarea{border:1px solid var(--line);border-radius:8px;padding:7px 10px;font:inherit;background:#fff;color:var(--text);width:100%}
textarea{min-height:70px;resize:vertical}
.badge{display:inline-block;border-radius:99px;padding:2px 9px;font-size:12px;font-weight:600}
.b-connected{background:#e3f6ea;color:#16753c}.b-qr,.b-connecting{background:#fff4dc;color:#8a5d00}
.b-disconnected,.b-offline,.b-new{background:#eef1f3;color:#55636e}.b-logged_out{background:#fde7e7;color:#a12a2a}
.num{display:grid;grid-template-columns:1fr auto;gap:12px}.num .meta{color:var(--muted);font-size:13px}
.num .ctl{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px}
.lbl{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
.err{color:var(--danger);font-size:13px}.ok{color:#16753c;font-size:13px}.muted{color:var(--muted)}
.modal{position:fixed;inset:0;background:rgba(15,25,30,.45);display:none;align-items:center;justify-content:center;padding:16px}
.modal.open{display:flex}.modal .box{background:#fff;border-radius:12px;max-width:420px;width:100%;padding:20px;text-align:center}
.qr{width:264px;height:264px;margin:12px auto;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px}
.qr img{width:256px;height:256px}.steps{text-align:left;color:var(--muted);font-size:13px;padding-left:18px}
.code{font:600 26px/1.2 ui-monospace,Menlo,monospace;letter-spacing:4px;margin:10px 0}
.phone{border-top:1px solid var(--line);padding:12px 0}.phone:first-child{border-top:0}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:24px}
@media (max-width:560px){.num{grid-template-columns:1fr}}
`;
