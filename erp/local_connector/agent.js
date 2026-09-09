const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_BASE_URL = String(process.env.ERP_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.ERP_ACCESS_TOKEN || '';
const DEVICE_KEY = process.env.ERP_DEVICE_KEY || `pc-${crypto.randomUUID()}`;
const CONNECTOR_ID = process.env.ERP_CONNECTOR_ID || '';
const LOCAL_ROOT = path.resolve(process.env.LOCAL_STORAGE_PATH || './anvi-mitra-data');
const POLL_MS = Math.max(5000, Number(process.env.SYNC_INTERVAL_MS || 15000));

if (!API_BASE_URL || !TOKEN) {
  console.error('ERP_API_URL and ERP_ACCESS_TOKEN are required.');
  process.exit(1);
}

const headers = () => ({ Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' });
async function api(route, options = {}) {
  const response = await fetch(`${API_BASE_URL}${route}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `ERP request failed: ${response.status}`);
  return data;
}

function ensureFolders() {
  for (const name of ['sync', 'outbox']) fs.mkdirSync(path.join(LOCAL_ROOT, name), { recursive: true });
}
function cursorFile() { return path.join(LOCAL_ROOT, 'sync', 'cursor.json'); }
function readCursor() {
  try { return Number(JSON.parse(fs.readFileSync(cursorFile(), 'utf8')).cursor || 0); } catch (_) { return 0; }
}
function writeCursor(cursor) { fs.writeFileSync(cursorFile(), JSON.stringify({ cursor, updatedAt: new Date().toISOString() }, null, 2)); }
function safeName(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120); }

async function registerDevice() {
  return api('/api/sync/device', { method: 'POST', body: JSON.stringify({ deviceKey: DEVICE_KEY, deviceName: `ERP Local Connector ${process.platform}`, platform: 'desktop' }) });
}
async function heartbeat() {
  if (!CONNECTOR_ID) return;
  await api(`/api/local-storage/connectors/${encodeURIComponent(CONNECTOR_ID)}/heartbeat`, { method: 'POST', body: JSON.stringify({ lastError: null }) });
}
async function pullChanges() {
  const cursor = readCursor();
  const data = await api(`/api/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=250&deviceKey=${encodeURIComponent(DEVICE_KEY)}`);
  for (const change of data.changes || []) {
    const name = `${String(change.cursor).padStart(12, '0')}_${safeName(change.entity_type)}_${safeName(change.entity_id || 'none')}.json`;
    fs.writeFileSync(path.join(LOCAL_ROOT, 'sync', name), JSON.stringify(change, null, 2));
  }
  if ((data.changes || []).length) writeCursor(data.cursor);
  return data.changes?.length || 0;
}
async function pushOutbox() {
  const dir = path.join(LOCAL_ROOT, 'outbox');
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.json')).slice(0, 50);
  if (!files.length) return 0;
  const entries = [];
  for (const file of files) {
    try {
      const item = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      entries.push({ file, item });
    } catch (error) {
      fs.writeFileSync(path.join(dir, `${file}.error.txt`), String(error.stack || error));
    }
  }
  const changes = entries.map(({ file, item }) => ({ clientId: item.clientId || file, entityType: item.entityType, entityId: item.entityId || null, operation: item.operation || 'update', baseCursor: Number(item.baseCursor || readCursor()), payload: item.payload || {} }));
  if (!changes.length) return 0;
  const result = await api('/api/sync/push', { method: 'POST', body: JSON.stringify({ deviceKey: DEVICE_KEY, changes }) });
  const accepted = new Set((result.accepted || []).map(item => item.clientId));
  for (const { file, item } of entries) {
    const clientId = item.clientId || file;
    if (accepted.has(clientId)) fs.rmSync(path.join(dir, file));
  }
  return accepted.size;
}

async function tick() {
  try {
    ensureFolders();
    await registerDevice();
    const pushed = await pushOutbox();
    const pulled = await pullChanges();
    await heartbeat();
    console.log(`[${new Date().toISOString()}] sync ok: uploaded=${pushed} downloaded=${pulled}`);
  } catch (error) {
    ensureFolders();
    if (CONNECTOR_ID) {
      try { await api(`/api/local-storage/connectors/${encodeURIComponent(CONNECTOR_ID)}/heartbeat`, { method: 'POST', body: JSON.stringify({ lastError: String(error.message || error) }) }); } catch (_) {}
    }
    console.error(`[${new Date().toISOString()}] sync failed:`, error.message || error);
  }
}

tick();
setInterval(tick, POLL_MS);
