import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import QRCode from 'qrcode';
import { call } from '../../bitrix/client.js';
import { resolveClientName, resolvePhones } from '../../bitrix/crm.js';
import { activateLine } from '../../bitrix/registration.js';
import { findChat } from '../../db/chats.js';
import {
  bindLine,
  createNumber,
  deleteNumber,
  getOwnedNumber,
  getPortalNumber,
  listNumbers,
  setGroupsEnabled,
  setPersonalLine,
} from '../../db/numbers.js';
import { getUserName, userNames } from '../../db/users.js';
import { saveMedia } from '../../media/store.js';
import { exec, many, nowSec } from '../../db/pool.js';
import { setDefaultNumber, setSelfLinkEnabled } from '../../db/portals.js';
import { logger } from '../../logger.js';
import { crmQueue } from '../../queue/queues.js';
import { ensureChat } from '../../sync/openlines.js';
import type { WaNumber } from '../../types.js';
import { normalizePhone } from '../../util/phone.js';
import { getEngine } from '../../whatsapp/instance.js';
import { missingScopes } from '../../bitrix/scopes.js';
import { applyAutoReplies, autoRepliesOf, lineParams, normalizeAutoReplies, recordAppLine, saveAutoReplies, whatsappLines } from '../../bitrix/autoReplies.js';
import { billingEnabled, licenseOf, PAYMENT_REQUIRED_MESSAGE } from '../../billing/license.js';
import { createCheckout, createPortalSession, setQuantity } from '../../billing/stripe.js';
import { applySubscription } from '../../billing/sync.js';
import { config } from '../../config.js';
import type { Context } from 'hono';
import { requireAdmin, requireSession, type ApiEnv } from '../session.js';

/** JSON API for the admin page, the connector-settings frame and the CRM tab. */
export const apiRoutes = new Hono<ApiEnv>();
apiRoutes.use('/api/*', requireSession);
// Who may do what (enforced here, not just hidden in the UI):
//  - administrators: everything;
//  - an employee: link / reconnect / unlink / rename / delete THEIR OWN WhatsApp number, and use
//    company numbers plus their own in the CRM tab. Never a colleague's number or its QR code.
apiRoutes.on(['POST', 'PUT'], ['/api/lines', '/api/settings', '/api/auto-replies', '/api/billing/checkout', '/api/billing/portal', '/api/billing/seats'], requireAdmin);

const MAX_NUMBERS_PER_PORTAL = 50;

/** Never expose keys or internals: this is all the browser sees of a number. */
function publicNumber(n: WaNumber, names?: Map<number, string>) {
  const live = getEngine().status(n.id);
  return {
    id: n.id,
    label: n.label,
    phone: n.phone,
    status: n.status,
    live_status: live.status === 'offline' ? (n.status === 'connected' ? 'offline' : n.status) : live.status,
    last_error: n.last_error,
    line_id: n.line_id,
    groups_enabled: n.groups_enabled,
    owner_user_id: n.owner_user_id,
    owner_name: n.owner_user_id ? (names?.get(n.owner_user_id) ?? null) : null,
    personal_line: n.personal_line,
  };
}

const notFound = { error: 'NOT_FOUND', message: 'Number not found' } as const;
const forbidden = { error: 'FORBIDDEN', message: 'Only Bitrix24 administrators or the owner of this number can do that.' } as const;

const isOwn = (c: Context<ApiEnv>, n: WaNumber) => n.owner_user_id != null && n.owner_user_id === c.get('userId');

/**
 * Load a number of this portal and check the caller may act on it: 'manage' = admin or owner,
 * 'admin' = administrators only (Open Line routing, groups, default number).
 */
async function numberFor(c: Context<ApiEnv>, access: 'manage' | 'admin'): Promise<WaNumber | Response> {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id') ?? '');
  if (!n) return c.json(notFound, 404);
  if (c.get('isAdmin') || (access === 'manage' && isOwn(c, n))) return n;
  return c.json(forbidden, 403);
}

/** In the CRM tab an employee sends from company numbers or their own, never a colleague's. */
const canSendFrom = (c: Context<ApiEnv>, n: WaNumber) => c.get('isAdmin') || n.owner_user_id == null || isOwn(c, n);

