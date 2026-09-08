const { authenticate, requireRoles } = require('./auth');

function registerExamResultRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];
  const publishRoles = ['super_admin','principal','admin'];

  async function teacherMarkAccess(client, auth, examId, sessionId, classId, sectionId, subjectId) {
    if (['super_admin','principal','admin'].includes(auth.role)) return true;
    if (auth.role !== 'teacher') return false;
    const r = await client.query(`SELECT 1 FROM teacher_class_subject_permissions
      WHERE school_id=$1 AND teacher_user_id=$2 AND class_id=$3 AND section_id=$4 AND subject_id=$5 AND session_id=$6
        AND can_view=true AND can_edit_marks=true AND (branch_id IS NULL OR branch_id=$7) LIMIT 1`,
      [auth.schoolId,auth.sub,classId,sectionId,subjectId,sessionId,auth.branchId||null]);
    return r.rows.length > 0;
  }

  app.get('/api/teacher-marks', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const { sessionId, examId, classId, sectionId } = req.query || {};
      if (!sessionId||!examId||!classId||!sectionId) return res.status(400).json({error:'sessionId, examId, classId and sectionId are required'});
      const branchId=req.auth.branchId||null;
      const subject=await client.query(`SELECT es.id AS "examSubjectId",es.subject_id AS "subjectId",sub.name AS "subjectName",es.class_id AS "classId",es.max_marks AS "maxMarks",es.pass_marks AS "passMarks",e.session_id AS "sessionId",e.branch_id AS "branchId"
        FROM exam_subjects es JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id JOIN subjects sub ON sub.id=es.subject_id AND sub.school_id=es.school_id
        WHERE es.school_id=$1 AND es.exam_id=$2 AND e.session_id=$3 AND es.class_id=$4 AND ($5::uuid IS NULL OR es.branch_id=$5 OR es.branch_id IS NULL) AND ($5::uuid IS NULL OR e.branch_id=$5 OR e.branch_id IS NULL) LIMIT 1`,
        [req.auth.schoolId,examId,sessionId,classId,branchId]);
      if(!subject.rows.length)return res.status(404).json({error:'Exam subject not found for this class/branch'});
      const es=subject.rows[0];
      if(!(await teacherMarkAccess(client,req.auth,examId,sessionId,classId,sectionId,es.subjectId)))return res.status(403).json({error:'You are not permitted to edit marks for this class, section and subject'});
      const students=await client.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",m.marks,m.grade,m.remarks
        FROM enrollments en JOIN students s ON s.id=en.student_id AND s.school_id=en.school_id
        LEFT JOIN exam_marks m ON m.exam_subject_id=$7 AND m.student_id=s.id AND m.school_id=en.school_id
        WHERE en.school_id=$1 AND en.session_id=$2 AND en.class_id=$3 AND en.section_id=$4 AND en.status='active'
          AND ($5::uuid IS NULL OR en.branch_id=$5 OR en.branch_id IS NULL) ORDER BY s.full_name`,
        [req.auth.schoolId,sessionId,classId,sectionId,branchId,null,es.examSubjectId]);
      res.json({examSubject:es,students:students.rows});
    }catch(e){next(e)}finally{client.release()}
  });

  app.post('/api/teacher-marks', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const {examId,sessionId,classId,sectionId,studentId,marks,remarks=''}=req.body||{};
      if(!examId||!sessionId||!classId||!sectionId||!studentId)return res.status(400).json({error:'examId, sessionId, classId, sectionId and studentId are required'});
      const subject=await client.query(`SELECT es.id AS "examSubjectId",es.subject_id AS "subjectId",es.max_marks AS "maxMarks",e.status AS "examStatus"
        FROM exam_subjects es JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id
        WHERE es.school_id=$1 AND es.exam_id=$2 AND e.session_id=$3 AND es.class_id=$4 AND ($5::uuid IS NULL OR es.branch_id=$5 OR es.branch_id IS NULL) AND ($5::uuid IS NULL OR e.branch_id=$5 OR e.branch_id IS NULL) LIMIT 1`,
        [req.auth.schoolId,examId,sessionId,classId,req.auth.branchId||null]);
      if(!subject.rows.length)return res.status(404).json({error:'Exam subject not found'});
      const es=subject.rows[0];
      if(es.examStatus==='published')return res.status(409).json({error:'Published exam marks are locked'});
      if(!(await teacherMarkAccess(client,req.auth,examId,sessionId,classId,sectionId,es.subjectId)))return res.status(403).json({error:'You are not permitted to edit marks for this class, section and subject'});
      const enrolled=await client.query(`SELECT 1 FROM enrollments WHERE school_id=$1 AND student_id=$2 AND session_id=$3 AND class_id=$4 AND section_id=$5 AND status='active' AND ($6::uuid IS NULL OR branch_id=$6 OR branch_id IS NULL) LIMIT 1`,[req.auth.schoolId,studentId,sessionId,classId,sectionId,req.auth.branchId||null]);
      if(!enrolled.rows.length)return res.status(400).json({error:'Student is not enrolled in the selected class/section/session'});
      let value=null;if(marks!==null&&marks!==undefined&&marks!==''){value=Number(marks);if(!Number.isFinite(value)||value<0||value>Number(es.maxMarks))return res.status(400).json({error:`Marks must be between 0 and ${es.maxMarks}`})}
      const r=await client.query(`INSERT INTO exam_marks(school_id,branch_id,exam_subject_id,student_id,marks,remarks,entered_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(exam_subject_id,student_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,marks=EXCLUDED.marks,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by,updated_at=now() RETURNING id,marks,remarks,entered_by AS "enteredBy",branch_id AS "branchId"`,[req.auth.schoolId,req.auth.branchId||es.branchId||null,es.examSubjectId,studentId,value,String(remarks||'').slice(0,500),req.auth.sub]);
      await pool.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'exam_mark',$2,'update',$3::jsonb,$4)`,[req.auth.schoolId,r.rows[0].id,JSON.stringify({...r.rows[0],examSubjectId:es.examSubjectId,studentId}),req.auth.sub]);
      res.status(201).json({mark:r.rows[0]});
    }catch(e){next(e)}finally{client.release()}
  });

  app.get('/api/exam-results/student/:studentId', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`WITH enrolled AS (SELECT en.student_id,en.session_id,en.class_id,en.section_id FROM enrollments en JOIN sections sec ON sec.id=en.section_id AND sec.school_id=en.school_id JOIN classes c ON c.id=en.class_id AND c.school_id=en.school_id WHERE en.school_id=$1 AND en.student_id=$2 AND en.session_id=$3 AND en.status='active' AND ($4::uuid IS NULL OR en.branch_id=$4 OR en.branch_id IS NULL) AND ($4::uuid IS NULL OR c.branch_id=$4 OR c.branch_id IS NULL)) SELECT es.id AS "examSubjectId",e.id AS "examId",e.name AS "examName",e.status AS "examStatus",et.id AS "examTypeId",et.code AS "examTypeCode",et.name AS "examTypeName",s.id AS "subjectId",s.name AS "subjectName",es.class_id AS "classId",es.max_marks AS "maxMarks",es.pass_marks AS "passMarks",m.marks,m.grade,m.remarks,e.branch_id AS "branchId" FROM enrolled en JOIN exam_subjects es ON es.school_id=$1 AND es.class_id=en.class_id JOIN exams e ON e.id=es.exam_id AND e.school_id=$1 AND e.session_id=en.session_id JOIN exam_types et ON et.id=e.exam_type_id AND et.school_id=$1 JOIN subjects s ON s.id=es.subject_id AND s.school_id=$1 LEFT JOIN exam_marks m ON m.exam_subject_id=es.id AND m.student_id=en.student_id AND m.school_id=$1 WHERE ($4::uuid IS NULL OR es.branch_id=$4 OR es.branch_id IS NULL) AND ($4::uuid IS NULL OR e.branch_id=$4 OR e.branch_id IS NULL) AND ($5::uuid IS NULL OR et.id=$5) ORDER BY e.starts_on NULLS LAST,et.display_order,e.name,s.name`,[req.auth.schoolId,req.params.studentId,sessionId,branchId,examTypeId||null]);
      res.json({ results: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/exam-results/summary', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, examTypeId, classId, sectionId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`SELECT s.id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",c.name AS "className",sec.name AS "sectionName",COUNT(m.id)::int AS "subjectsMarked",COUNT(es.id)::int AS "subjectsTotal",COALESCE(SUM(m.marks),0) AS "marksObtained",COALESCE(SUM(es.max_marks),0) AS "maxMarks",CASE WHEN COALESCE(SUM(es.max_marks),0)>0 THEN ROUND(COALESCE(SUM(m.marks),0)*100.0/SUM(es.max_marks),2) ELSE 0 END AS percentage,CASE WHEN COUNT(es.id)>0 AND COUNT(m.id)=COUNT(es.id) THEN 'complete' ELSE 'pending' END AS status FROM enrollments en JOIN students s ON s.id=en.student_id AND s.school_id=en.school_id JOIN sections sec ON sec.id=en.section_id AND sec.school_id=en.school_id JOIN classes c ON c.id=en.class_id AND c.school_id=en.school_id JOIN exam_subjects es ON es.school_id=en.school_id AND es.class_id=en.class_id JOIN exams e ON e.id=es.exam_id AND e.school_id=en.school_id AND e.session_id=en.session_id LEFT JOIN exam_marks m ON m.exam_subject_id=es.id AND m.student_id=s.id AND m.school_id=en.school_id WHERE en.school_id=$1 AND en.session_id=$2 AND en.status='active' AND ($3::uuid IS NULL OR en.branch_id=$3 OR en.branch_id IS NULL) AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL) AND ($4::uuid IS NULL OR e.exam_type_id=$4) AND ($5::uuid IS NULL OR en.class_id=$5) AND ($6::uuid IS NULL OR en.section_id=$6) AND ($3::uuid IS NULL OR es.branch_id=$3 OR es.branch_id IS NULL) AND ($3::uuid IS NULL OR e.branch_id=$3 OR e.branch_id IS NULL) GROUP BY s.id,s.admission_no,s.full_name,c.name,sec.name,s.full_name ORDER BY c.name,sec.name,s.full_name`,[req.auth.schoolId,sessionId,branchId,examTypeId||null,classId||null,sectionId||null]);
      res.json({ results: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/exam-results/publish', authenticate, requireRoles(...publishRoles), async (req,res,next) => {try{const {examId}=req.body||{};if(!examId)return res.status(400).json({error:'examId is required'});const branchId=req.auth.branchId||null;const {rows}=await pool.query(`UPDATE exams SET status='published' WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL) RETURNING id,name,status,branch_id AS "branchId"`,[examId,req.auth.schoolId,branchId]);if(!rows.length)return res.status(404).json({error:'Exam not found for this school or branch'});res.json({exam:rows[0]})}catch(err){next(err)}});
  app.post('/api/exam-results/unpublish', authenticate, requireRoles(...publishRoles), async (req,res,next) => {try{const {examId}=req.body||{};if(!examId)return res.status(400).json({error:'examId is required'});const branchId=req.auth.branchId||null;const {rows}=await pool.query(`UPDATE exams SET status='completed' WHERE id=$1 AND school_id=$2 AND status='published' AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL) RETURNING id,name,status,branch_id AS "branchId"`,[examId,req.auth.schoolId,branchId]);if(!rows.length)return res.status(404).json({error:'Published exam not found for this school or branch'});res.json({exam:rows[0]})}catch(err){next(err)}});
}

module.exports = { registerExamResultRoutes };
