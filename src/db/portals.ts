import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { encrypt } from '../crypto.js';
import type { Portal } from '../types.js';
import { exec, many, nowSec, one } from './pool.js';

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
                          access_expires_at, application_token, status, installed_at, updated_at, trial_ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$9,$10)
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
      ts + config().trialDays * 86_400, // the free trial starts at the first install, once
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

export interface BillingUpdate {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subStatus?: string | null;
  subQuantity?: number | null;
  subPeriodEnd?: number | null;
}

/** Apply what Stripe reported. Fields left undefined are kept. */
export const setBilling = (portalId: string, u: BillingUpdate) =>
  exec(
    `UPDATE portals SET
       stripe_customer_id     = CASE WHEN $2::boolean THEN $3 ELSE stripe_customer_id END,
       stripe_subscription_id = CASE WHEN $4::boolean THEN $5 ELSE stripe_subscription_id END,
       sub_status             = CASE WHEN $6::boolean THEN $7 ELSE sub_status END,
       sub_quantity           = CASE WHEN $8::boolean THEN $9::integer ELSE sub_quantity END,
       sub_period_end         = CASE WHEN $10::boolean THEN $11::bigint ELSE sub_period_end END,
       updated_at = $12
     WHERE id = $1`,
    [
      portalId,
      u.stripeCustomerId !== undefined, u.stripeCustomerId ?? null,
      u.stripeSubscriptionId !== undefined, u.stripeSubscriptionId ?? null,
      u.subStatus !== undefined, u.subStatus ?? null,
      u.subQuantity !== undefined, u.subQuantity ?? null,
      u.subPeriodEnd !== undefined, u.subPeriodEnd ?? null,
      nowSec(),
    ],
  );

export const getPortalByStripeCustomer = (customerId: string) =>
  one<Portal>('SELECT * FROM portals WHERE stripe_customer_id = $1 ORDER BY updated_at DESC LIMIT 1', [customerId]);

/** Removes the portal and, by cascade, its numbers, WhatsApp logins, chats, message log and users. */
export const deletePortal = (portalId: string) => exec('DELETE FROM portals WHERE id = $1', [portalId]);

export const listUninstalledBefore = (ts: number) =>
  many<Portal>("SELECT * FROM portals WHERE status = 'uninstalled' AND updated_at < $1", [ts]);
