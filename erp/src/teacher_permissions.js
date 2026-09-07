const { authenticate, requireRoles } = require('./auth');

function schoolGuard(req,res,next){
  if(!req.auth?.schoolId) return res.status(403).json({error:'School context required'});
  next();
}

function registerTeacherPermissionRoutes(app,pool){
  const admins=requireRoles('super_admin','principal','admin');

  app.get('/api/teacher-permissions',authenticate,schoolGuard,admins,async(req,res,next)=>{
    try{
      const r=await pool.query(`SELECT p.id,p.teacher_user_id AS "teacherUserId",u.email,u.phone,u.role,
        p.class_id AS "classId",c.name AS "className",p.section_id AS "sectionId",sec.name AS "sectionName",
        p.subject_id AS "subjectId",sub.name AS "subjectName",p.session_id AS "sessionId",s.name AS "sessionName",
        p.branch_id AS "branchId",b.name AS "branchName",p.can_view AS "canView",p.can_edit_marks AS "canEditMarks"
        FROM teacher_class_subject_permissions p
        JOIN users u ON u.id=p.teacher_user_id AND u.school_id=p.school_id
        JOIN classes c ON c.id=p.class_id AND c.school_id=p.school_id
        JOIN sections sec ON sec.id=p.section_id AND sec.school_id=p.school_id
        JOIN subjects sub ON sub.id=p.subject_id AND sub.school_id=p.school_id
        JOIN academic_sessions s ON s.id=p.session_id AND s.school_id=p.school_id
        LEFT JOIN branches b ON b.id=p.branch_id AND b.school_id=p.school_id
        WHERE p.school_id=$1 ORDER BY c.name,sec.name,sub.name,u.email`,[req.auth.schoolId]);
      res.json({permissions:r.rows});
    }catch(e){next(e)}
  });

  app.post('/api/teacher-permissions',authenticate,schoolGuard,admins,async(req,res,next)=>{
    try{
      const {teacherUserId,classId,sectionId,subjectId,sessionId,branchId=null,canView=true,canEditMarks=true}=req.body||{};
      if(!teacherUserId||!classId||!sectionId||!subjectId||!sessionId) return res.status(400).json({error:'teacherUserId, classId, sectionId, subjectId and sessionId are required'});
      const checks=await pool.query(`SELECT
        EXISTS(SELECT 1 FROM users WHERE id=$1 AND school_id=$6 AND role='teacher' AND status='active') teacher_ok,
        EXISTS(SELECT 1 FROM classes WHERE id=$2 AND school_id=$6) class_ok,
        EXISTS(SELECT 1 FROM sections WHERE id=$3 AND class_id=$2 AND school_id=$6) section_ok,
        EXISTS(SELECT 1 FROM subjects WHERE id=$4 AND school_id=$6) subject_ok,
        EXISTS(SELECT 1 FROM academic_sessions WHERE id=$5 AND school_id=$6) session_ok,
        ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM branches WHERE id=$7 AND school_id=$6)) branch_ok`,[teacherUserId,classId,sectionId,subjectId,sessionId,req.auth.schoolId,branchId]);
      const ok=checks.rows[0];
      if(!ok.teacher_ok)return res.status(400).json({error:'Active teacher from this school is required'});
      if(!ok.class_ok||!ok.section_ok)return res.status(400).json({error:'Class/section does not belong to this school'});
      if(!ok.subject_ok)return res.status(400).json({error:'Subject does not belong to this school'});
      if(!ok.session_ok)return res.status(400).json({error:'Academic session does not belong to this school'});
      if(!ok.branch_ok)return res.status(400).json({error:'Branch does not belong to this school'});
      const r=await pool.query(`INSERT INTO teacher_class_subject_permissions(school_id,teacher_user_id,class_id,section_id,subject_id,session_id,branch_id,can_view,can_edit_marks)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(school_id,teacher_user_id,class_id,section_id,subject_id,session_id)
        DO UPDATE SET branch_id=EXCLUDED.branch_id,can_view=EXCLUDED.can_view,can_edit_marks=EXCLUDED.can_edit_marks,updated_at=now()
        RETURNING id`,[req.auth.schoolId,teacherUserId,classId,sectionId,subjectId,sessionId,branchId,Boolean(canView),Boolean(canEditMarks)]);
      res.status(201).json({id:r.rows[0].id});
    }catch(e){next(e)}
  });

  app.delete('/api/teacher-permissions/:id',authenticate,schoolGuard,admins,async(req,res,next)=>{
    try{
      const r=await pool.query('DELETE FROM teacher_class_subject_permissions WHERE id=$1 AND school_id=$2 RETURNING id',[req.params.id,req.auth.schoolId]);
      if(!r.rows.length)return res.status(404).json({error:'Permission assignment not found'});
      res.json({deleted:true,id:r.rows[0].id});
    }catch(e){next(e)}
  });

  app.get('/api/teacher-permissions/check',authenticate,schoolGuard,async(req,res,next)=>{
    try{
      if(req.auth.role!=='teacher')return res.json({allowed:true,reason:'school-wide-role'});
      const {classId,sectionId,subjectId,sessionId}=req.query||{};
      if(!classId||!sectionId||!subjectId||!sessionId)return res.status(400).json({error:'classId, sectionId, subjectId and sessionId are required'});
      const r=await pool.query(`SELECT can_view AS "canView",can_edit_marks AS "canEditMarks"
        FROM teacher_class_subject_permissions
        WHERE school_id=$1 AND teacher_user_id=$2 AND class_id=$3 AND section_id=$4 AND subject_id=$5 AND session_id=$6
          AND can_view=true
          AND (branch_id IS NULL OR branch_id=$7)
        LIMIT 1`,[req.auth.schoolId,req.auth.sub,classId,sectionId,subjectId,sessionId,req.auth.branchId||null]);
      res.json({allowed:Boolean(r.rows.length),canView:Boolean(r.rows[0]?.canView),canEditMarks:Boolean(r.rows[0]?.canEditMarks)});
    }catch(e){next(e)}
  });
}
module.exports={registerTeacherPermissionRoutes};
