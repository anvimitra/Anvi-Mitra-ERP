const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const { Pool } = require('pg');
const { app } = require('../src/server');
const { signAccessToken } = require('../src/security');

const databaseUrl = process.env.DATABASE_URL;

test('server uses transactional sync routes for offline admissions', { skip: !databaseUrl }, async (t) => {
  execFileSync(process.execPath, ['src/migrate.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe'
  });

  const pool = new Pool({ connectionString: databaseUrl });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let schoolId;

  t.after(async () => {
    server.close();
    if (schoolId) await pool.query('DELETE FROM schools WHERE id=$1', [schoolId]);
    await pool.end();
  });

  const school = await pool.query(
    `INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id`,
    [`Server Sync Route Test ${suffix}`, `SRV-${suffix}`]
  );
  schoolId = school.rows[0].id;
  const session = await pool.query(
    `INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,$2,'2026-04-01','2027-03-31',true) RETURNING id`,
    [schoolId, `Server Sync Session ${suffix}`]
  );
  const user = await pool.query(
    `INSERT INTO users(school_id,email,password_hash,role,status) VALUES($1,$2,'not-used','admin','active') RETURNING id`,
    [schoolId, `server-sync-${suffix}@example.test`]
  );
  const token = signAccessToken({ sub: user.rows[0].id, schoolId, branchId: null, role: 'admin' });
  const deviceKey = `server-sync-${suffix}`;

  async function request(path, method, body) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  let result = await request('/api/sync/device', 'POST', { deviceKey, deviceName: 'CI', platform: 'web' });
  assert.equal(result.status, 200);

  const applicationNo = `SRV-APP-${suffix}`;
  result = await request('/api/sync/push', 'POST', {
    deviceKey,
    changes: [{
      clientId: `server-admission-${suffix}`,
      entityType: 'admission',
      operation: 'create',
      baseCursor: 0,
      payload: { applicationNo, sessionId: session.rows[0].id, studentName: 'Server Routed Student' }
    }]
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.accepted.length, 1);

  const saved = await pool.query(
    `SELECT application_no,student_name,status FROM admission_applications WHERE school_id=$1 AND application_no=$2`,
    [schoolId, applicationNo]
  );
  assert.deepEqual(saved.rows, [{ application_no: applicationNo, student_name: 'Server Routed Student', status: 'draft' }]);
});
