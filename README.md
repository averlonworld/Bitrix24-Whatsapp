# WhatsApp for Bitrix24 (self-hosted, QR login)

Connect any WhatsApp number to Bitrix24 by **scanning a QR code**, exactly like WhatsApp Web.
No WhatsApp Business API, no Meta verification, no third-party gateway, no per-message fees:
this server *is* the WhatsApp Web client for every number you link.

## Where it works in Bitrix24

| Place in Bitrix24 | What you get |
|---|---|
| **Contact Center / Open Lines** | Every WhatsApp chat becomes an Open Line chat. Queues, SLA, transfers, ratings and reports work as for any channel. Bitrix's CRM tracker links or creates the **contact, lead or deal** automatically. |
| **Lead · Deal · Contact · Company · Quote · Invoice** | A **WhatsApp tab** in the card: the client's phones (including the deal's contacts and company), "Open chat", "Start chat" and "Send message". |
| **Every Smart Process (SPA)** | The same tab, plus new Smart Processes get it **the moment they are created** (no reinstall). |
| **CRM lists** | "WhatsApp" in the row menu of Lead, Deal, Contact, Company and every SPA list. |
| **Automation rules (robots)** | **"Send WhatsApp message"** for Lead, Deal and SPA pipelines. The phone is taken from the item (or its contacts / company) when you leave it empty. Optional file URL and sender number. Logged in the timeline. |
| **Business Process designer** | The same "Send WhatsApp message" action. |
| **SMS provider** | WhatsApp appears as an SMS provider, so everything in Bitrix that sends SMS (the activity panel of every CRM card, the standard "Send SMS" robot, Sales Center) can send WhatsApp instead. Delivery status flows back. |
| **Timeline and chat history** | Messages sent from CRM, robots or SMS are mirrored into the client's Open Line chat. Messages typed on the phone itself appear there too, so operators see the whole conversation. |

### Message features
Text with formatting (bold, italic, strike) both ways · photos, videos, voice notes, documents, stickers
both ways · locations as map links · contacts · polls · replies show the quoted message ·
**delivered and read ticks** shown in Contact Center · calls (incoming, missed, declined), reactions,
deletions and edits appear as notes in the chat · optional group chats · several numbers per portal,
each on its own Open Line.

## How it works

```
 Phone scans QR ──▶ ┌──────────────────────────────────────────────┐
                    │  Your server (Docker)                        │
 WhatsApp servers ◀▶│  WhatsApp engine (Baileys, 1 socket/number)  │
                    │      │ events                ▲ send          │
                    │      ▼                       │               │
                    │  Queues (Redis/BullMQ) ◀──▶ Bitrix24 sync    │◀──▶ Bitrix24 REST + events
                    │  PostgreSQL: portals, numbers, encrypted     │
                    │  WhatsApp keys, chats, message log           │
                    │  Media store (disk)                          │
                    └──────────────────────────────────────────────┘
```

Full flow descriptions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements
- A Linux server (VPS) with Docker. 2 vCPU and 4 GB RAM handles dozens of numbers (~50–100 MB each).
- A domain name pointing at the server (Bitrix24 only talks to HTTPS; Caddy gets a free certificate).
- A Bitrix24 portal where you are an administrator.

## Quick install (fresh Ubuntu VPS, ~10 minutes)
```bash
curl -fsSL https://raw.githubusercontent.com/averlonworld/bitrix24-whatsapp/feature/whatsapp-qr-connector/deploy/install.sh | sudo bash
```
It installs Docker, shows you the exact URLs to paste into Bitrix24's Local application form,
asks for the client_id / client_secret, and starts everything with HTTPS. No domain needed: it
uses `<server-ip>.sslip.io` with a real certificate unless you type your own.

## Install (manual)

### 1. Register the app in Bitrix24
In your portal: **Developer resources → Other → Local application** (or a Market app from a
partner account if you want to distribute it).

| Field | Value |
|---|---|
| Type | Server-side, **uses the user interface** |
| Your handler path | `https://YOUR_DOMAIN/` |
| Initial installation path | `https://YOUR_DOMAIN/install` |
| Menu item text | `WhatsApp` |
| Permissions (scopes) | `imconnector`, `imopenlines`, `im`, `crm`, `placement`, `bizproc`, `messageservice` |

Save, then copy the **client_id** and **client_secret** Bitrix shows.

### 2. Start the server
**Quickest:** on a fresh Ubuntu/Debian VPS run the installer. It installs Docker, asks for the
client_id/secret, generates all secrets and starts everything with HTTPS. No domain needed: it
offers a free `<your-ip>.sslip.io` address.
```bash
curl -fsSL https://raw.githubusercontent.com/averlonworld/Bitrix24-Whatsapp/feature/whatsapp-qr-connector/scripts/install.sh | sudo bash
```

