import { config, type BitrixApp } from '../config.js';

const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';
const TIMEOUT_MS = 20_000;

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  member_id: string;
  domain: string;
  client_endpoint: string;
  server_endpoint?: string;
  user_id?: number;
  scope?: string;
  /** Which of our Bitrix24 apps the token belongs to. */
  client_id: string;
}

export class OAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'OAuthError';
  }
}

/**
 * Exchange a refresh token at Bitrix's own OAuth server.
 *
 * Besides refreshing, this is the install VERIFICATION: only oauth.bitrix.info can answer, only for
 * a token issued to OUR client_id, and the answer names the real member_id, domain and REST
 * endpoint. The original connector trusted DOMAIN/AUTH_ID/member_id from the iframe POST as-is,
 * which let anyone who knew a portal's member_id redirect it to their own server.
 */
export async function exchangeRefreshToken(refreshToken: string, clientId?: string | null): Promise<OAuthTokens> {
  const apps = config().bitrixApps;
  // The portal's own app first when known; otherwise (a first install) try each app we serve.
  // A token issued to another client_id is refused without being used up, so trying is safe.
  const order = clientId ? [...apps.filter((a) => a.clientId === clientId), ...apps.filter((a) => a.clientId !== clientId)] : apps;
  let last: OAuthError | null = null;
  for (const app of order) {
    try {
      return await exchangeWith(app, refreshToken);
    } catch (err) {
      if (!(err instanceof OAuthError) || err.code === 'NETWORK') throw err;
      last = err;
    }
  }
  throw last ?? new OAuthError('NO_APP', 'no Bitrix24 app configured');
}

async function exchangeWith(app: BitrixApp, refreshToken: string): Promise<OAuthTokens> {
  const url = new URL(OAUTH_URL);
  url.searchParams.set('grant_type', 'refresh_token');
  url.searchParams.set('client_id', app.clientId);
  url.searchParams.set('client_secret', app.clientSecret);
  url.searchParams.set('refresh_token', refreshToken);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new OAuthError('NETWORK', `oauth.bitrix.info unreachable: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as (Partial<OAuthTokens> & { error?: string; error_description?: string }) | null;
  if (!body?.access_token || !body.refresh_token || !body.member_id || !body.client_endpoint || !body.domain) {
    throw new OAuthError(body?.error ?? 'REFRESH_FAILED', body?.error_description ?? `HTTP ${res.status}`);
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: Number(body.expires_in ?? 3600),
    member_id: body.member_id,
    domain: body.domain,
    client_endpoint: body.client_endpoint,
    server_endpoint: body.server_endpoint,
    user_id: body.user_id,
    scope: body.scope,
    client_id: app.clientId,
  };
}
