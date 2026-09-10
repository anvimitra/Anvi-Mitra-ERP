const { authenticate, requireRoles } = require('./auth');

function registerTeacherPermissionRoutes(app, pool) {
  app.get('/api/teacher-permissions/marks', authenticate, async (req, res, next) => {
    try {
      const examSubjectId = String(req.query.examSubjectId || '').trim();
      if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required' });
      if (['super_admin', 'principal', 'admin'].includes(req.auth.role)) {
        return res.json({ allowed: true, reason: 'school-wide-administrator' });
      }
      if (req.auth.role !== 'teacher') {
        return res.json({ allowed: false, reason: 'role-not-allowed' });
      }
      const result = await pool.query(
        'SELECT teacher_can_edit_exam_subject($1,$2) AS allowed',
        [req.auth.sub, examSubjectId]
      );
      res.json({ allowed: Boolean(result.rows[0]?.allowed), reason: result.rows[0]?.allowed ? 'assigned-subject-class' : 'teacher-assignment-mismatch' });
    } catch (err) { next(err); }
  });

  app.post('/api/teacher-permissions/marks/check-batch', authenticate, requireRoles('super_admin','principal','admin','teacher'), async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.examSubjectIds) ? req.body.examSubjectIds.map(String).filter(Boolean).slice(0, 500) : [];
      if (!ids.length) return res.json({ permissions: [] });
      if (['super_admin', 'principal', 'admin'].includes(req.auth.role)) {
        return res.json({ permissions: ids.map(examSubjectId => ({ examSubjectId, allowed: true, reason: 'school-wide-administrator' })) });
      }
      const result = await pool.query(
        `SELECT x.exam_subject_id, teacher_can_edit_exam_subject($1,x.exam_subject_id) AS allowed
         FROM unnest($2::uuid[]) AS x(exam_subject_id)`,
        [req.auth.sub, ids]
      );
      res.json({ permissions: result.rows.map(row => ({ examSubjectId: row.exam_subject_id, allowed: Boolean(row.allowed), reason: row.allowed ? 'assigned-subject-class' : 'teacher-assignment-mismatch' })) });
    } catch (err) { next(err); }
  });
}

module.exports = { registerTeacherPermissionRoutes };
