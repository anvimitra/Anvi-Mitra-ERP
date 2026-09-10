const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function registerStudentEnrollmentRoutes(app, pool) {
  const staff = ['super_admin','principal','admin','office_staff'];

  app.get('/api/enrollment/masters', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const schoolId = req.auth.schoolId;
      const branchId = req.auth.branchId || null;
      const [branches,sessions,classes,sections,parents] = await Promise.all([
        pool.query(`SELECT id,name,code FROM branches WHERE school_id=$1 AND status='active' ORDER BY name`,[schoolId]),
        pool.query(`SELECT id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent" FROM academic_sessions WHERE school_id=$1 ORDER BY starts_on DESC`,[schoolId]),
        pool.query(`SELECT id,name,branch_id AS "branchId" FROM classes WHERE school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL) ORDER BY name`,[schoolId,branchId]),
        pool.query(`SELECT s.id,s.class_id AS "classId",s.name,c.name AS "className",c.branch_id AS "branchId" FROM sections s JOIN classes c ON c.id=s.class_id AND c.school_id=s.school_id WHERE s.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2 OR c.branch_id IS NULL) ORDER BY c.name,s.name`,[schoolId,branchId]),
        pool.query(`SELECT p.id,p.user_id AS "userId",p.full_name AS "fullName",p.phone,p.email,p.branch_id AS "branchId",b.name AS "branchName" FROM parents p LEFT JOIN branches b ON b.id=p.branch_id WHERE p.school_id=$1 AND p.status='active' AND ($2::uuid IS NULL OR p.branch_id=$2 OR p.branch_id IS NULL) ORDER BY p.full_name`,[schoolId,branchId])
      ]);
      res.json({branches:branches.rows,sessions:sessions.rows,classes:classes.rows,sections:sections.rows,parents:parents.rows});
    } catch(err){next(err)}
  });

  app.get('/api/enrollment/students', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);
      const params=[req.auth.schoolId];
      let branch='';
      if(req.auth.branchId){params.push(req.auth.branchId);branch=' AND (s.branch_id=$2 OR s.branch_id IS NULL)';}
      const {rows}=await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.date_of_birth AS "dateOfBirth",s.gender,s.photo_url AS "photoUrl",s.status,s.branch_id AS "branchId",b.name AS "branchName",e.id AS "enrollmentId",e.session_id AS "sessionId",a.name AS "sessionName",e.section_id AS "sectionId",c.name AS "className",sec.name AS "sectionName",e.roll_no AS "rollNo",COALESCE(json_agg(json_build_object('userId',p.user_id,'name',p.full_name,'relation',sp.relation,'isPrimary',sp.is_primary)) FILTER (WHERE p.id IS NOT NULL),'[]') AS parents FROM students s LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.status='active' LEFT JOIN academic_sessions a ON a.id=e.session_id LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id LEFT JOIN student_portal_profiles sp ON sp.student_id=s.id AND sp.school_id=s.school_id AND sp.status='active' LEFT JOIN parents p ON p.user_id=sp.user_id AND p.school_id=sp.school_id AND p.status='active' WHERE s.school_id=$1${branch} GROUP BY s.id,b.name,e.id,a.name,sec.name,c.name ORDER BY s.full_name LIMIT ${limit}` ,params);
      res.json({students:rows});
    } catch(err){next(err)}
  });

  app.post('/api/enrollment/students', authenticate, requireRoles(...staff), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const b=req.body||{};
      const name=String(b.fullName||'').trim();
      const admissionNo=String(b.admissionNo||'').trim();
      if(!name||!admissionNo||!b.sessionId||!b.sectionId)return res.status(400).json({error:'fullName, admissionNo, sessionId and sectionId are required'});
      const branchId=b.branchId||req.auth.branchId||null;
      await client.query('BEGIN');
      const valid=await client.query(`SELECT sec.id,sec.class_id AS "classId",c.branch_id AS "classBranchId" FROM sections sec JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id JOIN academic_sessions a ON a.school_id=sec.school_id WHERE sec.id=$1 AND sec.school_id=$2 AND a.id=$3 AND ($4::uuid IS NULL OR c.branch_id=$4 OR c.branch_id IS NULL)`,[b.sectionId,req.auth.schoolId,b.sessionId,branchId]);
      if(!valid.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Section or academic session is not valid for this school/branch'})}
      if(branchId&&valid.rows[0].classBranchId&&valid.rows[0].classBranchId!==branchId){await client.query('ROLLBACK');return res.status(403).json({error:'Selected class is outside the active branch'})}
      const existing=await client.query(`SELECT id FROM students WHERE school_id=$1 AND admission_no=$2`,[req.auth.schoolId,admissionNo]);
      let student;
      if(existing.rowCount){
        student=await client.query(`UPDATE students SET branch_id=COALESCE($3,branch_id),roll_no=$4,full_name=$5,date_of_birth=$6,gender=$7,photo_url=$8,status='active',updated_at=now() WHERE id=$1 AND school_id=$2 RETURNING id,admission_no AS "admissionNo",full_name AS "fullName",branch_id AS "branchId",status`,[existing.rows[0].id,req.auth.schoolId,branchId,b.rollNo||null,name,b.dateOfBirth||null,b.gender||null,b.photoUrl||null]);
      } else {
        student=await client.query(`INSERT INTO students(school_id,branch_id,admission_no,roll_no,full_name,date_of_birth,gender,photo_url,admission_date,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,'active') RETURNING id,admission_no AS "admissionNo",full_name AS "fullName",branch_id AS "branchId",status`,[req.auth.schoolId,branchId,admissionNo,b.rollNo||null,name,b.dateOfBirth||null,b.gender||null,b.photoUrl||null]);
      }
      const enrollment=await client.query(`INSERT INTO enrollments(school_id,branch_id,student_id,session_id,section_id,roll_no) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(student_id,session_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,section_id=EXCLUDED.section_id,roll_no=EXCLUDED.roll_no,status='active' RETURNING id,session_id AS "sessionId",section_id AS "sectionId",roll_no AS "rollNo",branch_id AS "branchId",status`,[req.auth.schoolId,branchId,student.rows[0].id,b.sessionId,b.sectionId,b.rollNo||null]);
      if(Array.isArray(b.parents)){
        for(const link of b.parents.slice(0,5)){
          if(!link.userId)continue;
          const user=await client.query(`SELECT id FROM users WHERE id=$1 AND school_id=$2 AND role='parent' AND status='active'`,[link.userId,req.auth.schoolId]);
          if(user.rowCount)await client.query(`INSERT INTO student_portal_profiles(school_id,student_id,user_id,relation,is_primary,status) VALUES($1,$2,$3,$4,$5,'active') ON CONFLICT(student_id,user_id) DO UPDATE SET relation=EXCLUDED.relation,is_primary=EXCLUDED.is_primary,status='active'`,[req.auth.schoolId,student.rows[0].id,link.userId,String(link.relation||'guardian').slice(0,40),Boolean(link.isPrimary)]);
        }
      }
      await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'student',$2,'create',$3::jsonb,$4)`,[req.auth.schoolId,student.rows[0].id,JSON.stringify({student:student.rows[0],enrollment:enrollment.rows[0]}),req.auth.sub]);
      await client.query('COMMIT');
      res.status(201).json({student:student.rows[0],enrollment:enrollment.rows[0]});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'Student admission number or enrollment already conflicts'});next(err)}finally{client.release()}
  });

  app.post('/api/enrollment/parents', authenticate, requireRoles(...staff), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const b=req.body||{};const name=String(b.fullName||'').trim();const email=String(b.email||'').trim().toLowerCase();const phone=String(b.phone||'').trim();const password=String(b.password||'');
      if(!name||(!email&&!phone)||password.length<6)return res.status(400).json({error:'fullName, email or phone, and password (min 6) are required'});
      const branchId=b.branchId||req.auth.branchId||null;await client.query('BEGIN');
      const u=await client.query(`INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,'parent','active') RETURNING id,email,phone,role,status,branch_id AS "branchId"`,[req.auth.schoolId,branchId,email||null,phone||null,await hashPassword(password)]);
      const p=await client.query(`INSERT INTO parents(school_id,branch_id,user_id,full_name,phone,email,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id,user_id AS "userId",full_name AS "fullName",phone,email,branch_id AS "branchId"`,[req.auth.schoolId,branchId,u.rows[0].id,name,phone||null,email||null]);
      await client.query('COMMIT');res.status(201).json({parent:p.rows[0]});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'Parent email or phone already exists'});next(err)}finally{client.release()}
  });
}
module.exports={registerStudentEnrollmentRoutes};
