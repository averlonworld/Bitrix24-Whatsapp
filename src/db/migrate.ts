import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db } from './pool.js';

export async function migrate(): Promise<void> {
  const sql = await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
  await db().query(sql);
}

// `npm run migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(() => {
      console.log('schema applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
