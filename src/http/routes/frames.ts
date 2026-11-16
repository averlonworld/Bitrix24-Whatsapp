import { Hono, type Context } from 'hono';
import { verifyAppOpen, type Viewer } from '../../bitrix/auth.js';
import { bindIdempotent, call } from '../../bitrix/client.js';
import { parseCrmPlacement } from '../../bitrix/crm.js';
import { ensureRegistered } from '../../bitrix/registration.js';
import { config } from '../../config.js';
import { recordViewer } from '../../db/users.js';
import { listNumbers } from '../../db/numbers.js';
import { logger } from '../../logger.js';
import type { Portal } from '../../types.js';
import { installFinishedPage, renderPage, type View } from '../../ui/pages.js';
import { hasLinkedCreds } from '../../whatsapp/authState.js';
import { getEngine } from '../../whatsapp/instance.js';
import { issueSession } from '../session.js';

/**
 * Pages Bitrix24 opens in an iframe by POSTing a form: the install script, the app itself, the
 * Contact Center connector settings, and every CRM tab / list-menu entry.
 */
export const frameRoutes = new Hono();

interface FramePayload {
  DOMAIN: string;
  AUTH_ID: string;
  REFRESH_ID: string;
  member_id: string;
  PLACEMENT?: string;
  PLACEMENT_OPTIONS?: string;
  LANG?: string;
}

/** Bitrix splits fields between the query string and the form body; read both. */
async function readFrame(c: Context): Promise<FramePayload | null> {
  const form = await c.req.raw.formData().catch(() => null);
  const query = new URL(c.req.url).searchParams;
  const get = (k: string) => query.get(k) ?? (typeof form?.get(k) === 'string' ? (form.get(k) as string) : '');
  const p: FramePayload = {
    DOMAIN: get('DOMAIN'),
    AUTH_ID: get('AUTH_ID'),
    REFRESH_ID: get('REFRESH_ID'),
    member_id: get('member_id'),
    PLACEMENT: get('PLACEMENT') || undefined,
    PLACEMENT_OPTIONS: get('PLACEMENT_OPTIONS') || undefined,
    LANG: get('LANG') || undefined,
  };
  return p.REFRESH_ID && p.member_id ? p : null;
}

/** Verified with oauth.bitrix.info - see bitrix/auth.ts. Throws on a forged or stale frame. */
async function portalFor(c: Context, { install = false } = {}): Promise<{ portal: Portal; frame: FramePayload; viewer: Viewer } | Response> {
  const frame = await readFrame(c);
  if (!frame) return c.text('Open this application from inside your Bitrix24 portal.', 400);
  let portal: Portal;
  let viewer: Viewer;
  try {
    ({ portal, viewer } = await verifyAppOpen({ memberId: frame.member_id, refreshToken: frame.REFRESH_ID }));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'frame verification failed');
    return c.text('Could not verify this Bitrix24 session. Reload the page.', 403);
  }
  if (viewer.userId) {
    await recordViewer(portal.id, { userId: viewer.userId, name: viewer.name ?? null, isAdmin: viewer.isAdmin }).catch((err) =>
      logger.warn({ err: (err as Error).message }, 'could not record viewer'),
    );
  }
  try {
    await ensureRegistered(portal, { force: install });
  } catch (err) {
    logger.error({ err: (err as Error).message, memberId: portal.member_id }, 'registration failed');
    if (install) throw err;
  }
  if (install) await resumeNumbers(portal);
  // No application_token yet (ONAPPINSTALL lost): make Bitrix send one via ONAPPTEST.
  if (!portal.application_token && !install) {
    void bindIdempotent(portal, 'event.bind', { event: 'ONAPPTEST', handler: `${config().publicUrl}/events/test` })
      .then(() => call(portal, 'event.test', {}))
      .catch((err) => logger.warn({ err: (err as Error).message }, 'event self-test failed'));
  }
  return { portal, frame, viewer };
}

/** After a reinstall, numbers that still hold a valid login reconnect by themselves. */
async function resumeNumbers(portal: Portal) {
  for (const n of await listNumbers(portal.id)) {
    if (await hasLinkedCreds(n.id)) await getEngine().start(n.id).catch(() => undefined);
  }
}

function page(c: Context, portal: Portal, viewer: Viewer, view: View, placement: unknown) {
  return c.html(
    renderPage(view, {
      session: issueSession(portal.id, viewer),
      isAdmin: viewer.isAdmin,
      view,
      placement,
      domain: portal.domain,
      appVersion: process.env.npm_package_version ?? '0.1.0',
    }),
    200,
    { 'Cache-Control': 'no-store' },
  );
}

frameRoutes.post('/install', async (c) => {
  const r = await portalFor(c, { install: true });
  if (r instanceof Response) return r;
  return c.html(installFinishedPage(), 200, { 'Cache-Control': 'no-store' });
});

frameRoutes.post('/', async (c) => {
  const r = await portalFor(c);
  if (r instanceof Response) return r;
  return page(c, r.portal, r.viewer, 'admin', null);
});

frameRoutes.post('/connector/settings', async (c) => {
  const r = await portalFor(c);
  if (r instanceof Response) return r;
  const { portal, frame, viewer } = r;
  let lineId: number | null = null;
  try {
    const opts = JSON.parse(frame.PLACEMENT_OPTIONS ?? '{}') as { LINE?: string | number };
    lineId = Number(opts.LINE) || null;
  } catch {
    lineId = null;
  }
  return page(c, portal, viewer, 'connector-settings', lineId ? { lineId } : null);
});

frameRoutes.post('/crm/tab', async (c) => {
  const r = await portalFor(c);
  if (r instanceof Response) return r;
  const { portal, frame, viewer } = r;
  return page(c, portal, viewer, 'crm-tab', parseCrmPlacement(frame.PLACEMENT, frame.PLACEMENT_OPTIONS));
});

// Bitrix's app form checks every URL with a plain GET before it lets you save.
const hello = (c: Context) => c.text('WhatsApp connector for Bitrix24 - open it from inside your portal.');
frameRoutes.get('/', hello);
frameRoutes.get('/install', hello);
frameRoutes.get('/connector/settings', hello);
frameRoutes.get('/crm/tab', hello);
