import { config } from '../config.js';
import type { Portal } from '../types.js';

export type LicenseState = 'disabled' | 'exempt' | 'trial' | 'active' | 'past_due' | 'expired';

export interface License {
  state: LicenseState;
  /** How many WhatsApp numbers this portal may have; null = unlimited. */
  maxNumbers: number | null;
  canLink: boolean;
  canSend: boolean;
  trialDaysLeft: number | null;
  paidNumbers: number | null;
  periodEnd: number | null;
}

type BillingFields = Pick<Portal, 'member_id' | 'trial_ends_at' | 'sub_status' | 'sub_quantity' | 'sub_period_end'>;
interface LicenseConfig {
  enabled: boolean;
  trialMaxNumbers: number;
  exempt: readonly string[];
}

/** Pure rule set (unit-tested). Stripe dunning decides when past_due becomes canceled or unpaid. */
export function licenseFor(p: BillingFields, now: number, cfg: LicenseConfig): License {
  const base = { trialDaysLeft: null, paidNumbers: p.sub_quantity ?? null, periodEnd: p.sub_period_end ?? null };
  if (!cfg.enabled) return { ...base, state: 'disabled', maxNumbers: null, canLink: true, canSend: true };
  if (cfg.exempt.includes(p.member_id)) return { ...base, state: 'exempt', maxNumbers: null, canLink: true, canSend: true };
  if (p.sub_status === 'active' || p.sub_status === 'trialing') {
    return { ...base, state: 'active', maxNumbers: p.sub_quantity ?? 1, canLink: true, canSend: true };
  }
  if (p.sub_status === 'past_due') {
    // Card failed: keep working while Stripe retries, and remind. No new numbers until it is paid.
    return { ...base, state: 'past_due', maxNumbers: p.sub_quantity ?? 1, canLink: false, canSend: true };
  }
  if (p.trial_ends_at && p.trial_ends_at > now) {
    const trialDaysLeft = Math.max(1, Math.ceil((p.trial_ends_at - now) / 86_400));
    return { ...base, state: 'trial', maxNumbers: cfg.trialMaxNumbers, canLink: true, canSend: true, trialDaysLeft };
  }
  return { ...base, state: 'expired', maxNumbers: 0, canLink: false, canSend: false };
}

export function billingEnabled(): boolean {
  const c = config();
  return Boolean(c.stripeSecretKey && c.stripePriceId);
}

export function licenseOf(p: BillingFields, now = Math.floor(Date.now() / 1000)): License {
  const c = config();
  return licenseFor(p, now, { enabled: billingEnabled(), trialMaxNumbers: c.trialMaxNumbers, exempt: c.billingExemptMemberIds });
}

export const PAYMENT_REQUIRED_MESSAGE =
  'The WhatsApp subscription for this Bitrix24 has ended. An administrator can renew it in the WhatsApp app (Billing).';
