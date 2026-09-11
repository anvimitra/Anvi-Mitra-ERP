const { authenticate, requireRoles } = require('./auth');

function registerAcademicMasterRoutes(app, pool) {
  const managers = ['super_admin','principal','admin'];

  app.get('/api/academic/master', authenticate, requireRoles(...managers), async (req, res, next) => {
    try {
      const schoolId = req.auth.schoolId;
      const branchId = req.auth.branchId || null;
      const [sessions, classes, sections, subjects] = await Promise.all([
        pool.query(
          `SELECT id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent",status
           FROM academic_sessions WHERE school_id=$1 ORDER BY starts_on DESC`, [schoolId]
        ),
        pool.query(
          `SELECT id,name,code,branch_id AS "branchId",status
           FROM classes WHERE school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL)
           ORDER BY name`, [schoolId, branchId]
        ),
        pool.query(
          `SELECT s.id,s.class_id AS "classId",s.name,s.code,s.status,c.name AS "className",c.branch_id AS "branchId"
           FROM sections s JOIN classes c ON c.id=s.class_id AND c.school_id=s.school_id
           WHERE s.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2 OR c.branch_id IS NULL)
           ORDER BY c.name,s.name`, [schoolId, branchId]
        ),
        pool.query(
          `SELECT id,name,code,status FROM subjects WHERE school_id=$1 ORDER BY name`, [schoolId]
        )
      ]);
      res.json({sessions:sessions.rows,classes:classes.rows,sections:sections.rows,subjects:subjects.rows});
    } catch (err) { next(err); }
  });

  app.post('/api/academic/sessions', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b=req.body||{};
      const name=String(b.name||'').trim();
      if(!name || !b.startsOn || !b.endsOn) return res.status(400).json({error:'name, startsOn and endsOn are required'});
      const {rows}=await pool.query(
        `INSERT INTO academic_sessions(school_id,name,starts_on,ends_on,is_current,status)
         VALUES($1,$2,$3,$4,$5,'active')
         RETURNING id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent",status`,
        [req.auth.schoolId,name,b.startsOn,b.endsOn,Boolean(b.isCurrent)]
      );
      if(b.isCurrent) await pool.query(`UPDATE academic_sessions SET is_current=false WHERE school_id=$1 AND id<>$2`,[req.auth.schoolId,rows[0].id]);
      res.status(201).json({session:rows[0]});
    } catch(err){if(err.code==='23505')return res.status(409).json({error:'Academic session already exists'});next(err)}
  });

  app.post('/api/academic/classes', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b=req.body||{}; const name=String(b.name||'').trim(); const code=String(b.code||name).trim().toUpperCase(); const branchId=b.branchId||req.auth.branchId||null;
      if(!name)return res.status(400).json({error:'name is required'});
      if(branchId){const q=await pool.query(`SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,[branchId,req.auth.schoolId]);if(!q.rowCount)return res.status(400).json({error:'Invalid branch'})}
      const {rows}=await pool.query(`INSERT INTO classes(school_id,branch_id,name,code,status) VALUES($1,$2,$3,$4,'active') RETURNING id,name,code,branch_id AS "branchId",status`,[req.auth.schoolId,branchId,name,code]);
      res.status(201).json({class:rows[0]});
    } catch(err){if(err.code==='23505')return res.status(409).json({error:'Class code/name already exists'});next(err)}
  });

  app.post('/api/academic/sections', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b=req.body||{}; const name=String(b.name||'').trim(); const code=String(b.code||name).trim().toUpperCase();
      if(!name||!b.classId)return res.status(400).json({error:'name and classId are required'});
      const valid=await pool.query(`SELECT id,branch_id AS "branchId" FROM classes WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,[b.classId,req.auth.schoolId,req.auth.branchId||null]);
      if(!valid.rowCount)return res.status(404).json({error:'Class not found in current school/branch'});
      const {rows}=await pool.query(`INSERT INTO sections(school_id,class_id,name,code,status) VALUES($1,$2,$3,$4,'active') RETURNING id,class_id AS "classId",name,code,status`,[req.auth.schoolId,b.classId,name,code]);
      res.status(201).json({section:rows[0]});
    } catch(err){if(err.code==='23505')return res.status(409).json({error:'Section already exists'});next(err)}
  });

  app.post('/api/academic/subjects', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b=req.body||{}; const name=String(b.name||'').trim(); const code=String(b.code||name).trim().toUpperCase();
      if(!name)return res.status(400).json({error:'name is required'});
      const {rows}=await pool.query(`INSERT INTO subjects(school_id,name,code,status) VALUES($1,$2,$3,'active') RETURNING id,name,code,status`,[req.auth.schoolId,name,code]);
      res.status(201).json({subject:rows[0]});
    } catch(err){if(err.code==='23505')return res.status(409).json({error:'Subject code/name already exists'});next(err)}
  });
}

module.exports={registerAcademicMasterRoutes};
