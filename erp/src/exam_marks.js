const { authenticate, requireRoles } = require('./auth');

function registerExamMarkRoutes(app, pool) {
  const roles = ['super_admin','principal','admin','teacher'];

  async function authorizeExamSubject(client, auth, examSubjectId) {
    const { rows } = await client.query(`SELECT es.id AS "examSubjectId", es.class_id AS "classId", es.max_marks AS "maxMarks", es.pass_marks AS "passMarks", es.branch_id AS "branchId", e.id AS "examId", e.session_id AS "sessionId", e.status AS "examStatus" FROM exam_subjects es JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id WHERE es.id=$1 AND es.school_id=$2`, [examSubjectId, auth.schoolId]);
    if (!rows.length) return { error: 'Exam subject not found for this school' };
    const subject = rows[0];
    if (auth.branchId && subject.branchId && subject.branchId !== auth.branchId) return { error: 'Exam subject is outside the active branch', status: 403 };
    if (auth.role === 'teacher') {
      const permission = await client.query('SELECT teacher_can_edit_exam_subject($1,$2) AS allowed', [auth.sub, examSubjectId]);
      if (!permission.rows[0]?.allowed) return { error: 'Teacher is not assigned to this subject/class', status: 403 };
    }
    return { subject };
  }

  async function validateStudent(client, auth, studentId, subject) {
    const { rows } = await client.query(`SELECT id FROM enrollments WHERE school_id=$1 AND student_id=$2 AND session_id=$3 AND class_id=$4 AND status='active' AND ($5::uuid IS NULL OR branch_id=$5 OR branch_id IS NULL)`, [auth.schoolId, studentId, subject.sessionId, subject.classId, auth.branchId || null]);
    return rows.length > 0;
  }

  app.get('/api/exam-marks/roster', authenticate, requireRoles(...roles), async (req,res,next) => {
    try {
      const { examSubjectId } = req.query || {};
      if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required' });
      const authz = await authorizeExamSubject(pool, req.auth, examSubjectId);
      if (authz.error) return res.status(authz.status || 404).json({ error: authz.error });
      const { subject } = authz;
      const { rows } = await pool.query(`
        SELECT s.id AS "studentId", s.admission_no AS "admissionNo", s.full_name AS "studentName",
               c.id AS "classId", c.name AS "className", sec.id AS "sectionId", sec.name AS "sectionName",
               em.id AS "markId", em.marks, em.grade, em.remarks
        FROM enrollments en
        JOIN students s ON s.id=en.student_id AND s.school_id=en.school_id
        JOIN classes c ON c.id=en.class_id AND c.school_id=en.school_id
        JOIN sections sec ON sec.id=en.section_id AND sec.school_id=en.school_id
        LEFT JOIN exam_marks em ON em.school_id=en.school_id AND em.exam_subject_id=$1 AND em.student_id=s.id
        WHERE en.school_id=$2 AND en.session_id=$3 AND en.class_id=$4 AND en.status='active'
          AND ($5::uuid IS NULL OR en.branch_id=$5 OR en.branch_id IS NULL)
        ORDER BY s.full_name
      `, [examSubjectId, req.auth.schoolId, subject.sessionId, subject.classId, req.auth.branchId || null]);
      res.json({ examSubject: subject, students: rows });
    } catch (err) { next(err); }
  });

  // Compatibility read endpoints used by the existing exam-management UI. Both are
  // still protected by the same tenant/teacher authorization as the roster endpoint.
  app.get('/api/exam-marks', authenticate, requireRoles(...roles), async (req,res,next) => {
    try {
      const { examSubjectId } = req.query || {};
      if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required' });
      const authz = await authorizeExamSubject(pool, req.auth, examSubjectId);
      if (authz.error) return res.status(authz.status || 404).json({ error: authz.error });
      const { rows } = await pool.query(
        'SELECT id,school_id AS "schoolId",exam_subject_id AS "examSubjectId",student_id AS "studentId",marks,grade,remarks FROM exam_marks WHERE school_id=$1 AND exam_subject_id=$2',
        [req.auth.schoolId, examSubjectId],
      );
      res.json({ marks: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/exam-students', authenticate, requireRoles(...roles), async (req,res,next) => {
    try {
      const { examSubjectId } = req.query || {};
      if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required' });
      const authz = await authorizeExamSubject(pool, req.auth, examSubjectId);
      if (authz.error) return res.status(authz.status || 404).json({ error: authz.error });
      const { subject } = authz;
      const { rows } = await pool.query(
        `SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName"
         FROM enrollments en JOIN students s ON s.id=en.student_id AND s.school_id=en.school_id
         WHERE en.school_id=$1 AND en.session_id=$2 AND en.class_id=$3 AND en.status='active'
           AND ($4::uuid IS NULL OR en.branch_id=$4 OR en.branch_id IS NULL)
         ORDER BY s.full_name`,
        [req.auth.schoolId, subject.sessionId, subject.classId, req.auth.branchId || null],
      );
      res.json({ students: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/exam-marks', authenticate, requireRoles(...roles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const b = req.body || {};
      const examSubjectId = String(b.examSubjectId || '').trim();
      const studentId = String(b.studentId || '').trim();
      if (!examSubjectId || !studentId || b.marks === undefined || b.marks === null) return res.status(400).json({ error: 'examSubjectId, studentId and marks are required' });
      const marks = Number(b.marks);
      if (!Number.isFinite(marks) || marks < 0) return res.status(400).json({ error: 'Marks must be a valid non-negative number' });
      await client.query('BEGIN');
      const authz = await authorizeExamSubject(client, req.auth, examSubjectId);
      if (authz.error) { await client.query('ROLLBACK'); return res.status(authz.status || 404).json({ error: authz.error }); }
      const { subject } = authz;
      if (subject.examStatus === 'published') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Published exam marks cannot be edited' }); }
      if (subject.maxMarks !== null && marks > Number(subject.maxMarks)) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Marks cannot exceed maximum ' + subject.maxMarks }); }
      if (!(await validateStudent(client, req.auth, studentId, subject))) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Student is not enrolled in this class/session' }); }
      const result = await client.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,grade,remarks) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,exam_subject_id,student_id) DO UPDATE SET marks=EXCLUDED.marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,updated_at=now() RETURNING id,school_id AS "schoolId",exam_subject_id AS "examSubjectId",student_id AS "studentId",marks,grade,remarks`, [req.auth.schoolId, examSubjectId, studentId, marks, b.grade || null, b.remarks || null]);
      await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'exam_mark',$2,'update',$3::jsonb,$4)`, [req.auth.schoolId, result.rows[0].id, JSON.stringify({ examSubjectId, studentId, marks, grade: b.grade || null, remarks: b.remarks || null }), req.auth.sub]);
      await client.query('COMMIT');
      res.json({ mark: result.rows[0] });
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
  });

  app.post('/api/exam-marks/batch', authenticate, requireRoles(...roles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const items = Array.isArray(req.body?.marks) ? req.body.marks.slice(0, 500) : [];
      if (!items.length) return res.status(400).json({ error: 'marks array is required' });
      await client.query('BEGIN');
      const output = [];
      for (const item of items) {
        const examSubjectId = String(item.examSubjectId || '').trim(); const studentId = String(item.studentId || '').trim(); const marks = Number(item.marks);
        if (!examSubjectId || !studentId || !Number.isFinite(marks) || marks < 0) throw Object.assign(new Error('Every mark needs examSubjectId, studentId and valid marks'), { statusCode: 400 });
        const authz = await authorizeExamSubject(client, req.auth, examSubjectId);
        if (authz.error) throw Object.assign(new Error(authz.error), { statusCode: authz.status || 403 });
        const { subject } = authz;
        if (subject.examStatus === 'published') throw Object.assign(new Error('Published exam marks cannot be edited'), { statusCode: 409 });
        if (subject.maxMarks !== null && marks > Number(subject.maxMarks)) throw Object.assign(new Error('Marks cannot exceed maximum ' + subject.maxMarks), { statusCode: 422 });
        if (!(await validateStudent(client, req.auth, studentId, subject))) throw Object.assign(new Error('Student is not enrolled in this class/session'), { statusCode: 403 });
        const saved = await client.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,grade,remarks) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,exam_subject_id,student_id) DO UPDATE SET marks=EXCLUDED.marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,updated_at=now() RETURNING id,exam_subject_id AS "examSubjectId",student_id AS "studentId",marks,grade,remarks`, [req.auth.schoolId, examSubjectId, studentId, marks, item.grade || null, item.remarks || null]);
        output.push(saved.rows[0]);
        await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'exam_mark',$2,'update',$3::jsonb,$4)`, [req.auth.schoolId, saved.rows[0].id, JSON.stringify({ examSubjectId, studentId, marks, grade: item.grade || null, remarks: item.remarks || null }), req.auth.sub]);
      }
      await client.query('COMMIT'); res.json({ marks: output, count: output.length });
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); const status=[400,403,409,422].includes(err?.statusCode)?err.statusCode:500; res.status(status).json({ error: status<500 ? err.message : 'Unable to save marks' }); } finally { client.release(); }
  });
}

module.exports = { registerExamMarkRoutes };