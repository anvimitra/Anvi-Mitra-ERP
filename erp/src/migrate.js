require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(150) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const dir = path.join(__dirname, '..', 'sql');
    const files = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1 LIMIT 1', [version]);
      if (exists.rowCount) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
        await pool.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }
  } finally { await pool.end(); }
}
main().catch(err => { console.error(err); process.exit(1); });
