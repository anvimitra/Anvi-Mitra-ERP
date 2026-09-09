const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const { signAccessToken } = require('../src/security');
const { registerSyncRoutes } = require('../src/sync');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-anvi-mitra-erp-secret-1234567890';
const databaseUrl = process.env.DATABASE_URL;

test('postgres sync detects a stale offline change as a conflict', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = express();
  app.use(express.json());
  registerSyncRoutes(app, pool);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let schoolId;
  let sessionId;
  let userId;
  const entityId = crypto.randomUUID();

  const request = (method, path, token, body) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(server, {
      method,
      path,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

  try {
    const school = await pool.query(`INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id`, [`Conflict Test School ${suffix}`, `CON-${suffix}`]);
    schoolId = school.rows[0].id;
    const session = await pool.query(`INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,$2,'2026-04-01','2027-03-31',true) RETURNING id`, [schoolId, `Conflict Session ${suffix}`]);
    sessionId = session.rows[0].id;
    const user = await pool.query(`INSERT INTO users(school_id,email,password_hash,role,status) VALUES($1,$2,'not-used','admin','active') RETURNING id`, [schoolId, `conflict-${suffix}@example.test`]);
    userId = user.rows[0].id;
    const token = signAccessToken({ sub: userId, schoolId, branchId: null, role: 'admin' });
    const deviceKey = `conflict-device-${suffix}`;

    let r = await request('POST', '/api/sync/device', token, { deviceKey, deviceName: 'conflict-test', platform: 'test' });
    assert.equal(r.status, 200);

    r = await request('POST', '/api/sync/push', token, {
      deviceKey,
      changes: [{
        clientId: `first-${suffix}`,
        entityType: 'admission',
        operation: 'create',
        payload: { id: entityId, applicationNo: `CON-APP-${suffix}`, sessionId, studentName: 'Conflict Student v1' },
        baseCursor: 0
      }]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted.length, 1);
    const baseCursor = Number(r.body.accepted[0].cursor);

    await pool.query(
      `INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
       VALUES($1,'admission',$2,'update',$3::jsonb,$4)`,
      [schoolId, entityId, JSON.stringify({ id: entityId, applicationNo: `CON-APP-${suffix}`, studentName: 'Server Version' }), userId]
    );

    r = await request('POST', '/api/sync/push', token, {
      deviceKey,
      changes: [{
        clientId: `stale-${suffix}`,
        entityType: 'admission',
        operation: 'update',
        entityId,
        payload: { id: entityId, applicationNo: `CON-APP-${suffix}`, sessionId, studentName: 'Offline Stale Version' },
        baseCursor
      }]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted.length, 0);
    assert.equal(r.body.conflicts.length, 1);
    assert.equal(r.body.conflicts[0].clientId, `stale-${suffix}`);
    assert.ok(r.body.conflicts[0].conflictId);

    const saved = await pool.query(
      `SELECT resolution,local_payload->>'studentName' AS local_name,server_payload->>'studentName' AS server_name
       FROM sync_conflicts WHERE id=$1`,
      [r.body.conflicts[0].conflictId]
    );
    assert.deepEqual(saved.rows, [{ resolution: 'pending', local_name: 'Offline Stale Version', server_name: 'Server Version' }]);
  } finally {
    if (schoolId) await pool.query('DELETE FROM schools WHERE id=$1', [schoolId]);
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
