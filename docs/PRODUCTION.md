# Running in production

The laptop setup (`scripts/local.sh`) is for testing: it stops when the computer sleeps, and its free
tunnel address changes, which breaks the app in Bitrix24 until both paths are updated. For daily
use, run it on a small server with a permanent HTTPS address.

## What you need
- **A VPS** with Ubuntu 22.04/24.04 or Debian 12, at least 2 vCPU / 2 GB RAM (4 GB for dozens of
  numbers) and 25 GB disk. Any provider works (Hetzner, DigitalOcean, Vultr, AWS Lightsail…).
  Choose a region close to your Bitrix24 portal or your team.
- **An address** (pick one):
  - your own subdomain, e.g. `wa.yourcompany.com`: add a DNS **A record** pointing at the server's IP;
  - or no domain at all: the installer offers `<server-ip>.sslip.io`, which also gets a real certificate.
- **Open ports** 22 (SSH), 80 and 443 in the provider's firewall.

## Install
```bash
ssh root@SERVER_IP
git clone https://github.com/averlonworld/Bitrix24-Whatsapp.git /opt/bitrix24-whatsapp
sudo bash /opt/bitrix24-whatsapp/scripts/install.sh
```
It installs Docker, asks for the address and the Bitrix24 client_id / client_secret, generates all
secrets, and starts the app, PostgreSQL, Redis, Caddy (automatic HTTPS) and the backup service.
Everything restarts by itself after a crash or a reboot.

## Server that already has a web server or a Cloudflare Tunnel
If ports 80/443 are already used (nginx, Apache…) or the server publishes sites through a
Cloudflare Tunnel, do not start Caddy. Add to `.env`:
```
COMPOSE_FILE=docker-compose.yml:deploy/docker-compose.behind-proxy.yml
APP_PORT=3010
```
The app then listens on `127.0.0.1:3010` only. Point your proxy at it, e.g. for a locally managed
Cloudflare Tunnel add to `/etc/cloudflared/config.yml` (above the final `http_status:404` rule):
```yaml
  - hostname: whatsapp.example.com
    service: http://localhost:3010
```
then `cloudflared tunnel route dns <tunnel-id> whatsapp.example.com` and
`sudo systemctl restart cloudflared`.

## Moving the laptop test setup to the server (no new QR scan)
1. On the laptop, in the project folder (Git Bash): `bash scripts/export.sh`.
   This **stops the laptop app** (a WhatsApp login must never run in two places) and creates
   `wa-export-<date>.tar.gz`. It contains the WhatsApp logins and their keys: handle it like a password.
2. Copy it to the server: `scp wa-export-*.tar.gz root@SERVER_IP:/opt/bitrix24-whatsapp/`
3. On the server: `cd /opt/bitrix24-whatsapp && sudo bash scripts/import.sh wa-export-<date>.tar.gz`
4. In Bitrix24 → Developer resources → your Local application, set both paths to the server
   (`https://DOMAIN/install` and `https://DOMAIN/`), **Save**, and open the app once. It re-registers
   the connector, CRM tabs, robot and SMS provider with the new address. Numbers reconnect by themselves.
5. Delete the export file from both machines once everything works.

## Backups
- The `backup` service writes a compressed database dump to `/opt/bitrix24-whatsapp/backups` every
  24 hours and keeps `BACKUP_KEEP_DAYS` days (default 14).
- **Also keep a copy of `.env` somewhere safe.** `TOKEN_ENC_KEY` in it is the only way to decrypt
  the WhatsApp logins and Bitrix24 tokens in a dump.
- Backups on the same disk do not survive losing the server. Copy them off it as well, e.g. enable
  your provider's snapshot backups, or sync the folder to object storage on a schedule.
- Restore: `bash scripts/restore.sh backups/wa-YYYYMMDD-HHMMSS.sql.gz`

