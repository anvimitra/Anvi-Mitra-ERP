const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const SQL_DIR = path.resolve(__dirname, '../sql');

function migrationFiles() {
  return fs.readdirSync(SQL_DIR)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['anvi-mitra-erp-migrations']);
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );

    for (const filename of migrationFiles()) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename=$1',
        [filename],
      );
      if (rows.length) {
        console.log('skip', filename);
        continue;
      }

      const sql = fs.readFileSync(path.join(SQL_DIR, filename), 'utf8').trim();
      if (!sql) continue;

      console.log('apply', filename);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(filename) VALUES($1)',
          [filename],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error('Migration failed: ' + filename + ': ' + error.message);
      }
    }

    console.log('Migration complete: ' + migrationFiles().length + ' migration file(s) checked.');
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['anvi-mitra-erp-migrations']).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
