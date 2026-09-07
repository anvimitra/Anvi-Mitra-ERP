const { authenticate, requireRoles } = require('./auth');

function registerPortalRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','office_staff'];

  app.post('/api/portal/student-link', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { studentId, userId, relation=null, isPrimary=false } = req.body || {};
      if (!studentId || !userId) return res.status(400).json({ error: 'studentId and userId are required' });
      const { rows } = await pool.query(`INSERT INTO student_portal_profiles (school_id,student_id,user_id,relation,is_primary) SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM students WHERE id=$2 AND school_id=$1) AND EXISTS (SELECT 1 FROM users WHERE id=$3 AND school_id=$1) ON CONFLICT (student_id,user_id) DO UPDATE SET relation=EXCLUDED.relation,is_primary=EXCLUDED.is_primary,status='active' RETURNING id,student_id AS "studentId",user_id AS "userId",relation,is_primary AS "isPrimary",status`, [req.auth.schoolId,studentId,userId,relation,isPrimary]);
      if (!rows.length) return res.status(404).json({ error: 'Student or user not found for this school' });
      res.status(201).json({ link: rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/portal/me/students', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.photo_url AS "photoUrl",e.section_id AS "sectionId",c.name AS "className",sec.name AS "sectionName" FROM student_portal_profiles p JOIN students s ON s.id=p.student_id AND s.school_id=p.school_id LEFT JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE p.school_id=$1 AND p.user_id=$2 AND p.status='active' ORDER BY s.full_name`, [req.auth.schoolId,req.auth.sub]);
      res.json({ students: rows });
    } catch(err){ next(err); }
  });
}
module.exports = { registerPortalRoutes };
