import { proto } from 'baileys';
import { describe, expect, it } from 'vitest';
import { portalDomain } from '../src/bitrix/auth.js';
import { diffScopes } from '../src/bitrix/scopes.js';
import { alertDecision } from '../src/sync/alerts.js';
import { parseCrmPlacement, parseDocumentId, timelineEntityType } from '../src/bitrix/crm.js';
import { mediaKindFor } from '../src/bitrix/files.js';
import { config } from '../src/config.js';
import { decrypt, encrypt, signToken, verifyToken } from '../src/crypto.js';
import { pickNumber } from '../src/sync/crmSend.js';
import { targetJid } from '../src/sync/outbound.js';
import type { WaNumber } from '../src/types.js';
import { bbcodeToWhatsApp, whatsAppToBbcode } from '../src/util/format.js';
import { KeyedMutex } from '../src/util/keyedMutex.js';
import { chatIdForPeer, normalizePhone, phoneFromJid } from '../src/util/phone.js';
import { parsePhpForm } from '../src/util/phpForm.js';
import { extForMime, mediaFileName, parseContent } from '../src/whatsapp/parse.js';

describe('formatting', () => {
  it('converts Bitrix BBCode to WhatsApp markers', () => {
    expect(bbcodeToWhatsApp('[b]Hello[/b] [i]there[/i][br][s]old[/s]')).toBe('*Hello* _there_\n~old~');
    expect(bbcodeToWhatsApp('[b] spaced [/b]')).toBe('*spaced*');
    expect(bbcodeToWhatsApp('[url=https://x.io]site[/url]')).toBe('site (https://x.io)');
    expect(bbcodeToWhatsApp('[USER=5]Ann[/USER] hi')).toBe('Ann hi');
    expect(bbcodeToWhatsApp('a &amp; b')).toBe('a & b');
    expect(bbcodeToWhatsApp('[DISK FILE ID=n12]')).toBe('');
  });
  it('converts WhatsApp markers to BBCode', () => {
    expect(whatsAppToBbcode('*bold* and _it_ and ~gone~')).toBe('[b]bold[/b] and [i]it[/i] and [s]gone[/s]');
    expect(whatsAppToBbcode('2*3*4')).toBe('2*3*4');
  });
});

