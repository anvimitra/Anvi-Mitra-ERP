const { authenticate, requireRoles } = require('./auth');

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
      const { rows } = await pool.query(`SELECT t.id,t.employee_code AS "employeeCode",t.full_name AS "fullName",t.phone,t.joining_date AS "joiningDate",t.status,t.branch_id AS "branchId",b.name AS "branchName" FROM teachers t LEFT JOIN branches b ON b.id=t.branch_id WHERE t.school_id=$1 AND ($2::uuid IS NULL OR t.branch_id=$2) ORDER BY t.full_name`, [req.auth.schoolId, req.auth.branchId || null]);
      res.json({ teachers: rows });
    } catch(err){ next(err); }
  });
  app.get('/api/parents', authenticate, requireRoles(...staff), async (req,res,next)=>{
    try {
      const { rows } = await pool.query(`SELECT p.id,p.full_name AS "fullName",p.phone,p.email,p.branch_id AS "branchId",b.name AS "branchName" FROM parents p LEFT JOIN branches b ON b.id=p.branch_id WHERE p.school_id=$1 AND ($2::uuid IS NULL OR p.branch_id=$2) ORDER BY p.full_name`, [req.auth.schoolId, req.auth.branchId || null]);
      res.json({ parents: rows });
    } catch(err){ next(err); }
  });
}
module.exports = { registerPeopleRoutes };
