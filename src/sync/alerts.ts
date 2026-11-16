import { call } from '../bitrix/client.js';
import { listAdmins } from '../db/users.js';
import { listActiveNumbers, setAlertedStatus } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { nowSec } from '../db/pool.js';
import { logger } from '../logger.js';
import type { WaNumber } from '../types.js';

/**
 * Tells portal administrators (inside Bitrix24) when a linked number stops working and when it is
 * back, so a logged-out phone is fixed in minutes instead of being noticed days later.
 *
 * Only real problems alert: a number an admin paused or logged out from the app has no last_error
 * and stays quiet. Each incident alerts once (alerted_status), then once more on recovery.
 */
const GRACE_SEC: Record<string, number> = {
  logged_out: 60, // keys are gone: tell them almost at once
  disconnected: 120, // e.g. "opened in another place"
  connecting: 600, // network trouble the engine could not fix by itself for 10 minutes
};

type AlertInput = Pick<WaNumber, 'phone' | 'status' | 'last_error' | 'status_changed_at' | 'alerted_status'>;
export type AlertAction = 'down' | 'recovered' | 'clear' | null;

export function alertDecision(n: AlertInput, now: number): AlertAction {
  if (!n.phone) return null; // never linked: nothing to lose
  const problem = n.status === 'connecting' || ((n.status === 'logged_out' || n.status === 'disconnected') && !!n.last_error);
  if (problem) {
    const since = n.status_changed_at ?? now;
    return now - since >= (GRACE_SEC[n.status] ?? 300) && n.alerted_status !== n.status ? 'down' : null;
  }
  if (!n.alerted_status) return null;
  return n.status === 'connected' ? 'recovered' : 'clear'; // clear: resolved by an admin action
}

function who(n: WaNumber) {
  return `"${n.label}"${n.phone ? ` (+${n.phone})` : ''}`;
}

export function alertMessage(n: WaNumber, action: 'down' | 'recovered'): string {
  if (action === 'recovered') return `[b]WhatsApp ${who(n)} is back online.[/b] Messages are syncing again.`;
  const reason =
    n.status === 'logged_out'
      ? 'It was logged out on the phone, so chats are no longer arriving in Bitrix24. Scan a new QR code to reconnect.'
      : n.status === 'connecting'
        ? 'It has been trying to reconnect for more than 10 minutes. Check that the phone is on and has internet.'
        : `It disconnected: ${n.last_error}`;
  return `[b]WhatsApp ${who(n)} needs attention.[/b][br]${reason}[br]Open the WhatsApp app in the left menu to fix it.`;
}

async function notify(n: WaNumber, action: 'down' | 'recovered') {
  const portal = await getPortalById(n.portal_id);
  if (!portal || portal.status !== 'active') return;
  // Administrators, plus the employee whose own WhatsApp it is.
  const admins = [...new Set([...(await listAdmins(portal.id)), ...(n.owner_user_id ? [n.owner_user_id] : [])])];
  if (!admins.length) {
    logger.warn({ numberId: n.id, action }, 'no administrator known yet to alert - an admin must open the app once');
    return;
  }
  const message = alertMessage(n, action);
  for (const userId of admins) {
    await call(portal, 'im.notify.system.add', { USER_ID: userId, MESSAGE: message, TAG: `wa_alert_${n.id}` }).catch((err) =>
      logger.warn({ err: (err as Error).message, numberId: n.id }, 'alert could not be sent'),
    );
  }
  logger.info({ numberId: n.id, action, status: n.status, recipients: admins.length }, 'number alert sent');
}

export async function checkNumbers(): Promise<void> {
  const now = nowSec();
  for (const n of await listActiveNumbers()) {
    const action = alertDecision(n, now);
    if (!action) continue;
    if (action !== 'clear') await notify(n, action).catch((err) => logger.warn({ err: (err as Error).message }, 'alert failed'));
    // Recorded even if sending failed, so a missing permission cannot turn into a message every minute.
    await setAlertedStatus(n.id, action === 'down' ? n.status : null);
  }
}

export function startAlertWatchdog(): NodeJS.Timeout {
  return setInterval(() => void checkNumbers().catch((err) => logger.warn({ err: (err as Error).message }, 'watchdog failed')), 60_000);
}