interface NumberStats {
  received: number;
  sent: number;
  failed: number;
  chats: number;
  lastActivityAt: number | null;
}

/** Activity over the last 24 hours plus totals, for the dashboard cards. */
async function statsFor(ids: string[]): Promise<Map<string, NumberStats>> {
  const out = new Map<string, NumberStats>();
  if (!ids.length) return out;
  const since = nowSec() - 86_400;
  const [msgs, chats] = await Promise.all([
    many<{ number_id: string; received: string; sent: string; failed: string; last: string | null }>(
      `SELECT number_id,
              COUNT(*) FILTER (WHERE direction = 'in' AND created_at >= $2)                              AS received,
              COUNT(*) FILTER (WHERE direction IN ('out','crm_out','phone_out') AND created_at >= $2)   AS sent,
              COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= $2)                             AS failed,
              MAX(created_at)                                                                            AS last
         FROM message_log WHERE number_id = ANY($1::uuid[]) GROUP BY number_id`,
      [ids, since],
    ),
    many<{ number_id: string; chats: string }>(
      'SELECT number_id, COUNT(*) AS chats FROM chat_map WHERE number_id = ANY($1::uuid[]) GROUP BY number_id',
      [ids],
    ),
  ]);
  for (const id of ids) out.set(id, { received: 0, sent: 0, failed: 0, chats: 0, lastActivityAt: null });
  for (const m of msgs) {
    const s = out.get(m.number_id);
    if (s) Object.assign(s, { received: Number(m.received), sent: Number(m.sent), failed: Number(m.failed), lastActivityAt: m.last ? Number(m.last) : null });
  }
  for (const ch of chats) {
    const s = out.get(ch.number_id);
    if (s) s.chats = Number(ch.chats);
  }
  return out;
}

apiRoutes.get('/api/state', async (c) => {
  const portal = c.get('portal');
  const numbers = await listNumbers(portal.id);
  const stats = await statsFor(numbers.map((n) => n.id)).catch((err) => {
    logger.warn({ err: (err as Error).message }, 'stats query failed');
    return new Map<string, NumberStats>();
  });
  const isAdmin = c.get('isAdmin');
  const userId = c.get('userId');
  const names = await userNames(portal.id).catch(() => new Map<number, string>());
  // Employees only see their own WhatsApp here; administrators see the whole team.
  const visible = isAdmin ? numbers : numbers.filter((n) => n.owner_user_id != null && n.owner_user_id === userId);
  return c.json({
    domain: portal.domain,
    isAdmin,
    userId,
    selfLinkEnabled: portal.self_link_enabled,
    missingScopes: isAdmin ? await missingScopes(portal) : [],
    billing: { enabled: billingEnabled(), license: licenseOf(portal), numbersUsed: numbers.length, hasCustomer: !!portal.stripe_customer_id },
    autoReplies: isAdmin ? autoRepliesOf(portal) : null,
    defaultNumberId: portal.default_number_id,
    numbers: visible.map((n) => ({ ...publicNumber(n, names), stats: stats.get(n.id) ?? null })),
  });
});

apiRoutes.get('/api/lines', async (c) => {
  const lines = await call<Array<{ ID: string | number; LINE_NAME?: string }>>(c.get('portal'), 'imopenlines.config.list.get', {
    PARAMS: { select: ['ID', 'LINE_NAME'] },
  }).catch(() => []);
  return c.json({ lines: (lines ?? []).map((l) => ({ id: Number(l.ID), name: l.LINE_NAME || `Open Line ${l.ID}` })) });
});

/** One-click setup: creates a Contact Center Open Line so admins never have to leave the app. */
apiRoutes.post('/api/lines', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = (body.name ?? '').trim().slice(0, 80) || 'WhatsApp';
  try {
    const portal = c.get('portal');
    const id = await call<number | string>(portal, 'imopenlines.config.add', { PARAMS: { LINE_NAME: name, ...lineParams(autoRepliesOf(portal)) } });
    const lineId = Number(id);
    if (!Number.isInteger(lineId) || lineId <= 0) throw new Error('Bitrix24 did not return the new Open Line');
    await recordAppLine(portal.id, lineId);
    return c.json({ line: { id: lineId, name } }, 201);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'open line creation failed');
    return c.json(
      { error: 'BITRIX', message: `Could not create the Open Line: ${(err as Error).message}. Only Bitrix24 administrators can create Open Lines.` },
      502,
    );
  }
});

