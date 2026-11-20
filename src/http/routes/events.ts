import { Hono, type Context } from 'hono';
import { authenticateEvent, verifyAndStorePortal, type EventAuth } from '../../bitrix/auth.js';
import { call, tokenWorks } from '../../bitrix/client.js';
import { bindSmartProcess, ensureRegistered } from '../../bitrix/registration.js';
import { config } from '../../config.js';
import { bindLine, listNumbers } from '../../db/numbers.js';
import { getPortalByMemberId, markUninstalled, setApplicationToken } from '../../db/portals.js';
import { cancelAtPeriodEnd } from '../../billing/stripe.js';
import { logger } from '../../logger.js';
import { purgePortal } from '../../sync/retention.js';
import { audit } from '../../db/audit.js';
import { outboundQueue } from '../../queue/queues.js';
import type { OutboundFile } from '../../types.js';
import { NOTE_PREFIX } from '../../util/format.js';
import { obj, readPhpForm, str, type PhpValue } from '../../util/phpForm.js';
import { getEngine } from '../../whatsapp/instance.js';

/**
 * Bitrix24 event handlers. Every rejection still answers 200: a non-2xx only earns a redelivery
 * of an event we already decided not to trust. The reason is logged instead.
 */
export const eventRoutes = new Hono();

const ignored = (c: Context, route: string, reason: string, auth?: EventAuth) => {
  logger.warn({ route, reason, memberId: auth?.member_id ?? null }, 'event ignored');
  return c.text('ignored', 200);
};

const authOf = (body: Record<string, PhpValue>): EventAuth => obj(body.auth) as unknown as EventAuth;

eventRoutes.get('/events/install', (c) => c.text('ok'));

/** ONAPPINSTALL - the only event guaranteed to carry application_token. Verified via OAuth. */
eventRoutes.post('/events/install', async (c) => {
  const auth = authOf(await readPhpForm(c.req.raw));
  if (!auth.member_id || !auth.refresh_token || !auth.application_token) return ignored(c, 'install', 'INCOMPLETE_AUTH', auth);
  try {
    const portal = await verifyAndStorePortal({
      memberId: auth.member_id,
      refreshToken: auth.refresh_token,
      applicationToken: auth.application_token,
    });
    await setApplicationToken(portal.id, auth.application_token);
    await ensureRegistered({ ...portal, application_token: auth.application_token }, { force: true });
  } catch (err) {
    return ignored(c, 'install', `VERIFY_FAILED: ${(err as Error).message}`, auth);
  }
  return c.text('ok');
});

/** ONAPPUPDATE - new app version: application_token may rotate, so prove the access_token instead. */
eventRoutes.post('/events/update', async (c) => {
  const auth = authOf(await readPhpForm(c.req.raw));
  if (!auth.member_id || !auth.access_token || !auth.application_token) return ignored(c, 'update', 'INCOMPLETE_AUTH', auth);
  const portal = await getPortalByMemberId(auth.member_id);
  if (!portal) return ignored(c, 'update', 'UNKNOWN_PORTAL', auth);
  if (!(await tokenWorks(portal.client_endpoint, auth.access_token))) return ignored(c, 'update', 'ACCESS_TOKEN_REJECTED', auth);
  await setApplicationToken(portal.id, auth.application_token);
  await ensureRegistered({ ...portal, application_token: auth.application_token }).catch((err) =>
    logger.error({ err: (err as Error).message }, 're-registration after update failed'),
  );
  return c.text('ok');
});

/** ONAPPTEST - triggered by us to recover a missing application_token (see routes/frames.ts). */
eventRoutes.post('/events/test', async (c) => {
  const auth = authOf(await readPhpForm(c.req.raw));
  if (!auth.member_id || !auth.access_token || !auth.application_token) return ignored(c, 'test', 'INCOMPLETE_AUTH', auth);
  const portal = await getPortalByMemberId(auth.member_id);
  if (!portal) return ignored(c, 'test', 'UNKNOWN_PORTAL', auth);
  if (!(await tokenWorks(portal.client_endpoint, auth.access_token))) return ignored(c, 'test', 'ACCESS_TOKEN_REJECTED', auth);
  await setApplicationToken(portal.id, auth.application_token);
  logger.info({ memberId: portal.member_id }, 'application_token recovered via ONAPPTEST');
  return c.text('ok');
});

