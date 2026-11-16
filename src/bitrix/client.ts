import { config } from '../config.js';
import { decrypt } from '../crypto.js';
import { getPortalById, saveTokens } from '../db/portals.js';
import { exec, nowSec } from '../db/pool.js';
import type { Portal } from '../types.js';
import { exchangeRefreshToken } from './oauth.js';

const TIMEOUT_MS = 20_000;
const EXPIRED = new Set(['expired_token', 'invalid_token', 'NO_AUTH_FOUND']);

export class BitrixError extends Error {
  constructor(readonly code: string, readonly description: string, readonly method: string) {
    super(`${method}: ${code} - ${description}`);
    this.name = 'BitrixError';
  }
}

interface Envelope<T> {
  result?: T;
  error?: string;
  error_description?: string;
}

/** Refresh tokens are single-use: concurrent refreshes for one portal must share one exchange. */
const inflight = new Map<string, Promise<string>>();

async function refresh(portal: Portal): Promise<string> {
  const running = inflight.get(portal.id);
  if (running) return running;
  const job = (async () => {
    // Re-read: another caller may have refreshed (and rotated the refresh token) a moment ago.
    const fresh = (await getPortalById(portal.id)) ?? portal;
    if (fresh.access_expires_at > nowSec() + 30 && fresh.access_token !== portal.access_token) {
      return decrypt(fresh.access_token, config().tokenEncKey);
    }
    const tokens = await exchangeRefreshToken(decrypt(fresh.refresh_token, config().tokenEncKey));
    await saveTokens(portal.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);
    return tokens.access_token;
  })().finally(() => inflight.delete(portal.id));
  inflight.set(portal.id, job);
  return job;
}

export async function rawCall<T>(endpoint: string, method: string, params: Record<string, unknown>, token: string): Promise<Envelope<T>> {
  const url = `${endpoint.replace(/\/$/, '')}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...params, auth: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as Envelope<T> | null;
    return body ?? { error: 'ERROR_UNEXPECTED_ANSWER', error_description: `HTTP ${res.status}` };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { error: 'ERROR_TIMEOUT', error_description: `timed out after ${TIMEOUT_MS}ms` };
    }
    return { error: 'ERROR_NETWORK', error_description: (err as Error).message };
  }
}

/** Call a REST method in application (OAuth) context, refreshing the token when needed. */
export async function call<T = unknown>(portal: Portal, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const started = Date.now();
  let token =
    portal.access_expires_at > nowSec() ? decrypt(portal.access_token, config().tokenEncKey) : await refresh(portal);
  let res = await rawCall<T>(portal.client_endpoint, method, params, token);
  if (res.error && EXPIRED.has(res.error)) {
    token = await refresh(portal);
    res = await rawCall<T>(portal.client_endpoint, method, params, token);
  }
  // Audit trail the Market requires (>= 3 days): method, outcome and timing - never tokens or data.
  void exec('INSERT INTO rest_log (portal_id, method, error, ms, created_at) VALUES ($1, $2, $3, $4, $5)', [
    portal.id,
    method,
    res.error ? `${res.error}: ${(res.error_description ?? '').slice(0, 200)}` : null,
    Date.now() - started,
    nowSec(),
  ]).catch(() => undefined);
  if (res.error) throw new BitrixError(res.error, res.error_description ?? '', method);
  return res.result as T;
}

/** Proves an access token handed to us in an event really belongs to that portal. */
export async function tokenWorks(endpoint: string, token: string): Promise<boolean> {
  const res = await rawCall(endpoint, 'server.time', {}, token);
  return !res.error;
}

/** "Handler already binded" and friends: re-binding is an error in Bitrix, not a no-op. */
export async function bindIdempotent(portal: Portal, method: string, params: Record<string, unknown>): Promise<void> {
  try {
    await call(portal, method, params);
  } catch (err) {
    if (err instanceof BitrixError && /already\s*(binded|bound|exists|registered)/i.test(err.description)) return;
    throw err;
  }
}
