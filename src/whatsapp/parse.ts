import { getContentType, normalizeMessageContent, proto, type WAMessage } from 'baileys';

/** Pure helpers that turn a raw WhatsApp message into what Bitrix24 needs. No I/O. */

export const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface ParsedContent {
  text: string;
  mediaType: MediaType | null;
  mime: string | null;
  fileName: string | null;
  quoted: string | null;
  /** protocol messages (revoke, edits, key distribution...) carry nothing to show */
  skip: boolean;
  revokedId: string | null;
  editedText: string | null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
};

export function extForMime(mime: string | null | undefined): string {
  const base = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return EXT_BY_MIME[base] ?? (base.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin');
}

function describe(content: proto.IMessage | null | undefined): string | null {
  const c = normalizeMessageContent(content ?? undefined);
  if (!c) return null;
  const type = getContentType(c);
  if (!type) return null;
  switch (type) {
    case 'conversation':
      return c.conversation ?? null;
    case 'extendedTextMessage':
      return c.extendedTextMessage?.text ?? null;
    case 'imageMessage':
      return c.imageMessage?.caption ? `📷 ${c.imageMessage.caption}` : '📷 Photo';
    case 'videoMessage':
      return c.videoMessage?.caption ? `🎥 ${c.videoMessage.caption}` : '🎥 Video';
    case 'audioMessage':
      return '🎤 Voice message';
    case 'documentMessage':
      return `📄 ${c.documentMessage?.fileName ?? 'Document'}`;
    case 'stickerMessage':
      return 'Sticker';
    case 'locationMessage':
      return '📍 Location';
    case 'contactMessage':
      return `👤 ${c.contactMessage?.displayName ?? 'Contact'}`;
    default:
      return null;
  }
}

/** Short one-line form of a quoted message, for the "↪ replying to" prefix. */
export function quotedPreview(content: proto.IMessage | null | undefined, max = 120): string | null {
  const text = describe(content);
  if (!text) return null;
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function parseContent(message: proto.IMessage | null | undefined): ParsedContent {
  const empty: ParsedContent = {
    text: '',
    mediaType: null,
    mime: null,
    fileName: null,
    quoted: null,
    skip: false,
    revokedId: null,
    editedText: null,
  };
  const c = normalizeMessageContent(message ?? undefined);
  if (!c) return { ...empty, skip: true };

  if (c.protocolMessage) {
    const pm = c.protocolMessage;
    if (pm.type === proto.Message.ProtocolMessage.Type.REVOKE) {
      return { ...empty, skip: true, revokedId: pm.key?.id ?? null };
    }
    if (pm.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) {
      return { ...empty, skip: true, editedText: describe(pm.editedMessage) };
    }
    return { ...empty, skip: true };
  }
  // Reactions arrive separately on messages.reaction (see engine.ts).
  if (c.reactionMessage) return { ...empty, skip: true };

  const type = getContentType(c);
  const out: ParsedContent = { ...empty };

  const contextInfo =
    c.extendedTextMessage?.contextInfo ??
    c.imageMessage?.contextInfo ??
    c.videoMessage?.contextInfo ??
    c.audioMessage?.contextInfo ??
    c.documentMessage?.contextInfo ??
    c.stickerMessage?.contextInfo ??
    null;
  out.quoted = quotedPreview(contextInfo?.quotedMessage);

  switch (type) {
    case 'conversation':
      out.text = c.conversation ?? '';
      break;
    case 'extendedTextMessage':
      out.text = c.extendedTextMessage?.text ?? '';
      break;
    case 'imageMessage':
      out.mediaType = 'imageMessage';
      out.mime = c.imageMessage?.mimetype ?? 'image/jpeg';
      out.text = c.imageMessage?.caption ?? '';
      break;
    case 'videoMessage':
      out.mediaType = 'videoMessage';
      out.mime = c.videoMessage?.mimetype ?? 'video/mp4';
      out.text = c.videoMessage?.caption ?? '';
      break;
    case 'audioMessage':
      out.mediaType = 'audioMessage';
      out.mime = c.audioMessage?.mimetype ?? 'audio/ogg';
      break;
    case 'documentMessage':
      out.mediaType = 'documentMessage';
      out.mime = c.documentMessage?.mimetype ?? 'application/octet-stream';
      out.fileName = c.documentMessage?.fileName ?? null;
      out.text = c.documentMessage?.caption ?? '';
      break;
    case 'stickerMessage':
      out.mediaType = 'stickerMessage';
      out.mime = c.stickerMessage?.mimetype ?? 'image/webp';
      break;
    case 'locationMessage':
    case 'liveLocationMessage': {
      const loc = c.locationMessage ?? c.liveLocationMessage;
      const lat = loc?.degreesLatitude;
      const lng = loc?.degreesLongitude;
      const name = c.locationMessage?.name ? `${c.locationMessage.name}\n` : '';
      out.text = lat != null && lng != null ? `📍 ${name}https://maps.google.com/?q=${lat},${lng}` : '📍 Location';
      break;
    }
    case 'contactMessage':
      out.text = `👤 ${c.contactMessage?.displayName ?? 'Contact'}\n${vcardPhones(c.contactMessage?.vcard)}`.trim();
      break;
    case 'contactsArrayMessage':
      out.text = (c.contactsArrayMessage?.contacts ?? [])
        .map((x) => `👤 ${x.displayName ?? 'Contact'} ${vcardPhones(x.vcard)}`.trim())
        .join('\n');
      break;
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3': {
      const poll = c.pollCreationMessage ?? c.pollCreationMessageV2 ?? c.pollCreationMessageV3;
      out.text = `📊 ${poll?.name ?? 'Poll'}\n${(poll?.options ?? []).map((o) => `• ${o.optionName}`).join('\n')}`;
      break;
    }
    case 'buttonsResponseMessage':
      out.text = c.buttonsResponseMessage?.selectedDisplayText ?? '';
      break;
    case 'listResponseMessage':
      out.text = c.listResponseMessage?.title ?? '';
      break;
    case 'templateButtonReplyMessage':
      out.text = c.templateButtonReplyMessage?.selectedDisplayText ?? '';
      break;
    default:
      if (!type || type === 'senderKeyDistributionMessage' || type === 'messageContextInfo') out.skip = true;
      else out.text = `[Unsupported WhatsApp message: ${type}]`;
  }
  return out;
}

function vcardPhones(vcard: string | null | undefined): string {
  if (!vcard) return '';
  const phones = [...vcard.matchAll(/TEL[^:]*:([+\d\s()-]+)/g)].map((m) => m[1]?.trim()).filter(Boolean);
  return phones.join(', ');
}

/** Human-friendly default file name for a media message that came without one. */
export function mediaFileName(parsed: ParsedContent, waMessageId: string): string {
  if (parsed.fileName) return parsed.fileName.replace(/[\\/\r\n]/g, '_');
  const prefix =
    parsed.mediaType === 'imageMessage'
      ? 'photo'
      : parsed.mediaType === 'videoMessage'
        ? 'video'
        : parsed.mediaType === 'audioMessage'
          ? 'voice'
          : parsed.mediaType === 'stickerMessage'
            ? 'sticker'
            : 'file';
  return `${prefix}-${waMessageId.slice(0, 8)}.${extForMime(parsed.mime)}`;
}

export const messageTimestamp = (msg: WAMessage): number => {
  const ts = msg.messageTimestamp;
  if (typeof ts === 'number') return ts;
  if (ts && typeof (ts as { toNumber?: () => number }).toNumber === 'function') return (ts as { toNumber: () => number }).toNumber();
  return Math.floor(Date.now() / 1000);
};
