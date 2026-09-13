const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'src', 'sync.js'), 'utf8');
const local = fs.readFileSync(path.join(root, 'src', 'local_storage.js'), 'utf8');
const org = fs.readFileSync(path.join(root, 'src', 'organization.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, '..', 'README.md'), 'utf8');

assert(server.includes("['sync_routes','registerSyncRoutes']"));
assert(server.includes("['local_storage','registerLocalStorageRoutes']"));
assert(server.includes("['organization','registerOrganizationRoutes']"));
assert(sync.includes("app.post('/api/sync/push'"));
assert(sync.includes("app.post('/api/sync/pull'"));
assert(sync.includes("app.get('/api/sync/conflicts'"));
assert(sync.includes("teacher_can_edit_exam_subject"));
assert(local.includes("/api/local-storage/connectors"));
assert(local.includes("read_only"));
assert(local.includes("read_write"));
assert(org.includes("/api/platform/schools"));
assert(org.includes("requireRoles(...platformRoles)"));
assert(readme.includes('[x] Major architecture implementation checkpoint'));
console.log('ERP major architecture contract checks: PASS');
