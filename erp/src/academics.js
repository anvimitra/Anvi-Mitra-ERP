const { authenticate, requireRoles } = require('./auth');

function registerAcademicRoutes(app, pool) {
  const managers = ['super_admin','principal','admin'];
  const staff = [...managers, 'teacher'];

  app.get('/api/academic-calendar', authenticate, async (req,res,next) => {
    try {
      const {rows} = await pool.query("SELECT id,title,event_type AS \"eventType\",starts_at AS \"startsAt\",ends_at AS \"endsAt\",description,branch_id AS \"branchId\",status FROM academic_calendar_events WHERE school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL) ORDER BY starts_at", [req.auth.schoolId,req.auth.branchId||null]);
      res.json({items:rows});
    } catch(e){next(e)}
  });

  app.post('/api/academic-calendar', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b=req.body||{}; if(!b.title||!b.startsAt) return res.status(400).json({error:'title and startsAt are required'});
      const branchId=b.branchId||req.auth.branchId||null;
      if(branchId){const q=await pool.query("SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'",[branchId,req.auth.schoolId]);if(!q.rowCount)return res.status(400).json({error:'Invalid branch'});}
      const {rows}=await pool.query("INSERT INTO academic_calendar_events(school_id,branch_id,title,event_type,starts_at,ends_at,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[req.auth.schoolId,branchId,String(b.title).trim(),b.eventType||'academic',b.startsAt,b.endsAt||null,b.description||null,req.auth.sub]);
      res.status(201).json({item:rows[0]});
    } catch(e){next(e)}
  });

  app.get('/api/homework', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const {rows}=await pool.query("SELECT h.*,c.name AS \"className\",sec.name AS \"sectionName\",sub.name AS \"subjectName\" FROM homework_assignments h LEFT JOIN classes c ON c.id=h.class_id AND c.school_id=h.school_id LEFT JOIN sections sec ON sec.id=h.section_id AND sec.school_id=h.school_id LEFT JOIN subjects sub ON sub.id=h.subject_id AND sub.school_id=h.school_id WHERE h.school_id=$1 AND ($2::uuid IS NULL OR h.branch_id=$2 OR h.branch_id IS NULL) ORDER BY h.due_at NULLS LAST,h.created_at DESC",[req.auth.schoolId,req.auth.branchId||null]);
      res.json({items:rows});
    } catch(e){next(e)}
  });

  app.post('/api/homework', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const b=req.body||{}; if(!b.title||!b.sessionId||!b.classId||!b.subjectId)return res.status(400).json({error:'title, sessionId, classId and subjectId are required'});
      const branchId=b.branchId||req.auth.branchId||null; let teacherId=b.teacherId||null;
      if(req.auth.role==='teacher'){
        const t=await pool.query("SELECT id FROM teachers WHERE user_id=$1 AND school_id=$2 AND status='active'",[req.auth.sub,req.auth.schoolId]);
        if(!t.rowCount)return res.status(403).json({error:'Teacher profile not found'}); teacherId=t.rows[0].id;
        const p=await pool.query("SELECT 1 FROM teacher_subjects ts JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=ts.school_id WHERE ts.school_id=$1 AND ts.teacher_id=$2 AND ts.session_id=$3 AND ts.subject_id=$4 AND sec.class_id=$5 AND ts.status='active' AND ($6::uuid IS NULL OR ts.branch_id=$6 OR ts.branch_id IS NULL) LIMIT 1",[req.auth.schoolId,teacherId,b.sessionId,b.subjectId,b.classId,branchId]);
        if(!p.rowCount)return res.status(403).json({error:'Teacher is not assigned to this class/subject/session'});
      }
      const {rows}=await pool.query("INSERT INTO homework_assignments(school_id,branch_id,class_id,section_id,subject_id,teacher_id,title,description,assigned_at,due_at,attachments,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()),$10,$11,'published') RETURNING *",[req.auth.schoolId,branchId,b.classId,b.sectionId||null,b.subjectId,teacherId,String(b.title).trim(),b.description||null,b.assignedAt||null,b.dueAt||null,JSON.stringify(b.attachments||[])]);
      res.status(201).json({item:rows[0]});
    } catch(e){next(e)}
  });

  app.get('/api/study-materials', authenticate, async (req,res,next) => {
    try {
      const q=req.query||{}; const {rows}=await pool.query("SELECT * FROM study_materials WHERE school_id=$1 AND ($2::uuid IS NULL OR session_id=$2) AND ($3::uuid IS NULL OR class_id=$3) AND ($4::uuid IS NULL OR section_id=$4) AND ($5::uuid IS NULL OR subject_id=$5) ORDER BY published_at DESC",[req.auth.schoolId,q.sessionId||null,q.classId||null,q.sectionId||null,q.subjectId||null]);
      res.json({items:rows});
    } catch(e){next(e)}
  });

  app.post('/api/study-materials', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const b=req.body||{}; if(!b.title||!b.sessionId)return res.status(400).json({error:'title and sessionId are required'});
      let teacherId=b.teacherId||null;
      if(req.auth.role==='teacher'){
        const t=await pool.query("SELECT id FROM teachers WHERE user_id=$1 AND school_id=$2 AND status='active'",[req.auth.sub,req.auth.schoolId]);if(!t.rowCount)return res.status(403).json({error:'Teacher profile not found'});teacherId=t.rows[0].id;
        if(b.classId&&b.subjectId){const p=await pool.query("SELECT 1 FROM teacher_subjects ts JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=ts.school_id WHERE ts.school_id=$1 AND ts.teacher_id=$2 AND ts.session_id=$3 AND ts.subject_id=$4 AND sec.class_id=$5 AND ts.status='active' AND ($6::uuid IS NULL OR ts.branch_id=$6 OR ts.branch_id IS NULL) LIMIT 1",[req.auth.schoolId,teacherId,b.sessionId,b.subjectId,b.classId,req.auth.branchId||null]);if(!p.rowCount)return res.status(403).json({error:'Teacher is not assigned to this class/subject/session'});}
      }
      const {rows}=await pool.query("INSERT INTO study_materials(school_id,session_id,class_id,section_id,subject_id,teacher_id,title,description,resource_url,attachments,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published') RETURNING *",[req.auth.schoolId,b.sessionId,b.classId||null,b.sectionId||null,b.subjectId||null,teacherId,String(b.title).trim(),b.description||null,b.resourceUrl||null,JSON.stringify(b.attachments||[])]);
      res.status(201).json({item:rows[0]});
    } catch(e){next(e)}
  });

  app.get('/api/homework/submissions', authenticate, async (req,res,next) => {
    try { const q=req.query||{}; const {rows}=await pool.query("SELECT hs.*,h.title AS \"homeworkTitle\",s.full_name AS \"studentName\" FROM homework_submissions hs JOIN homework_assignments h ON h.id=hs.homework_id AND h.school_id=hs.school_id JOIN students s ON s.id=hs.student_id AND s.school_id=hs.school_id WHERE hs.school_id=$1 AND ($2::uuid IS NULL OR hs.homework_id=$2) AND ($3::uuid IS NULL OR hs.student_id=$3) ORDER BY hs.submitted_at DESC",[req.auth.schoolId,q.homeworkId||null,q.studentId||null]); res.json({items:rows}); } catch(e){next(e)}
  });
}
module.exports={registerAcademicRoutes};