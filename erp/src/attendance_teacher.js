const { authenticate, requireRoles } = require('./auth');

function registerTeacherAttendanceRoutes(app, pool) {
  app.get('/api/attendance/my-sections', authenticate, requireRoles('teacher'), async (req,res,next) => {
    try {
      const sessionId=req.query.sessionId ? String(req.query.sessionId) : null;
      const { rows } = await pool.query(`
        SELECT cta.id AS "assignmentId",cta.section_id AS "sectionId",sec.name AS "sectionName",
               c.id AS "classId",c.name AS "className",cta.session_id AS "sessionId",a.name AS "sessionName",
               cta.branch_id AS "branchId",COUNT(e.student_id)::int AS "studentCount"
        FROM class_teacher_assignments cta
        JOIN teachers t ON t.id=cta.teacher_id AND t.school_id=cta.school_id AND t.user_id=$2
        JOIN sections sec ON sec.id=cta.section_id AND sec.school_id=cta.school_id
        JOIN classes c ON c.id=sec.class_id AND c.school_id=cta.school_id
        JOIN academic_sessions a ON a.id=cta.session_id AND a.school_id=cta.school_id
        LEFT JOIN enrollments e ON e.section_id=sec.id AND e.session_id=cta.session_id AND e.school_id=cta.school_id AND e.status='active'
        WHERE cta.school_id=$1
          AND ($3::uuid IS NULL OR cta.session_id=$3)
          AND ($4::uuid IS NULL OR cta.branch_id=$4)
        GROUP BY cta.id,cta.section_id,sec.name,c.id,c.name,cta.session_id,a.name,cta.branch_id,a.starts_on
        ORDER BY a.starts_on DESC,c.name,sec.name`,
        [req.auth.schoolId,req.auth.sub,sessionId,req.auth.branchId||null]);
      res.json({ sections: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/attendance/my-students', authenticate, requireRoles('teacher'), async (req,res,next) => {
    try {
      const sessionId=req.query.sessionId ? String(req.query.sessionId) : null;
      const sectionId=req.query.sectionId ? String(req.query.sectionId) : null;
      const { rows } = await pool.query(`
        SELECT s.id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",
               e.session_id AS "sessionId",e.section_id AS "sectionId",sec.name AS "sectionName",
               c.id AS "classId",c.name AS "className",s.branch_id AS "branchId"
        FROM class_teacher_assignments cta
        JOIN teachers t ON t.id=cta.teacher_id AND t.school_id=cta.school_id AND t.user_id=$2
        JOIN enrollments e ON e.section_id=cta.section_id AND e.session_id=cta.session_id AND e.school_id=cta.school_id AND e.status='active'
        JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id
        JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
        JOIN classes c ON c.id=sec.class_id AND c.school_id=e.school_id
        WHERE cta.school_id=$1
          AND ($3::uuid IS NULL OR e.session_id=$3)
          AND ($4::uuid IS NULL OR e.section_id=$4)
          AND ($5::uuid IS NULL OR cta.branch_id=$5)
        ORDER BY c.name,sec.name,s.full_name`,
        [req.auth.schoolId,req.auth.sub,sessionId,sectionId,req.auth.branchId||null]);
      res.json({ students: rows });
    } catch(err){ next(err); }
  });
}

module.exports={ registerTeacherAttendanceRoutes };
