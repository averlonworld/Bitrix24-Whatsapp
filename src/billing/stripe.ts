import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Minimal Stripe client (no SDK): a handful of form-encoded calls with a pinned API version, so
 * field shapes (e.g. subscription.current_period_end) cannot change under us.
 */
const API = 'https://api.stripe.com/v1';
const VERSION = '2024-06-20';

export class StripeError extends Error {}

/** Stripe form encoding: nested objects and arrays become a[b][0][c]=v. */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') parts.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      parts.push(formEncode(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

async function stripe<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
  const key = config().stripeSecretKey;
  if (!key) throw new StripeError('Billing is not configured');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Version': VERSION,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? formEncode(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !json) throw new StripeError(json?.error?.message ?? `Stripe HTTP ${res.status}`);
  return json;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  items: { data: Array<{ id: string; quantity: number }> };
}

export const createCheckout = (p: { portalId: string; customerId: string | null; quantity: number; returnUrl: string }) =>
  stripe<{ url: string }>('POST', '/checkout/sessions', {
    mode: 'subscription',
    client_reference_id: p.portalId,
    customer: p.customerId ?? undefined,
    line_items: [{ price: config().stripePriceId, quantity: p.quantity, adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 } }],
    subscription_data: { metadata: { portal_id: p.portalId } },
    metadata: { portal_id: p.portalId },
    allow_promotion_codes: true,
    success_url: `${p.returnUrl}?paid=1`,
    cancel_url: `${p.returnUrl}?paid=0`,
  });

export const createPortalSession = (customerId: string, returnUrl: string) =>
  stripe<{ url: string }>('POST', '/billing_portal/sessions', { customer: customerId, return_url: returnUrl });

export const getSubscription = (id: string) => stripe<StripeSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);

/** Change how many numbers are paid for; Stripe prorates the difference on the next invoice. */
export async function setQuantity(subscriptionId: string, quantity: number): Promise<StripeSubscription> {
  const sub = await getSubscription(subscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new StripeError('Subscription has no items');
  await stripe('POST', `/subscription_items/${encodeURIComponent(item.id)}`, { quantity, proration_behavior: 'create_prorations' });
  return getSubscription(subscriptionId);
}

export const cancelNow = (subscriptionId: string) => stripe<StripeSubscription>('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
export const cancelAtPeriodEnd = (subscriptionId: string) =>
  stripe<StripeSubscription>('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: true });

/** Verify a webhook Stripe-Signature header (t=...,v1=...) against the raw request body. */
export function verifyWebhook(
  rawBody: string,
  header: string | undefined,
  secret: string,
  now = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('=') as [string, string]);
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
