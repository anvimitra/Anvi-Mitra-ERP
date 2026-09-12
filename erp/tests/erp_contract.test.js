const fs = require('fs');
const path = require('path');
const assert = require('assert');

const sync = fs.readFileSync(path.join(__dirname, '..', 'src', 'sync.js'), 'utf8');
const organization = fs.readFileSync(path.join(__dirname, '..', 'src', 'organization.js'), 'utf8');

assert(sync.includes("app.post('/api/sync/device'"));
assert(sync.includes("app.post('/api/sync/push'"));
assert(sync.includes("app.post('/api/sync/pull'"));
assert(sync.includes("client_change_id"));
assert(sync.includes("sync_conflicts"));
assert(sync.includes("teacher_can_edit_exam_subject"));
assert(sync.includes("Teacher is not allowed to sync financial records"));
assert(sync.includes("Student is not enrolled in this class/session"));

assert(organization.includes("app.post('/api/platform/schools'"));
assert(organization.includes("app.patch('/api/platform/schools/:id'"));
assert(organization.includes("app.get('/api/platform/schools/:id'"));
assert(organization.includes("await hashPassword(adminPassword)"));
assert(organization.includes("mobile_app_configs"));
assert(organization.includes("school_settings"));
assert(organization.includes("branches"));

console.log('ERP sync/tenant security contract checks: PASS');
