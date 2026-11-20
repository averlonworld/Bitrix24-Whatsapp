import { exec, many, nowSec } from './pool.js';

export interface PortalUser {
  user_id: number;
  name: string | null;
  is_admin: boolean;
}

/** Remember who opened the app: names for the team view, admins as alert recipients. */
export const recordViewer = (portalId: string, v: { userId: number; name: string | null; isAdmin: boolean }) =>
  exec(
    `INSERT INTO portal_users (portal_id, user_id, name, is_admin, last_seen_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (portal_id, user_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, portal_users.name),
       is_admin = EXCLUDED.is_admin, last_seen_at = EXCLUDED.last_seen_at`,
    [portalId, v.userId, v.name, v.isAdmin, nowSec()],
  );

/** Administrators seen in the last `days` days. */
export const listAdmins = (portalId: string, days = 180) =>
  many<{ user_id: number }>(
    'SELECT user_id FROM portal_users WHERE portal_id=$1 AND is_admin AND last_seen_at >= $2 ORDER BY user_id',
    [portalId, nowSec() - days * 86_400],
  ).then((rows) => rows.map((r) => Number(r.user_id)));

export async function userNames(portalId: string): Promise<Map<number, string>> {
  const rows = await many<{ user_id: number; name: string | null }>('SELECT user_id, name FROM portal_users WHERE portal_id=$1', [portalId]);
  return new Map(rows.filter((r) => r.name).map((r) => [Number(r.user_id), r.name as string]));
}

export const getUserName = (portalId: string, userId: number) =>
  many<{ name: string | null }>('SELECT name FROM portal_users WHERE portal_id=$1 AND user_id=$2', [portalId, userId]).then(
    (r) => r[0]?.name ?? null,
  );

/** Has this person finished or skipped the onboarding tutorial? Unknown users count as done. */
export const isOnboarded = (portalId: string, userId: number) =>
  many<{ onboarded_at: number | null }>('SELECT onboarded_at FROM portal_users WHERE portal_id=$1 AND user_id=$2', [portalId, userId]).then(
    (r) => !r[0] || r[0].onboarded_at !== null,
  );

export const markOnboarded = (portalId: string, userId: number) =>
  exec('UPDATE portal_users SET onboarded_at=$1 WHERE portal_id=$2 AND user_id=$3', [nowSec(), portalId, userId]);
