import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { encrypt } from '../crypto.js';
import type { Portal } from '../types.js';
import { exec, nowSec, one } from './pool.js';

export interface PortalAuthInput {
  memberId: string;
  domain: string;
  clientEndpoint: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** Only events carry this - never the iframe POST. */
  applicationToken?: string | null;
}

export const getPortalByMemberId = (memberId: string) =>
  one<Portal>('SELECT * FROM portals WHERE member_id = $1', [memberId]);

export const getPortalById = (id: string) => one<Portal>('SELECT * FROM portals WHERE id = $1', [id]);

/**
 * Create or refresh a portal from VERIFIED auth data (see bitrix/oauth.ts verifyInstall). The
 * application_token is COALESCEd so a path that does not carry it can never wipe a stored one.
 */
export async function upsertPortal(input: PortalAuthInput): Promise<Portal> {
  const key = config().tokenEncKey;
  const ts = nowSec();
  const row = await one<Portal>(
    `INSERT INTO portals (id, member_id, domain, client_endpoint, access_token, refresh_token,
                          access_expires_at, application_token, status, installed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$9)
     ON CONFLICT (member_id) DO UPDATE SET
       domain            = EXCLUDED.domain,
       client_endpoint   = EXCLUDED.client_endpoint,
       access_token      = EXCLUDED.access_token,
       refresh_token     = EXCLUDED.refresh_token,
       access_expires_at = EXCLUDED.access_expires_at,
       application_token = COALESCE(EXCLUDED.application_token, portals.application_token),
       status            = 'active',
       updated_at        = EXCLUDED.updated_at
     RETURNING *`,
    [
      randomUUID(),
      input.memberId,
      input.domain,
      input.clientEndpoint,
      encrypt(input.accessToken, key),
      encrypt(input.refreshToken, key),
      ts + Math.max(0, input.expiresIn - 60),
      input.applicationToken ?? null,
      ts,
    ],
  );
  if (!row) throw new Error('portal upsert failed');
  return row;
}

export async function saveTokens(portalId: string, accessToken: string, refreshToken: string, expiresIn: number) {
  const key = config().tokenEncKey;
  const ts = nowSec();
  await exec(
    'UPDATE portals SET access_token=$1, refresh_token=$2, access_expires_at=$3, updated_at=$4 WHERE id=$5',
    [encrypt(accessToken, key), encrypt(refreshToken, key), ts + Math.max(0, expiresIn - 60), ts, portalId],
  );
}

export const setApplicationToken = (portalId: string, token: string) =>
  exec('UPDATE portals SET application_token=$1, updated_at=$2 WHERE id=$3', [token, nowSec(), portalId]);

export const setConnectorVersion = (portalId: string, version: number | null) =>
  exec('UPDATE portals SET connector_version=$1, updated_at=$2 WHERE id=$3', [version, nowSec(), portalId]);

export const setDefaultNumber = (portalId: string, numberId: string | null) =>
  exec('UPDATE portals SET default_number_id=$1, updated_at=$2 WHERE id=$3', [numberId, nowSec(), portalId]);

/** Bitrix drops the connector and placements on uninstall, so the remembered version is cleared too. */
export const markUninstalled = (portalId: string) =>
  exec("UPDATE portals SET status='uninstalled', connector_version=NULL, updated_at=$1 WHERE id=$2", [nowSec(), portalId]);

export const setSelfLinkEnabled = (portalId: string, enabled: boolean) =>
  exec('UPDATE portals SET self_link_enabled=$1, updated_at=$2 WHERE id=$3', [enabled, nowSec(), portalId]);
