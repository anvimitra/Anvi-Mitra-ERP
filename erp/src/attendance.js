const { authenticate, requireRoles } = require('./auth');

function registerAttendanceRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];

  app.get('/api/attendance', authenticate, async (req,res,next) => {
    try {
      const date = String(req.query.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date=YYYY-MM-DD is required' });
      const { rows } = await pool.query(`SELECT a.id,a.student_id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",a.attendance_date AS "date",a.status,a.note,a.branch_id AS "branchId",b.name AS "branchName" FROM attendance_records a JOIN students s ON s.id=a.student_id LEFT JOIN branches b ON b.id=a.branch_id WHERE a.school_id=$1 AND a.attendance_date=$2 AND ($3::uuid IS NULL OR a.branch_id=$3) ORDER BY s.full_name`, [req.auth.schoolId,date,req.auth.branchId || null]);
      res.json({ attendance: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/attendance', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { studentId, date, status, note = null } = req.body || {};
      const allowed = ['present','absent','late','half_day','leave'];
      if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !allowed.includes(status)) return res.status(400).json({ error: 'studentId, valid date and valid status are required' });
      const student = await pool.query('SELECT id,branch_id AS "branchId" FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3)', [studentId, req.auth.schoolId, req.auth.branchId || null]);
      if (!student.rowCount) return res.status(404).json({ error: 'Student not found in selected branch' });
      const branchId = student.rows[0].branchId || req.auth.branchId || null;
      const { rows } = await pool.query(`INSERT INTO attendance_records (school_id,session_id,student_id,attendance_date,status,note,marked_by,branch_id) SELECT $1,asess.id,$2,$3,$4,$5,$6,$7 FROM academic_sessions asess WHERE asess.school_id=$1 AND asess.is_current=true ON CONFLICT (school_id,student_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,branch_id=EXCLUDED.branch_id,updated_at=now() RETURNING id,student_id AS "studentId",attendance_date AS "date",status,note,branch_id AS "branchId"`, [req.auth.schoolId,studentId,date,status,note,req.auth.sub,branchId]);
      if (!rows.length) return res.status(409).json({ error: 'No current academic session configured for this school' });
      res.json({ attendance: rows[0] });
    } catch(err){ next(err); }
  });
}
module.exports = { registerAttendanceRoutes };
