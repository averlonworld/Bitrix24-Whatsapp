/** All runtime configuration, read once from the environment and validated at boot. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export interface Config {
  publicUrl: string;
  port: number;
  bitrixClientId: string;
  bitrixClientSecret: string;
  /**
   * Every Bitrix24 app (client_id + secret) this server answers for: the main one first, then
   * BITRIX_EXTRA_APPS. A "local application" has its own keys on each portal, so testing on several
   * portals before the Market listing needs one pair per portal. A Market app has one pair for all.
   */
  bitrixApps: BitrixApp[];
  databaseUrl: string;
  redisUrl: string;
  tokenEncKey: string;
  appSecret: string;
  connectorId: string;
  connectorName: string;
  connectorVersion: number;
  mediaDir: string;
  mediaMaxAgeDays: number;
  sendMinIntervalMs: number;
  logLevel: string;
  /** Billing (Stripe). Disabled when STRIPE_SECRET_KEY is empty: every portal is unlimited. */
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  /** Recurring per-unit monthly Price: quantity = number of WhatsApp numbers. */
  stripePriceId: string;
  trialDays: number;
  trialMaxNumbers: number;
  /** member_ids that never pay (e.g. the vendor's own portal), comma separated. */
  billingExemptMemberIds: string[];
}

export interface BitrixApp {
  clientId: string;
  clientSecret: string;
}

/** BITRIX_EXTRA_APPS="local.aaa.111:secretA,local.bbb.222:secretB" */
export function parseExtraApps(raw: string): BitrixApp[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      if (i < 1 || i === pair.length - 1) throw new Error('BITRIX_EXTRA_APPS entries must look like client_id:client_secret');
      return { clientId: pair.slice(0, i).trim(), clientSecret: pair.slice(i + 1).trim() };
    });
}

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const connectorId = optional('CONNECTOR_ID', 'wa_qr_connector');
  if (!/^[a-z0-9_]+$/.test(connectorId)) {
    // Bitrix rejects dots and upper case in a connector id.
    throw new Error('CONNECTOR_ID may contain only lowercase letters, digits and underscores');
  }
  const mainApp = { clientId: required('BITRIX_CLIENT_ID'), clientSecret: required('BITRIX_CLIENT_SECRET') };
  const apps = [mainApp, ...parseExtraApps(optional('BITRIX_EXTRA_APPS', ''))].filter(
    (a, i, all) => all.findIndex((b) => b.clientId === a.clientId) === i,
  );
  cached = {
    publicUrl: required('PUBLIC_URL').replace(/\/$/, ''),
    port: Number(optional('PORT', '3000')),
    bitrixClientId: mainApp.clientId,
    bitrixClientSecret: mainApp.clientSecret,
    bitrixApps: apps,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),
    tokenEncKey: required('TOKEN_ENC_KEY'),
    appSecret: required('APP_SECRET'),
    connectorId,
    connectorName: optional('CONNECTOR_NAME', 'WhatsApp'),
    connectorVersion: Number(optional('CONNECTOR_VERSION', '1')),
    mediaDir: optional('MEDIA_DIR', './media'),
    mediaMaxAgeDays: Number(optional('MEDIA_MAX_AGE_DAYS', '7')),
    sendMinIntervalMs: Number(optional('SEND_MIN_INTERVAL_MS', '1500')),
    logLevel: optional('LOG_LEVEL', 'info'),
    stripeSecretKey: optional('STRIPE_SECRET_KEY', ''),
    stripeWebhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
    stripePriceId: optional('STRIPE_PRICE_ID', ''),
    trialDays: Number(optional('TRIAL_DAYS', '14')),
    trialMaxNumbers: Number(optional('TRIAL_MAX_NUMBERS', '5')),
    billingExemptMemberIds: optional('BILLING_EXEMPT_MEMBER_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return cached;
}

/** Tests inject their own configuration. */
export function setConfigForTests(next: Config): void {
  cached = next;
}
