const { authenticate, requireRoles } = require('./auth');

function registerExamSchedulingRoutes(app, pool) {
  const managers = ['super_admin', 'principal', 'admin'];
  const staff = ['super_admin', 'principal', 'admin', 'teacher'];

  app.get('/api/exams/schedule', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const { sessionId, examId, classId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const { rows } = await pool.query(`
        SELECT e.id,e.name,e.exam_type_id AS "examTypeId",e.session_id AS "sessionId",e.starts_on AS "startsOn",e.ends_on AS "endsOn",e.status,
               es.id AS "examSubjectId",es.subject_id AS "subjectId",s.name AS "subjectName",es.class_id AS "classId",es.exam_date AS "examDate",es.max_marks AS "maxMarks",es.pass_marks AS "passMarks"
        FROM exams e LEFT JOIN exam_subjects es ON es.exam_id=e.id AND es.school_id=e.school_id
        LEFT JOIN subjects s ON s.id=es.subject_id AND s.school_id=es.school_id
        WHERE e.school_id=$1 AND e.session_id=$2 AND ($3::uuid IS NULL OR e.id=$3) AND ($4::uuid IS NULL OR es.class_id=$4)
          AND ($5::uuid IS NULL OR e.branch_id=$5 OR e.branch_id IS NULL)
        ORDER BY e.starts_on NULLS LAST,e.name,es.exam_date NULLS LAST,s.name`,
        [req.auth.schoolId, sessionId, examId || null, classId || null, req.auth.branchId || null]);
      res.json({ schedule: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/exams', authenticate, requireRoles(...managers), async (req, res, next) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (!name || !b.sessionId) return res.status(400).json({ error: 'name and sessionId are required' });
      const { rows } = await pool.query(`
        INSERT INTO exams(school_id,session_id,name,exam_type_id,branch_id,starts_on,ends_on,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'draft',$8)
        RETURNING id,name,session_id AS "sessionId",exam_type_id AS "examTypeId",branch_id AS "branchId",starts_on AS "startsOn",ends_on AS "endsOn",status`,
        [req.auth.schoolId, b.sessionId, name, b.examTypeId || null, b.branchId || req.auth.branchId || null, b.startsOn || null, b.endsOn || null, req.auth.sub]);
      res.status(201).json({ exam: rows[0] });
    } catch (err) { if (err.code === '23505') return res.status(409).json({ error: 'Exam already exists' }); next(err); }
  });

  app.post('/api/exams/:examId/subjects', authenticate, requireRoles(...managers), async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.subjectId || !b.classId) return res.status(400).json({ error: 'subjectId and classId are required' });
      const exam = await pool.query('SELECT id,session_id,branch_id FROM exams WHERE id=$1 AND school_id=$2', [req.params.examId, req.auth.schoolId]);
      if (!exam.rowCount) return res.status(404).json({ error: 'Exam not found' });
      const { rows } = await pool.query(`
        INSERT INTO exam_subjects(school_id,exam_id,subject_id,class_id,branch_id,max_marks,pass_marks,exam_date,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active')
        RETURNING id,exam_id AS "examId",subject_id AS "subjectId",class_id AS "classId",branch_id AS "branchId",max_marks AS "maxMarks",pass_marks AS "passMarks",exam_date AS "examDate",status`,
        [req.auth.schoolId, req.params.examId, b.subjectId, b.classId, b.branchId || exam.rows[0].branch_id || req.auth.branchId || null, Number(b.maxMarks || 100), b.passMarks == null ? null : Number(b.passMarks), b.examDate || null]);
      res.status(201).json({ examSubject: rows[0] });
    } catch (err) { if (err.code === '23505') return res.status(409).json({ error: 'Subject is already scheduled for this class/exam' }); next(err); }
  });

  app.put('/api/exams/:examId/subjects/:examSubjectId', authenticate, requireRoles(...managers), async (req, res, next) => {
    try {
      const b = req.body || {};
      const { rows } = await pool.query(`
        UPDATE exam_subjects SET exam_date=COALESCE($1,exam_date),max_marks=COALESCE($2,max_marks),pass_marks=COALESCE($3,pass_marks)
        WHERE id=$4 AND exam_id=$5 AND school_id=$6 RETURNING id,exam_id AS "examId",exam_date AS "examDate",max_marks AS "maxMarks",pass_marks AS "passMarks"`,
        [b.examDate || null, b.maxMarks == null ? null : Number(b.maxMarks), b.passMarks == null ? null : Number(b.passMarks), req.params.examSubjectId, req.params.examId, req.auth.schoolId]);
      if (!rows.length) return res.status(404).json({ error: 'Exam subject not found' });
      res.json({ examSubject: rows[0] });
    } catch (err) { next(err); }
  });
}

module.exports = { registerExamSchedulingRoutes };