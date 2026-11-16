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

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const connectorId = optional('CONNECTOR_ID', 'wa_qr_connector');
  if (!/^[a-z0-9_]+$/.test(connectorId)) {
    // Bitrix rejects dots and upper case in a connector id.
    throw new Error('CONNECTOR_ID may contain only lowercase letters, digits and underscores');
  }
  cached = {
    publicUrl: required('PUBLIC_URL').replace(/\/$/, ''),
    port: Number(optional('PORT', '3000')),
    bitrixClientId: required('BITRIX_CLIENT_ID'),
    bitrixClientSecret: required('BITRIX_CLIENT_SECRET'),
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
