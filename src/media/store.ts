import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

/**
 * Inbound WhatsApp attachments on local disk, served to Bitrix24 at /media/:key.
 * The key is 32 random bytes (base64url) and is the only credential, so it must stay unguessable.
 * Each file is stored as <key>.bin with its metadata in <key>.json.
 */

export interface MediaMeta {
  name: string;
  mime: string;
  size: number;
  createdAt: number;
}

export interface StoredMedia {
  key: string;
  name: string;
  mime: string;
}

const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

function dir(): string {
  return config().mediaDir;
}

function paths(key: string) {
  return { data: join(dir(), `${key}.bin`), meta: join(dir(), `${key}.json`) };
}

export async function saveMedia(data: Buffer, name: string, mime: string): Promise<StoredMedia> {
  await mkdir(dir(), { recursive: true });
  const key = randomBytes(32).toString('base64url');
  const p = paths(key);
  const meta: MediaMeta = { name, mime, size: data.length, createdAt: Date.now() };
  await writeFile(p.data, data);
  await writeFile(p.meta, JSON.stringify(meta));
  return { key, name, mime };
}

export async function readMedia(key: string): Promise<{ data: Buffer; meta: MediaMeta } | null> {
  if (!KEY_RE.test(key)) return null; // also blocks path traversal
  const p = paths(key);
  try {
    const [data, raw] = await Promise.all([readFile(p.data), readFile(p.meta, 'utf8')]);
    return { data, meta: JSON.parse(raw) as MediaMeta };
  } catch {
    return null;
  }
}

export function mediaUrl(key: string): string {
  return `${config().publicUrl}/media/${key}`;
}

/** Deletes attachments older than MEDIA_MAX_AGE_DAYS. Bitrix24 copies files on receipt. */
export async function cleanupMedia(): Promise<number> {
  const maxAgeMs = config().mediaMaxAgeDays * 86_400_000;
  let entries: string[];
  try {
    entries = await readdir(dir());
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.bin') && !entry.endsWith('.json')) continue;
    const file = join(dir(), entry);
    try {
      if ((await stat(file)).mtimeMs < cutoff) {
        await unlink(file);
        removed++;
      }
    } catch {
      // already gone
    }
  }
  return removed;
}
