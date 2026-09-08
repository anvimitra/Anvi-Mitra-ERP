const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 43800);
const root = path.resolve(process.env.LOCAL_STORAGE_ROOT || './anvi-mitra-data');
const token = String(process.env.LOCAL_CONNECTOR_TOKEN || '').trim();
const erpApiUrl = String(process.env.ERP_API_URL || '').trim().replace(/\/$/, '');
const erpAccessToken = String(process.env.ERP_ACCESS_TOKEN || '').trim();
const syncDeviceKey = String(process.env.SYNC_DEVICE_KEY || '').trim();

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '10mb' }));

function auth(req, res, next) {
  if (!token) return res.status(503).json({ error: 'LOCAL_CONNECTOR_TOKEN is not configured' });
  if (req.get('x-local-connector-token') !== token) return res.status(401).json({ error: 'Invalid local connector token' });
  next();
}

function safePath(relativePath) {
  const value = String(relativePath || '').trim();
  if (!value || value.includes('\0')) throw Object.assign(new Error('relativePath is required'), { statusCode: 400 });
  const target = path.resolve(root, value);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error('Path is outside the configured storage root'), { statusCode: 403 });
  }
  return target;
}

async function ensureRoot() { await fs.mkdir(root, { recursive: true }); }

async function erpRequest(endpoint, method = 'GET', body) {
  if (!erpApiUrl || !erpAccessToken || !syncDeviceKey) {
    throw Object.assign(new Error('ERP_API_URL, ERP_ACCESS_TOKEN and SYNC_DEVICE_KEY are required for remote sync'), { statusCode: 503 });
  }
  const response = await fetch(`${erpApiUrl}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${erpAccessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `ERP request failed (${response.status})`), { statusCode: response.status });
  return data;
}

app.get('/health', async (_req, res) => {
  await ensureRoot();
  res.json({ ok: true, service: 'anvi-mitra-local-connector', root, readWrite: true, remoteSyncConfigured: Boolean(erpApiUrl && erpAccessToken && syncDeviceKey) });
});

app.get('/list', auth, async (req, res, next) => {
  try {
    const directory = safePath(req.query.path || '.');
    const entries = await fs.readdir(directory, { withFileTypes: true });
    res.json({ path: req.query.path || '.', entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) });
  } catch (e) { next(e); }
});

app.get('/read', auth, async (req, res, next) => {
  try {
    const target = safePath(req.query.path);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw Object.assign(new Error('Target is not a file'), { statusCode: 400 });
    if (stat.size > 10 * 1024 * 1024) throw Object.assign(new Error('File is larger than the 10 MB connector limit'), { statusCode: 413 });
    const content = await fs.readFile(target, 'utf8');
    res.json({ path: req.query.path, content, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  } catch (e) { next(e); }
});

app.post('/write', auth, async (req, res, next) => {
  try {
    const target = safePath(req.body?.path);
    const content = String(req.body?.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) throw Object.assign(new Error('Content is larger than the 10 MB connector limit'), { statusCode: 413 });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    const stat = await fs.stat(target);
    res.json({ ok: true, path: req.body.path, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  } catch (e) { next(e); }
});

// Registers this PC/device with the central ERP sync service.
app.post('/sync/register', auth, async (_req, res, next) => {
  try {
    const result = await erpRequest('/api/sync/device', 'POST', {
      deviceKey: syncDeviceKey,
      deviceName: process.env.LOCAL_CONNECTOR_NAME || 'School PC Local Connector',
      platform: process.platform
    });
    res.json(result);
  } catch (e) { next(e); }
});

// Push a prepared local outbox to the central ERP. The local connector never
// gets unrestricted database access; all remote writes go through ERP sync APIs.
app.post('/sync/push', auth, async (req, res, next) => {
  try {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (changes.length > 200) return res.status(400).json({ error: 'Maximum 200 changes per request' });
    const result = await erpRequest('/api/sync/push', 'POST', { deviceKey: syncDeviceKey, changes });
    res.json(result);
  } catch (e) { next(e); }
});

// Pull central changes so a local agent can materialize them into its ERP data folder.
app.get('/sync/pull', auth, async (req, res, next) => {
  try {
    const cursor = Math.max(0, Number(req.query.cursor || 0));
    const result = await erpRequest(`/api/sync/changes?deviceKey=${encodeURIComponent(syncDeviceKey)}&cursor=${Number.isFinite(cursor) ? cursor : 0}&limit=200`);
    res.json(result);
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = [400,401,403,404,413,429,503].includes(err?.statusCode) ? err.statusCode : 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Local connector error' });
});

ensureRoot().then(() => app.listen(port, '127.0.0.1', () => {
  console.log(`Anvi Mitra Local Connector listening on http://127.0.0.1:${port}`);
  console.log(`Storage root: ${root}`);
})).catch(err => { console.error(err); process.exit(1); });
