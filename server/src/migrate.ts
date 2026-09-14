import fs from 'node:fs';
import path from 'node:path';
import { createPool } from './db.ts';

export async function migrate(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const dir = path.join(import.meta.dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const result = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (result.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === import.meta.filename) {
  const { loadConfig } = await import('./config.ts');
  migrate(loadConfig().databaseUrl)
    .then(() => {
      console.log('migrations applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
