const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { Pool } = require('pg');
const { signAccessToken } = require('../src/security');
const { registerSyncRoutes } = require('../src/sync');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-anvi-mitra-erp-secret-1234567890';

const databaseUrl = process.env.DATABASE_URL;

test('postgres sync replays an offline admission and exposes it through the change cursor', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = express();
  app.use(express.json());
  registerSyncRoutes(app, pool);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let schoolId;
  let sessionId;
  let userId;
  try {
    const school = await pool.query(`INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id`, [`Sync Test School ${suffix}`, `SYNC-${suffix}`]);
    schoolId = school.rows[0].id;
    const session = await pool.query(`INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,$2,'2026-04-01','2027-03-31',true) RETURNING id`, [schoolId, `Sync Session ${suffix}`]);
    sessionId = session.rows[0].id;
    const user = await pool.query(`INSERT INTO users(school_id,email,password_hash,role,status) VALUES($1,$2,'not-used','admin','active') RETURNING id`, [schoolId, `sync-${suffix}@example.test`]);
    userId = user.rows[0].id;
    const token = signAccessToken({ sub: userId, schoolId, branchId: null, role: 'admin' });

    const request = (method, path, body) => new Promise((resolve, reject) => {
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

    let r = await request('POST', '/api/sync/device', { deviceKey: `device-${suffix}`, deviceName: 'postgres-test', platform: 'test' });
    assert.equal(r.status, 200);

    r = await request('POST', '/api/sync/push', {
      deviceKey: `device-${suffix}`,
      changes: [{
        clientId: `admission-${suffix}`,
        entityType: 'admission',
        operation: 'create',
        payload: {
          applicationNo: `APP-${suffix}`,
          sessionId,
          studentName: 'Offline Sync Test Student',
          gender: 'unspecified',
          notes: 'created while offline'
        },
        baseCursor: 0
      }]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted.length, 1);
    assert.equal(r.body.conflicts.length, 0);

    const saved = await pool.query(`SELECT application_no,student_name,status FROM admission_applications WHERE school_id=$1 AND application_no=$2`, [schoolId, `APP-${suffix}`]);
    assert.deepEqual(saved.rows, [{ application_no: `APP-${suffix}`, student_name: 'Offline Sync Test Student', status: 'draft' }]);

    r = await request('GET', '/api/sync/changes?deviceKey=' + encodeURIComponent(`device-${suffix}`) + '&cursor=0&limit=50');
    assert.equal(r.status, 200);
    assert.ok(r.body.changes.length >= 1);
    assert.ok(Number(r.body.cursor) >= 1);
  } finally {
    if (schoolId) await pool.query('DELETE FROM schools WHERE id=$1', [schoolId]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
