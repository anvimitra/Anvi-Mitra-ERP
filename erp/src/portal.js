const { authenticate, requireRoles } = require('./auth');

function registerPortalRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','office_staff'];
  const parentRoles = ['parent'];

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
      const { rows } = await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.photo_url AS "photoUrl",e.section_id AS "sectionId",c.name AS "className",sec.name AS "sectionName" FROM student_portal_profiles p JOIN students s ON s.id=p.student_id AND s.school_id=p.school_id LEFT JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.status='active' LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE p.school_id=$1 AND p.user_id=$2 AND p.status='active' ORDER BY s.full_name`, [req.auth.schoolId,req.auth.sub]);
      res.json({ students: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/portal/me/overview', authenticate, requireRoles(...parentRoles), async (req,res,next) => {
    try {
      const { rows: students } = await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.photo_url AS "photoUrl",e.section_id AS "sectionId",e.session_id AS "sessionId",e.branch_id AS "branchId",c.name AS "className",sec.name AS "sectionName" FROM student_portal_profiles p JOIN students s ON s.id=p.student_id AND s.school_id=p.school_id LEFT JOIN LATERAL (SELECT e.* FROM enrollments e WHERE e.student_id=s.id AND e.school_id=s.school_id AND e.status='active' ORDER BY e.created_at DESC NULLS LAST LIMIT 1) e ON true LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE p.school_id=$1 AND p.user_id=$2 AND p.status='active' ORDER BY s.full_name`, [req.auth.schoolId,req.auth.sub]);
      const overview = await Promise.all(students.map(async (s) => {
        const branchId = s.branchId || req.auth.branchId || null;
        const [fees, attendance, homework] = await Promise.all([
          pool.query(`SELECT COALESCE(SUM(GREATEST(0,i.balance_amount)),0) AS "outstandingAmount",COUNT(*) FILTER (WHERE i.balance_amount>0)::int AS "openInvoices",COALESCE(SUM(i.paid_amount),0) AS "paidAmount" FROM fee_invoices i WHERE i.school_id=$1 AND i.student_id=$2 AND i.status IN('unpaid','partial','paid') AND ($3::uuid IS NULL OR i.branch_id=$3 OR i.branch_id IS NULL)`, [req.auth.schoolId,s.id,branchId]),
          pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE a.status='present')::int AS present,COUNT(*) FILTER (WHERE a.status='absent')::int AS absent,COUNT(*) FILTER (WHERE a.status='late')::int AS late,COUNT(*) FILTER (WHERE a.status='half_day')::int AS "halfDay",COUNT(*) FILTER (WHERE a.status='leave')::int AS leave FROM attendance_records a WHERE a.school_id=$1 AND a.student_id=$2 AND a.attendance_date >= CURRENT_DATE - INTERVAL '30 days' AND ($3::uuid IS NULL OR a.branch_id=$3 OR a.branch_id IS NULL)`, [req.auth.schoolId,s.id,branchId]),
          s.sectionId ? pool.query(`SELECT h.id,h.title,h.description,h.assigned_on AS "assignedOn",h.due_on AS "dueOn",h.attachment_url AS "attachmentUrl",h.status,su.name AS "subjectName" FROM homework h JOIN subjects su ON su.id=h.subject_id WHERE h.school_id=$1 AND h.section_id=$2 AND ($3::uuid IS NULL OR h.branch_id=$3 OR h.branch_id IS NULL) ORDER BY h.due_on DESC NULLS LAST,h.created_at DESC LIMIT 5`, [req.auth.schoolId,s.sectionId,branchId]) : Promise.resolve({rows:[]})
        ]);
        const a=attendance.rows[0]||{total:0,present:0,absent:0,late:0,halfDay:0,leave:0};
        const attendancePercent=Number(a.total)?Number(((Number(a.present)+Number(a.late)*0.5+Number(a.halfDay)*0.5)/Number(a.total)*100).toFixed(2)):0;
        return {...s,fees:fees.rows[0]||{outstandingAmount:0,openInvoices:0,paidAmount:0},attendance:{...a,attendancePercent},homework:homework.rows};
      }));
      res.json({students:overview});
    } catch(err){ next(err); }
  });
}
module.exports = { registerPortalRoutes };
