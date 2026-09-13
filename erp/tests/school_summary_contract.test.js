const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'src/school_summary.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

assert(api.includes('/api/platform/schools/:id/summary'), 'School summary route missing');
assert(api.includes("requireRoles('super_admin')"), 'School summary must be Super Admin only');
for (const marker of ['users','teachers','students','branches','activeEnrollments']) {
  assert(api.includes(marker), 'School summary count missing: ' + marker);
}
assert(server.includes("['school_summary','registerSchoolSummaryRoutes']"), 'School summary module not registered');

console.log('school_summary_contract: ok');