eventRoutes.post('/events/uninstall', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const r = await authenticateEvent(authOf(body));
  if (!r.portal) return ignored(c, 'uninstall', r.reason, authOf(body));
  const portal = r.portal;
  if (str(obj(body.data).CLEAN) === '1') {
    // "Clear application data" ticked: unlink the WhatsApp devices and delete everything now.
    await purgePortal(portal, 'uninstalled with CLEAN=1');
    return c.text('ok');
  }
  // Stop the sockets but keep the WhatsApp logins for a while: a reinstall resumes them without a
  // new QR. The retention job deletes the portal after UNINSTALLED_KEEP_DAYS.
  for (const n of await listNumbers(portal.id)) await getEngine().stop(n.id).catch(() => undefined);
  await markUninstalled(portal.id);
  await audit({ portalId: portal.id, actor: { type: 'bitrix', name: 'Bitrix24' }, action: 'app.uninstalled' });
  if (portal.stripe_subscription_id && portal.sub_status && portal.sub_status !== 'canceled') {
    await cancelAtPeriodEnd(portal.stripe_subscription_id).catch((err) =>
      logger.warn({ err: (err as Error).message }, 'could not stop billing on uninstall'),
    );
  }
  return c.text('ok');
});

/** ONIMCONNECTORMESSAGEADD - an operator replied in Contact Center. Enqueue, answer fast. */
eventRoutes.post('/events/message-add', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const r = await authenticateEvent(authOf(body));
  if (!r.portal) return ignored(c, 'message-add', r.reason, authOf(body));
  const data = obj(body.data);
  if (str(data.CONNECTOR) && str(data.CONNECTOR) !== config().connectorId) return c.text('ok');
  const lineId = Number(str(data.LINE));
  if (!Number.isInteger(lineId) || lineId <= 0) return ignored(c, 'message-add', 'NO_LINE');

  for (const item of Object.values(obj(data.MESSAGES))) {
    const it = obj(item);
    const message = obj(it.message);
    const text = str(message.text);
    if (str(message.system) === 'Y' || text.startsWith(NOTE_PREFIX)) continue; // our own notes
    const chatId = str(obj(it.chat).id);
    const bitrixChatId = Number(str(obj(it.im).chat_id));
    const bitrixMessageId = Number(str(obj(it.im).message_id));
    if (!chatId || !Number.isInteger(bitrixChatId) || !Number.isInteger(bitrixMessageId)) continue;
    const files: OutboundFile[] = Object.values(obj(message.files))
      .map((f) => obj(f))
      .map((f) => ({ url: str(f.link) || str(f.url), name: str(f.name), type: str(f.type) || undefined }))
      .filter((f) => f.url);
    if (!text.trim() && files.length === 0) continue;
    await outboundQueue().add(
      'reply',
      { portalId: r.portal.id, lineId, chatId, bitrixChatId, bitrixMessageId, text, files },
      { jobId: `out-${r.portal.id}-${bitrixMessageId}` },
    );
  }
  return c.text('ok');
});

/** ONIMCONNECTORLINEDELETE - an Open Line was deleted: unbind whichever number fed it. */
eventRoutes.post('/events/line-delete', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const r = await authenticateEvent(authOf(body));
  if (!r.portal) return ignored(c, 'line-delete', r.reason, authOf(body));
  const lineId = Number(str(body.data) || str(obj(body.data).LINE));
  for (const n of await listNumbers(r.portal.id)) {
    if (n.line_id === lineId) await bindLine(r.portal.id, n.id, null);
  }
  return c.text('ok');
});

/** ONCRMTYPEADD - a new Smart Process: give it the WhatsApp tab and list menu right away. */
eventRoutes.post('/events/crm-type-add', async (c) => {
  const body = await readPhpForm(c.req.raw);
  const r = await authenticateEvent(authOf(body));
  if (!r.portal) return ignored(c, 'crm-type-add', r.reason, authOf(body));
  const id = Number(str(obj(obj(body.data).FIELDS).ID));
  if (!id) return ignored(c, 'crm-type-add', 'NO_TYPE_ID');
  const res = await call<{ type?: { entityTypeId?: number } }>(r.portal, 'crm.type.get', { id }).catch(() => null);
  if (res?.type?.entityTypeId) await bindSmartProcess(r.portal, res.type.entityTypeId);
  return c.text('ok');
});
