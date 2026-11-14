import { config } from '../config.js';
import { decrypt } from '../crypto.js';
import type { Portal } from '../types.js';

const MAX_BYTES = 64 * 1024 * 1024;

export interface FetchedFile {
  data: Buffer;
  mime: string;
}

/**
 * Download an attachment an operator added in Bitrix. Only links on the portal's own hosts are
 * fetched (no SSRF through a crafted event); a link that needs auth gets the portal token.
 */
export async function fetchBitrixFile(portal: Portal, link: string): Promise<FetchedFile> {
  let url: URL;
  try {
    url = new URL(link, `https://${portal.domain}`);
  } catch {
    throw new Error('invalid attachment link');
  }
  const allowed = new Set([portal.domain, new URL(portal.client_endpoint).hostname]);
  if (url.protocol !== 'https:' || !allowed.has(url.hostname)) throw new Error('attachment link is not on the portal domain');

  let res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (res.status === 401 || res.status === 403 || (res.ok && /text\/html/i.test(res.headers.get('content-type') ?? ''))) {
    const authed = new URL(url);
    authed.searchParams.set('auth', decrypt(portal.access_token, config().tokenEncKey));
    res = await fetch(authed, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  }
  if (!res.ok) throw new Error(`attachment download HTTP ${res.status}`);
  return readCapped(res);
}

/** Public URL given to a robot ("File URL" field). https only, size-capped. */
export async function fetchPublicFile(link: string): Promise<FetchedFile> {
  const url = new URL(link);
  if (url.protocol !== 'https:') throw new Error('file URL must be https');
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`file download HTTP ${res.status}`);
  return readCapped(res);
}

async function readCapped(res: Response): Promise<FetchedFile> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new Error('file too large (max 64 MB)');
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_BYTES) throw new Error('file too large (max 64 MB)');
  return { data, mime: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!.trim() };
}

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const VIDEO = new Set(['mp4', '3gp', 'mov']);
const AUDIO = new Set(['ogg', 'opus', 'mp3', 'm4a', 'aac', 'amr', 'wav']);

/** Which WhatsApp message kind a file goes out as. Unknown -> document, which accepts anything. */
export function mediaKindFor(name: string, mime: string, bitrixType?: string): 'image' | 'video' | 'audio' | 'document' {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const t = bitrixType?.toLowerCase();
  if ((t === 'image' || mime.startsWith('image/')) && IMAGE.has(ext || 'jpg') && mime !== 'image/svg+xml') return 'image';
  if ((t === 'video' || mime.startsWith('video/')) && (VIDEO.has(ext) || mime === 'video/mp4')) return 'video';
  if ((t === 'audio' || mime.startsWith('audio/')) && (AUDIO.has(ext) || /ogg|mpeg|mp4|aac/.test(mime))) return 'audio';
  if (IMAGE.has(ext) && mime.startsWith('image/')) return 'image';
  return 'document';
}
