import { randomUUID } from 'node:crypto';
import type { NumberStatus, WaNumber } from '../types.js';
import { exec, many, nowSec, one } from './pool.js';

export async function createNumber(portalId: string, label: string): Promise<WaNumber> {
  const ts = nowSec();
  const row = await one<WaNumber>(
    `INSERT INTO wa_numbers (id, portal_id, label, status, created_at, updated_at)
     VALUES ($1,$2,$3,'new',$4,$4) RETURNING *`,
    [randomUUID(), portalId, label, ts],
  );
  if (!row) throw new Error('number insert failed');
  return row;
}

export const getNumber = (id: string) => one<WaNumber>('SELECT * FROM wa_numbers WHERE id=$1', [id]);

/** Portal-scoped: one tenant can never address another tenant's number. */
export const getPortalNumber = (portalId: string, id: string) =>
  one<WaNumber>('SELECT * FROM wa_numbers WHERE id=$1 AND portal_id=$2', [id, portalId]);

export const listNumbers = (portalId: string) =>
  many<WaNumber>('SELECT * FROM wa_numbers WHERE portal_id=$1 ORDER BY created_at', [portalId]);

export const listAllNumbers = () => many<WaNumber>('SELECT * FROM wa_numbers ORDER BY created_at');

export const getNumberByLine = (portalId: string, lineId: number) =>
  one<WaNumber>('SELECT * FROM wa_numbers WHERE portal_id=$1 AND line_id=$2', [portalId, lineId]);

export const setNumberStatus = (id: string, status: NumberStatus, error: string | null = null) =>
  exec('UPDATE wa_numbers SET status=$1, last_error=$2, updated_at=$3 WHERE id=$4', [status, error, nowSec(), id]);

export const setNumberPhone = (id: string, phone: string) =>
  exec('UPDATE wa_numbers SET phone=$1, updated_at=$2 WHERE id=$3', [phone, nowSec(), id]);

export const setGroupsEnabled = (id: string, enabled: boolean) =>
  exec('UPDATE wa_numbers SET groups_enabled=$1, updated_at=$2 WHERE id=$3', [enabled, nowSec(), id]);

/** A line feeds exactly one number: whoever held it before is unbound first. */
export async function bindLine(portalId: string, id: string, lineId: number | null): Promise<void> {
  if (lineId !== null) {
    await exec('UPDATE wa_numbers SET line_id=NULL, updated_at=$1 WHERE portal_id=$2 AND line_id=$3 AND id<>$4', [
      nowSec(),
      portalId,
      lineId,
      id,
    ]);
  }
  await exec('UPDATE wa_numbers SET line_id=$1, updated_at=$2 WHERE id=$3', [lineId, nowSec(), id]);
}

export const deleteNumber = (id: string) => exec('DELETE FROM wa_numbers WHERE id=$1', [id]);