// ---- Billing (administrators) ----------------------------------------------------------------
const billingReturn = () => `${config().publicUrl}/billing/return`;

apiRoutes.post('/api/billing/checkout', async (c) => {
  const portal = c.get('portal');
  if (!billingEnabled()) return c.json({ error: 'BILLING_DISABLED', message: 'Billing is not set up on this server.' }, 400);
  const body = await c.req.json<{ quantity?: number }>().catch(() => ({}) as { quantity?: number });
  const used = (await listNumbers(portal.id)).length;
  const quantity = Math.min(50, Math.max(1, Math.floor(Number(body.quantity) || used || 1)));
  try {
    const session = await createCheckout({ portalId: portal.id, customerId: portal.stripe_customer_id, quantity, returnUrl: billingReturn() });
    return c.json({ url: session.url });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'checkout failed');
    return c.json({ error: 'STRIPE', message: `Could not start checkout: ${(err as Error).message}` }, 502);
  }
});

apiRoutes.post('/api/billing/portal', async (c) => {
  const portal = c.get('portal');
  if (!portal.stripe_customer_id) return c.json({ error: 'NO_CUSTOMER', message: 'There is no subscription yet.' }, 400);
  try {
    return c.json({ url: (await createPortalSession(portal.stripe_customer_id, billingReturn())).url });
  } catch (err) {
    return c.json({ error: 'STRIPE', message: `Could not open billing: ${(err as Error).message}` }, 502);
  }
});

apiRoutes.post('/api/billing/seats', async (c) => {
  const portal = c.get('portal');
  if (!portal.stripe_subscription_id) return c.json({ error: 'NO_SUBSCRIPTION', message: 'Subscribe first.' }, 400);
  const body = await c.req.json<{ quantity?: number }>().catch(() => ({}) as { quantity?: number });
  const used = (await listNumbers(portal.id)).length;
  const quantity = Math.floor(Number(body.quantity));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return c.json({ error: 'BAD_REQUEST', message: 'Choose between 1 and 50 numbers.' }, 400);
  if (quantity < used) return c.json({ error: 'BAD_REQUEST', message: `You have ${used} numbers. Remove some before lowering the plan to ${quantity}.` }, 400);
  try {
    await applySubscription(portal.id, await setQuantity(portal.stripe_subscription_id, quantity));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: 'STRIPE', message: `Could not change the plan: ${(err as Error).message}` }, 502);
  }
});

/** Save the automatic replies and apply them to every WhatsApp Open Line at once. */
apiRoutes.put('/api/auto-replies', async (c) => {
  const portal = c.get('portal');
  const settings = normalizeAutoReplies(await c.req.json().catch(() => ({})));
  await saveAutoReplies(portal.id, settings);
  const result = await applyAutoReplies({ ...portal, auto_replies: settings as unknown as Record<string, unknown> }, settings);
  return c.json({ autoReplies: settings, ...result, lines: await whatsappLines(portal.id) });
});

