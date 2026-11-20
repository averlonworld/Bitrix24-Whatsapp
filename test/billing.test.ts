import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { licenseFor } from '../src/billing/license.js';
import { formEncode, verifyWebhook } from '../src/billing/stripe.js';

const cfg = { enabled: true, trialMaxNumbers: 5, exempt: ['vendor-member'] };
const base = { member_id: 'm1', trial_ends_at: 10_000, sub_status: null, sub_quantity: null, sub_period_end: null };

describe('licence rules', () => {
  it('is unlimited when billing is off or the portal is exempt', () => {
    expect(licenseFor(base, 99_999, { ...cfg, enabled: false })).toMatchObject({ state: 'disabled', maxNumbers: null, canSend: true });
    expect(licenseFor({ ...base, member_id: 'vendor-member' }, 99_999, cfg)).toMatchObject({ state: 'exempt', canLink: true });
  });
  it('gives a limited trial, then expires', () => {
    expect(licenseFor(base, 10_000 - 86_400 * 3 - 5, cfg)).toMatchObject({ state: 'trial', maxNumbers: 5, trialDaysLeft: 4, canSend: true });
    expect(licenseFor(base, 10_001, cfg)).toMatchObject({ state: 'expired', maxNumbers: 0, canLink: false, canSend: false });
  });
  it('follows the Stripe subscription', () => {
    expect(licenseFor({ ...base, sub_status: 'active', sub_quantity: 20 }, 99_999, cfg)).toMatchObject({ state: 'active', maxNumbers: 20, canLink: true });
    // Card failed: keeps working, but no new numbers until paid.
    expect(licenseFor({ ...base, sub_status: 'past_due', sub_quantity: 20 }, 99_999, cfg)).toMatchObject({ state: 'past_due', canLink: false, canSend: true });
    expect(licenseFor({ ...base, sub_status: 'canceled', sub_quantity: 20 }, 99_999, cfg)).toMatchObject({ state: 'expired', canSend: false });
    // A cancelled subscription inside the trial window falls back to the trial.
    expect(licenseFor({ ...base, sub_status: 'canceled' }, 5_000, cfg).state).toBe('trial');
  });
});

describe('stripe helpers', () => {
  it('form-encodes nested objects and arrays like Stripe expects', () => {
    const s = formEncode({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 3, adjustable_quantity: { enabled: true } }], skip: undefined });
    expect(decodeURIComponent(s)).toBe(
      'mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=3&line_items[0][adjustable_quantity][enabled]=true',
    );
  });
  it('accepts only correctly signed, fresh webhooks', () => {
    const body = '{"id":"evt_1"}';
    const t = 1_700_000_000;
    const sig = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    expect(verifyWebhook(body, `t=${t},v1=${sig}`, 'whsec_test', t + 10)).toBe(true);
    expect(verifyWebhook(body, `t=${t},v1=${sig}`, 'whsec_other', t + 10)).toBe(false);
    expect(verifyWebhook(body + ' ', `t=${t},v1=${sig}`, 'whsec_test', t + 10)).toBe(false);
    expect(verifyWebhook(body, `t=${t},v1=${sig}`, 'whsec_test', t + 3600)).toBe(false); // replay
    expect(verifyWebhook(body, undefined, 'whsec_test', t)).toBe(false);
  });
});
