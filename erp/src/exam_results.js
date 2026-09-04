const { authenticate, requireRoles } = require('./auth');

function registerExamResultRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];
  const publishRoles = ['super_admin','principal','admin'];

  app.get('/api/exam-results/student/:studentId', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId, examId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`
        WITH enrolled AS (
          SELECT en.student_id,en.session_id,en.class_id,en.section_id
          FROM enrollments en
          JOIN sections sec ON sec.id=en.section_id AND sec.school_id=en.school_id
          JOIN classes c ON c.id=en.class_id AND c.school_id=en.school_id
          WHERE en.school_id=$1 AND en.student_id=$2 AND en.session_id=$3 AND en.status='active'
            AND ($4::uuid IS NULL OR en.branch_id=$4 OR en.branch_id IS NULL)
            AND ($4::uuid IS NULL OR c.branch_id=$4 OR c.branch_id IS NULL)
        )
        SELECT es.id AS "examSubjectId",e.id AS "examId",e.name AS "examName",e.status AS "examStatus",
               et.id AS "examTypeId",et.code AS "examTypeCode",et.name AS "examTypeName",
               s.id AS "subjectId",s.name AS "subjectName",es.class_id AS "classId",
               es.max_marks AS "maxMarks",es.pass_marks AS "passMarks",m.marks,m.grade,m.remarks,
               e.branch_id AS "branchId"
        FROM enrolled en
        JOIN exam_subjects es ON es.school_id=$1 AND es.class_id=en.class_id
        JOIN exams e ON e.id=es.exam_id AND e.school_id=$1 AND e.session_id=en.session_id
        JOIN exam_types et ON et.id=e.exam_type_id AND et.school_id=$1
        JOIN subjects s ON s.id=es.subject_id AND s.school_id=$1
        LEFT JOIN exam_marks m ON m.exam_subject_id=es.id AND m.student_id=en.student_id AND m.school_id=$1
        WHERE ($4::uuid IS NULL OR es.branch_id=$4 OR es.branch_id IS NULL)
          AND ($4::uuid IS NULL OR e.branch_id=$4 OR e.branch_id IS NULL)
          AND ($5::uuid IS NULL OR et.id=$5)
          AND ($6::uuid IS NULL OR e.id=$6)
        ORDER BY e.starts_on NULLS LAST,et.display_order,e.name,s.name`,
        [req.auth.schoolId,req.params.studentId,sessionId,branchId,examTypeId||null,examId||null]);
      res.json({ results: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/exam-results/summary', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId, examId, classId, sectionId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`
        SELECT s.id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",
               c.name AS "className",sec.name AS "sectionName",
               COUNT(m.id)::int AS "subjectsMarked",
               COUNT(es.id)::int AS "subjectsTotal",
               COALESCE(SUM(m.marks),0) AS "marksObtained",
               COALESCE(SUM(es.max_marks),0) AS "maxMarks",
               CASE WHEN COALESCE(SUM(es.max_marks),0)>0 THEN ROUND(COALESCE(SUM(m.marks),0)*100.0/SUM(es.max_marks),2) ELSE 0 END AS percentage,
               CASE WHEN COUNT(es.id)>0 AND COUNT(m.id)=COUNT(es.id) THEN 'complete' ELSE 'pending' END AS status
        FROM enrollments en
        JOIN students s ON s.id=en.student_id AND s.school_id=en.school_id
        JOIN sections sec ON sec.id=en.section_id AND sec.school_id=en.school_id
        JOIN classes c ON c.id=en.class_id AND c.school_id=en.school_id
        JOIN exam_subjects es ON es.school_id=en.school_id AND es.class_id=en.class_id
        JOIN exams e ON e.id=es.exam_id AND e.school_id=en.school_id AND e.session_id=en.session_id
        LEFT JOIN exam_marks m ON m.exam_subject_id=es.id AND m.student_id=s.id AND m.school_id=en.school_id
        WHERE en.school_id=$1 AND en.session_id=$2 AND en.status='active'
          AND ($3::uuid IS NULL OR en.branch_id=$3 OR en.branch_id IS NULL)
          AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL)
          AND ($4::uuid IS NULL OR e.exam_type_id=$4)
          AND ($5::uuid IS NULL OR e.id=$5)
          AND ($6::uuid IS NULL OR en.class_id=$6)
          AND ($7::uuid IS NULL OR en.section_id=$7)
          AND ($3::uuid IS NULL OR es.branch_id=$3 OR es.branch_id IS NULL)
          AND ($3::uuid IS NULL OR e.branch_id=$3 OR e.branch_id IS NULL)
        GROUP BY s.id,s.admission_no,s.full_name,c.name,sec.name
        ORDER BY c.name,sec.name,s.full_name`,
        [req.auth.schoolId,sessionId,branchId,examTypeId||null,examId||null,classId||null,sectionId||null]);
      res.json({ results: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exam-results/publish', authenticate, requireRoles(...publishRoles), async (req,res,next) => {
    try {
      const { examId } = req.body || {};
      if (!examId) return res.status(400).json({ error: 'examId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`UPDATE exams SET status='published'
        WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)
        RETURNING id,name,status,branch_id AS "branchId"`,[examId,req.auth.schoolId,branchId]);
      if(!rows.length) return res.status(404).json({error:'Exam not found for this school or branch'});
      res.json({exam:rows[0]});
    } catch(err){next(err);}
  });

  app.post('/api/exam-results/unpublish', authenticate, requireRoles(...publishRoles), async (req,res,next) => {
    try {
      const { examId } = req.body || {};
      if (!examId) return res.status(400).json({ error: 'examId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`UPDATE exams SET status='completed'
        WHERE id=$1 AND school_id=$2 AND status='published' AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)
        RETURNING id,name,status,branch_id AS "branchId"`,[examId,req.auth.schoolId,branchId]);
      if(!rows.length) return res.status(404).json({error:'Published exam not found for this school or branch'});
      res.json({exam:rows[0]});
    } catch(err){next(err);}
  });
}

module.exports = { registerExamResultRoutes };
