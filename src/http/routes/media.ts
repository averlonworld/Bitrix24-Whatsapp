import { Hono } from 'hono';
import { readMedia } from '../../media/store.js';

/** Inbound WhatsApp attachments, fetched by Bitrix24 by URL. The random key is the credential. */
export const mediaRoutes = new Hono();

mediaRoutes.get('/media/:key', async (c) => {
  const file = await readMedia(c.req.param('key'));
  if (!file) return c.text('not found', 404);
  // Only real media renders inline; anything else (an .html "document" a customer sent) downloads,
  // and the sandbox CSP stops it from ever running script on this origin.
  const inline = /^(image|video|audio)\//.test(file.meta.mime) && file.meta.mime !== 'image/svg+xml';
  const ascii = file.meta.name.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_');
  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.meta.mime,
      'Content-Length': String(file.data.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.meta.name)}`,
      'Cache-Control': 'private, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
});
