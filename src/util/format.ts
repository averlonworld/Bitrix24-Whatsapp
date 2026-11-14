/** Formatting conversions between Bitrix24 (BBCode) and WhatsApp (*bold* _italic_ ~strike~). */

/** Bitrix operator text -> WhatsApp text. */
export function bbcodeToWhatsApp(input: string): string {
  let s = input;
  s = s.replace(/\[br\]/gi, '\n');
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_, t: string) => wrap(t, '*'));
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, (_, t: string) => wrap(t, '_'));
  s = s.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, (_, t: string) => wrap(t, '~'));
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '$1');
  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url: string, text: string) =>
    text.trim() && text.trim() !== url ? `${text} (${url})` : url,
  );
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1');
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_, t: string) => t.split('\n').map((l) => `> ${l}`).join('\n'));
  s = s.replace(/\[(USER|CHAT)=\d+\]([\s\S]*?)\[\/(USER|CHAT)\]/gi, '$2');
  // Disk/file embeds and anything else left: drop the tags, keep the text.
  s = s.replace(/\[DISK FILE ID=[^\]]*\]/gi, '');
  s = s.replace(/\[\/?[a-z]+(=[^\]]*)?\]/gi, '');
  s = s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** WhatsApp markers only work hugging non-space text: "* bold *" does not render. */
function wrap(text: string, marker: string): string {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return text;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

/** WhatsApp text -> Bitrix BBCode (shown in the Open Line chat). */
export function whatsAppToBbcode(input: string): string {
  return input
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1[b]$2[/b]')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1[i]$2[/i]')
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?:;]|$)/g, '$1[s]$2[/s]');
}

/** Marker on every system note we post into a Bitrix chat, so the outbound path never forwards it. */
export const NOTE_PREFIX = '[WhatsApp] ';
