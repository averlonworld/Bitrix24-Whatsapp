-- Bitrix24 WhatsApp connector schema. Idempotent: applied at every boot (src/db/migrate.ts).

-- One row per Bitrix24 portal that installed the app. member_id survives a domain rename.
CREATE TABLE IF NOT EXISTS portals (
  id                 UUID PRIMARY KEY,
  member_id          TEXT UNIQUE NOT NULL,
  domain             TEXT NOT NULL,
  client_endpoint    TEXT NOT NULL,
  access_token       TEXT NOT NULL,          -- AES-GCM encrypted
  refresh_token      TEXT NOT NULL,          -- AES-GCM encrypted
  access_expires_at  BIGINT NOT NULL DEFAULT 0,
  application_token  TEXT,                   -- authenticates incoming Bitrix events
  connector_version  INTEGER,                -- CONNECTOR_VERSION at the last full registration
  default_number_id  UUID,                   -- number used by the SMS provider / robots when none is chosen
  status             TEXT NOT NULL DEFAULT 'active',   -- active | uninstalled
  installed_at       BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

-- One row per WhatsApp number linked by QR (one Baileys socket each).
CREATE TABLE IF NOT EXISTS wa_numbers (
  id              UUID PRIMARY KEY,
  portal_id       UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  phone           TEXT,                       -- digits, known once linked
  status          TEXT NOT NULL DEFAULT 'new',-- new | qr | connecting | connected | disconnected | logged_out
  last_error      TEXT,
  line_id         INTEGER,                    -- Bitrix Open Line this number feeds
  groups_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wa_numbers_portal ON wa_numbers(portal_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_numbers_line ON wa_numbers(portal_id, line_id) WHERE line_id IS NOT NULL;

-- WhatsApp multi-device login keys (creds + signal keys), encrypted. Full account access: protect it.
CREATE TABLE IF NOT EXISTS wa_auth (
  number_id  UUID NOT NULL REFERENCES wa_numbers(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (number_id, key)
);

-- One row per WhatsApp contact (or group) per number: the link to its Bitrix Open Line chat.
-- Keyed by phone, never by jid: WhatsApp moves a contact between its phone jid and its privacy
-- LID jid at any time, and keying by jid splits one customer across two Bitrix chats.
CREATE TABLE IF NOT EXISTS chat_map (
  id               UUID PRIMARY KEY,
  number_id        UUID NOT NULL REFERENCES wa_numbers(id) ON DELETE CASCADE,
  peer             TEXT NOT NULL,             -- contact phone digits, or the group jid
  chat_id          TEXT NOT NULL,             -- external chat.id given to Bitrix (stable)
  last_jid         TEXT NOT NULL,             -- latest jid seen (phone or LID) - where replies go
  name             TEXT,
  named            BOOLEAN NOT NULL DEFAULT FALSE,
  line_id          INTEGER,                   -- Open Line the Bitrix chat lives on
  bitrix_chat_id   BIGINT,
  last_message_at  BIGINT,
  UNIQUE (number_id, peer)
);
CREATE INDEX IF NOT EXISTS idx_chat_map_bitrix ON chat_map(bitrix_chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_map_chat_id ON chat_map(number_id, chat_id);

-- Every message in both directions. Doubles as the idempotency ledger.
--  direction: in        customer -> Bitrix
--             out       Bitrix operator reply -> customer
--             phone_out typed on the phone itself -> mirrored to Bitrix
--             crm_out   sent from CRM (tab, SMS provider, robot) -> customer
--             event     call / reaction / deletion note
CREATE TABLE IF NOT EXISTS message_log (
  id             UUID PRIMARY KEY,
  number_id      UUID NOT NULL REFERENCES wa_numbers(id) ON DELETE CASCADE,
  direction      TEXT NOT NULL,
  wa_message_id  TEXT,                        -- WhatsApp key.id (real id, both directions)
  ext_ref        TEXT,                        -- Bitrix message id / SMS id / robot event token
  status         TEXT NOT NULL,               -- pending | sent | delivered | read | failed
  error          TEXT,
  meta           JSONB,                       -- e.g. {lineId, chatId, bitrixChatId} for read receipts
  created_at     BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_wa ON message_log(number_id, direction, wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_ext ON message_log(number_id, direction, ext_ref) WHERE ext_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_wa_any ON message_log(number_id, wa_message_id);

-- Disconnect alerts: when a number's status last changed, and which problem admins were told about.
ALTER TABLE wa_numbers ADD COLUMN IF NOT EXISTS status_changed_at BIGINT;
ALTER TABLE wa_numbers ADD COLUMN IF NOT EXISTS alerted_status TEXT;

-- Employees seen opening the app (name for the team view; is_admin decides who gets alerts).
CREATE TABLE IF NOT EXISTS portal_users (
  portal_id     UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL,
  name          TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at  BIGINT NOT NULL,
  PRIMARY KEY (portal_id, user_id)
);
DROP TABLE IF EXISTS portal_admins;  -- superseded by portal_users

-- Sales team mode: a number can belong to one employee (their own WhatsApp). NULL = company number.
ALTER TABLE wa_numbers ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;
ALTER TABLE wa_numbers ADD COLUMN IF NOT EXISTS personal_line BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_numbers_owner ON wa_numbers(portal_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
-- Employees may link their own WhatsApp themselves (admins can switch it off).
ALTER TABLE portals ADD COLUMN IF NOT EXISTS self_link_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Billing (Stripe, per linked WhatsApp number). trial_ends_at is set once, at first install.
ALTER TABLE portals ADD COLUMN IF NOT EXISTS trial_ends_at BIGINT;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS sub_status TEXT;          -- Stripe status: active | past_due | canceled ...
ALTER TABLE portals ADD COLUMN IF NOT EXISTS sub_quantity INTEGER;     -- numbers paid for
ALTER TABLE portals ADD COLUMN IF NOT EXISTS sub_period_end BIGINT;
UPDATE portals SET trial_ends_at = installed_at + 14 * 86400 WHERE trial_ends_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_portals_stripe_customer ON portals(stripe_customer_id);

-- Bitrix24 REST calls (method, outcome, timing - never tokens or payloads). The Market asks
-- server apps to keep at least 3 days of API request logs; rows are purged after 7.
CREATE TABLE IF NOT EXISTS rest_log (
  id          BIGSERIAL PRIMARY KEY,
  portal_id   UUID,
  method      TEXT NOT NULL,
  error       TEXT,
  ms          INTEGER NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rest_log_created ON rest_log(created_at);

-- Automatic replies (Open Line welcome / no-answer / closing / rating). Off unless an admin turns them on.
ALTER TABLE portals ADD COLUMN IF NOT EXISTS auto_replies JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Which Bitrix24 app (client_id) the portal installed: token refreshes must use that app's secret.
ALTER TABLE portals ADD COLUMN IF NOT EXISTS client_id TEXT;
-- Open Lines the app created (one-click and personal lines): the auto-reply settings always apply to them.
CREATE TABLE IF NOT EXISTS app_lines (
  portal_id   UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  line_id     INTEGER NOT NULL,
  created_at  BIGINT NOT NULL,
  PRIMARY KEY (portal_id, line_id)
);

-- Activity log (who changed numbers, settings, billing; WhatsApp / Bitrix24 / Stripe events).
-- Never message content. Purged after 365 days.
CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGSERIAL PRIMARY KEY,
  portal_id      UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  at             BIGINT NOT NULL,
  actor_type     TEXT NOT NULL,            -- user | system | bitrix | stripe
  actor_user_id  INTEGER,
  actor_name     TEXT,
  action         TEXT NOT NULL,            -- e.g. number.deleted, connection.logged_out
  target_type    TEXT,
  target_id      TEXT,
  target_label   TEXT,
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip             TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_portal ON audit_log(portal_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

-- Onboarding tutorial: when each person finished or skipped it (NULL = show it on next open).
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS onboarded_at BIGINT;
