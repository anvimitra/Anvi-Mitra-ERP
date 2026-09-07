const { authenticate } = require('./auth');

function registerReportCardContextRoutes(app, pool) {
  app.get('/api/report-card/:id/context', authenticate, async (req,res,next) => {
    try {
      const branchId = req.auth.branchId || null;
      const card = await pool.query(`
        SELECT rc.id, rc.student_id AS "studentId", rc.session_id AS "sessionId",
               s.admission_no AS "admissionNo", s.full_name AS "fullName", s.photo_url AS "photoUrl",
               ses.name AS "sessionName", e.section_id AS "sectionId",
               sec.name AS "sectionName", cls.id AS "classId", cls.name AS "className"
        FROM report_cards rc
        JOIN students s ON s.id=rc.student_id
        JOIN academic_sessions ses ON ses.id=rc.session_id
        LEFT JOIN enrollments e ON e.student_id=rc.student_id AND e.session_id=rc.session_id
        LEFT JOIN sections sec ON sec.id=e.section_id
        LEFT JOIN classes cls ON cls.id=sec.class_id
        WHERE rc.id=$1 AND rc.school_id=$2
          AND ($3::uuid IS NULL OR rc.branch_id=$3 OR rc.branch_id IS NULL)
        LIMIT 1`, [req.params.id, req.auth.schoolId, branchId]);
      if (!card.rowCount) return res.status(404).json({error:'Report card not found for this school or branch'});
      const c = card.rows[0];
      const parents = await pool.query(`
        SELECT p.full_name AS "fullName", p.phone, p.email, sp.relation
        FROM student_parents sp JOIN parents p ON p.id=sp.parent_id
        WHERE sp.student_id=$1 AND p.school_id=$2 AND p.status='active'
        ORDER BY sp.is_primary DESC,p.full_name`, [c.studentId, req.auth.schoolId]);
      const attendance = await pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM attendance_records
        WHERE school_id=$1 AND student_id=$2 AND session_id=$3
        GROUP BY status`, [req.auth.schoolId, c.studentId, c.sessionId]);
      const summary = {present:0,absent:0,late:0,halfDay:0,leave:0,total:0};
      for (const r of attendance.rows) { const k=r.status==='half_day'?'halfDay':r.status; summary[k]=Number(r.count); summary.total+=Number(r.count); }
      const classSection = c.className ? `${c.className}${c.sectionName ? ' • '+c.sectionName : ''}` : null;
      res.json({student:{id:c.studentId,admissionNo:c.admissionNo,fullName:c.fullName,photoUrl:c.photoUrl,classId:c.classId,sectionId:c.sectionId,className:c.className,sectionName:c.sectionName,classSection,sessionName:c.sessionName},parents:parents.rows,attendance:summary});
    } catch(err) { next(err); }
  });
}
module.exports = { registerReportCardContextRoutes };
