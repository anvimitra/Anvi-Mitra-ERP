const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { signAccessToken } = require('../src/security');
const { registerSyncRoutes } = require('../src/sync');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-anvi-mitra-erp-secret-1234567890';

function createFakePool() {
  const state = {
    devices: new Map(),
    changes: [],
    conflicts: [],
    nextDevice: 1,
    nextCursor: 1,
  };
  return {
    state,
    async query(sql, params = []) {
      if (sql.includes('INSERT INTO sync_devices')) {
        const key = params[1];
        let device = state.devices.get(key);
        if (!device) {
          device = { id: `device-${state.nextDevice++}`, school_id: params[0], device_key: key, device_name: params[2], platform: params[3], last_cursor: 0, status: 'active' };
          state.devices.set(key, device);
        } else {
          device.device_name = params[2]; device.platform = params[3]; device.status = 'active';
        }
        return { rows: [device], rowCount: 1 };
      }
      if (sql.includes('SELECT id,status,last_cursor FROM sync_devices')) {
        const d = state.devices.get(params[1]);
        return { rows: d ? [d] : [], rowCount: d ? 1 : 0 };
      }
      if (sql.includes('SELECT COUNT(*)::int AS total')) {
        const devices = [...state.devices.values()];
        return { rows: [{ total: devices.length, active: devices.filter(d => d.status === 'active').length, last_seen_at: null }], rowCount: 1 };
      }
      if (sql.includes('SELECT COUNT(*)::int AS count FROM sync_changes')) return { rows: [{ count: state.changes.length }], rowCount: 1 };
      if (sql.includes("SELECT COUNT(*)::int AS count FROM sync_conflicts")) return { rows: [{ count: state.conflicts.length }], rowCount: 1 };
      if (sql.includes('SELECT MAX(changed_at) AS changed_at')) {
        const last = state.changes[state.changes.length - 1];
        return { rows: [{ changed_at: last?.changed_at || null, cursor: last?.cursor || null }], rowCount: 1 };
      }
      if (sql.includes('SELECT cursor,entity_type,entity_id,operation,payload')) {
        const cursor = Number(params[1] || 0);
        const rows = state.changes.filter(c => c.cursor > cursor).slice(0, Number(params[2] || 200));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('UPDATE sync_devices SET last_cursor')) return { rows: [], rowCount: 1 };
      if (sql.includes('SELECT cursor,payload FROM sync_changes')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO sync_conflicts')) {
        const id = `conflict-${state.conflicts.length + 1}`;
        state.conflicts.push({ id });
        return { rows: [{ id }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in fake pool: ${sql.slice(0, 120)}`);
    },
    async connect() {
      const pool = this;
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
          return pool.query(sql, params);
        },
        release() {},
      };
    },
  };
}

function request(server, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(server, { method, path, headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('sync HTTP flow registers device, reports status and pulls changes', async () => {
  const pool = createFakePool();
  const app = express();
  app.use(express.json());
  registerSyncRoutes(app, pool);
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const token = signAccessToken({ sub: 'user-1', schoolId: 'school-1', branchId: null, role: 'admin' });
    let r = await request(server, 'POST', '/api/sync/device', token, { deviceKey: 'device-1', deviceName: 'test', platform: 'android' });
    assert.equal(r.status, 200);
    assert.equal(r.body.device.status, 'active');

    r = await request(server, 'GET', '/api/sync/status', token);
    assert.equal(r.status, 200);
    assert.equal(r.body.deviceCount.active, 1);
    assert.equal(r.body.onlineSourceOfTruth, 'postgresql');

    r = await request(server, 'GET', '/api/sync/changes?deviceKey=device-1&cursor=0&limit=20', token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.changes, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('sync endpoints reject missing authentication', async () => {
  const pool = createFakePool();
  const app = express();
  app.use(express.json());
  registerSyncRoutes(app, pool);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  try {
    const result = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}/api/sync/status`, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.equal(result, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
