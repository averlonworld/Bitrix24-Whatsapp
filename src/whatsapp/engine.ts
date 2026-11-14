import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  proto,
  type AnyMessageContent,
  type WAMessage,
  type WASocket,
} from 'baileys';
import { config } from '../config.js';
import { setNumberPhone, setNumberStatus } from '../db/numbers.js';
import { logger as rootLogger } from '../logger.js';
import { saveMedia } from '../media/store.js';
import type { NumberStatus } from '../types.js';
import { isGroupJid, isLidJid, isPnJid, phoneFromJid } from '../util/phone.js';
import { clearAuthState, usePostgresAuthState } from './authState.js';
import type { InboundJob, ReceiptEvent } from './jobs.js';
import { mediaFileName, messageTimestamp, parseContent } from './parse.js';

const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
/** WhatsApp gives up on an unscanned QR after a few rotations; we stop and let the user retry. */
const MAX_QR_ROTATIONS = 6;

export interface EngineHandlers {
  onInbound(job: InboundJob): Promise<void>;
  onReceipt(event: ReceiptEvent): Promise<void>;
}

export interface OutgoingMedia {
  kind: 'image' | 'video' | 'audio' | 'document';
  data: Buffer;
  mime: string;
  fileName: string;
  caption?: string;
}

interface Session {
  numberId: string;
  sock: WASocket;
  qr: string | null;
  qrRotations: number;
  status: NumberStatus;
  /** ids of messages this connector sent - their fromMe echoes must not be mirrored back */
  ownIds: Set<string>;
  /** recent outgoing content, for WhatsApp's retry-decrypt requests (getMessage) */
  recent: Map<string, proto.IMessage>;
  sendChain: Promise<unknown>;
  lastSendAt: number;
  stopping: boolean;
  reconnectAttempts: number;
  groupNames: Map<string, string>;
}

/**
 * Runs one WhatsApp Web (multi-device, linked device) connection per number, in-process.
 * No third-party gateway: this server is the "WhatsApp Web" client for every linked number.
 */
export class WhatsAppEngine {
  private sessions = new Map<string, Session>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private log = rootLogger.child({ mod: 'engine' });

  constructor(private readonly handlers: EngineHandlers) {}

  status(numberId: string): { status: NumberStatus | 'offline'; qr: string | null } {
    const s = this.sessions.get(numberId);
    return s ? { status: s.status, qr: s.qr } : { status: 'offline', qr: null };
  }

  isConnected(numberId: string): boolean {
    return this.sessions.get(numberId)?.status === 'connected';
  }

