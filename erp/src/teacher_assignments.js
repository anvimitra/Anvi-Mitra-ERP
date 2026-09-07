const { authenticate, requireRoles } = require('./auth');

function registerTeacherAssignmentRoutes(app, pool) {
  const staff = ['super_admin','principal','admin','office_staff'];

  app.get('/api/teacher-assignments', authenticate, requireRoles(...staff,'teacher'), async (req,res,next) => {
    try {
      const { rows } = await pool.query(`
        SELECT ts.id,ts.teacher_id AS "teacherId",t.full_name AS "teacherName",
               ts.subject_id AS "subjectId",su.name AS "subjectName",
               ts.section_id AS "sectionId",c.name AS "className",s.name AS "sectionName",
               ts.session_id AS "sessionId",a.name AS "sessionName",
               ts.branch_id AS "branchId",b.name AS "branchName"
        FROM teacher_subjects ts
        JOIN teachers t ON t.id=ts.teacher_id AND t.school_id=ts.school_id
        JOIN subjects su ON su.id=ts.subject_id AND su.school_id=ts.school_id
        JOIN sections s ON s.id=ts.section_id AND s.school_id=ts.school_id
        JOIN classes c ON c.id=s.class_id AND c.school_id=ts.school_id
        JOIN academic_sessions a ON a.id=ts.session_id AND a.school_id=ts.school_id
        LEFT JOIN branches b ON b.id=ts.branch_id
        WHERE ts.school_id=$1 AND ($2::uuid IS NULL OR ts.branch_id=$2)
        ORDER BY a.starts_on DESC,c.name,s.name,su.name,t.full_name`, [req.auth.schoolId,req.auth.branchId || null]);
      res.json({ assignments: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/class-teacher-assignments', authenticate, requireRoles(...staff,'teacher'), async (req,res,next) => {
    try {
      const sessionId=req.query.sessionId ? String(req.query.sessionId) : null;
      const { rows } = await pool.query(`
        SELECT cta.id,cta.teacher_id AS "teacherId",t.full_name AS "teacherName",
               cta.section_id AS "sectionId",sec.name AS "sectionName",
               c.id AS "classId",c.name AS "className",cta.session_id AS "sessionId",
               a.name AS "sessionName",cta.branch_id AS "branchId"
        FROM class_teacher_assignments cta
        JOIN teachers t ON t.id=cta.teacher_id AND t.school_id=cta.school_id
        JOIN sections sec ON sec.id=cta.section_id AND sec.school_id=cta.school_id
        JOIN classes c ON c.id=sec.class_id AND c.school_id=cta.school_id
        JOIN academic_sessions a ON a.id=cta.session_id AND a.school_id=cta.school_id
        WHERE cta.school_id=$1
          AND ($2::uuid IS NULL OR cta.session_id=$2)
          AND ($3::uuid IS NULL OR cta.branch_id=$3)
          AND ($4::uuid IS NULL OR cta.teacher_id=(SELECT teacher_id FROM users WHERE id=$4 AND school_id=$1))
        ORDER BY a.starts_on DESC,c.name,sec.name`,
        [req.auth.schoolId,sessionId,req.auth.branchId || null,req.auth.role==='teacher'?req.auth.sub:null]);
      res.json({ assignments: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/class-teacher-assignments', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const { teacherId, sectionId, sessionId } = req.body || {};
      if (!teacherId || !sectionId || !sessionId) return res.status(400).json({ error:'teacherId, sectionId and sessionId are required' });
      const { rows } = await pool.query(`
        SELECT t.branch_id AS "teacherBranchId",c.branch_id AS "classBranchId",s.class_id AS "classId"
        FROM teachers t
        JOIN sections s ON s.id=$2 AND s.school_id=t.school_id
        JOIN classes c ON c.id=s.class_id AND c.school_id=t.school_id
        JOIN academic_sessions a ON a.id=$3 AND a.school_id=t.school_id
        WHERE t.id=$1 AND t.school_id=$4`, [teacherId,sectionId,sessionId,req.auth.schoolId]);
      if (!rows.length) return res.status(404).json({ error:'Teacher, section or session not found for this school' });
      const branchId = rows[0].classBranchId || rows[0].teacherBranchId || req.auth.branchId || null;
      if (req.auth.branchId && branchId !== req.auth.branchId) return res.status(403).json({ error:'Section is outside the selected branch' });
      if (rows[0].teacherBranchId && rows[0].classBranchId && rows[0].teacherBranchId !== rows[0].classBranchId) return res.status(409).json({ error:'Teacher and class belong to different branches' });
      const result = await pool.query(`
        INSERT INTO class_teacher_assignments(school_id,teacher_id,section_id,session_id,branch_id)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(school_id,section_id,session_id) DO UPDATE SET
          teacher_id=EXCLUDED.teacher_id,branch_id=EXCLUDED.branch_id,updated_at=now()
        RETURNING id,teacher_id AS "teacherId",section_id AS "sectionId",session_id AS "sessionId",branch_id AS "branchId"`,
        [req.auth.schoolId,teacherId,sectionId,sessionId,branchId]);
      res.status(201).json({ assignment: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.delete('/api/class-teacher-assignments/:id', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const result=await pool.query('DELETE FROM class_teacher_assignments WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3)',[req.params.id,req.auth.schoolId,req.auth.branchId||null]);
      if(!result.rowCount) return res.status(404).json({error:'Class teacher assignment not found'});
      res.status(204).end();
    } catch(err){next(err);}
  });

  app.post('/api/teacher-assignments', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const { teacherId, subjectId, sectionId, sessionId } = req.body || {};
      if (!teacherId || !subjectId || !sectionId || !sessionId) return res.status(400).json({ error:'teacherId, subjectId, sectionId and sessionId are required' });
      const { rows } = await pool.query(`
        SELECT t.branch_id AS "teacherBranchId",c.branch_id AS "classBranchId"
        FROM teachers t
        JOIN subjects su ON su.id=$2 AND su.school_id=t.school_id
        JOIN sections s ON s.id=$3 AND s.school_id=t.school_id
        JOIN classes c ON c.id=s.class_id AND c.school_id=t.school_id
        JOIN academic_sessions a ON a.id=$4 AND a.school_id=t.school_id
        WHERE t.id=$1 AND t.school_id=$5`, [teacherId,subjectId,sectionId,sessionId,req.auth.schoolId]);
      if (!rows.length) return res.status(404).json({ error:'Teacher, subject, section or session not found for this school' });
      const branchId = rows[0].classBranchId || rows[0].teacherBranchId || req.auth.branchId || null;
      if (req.auth.branchId && branchId !== req.auth.branchId) return res.status(403).json({ error:'Teacher and section are outside the selected branch' });
      if (rows[0].teacherBranchId && rows[0].classBranchId && rows[0].teacherBranchId !== rows[0].classBranchId) return res.status(409).json({ error:'Teacher and class belong to different branches' });
      const result = await pool.query(`
        INSERT INTO teacher_subjects(school_id,branch_id,teacher_id,subject_id,section_id,session_id)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(teacher_id,subject_id,section_id,session_id) DO UPDATE SET school_id=EXCLUDED.school_id,branch_id=EXCLUDED.branch_id
        RETURNING id,teacher_id AS "teacherId",subject_id AS "subjectId",section_id AS "sectionId",session_id AS "sessionId",branch_id AS "branchId"`,
        [req.auth.schoolId,branchId,teacherId,subjectId,sectionId,sessionId]);
      res.status(201).json({ assignment: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.delete('/api/teacher-assignments/:id', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const result = await pool.query('DELETE FROM teacher_subjects WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3)', [req.params.id,req.auth.schoolId,req.auth.branchId || null]);
      if (!result.rowCount) return res.status(404).json({ error:'Assignment not found in selected branch' });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}

module.exports = { registerTeacherAssignmentRoutes };
