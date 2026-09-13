const fs = require('fs');
const path = require('path');
const assert = require('assert');

const client = fs.readFileSync(path.join(__dirname, '..', 'web', 'offline-sync.js'), 'utf8');
assert(client.includes("indexedDB.open('anvi-mitra-erp-offline'"));
assert(client.includes("createObjectStore(STORE"));
assert(client.includes("function enqueue"));
assert(client.includes("baseCursor"));
assert(client.includes("'/api/sync/push'"));
assert(client.includes("global.addEventListener('online'"));
assert(client.includes("navigator.onLine"));
assert(client.includes("conflicts"));
console.log('ERP web offline cache/outbox contract checks: PASS');
