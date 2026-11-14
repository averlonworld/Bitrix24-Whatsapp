import pg from 'pg';
import { config } from '../config.js';

// BIGINT columns hold unix seconds - well inside Number's safe range.
pg.types.setTypeParser(20, (v) => Number(v));

let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: config().databaseUrl, max: 10 });
  return pool;
}

export async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const res = await db().query(sql, params);
  return (res.rows[0] as T | undefined) ?? null;
}

export async function many<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db().query(sql, params);
  return res.rows as T[];
}

export async function exec(sql: string, params: unknown[] = []): Promise<number> {
  const res = await db().query(sql, params);
  return res.rowCount ?? 0;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

export const nowSec = () => Math.floor(Date.now() / 1000);