## Access control
- Only **Bitrix24 administrators** can link, unlink, rename or configure numbers and see QR codes.
  This is checked on every app open and enforced by the server. Other employees see a read-only
  dashboard, and can still message clients from the WhatsApp tab in CRM records.

## Monitoring
- **Disconnect alerts:** when a linked number is logged out on the phone, disconnected, or stuck
  reconnecting for 10 minutes, every administrator who has opened the app gets a Bitrix24
  notification, and another one when it is back online. Needs the `im` permission.
- **Missing permissions:** the app compares what the portal granted with what it needs and shows
  administrators a red banner with the fix (add the permission, Save, Reinstall).
- `https://DOMAIN/health?deep=1` returns `{"ok":true,"db":true,"redis":true}` (HTTP 503 if the
  database or Redis is down). Add it to a free uptime monitor (UptimeRobot, Better Stack…) to get
  an email or SMS when anything fails. Plain `/health` only proves the web server is up.
- Logs: `cd /opt/bitrix24-whatsapp && docker compose logs -f app`. They rotate at 5 × 10 MB per
  container, so they can never fill the disk.
- Number status (online, logged out…) is shown in the app. The phone must come online at least
  every ~14 days, or WhatsApp logs the linked device out.

## Updates
```bash
cd /opt/bitrix24-whatsapp && sudo bash scripts/install.sh
```
Re-running the installer pulls the latest code and rebuilds. Settings, data and WhatsApp logins are kept.

## Security checklist
- Log in with SSH keys and disable password login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).
- Enable the firewall: `ufw allow 22,80,443/tcp && ufw enable` (the installer opens 80/443 if ufw is active).
- Keep the OS patched: `apt install unattended-upgrades`.
- `.env` and `backups/` are readable by root only. Never commit or share them.
- Only PostgreSQL's and Redis's internal Docker network can reach them; no database port is published.

## Selling it: billing with Stripe (Bitrix24 Market SaaS)
Bitrix24 Market lets apps charge users for the external service themselves (in USD/EUR). This
app bills **per linked WhatsApp number, monthly**, after a **14-day free trial** (up to
`TRIAL_MAX_NUMBERS` numbers). Without Stripe keys billing is off and everything is unlimited.

1. In Stripe: create a Product "WhatsApp for Bitrix24" with a **recurring, per-unit, monthly** price.
   Copy its id (`price_...`) to `STRIPE_PRICE_ID`.
2. Developers -> API keys: copy the secret key to `STRIPE_SECRET_KEY` (use test mode first).
3. Developers -> Webhooks -> Add endpoint `https://DOMAIN/billing/stripe/webhook` with the events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Settings -> Billing -> Customer portal: enable it (invoices, update card, cancel).
5. Put your own portal's member_id in `BILLING_EXEMPT_MEMBER_IDS` so it never needs to pay.
6. `docker compose up -d app` to apply.

How it behaves:
- **Trial:** full features, up to `TRIAL_MAX_NUMBERS` numbers, for `TRIAL_DAYS` days from install.
- **Subscribed:** as many numbers as paid for; admins change the quantity in the app (prorated) and
  open Stripe's portal for invoices and card changes. Checkout opens in a new tab (Stripe cannot
  run inside the Bitrix24 frame).
- **Payment failed (past_due):** keeps working while Stripe retries, but no new numbers.
- **Ended:** sending pauses (CRM tab, robots, SMS provider, operator replies get a note); incoming
  messages still arrive so nothing is lost.

## Uninstall and data deletion
- Uninstalled with **"Clear application data"**: the WhatsApp devices are unlinked, the Stripe
  subscription is cancelled, and all of the portal's data is deleted immediately.
- Uninstalled without it: sockets stop and billing ends at the period end; data is kept 30 days so
  a reinstall resumes without a new QR scan, then deleted automatically.
- Bitrix24 REST calls (method, outcome, timing; never tokens or message data) are logged in the
  `rest_log` table for 7 days (the Market asks for at least 3).