apiRoutes.put('/api/settings', async (c) => {
  const body = await c.req.json<{ selfLinkEnabled?: boolean }>().catch(() => ({}) as { selfLinkEnabled?: boolean });
  if (typeof body.selfLinkEnabled === 'boolean') await setSelfLinkEnabled(c.get('portal').id, body.selfLinkEnabled);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers', async (c) => {
  const portal = c.get('portal');
  const isAdmin = c.get('isAdmin');
  const userId = c.get('userId');
  const body = await c.req.json<{ label?: string; personal?: boolean }>().catch(() => ({}) as { label?: string; personal?: boolean });
  // Employees can only add their own WhatsApp; admins add company numbers (or their own with personal).
  const personal = !isAdmin || body.personal === true;
  if (personal) {
    if (!userId) return c.json({ error: 'UNAUTHORIZED', message: 'Reopen the app and try again.' }, 401);
    if (!isAdmin && !portal.self_link_enabled) {
      return c.json(
        { error: 'SELF_LINK_DISABLED', message: 'Your administrator has not enabled linking your own WhatsApp. Ask them to switch it on in the WhatsApp app.' },
        403,
      );
    }
    const existing = await getOwnedNumber(portal.id, userId);
    if (existing) return c.json({ number: publicNumber(existing) }, 200);
  }
  const lic = licenseOf(portal);
  if (!lic.canLink) {
    const message = lic.state === 'past_due' ? 'The last payment failed. An administrator can update the card in Billing to add numbers.' : PAYMENT_REQUIRED_MESSAGE;
    return c.json({ error: 'PAYMENT_REQUIRED', message }, 402);
  }
  if (lic.maxNumbers !== null && (await listNumbers(portal.id)).length >= lic.maxNumbers) {
    const message =
      lic.state === 'trial'
        ? `The free trial includes up to ${lic.maxNumbers} WhatsApp numbers. Subscribe in Billing to add more.`
        : `Your subscription covers ${lic.maxNumbers} WhatsApp number${lic.maxNumbers === 1 ? '' : 's'}. An administrator can add more in Billing.`;
    return c.json({ error: 'PLAN_LIMIT', message }, 402);
  }
  const fallback = personal && userId ? ((await getUserName(portal.id, userId)) ?? 'My WhatsApp') : '';
  const label = ((body.label ?? '').trim() || fallback).slice(0, 60);
  if (!label) return c.json({ error: 'BAD_REQUEST', message: 'Give the number a name' }, 400);
  if ((await listNumbers(portal.id)).length >= MAX_NUMBERS_PER_PORTAL) {
    return c.json({ error: 'LIMIT', message: `At most ${MAX_NUMBERS_PER_PORTAL} numbers per portal` }, 400);
  }
  const number = await createNumber(portal.id, label, personal ? userId : null);
  // A salesperson's own number never becomes the company default for robots and SMS.
  if (!portal.default_number_id && !personal) await setDefaultNumber(portal.id, number.id);
  return c.json({ number: publicNumber(number) }, 201);
});

/**
 * A salesperson's own number gets its own Open Line with only them in the queue, so a customer's
 * reply reaches the person who wrote to them. Created once, right after the first link.
 */
apiRoutes.post('/api/numbers/:id/personal-line', async (c) => {
  const portal = c.get('portal');
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  if (!n.owner_user_id) return c.json({ error: 'BAD_REQUEST', message: 'Only personal numbers get a personal Open Line.' }, 400);
  if (n.line_id) return c.json({ line: { id: n.line_id, name: null } });
  const owner = (await getUserName(portal.id, n.owner_user_id)) ?? n.label;
  const name = `WhatsApp · ${owner}`.slice(0, 80);
  try {
    const id = await call<number | string | false>(portal, 'imopenlines.config.add', {
      PARAMS: {
        LINE_NAME: name,
        QUEUE: [{ ENTITY_TYPE: 'user', ENTITY_ID: String(n.owner_user_id) }],
        QUEUE_TYPE: 'all',
        CRM: 'Y',
        CRM_FORWARD: 'N', // stay with the number's owner, not whoever is responsible in CRM
        ...lineParams(autoRepliesOf(portal)), // no automatic messages unless an admin turned them on
      },
    });
    const lineId = Number(id);
    if (!Number.isInteger(lineId) || lineId <= 0) throw new Error('Bitrix24 did not create the Open Line');
    await recordAppLine(portal.id, lineId);
    await activateLine(portal, lineId, true);
    await setPersonalLine(n.id, lineId);
    return c.json({ line: { id: lineId, name } }, 201);
  } catch (err) {
    logger.warn({ err: (err as Error).message, numberId: n.id }, 'personal open line failed');
    return c.json({ error: 'BITRIX', message: `Could not create your Open Line: ${(err as Error).message}. An administrator can choose one for you.` }, 502);
  }
});

apiRoutes.post('/api/numbers/:id/connect', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  if (!licenseOf(c.get('portal')).canSend) return c.json({ error: 'PAYMENT_REQUIRED', message: PAYMENT_REQUIRED_MESSAGE }, 402);
  await getEngine().start(n.id);
  return c.json({ ok: true });
});

apiRoutes.get('/api/numbers/:id/qr', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  const live = getEngine().status(n.id);
  const qr = live.qr ? await QRCode.toDataURL(live.qr, { margin: 1, width: 256 }) : null;
  return c.json({ status: live.status === 'offline' ? n.status : live.status, qr, phone: n.phone, error: n.last_error });
});

