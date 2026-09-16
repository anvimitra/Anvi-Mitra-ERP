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
          AND ($7 <> 'teacher' OR EXISTS (
            SELECT 1
            FROM teacher_subjects ts
            JOIN teachers t ON t.id=ts.teacher_id AND t.school_id=ts.school_id
            WHERE ts.school_id=en.school_id AND t.user_id=$8
              AND ts.session_id=en.session_id AND ts.section_id=en.section_id
              AND ts.subject_id=es.subject_id AND ts.can_mark=true AND ts.status='active'
              AND (ts.branch_id IS NULL OR es.branch_id IS NULL OR ts.branch_id=es.branch_id)
          ))
        ORDER BY e.starts_on NULLS LAST,et.display_order,e.name,s.name`,
        [req.auth.schoolId,req.params.studentId,sessionId,branchId,examTypeId||null,examId||null,req.auth.role,req.auth.sub]);
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
          AND ($8 <> 'teacher' OR EXISTS (
            SELECT 1
            FROM teacher_subjects ts
            JOIN teachers t ON t.id=ts.teacher_id AND t.school_id=ts.school_id
            WHERE ts.school_id=en.school_id AND t.user_id=$9
              AND ts.session_id=en.session_id AND ts.section_id=en.section_id
              AND ts.subject_id=es.subject_id AND ts.can_mark=true AND ts.status='active'
              AND (ts.branch_id IS NULL OR es.branch_id IS NULL OR ts.branch_id=es.branch_id)
          ))
        GROUP BY s.id,s.admission_no,s.full_name,c.name,sec.name
        ORDER BY c.name,sec.name,s.full_name`,
        [req.auth.schoolId,sessionId,branchId,examTypeId||null,examId||null,classId||null,sectionId||null,req.auth.role,req.auth.sub]);
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

  app.post('/api/exam-results/calculate', authenticate, requireRoles(...publishRoles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { examId, gradeScaleId = null } = req.body || {};
      if (!examId) return res.status(400).json({ error: 'examId is required' });
      const branchId = req.auth.branchId || null;
      await client.query('BEGIN');

      const exam = await client.query(
        `SELECT id,session_id AS "sessionId",status,branch_id AS "branchId" FROM exams
         WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,
        [examId, req.auth.schoolId, branchId]
      );
      if (!exam.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({error:'Exam not found'}); }
      if (exam.rows[0].status === 'published') { await client.query('ROLLBACK'); return res.status(409).json({error:'Published exam cannot be recalculated'}); }

      const scaleQuery = gradeScaleId
        ? await client.query(`SELECT min_percentage,max_percentage,grade,grade_point,remark FROM grade_scales WHERE id=$1 AND school_id=$2 AND status='active'`,[gradeScaleId,req.auth.schoolId])
        : await client.query(`SELECT min_percentage,max_percentage,grade,grade_point,remark FROM grade_scales WHERE school_id=$1 AND status='active' ORDER BY min_percentage DESC`,[req.auth.schoolId]);
      const scales=scaleQuery.rows;
      const data=await client.query(
        `SELECT en.student_id AS "studentId",en.class_id AS "classId",en.section_id AS "sectionId",
                COUNT(es.id)::int AS "subjectsTotal",COUNT(m.id)::int AS "subjectsMarked",
                COALESCE(SUM(m.marks),0) AS "marksObtained",COALESCE(SUM(es.max_marks),0) AS "maxMarks"
         FROM enrollments en
         JOIN exam_subjects es ON es.school_id=en.school_id AND es.exam_id=$2 AND es.class_id=en.class_id
         LEFT JOIN exam_marks m ON m.school_id=en.school_id AND m.exam_subject_id=es.id AND m.student_id=en.student_id
         WHERE en.school_id=$1 AND en.session_id=$3 AND en.status='active'
           AND ($4::uuid IS NULL OR en.branch_id=$4 OR en.branch_id IS NULL)
           AND ($4::uuid IS NULL OR es.branch_id=$4 OR es.branch_id IS NULL)
         GROUP BY en.student_id,en.class_id,en.section_id
         ORDER BY en.class_id,en.section_id,en.student_id`,
        [req.auth.schoolId,examId,exam.rows[0].sessionId,branchId]
      );

      const calculated=data.rows.map(row=>{
        const max=Number(row.maxMarks||0), obtained=Number(row.marksObtained||0);
        const percentage=max>0?Number((obtained*100/max).toFixed(2)):0;
        const scale=scales.find(x=>percentage>=Number(x.min_percentage)&&percentage<=Number(x.max_percentage));
        return {...row,percentage,grade:scale?.grade||null};
      });

      const groups=new Map();
      for(const row of calculated){ const key=`${row.classId}:${row.sectionId||''}`; if(!groups.has(key))groups.set(key,[]); groups.get(key).push(row); }
      for(const rows of groups.values()){
        rows.sort((a,b)=>b.percentage-a.percentage);
        let rank=0,last=null;
        rows.forEach((row,i)=>{ if(last===null||row.percentage!==last)rank=i+1; row.rankPosition=rank; last=row.percentage; });
      }

      for(const row of calculated){
        await client.query(
          `INSERT INTO result_snapshots(school_id,exam_id,student_id,session_id,class_id,section_id,subjects_total,subjects_marked,marks_obtained,max_marks,percentage,grade,rank_position,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
           ON CONFLICT(school_id,exam_id,student_id) DO UPDATE SET subjects_total=EXCLUDED.subjects_total,subjects_marked=EXCLUDED.subjects_marked,marks_obtained=EXCLUDED.marks_obtained,max_marks=EXCLUDED.max_marks,percentage=EXCLUDED.percentage,grade=EXCLUDED.grade,rank_position=EXCLUDED.rank_position,calculated_at=now()`,
          [req.auth.schoolId,examId,row.studentId,exam.rows[0].sessionId,row.classId,row.sectionId,row.subjectsTotal,row.subjectsMarked,row.marksObtained,row.maxMarks,row.percentage,row.grade,row.rankPosition]
        );
      }
      await client.query('COMMIT');
      res.json({count:calculated.length,results:calculated});
    } catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}
    finally{client.release()}
  });

  app.get('/api/exam-results/published/:studentId', authenticate, requireRoles(...staffRoles), async (req,res,next)=>{
    try{
      const {sessionId,examId}=req.query||{};
      if(!sessionId) return res.status(400).json({error:'sessionId is required'});
      const {rows}=await pool.query(
        `SELECT rs.id,rs.exam_id AS "examId",rs.student_id AS "studentId",rs.subjects_total AS "subjectsTotal",
                rs.subjects_marked AS "subjectsMarked",rs.marks_obtained AS "marksObtained",rs.max_marks AS "maxMarks",
                rs.percentage,rs.grade,rs.rank_position AS "rankPosition",rs.published_at AS "publishedAt",
                e.name AS "examName"
         FROM result_snapshots rs JOIN exams e ON e.id=rs.exam_id AND e.school_id=rs.school_id
         WHERE rs.school_id=$1 AND rs.student_id=$2 AND rs.session_id=$3 AND rs.status='published'
           AND ($4::uuid IS NULL OR rs.exam_id=$4)
         ORDER BY e.starts_on NULLS LAST,e.name`,
        [req.auth.schoolId,req.params.studentId,sessionId,examId||null]
      );
      res.json({results:rows});
    }catch(err){next(err)}
  });

  app.post('/api/exam-results/publish-snapshot', authenticate, requireRoles(...publishRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try{
      const {examId}=req.body||{};
      if(!examId)return res.status(400).json({error:'examId is required'});
      await client.query('BEGIN');
      const exam=await client.query(`SELECT id FROM exams WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,[examId,req.auth.schoolId,req.auth.branchId||null]);
      if(!exam.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Exam not found'});}
      const updated=await client.query(`UPDATE result_snapshots SET status='published',published_at=now() WHERE school_id=$1 AND exam_id=$2 RETURNING id`,[req.auth.schoolId,examId]);
      if(!updated.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Calculate results before publishing'});}
      await client.query(`UPDATE exams SET status='published' WHERE id=$1 AND school_id=$2`,[examId,req.auth.schoolId]);
      await client.query('COMMIT');
      res.json({published:updated.rowCount});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}
    finally{client.release()}
  });

}

module.exports = { registerExamResultRoutes };
