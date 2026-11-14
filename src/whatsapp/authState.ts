import {
  type AuthenticationCreds,
  type AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  type SignalDataTypeMap,
} from 'baileys';
import { config } from '../config.js';
import { decrypt, encrypt } from '../crypto.js';
import { exec, many, one } from '../db/pool.js';

/**
 * Baileys multi-device auth state persisted in PostgreSQL, encrypted with TOKEN_ENC_KEY.
 * Equivalent to Baileys' useMultiFileAuthState, but survives container rebuilds and keeps the
 * keys (full access to the WhatsApp account) encrypted at rest.
 */
export async function usePostgresAuthState(numberId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const key = config().tokenEncKey;
  const serialize = (value: unknown) => encrypt(JSON.stringify(value, BufferJSON.replacer), key);
  const deserialize = (value: string) => JSON.parse(decrypt(value, key), BufferJSON.reviver);

  const write = (k: string, value: unknown) =>
    exec(
      `INSERT INTO wa_auth (number_id, key, value) VALUES ($1,$2,$3)
       ON CONFLICT (number_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [numberId, k, serialize(value)],
    );
  const remove = (k: string) => exec('DELETE FROM wa_auth WHERE number_id=$1 AND key=$2', [numberId, k]);

  const credsRow = await one<{ value: string }>('SELECT value FROM wa_auth WHERE number_id=$1 AND key=$2', [numberId, 'creds']);
  const creds: AuthenticationCreds = credsRow ? deserialize(credsRow.value) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          if (ids.length === 0) return result;
          const rows = await many<{ key: string; value: string }>(
            'SELECT key, value FROM wa_auth WHERE number_id=$1 AND key = ANY($2)',
            [numberId, ids.map((id) => `${type}-${id}`)],
          );
          const byKey = new Map(rows.map((r) => [r.key, r.value]));
          for (const id of ids) {
            const raw = byKey.get(`${type}-${id}`);
            if (!raw) continue;
            let value = deserialize(raw);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }
          return result;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
            const entries = data[category] ?? {};
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              tasks.push(value ? write(`${category}-${id}`, value) : remove(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await write('creds', creds);
    },
  };
}

export async function clearAuthState(numberId: string): Promise<void> {
  await exec('DELETE FROM wa_auth WHERE number_id=$1', [numberId]);
}

/** A number is "linked" once WhatsApp accepted the QR and gave the device an identity. */
export async function hasLinkedCreds(numberId: string): Promise<boolean> {
  const row = await one<{ value: string }>('SELECT value FROM wa_auth WHERE number_id=$1 AND key=$2', [numberId, 'creds']);
  if (!row) return false;
  try {
    const creds = JSON.parse(decrypt(row.value, config().tokenEncKey), BufferJSON.reviver) as AuthenticationCreds;
    return Boolean(creds.me?.id);
  } catch {
    return false;
  }
}