  /** Open (or re-open) the connection. Emits a QR if the number is not linked yet. */
  async start(numberId: string): Promise<void> {
    const existing = this.sessions.get(numberId);
    if (existing && !existing.stopping) return;

    const { state, saveCreds } = await usePostgresAuthState(numberId);
    const log = this.log.child({ numberId });
    const baileysLogger = rootLogger.child({ mod: 'baileys', numberId });
    baileysLogger.level = 'warn';

    const session: Session = {
      numberId,
      sock: undefined as unknown as WASocket,
      qr: null,
      qrRotations: 0,
      status: 'connecting',
      ownIds: existing?.ownIds ?? new Set(),
      recent: existing?.recent ?? new Map(),
      sendChain: Promise.resolve(),
      lastSendAt: 0,
      stopping: false,
      reconnectAttempts: existing?.reconnectAttempts ?? 0,
      groupNames: existing?.groupNames ?? new Map(),
    };

    const sock = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      logger: baileysLogger,
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false, // keep the phone receiving notifications
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => (key.id ? session.recent.get(key.id) : undefined),
    });
    session.sock = sock;
    this.sessions.set(numberId, session);
    await this.setStatus(session, 'connecting');

    sock.ev.on('creds.update', () => {
      saveCreds().catch((err) => log.error({ err }, 'saving creds failed'));
    });

    sock.ev.on('connection.update', (update) => {
      void this.onConnectionUpdate(session, update).catch((err) => log.error({ err }, 'connection.update handler failed'));
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return; // 'append' = history/backfill, never re-post it
      for (const msg of messages) {
        void this.onMessage(session, msg).catch((err) => log.error({ err, id: msg.key.id }, 'inbound message failed'));
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id || update.status == null) continue;
        const status =
          update.status >= proto.WebMessageInfo.Status.READ
            ? 'read'
            : update.status === proto.WebMessageInfo.Status.DELIVERY_ACK
              ? 'delivered'
              : null;
        if (!status) continue;
        void this.handlers
          .onReceipt({ numberId, waMessageId: key.id, status })
          .catch((err) => log.warn({ err }, 'receipt handler failed'));
      }
    });

    sock.ev.on('messages.reaction', (reactions) => {
      for (const { key, reaction } of reactions) {
        const emoji = reaction.text;
        const chatJid = key.remoteJid;
        if (!emoji || !chatJid || reaction.key?.fromMe) continue;
        void this.emitNote(session, chatJid, key.remoteJidAlt, `reaction:${key.id}:${emoji}`, `{contact} reacted ${emoji} to ${key.fromMe ? 'your' : 'their'} message`);
      }
    });

    sock.ev.on('call', (calls) => {
      for (const call of calls) {
        const labels: Record<string, string> = {
          offer: `📞 Incoming WhatsApp ${call.isVideo ? 'video' : 'voice'} call from {contact}`,
          timeout: `📞 Missed WhatsApp ${call.isVideo ? 'video' : 'voice'} call from {contact}`,
          reject: `📞 Declined WhatsApp call from {contact}`,
        };
        const text = labels[call.status];
        if (!text || call.isGroup) continue;
        const alt = call.callerPn ? `${call.callerPn.replace(/\D/g, '')}@s.whatsapp.net` : undefined;
        void this.emitNote(session, call.from, alt, `call:${call.id}:${call.status}`, text);
      }
    });
  }

  private async onConnectionUpdate(session: Session, update: Partial<import('baileys').ConnectionState>) {
    const { connection, lastDisconnect, qr } = update;
    const log = this.log.child({ numberId: session.numberId });

    if (qr) {
      session.qrRotations++;
      if (session.qrRotations > MAX_QR_ROTATIONS) {
        log.info('QR not scanned in time - stopping');
        await this.stop(session.numberId, 'disconnected', 'QR code expired. Generate a new one.');
        return;
      }
      session.qr = qr;
      await this.setStatus(session, 'qr');
    }

    if (connection === 'open') {
      session.qr = null;
      session.qrRotations = 0;
      session.reconnectAttempts = 0;
      const phone = phoneFromJid(session.sock.user?.id ?? null) ?? (session.sock.user?.id ?? '').split(':')[0]?.replace(/\D/g, '');
      if (phone) await setNumberPhone(session.numberId, phone);
      await this.setStatus(session, 'connected');
      log.info({ phone }, 'WhatsApp connected');
    }

    if (connection === 'close') {
      if (session.stopping) return;
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      this.sessions.delete(session.numberId);

      if (code === DisconnectReason.loggedOut) {
        // Unlinked from the phone (Linked devices -> Log out) or banned: the keys are dead.
        await clearAuthState(session.numberId);
        session.status = 'logged_out';
        await setNumberStatus(session.numberId, 'logged_out', 'Logged out from the phone. Scan a new QR code to reconnect.');
        log.warn('logged out');
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        await setNumberStatus(session.numberId, 'disconnected', 'Opened in another place (connection replaced).');
        log.warn('connection replaced by another client');
        return;
      }
      if (session.status === 'qr' && session.qrRotations >= MAX_QR_ROTATIONS) return;

      // Anything else (restart required after pairing, network drop, server hiccup): reconnect
      // with capped exponential backoff.
      const attempt = ++session.reconnectAttempts;
      const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
      log.info({ code, delay, attempt }, 'connection closed - reconnecting');
      await setNumberStatus(session.numberId, 'connecting', null);
      const pending: Session = { ...session, stopping: true };
      this.sessions.set(session.numberId, pending); // carry ownIds/recent across the restart
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(session.numberId);
        this.start(session.numberId).catch((err) => log.error({ err }, 'reconnect failed'));
      }, delay);
      this.reconnectTimers.set(session.numberId, timer);
    }
  }

  private async setStatus(session: Session, status: NumberStatus, error: string | null = null) {
    session.status = status;
    await setNumberStatus(session.numberId, status, error);
  }

  /** Resolve who a chat is with: digits-only phone for people, the group jid for groups. */
  private async resolvePeer(session: Session, jid: string, alt?: string | null): Promise<string> {
    if (isGroupJid(jid)) return jid;
    const direct = phoneFromJid(jid) ?? phoneFromJid(alt ?? null);
    if (direct) return direct;
    if (isLidJid(jid)) {
      const pn = await session.sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
      const viaMapping = phoneFromJid(pn);
      if (viaMapping) return viaMapping;
    }
    return jid; // unresolvable LID: still a stable per-contact key
  }

  private async emitNote(session: Session, jid: string, alt: string | null | undefined, eventId: string, text: string) {
    try {
      if (isGroupJid(jid)) return;
      const peer = await this.resolvePeer(session, jid, alt);
      await this.handlers.onInbound({
        kind: 'note',
        numberId: session.numberId,
        peer,
        jid,
        eventId,
        text,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      this.log.warn({ err, eventId }, 'note dropped');
    }
  }

  private async onMessage(session: Session, msg: WAMessage) {
    const jid = msg.key.remoteJid;
    const id = msg.key.id;
    if (!jid || !id) return;
    if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
    if (msg.key.fromMe && session.ownIds.has(id)) return; // echo of our own send

    const parsed = parseContent(msg.message);
    if (parsed.revokedId) {
      if (!msg.key.fromMe) await this.emitNote(session, jid, msg.key.remoteJidAlt, `delete:${parsed.revokedId}`, '{contact} deleted a message');
      return;
    }
    if (parsed.editedText && !msg.key.fromMe) {
      await this.emitNote(session, jid, msg.key.remoteJidAlt, `edit:${id}`, `✏️ {contact} edited a message: ${parsed.editedText}`);
      return;
    }
    if (parsed.skip) return;

    let media: { key: string; name: string; mime: string } | null = null;
    if (parsed.mediaType) {
      try {
        const data = await downloadMediaMessage(msg, 'buffer', {}, {
          logger: rootLogger.child({ mod: 'baileys-media' }),
          reuploadRequest: session.sock.updateMediaMessage,
        });
        if (data.length <= MAX_MEDIA_BYTES) {
          const stored = await saveMedia(data, mediaFileName(parsed, id), parsed.mime ?? 'application/octet-stream');
          media = { key: stored.key, name: stored.name, mime: stored.mime };
        } else {
          parsed.text = `${parsed.text}\n[Attachment too large to forward: ${(data.length / 1048576).toFixed(1)} MB]`.trim();
        }
      } catch (err) {
        this.log.warn({ err, id }, 'media download failed');
        parsed.text = `${parsed.text}\n[Attachment could not be downloaded]`.trim();
      }
    }

    const participantJid = msg.key.participant ?? null;
    await this.handlers.onInbound({
      kind: 'message',
      numberId: session.numberId,
      waMessageId: id,
      fromMe: Boolean(msg.key.fromMe),
      peer: await this.resolvePeer(session, jid, msg.key.remoteJidAlt),
      jid,
      pushName: msg.key.fromMe ? null : (msg.pushName ?? null),
      participant: isGroupJid(jid)
        ? (msg.pushName ?? phoneFromJid(msg.key.participantAlt ?? participantJid) ?? participantJid)
        : null,
      timestamp: messageTimestamp(msg),
      text: parsed.text,
      quoted: parsed.quoted,
      media,
      firstSeenAt: Date.now(),
    });
  }

  /** Display name of a group, cached. */
  async groupName(numberId: string, groupJid: string): Promise<string | null> {
    const s = this.sessions.get(numberId);
    if (!s) return null;
    const cached = s.groupNames.get(groupJid);
    if (cached) return cached;
    try {
      const meta = await s.sock.groupMetadata(groupJid);
      if (meta.subject) s.groupNames.set(groupJid, meta.subject);
      return meta.subject ?? null;
    } catch {
      return null;
    }
  }

  async profilePicture(numberId: string, jid: string): Promise<string | null> {
    const s = this.sessions.get(numberId);
    if (!s || s.status !== 'connected') return null;
    try {
      return (await s.sock.profilePictureUrl(jid, 'image', 5000)) ?? null;
    } catch {
      return null;
    }
  }

  /** Is this phone on WhatsApp? Returns the jid to use, or null. */
  async lookup(numberId: string, phone: string): Promise<string | null> {
    const s = this.requireConnected(numberId);
    const [hit] = (await s.sock.onWhatsApp(phone)) ?? [];
    return hit?.exists ? hit.jid : null;
  }

  async requestPairingCode(numberId: string, phone: string): Promise<string> {
    const s = this.sessions.get(numberId);
    if (!s) throw new Error('Start the connection first');
    if (s.status === 'connected') throw new Error('Already connected');
    return s.sock.requestPairingCode(phone.replace(/\D/g, ''));
  }

  private requireConnected(numberId: string): Session {
    const s = this.sessions.get(numberId);
    if (!s || s.status !== 'connected') {
      throw new EngineError('NOT_CONNECTED', 'This WhatsApp number is not connected. Open the app and reconnect it.');
    }
    return s;
  }

  /**
   * Paced send: messages from one number go out one at a time with a minimum gap plus a
   * human-like "typing" pause, which is what keeps a linked number from looking like a bot.
   */
  private send(numberId: string, jid: string, content: AnyMessageContent, typingMs = 0): Promise<string> {
    const s = this.requireConnected(numberId);
    const job = s.sendChain.then(async () => {
      const live = this.requireConnected(numberId);
      const wait = live.lastSendAt + config().sendMinIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      if (typingMs > 0 && !isGroupJid(jid)) {
        await live.sock.sendPresenceUpdate('composing', jid).catch(() => undefined);
        await sleep(typingMs);
        await live.sock.sendPresenceUpdate('paused', jid).catch(() => undefined);
      }
      const sent = await live.sock.sendMessage(jid, content);
      live.lastSendAt = Date.now();
      const id = sent?.key.id;
      if (!id) throw new EngineError('SEND_FAILED', 'WhatsApp did not accept the message');
      live.ownIds.add(id);
      if (sent.message) live.recent.set(id, sent.message);
      trim(live.ownIds, 5000);
      trimMap(live.recent, 500);
      return id;
    });
    s.sendChain = job.catch(() => undefined);
    return job;
  }

  sendText(numberId: string, jid: string, text: string): Promise<string> {
    return this.send(numberId, jid, { text }, Math.min(2500, 400 + text.length * 25));
  }

  sendMedia(numberId: string, jid: string, media: OutgoingMedia): Promise<string> {
    let content: AnyMessageContent;
    switch (media.kind) {
      case 'image':
        content = { image: media.data, mimetype: media.mime, caption: media.caption };
        break;
      case 'video':
        content = { video: media.data, mimetype: media.mime, caption: media.caption };
        break;
      case 'audio':
        // Ogg/Opus goes as a voice note (push-to-talk); anything else as a plain audio file.
        content = { audio: media.data, mimetype: media.mime, ptt: /ogg|opus/i.test(media.mime) };
        break;
      default:
        content = { document: media.data, mimetype: media.mime, fileName: media.fileName, caption: media.caption };
    }
    return this.send(numberId, jid, content, 600);
  }

  /** Close the socket but keep the login, so the number reconnects on the next start(). */
  private cancelReconnect(numberId: string) {
    const timer = this.reconnectTimers.get(numberId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(numberId);
  }

  async stop(numberId: string, status: NumberStatus = 'disconnected', error: string | null = null): Promise<void> {
    this.cancelReconnect(numberId);
    const s = this.sessions.get(numberId);
    if (s) {
      s.stopping = true;
      this.sessions.delete(numberId);
      await s.sock.end(undefined).catch(() => undefined);
    }
    await setNumberStatus(numberId, status, error);
  }

  /** Unlink the device from WhatsApp and wipe its keys. */
  async logout(numberId: string): Promise<void> {
    this.cancelReconnect(numberId);
    const s = this.sessions.get(numberId);
    if (s) {
      s.stopping = true;
      this.sessions.delete(numberId);
      await s.sock.logout().catch(() => undefined);
      await s.sock.end(undefined).catch(() => undefined);
    }
    await clearAuthState(numberId);
    await setNumberStatus(numberId, 'logged_out', null);
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.reconnectTimers.keys()]) this.cancelReconnect(id);
    await Promise.all(
      [...this.sessions.values()].map(async (s) => {
        s.stopping = true;
        await s.sock.end(undefined).catch(() => undefined);
      }),
    );
    this.sessions.clear();
  }

  /** Is `jid` a usable address for a peer we only know by phone? */
  static jidIsAddressable(jid: string): boolean {
    return isPnJid(jid) || isLidJid(jid) || isGroupJid(jid);
  }
}

export class EngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function trim(set: Set<string>, max: number) {
  while (set.size > max) {
    const first = set.values().next().value;
    if (first === undefined) break;
    set.delete(first);
  }
}

function trimMap<K, V>(map: Map<K, V>, max: number) {
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}