**Manual:**
```bash
git clone -b feature/whatsapp-qr-connector https://github.com/averlonworld/Bitrix24-Whatsapp.git
cd Bitrix24-Whatsapp
cp .env.example .env
```
Fill in `.env`: `DOMAIN`, `PUBLIC_URL`, `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`,
`POSTGRES_PASSWORD`, and generate both secrets with `openssl rand -base64 32`
(`TOKEN_ENC_KEY`, `APP_SECRET`). Then:
```bash
docker compose up -d --build
```
Check `https://YOUR_DOMAIN/health` returns `{"ok":true}`.

### Or: run it on your own computer (testing)
Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Windows, run the script
in WSL or Git Bash). A free Cloudflare quick tunnel gives your computer a public HTTPS address.
```bash
git clone -b feature/whatsapp-qr-connector https://github.com/averlonworld/Bitrix24-Whatsapp.git
cd Bitrix24-Whatsapp
bash scripts/local.sh
```
The script prints the two paths to enter in the Bitrix24 Local application. Limits: it only works
while the computer is on and awake, and the tunnel address changes whenever it restarts (the script
detects that and tells you to update the two paths). For real use, deploy to a server.

### 3. Install and link a number
1. In Bitrix24, open the app (it installs on first open) - **WhatsApp** appears in the left menu.
2. Create an Open Line in **Contact Center** if you do not have one.
3. In the app: **Add WhatsApp number** → scan the QR with the phone
   (WhatsApp → Settings → Linked devices → Link a device). Or use **Link with a phone number**
   to get an 8-character code instead of a QR.
4. Pick the Open Line for the number (in the app, or from Contact Center → WhatsApp).
5. Send a WhatsApp message to the number: it appears in Contact Center. Reply from Bitrix24: it
   arrives on WhatsApp.

## Operations
- **Updates:** `git pull && docker compose up -d --build`. Numbers reconnect by themselves.
- **Re-registration:** bump `CONNECTOR_VERSION` in `.env` to re-register the connector,
  placements, robot and SMS provider on every portal at its next app open.
- **Backups:** the `backup` service dumps the database to `backups/` daily (kept 14 days);
  restore with `bash scripts/restore.sh <file>`. Back up `.env` separately: `TOKEN_ENC_KEY`
  decrypts the WhatsApp logins.
- **Moving servers / laptop → server:** `scripts/export.sh` on the old machine, `scripts/import.sh`
  on the new one. No new QR scan needed.
- **Logs:** `docker compose logs -f app` (JSON; tokens and message text are never logged). Rotated
  at 5 × 10 MB per container.
- Full guide: [docs/PRODUCTION.md](docs/PRODUCTION.md).

## Things to know
- **This is an unofficial WhatsApp client.** WhatsApp's terms forbid unofficial clients and can ban
  a number. In practice bans hit spam and bulk sending, not normal customer service. The engine
  paces sending (one message at a time per number, minimum gap, typing indicator); do not use it
  for mass marketing.
- **The phone must come online at least every ~14 days**, or WhatsApp logs the linked device out.
  The app then shows "Logged out" and you scan a new QR.
- **Contacting a customer first** (CRM tab, robot, SMS provider) opens the Open Line chat with a
  short "Conversation started from CRM" line, because Bitrix can only open a chat with a
  customer-side message.
- Messages typed on the phone are mirrored into Bitrix only once a Bitrix chat with that contact
  exists.
- The WhatsApp library (Baileys) must be updated when WhatsApp changes its protocol - usually a
  version bump in `package.json` and a redeploy.

## Development
```bash
npm install
npm run typecheck
npm test                                   # unit tests
TEST_DATABASE_URL=postgres://... npm test  # plus database tests
npm run dev                                # needs .env with PostgreSQL + Redis
```

| Path | What it is |
|---|---|
| `src/whatsapp/` | WhatsApp engine (QR / pairing login, reconnects, paced sending), PostgreSQL key store, message parser |
| `src/bitrix/` | OAuth (with install verification), REST client, registration of every placement / robot / provider, CRM helpers |
| `src/sync/` | Queue processors: inbound → Open Line, operator reply → WhatsApp, CRM sends, receipts, failures |
| `src/http/` | Hono routes: iframe pages, Bitrix events, robot / SMS endpoints, admin API, media |
| `src/ui/` | The three iframe pages (admin, Contact Center settings, CRM tab) - no build step |
| `src/db/` | Schema (applied at boot) and repositories |
