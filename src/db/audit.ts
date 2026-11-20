import { logger } from '../logger.js';
import { exec, many, nowSec } from './pool.js';

/**
 * Activity log for administrators: who did what to numbers, settings and billing, and what WhatsApp,
 * Bitrix24 and Stripe did. Never message content. Kept AUDIT_KEEP_DAYS (see retention.ts).
 */
export const AUDIT_KEEP_DAYS = 365;

export type ActorType = 'user' | 'system' | 'bitrix' | 'stripe';

export interface AuditInput {
  portalId: string;
  actor?: { type: ActorType; userId?: number | null; name?: string | null };
  action: string;
  target?: { type: string; id?: string | null; label?: string | null };
  details?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditRow {
  id: string;
  at: number;
  actor_type: ActorType;
  actor_user_id: number | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

/** Record one entry. Never throws: losing an audit row must not break the action it describes. */
export async function audit(e: AuditInput): Promise<void> {
  try {
    await exec(
      `INSERT INTO audit_log (portal_id, at, actor_type, actor_user_id, actor_name, action, target_type, target_id, target_label, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        e.portalId,
        nowSec(),
        e.actor?.type ?? 'system',
        e.actor?.userId ?? null,
        e.actor?.name ?? null,
        e.action,
        e.target?.type ?? null,
        e.target?.id ?? null,
        e.target?.label ?? null,
        JSON.stringify(e.details ?? {}),
        e.ip ?? null,
      ],
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message, action: e.action }, 'audit write failed');
  }
}

export const AUDIT_CATEGORIES: Record<string, string[]> = {
  numbers: ['number.'],
  connection: ['connection.'],
  settings: ['settings.', 'auto_replies.', 'line.', 'app.'],
  billing: ['billing.'],
};

/** Newest first, paged by id. */
export function listAudit(portalId: string, opts: { beforeId?: string | null; limit?: number; category?: string | null }) {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 50));
  const prefixes = (opts.category && AUDIT_CATEGORIES[opts.category]) || null;
  return many<AuditRow>(
    `SELECT id::text, at, actor_type, actor_user_id, actor_name, action, target_type, target_id, target_label, details, ip
       FROM audit_log
      WHERE portal_id = $1
        AND ($2::bigint IS NULL OR id < $2::bigint)
        AND ($3::text[] IS NULL OR action LIKE ANY (SELECT p || '%' FROM unnest($3::text[]) p))
      ORDER BY id DESC
      LIMIT $4`,
    [portalId, opts.beforeId ?? null, prefixes, limit],
  );
}

export const purgeAudit = () => exec('DELETE FROM audit_log WHERE at < $1', [nowSec() - AUDIT_KEEP_DAYS * 86_400]);

const q = (s: unknown) => `"${String(s ?? '')}"`;
const phone = (p: unknown) => (p ? ` (+${String(p)})` : '');
const onOff = (v: unknown) => (v ? 'on' : 'off');

/** One plain-English sentence per entry, used by the app and the CSV export. */
export function describe(r: Pick<AuditRow, 'action' | 'target_label' | 'details'>): string {
  const d = r.details ?? {};
  const t = q(r.target_label);
  switch (r.action) {
    case 'number.created':
      return `Added ${d.personal ? 'personal ' : ''}number ${t}`;
    case 'number.deleted':
      return `Removed number ${t}${phone(d.phone)}`;
    case 'number.renamed':
      return `Renamed number ${q(d.from)} to ${q(d.to)}`;
    case 'number.connect':
      return `Started linking / reconnecting ${t}`;
    case 'number.pairing_code':
      return `Requested a phone-number pairing code for ${t}`;
    case 'number.paused':
      return `Paused syncing for ${t}`;
    case 'number.logged_out':
      return `Logged ${t} out of WhatsApp`;
    case 'number.line_changed':
      return d.lineId ? `Routed ${t} to Open Line #${String(d.lineId)}${d.fromLineId ? ` (was #${String(d.fromLineId)})` : ''}` : `Stopped routing ${t} to an Open Line`;
    case 'number.groups':
      return `Turned group chats ${onOff(d.enabled)} for ${t}`;
    case 'number.default':
      return `Made ${t} the default number`;
    case 'line.created':
      return `Created Open Line ${t}`;
    case 'line.personal_created':
      return `Created personal Open Line ${t}`;
    case 'settings.self_link':
      return `Turned "Let employees link their own WhatsApp" ${onOff(d.enabled)}`;
    case 'auto_replies.updated': {
      const on = ['welcome', 'away', 'closing', 'rating'].filter((k) => (d as Record<string, { on?: boolean }>)[k]?.on);
      return `Updated automatic replies (${on.length ? `on: ${on.join(', ')}` : 'all off'})`;
    }
    case 'billing.checkout':
      return `Opened checkout for ${String(d.quantity)} number(s)`;
    case 'billing.seats':
      return `Changed the plan to ${String(d.quantity)} number(s)`;
    case 'billing.subscription':
      return `Subscription is now ${String(d.status)}${d.quantity ? ` (${String(d.quantity)} numbers)` : ''}`;
    case 'connection.linked':
      return `${t} linked to WhatsApp${phone(d.phone)}`;
    case 'connection.logged_out':
      return `${t} was logged out of WhatsApp${d.error ? `: ${String(d.error)}` : ''}`;
    case 'connection.disconnected':
      return `${t} disconnected${d.error ? `: ${String(d.error)}` : ''}`;
    case 'app.installed':
      return 'App installed or reinstalled in Bitrix24';
    case 'app.uninstalled':
      return 'App uninstalled from Bitrix24 (data kept 30 days)';
    default:
      return r.action;
  }
}

/** CSV with a header row; values quoted, formulas neutralised for spreadsheet safety. */
export function toCsv(rows: AuditRow[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['Time (UTC)', 'Who', 'Actor type', 'User id', 'Action', 'What happened', 'Target', 'IP address'];
  const lines = rows.map((r) =>
    [
      new Date(r.at * 1000).toISOString().replace('T', ' ').slice(0, 19),
      r.actor_name ?? (r.actor_type === 'user' ? `User ${r.actor_user_id ?? ''}` : r.actor_type),
      r.actor_type,
      r.actor_user_id ?? '',
      r.action,
      describe(r),
      r.target_label ?? '',
      r.ip ?? '',
    ]
      .map(cell)
      .join(','),
  );
  return [head.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}
