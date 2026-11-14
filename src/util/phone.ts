/** Phone and WhatsApp-jid helpers. Peers are stored as digits-only phones, or a group jid. */

export const digitsOnly = (raw: string): string => raw.replace(/\D/g, '');

export const isGroupJid = (jid: string): boolean => jid.endsWith('@g.us');
export const isPnJid = (jid: string): boolean => jid.endsWith('@s.whatsapp.net');
export const isLidJid = (jid: string): boolean => jid.endsWith('@lid');

/** "5511999999999:12@s.whatsapp.net" -> "5511999999999" */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || !isPnJid(jid)) return null;
  const user = jid.split('@')[0]?.split(':')[0] ?? '';
  const digits = digitsOnly(user);
  return digits.length >= 6 ? digits : null;
}

/** The external chat.id Bitrix knows a conversation by. Deterministic, so every entry point agrees. */
export function chatIdForPeer(peer: string): string {
  return isGroupJid(peer) || isLidJid(peer) ? peer : `${peer}@s.whatsapp.net`;
}

/** Where to send to a peer. */
export function jidForPeer(peer: string): string {
  return chatIdForPeer(peer);
}

/** E.164-ish validation for numbers typed by people: 7-15 digits, no leading zero. */
export function normalizePhone(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length < 7 || digits.length > 15 || digits.startsWith('0')) return null;
  return digits;
}
