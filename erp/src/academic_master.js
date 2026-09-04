const { authenticate, requireRoles } = require('./auth');

function registerAcademicMasterRoutes(app, pool) {
  const staff = ['super_admin','principal','admin'];

  app.get('/api/academic-structure', authenticate, async (req,res,next) => {
    try {
      const [classes, sections, subjects, sessions] = await Promise.all([
        pool.query(`SELECT c.id,c.name,c.branch_id AS "branchId",b.name AS "branchName" FROM classes c LEFT JOIN branches b ON b.id=c.branch_id WHERE c.school_id=$1 ORDER BY c.name`, [req.auth.schoolId]),
        pool.query(`SELECT s.id,s.name,s.class_id AS "classId",c.name AS "className",c.branch_id AS "branchId" FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.school_id=$1 ORDER BY c.name,s.name`, [req.auth.schoolId]),
        pool.query(`SELECT id,name,code FROM subjects WHERE school_id=$1 ORDER BY name`, [req.auth.schoolId]),
        pool.query(`SELECT id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent" FROM academic_sessions WHERE school_id=$1 ORDER BY starts_on DESC`, [req.auth.schoolId])
      ]);
      res.json({ classes: classes.rows, sections: sections.rows, subjects: subjects.rows, sessions: sessions.rows });
    } catch(err){ next(err); }
  });

  app.post('/api/classes', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const { name, branchId=null } = req.body || {};
      if(!name || !String(name).trim()) return res.status(400).json({error:'Class name is required'});
      if(branchId){ const ok=await pool.query('SELECT 1 FROM branches WHERE id=$1 AND school_id=$2',[branchId,req.auth.schoolId]); if(!ok.rowCount) return res.status(400).json({error:'Branch does not belong to this school'}); }
      const {rows}=await pool.query(`INSERT INTO classes(school_id,name,branch_id) VALUES($1,$2,$3) RETURNING id,name,branch_id AS "branchId"`,[req.auth.schoolId,String(name).trim(),branchId]);
      res.status(201).json({class:rows[0]});
    }catch(err){next(err);}
  });

  app.post('/api/sections', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const { name,classId }=req.body||{};
      if(!name||!classId) return res.status(400).json({error:'name and classId are required'});
      const ok=await pool.query('SELECT 1 FROM classes WHERE id=$1 AND school_id=$2',[classId,req.auth.schoolId]);
      if(!ok.rowCount) return res.status(404).json({error:'Class not found'});
      const {rows}=await pool.query(`INSERT INTO sections(school_id,class_id,name) VALUES($1,$2,$3) RETURNING id,name,class_id AS "classId"`,[req.auth.schoolId,classId,String(name).trim()]);
      res.status(201).json({section:rows[0]});
    }catch(err){next(err);}
  });

  app.post('/api/subjects', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const { name,code=null }=req.body||{};
      if(!name||!String(name).trim()) return res.status(400).json({error:'Subject name is required'});
      const {rows}=await pool.query(`INSERT INTO subjects(school_id,name,code) VALUES($1,$2,$3) RETURNING id,name,code`,[req.auth.schoolId,String(name).trim(),code?String(code).trim().toUpperCase():null]);
      res.status(201).json({subject:rows[0]});
    }catch(err){next(err);}
  });

  app.post('/api/academic-sessions', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const {name,startsOn,endsOn,isCurrent=false}=req.body||{};
      if(!name||!startsOn||!endsOn) return res.status(400).json({error:'name, startsOn and endsOn are required'});
      const client=await pool.connect();
      try{await client.query('BEGIN');if(Boolean(isCurrent)) await client.query('UPDATE academic_sessions SET is_current=false WHERE school_id=$1',[req.auth.schoolId]);const {rows}=await client.query(`INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current) VALUES($1,$2,$3,$4,$5) RETURNING id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent"`,[req.auth.schoolId,String(name).trim(),startsOn,endsOn,Boolean(isCurrent)]);await client.query('COMMIT');res.status(201).json({session:rows[0]});}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }catch(err){next(err);}
  });
}
module.exports={registerAcademicMasterRoutes};
