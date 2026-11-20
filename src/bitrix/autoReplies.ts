import { exec, many, nowSec } from '../db/pool.js';
import { listNumbers } from '../db/numbers.js';
import { logger } from '../logger.js';
import type { Portal } from '../types.js';
import { call } from './client.js';

/**
 * Bitrix24 Open Lines send automatic messages (welcome, no answer, closing, rating request), and the
 * connector forwards them to the customer on WhatsApp. They are OFF by default on every Open Line
 * the app creates; administrators switch on and word the ones they want in the app.
 */
export interface AutoReplies {
  welcome: { on: boolean; text: string };
  away: { on: boolean; text: string; minutes: number };
  closing: { on: boolean; text: string };
  rating: { on: boolean };
}

export const DEFAULT_AUTO_REPLIES: AutoReplies = {
  welcome: { on: false, text: 'Hi! Thanks for your message. We will reply shortly.' },
  away: { on: false, text: 'We are not available right now and will reply as soon as possible.', minutes: 15 },
  closing: { on: false, text: 'Thank you for contacting us!' },
  rating: { on: false },
};

const AWAY_MINUTES = [1, 5, 15, 30, 60];

/** Clean up whatever the browser sent: unknown keys dropped, text capped, minutes from a fixed list. */
export function normalizeAutoReplies(input: unknown): AutoReplies {
  const i = (input ?? {}) as Partial<Record<keyof AutoReplies, Record<string, unknown>>>;
  const text = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : d);
  const on = (v: unknown) => v === true;
  const minutes = Number(i.away?.minutes);
  return {
    welcome: { on: on(i.welcome?.on), text: text(i.welcome?.text, DEFAULT_AUTO_REPLIES.welcome.text) },
    away: {
      on: on(i.away?.on),
      text: text(i.away?.text, DEFAULT_AUTO_REPLIES.away.text),
      minutes: AWAY_MINUTES.includes(minutes) ? minutes : DEFAULT_AUTO_REPLIES.away.minutes,
    },
    closing: { on: on(i.closing?.on), text: text(i.closing?.text, DEFAULT_AUTO_REPLIES.closing.text) },
    rating: { on: on(i.rating?.on) },
  };
}

/** Plain text from the app -> Bitrix BBCode (line breaks become [br], brackets cannot inject tags). */
const bb = (s: string) => s.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\r?\n/g, '[br]');

/** imopenlines.config PARAMS for these settings. Used on create and on every save. */
export function lineParams(a: AutoReplies): Record<string, string | number> {
  return {
    WELCOME_MESSAGE: a.welcome.on ? 'Y' : 'N',
    ...(a.welcome.on ? { WELCOME_MESSAGE_TEXT: bb(a.welcome.text) } : {}),
    NO_ANSWER_RULE: a.away.on ? 'text' : 'none',
    ...(a.away.on ? { NO_ANSWER_TEXT: bb(a.away.text), NO_ANSWER_TIME: a.away.minutes * 60 } : {}),
    CLOSE_RULE: a.closing.on ? 'text' : 'none',
    ...(a.closing.on ? { CLOSE_TEXT: bb(a.closing.text) } : {}),
    VOTE_MESSAGE: a.rating.on ? 'Y' : 'N',
  };
}

export function autoRepliesOf(portal: Pick<Portal, 'auto_replies'>): AutoReplies {
  return normalizeAutoReplies(portal.auto_replies ?? {});
}

export const saveAutoReplies = (portalId: string, a: AutoReplies) =>
  exec('UPDATE portals SET auto_replies=$1, updated_at=$2 WHERE id=$3', [JSON.stringify(a), nowSec(), portalId]);

/** Remember an Open Line the app created, so the settings keep applying to it. */
export const recordAppLine = (portalId: string, lineId: number) =>
  exec('INSERT INTO app_lines (portal_id, line_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [portalId, lineId, nowSec()]);

/** The Open Lines the settings apply to: those WhatsApp numbers use, plus those the app created. */
export async function whatsappLines(portalId: string): Promise<number[]> {
  const created = await many<{ line_id: number }>('SELECT line_id FROM app_lines WHERE portal_id=$1', [portalId]);
  const bound = (await listNumbers(portalId)).map((n) => n.line_id).filter((x): x is number => !!x);
  return [...new Set([...bound, ...created.map((r) => Number(r.line_id))])].sort((a, b) => a - b);
}

/** Push the settings to every WhatsApp Open Line. Lines deleted in Bitrix24 are skipped. */
export async function applyAutoReplies(portal: Portal, a = autoRepliesOf(portal)) {
  const params = lineParams(a);
  const applied: number[] = [];
  const failed: Array<{ lineId: number; error: string }> = [];
  for (const lineId of await whatsappLines(portal.id)) {
    try {
      const ok = await call<boolean>(portal, 'imopenlines.config.update', { CONFIG_ID: lineId, PARAMS: params });
      if (ok === false) failed.push({ lineId, error: 'Open Line not found' });
      else applied.push(lineId);
    } catch (err) {
      failed.push({ lineId, error: (err as Error).message });
    }
  }
  if (failed.length) logger.warn({ portalId: portal.id, failed }, 'auto replies not applied to some lines');
  return { applied, failed };
}