apiRoutes.post('/api/numbers/:id/pairing-code', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  if (!licenseOf(c.get('portal')).canSend) return c.json({ error: 'PAYMENT_REQUIRED', message: PAYMENT_REQUIRED_MESSAGE }, 402);
  const body = await c.req.json<{ phone?: string }>().catch(() => ({}) as { phone?: string });
  const phone = normalizePhone(body.phone ?? '');
  if (!phone) return c.json({ error: 'BAD_REQUEST', message: 'Enter the phone number with country code' }, 400);
  try {
    await getEngine().start(n.id);
    const code = await getEngine().requestPairingCode(n.id, phone);
    return c.json({ code: code.match(/.{1,4}/g)?.join('-') ?? code });
  } catch (err) {
    return c.json({ error: 'PAIRING_FAILED', message: (err as Error).message }, 400);
  }
});

apiRoutes.post('/api/numbers/:id/disconnect', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  await getEngine().stop(n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/logout', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  await getEngine().logout(n.id);
  return c.json({ ok: true });
});

apiRoutes.delete('/api/numbers/:id', async (c) => {
  const portal = c.get('portal');
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  await getEngine().logout(n.id);
  if (n.line_id) await activateLine(portal, n.line_id, false).catch(() => undefined);
  if (portal.default_number_id === n.id) await setDefaultNumber(portal.id, null);
  await deleteNumber(n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/line', async (c) => {
  const portal = c.get('portal');
  const n = await numberFor(c, 'admin');
  if (n instanceof Response) return n;
  const body = await c.req.json<{ lineId?: number | null }>().catch(() => ({}) as { lineId?: number | null });
  const lineId = body.lineId == null ? null : Number(body.lineId);
  if (lineId !== null && (!Number.isInteger(lineId) || lineId <= 0)) return c.json({ error: 'BAD_REQUEST', message: 'Invalid line' }, 400);
  try {
    if (n.line_id && n.line_id !== lineId) await activateLine(portal, n.line_id, false).catch(() => undefined);
    if (lineId !== null) await activateLine(portal, lineId, true);
    await bindLine(portal.id, n.id, lineId);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'line binding failed');
    return c.json({ error: 'BITRIX', message: `Bitrix24 refused: ${(err as Error).message}` }, 502);
  }
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/groups', async (c) => {
  const n = await numberFor(c, 'admin');
  if (n instanceof Response) return n;
  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({}) as { enabled?: boolean });
  await setGroupsEnabled(n.id, Boolean(body.enabled));
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/default', async (c) => {
  const portal = c.get('portal');
  const n = await numberFor(c, 'admin');
  if (n instanceof Response) return n;
  await setDefaultNumber(portal.id, n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/label', async (c) => {
  const n = await numberFor(c, 'manage');
  if (n instanceof Response) return n;
  const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const label = (body.label ?? '').trim().slice(0, 60);
  if (!label) return c.json({ error: 'BAD_REQUEST', message: 'Name required' }, 400);
  await exec('UPDATE wa_numbers SET label=$1, updated_at=$2 WHERE id=$3', [label, nowSec(), n.id]);
  return c.json({ ok: true });
});

// ---- CRM tab -------------------------------------------------------------------------------

function readRef(q: { entityTypeId?: unknown; entityId?: unknown }) {
  const entityTypeId = Number(q.entityTypeId);
  const entityId = Number(q.entityId);
  return Number.isInteger(entityTypeId) && entityTypeId > 0 && Number.isInteger(entityId) && entityId > 0
    ? { entityTypeId, entityId }
    : null;
}

