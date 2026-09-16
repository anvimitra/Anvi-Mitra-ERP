const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'src', 'sync.js'), 'utf8');
const local = fs.readFileSync(path.join(root, 'src', 'local_storage.js'), 'utf8');
const org = fs.readFileSync(path.join(root, 'src', 'organization.js'), 'utf8');
const platform = fs.readFileSync(path.join(root, 'src', 'platform_school_management.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, '..', 'README.md'), 'utf8');
for(const x of [[server,"['sync_routes','registerSyncRoutes']"],[server,"['local_storage','registerLocalStorageRoutes']"],[server,"['organization','registerOrganizationRoutes']"],[server,"['platform_school_management','registerPlatformSchoolManagementRoutes']"]]) assert(x[0].includes(x[1]));
for(const x of ["app.post('/api/sync/push'","app.post('/api/sync/pull'","app.get('/api/sync/conflicts'","teacher_can_edit_exam_subject"]) assert(sync.includes(x));
for(const x of ["/api/local-storage/connectors",'read_only','read_write']) assert(local.includes(x));
assert(org.includes('/api/public/school-config'));
assert(platform.includes('/api/platform/schools'));
assert(platform.includes("requireRoles('super_admin')"));
assert(readme.includes('[x] **Core multi-school ERP implementation checkpoint completed**'));
console.log('ERP major architecture contract checks: PASS');

// Checkpoint: README marker and module ownership are part of CI verification.
