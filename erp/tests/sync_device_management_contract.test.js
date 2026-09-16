const fs = require('fs');
const path = require('path');
const assert = require('assert');

const sync = fs.readFileSync(path.join(__dirname, '..', 'src', 'sync.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'web', 'sync-admin.html'), 'utf8');

for (const route of [
  "app.get('/api/sync/devices'",
  "app.patch('/api/sync/devices/:id'",
  "app.post('/api/sync/devices/:id/reset-cursor'",
]) assert(sync.includes(route), 'Missing sync device management route: ' + route);

for (const token of [
  "requireRoles('super_admin','principal','admin')",
  "status must be active or revoked",
  "last_cursor=0",
  'deviceKey',
  'lastCursor',
]) assert(sync.includes(token), 'Missing device management contract token: ' + token);

for (const token of ['Sync Devices', 'Revoke', 'Activate', 'Reset Cursor']) {
  assert(ui.includes(token), 'Missing sync-admin UI control: ' + token);
}

console.log('ERP sync device management contract checks: PASS');
