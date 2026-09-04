const { authenticate, requireRoles } = require('./auth');

function registerExamRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];

  app.get('/api/exam-types', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT id,code,name,category,display_order AS "displayOrder",max_marks AS "maxMarks",pass_marks AS "passMarks",is_active AS "isActive",branch_id AS "branchId" FROM exam_types WHERE school_id=$1 AND is_active=true AND ($2::uuid IS NULL OR branch_id=$2) ORDER BY display_order,name`, [req.auth.schoolId,req.auth.branchId||null]);
      res.json({ examTypes: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/exams', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT e.id,e.name,e.starts_on AS "startsOn",e.ends_on AS "endsOn",e.status,t.code AS "typeCode",t.name AS "typeName",e.branch_id AS "branchId" FROM exams e JOIN exam_types t ON t.id=e.exam_type_id WHERE e.school_id=$1 AND ($2::uuid IS NULL OR e.branch_id=$2) ORDER BY e.starts_on NULLS LAST,e.name`, [req.auth.schoolId,req.auth.branchId||null]);
      res.json({ exams: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exams', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId, name, startsOn=null, endsOn=null } = req.body || {};
      if (!sessionId || !examTypeId || !name) return res.status(400).json({ error: 'sessionId, examTypeId and name are required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`INSERT INTO exams (school_id,branch_id,session_id,exam_type_id,name,starts_on,ends_on) SELECT $1,$2,$3,id,$4,$5,$6 FROM exam_types WHERE id=$7 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2) RETURNING id,name,starts_on AS "startsOn",ends_on AS "endsOn",status,branch_id AS "branchId"`, [req.auth.schoolId,branchId,sessionId,name,startsOn,endsOn,examTypeId]);
      if (!rows.length) return res.status(404).json({ error: 'Exam type not found for this school or branch' });
      res.status(201).json({ exam: rows[0] });
    } catch(err){ next(err); }
  });

  app.post('/api/exam-marks', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { examSubjectId, studentId, marks=null, grade=null, remarks=null } = req.body || {};
      if (!examSubjectId || !studentId) return res.status(400).json({ error: 'examSubjectId and studentId are required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`INSERT INTO exam_marks (school_id,branch_id,exam_subject_id,student_id,marks,grade,remarks,entered_by) SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE EXISTS (SELECT 1 FROM exam_subjects es WHERE es.id=$3 AND es.school_id=$1 AND ($2::uuid IS NULL OR es.branch_id=$2)) AND EXISTS (SELECT 1 FROM students s WHERE s.id=$4 AND s.school_id=$1 AND ($2::uuid IS NULL OR s.branch_id IS NULL OR s.branch_id=$2)) ON CONFLICT (exam_subject_id,student_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,marks=EXCLUDED.marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by,updated_at=now() RETURNING id,exam_subject_id AS "examSubjectId",student_id AS "studentId",marks,grade,remarks,branch_id AS "branchId"`, [req.auth.schoolId,branchId,examSubjectId,studentId,marks,grade,remarks,req.auth.sub]);
      if (!rows.length) return res.status(404).json({ error: 'Exam subject or student not found for this school or branch' });
      res.json({ mark: rows[0] });
    } catch(err){ next(err); }
  });
}
module.exports = { registerExamRoutes };
