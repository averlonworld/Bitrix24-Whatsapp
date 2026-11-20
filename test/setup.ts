import { randomBytes } from 'node:crypto';
import { setConfigForTests } from '../src/config.js';

setConfigForTests({
  publicUrl: 'https://wa.test',
  port: 0,
  bitrixClientId: 'local.test',
  bitrixClientSecret: 'secret',
  bitrixApps: [{ clientId: 'local.test', clientSecret: 'secret' }],
  databaseUrl: process.env.TEST_DATABASE_URL ?? '',
  redisUrl: 'redis://localhost:6379',
  tokenEncKey: randomBytes(32).toString('base64'),
  appSecret: 'test-app-secret',
  connectorId: 'wa_qr_connector',
  connectorName: 'WhatsApp',
  connectorVersion: 1,
  mediaDir: '/tmp/wa-test-media',
  mediaMaxAgeDays: 7,
  sendMinIntervalMs: 0,
  logLevel: 'silent',
  stripeSecretKey: '',
  stripeWebhookSecret: '',
  stripePriceId: '',
  trialDays: 14,
  trialMaxNumbers: 5,
  billingExemptMemberIds: [],
});
