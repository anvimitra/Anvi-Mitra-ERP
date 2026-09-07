const { authenticate, requireRoles } = require('./auth');

function registerAttendanceReportRoutes(app, pool) {
  const roles = ['super_admin','principal','admin','teacher'];

  app.get('/api/attendance/report', authenticate, requireRoles(...roles), async (req,res,next) => {
    try {
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || from).trim();
      const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
      const sectionId = req.query.sectionId ? String(req.query.sectionId) : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({error:'Valid from/to dates are required'});
      const params=[req.auth.schoolId,from,to,sessionId,sectionId,req.auth.branchId||null,req.auth.sub];
      const teacherClause=req.auth.role==='teacher'?`AND EXISTS (SELECT 1 FROM teacher_subjects ts JOIN users tu ON tu.teacher_id=ts.teacher_id WHERE ts.school_id=$1 AND ts.section_id=e.section_id AND ts.session_id=e.session_id AND tu.id=$7 AND ($6::uuid IS NULL OR ts.branch_id=$6 OR ts.branch_id IS NULL))`:'';
      const {rows}=await pool.query(`
        SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",c.name AS "className",sec.name AS "sectionName",
               COUNT(a.id)::int AS marked,
               COUNT(*) FILTER(WHERE a.status='present')::int AS present,
               COUNT(*) FILTER(WHERE a.status='absent')::int AS absent,
               COUNT(*) FILTER(WHERE a.status='late')::int AS late,
               COUNT(*) FILTER(WHERE a.status='half_day')::int AS "halfDay",
               COUNT(*) FILTER(WHERE a.status='leave')::int AS leave,
               COUNT(a.id)::int AS recordedDays,
               ROUND((COUNT(a.id) FILTER(WHERE a.status IN ('present','late','half_day'))::numeric / NULLIF(COUNT(a.id),0))*100,2) AS "attendancePercent"
        FROM enrollments e JOIN students s ON s.id=e.student_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id
        LEFT JOIN attendance_records a ON a.school_id=e.school_id AND a.student_id=e.student_id AND a.attendance_date BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR a.session_id=$4) AND ($6::uuid IS NULL OR a.branch_id=$6 OR a.branch_id IS NULL)
        WHERE e.school_id=$1 AND e.status='active' AND ($4::uuid IS NULL OR e.session_id=$4) AND ($5::uuid IS NULL OR e.section_id=$5)
          AND ($6::uuid IS NULL OR e.branch_id=$6 OR e.branch_id IS NULL OR c.branch_id=$6 OR c.branch_id IS NULL)
          AND ($6::uuid IS NULL OR s.branch_id=$6 OR s.branch_id IS NULL) ${teacherClause}
        GROUP BY s.id,s.admission_no,s.full_name,c.name,sec.name ORDER BY c.name,sec.name,s.full_name`,params);
      res.json({from,to,sessionId,sectionId,report:rows});
    } catch(err){next(err);}
  });
}
module.exports={registerAttendanceReportRoutes};
