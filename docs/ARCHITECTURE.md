# Architecture and flows

One Node.js process runs the HTTP server, the WhatsApp engine (one Baileys WebSocket per linked
number) and the queue workers. PostgreSQL holds state; Redis backs the BullMQ queues.

## 1. Install (verified)
1. Bitrix POSTs the install frame to `/install` with `member_id`, `AUTH_ID`, `REFRESH_ID`.
2. The server exchanges `REFRESH_ID` at **oauth.bitrix.info**. Only Bitrix can answer, only for
   tokens issued to this app, and the answer states the true `member_id`, domain and REST
   endpoint. A forged POST fails here (the original connector trusted the POST as-is).
3. The portal row is stored (tokens AES-256-GCM encrypted) and everything is registered
   (`src/bitrix/registration.ts`): connector, events, CRM tabs and list menus (fixed entities and
   every Smart Process), robot, BP activity, SMS provider.
4. `ONAPPINSTALL` delivers the `application_token` that authenticates later events. If it never
   arrives, the next app open triggers `event.test` → `ONAPPTEST` to recover it.

## 2. Linking a number
1. Admin page → `POST /api/numbers` → `POST /api/numbers/:id/connect` starts a Baileys socket.
2. WhatsApp sends rotating QR strings; the page polls `/api/numbers/:id/qr` and shows them.
   Alternatively `/pairing-code` returns an 8-character code for "Link with phone number".
3. On scan the socket opens; the phone number is stored and the login keys are saved encrypted in
   `wa_auth`. On restart every linked number reconnects without a new scan.
4. The number is bound to an Open Line (`imconnector.activate`).

## 3. Customer → Bitrix (inbound)
1. Baileys emits `messages.upsert` (type `notify`). The engine parses the content, downloads and
   decrypts media into the media store, resolves the contact's phone (handling WhatsApp's
   privacy `@lid` ids via the LID mapping) and enqueues a normalized job (`jobId` = WhatsApp id).
2. The inbound worker (serialized per conversation) claims the message in `message_log`, then calls
   `imconnector.send.messages` with a **stable chat id** (`<phone>@s.whatsapp.net`), the
   contact's name and avatar, quoted text and file URLs.
3. Bitrix opens or continues the Open Line chat; the CRM tracker links the contact / lead / deal.
   The chat is titled after the customer once.
4. Calls, reactions, deletions and edits become operator-only notes in the same chat.

## 4. Operator → customer (outbound)
1. `ONIMCONNECTORMESSAGEADD` → `/events/message-add`, authenticated by `application_token`.
   Our own notes (`[WhatsApp] ` prefix / `system=Y`) are never forwarded.
2. The outbound worker claims the Bitrix message id (a redelivery never sends twice), converts
   BBCode to WhatsApp formatting, downloads attachments from the portal (portal hosts only) and
   sends through the engine's paced queue.
3. `imconnector.send.status.delivery` marks the message delivered; later WhatsApp read receipts
   call `imconnector.send.status.reading`.
4. If every retry fails, an operator-only note "not delivered" is posted into the chat.

## 5. CRM → customer (tab, robot, SMS provider)
- **CRM tab** (`/crm/tab`, every entity incl. Smart Processes): phones are resolved from the item
  and its contacts / company; "Start chat" opens the Open Line chat, "Send" queues a message.
- **Robot / BP activity** (`/bitrix/robot`): document id → CRM item → phone (unless given) →
  queue. A timeline comment records the send.
- **SMS provider** (`/bitrix/sms`): Bitrix's SMS sends become WhatsApp messages; delivery status
  is reported with `messageservice.message.status.update`.
- In all three cases the number is checked on WhatsApp first and the sent text is mirrored into
  the client's Open Line chat.

## 6. Reliability
- Idempotency: `message_log` unique keys per direction (WhatsApp id or Bitrix id), plus BullMQ job
  ids, so webhook/event redeliveries and retries never duplicate a message.
- Ordering: a keyed mutex keeps messages of one conversation in order while different
  conversations run in parallel.
- Retries: 6 attempts with exponential backoff; an unbound number's messages wait up to 24 h.
- Reconnects: capped exponential backoff; logged-out devices are marked and their keys wiped.

## 7. Security
- Install and app opens verified with Bitrix's OAuth server; events by `application_token`, with a
  fallback that checks the access token against the portal's **stored** endpoint.
- Admin API: short-lived HMAC session token bound to one portal; every lookup is portal-scoped.
- Secrets at rest (OAuth tokens, WhatsApp keys) encrypted with AES-256-GCM.
- Media served with random keys, `nosniff`, a sandbox CSP, and non-media forced to download.
- Errors never echo internals to the caller; logs redact tokens and message text.
