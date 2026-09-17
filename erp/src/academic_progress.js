const { authenticate, requireRoles } = require('./auth');

function registerAcademicProgressRoutes(app,pool){
  const managers=['super_admin','principal','admin','teacher'];

  app.get('/api/academic/syllabus',authenticate,requireRoles(...managers),async(req,res,next)=>{
    try{
      const {sessionId,classId,sectionId,subjectId}=req.query||{};
      if(!sessionId)return res.status(400).json({error:'sessionId is required'});
      const {rows}=await pool.query(
        `SELECT su.id,su.session_id AS "sessionId",su.class_id AS "classId",su.subject_id AS "subjectId",
                su.title,su.description,su.sequence_no AS "sequenceNo",su.status,
                sp.id AS "progressId",sp.section_id AS "sectionId",sp.progress_percent AS "progressPercent",
                sp.completed_at AS "completedAt",sp.notes AS "progressNotes"
         FROM syllabus_units su
         LEFT JOIN syllabus_progress sp ON sp.school_id=su.school_id AND sp.syllabus_unit_id=su.id
         WHERE su.school_id=$1 AND su.session_id=$2
           AND ($3::uuid IS NULL OR su.class_id=$3)
           AND ($4::uuid IS NULL OR sp.section_id=$4)
           AND ($5::uuid IS NULL OR su.subject_id=$5)
         ORDER BY su.sequence_no,su.title`,
        [req.auth.schoolId,sessionId,classId||null,sectionId||null,subjectId||null]
      );
      res.json({units:rows});
    }catch(err){next(err)}
  });

  app.post('/api/academic/syllabus',authenticate,requireRoles('super_admin','principal','admin'),async(req,res,next)=>{
    try{
      const b=req.body||{};
      if(!b.sessionId||!b.classId||!b.subjectId||!String(b.title||'').trim())return res.status(400).json({error:'sessionId, classId, subjectId and title are required'});
      const {rows}=await pool.query(
        `INSERT INTO syllabus_units(school_id,session_id,class_id,subject_id,title,description,sequence_no,status,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8)
         RETURNING id,session_id AS "sessionId",class_id AS "classId",subject_id AS "subjectId",title,description,sequence_no AS "sequenceNo",status`,
        [req.auth.schoolId,b.sessionId,b.classId,b.subjectId,String(b.title).trim(),b.description||null,Number(b.sequenceNo)||0,req.auth.sub]
      );
      res.status(201).json({unit:rows[0]});
    }catch(err){next(err)}
  });

  app.put('/api/academic/syllabus/:id/progress',authenticate,requireRoles(...managers),async(req,res,next)=>{
    try{
      const b=req.body||{};
      const percent=Number(b.progressPercent);
      if(!b.sessionId||!b.classId||!b.subjectId||!Number.isFinite(percent)||percent<0||percent>100)return res.status(400).json({error:'sessionId, classId, subjectId and progressPercent 0-100 are required'});
      let teacherId=null;
      if(req.auth.role==='teacher'){
        const permission=await pool.query(
          `SELECT ts.teacher_id AS "teacherId" FROM teacher_subjects ts JOIN teachers t ON t.id=ts.teacher_id AND t.school_id=ts.school_id
           WHERE ts.school_id=$1 AND t.user_id=$2 AND ts.session_id=$3 AND ts.subject_id=$4 AND ts.can_mark=true AND ts.status='active'
             AND ($5::uuid IS NULL OR ts.section_id=$5)
             AND ($6::uuid IS NULL OR ts.branch_id=$6 OR ts.branch_id IS NULL) LIMIT 1`,
          [req.auth.schoolId,req.auth.sub,b.sessionId,b.subjectId,b.sectionId||null,req.auth.branchId||null]
        );
        if(!permission.rowCount)return res.status(403).json({error:'Teacher is not assigned to this subject/section'});
        teacherId=permission.rows[0].teacherId;
      }
      const {rows}=await pool.query(
        `INSERT INTO syllabus_progress(school_id,session_id,syllabus_unit_id,teacher_id,class_id,section_id,subject_id,progress_percent,completed_at,notes,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8=100 THEN now() ELSE NULL END,$9,$10)
         ON CONFLICT(school_id,session_id,syllabus_unit_id,class_id,section_id,subject_id)
         DO UPDATE SET teacher_id=EXCLUDED.teacher_id,progress_percent=EXCLUDED.progress_percent,completed_at=EXCLUDED.completed_at,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now()
         RETURNING id,syllabus_unit_id AS "syllabusUnitId",section_id AS "sectionId",progress_percent AS "progressPercent",completed_at AS "completedAt",notes`,
        [req.auth.schoolId,b.sessionId,req.params.id,teacherId,b.classId,b.sectionId||null,b.subjectId,percent,b.notes||null,req.auth.sub]
      );
      await pool.query(
        `INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
         VALUES($1,'syllabus_progress',$2,'update',$3::jsonb,$4)`,
        [req.auth.schoolId,rows[0].id,JSON.stringify({syllabusUnitId:req.params.id,sessionId:b.sessionId,classId:b.classId,sectionId:b.sectionId||null,subjectId:b.subjectId,progressPercent:percent,notes:b.notes||null}),req.auth.sub]
      );
      res.json({progress:rows[0]});
    }catch(err){next(err)}
  });
}

module.exports={registerAcademicProgressRoutes};
