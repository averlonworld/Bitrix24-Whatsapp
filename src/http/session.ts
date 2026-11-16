import type { MiddlewareHandler } from 'hono';
import type { Viewer } from '../bitrix/auth.js';
import { config } from '../config.js';
import { signToken, verifyToken } from '../crypto.js';
import { getPortalById } from '../db/portals.js';
import type { Portal } from '../types.js';

/**
 * The admin UI runs in a Bitrix iframe on a third-party domain where cookies are unreliable, so
 * the server hands the page a short-lived signed token (bound to one portal and to whether the
 * viewer is a portal administrator) that every /api call sends back as X-App-Session.
 * Bitrix OAuth tokens never reach the browser.
 */
const TTL_SEC = 8 * 3600;

export const issueSession = (portalId: string, viewer: Viewer) =>
  signToken({ p: portalId, a: viewer.isAdmin ? 1 : 0, u: viewer.userId }, config().appSecret, TTL_SEC);

export type ApiEnv = { Variables: { portal: Portal; isAdmin: boolean; userId: number | null } };

export const requireSession: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const payload = verifyToken<{ p: string; a?: number; u?: number | null }>(c.req.header('X-App-Session'), config().appSecret);
  if (!payload?.p) return c.json({ error: 'UNAUTHORIZED', message: 'Session expired - reopen the app.' }, 401);
  const portal = await getPortalById(payload.p);
  if (!portal || portal.status !== 'active') return c.json({ error: 'NOT_FOUND' }, 404);
  c.set('portal', portal);
  c.set('isAdmin', payload.a === 1);
  c.set('userId', payload.u ?? null);
  await next();
};

/** Linking, unlinking and configuring numbers is for portal administrators only. */
export const requireAdmin: MiddlewareHandler<ApiEnv> = async (c, next) => {
  if (!c.get('isAdmin')) {
    return c.json({ error: 'FORBIDDEN', message: 'Only Bitrix24 administrators can change WhatsApp settings.' }, 403);
  }
  await next();
};
