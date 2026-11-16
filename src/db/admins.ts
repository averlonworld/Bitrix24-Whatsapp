import { exec, many, nowSec } from './pool.js';

/** Remember a Bitrix24 administrator who opened the app (recipients of disconnect alerts). */
export const recordAdmin = (portalId: string, userId: number) =>
  exec(
    `INSERT INTO portal_admins (portal_id, user_id, last_seen_at) VALUES ($1, $2, $3)
     ON CONFLICT (portal_id, user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
    [portalId, userId, nowSec()],
  );

/** Someone who is no longer an administrator stops receiving alerts. */
export const forgetAdmin = (portalId: string, userId: number) =>
  exec('DELETE FROM portal_admins WHERE portal_id=$1 AND user_id=$2', [portalId, userId]);

/** Administrators seen in the last `days` days. */
export const listAdmins = (portalId: string, days = 180) =>
  many<{ user_id: number }>('SELECT user_id FROM portal_admins WHERE portal_id=$1 AND last_seen_at >= $2 ORDER BY user_id', [
    portalId,
    nowSec() - days * 86_400,
  ]).then((rows) => rows.map((r) => Number(r.user_id)));
