const { authenticate, requireRoles } = require('./auth');
const { generateReportCard } = require('./reportcard_engine');

function registerReportCardBulkRoutes(app, pool) {
  const managerRoles = ['super_admin','principal','admin'];
  const staffRoles = ['super_admin','principal','admin','teacher'];

  app.post('/api/report-card/generate-bulk', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { sessionId, configId, classId = null, sectionId = null, studentIds = null } = req.body || {};
      if (!sessionId || !configId) return res.status(400).json({ error: 'sessionId and configId are required' });
      if (studentIds !== null && (!Array.isArray(studentIds) || studentIds.length === 0)) return res.status(400).json({ error: 'studentIds must be a non-empty array when provided' });
      if (studentIds && studentIds.length > 500) return res.status(400).json({ error: 'Maximum 500 students per bulk generation request' });
      if (classId && sectionId) {
        const section = await pool.query(`SELECT s.id FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=$1 AND c.id=$2 AND s.school_id=$3 AND c.school_id=$3`, [sectionId, classId, req.auth.schoolId]);
        if (!section.rowCount) return res.status(400).json({ error: 'Section does not belong to the selected class' });
      }

      let ids = studentIds;
      if (!ids) {
        const params = [req.auth.schoolId, sessionId, req.auth.branchId || null];
        const filters = ['e.school_id=$1','e.session_id=$2','e.is_active=true','($3::uuid IS NULL OR e.branch_id=$3 OR e.branch_id IS NULL)'];
        if (classId) { params.push(classId); filters.push(`sec.class_id=$${params.length}`); }
        if (sectionId) { params.push(sectionId); filters.push(`e.section_id=$${params.length}`); }
        const result = await pool.query(`SELECT DISTINCT e.student_id AS id FROM enrollments e JOIN sections sec ON sec.id=e.section_id WHERE ${filters.join(' AND ')} ORDER BY e.student_id LIMIT 501`, params);
        if (result.rows.length > 500) return res.status(400).json({ error: 'Selection exceeds the 500 student limit. Filter by class or section.' });
        ids = result.rows.map(r => r.id);
      }
      if (!ids.length) return res.json({ generatedIds: [], generatedCount: 0, skippedCount: 0, errors: [] });

      const uniqueIds = [...new Set(ids)];
      const generatedIds = [], errors = [];
      await client.query('BEGIN');
      for (const studentId of uniqueIds) {
        await client.query('SAVEPOINT report_card_student');
        try {
          const result = await generateReportCard({ client, auth: req.auth, studentId, sessionId, configId });
          generatedIds.push(result.reportCardId);
          await client.query('RELEASE SAVEPOINT report_card_student');
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT report_card_student').catch(() => {});
          await client.query('RELEASE SAVEPOINT report_card_student').catch(() => {});
          errors.push({ studentId, error: error.message || 'Generation failed', statusCode: error.statusCode || 500 });
        }
      }
      await client.query('COMMIT');
      res.status(201).json({ generatedIds, generatedCount: generatedIds.length, skippedCount: errors.length, errors });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally { client.release(); }
  });

  app.post('/api/report-card/publish-bulk-v2', authenticate, requireRoles(...managerRoles), async (req,res,next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids)] : [];
      if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array' });
      if (ids.length > 500) return res.status(400).json({ error: 'Maximum 500 report cards per bulk publish request' });
      const { rows } = await pool.query(`UPDATE report_cards SET status='published' WHERE id=ANY($1::uuid[]) AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3) AND status='draft' RETURNING id`, [ids, req.auth.schoolId, req.auth.branchId || null]);
      res.json({ publishedIds: rows.map(r => r.id), publishedCount: rows.length, skippedCount: ids.length - rows.length });
    } catch (err) { next(err); }
  });
}

module.exports = { registerReportCardBulkRoutes };