describe('phones and jids', () => {
  it('extracts phones only from phone jids', () => {
    expect(phoneFromJid('5511999999999@s.whatsapp.net')).toBe('5511999999999');
    expect(phoneFromJid('5511999999999:12@s.whatsapp.net')).toBe('5511999999999');
    expect(phoneFromJid('37039881908374@lid')).toBeNull();
    expect(phoneFromJid('120363@g.us')).toBeNull();
  });
  it('builds deterministic chat ids', () => {
    expect(chatIdForPeer('971501234567')).toBe('971501234567@s.whatsapp.net');
    expect(chatIdForPeer('1203630@g.us')).toBe('1203630@g.us');
  });
  it('normalizes typed numbers', () => {
    expect(normalizePhone('+971 50 123-4567')).toBe('971501234567');
    expect(normalizePhone('0501234567')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
  it('derives the reply address from the chat id', () => {
    expect(targetJid('971501234567@s.whatsapp.net')).toBe('971501234567@s.whatsapp.net');
    expect(targetJid('1203@g.us')).toBe('1203@g.us');
    expect(targetJid('weird', '1@lid')).toBe('1@lid');
  });
});

describe('PHP form parsing (Bitrix events)', () => {
  it('nests bracket keys', () => {
    const out = parsePhpForm([
      ['auth[member_id]', 'm1'],
      ['data[MESSAGES][0][message][text]', 'hi'],
      ['data[MESSAGES][0][chat][id]', '1@s.whatsapp.net'],
      ['document_id[]', 'crm'],
      ['document_id[]', 'CCrmDocumentDeal'],
      ['__proto__[x]', 'bad'],
    ]);
    expect(out).toMatchObject({
      auth: { member_id: 'm1' },
      data: { MESSAGES: { '0': { message: { text: 'hi' }, chat: { id: '1@s.whatsapp.net' } } } },
      document_id: { '0': 'crm', '1': 'CCrmDocumentDeal' },
    });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('CRM coverage', () => {
  it('reads every placement kind', () => {
    expect(parseCrmPlacement('CRM_LEAD_DETAIL_TAB', '{"ID":"5"}')).toEqual({ entityTypeId: 1, entityId: 5 });
    expect(parseCrmPlacement('CRM_DEAL_LIST_MENU', '{"ID":7}')).toEqual({ entityTypeId: 2, entityId: 7 });
    expect(parseCrmPlacement('CRM_SMART_INVOICE_DETAIL_TAB', '{"ID":"3"}')).toEqual({ entityTypeId: 31, entityId: 3 });
    expect(parseCrmPlacement('CRM_DYNAMIC_128_DETAIL_TAB', '{"ID":"9"}')).toEqual({ entityTypeId: 128, entityId: 9 });
    expect(parseCrmPlacement('CRM_DYNAMIC_1030_LIST_MENU', '{"ID":"2"}')).toEqual({ entityTypeId: 1030, entityId: 2 });
    expect(parseCrmPlacement('CRM_DEAL_DETAIL_TAB', 'not json')).toBeNull();
  });
  it('reads business-process document ids', () => {
    expect(parseDocumentId(['crm', 'CCrmDocumentDeal', 'DEAL_12'])).toEqual({ entityTypeId: 2, entityId: 12 });
    expect(parseDocumentId(['crm', 'CCrmDocumentLead', 'LEAD_3'])).toEqual({ entityTypeId: 1, entityId: 3 });
    expect(parseDocumentId(['crm', 'Bitrix\\Crm\\Integration\\BizProc\\Document\\Dynamic', 'DYNAMIC_128_5'])).toEqual({
      entityTypeId: 128,
      entityId: 5,
    });
    expect(parseDocumentId(['crm', 'x', 'SMART_INVOICE_4'])).toEqual({ entityTypeId: 31, entityId: 4 });
    expect(parseDocumentId(['lists', 'x', 'ELEMENT_1'])).toBeNull();
  });
  it('maps timeline entity types', () => {
    expect(timelineEntityType(2)).toBe('deal');
    expect(timelineEntityType(128)).toBe('dynamic_128');
  });
});

describe('WhatsApp message parsing', () => {
  it('reads plain and extended text', () => {
    expect(parseContent({ conversation: 'hello' }).text).toBe('hello');
    const reply = parseContent({
      extendedTextMessage: { text: 'yes', contextInfo: { quotedMessage: { conversation: 'are you open?' } } },
    });
    expect(reply.text).toBe('yes');
    expect(reply.quoted).toBe('are you open?');
  });
  it('reads media with captions', () => {
    const img = parseContent({ imageMessage: { caption: 'invoice', mimetype: 'image/jpeg' } });
    expect(img).toMatchObject({ mediaType: 'imageMessage', text: 'invoice', mime: 'image/jpeg' });
    const doc = parseContent({ documentMessage: { fileName: 'a.pdf', mimetype: 'application/pdf' } });
    expect(mediaFileName(doc, 'ABCDEF123')).toBe('a.pdf');
    const voice = parseContent({ audioMessage: { mimetype: 'audio/ogg; codecs=opus' } });
    expect(mediaFileName(voice, 'ABCDEF123')).toBe('voice-ABCDEF12.ogg');
  });
  it('unwraps ephemeral / view-once wrappers', () => {
    expect(parseContent({ ephemeralMessage: { message: { conversation: 'secret' } } }).text).toBe('secret');
  });
  it('detects deletions and skips protocol noise', () => {
    const revoke = parseContent({ protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key: { id: 'X1' } } });
    expect(revoke).toMatchObject({ skip: true, revokedId: 'X1' });
    expect(parseContent({ reactionMessage: { text: '👍' } }).skip).toBe(true);
    expect(parseContent(null).skip).toBe(true);
  });
  it('turns locations into map links', () => {
    expect(parseContent({ locationMessage: { degreesLatitude: 25.2, degreesLongitude: 55.3 } }).text).toContain(
      'https://maps.google.com/?q=25.2,55.3',
    );
  });
  it('maps mime types to extensions', () => {
    expect(extForMime('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extForMime('application/vnd.ms-excel')).toBe('vndmsexcel');
  });
});

describe('outgoing media kind', () => {
  it('picks the WhatsApp message kind', () => {
    expect(mediaKindFor('a.jpg', 'image/jpeg', 'image')).toBe('image');
    expect(mediaKindFor('logo.svg', 'image/svg+xml', 'image')).toBe('document');
    expect(mediaKindFor('v.mp4', 'video/mp4')).toBe('video');
    expect(mediaKindFor('note.ogg', 'audio/ogg')).toBe('audio');
    expect(mediaKindFor('rec.webm', 'audio/webm', 'audio')).toBe('document');
    expect(mediaKindFor('report.pdf', 'application/pdf', 'file')).toBe('document');
  });
});

describe('crypto', () => {
  it('round-trips AES-GCM and rejects tampering', () => {
    const key = config().tokenEncKey;
    const ct = encrypt('secret-token', key);
    expect(decrypt(ct, key)).toBe('secret-token');
    const bad = Buffer.from(ct, 'base64');
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => decrypt(bad.toString('base64'), key)).toThrow();
  });
  it('signs and verifies tokens, rejecting forgery and expiry', () => {
    const t = signToken({ p: 'portal-1' }, 's', 60);
    expect(verifyToken<{ p: string }>(t, 's')?.p).toBe('portal-1');
    expect(verifyToken(t, 'other-secret')).toBeNull();
    expect(verifyToken(`${t}x`, 's')).toBeNull();
    expect(verifyToken(signToken({ p: 1 }, 's', -1), 's')).toBeNull();
  });
});

describe('number selection for CRM sends', () => {
  const n = (id: string, label: string, phone: string | null, status: WaNumber['status'] = 'connected'): WaNumber => ({
    id,
    label,
    phone,
    status,
    portal_id: 'p',
    last_error: null,
    line_id: null,
    groups_enabled: false,
    created_at: 0,
    updated_at: 0,
    status_changed_at: null,
    alerted_status: null,
  });
  const nums = [n('a', 'Sales', '971500000001', 'disconnected'), n('b', 'Support', '971500000002')];
  it('honours explicit id, label, phone, default, then first connected', () => {
    expect(pickNumber(nums, { numberId: 'a' }, null)?.id).toBe('a');
    expect(pickNumber(nums, { from: 'sales' }, null)?.id).toBe('a');
    expect(pickNumber(nums, { from: '+971 50 000 0002' }, null)?.id).toBe('b');
    expect(pickNumber(nums, {}, 'a')?.id).toBe('a');
    expect(pickNumber(nums, {}, null)?.id).toBe('b');
    expect(pickNumber([], {}, null)).toBeNull();
  });
});

describe('KeyedMutex', () => {
  it('keeps FIFO order per key and runs keys in parallel', async () => {
    const m = new KeyedMutex();
    const log: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all([
      m.run('a', async () => {
        await wait(30);
        log.push('a1');
      }),
      m.run('a', async () => {
        log.push('a2');
      }),
      m.run('b', async () => {
        log.push('b1');
      }),
    ]);
    expect(log.indexOf('a1')).toBeLessThan(log.indexOf('a2'));
    expect(log.indexOf('b1')).toBeLessThan(log.indexOf('a1'));
  });
});

describe('portal domain', () => {
  it('takes the portal host from the REST endpoint, not the OAuth server', () => {
    expect(portalDomain('https://world.bitrix24.eu/rest/', 'oauth.bitrix.info')).toBe('world.bitrix24.eu');
    expect(portalDomain('not a url', 'oauth.bitrix.info')).toBe('oauth.bitrix.info');
  });
});

describe('disconnect alerts', () => {
  const base = { phone: '918355892950', last_error: null, alerted_status: null, status_changed_at: 1000 } as const;
  it('alerts once after the grace period for real problems only', () => {
    expect(alertDecision({ ...base, status: 'logged_out', last_error: 'Logged out from the phone.' }, 1030)).toBe(null);
    expect(alertDecision({ ...base, status: 'logged_out', last_error: 'Logged out from the phone.' }, 1061)).toBe('down');
    expect(alertDecision({ ...base, status: 'logged_out', last_error: 'x', alerted_status: 'logged_out' }, 5000)).toBe(null);
    expect(alertDecision({ ...base, status: 'connecting' }, 1500)).toBe(null);
    expect(alertDecision({ ...base, status: 'connecting' }, 1601)).toBe('down');
  });
  it('stays quiet for admin actions and unlinked numbers', () => {
    expect(alertDecision({ ...base, status: 'disconnected' }, 9999)).toBe(null); // paused from the app
    expect(alertDecision({ ...base, status: 'logged_out' }, 9999)).toBe(null); // logged out from the app
    expect(alertDecision({ ...base, phone: null, status: 'connecting' }, 9999)).toBe(null);
  });
  it('reports recovery, or clears silently when an admin resolved it', () => {
    expect(alertDecision({ ...base, status: 'connected', alerted_status: 'connecting' }, 9999)).toBe('recovered');
    expect(alertDecision({ ...base, status: 'disconnected', alerted_status: 'logged_out' }, 9999)).toBe('clear');
    expect(alertDecision({ ...base, status: 'connected' }, 9999)).toBe(null);
  });
});

describe('required Bitrix24 permissions', () => {
  it('lists what the portal did not grant', () => {
    expect(diffScopes(['crm', 'imopenlines', 'imconnector', 'placement', 'bizproc', 'messageservice', 'im.import'])).toEqual(['im']);
    expect(diffScopes(['crm', 'imopenlines', 'imconnector', 'placement', 'bizproc', 'messageservice', 'im'])).toEqual([]);
  });
});
