import { getPortalByMemberId, setApplicationToken, upsertPortal } from '../db/portals.js';
import { safeEqual } from '../crypto.js';
import type { Portal } from '../types.js';
import { rawCall, tokenWorks } from './client.js';
import { exchangeRefreshToken } from './oauth.js';

export interface EventAuth {
  access_token?: string;
  refresh_token?: string;
  application_token?: string;
  member_id?: string;
  domain?: string;
  client_endpoint?: string;
}

export type AuthResult = { portal: Portal } | { portal: null; reason: string };

export function portalDomain(clientEndpoint: string, fallback: string): string {
  try {
    return new URL(clientEndpoint).hostname || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Trust an incoming Bitrix event (operator reply, robot, SMS provider, uninstall...).
 * Fast path: application_token matches the stored one. Fallback: the event's access_token works
 * against the portal's STORED REST endpoint (never one named by the request) - then the new
 * application_token is remembered.
 */
export async function authenticateEvent(auth: EventAuth | undefined): Promise<AuthResult> {
  if (!auth?.member_id) return { portal: null, reason: 'NO_MEMBER_ID' };
  const portal = await getPortalByMemberId(auth.member_id);
  if (!portal || portal.status !== 'active') return { portal: null, reason: 'UNKNOWN_PORTAL' };

  if (portal.application_token && auth.application_token && safeEqual(portal.application_token, auth.application_token)) {
    return { portal };
  }
  if (!auth.access_token) {
    return { portal: null, reason: portal.application_token ? 'APPLICATION_TOKEN_MISMATCH' : 'NO_APPLICATION_TOKEN_ON_FILE' };
  }
  if (!(await tokenWorks(portal.client_endpoint, auth.access_token))) return { portal: null, reason: 'ACCESS_TOKEN_REJECTED' };
  if (auth.application_token) await setApplicationToken(portal.id, auth.application_token);
  return { portal: { ...portal, application_token: auth.application_token ?? portal.application_token } };
}

/** Who opened the app. Only administrators may manage numbers. */
export interface Viewer {
  userId: number | null;
  isAdmin: boolean;
  name?: string | null;
}

/** `profile` needs no extra scope and states the token owner's id and admin flag. */
async function whoIs(endpoint: string, token: string): Promise<Viewer> {
  const r = await rawCall<{ ID?: string | number; ADMIN?: boolean | string; NAME?: string; LAST_NAME?: string }>(endpoint, 'profile', {}, token);
  if (r.error || !r.result) return { userId: null, isAdmin: false, name: null };
  const name = [r.result.NAME, r.result.LAST_NAME].filter(Boolean).join(' ').trim() || null;
  return { userId: Number(r.result.ID) || null, isAdmin: r.result.ADMIN === true || r.result.ADMIN === 'Y', name };
}

/**
 * Verify an app open (any employee) with Bitrix's OAuth server and tell whether the viewer is an
 * administrator. Background REST calls run with the STORED tokens, so they are only replaced by an
 * administrator's: a regular employee opening the app must not downgrade what registration,
 * Open Line management and alerts are allowed to do.
 */
export async function verifyAppOpen(input: { memberId: string; refreshToken: string }): Promise<{ portal: Portal; viewer: Viewer }> {
  const tokens = await exchangeRefreshToken(input.refreshToken);
  if (tokens.member_id !== input.memberId) throw new Error('member_id does not match the OAuth token');
  const viewer = await whoIs(tokens.client_endpoint, tokens.access_token);
  const existing = await getPortalByMemberId(tokens.member_id);
  if (existing && existing.status === 'active' && !viewer.isAdmin) return { portal: existing, viewer };
  const portal = await upsertPortal({
    memberId: tokens.member_id,
    domain: portalDomain(tokens.client_endpoint, tokens.domain),
    clientEndpoint: tokens.client_endpoint,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    applicationToken: null,
    clientId: tokens.client_id,
  });
  return { portal, viewer };
}

/**
 * Verify install / app-open credentials with Bitrix's OAuth server and store the portal.
 * The refresh token is exchanged at oauth.bitrix.info, which only answers for tokens issued to
 * this app and states the true member_id / domain / endpoint. A forged POST cannot pass.
 */
export async function verifyAndStorePortal(input: {
  memberId: string;
  refreshToken: string;
  applicationToken?: string | null;
}): Promise<Portal> {
  const tokens = await exchangeRefreshToken(input.refreshToken);
  if (tokens.member_id !== input.memberId) throw new Error('member_id does not match the OAuth token');
  return upsertPortal({
    memberId: tokens.member_id,
    // The token response's `domain` is the OAuth server itself (oauth.bitrix.info), not the portal.
    // The REST endpoint is always on the portal's own host, so take the domain from there.
    domain: portalDomain(tokens.client_endpoint, tokens.domain),
    clientEndpoint: tokens.client_endpoint,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    applicationToken: input.applicationToken ?? null,
    clientId: tokens.client_id,
  });
}
