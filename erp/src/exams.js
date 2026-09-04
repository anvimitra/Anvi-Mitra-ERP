const { authenticate, requireRoles } = require('./auth');

function registerExamRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];
  const adminRoles = ['super_admin','principal','admin'];

  app.get('/api/exam-types', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT id,code,name,category,display_order AS "displayOrder",max_marks AS "maxMarks",pass_marks AS "passMarks",is_active AS "isActive",branch_id AS "branchId" FROM exam_types WHERE school_id=$1 AND is_active=true AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL) ORDER BY display_order,name`, [req.auth.schoolId,req.auth.branchId||null]);
      res.json({ examTypes: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/exams', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT e.id,e.name,e.starts_on AS "startsOn",e.ends_on AS "endsOn",e.status,t.code AS "typeCode",t.name AS "typeName",e.branch_id AS "branchId" FROM exams e JOIN exam_types t ON t.id=e.exam_type_id WHERE e.school_id=$1 AND ($2::uuid IS NULL OR e.branch_id=$2 OR e.branch_id IS NULL) ORDER BY e.starts_on NULLS LAST,e.name`, [req.auth.schoolId,req.auth.branchId||null]);
      res.json({ exams: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exams', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId, name, startsOn=null, endsOn=null } = req.body || {};
      if (!sessionId || !examTypeId || !name) return res.status(400).json({ error: 'sessionId, examTypeId and name are required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`INSERT INTO exams (school_id,branch_id,session_id,exam_type_id,name,starts_on,ends_on) SELECT $1,$2,$3,id,$4,$5,$6 FROM exam_types WHERE id=$7 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL) RETURNING id,name,starts_on AS "startsOn",ends_on AS "endsOn",status,branch_id AS "branchId"`, [req.auth.schoolId,branchId,sessionId,name,startsOn,endsOn,examTypeId]);
      if (!rows.length) return res.status(404).json({ error: 'Exam type not found for this school or branch' });
      res.status(201).json({ exam: rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/exam-subjects', authenticate, async (req,res,next) => {
    try {
      const { examId, classId } = req.query || {};
      if (!examId) return res.status(400).json({ error: 'examId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`SELECT es.id,es.exam_id AS "examId",es.subject_id AS "subjectId",s.name AS "subjectName",es.class_id AS "classId",c.name AS "className",es.max_marks AS "maxMarks",es.pass_marks AS "passMarks",es.exam_date AS "examDate",es.branch_id AS "branchId" FROM exam_subjects es JOIN exams e ON e.id=es.exam_id JOIN subjects s ON s.id=es.subject_id JOIN classes c ON c.id=es.class_id WHERE es.school_id=$1 AND es.exam_id=$2 AND ($3::uuid IS NULL OR es.branch_id=$3 OR es.branch_id IS NULL) AND ($4::uuid IS NULL OR es.class_id=$4) AND e.school_id=$1 AND ($3::uuid IS NULL OR e.branch_id=$3 OR e.branch_id IS NULL) ORDER BY c.name,s.name`, [req.auth.schoolId,examId,branchId,classId||null]);
      res.json({ examSubjects: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exam-subjects', authenticate, requireRoles(...adminRoles), async (req,res,next) => {
    try {
      const { examId, subjectId, classId, maxMarks, passMarks=null, examDate=null } = req.body || {};
      if (!examId || !subjectId || !classId || maxMarks === undefined || maxMarks === null) return res.status(400).json({ error: 'examId, subjectId, classId and maxMarks are required' });
      const max=Number(maxMarks), pass=passMarks===null||passMarks===undefined||passMarks===''?null:Number(passMarks);
      if (!Number.isFinite(max) || max <= 0) return res.status(400).json({ error: 'maxMarks must be greater than 0' });
      if (pass !== null && (!Number.isFinite(pass) || pass < 0 || pass > max)) return res.status(400).json({ error: 'passMarks must be between 0 and maxMarks' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`WITH valid AS (
        SELECT e.id AS exam_id, c.id AS class_id, s.id AS subject_id, COALESCE(e.branch_id,c.branch_id) AS branch_id
        FROM exams e JOIN classes c ON c.id=$4 AND c.school_id=$1 JOIN subjects s ON s.id=$3 AND s.school_id=$1
        WHERE e.id=$2 AND e.school_id=$1
          AND ($5::uuid IS NULL OR e.branch_id=$5 OR e.branch_id IS NULL)
          AND ($5::uuid IS NULL OR c.branch_id=$5 OR c.branch_id IS NULL)
      )
      INSERT INTO exam_subjects (school_id,branch_id,exam_id,subject_id,class_id,max_marks,pass_marks,exam_date)
      SELECT $1,CASE WHEN $5::uuid IS NULL THEN v.branch_id ELSE $5 END,v.exam_id,v.subject_id,v.class_id,$6,$7,$8 FROM valid v
      ON CONFLICT (exam_id,subject_id,class_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,max_marks=EXCLUDED.max_marks,pass_marks=EXCLUDED.pass_marks,exam_date=EXCLUDED.exam_date
      RETURNING id,exam_id AS "examId",subject_id AS "subjectId",class_id AS "classId",max_marks AS "maxMarks",pass_marks AS "passMarks",exam_date AS "examDate",branch_id AS "branchId"`, [req.auth.schoolId,examId,subjectId,classId,branchId,max,pass,examDate]);
      if (!rows.length) return res.status(404).json({ error: 'Exam, subject or class not found for this school or branch' });
      res.status(201).json({ examSubject: rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/exam-marks', authenticate, async (req,res,next) => {
    try {
      const { examSubjectId, studentId } = req.query || {};
      if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`SELECT m.id,m.exam_subject_id AS "examSubjectId",m.student_id AS "studentId",m.marks,m.grade,m.remarks,m.branch_id AS "branchId",u.email AS "enteredBy" FROM exam_marks m LEFT JOIN users u ON u.id=m.entered_by JOIN exam_subjects es ON es.id=m.exam_subject_id WHERE m.school_id=$1 AND m.exam_subject_id=$2 AND ($3::uuid IS NULL OR m.branch_id=$3 OR m.branch_id IS NULL) AND ($4::uuid IS NULL OR m.student_id=$4) AND es.school_id=$1 AND ($3::uuid IS NULL OR es.branch_id=$3 OR es.branch_id IS NULL) ORDER BY m.student_id`, [req.auth.schoolId,examSubjectId,branchId,studentId||null]);
      res.json({ marks: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exam-marks', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { examSubjectId, studentId, marks=null, grade=null, remarks=null } = req.body || {};
      if (!examSubjectId || !studentId) return res.status(400).json({ error: 'examSubjectId and studentId are required' });
      const numericMarks = marks === null || marks === undefined || marks === '' ? null : Number(marks);
      if (numericMarks !== null && (!Number.isFinite(numericMarks) || numericMarks < 0)) return res.status(400).json({ error: 'marks must be a non-negative number' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`WITH valid AS (
        SELECT es.id,es.branch_id,es.max_marks,e.session_id,e.school_id,c.id AS class_id
        FROM exam_subjects es JOIN exams e ON e.id=es.exam_id JOIN classes c ON c.id=es.class_id
        WHERE es.id=$3 AND es.school_id=$1 AND e.school_id=$1
          AND ($2::uuid IS NULL OR es.branch_id=$2 OR es.branch_id IS NULL)
          AND ($2::uuid IS NULL OR e.branch_id=$2 OR e.branch_id IS NULL)
          AND ($2::uuid IS NULL OR c.branch_id=$2 OR c.branch_id IS NULL)
      ), eligible_student AS (
        SELECT s.id FROM students s JOIN enrollments en ON en.student_id=s.id AND en.school_id=s.school_id
        JOIN valid v ON true
        WHERE s.id=$4 AND s.school_id=$1
          AND ($2::uuid IS NULL OR s.branch_id IS NULL OR s.branch_id=$2)
          AND en.session_id=v.session_id AND en.class_id=v.class_id AND en.status='active'
          AND ($2::uuid IS NULL OR en.branch_id IS NULL OR en.branch_id=$2)
      )
      INSERT INTO exam_marks (school_id,branch_id,exam_subject_id,student_id,marks,grade,remarks,entered_by)
      SELECT $1,CASE WHEN $2::uuid IS NULL THEN v.branch_id ELSE $2 END,v.id,$4,$5,$6,$7,$8 FROM valid v JOIN eligible_student es ON es.id=$4
      WHERE $5 IS NULL OR $5 <= v.max_marks
      ON CONFLICT (exam_subject_id,student_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,marks=EXCLUDED.marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by,updated_at=now()
      RETURNING id,exam_subject_id AS "examSubjectId",student_id AS "studentId",marks,grade,remarks,branch_id AS "branchId"`, [req.auth.schoolId,branchId,examSubjectId,studentId,numericMarks,grade,remarks,req.auth.sub]);
      if (!rows.length) return res.status(400).json({ error: 'Student is not enrolled in the exam subject class, or marks exceed maxMarks' });
      res.json({ mark: rows[0] });
    } catch(err){ next(err); }
  });
}
module.exports = { registerExamRoutes };
