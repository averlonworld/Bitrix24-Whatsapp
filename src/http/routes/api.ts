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
  getPortalNumber,
  listNumbers,
  setGroupsEnabled,
} from '../../db/numbers.js';
import { exec, many, nowSec } from '../../db/pool.js';
import { setDefaultNumber } from '../../db/portals.js';
import { logger } from '../../logger.js';
import { crmQueue } from '../../queue/queues.js';
import { ensureChat } from '../../sync/openlines.js';
import type { WaNumber } from '../../types.js';
import { normalizePhone } from '../../util/phone.js';
import { getEngine } from '../../whatsapp/instance.js';
import { missingScopes } from '../../bitrix/scopes.js';
import { requireAdmin, requireSession, type ApiEnv } from '../session.js';

/** JSON API for the admin page, the connector-settings frame and the CRM tab. */
export const apiRoutes = new Hono<ApiEnv>();
apiRoutes.use('/api/*', requireSession);
// Everything that links, unlinks, configures a number or shows its QR code is admin-only. Reading
// the dashboard and the CRM tab (open chat / send) stay available to every employee.
apiRoutes.use('/api/numbers/*', requireAdmin);
apiRoutes.on('POST', ['/api/numbers', '/api/lines'], requireAdmin);

const MAX_NUMBERS_PER_PORTAL = 50;

/** Never expose keys or internals: this is all the browser sees of a number. */
function publicNumber(n: WaNumber) {
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
  };
}

const notFound = { error: 'NOT_FOUND', message: 'Number not found' } as const;

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
  return c.json({
    domain: portal.domain,
    isAdmin,
    missingScopes: isAdmin ? await missingScopes(portal) : [],
    defaultNumberId: portal.default_number_id,
    numbers: numbers.map((n) => ({ ...publicNumber(n), stats: stats.get(n.id) ?? null })),
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
    const id = await call<number | string>(c.get('portal'), 'imopenlines.config.add', { PARAMS: { LINE_NAME: name } });
    const lineId = Number(id);
    if (!Number.isInteger(lineId) || lineId <= 0) throw new Error('Bitrix24 did not return the new Open Line');
    return c.json({ line: { id: lineId, name } }, 201);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'open line creation failed');
    return c.json(
      { error: 'BITRIX', message: `Could not create the Open Line: ${(err as Error).message}. Only Bitrix24 administrators can create Open Lines.` },
      502,
    );
  }
});

apiRoutes.post('/api/numbers', async (c) => {
  const portal = c.get('portal');
  const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const label = (body.label ?? '').trim().slice(0, 60);
  if (!label) return c.json({ error: 'BAD_REQUEST', message: 'Give the number a name' }, 400);
  if ((await listNumbers(portal.id)).length >= MAX_NUMBERS_PER_PORTAL) {
    return c.json({ error: 'LIMIT', message: `At most ${MAX_NUMBERS_PER_PORTAL} numbers per portal` }, 400);
  }
  const number = await createNumber(portal.id, label);
  if (!portal.default_number_id) await setDefaultNumber(portal.id, number.id);
  return c.json({ number: publicNumber(number) }, 201);
});

apiRoutes.post('/api/numbers/:id/connect', async (c) => {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  await getEngine().start(n.id);
  return c.json({ ok: true });
});

apiRoutes.get('/api/numbers/:id/qr', async (c) => {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  const live = getEngine().status(n.id);
  const qr = live.qr ? await QRCode.toDataURL(live.qr, { margin: 1, width: 256 }) : null;
  return c.json({ status: live.status === 'offline' ? n.status : live.status, qr, phone: n.phone, error: n.last_error });
});

apiRoutes.post('/api/numbers/:id/pairing-code', async (c) => {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
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
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  await getEngine().stop(n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/logout', async (c) => {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  await getEngine().logout(n.id);
  return c.json({ ok: true });
});

apiRoutes.delete('/api/numbers/:id', async (c) => {
  const portal = c.get('portal');
  const n = await getPortalNumber(portal.id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  await getEngine().logout(n.id);
  if (n.line_id) await activateLine(portal, n.line_id, false).catch(() => undefined);
  if (portal.default_number_id === n.id) await setDefaultNumber(portal.id, null);
  await deleteNumber(n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/line', async (c) => {
  const portal = c.get('portal');
  const n = await getPortalNumber(portal.id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
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
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({}) as { enabled?: boolean });
  await setGroupsEnabled(n.id, Boolean(body.enabled));
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/default', async (c) => {
  const portal = c.get('portal');
  const n = await getPortalNumber(portal.id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
  await setDefaultNumber(portal.id, n.id);
  return c.json({ ok: true });
});

apiRoutes.post('/api/numbers/:id/label', async (c) => {
  const n = await getPortalNumber(c.get('portal').id, c.req.param('id'));
  if (!n) return c.json(notFound, 404);
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
  const usable = numbers.filter((n) => n.phone);
  const chats: Array<{ numberId: string; phone: string; bitrixChatId: number }> = [];
  for (const n of usable) {
    for (const p of phones) {
      const chat = await findChat(n.id, p.phone);
      if (chat?.bitrix_chat_id && chat.line_id === n.line_id) chats.push({ numberId: n.id, phone: p.phone, bitrixChatId: chat.bitrix_chat_id });
    }
  }
  return c.json({ phones, numbers: usable.map(publicNumber).map((n) => ({ ...n, status: n.live_status })), chats, defaultNumberId: portal.default_number_id });
});

apiRoutes.post('/api/crm/open', async (c) => {
  const portal = c.get('portal');
  const body = await c.req.json<{ numberId?: string; phone?: string; entityTypeId?: number; entityId?: number }>().catch(() => null);
  const phone = normalizePhone(body?.phone ?? '');
  const n = body?.numberId ? await getPortalNumber(portal.id, body.numberId) : null;
  if (!n || !phone) return c.json({ error: 'BAD_REQUEST', message: 'Choose a number and a phone' }, 400);
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

apiRoutes.post('/api/crm/send', async (c) => {
  const portal = c.get('portal');
  const body = await c.req
    .json<{ numberId?: string; phone?: string; text?: string; entityTypeId?: number; entityId?: number }>()
    .catch(() => null);
  const phone = normalizePhone(body?.phone ?? '');
  const text = (body?.text ?? '').trim();
  const n = body?.numberId ? await getPortalNumber(portal.id, body.numberId) : null;
  if (!n || !phone || !text) return c.json({ error: 'BAD_REQUEST', message: 'Number, phone and text are required' }, 400);
  if (text.length > 4096) return c.json({ error: 'BAD_REQUEST', message: 'Message too long (max 4096 characters)' }, 400);
  const extRef = `tab:${randomUUID()}`;
  await crmQueue().add('tab', { portalId: portal.id, source: 'tab', numberId: n.id, phone, text, ref: readRef(body ?? {}), extRef });
  return c.json({ queued: true }, 202);
});
