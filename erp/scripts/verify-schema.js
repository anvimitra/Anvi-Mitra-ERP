const { Client } = require('pg');

const requiredTables = [
  'schools','school_settings','branches','users','students','teachers',
  'teacher_subjects','exams','exam_subjects','exam_marks','sync_devices',
  'sync_changes','sync_conflicts','local_storage_connectors','schema_migrations',
];
const requiredFunctions = ['teacher_can_edit_exam_subject'];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tableResult = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=$1',
      ['public'],
    );
    const tables = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = requiredTables.filter((name) => !tables.has(name));
    if (missingTables.length) throw new Error('Missing required tables: ' + missingTables.join(', '));

    const functionResult = await client.query(
      'SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname = ANY($2::text[])',
      ['public', requiredFunctions],
    );
    const functions = new Set(functionResult.rows.map((row) => row.name));
    const missingFunctions = requiredFunctions.filter((name) => !functions.has(name));
    if (missingFunctions.length) throw new Error('Missing required functions: ' + missingFunctions.join(', '));

    const migrations = await client.query('SELECT count(*)::int AS count FROM schema_migrations');
    if (migrations.rows[0].count < 1) throw new Error('Migration journal is empty');

    console.log(JSON.stringify({ ok:true, migrations:migrations.rows[0].count, tables:requiredTables.length, functions:requiredFunctions.length }));
  } finally {
    await client.end();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
