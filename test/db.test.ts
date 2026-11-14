import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Runs only with TEST_DATABASE_URL (a throwaway PostgreSQL). */
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('database', () => {
  let mod: typeof import('../src/db/messages.js');
  let chats: typeof import('../src/db/chats.js');
  let pool: typeof import('../src/db/pool.js');
  let numberId = '';
  let portalId = '';

  beforeAll(async () => {
    const { migrate } = await import('../src/db/migrate.js');
    await migrate();
    pool = await import('../src/db/pool.js');
    mod = await import('../src/db/messages.js');
    chats = await import('../src/db/chats.js');
    const { upsertPortal } = await import('../src/db/portals.js');
    const { createNumber } = await import('../src/db/numbers.js');
    const portal = await upsertPortal({
      memberId: `m-${randomUUID()}`,
      domain: 'x.bitrix24.com',
      clientEndpoint: 'https://x.bitrix24.com/rest/',
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
    });
    portalId = portal.id;
    numberId = (await createNumber(portal.id, 'test')).id;
  });
  afterAll(async () => {
    await pool.exec('DELETE FROM portals WHERE id=$1', [portalId]);
    await pool.closeDb();
  });

  it('claims a message once, even when redelivered', async () => {
    const first = await mod.claim(numberId, 'in', { waMessageId: 'WA1' });
    expect(first.proceed).toBe(true);
    await mod.markSent(first.row.id, null);
    const again = await mod.claim(numberId, 'in', { waMessageId: 'WA1' });
    expect(again.proceed).toBe(false);
    // Same id in another direction is a different message.
    expect((await mod.claim(numberId, 'phone_out', { waMessageId: 'WA1' })).proceed).toBe(true);
  });

  it('hands a crashed pending claim back for completion', async () => {
    const first = await mod.claim(numberId, 'out', { extRef: '777' });
    const retry = await mod.claim(numberId, 'out', { extRef: '777' });
    expect(retry.proceed).toBe(true);
    expect(retry.row.id).toBe(first.row.id);
  });

  it('keeps one chat per contact and preserves the original chat id', async () => {
    const a = await chats.upsertChat({ numberId, peer: '971500000001', chatId: '971500000001@s.whatsapp.net', jid: '971500000001@s.whatsapp.net', lineId: 3, bitrixChatId: 11 });
    const b = await chats.upsertChat({ numberId, peer: '971500000001', chatId: 'IGNORED', jid: '123@lid', lineId: null, name: 'Ann' });
    expect(b.id).toBe(a.id);
    expect(b.chat_id).toBe('971500000001@s.whatsapp.net');
    expect(b.last_jid).toBe('123@lid');
    expect(b.bitrix_chat_id).toBe(11);
    expect(b.line_id).toBe(3);
    expect(b.name).toBe('Ann');
    expect((await chats.findChatByBitrixChatId(portalId, 11))?.id).toBe(a.id);
    expect(await chats.findChatByBitrixChatId(randomUUID(), 11)).toBeNull();
  });
});
