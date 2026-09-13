const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/super-admin/schools.html'), 'utf8');
const organization = fs.readFileSync(path.join(root, 'src/organization.js'), 'utf8');

for (const marker of [
  '/api/platform/schools',
  '/api/platform/schools/',
  'Create School + Admin',
  'adminEmail',
  'adminPassword',
  'appSlug',
  'logoUrl',
  'primaryColor',
  'mainBranchName',
  'mainBranchCode',
]) assert(html.includes(marker), 'School management UI missing: ' + marker);

for (const marker of [
  "app.get('/api/platform/schools'",
  "app.get('/api/platform/schools/:id'",
  "app.patch('/api/platform/schools/:id'",
  "app.post('/api/platform/schools'",
  "adminEmail",
  "adminPassword",
  "hashPassword",
]) assert(organization.includes(marker), 'School provisioning API missing: ' + marker);

assert(html.includes('/api/platform/schools/'), 'School detail route is not wired');
assert(html.includes('navigator.onLine'), 'UI does not expose online/offline state');

console.log('school_management_ui_contract: ok');
