import { logger } from '../logger.js';
import type { Portal } from '../types.js';
import { call } from './client.js';

/** Permissions the app needs. Without `im`, phone-typed messages, CRM sends and alerts silently fail. */
export const REQUIRED_SCOPES = ['imconnector', 'imopenlines', 'im', 'crm', 'placement', 'bizproc', 'messageservice'] as const;

export function diffScopes(granted: readonly string[]): string[] {
  return REQUIRED_SCOPES.filter((s) => !granted.includes(s));
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; missing: string[] }>();

/** Required scopes this portal did not grant. Empty when the check itself fails. */
export async function missingScopes(portal: Portal): Promise<string[]> {
  const hit = cache.get(portal.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.missing;
  try {
    const granted = await call<string[]>(portal, 'scope', {});
    const missing = diffScopes(Array.isArray(granted) ? granted : []);
    cache.set(portal.id, { at: Date.now(), missing });
    if (missing.length) logger.warn({ memberId: portal.member_id, missing }, 'app is missing Bitrix24 permissions');
    return missing;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'scope check failed');
    return [];
  }
}
