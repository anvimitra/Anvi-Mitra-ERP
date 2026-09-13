const { authenticate, requireRoles } = require('./auth');

function registerSchoolSummaryRoutes(app, pool) {
  app.get('/api/platform/schools/:id/summary', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    try {
      const schoolId = req.params.id;
      const { rows: schoolRows } = await pool.query(
        `SELECT s.id, s.name, s.code, s.status,
                ss.display_name AS "displayName", ss.logo_url AS "logoUrl"
           FROM schools s
           LEFT JOIN school_settings ss ON ss.school_id=s.id
          WHERE s.id=$1`, [schoolId]
      );
      if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });

      const queries = await Promise.all([
        pool.query('SELECT count(*)::int AS count FROM users WHERE school_id=$1', [schoolId]),
        pool.query("SELECT count(*)::int AS count FROM users WHERE school_id=$1 AND role='teacher' AND status='active'", [schoolId]),
        pool.query("SELECT count(*)::int AS count FROM students WHERE school_id=$1 AND status='active'", [schoolId]),
        pool.query("SELECT count(*)::int AS count FROM branches WHERE school_id=$1 AND status='active'", [schoolId]),
        pool.query("SELECT count(*)::int AS count FROM enrollments WHERE school_id=$1 AND status='active'", [schoolId]),
      ]);

      res.json({
        school: schoolRows[0],
        counts: {
          users: queries[0].rows[0].count,
          teachers: queries[1].rows[0].count,
          students: queries[2].rows[0].count,
          branches: queries[3].rows[0].count,
          activeEnrollments: queries[4].rows[0].count,
        },
      });
    } catch (err) { next(err); }
  });
}

module.exports = { registerSchoolSummaryRoutes };
