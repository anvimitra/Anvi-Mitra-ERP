const { authenticate, requireRoles } = require('./auth');

function registerTeacherAssignmentRoutes(app,pool){
 const managers=['super_admin','principal','admin'];
 app.get('/api/teacher-assignments',authenticate,requireRoles(...managers),async(req,res,next)=>{try{
  const branch=req.auth.branchId||null;
  const {rows}=await pool.query(`SELECT ts.id,ts.teacher_id AS "teacherId",u.email,u.phone,ts.session_id AS "sessionId",a.name AS "sessionName",
    ts.section_id AS "sectionId",c.id AS "classId",c.name AS "className",sec.name AS "sectionName",
    ts.subject_id AS "subjectId",sub.name AS "subjectName",ts.branch_id AS "branchId",b.name AS "branchName",
    ts.can_mark AS "canMark",ts.can_attendance AS "canAttendance",ts.status
    FROM teacher_subjects ts JOIN teachers t ON t.id=ts.teacher_id AND t.school_id=ts.school_id
    JOIN users u ON u.id=t.user_id AND u.school_id=t.school_id
    JOIN academic_sessions a ON a.id=ts.session_id AND a.school_id=ts.school_id
    JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=ts.school_id
    JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
    JOIN subjects sub ON sub.id=ts.subject_id AND sub.school_id=ts.school_id
    LEFT JOIN branches b ON b.id=ts.branch_id
    WHERE ts.school_id=$1 AND ($2::uuid IS NULL OR ts.branch_id=$2 OR ts.branch_id IS NULL)
    ORDER BY u.email,a.starts_on DESC,c.name,sec.name,sub.name`,[req.auth.schoolId,branch]);
  res.json({assignments:rows});
 }catch(e){next(e)}});

 app.get('/api/teacher-assignments/masters',authenticate,requireRoles(...managers),async(req,res,next)=>{try{
  const sid=req.auth.schoolId,bid=req.auth.branchId||null;
  const [teachers,sessions,sections,subjects]=await Promise.all([
   pool.query(`SELECT t.id,u.email,u.phone,t.branch_id AS "branchId",b.name AS "branchName" FROM teachers t JOIN users u ON u.id=t.user_id LEFT JOIN branches b ON b.id=t.branch_id WHERE t.school_id=$1 AND t.status='active' AND ($2::uuid IS NULL OR t.branch_id=$2 OR t.branch_id IS NULL) ORDER BY u.email`,[sid,bid]),
   pool.query(`SELECT id,name,starts_on AS "startsOn",is_current AS "isCurrent" FROM academic_sessions WHERE school_id=$1 ORDER BY starts_on DESC`,[sid]),
   pool.query(`SELECT sec.id,sec.name,c.id AS "classId",c.name AS "className",c.branch_id AS "branchId" FROM sections sec JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id WHERE sec.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2 OR c.branch_id IS NULL) ORDER BY c.name,sec.name`,[sid,bid]),
   pool.query(`SELECT id,name,code FROM subjects WHERE school_id=$1 ORDER BY name`,[sid])
  ]);
  res.json({teachers:teachers.rows,sessions:sessions.rows,sections:sections.rows,subjects:subjects.rows});
 }catch(e){next(e)}});

 app.post('/api/teacher-assignments',authenticate,requireRoles(...managers),async(req,res,next)=>{try{
  const {teacherId,sessionId,sectionId,subjectId,branchId=null,canMark=true,canAttendance=true}=req.body||{};
  if(!teacherId||!sessionId||!sectionId||!subjectId)return res.status(400).json({error:'teacherId, sessionId, sectionId and subjectId are required'});
  const effectiveBranch=branchId||req.auth.branchId||null;
  const check=await pool.query(`SELECT t.id FROM teachers t
    JOIN users u ON u.id=t.user_id AND u.school_id=t.school_id
    JOIN sections sec ON sec.id=$3 AND sec.school_id=t.school_id
    JOIN classes c ON c.id=sec.class_id AND c.school_id=t.school_id
    JOIN academic_sessions a ON a.id=$2 AND a.school_id=t.school_id
    JOIN subjects s ON s.id=$4 AND s.school_id=t.school_id
    WHERE t.id=$1 AND t.school_id=$5 AND t.status='active' AND u.role='teacher'
      AND ($6::uuid IS NULL OR c.branch_id=$6 OR c.branch_id IS NULL)`,
    [teacherId,sessionId,sectionId,subjectId,req.auth.schoolId,effectiveBranch]);
  if(!check.rowCount)return res.status(400).json({error:'Teacher, class/section, subject or session is invalid for this school/branch'});
  const {rows}=await pool.query(`INSERT INTO teacher_subjects(school_id,branch_id,teacher_id,session_id,section_id,subject_id,can_mark,can_attendance,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active')
    ON CONFLICT(teacher_id,session_id,section_id,subject_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,can_mark=EXCLUDED.can_mark,can_attendance=EXCLUDED.can_attendance,status='active',updated_at=now()
    RETURNING id,teacher_id AS "teacherId",session_id AS "sessionId",section_id AS "sectionId",subject_id AS "subjectId",branch_id AS "branchId",can_mark AS "canMark",can_attendance AS "canAttendance",status`,
    [req.auth.schoolId,effectiveBranch,teacherId,sessionId,sectionId,subjectId,Boolean(canMark),Boolean(canAttendance)]);
  await pool.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'teacher_assignment',$2,'create',$3::jsonb,$4)`,
    [req.auth.schoolId,rows[0].id,JSON.stringify(rows[0]),req.auth.sub]);
  res.status(201).json({assignment:rows[0]});
 }catch(e){next(e)}});

 app.patch('/api/teacher-assignments/:id',authenticate,requireRoles(...managers),async(req,res,next)=>{try{
  const sets=[],vals=[];
  for(const [k,col] of [['canMark','can_mark'],['canAttendance','can_attendance'],['status','status']])
    if(Object.prototype.hasOwnProperty.call(req.body||{},k)){vals.push(req.body[k]);sets.push(col+'=$'+vals.length)}
  if(!sets.length)return res.status(400).json({error:'No supported fields supplied'});
  vals.push(req.params.id,req.auth.schoolId);
  const {rows}=await pool.query(`UPDATE teacher_subjects SET ${sets.join(',')},updated_at=now()
    WHERE id=$${vals.length-1} AND school_id=$${vals.length}
    RETURNING id,teacher_id AS "teacherId",session_id AS "sessionId",section_id AS "sectionId",subject_id AS "subjectId",branch_id AS "branchId",can_mark AS "canMark",can_attendance AS "canAttendance",status`,vals);
  if(!rows.length)return res.status(404).json({error:'Assignment not found'});
  res.json({assignment:rows[0]});
 }catch(e){next(e)}});
}
module.exports={registerTeacherAssignmentRoutes};
