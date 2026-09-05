const { authenticate, requireRoles } = require('./auth');

function registerMobileDashboardRoutes(app, pool) {
  const adminRoles=['super_admin','principal','admin'];
  app.get('/api/portal/me/teacher-overview', authenticate, requireRoles('teacher'), async (req,res,next)=>{
    try {
      const { rows }=await pool.query(`SELECT ts.section_id AS "sectionId",c.name AS "className",s.name AS "sectionName",su.name AS "subjectName",COUNT(DISTINCT e.student_id)::int AS "studentCount" FROM teacher_subjects ts JOIN sections s ON s.id=ts.section_id AND s.school_id=ts.school_id JOIN classes c ON c.id=s.class_id AND c.school_id=ts.school_id JOIN subjects su ON su.id=ts.subject_id AND su.school_id=ts.school_id LEFT JOIN enrollments e ON e.section_id=ts.section_id AND e.school_id=ts.school_id AND e.status='active' WHERE ts.school_id=$1 AND ts.teacher_id=(SELECT id FROM teachers WHERE user_id=$2 AND school_id=$1 LIMIT 1) AND ($3::uuid IS NULL OR ts.branch_id=$3) GROUP BY ts.section_id,c.name,s.name,su.name ORDER BY c.name,s.name,su.name`,[req.auth.schoolId,req.auth.userId,req.auth.branchId||null]);
      const studentCount=rows.reduce((n,r)=>n+Number(r.studentCount||0),0);
      res.json({sections:rows,studentCount});
    } catch(err){next(err);}
  });
  app.get('/api/portal/me/admin-overview', authenticate, requireRoles(...adminRoles), async (req,res,next)=>{
    try {
      const [students,teachers,attendance,fees]=await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS n FROM students WHERE school_id=$1 AND status='active' AND ($2::uuid IS NULL OR branch_id=$2)`,[req.auth.schoolId,req.auth.branchId||null]),
        pool.query(`SELECT COUNT(*)::int AS n FROM teachers WHERE school_id=$1 AND status='active' AND ($2::uuid IS NULL OR branch_id=$2)`,[req.auth.schoolId,req.auth.branchId||null]),
        pool.query(`SELECT COALESCE(ROUND(100.0*COUNT(*) FILTER(WHERE status='present')/NULLIF(COUNT(*),0),1),0) AS n FROM attendance_records WHERE school_id=$1 AND attendance_date=CURRENT_DATE AND ($2::uuid IS NULL OR branch_id=$2)`,[req.auth.schoolId,req.auth.branchId||null]),
        pool.query(`SELECT COALESCE(SUM(balance_amount),0) AS n FROM fee_invoices WHERE school_id=$1 AND status IN ('open','partially_paid','overdue') AND ($2::uuid IS NULL OR branch_id=$2)`,[req.auth.schoolId,req.auth.branchId||null])
      ]);
      res.json({stats:{studentCount:students.rows[0].n,teacherCount:teachers.rows[0].n,attendancePercent:Number(attendance.rows[0].n),outstanding:Number(fees.rows[0].n)}});
    } catch(err){next(err);}
  });
}
module.exports={registerMobileDashboardRoutes};
