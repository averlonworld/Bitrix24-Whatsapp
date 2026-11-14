import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { signToken, verifyToken } from '../crypto.js';
import { getPortalById } from '../db/portals.js';
import type { Portal } from '../types.js';

/**
 * The admin UI runs in a Bitrix iframe on a third-party domain where cookies are unreliable, so
 * the server hands the page a short-lived signed token (bound to one portal) that every /api call
 * sends back as X-App-Session. Bitrix OAuth tokens never reach the browser.
 */
const TTL_SEC = 8 * 3600;

export const issueSession = (portalId: string) => signToken({ p: portalId }, config().appSecret, TTL_SEC);

export type ApiEnv = { Variables: { portal: Portal } };

export const requireSession: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const payload = verifyToken<{ p: string }>(c.req.header('X-App-Session'), config().appSecret);
  if (!payload?.p) return c.json({ error: 'UNAUTHORIZED', message: 'Session expired - reopen the app.' }, 401);
  const portal = await getPortalById(payload.p);
  if (!portal || portal.status !== 'active') return c.json({ error: 'NOT_FOUND' }, 404);
  c.set('portal', portal);
  await next();
};
