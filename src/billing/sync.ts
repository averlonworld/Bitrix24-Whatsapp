import { getPortalById, getPortalByStripeCustomer, setBilling } from '../db/portals.js';
import { logger } from '../logger.js';
import type { Portal } from '../types.js';
import { getSubscription, type StripeSubscription } from './stripe.js';

/** Store what Stripe says about a portal's subscription. */
export async function applySubscription(portalId: string, sub: StripeSubscription, deleted = false): Promise<void> {
  await setBilling(portalId, {
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    subStatus: deleted ? 'canceled' : sub.status,
    subQuantity: sub.items?.data?.[0]?.quantity ?? null,
    subPeriodEnd: sub.current_period_end ?? null,
  });
  logger.info({ portalId, status: deleted ? 'canceled' : sub.status, quantity: sub.items?.data?.[0]?.quantity }, 'subscription updated');
}

async function portalFor(metadataPortalId: string | undefined, customerId: string | undefined): Promise<Portal | null> {
  if (metadataPortalId) {
    const p = await getPortalById(metadataPortalId).catch(() => null);
    if (p) return p;
  }
  return customerId ? getPortalByStripeCustomer(customerId) : null;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Handle one verified Stripe webhook event. Unknown events are ignored. Throws to make Stripe retry. */
export async function applyStripeEvent(event: StripeEvent): Promise<void> {
  const o = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const portal = await portalFor(
      (o.client_reference_id as string) || (o.metadata as Record<string, string> | undefined)?.portal_id,
      o.customer as string,
    );
    if (!portal) return void logger.warn({ eventId: event.id }, 'checkout for unknown portal');
    await setBilling(portal.id, { stripeCustomerId: o.customer as string, stripeSubscriptionId: o.subscription as string });
    if (o.subscription) await applySubscription(portal.id, await getSubscription(o.subscription as string));
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    const sub = o as unknown as StripeSubscription;
    const portal = await portalFor(sub.metadata?.portal_id, sub.customer);
    if (!portal) return void logger.warn({ eventId: event.id }, 'subscription for unknown portal');
    await applySubscription(portal.id, sub, event.type === 'customer.subscription.deleted');
  }
}
