const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const { Pool } = require('pg');
const { app } = require('../src/server');
const { hashPassword, signAccessToken } = require('../src/security');

const databaseUrl = process.env.DATABASE_URL;

test('offline sync + teacher permission integration', { skip: !databaseUrl }, async (t) => {
  execFileSync(process.execPath, ['src/migrate.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe'
  });

  const pool = new Pool({ connectionString: databaseUrl });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const ids = {};

  t.after(async () => {
    server.close();
    await pool.query('DELETE FROM schools WHERE code=$1', ['TEST-OFFLINE']);
    await pool.end();
  });

  const passwordHash = await hashPassword('TestPass123!');
  const school = await pool.query(
    `INSERT INTO schools(name,code,display_name,status) VALUES($1,$2,$3,'active') RETURNING id`,
    ['Offline Sync Test School', 'TEST-OFFLINE', 'Offline Sync Test School']
  );
  ids.schoolId = school.rows[0].id;
  const schoolId = ids.schoolId;

  const branch = await pool.query(
    `INSERT INTO branches(school_id,name,code,status) VALUES($1,'Main','MAIN','active') RETURNING id`,
    [schoolId]
  );
  ids.branchId = branch.rows[0].id;

  await pool.query(`INSERT INTO school_settings(school_id) VALUES($1) ON CONFLICT(school_id) DO NOTHING`, [schoolId]);
  const session = await pool.query(
    `INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,'2026-27','2026-04-01','2027-03-31',true) RETURNING id`,
    [schoolId]
  );
  ids.sessionId = session.rows[0].id;
  const klass = await pool.query(`INSERT INTO classes(school_id,name) VALUES($1,'Class 5') RETURNING id`, [schoolId]);
  ids.classId = klass.rows[0].id;
  const section = await pool.query(`INSERT INTO sections(school_id,class_id,name) VALUES($1,$2,'A') RETURNING id`, [schoolId, ids.classId]);
  ids.sectionId = section.rows[0].id;
  const subject = await pool.query(`INSERT INTO subjects(school_id,name,code) VALUES($1,'Mathematics','MATH') RETURNING id`, [schoolId]);
  ids.subjectId = subject.rows[0].id;

  const teacherUser = await pool.query(
    `INSERT INTO users(school_id,email,password_hash,role,status,branch_id) VALUES($1,'teacher-ok@test.local',$2,'teacher','active',$3) RETURNING id`,
    [schoolId, passwordHash, ids.branchId]
  );
  ids.teacherUserId = teacherUser.rows[0].id;
  await pool.query(
    `INSERT INTO teachers(school_id,user_id,employee_code,full_name,status) VALUES($1,$2,'T001','Allowed Teacher','active')`,
    [schoolId, ids.teacherUserId]
  );

  const otherUser = await pool.query(
    `INSERT INTO users(school_id,email,password_hash,role,status,branch_id) VALUES($1,'teacher-no@test.local',$2,'teacher','active',$3) RETURNING id`,
    [schoolId, passwordHash, ids.branchId]
  );
  ids.otherTeacherUserId = otherUser.rows[0].id;
  await pool.query(
    `INSERT INTO teachers(school_id,user_id,employee_code,full_name,status) VALUES($1,$2,'T002','Blocked Teacher','active')`,
    [schoolId, ids.otherTeacherUserId]
  );

  const examType = await pool.query(
    `INSERT INTO exam_types(school_id,code,name,category,max_marks,pass_marks) VALUES($1,'FA1','FA1','formative',100,33) RETURNING id`,
    [schoolId]
  );
  const exam = await pool.query(
    `INSERT INTO exams(school_id,session_id,exam_type_id,name,status,branch_id) VALUES($1,$2,$3,'FA1 2026','open',$4) RETURNING id`,
    [schoolId, ids.sessionId, examType.rows[0].id, ids.branchId]
  );
  ids.examId = exam.rows[0].id;
  await pool.query(
    `INSERT INTO exam_subjects(school_id,exam_id,subject_id,class_id,max_marks,pass_marks,branch_id) VALUES($1,$2,$3,$4,100,33,$5) RETURNING id`,
    [schoolId, ids.examId, ids.subjectId, ids.classId, ids.branchId]
  );
  const student = await pool.query(
    `INSERT INTO students(school_id,admission_no,full_name,status) VALUES($1,'TST-001','Test Student','active') RETURNING id`,
    [schoolId]
  );
  ids.studentId = student.rows[0].id;
  await pool.query(
    `INSERT INTO enrollments(school_id,student_id,session_id,class_id,section_id,roll_no,status,branch_id) VALUES($1,$2,$3,$4,$5,'1','active',$6)`,
    [schoolId, ids.studentId, ids.sessionId, ids.classId, ids.sectionId, ids.branchId]
  );
  await pool.query(
    `INSERT INTO teacher_class_subject_permissions(school_id,teacher_user_id,class_id,section_id,subject_id,session_id,branch_id,can_view,can_edit_marks) VALUES($1,$2,$3,$4,$5,$6,$7,true,true)`,
    [schoolId, ids.teacherUserId, ids.classId, ids.sectionId, ids.subjectId, ids.sessionId, ids.branchId]
  );

  const allowedToken = signAccessToken({ sub: ids.teacherUserId, schoolId, branchId: ids.branchId, role: 'teacher' });
  const blockedToken = signAccessToken({ sub: ids.otherTeacherUserId, schoolId, branchId: ids.branchId, role: 'teacher' });

  async function request(path, token, options = {}) {
    const response = await fetch(baseUrl + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  const device = await request('/api/sync/device', allowedToken, {
    method: 'POST',
    body: JSON.stringify({ deviceKey: 'integration-device', deviceName: 'CI', platform: 'web' })
  });
  assert.equal(device.status, 200);

  const firstPush = await request('/api/sync/push', allowedToken, {
    method: 'POST',
    body: JSON.stringify({ deviceKey: 'integration-device', changes: [{ clientId: 'change-1', entityType: 'demo', entityId: ids.studentId, operation: 'update', baseCursor: 0, payload: { value: 1 } }] })
  });
  assert.equal(firstPush.status, 200);
  assert.equal(firstPush.body.accepted.length, 1);

  const retryPush = await request('/api/sync/push', allowedToken, {
    method: 'POST',
    body: JSON.stringify({ deviceKey: 'integration-device', changes: [{ clientId: 'change-1', entityType: 'demo', entityId: ids.studentId, operation: 'update', baseCursor: 0, payload: { value: 1 } }] })
  });
  assert.equal(retryPush.status, 200);
  assert.equal(retryPush.body.accepted[0].duplicate, true);

  const conflictPush = await request('/api/sync/push', allowedToken, {
    method: 'POST',
    body: JSON.stringify({ deviceKey: 'integration-device', changes: [{ clientId: 'change-2', entityType: 'demo', entityId: ids.studentId, operation: 'update', baseCursor: 0, payload: { value: 2 } }] })
  });
  assert.equal(conflictPush.status, 200);
  assert.equal(conflictPush.body.conflicts.length, 1);

  const pulled = await request('/api/sync/changes?deviceKey=integration-device&cursor=0&limit=50', allowedToken);
  assert.equal(pulled.status, 200);
  assert.ok(pulled.body.changes.some((x) => x.client_change_id === 'change-1'));

  const markAllowed = await request('/api/teacher-marks', allowedToken, {
    method: 'POST',
    body: JSON.stringify({ examId: ids.examId, sessionId: ids.sessionId, classId: ids.classId, sectionId: ids.sectionId, studentId: ids.studentId, marks: 78, remarks: 'Good' })
  });
  assert.equal(markAllowed.status, 201);

  const markBlocked = await request('/api/teacher-marks', blockedToken, {
    method: 'POST',
    body: JSON.stringify({ examId: ids.examId, sessionId: ids.sessionId, classId: ids.classId, sectionId: ids.sectionId, studentId: ids.studentId, marks: 99 })
  });
  assert.equal(markBlocked.status, 403);
});
