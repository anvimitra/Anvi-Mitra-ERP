const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.env.LOCAL_STORAGE_ROOT || './anvi-mitra-data');
const api = String(process.env.ERP_API_URL || '').trim().replace(/\/$/, '');
const token = String(process.env.ERP_ACCESS_TOKEN || '').trim();
const deviceKey = String(process.env.SYNC_DEVICE_KEY || '').trim();
const intervalMs = Math.max(5000, Number(process.env.SYNC_INTERVAL_MS || 15000));
const stateFile = path.join(root, '.sync-agent.json');
const dataRoot = path.join(root, 'data');

if (!api || !token || !deviceKey) {
  console.error('ERP_API_URL, ERP_ACCESS_TOKEN and SYNC_DEVICE_KEY are required.');
  process.exit(1);
}

const state = { cursor: 0, files: {}, deleted: {} };
let writing = false;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeSegment(value) { return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }
function fileFor(type, id) { return path.join(dataRoot, safeSegment(type), `${safeSegment(id)}.json`); }

async function loadState() {
  try { Object.assign(state, JSON.parse(await fs.readFile(stateFile, 'utf8'))); } catch (_) {}
  state.cursor = Number(state.cursor) || 0;
  state.files ||= {};
  state.deleted ||= {};
}
async function saveState() {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8');
}
async function request(endpoint, method = 'GET', body) {
  const response = await fetch(`${api}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `ERP request failed (${response.status})`);
  return data;
}
async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}
async function pull() {
  const result = await request(`/api/sync/changes?deviceKey=${encodeURIComponent(deviceKey)}&cursor=${state.cursor}&limit=200`);
  for (const change of result.changes || []) {
    const type = change.entity_type || change.entityType;
    const id = change.entity_id || change.entityId;
    if (!type || !id) continue;
    const target = fileFor(type, id);
    if (change.operation === 'delete') {
      await fs.rm(target, { force: true });
      delete state.files[target];
      state.deleted[target] = true;
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const content = JSON.stringify(change.payload || {}, null, 2) + '\n';
      await fs.writeFile(target, content, 'utf8');
      state.files[target] = hash(content);
      delete state.deleted[target];
    }
    state.cursor = Math.max(state.cursor, Number(change.cursor) || state.cursor);
  }
}
async function pushLocalChanges() {
  if (writing) return;
  const changes = [];
  const files = await walk(dataRoot);
  const current = new Set(files);
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const digest = hash(content);
    if (state.files[file] === digest) continue;
    const relative = path.relative(dataRoot, file).split(path.sep);
    if (relative.length !== 2 || !relative[1].endsWith('.json')) continue;
    const entityType = relative[0];
    const entityId = relative[1].slice(0, -5);
    let payload;
    try { payload = JSON.parse(content); } catch (_) { continue; }
    changes.push({ clientId: `pc-${Date.now()}-${hash(file).slice(0, 12)}`, entityType, entityId, operation: 'update', payload, baseCursor: state.cursor });
    if (changes.length >= 200) break;
  }
  for (const file of Object.keys(state.files)) {
    if (!current.has(file) && !state.deleted[file]) {
      const relative = path.relative(dataRoot, file).split(path.sep);
      if (relative.length === 2 && relative[1].endsWith('.json')) {
        changes.push({ clientId: `pc-delete-${Date.now()}-${hash(file).slice(0, 12)}`, entityType: relative[0], entityId: relative[1].slice(0, -5), operation: 'delete', payload: {}, baseCursor: state.cursor });
      }
      if (changes.length >= 200) break;
    }
  }
  if (!changes.length) return;
  const result = await request('/api/sync/push', 'POST', { deviceKey, changes });
  const accepted = new Set((result.accepted || []).map(x => x.clientId));
  for (const item of changes) {
    if (accepted.has(item.clientId)) {
      const file = fileFor(item.entityType, item.entityId);
      state.files[file] = item.operation === 'delete' ? undefined : hash(JSON.stringify(item.payload, null, 2) + '\n');
      if (item.operation === 'delete') state.deleted[file] = true;
      else delete state.deleted[file];
    }
  }
}
async function cycle() {
  try {
    writing = true;
    await pull();
    await saveState();
    writing = false;
    await pushLocalChanges();
    await saveState();
    console.log(`[sync] cursor=${state.cursor}`);
  } catch (error) {
    writing = false;
    console.error(`[sync] ${error.message}`);
  }
}
(async () => {
  await fs.mkdir(dataRoot, { recursive: true });
  await loadState();
  await cycle();
  setInterval(cycle, intervalMs);
})();
