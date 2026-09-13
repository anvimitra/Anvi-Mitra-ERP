const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'sql/037_school_provisioning_sync_journal.sql'), 'utf8');
const organization = fs.readFileSync(path.join(root, 'src/organization.js'), 'utf8');

for (const marker of [
  'journal_school_provisioning',
  'schools_sync_journal_trigger',
  "'school'",
  'sync_changes',
]) assert(migration.includes(marker), 'School provisioning sync migration missing: ' + marker);

for (const marker of [
  "app.post('/api/platform/schools'",
  "INSERT INTO schools",
  "INSERT INTO branches",
  "INSERT INTO school_settings",
  "INSERT INTO mobile_app_configs",
  "INSERT INTO users",
]) assert(organization.includes(marker), 'School provisioning flow missing: ' + marker);

console.log('school_provisioning_sync_contract: ok');