apiRoutes.get('/api/crm/context', async (c) => {
  const portal = c.get('portal');
  const ref = readRef(c.req.query());
  if (!ref) return c.json({ error: 'BAD_REQUEST', message: 'Missing CRM item' }, 400);
  const [phones, numbers] = await Promise.all([resolvePhones(portal, ref), listNumbers(portal.id)]);
  const usable = numbers.filter((n) => n.phone && canSendFrom(c, n));
  const mine = usable.find((n) => isOwn(c, n));
  const chats: Array<{ numberId: string; phone: string; bitrixChatId: number }> = [];
  for (const n of usable) {
    for (const p of phones) {
      const chat = await findChat(n.id, p.phone);
      if (chat?.bitrix_chat_id && chat.line_id === n.line_id) chats.push({ numberId: n.id, phone: p.phone, bitrixChatId: chat.bitrix_chat_id });
    }
  }
  return c.json({
    phones,
    numbers: usable.map((n) => publicNumber(n)).map((n) => ({ ...n, status: n.live_status })),
    chats,
    // A salesperson sends from their own WhatsApp by default; everyone else from the company default.
    defaultNumberId: mine?.id ?? portal.default_number_id,
    myNumberId: mine?.id ?? null,
  });
});

apiRoutes.post('/api/crm/open', async (c) => {
  const portal = c.get('portal');
  const body = await c.req.json<{ numberId?: string; phone?: string; entityTypeId?: number; entityId?: number }>().catch(() => null);
  const phone = normalizePhone(body?.phone ?? '');
  const n = body?.numberId ? await getPortalNumber(portal.id, body.numberId) : null;
  if (!n || !phone) return c.json({ error: 'BAD_REQUEST', message: 'Choose a number and a phone' }, 400);
  if (!canSendFrom(c, n)) return c.json({ error: 'FORBIDDEN', message: 'You can only use company numbers or your own WhatsApp.' }, 403);
  if (!n.line_id) return c.json({ error: 'NOT_BOUND', message: 'This WhatsApp number is not connected to an Open Line yet.' }, 409);
  const ref = readRef(body ?? {});
  const name = ref ? await resolveClientName(portal, ref).catch(() => null) : null;
  try {
    const chat = await ensureChat(portal, { ...n, line_id: n.line_id }, phone, name, await findChat(n.id, phone));
    return c.json({ bitrixChatId: chat.bitrix_chat_id });
  } catch (err) {
    return c.json({ error: 'BITRIX', message: (err as Error).message }, 502);
  }
});

const MAX_UPLOAD = 32 * 1024 * 1024;

/** A file attached in the CRM tab (e.g. a quotation PDF). Stored with an unguessable key, sent by key. */
apiRoutes.post('/api/crm/upload', async (c) => {
  const form = await c.req.parseBody().catch(() => null);
  const file = form?.file;
  if (!file || typeof file === 'string') return c.json({ error: 'BAD_REQUEST', message: 'Choose a file to attach.' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'TOO_LARGE', message: 'Files can be up to 32 MB.' }, 413);
  const stored = await saveMedia(Buffer.from(await file.arrayBuffer()), (file.name || 'file').slice(0, 120), file.type || 'application/octet-stream');
  return c.json({ fileKey: stored.key, name: stored.name, size: file.size }, 201);
});

apiRoutes.post('/api/crm/send', async (c) => {
  const portal = c.get('portal');
  const body = await c.req
    .json<{ numberId?: string; phone?: string; text?: string; fileKey?: string; entityTypeId?: number; entityId?: number }>()
    .catch(() => null);
  const phone = normalizePhone(body?.phone ?? '');
  const text = (body?.text ?? '').trim();
  const fileKey = typeof body?.fileKey === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.fileKey) ? body.fileKey : null;
  const n = body?.numberId ? await getPortalNumber(portal.id, body.numberId) : null;
  if (!n || !phone || (!text && !fileKey)) return c.json({ error: 'BAD_REQUEST', message: 'Choose a number and write a message or attach a file' }, 400);
  if (!canSendFrom(c, n)) return c.json({ error: 'FORBIDDEN', message: 'You can only send from company numbers or your own WhatsApp.' }, 403);
  if (text.length > 4096) return c.json({ error: 'BAD_REQUEST', message: 'Message too long (max 4096 characters)' }, 400);
  const userId = c.get('userId');
  const byName = userId ? await getUserName(portal.id, userId).catch(() => null) : null;
  const extRef = `tab:${randomUUID()}`;
  await crmQueue().add('tab', {
    portalId: portal.id,
    source: 'tab',
    numberId: n.id,
    phone,
    text,
    mediaKey: fileKey,
    byName,
    ref: readRef(body ?? {}),
    extRef,
  });
  return c.json({ queued: true }, 202);
});
