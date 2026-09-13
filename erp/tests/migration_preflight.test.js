const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const sqlDir = path.join(root, 'sql');
const files = fs.readdirSync(sqlDir).filter(f => /^\\d+.*\\.sql$/i.test(f)).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
assert(files.length > 0, 'No SQL migrations found');

const numbers = files.map(f => Number((f.match(/^\\d+/)||['0'])[0]));
assert(new Set(numbers).size === numbers.length, 'Duplicate migration number detected');
for (const file of files) {
  const sql = fs.readFileSync(path.join(sqlDir,file),'utf8').trim();
  assert(sql.length > 0, 'Empty migration: '+file);
  assert(!/\\bDROP\\s+(DATABASE|SCHEMA)\\b/i.test(sql), 'Destructive migration guard: '+file);
}

const server = fs.readFileSync(path.join(root,'src','server.js'),'utf8');
assert(server.includes("registerOptional('organization'"));
assert(server.includes("registerOptional('sync_routes'"));
assert(server.includes("registerOptional('local_storage'"));

console.log('ERP migration/preflight contract checks: PASS');
