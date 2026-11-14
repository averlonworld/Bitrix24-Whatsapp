/**
 * Bitrix posts events as PHP-style form data: auth[access_token]=..&data[MESSAGES][0][message][text]=..
 * This turns those bracket keys into nested objects. Numeric indices become object keys ("0", "1"),
 * never arrays - read them with Object.values().
 */
export type PhpValue = string | { [key: string]: PhpValue };

export function parsePhpForm(entries: Iterable<[string, string]>): Record<string, PhpValue> {
  const root: Record<string, PhpValue> = {};
  for (const [rawKey, value] of entries) {
    const parts = rawKey.match(/^([^[\]]+)|\[([^[\]]*)\]/g);
    if (!parts) continue;
    const path = parts.map((p) => (p.startsWith('[') ? p.slice(1, -1) : p));
    let node: Record<string, PhpValue> = root;
    for (let i = 0; i < path.length; i++) {
      let key = path[i] as string;
      if (key === '') key = String(Object.keys(node).length); // a[]=x
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') break;
      if (i === path.length - 1) {
        node[key] = value;
      } else {
        const next = node[key];
        if (typeof next !== 'object' || next === null) node[key] = {};
        node = node[key] as Record<string, PhpValue>;
      }
    }
  }
  return root;
}

export async function readPhpForm(request: Request): Promise<Record<string, PhpValue>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return ((await request.json().catch(() => ({}))) ?? {}) as Record<string, PhpValue>;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const entries: Array<[string, string]> = [];
  form.forEach((v, k) => {
    if (typeof v === 'string') entries.push([k, v]);
  });
  return parsePhpForm(entries);
}

export const str = (v: PhpValue | undefined): string => (typeof v === 'string' ? v : '');
export const obj = (v: PhpValue | undefined): Record<string, PhpValue> => (v && typeof v === 'object' ? v : {});
