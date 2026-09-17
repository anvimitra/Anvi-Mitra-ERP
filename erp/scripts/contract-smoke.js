const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const web = path.join(root, 'web');
const sql = path.join(root, 'sql');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredModules = [
  'auth.js', 'organization.js', 'staff.js', 'student_enrollment.js',
  'teacher_assignments.js', 'teacher_permissions.js', 'exam_marks.js',
  'sync.js', 'local_storage.js'
];
for (const file of requiredModules) {
  const full = path.join(src, file);
  assert(fs.existsSync(full), 'Missing server module: ' + file);
  assert(fs.statSync(full).size > 0, 'Empty server module: ' + file);
}

const requiredPages = [
  'super-admin/schools.html', 'school-onboarding.html', 'staff-management.html',
  'student-enrollment.html', 'teacher-assignments.html', 'teacher-permissions.html',
  'sync-admin.html', 'sync-storage.html', 'local-storage.html'
];
for (const file of requiredPages) {
  const full = path.join(web, file);
  assert(fs.existsSync(full), 'Missing web page: ' + file);
  assert(fs.statSync(full).size > 0, 'Empty web page: ' + file);
}

const migrationNames = fs.readdirSync(sql).filter(f => /^\d+.*\.sql$/i.test(f)).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
assert(migrationNames.length >= 5, 'Expected ERP extension migrations');
assert(migrationNames.includes('032_offline_sync_access_control.sql'), 'Offline access-control migration missing');
assert(migrationNames.includes('101_sync_teacher_marks_guard.sql'), 'Teacher marks sync guard missing');
assert(migrationNames.includes('036_sync_idempotency.sql'), 'Sync idempotency migration missing');

const server = fs.readFileSync(path.join(src, 'server.js'), 'utf8');
for (const moduleName of ['organization', 'student_enrollment', 'teacher_assignments', 'teacher_permissions', 'exam_marks', 'sync_routes', 'local_storage']) {
  assert(server.includes("['" + moduleName + "'"), 'Server does not register module: ' + moduleName);
}

const organization = fs.readFileSync(path.join(src, 'organization.js'), 'utf8');
assert(organization.includes('/api/platform/schools'), 'School provisioning route missing');
assert(organization.includes('school_settings'), 'School settings provisioning missing');
assert(organization.includes('mobile_app_configs'), 'Mobile app provisioning missing');

const marks = fs.readFileSync(path.join(src, 'exam_marks.js'), 'utf8');
assert(marks.includes('teacher_can_edit_exam_subject'), 'Teacher marks authorization missing');
assert(marks.includes('validateStudent'), 'Student enrollment validation missing');
assert(marks.includes('maxMarks'), 'Maximum-mark validation missing');

const sync = fs.readFileSync(path.join(src, 'sync.js'), 'utf8');
assert(sync.includes('/api/sync/push') && sync.includes('/api/sync/pull'), 'Sync push/pull routes missing');
assert(sync.includes('clientChangeId'), 'Sync idempotency contract missing');
assert(sync.includes('sync_conflicts'), 'Sync conflict handling missing');

console.log('ERP contract smoke test: PASS');
console.log('Modules:', requiredModules.length, '| Pages:', requiredPages.length, '| ERP extension migrations:', migrationNames.length);
