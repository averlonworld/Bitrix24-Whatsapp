# Bitrix24 Market submission checklist

## Permissions (scopes) to request, and why
The Market rejects scopes requested "for future use". Request exactly these:

| Scope | Name in Bitrix24 | Why the app needs it |
|---|---|---|
| `imconnector` | External messenger connectors | Registers the WhatsApp channel in Contact Center and delivers messages into Open Line chats |
| `imopenlines` | Open Channels | Lists Open Lines, creates one in one click, and creates a personal Open Line for each salesperson |
| `im` | Chat and notifications | Operator-only notes in chats (messages typed on the phone, copies of CRM sends, delivery failures) and disconnect alerts to administrators |
| `crm` | CRM | WhatsApp tab in leads, deals, contacts, companies and smart processes; finds phones and writes timeline entries |
| `placement` | Application embedding | Adds the WhatsApp tab and list-menu items to CRM records |
| `bizproc` | Business processes | The "Send WhatsApp message" automation rule and business-process action |
| `messageservice` | Messaging service | Lets CRM send "SMS" through WhatsApp |

Without `im`, phone-typed messages and alerts silently fail. The app shows administrators a red
banner whenever a required scope is missing (see `src/bitrix/scopes.ts`).

## Links for the app card
- Licence agreement: `https://DOMAIN/legal/terms`
- Privacy policy: `https://DOMAIN/legal/privacy`
- Fill in `LEGAL_COMPANY_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_ADDRESS`, `LEGAL_GOVERNING_LAW` in `.env`
  first, then `docker compose up -d app`. Have a lawyer review both texts.

## App card (version card)
- Application URL (handler): `https://DOMAIN/`
- Application installer URL: `https://DOMAIN/install`
- "Can be installed by user without administrative rights": **off** (installation registers the
  connector and events, which needs an administrator).
- Pricing block: "Users must pay for the external service". State the price per WhatsApp number per
  month, the 14-day trial and its number limit in the description.

## Before submitting (the Market asks for all of these)
- [ ] Partner account at vendors.bitrix24.com; agreements signed; company details in Sales Settings.
- [ ] Market app created; its client_id / client_secret put in `.env`
      (`BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`); Stripe keys configured (see PRODUCTION.md).
- [ ] Tested on a **clean** Bitrix24: install as administrator, open as a regular employee, link a
      number, send and receive, uninstall **with** "Clear application data" (check the data is gone),
      reinstall.
- [ ] After install the app opens its own interface (no empty page).
- [ ] No JavaScript errors in the browser console; layout works at 1280 px wide.
- [ ] Interface fully localized for the languages you publish in (English required).
- [ ] Icon (PNG/JPEG, square, 250-650 px, no transparency) and screenshots (max 1280x720, English UI,
      realistic demo data, app shown in the slider).
- [ ] Short description (1-2 sentences) and full English description, including paid features and limits.
- [ ] Support channels with working hours and response time (international email / phone / English site).
- [ ] Works on on-premise Bitrix24 as well (the Market requires it; not yet tested).
- [ ] Product name: using "WhatsApp" in the product name may be challenged by Meta; consider a
      distinct brand (e.g. "<Brand> for WhatsApp") and keep the non-affiliation notice.
