import { cancelNow } from '../billing/stripe.js';
import { listNumbers } from '../db/numbers.js';
import { deletePortal, listUninstalledBefore } from '../db/portals.js';
import { exec, nowSec } from '../db/pool.js';
import { logger } from '../logger.js';
import type { Portal } from '../types.js';
import { getEngine } from '../whatsapp/instance.js';

/** Days an uninstalled portal is kept (so a reinstall resumes without a new QR scan) before deletion. */
export const UNINSTALLED_KEEP_DAYS = 30;
const REST_LOG_KEEP_DAYS = 7;

/**
 * Delete everything about a portal: unlink its WhatsApp devices, stop billing, and remove its
 * rows (numbers, WhatsApp logins, chats, message log, users) by cascade.
 */
export async function purgePortal(portal: Portal, reason: string): Promise<void> {
  for (const n of await listNumbers(portal.id)) await getEngine().logout(n.id).catch(() => undefined);
  if (portal.stripe_subscription_id && portal.sub_status && portal.sub_status !== 'canceled') {
    await cancelNow(portal.stripe_subscription_id).catch((err) =>
      logger.warn({ err: (err as Error).message, portalId: portal.id }, 'could not cancel subscription on purge'),
    );
  }
  await deletePortal(portal.id);
  logger.info({ memberId: portal.member_id, reason }, 'portal data deleted');
}

export async function runRetention(): Promise<void> {
  for (const p of await listUninstalledBefore(nowSec() - UNINSTALLED_KEEP_DAYS * 86_400)) {
    await purgePortal(p, `uninstalled more than ${UNINSTALLED_KEEP_DAYS} days ago`).catch((err) =>
      logger.warn({ err: (err as Error).message, portalId: p.id }, 'purge failed'),
    );
  }
  await exec('DELETE FROM rest_log WHERE created_at < $1', [nowSec() - REST_LOG_KEEP_DAYS * 86_400]);
}

export function startRetention(): NodeJS.Timeout {
  void runRetention().catch((err) => logger.warn({ err: (err as Error).message }, 'retention failed'));
  return setInterval(() => void runRetention().catch((err) => logger.warn({ err: (err as Error).message }, 'retention failed')), 6 * 3600_000);
}
