const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { app } = require('../src/server');
const { signAccessToken } = require('../src/security');

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL offline sync and teacher marks integration', { skip: !databaseUrl }, async (t) => {
  const pool = new Pool({ connectionString: databaseUrl });
  const server = app.listen(0);
  const baseUrl = await new Promise((resolve) => server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`)));
  let schoolId;

  try {
    const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const school = await pool.query(
      `INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id`,
      [`Integration School ${suffix}`, `IT_${suffix.slice(-20)}`]
    );
    schoolId = school.rows[0].id;

    const admin = await pool.query(
      `INSERT INTO users(school_id,email,password_hash,role,status) VALUES($1,$2,'integration','super_admin','active') RETURNING id`,
      [schoolId, `admin_${suffix}@example.test`]
    );
    const adminToken = signAccessToken({ sub: admin.rows[0].id, schoolId, branchId: null, role: 'super_admin' });
    const authHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };

    await t.test('offline sync device registration, pull, idempotency and conflict tracking', async () => {
      const deviceKey = `device-${suffix}`;
      const register = await fetch(`${baseUrl}/api/sync/device`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ deviceKey, deviceName: 'Integration Test Device', platform: 'test' })
      });
      assert.equal(register.status, 200);

      const push = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          deviceKey,
          changes: [{ clientId: 'client-1', entityType: 'attendance', entityId: crypto.randomUUID(), operation: 'create', baseCursor: 0, payload: { status: 'present' } }]
        })
      });
      assert.equal(push.status, 200);
      const first = await push.json();
      assert.equal(first.accepted.length, 1);
      assert.equal(first.conflicts.length, 0);

      const retry = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          deviceKey,
          changes: [{ clientId: 'client-1', entityType: 'attendance', operation: 'create', baseCursor: 0, payload: { status: 'present' } }]
        })
      });
      assert.equal(retry.status, 200);
      const duplicate = await retry.json();
      assert.equal(duplicate.accepted[0].duplicate, true);

      const pulled = await fetch(`${baseUrl}/api/sync/changes?deviceKey=${encodeURIComponent(deviceKey)}&cursor=0&limit=50`, { headers: authHeaders });
      assert.equal(pulled.status, 200);
      const changes = await pulled.json();
      assert.equal(changes.changes.length, 1);
      assert.equal(changes.changes[0].client_change_id, 'client-1');

      const conflict = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          deviceKey,
          changes: [{ clientId: 'client-2', entityType: 'attendance', entityId: changes.changes[0].entity_id, operation: 'update', baseCursor: 0, payload: { status: 'absent' } }]
        })
      });
      assert.equal(conflict.status, 200);
      const conflictBody = await conflict.json();
      assert.equal(conflictBody.conflicts.length, 1);

      const conflictRows = await pool.query('SELECT resolution FROM sync_conflicts WHERE school_id=$1', [schoolId]);
      assert.equal(conflictRows.rows.length, 1);
      assert.equal(conflictRows.rows[0].resolution, 'pending');
    });

    await t.test('teacher marks guard allows assigned class/subject and rejects another class', async () => {
      const teacher = await pool.query(
        `INSERT INTO users(school_id,email,password_hash,role,status) VALUES($1,$2,'integration','teacher','active') RETURNING id`,
        [schoolId, `teacher_${suffix}@example.test`]
      );
      const session = await pool.query(
        `INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,'Integration Session','2026-04-01','2027-03-31',true) RETURNING id`,
        [schoolId]
      );
      const cls1 = await pool.query(`INSERT INTO classes(school_id,name) VALUES($1,'Class 1') RETURNING id`, [schoolId]);
      const cls2 = await pool.query(`INSERT INTO classes(school_id,name) VALUES($1,'Class 2') RETURNING id`, [schoolId]);
      const sec1 = await pool.query(`INSERT INTO sections(school_id,class_id,name) VALUES($1,$2,'A') RETURNING id`, [schoolId, cls1.rows[0].id]);
      const sec2 = await pool.query(`INSERT INTO sections(school_id,class_id,name) VALUES($1,$2,'A') RETURNING id`, [schoolId, cls2.rows[0].id]);
      const subject = await pool.query(`INSERT INTO subjects(school_id,name,code) VALUES($1,'Mathematics','MATH-IT') RETURNING id`, [schoolId]);
      const student = await pool.query(`INSERT INTO students(school_id,admission_no,full_name,status) VALUES($1,'IT-STU-1','Integration Student','active') RETURNING id`, [schoolId]);
      await pool.query(`INSERT INTO enrollments(school_id,student_id,session_id,section_id,roll_no,status) VALUES($1,$2,$3,$4,'1','active')`, [schoolId, student.rows[0].id, session.rows[0].id, sec1.rows[0].id]);
      await pool.query(`INSERT INTO teacher_class_subject_permissions(school_id,teacher_user_id,class_id,section_id,subject_id,session_id,can_view,can_edit_marks) VALUES($1,$2,$3,$4,$5,$6,true,true)`, [schoolId, teacher.rows[0].id, cls1.rows[0].id, sec1.rows[0].id, subject.rows[0].id, session.rows[0].id]);
      const examType = await pool.query(`INSERT INTO exam_types(school_id,code,name,category) VALUES($1,'IT','Integration','custom') RETURNING id`, [schoolId]);
      const exam = await pool.query(`INSERT INTO exams(school_id,session_id,exam_type_id,name,status) VALUES($1,$2,$3,'Integration Exam','open') RETURNING id`, [schoolId, session.rows[0].id, examType.rows[0].id]);
      const examSubject = await pool.query(`INSERT INTO exam_subjects(school_id,exam_id,subject_id,class_id,max_marks) VALUES($1,$2,$3,$4,100) RETURNING id`, [schoolId, exam.rows[0].id, subject.rows[0].id, cls1.rows[0].id]);

      const allowed = await pool.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,entered_by) VALUES($1,$2,$3,80,$4) RETURNING id`, [schoolId, examSubject.rows[0].id, student.rows[0].id, teacher.rows[0].id]);
      assert.equal(allowed.rows.length, 1);

      const otherExamSubject = await pool.query(`INSERT INTO exam_subjects(school_id,exam_id,subject_id,class_id,max_marks) VALUES($1,$2,$3,$4,100) RETURNING id`, [schoolId, exam.rows[0].id, subject.rows[0].id, cls2.rows[0].id]);
      await assert.rejects(
        pool.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,entered_by) VALUES($1,$2,$3,70,$4)`, [schoolId, otherExamSubject.rows[0].id, student.rows[0].id, teacher.rows[0].id]),
        /not permitted to enter marks/
      );

      const wrongSectionStudent = await pool.query(`INSERT INTO students(school_id,admission_no,full_name,status) VALUES($1,'IT-STU-2','Wrong Class Student','active') RETURNING id`, [schoolId]);
      await pool.query(`INSERT INTO enrollments(school_id,student_id,session_id,section_id,roll_no,status) VALUES($1,$2,$3,$4,'2','active')`, [schoolId, wrongSectionStudent.rows[0].id, session.rows[0].id, sec2.rows[0].id]);
      await assert.rejects(
        pool.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,entered_by) VALUES($1,$2,$3,60,$4)`, [schoolId, examSubject.rows[0].id, wrongSectionStudent.rows[0].id, teacher.rows[0].id]),
        /not permitted to enter marks/
      );
    });
  } finally {
    if (schoolId) await pool.query('DELETE FROM schools WHERE id=$1', [schoolId]);
    await pool.end();
    await new Promise((resolve) => server.close(resolve));
  }
});
