const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function registerPeopleRoutes(app, pool) {
  const staff = ['super_admin','principal','admin','office_staff'];
  app.get('/api/students', authenticate, requireRoles(...staff,'teacher'), async (req,res,next)=>{
    try {
      const { rows } = await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.roll_no AS "rollNo",s.full_name AS "fullName",s.date_of_birth AS "dateOfBirth",s.gender,s.photo_url AS "photoUrl",s.status,s.branch_id AS "branchId",b.name AS "branchName" FROM students s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.school_id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2) ORDER BY s.full_name`, [req.auth.schoolId, req.auth.branchId || null]);
      res.json({ students: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/teachers', authenticate, requireRoles(...staff), async (req,res,next)=>{
    try {
      const { rows } = await pool.query(`SELECT t.id,t.user_id AS "userId",t.employee_code AS "employeeCode",t.full_name AS "fullName",t.phone,t.joining_date AS "joiningDate",t.status,t.branch_id AS "branchId",b.name AS "branchName" FROM teachers t LEFT JOIN branches b ON b.id=t.branch_id WHERE t.school_id=$1 AND ($2::uuid IS NULL OR t.branch_id=$2) ORDER BY t.full_name`, [req.auth.schoolId, req.auth.branchId || null]);
      res.json({ teachers: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/teachers', authenticate, requireRoles(...staff), async (req,res,next)=>{
    const client=await pool.connect();
    try {
      const { fullName, employeeCode, email=null, phone=null, password, joiningDate=null } = req.body || {};
      if(!fullName || !String(fullName).trim()) return res.status(400).json({error:'fullName is required'});
      if(!employeeCode || !String(employeeCode).trim()) return res.status(400).json({error:'employeeCode is required'});
      if(!password || String(password).length < 6) return res.status(400).json({error:'password must be at least 6 characters'});
      if(!email && !phone) return res.status(400).json({error:'email or phone is required'});
      const branchId=req.auth.branchId||null;
      await client.query('BEGIN');
      const user=await client.query(`INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,'teacher','active') RETURNING id,email,phone,role,status,branch_id AS "branchId"`,[req.auth.schoolId,branchId,email?String(email).trim().toLowerCase():null,phone?String(phone).trim():null,await hashPassword(String(password))]);
      const teacher=await client.query(`INSERT INTO teachers(school_id,branch_id,user_id,employee_code,full_name,phone,joining_date,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id,user_id AS "userId",employee_code AS "employeeCode",full_name AS "fullName",phone,joining_date AS "joiningDate",status,branch_id AS "branchId"`,[req.auth.schoolId,branchId,user.rows[0].id,String(employeeCode).trim(),String(fullName).trim(),phone?String(phone).trim():null,joiningDate]);
      await client.query('COMMIT');
      res.status(201).json({teacher:teacher.rows[0],user:user.rows[0]});
    } catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'Teacher employee code, email or phone already exists'});next(err)} finally {client.release()}
  });

  app.get('/api/parents', authenticate, requireRoles(...staff), async (req,res,next)=>{
    try {
      const { rows } = await pool.query(`SELECT p.id,p.full_name AS "fullName",p.phone,p.email,p.branch_id AS "branchId",b.name AS "branchName" FROM parents p LEFT JOIN branches b ON b.id=p.branch_id WHERE p.school_id=$1 AND ($2::uuid IS NULL OR p.branch_id=$2) ORDER BY p.full_name`, [req.auth.schoolId, req.auth.branchId || null]);
      res.json({ parents: rows });
    } catch(err){ next(err); }
  });
}
module.exports = { registerPeopleRoutes };
