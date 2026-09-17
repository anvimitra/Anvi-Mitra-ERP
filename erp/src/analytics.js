const { authenticate, requireRoles } = require('./auth');

function registerAnalyticsRoutes(app, pool) {
  const staff = ['super_admin', 'principal', 'admin', 'teacher'];

  app.get('/api/analytics/school', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const schoolId = req.auth.schoolId;
      const branchId = req.auth.branchId || null;
      const [people, attendance, fees, results] = await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM students WHERE school_id=$1 AND status='active' AND ($2::uuid IS NULL OR branch_id=$2)) AS students,
            (SELECT COUNT(*)::int FROM users WHERE school_id=$1 AND status='active') AS users,
            (SELECT COUNT(*)::int FROM users WHERE school_id=$1 AND role='teacher' AND status='active') AS teachers,
            (SELECT COUNT(*)::int FROM enrollments WHERE school_id=$1 AND status='active' AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL)) AS enrollments`,
          [schoolId, branchId]),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='present')::int AS present,
            COUNT(*) FILTER (WHERE status='absent')::int AS absent,
            COUNT(*) FILTER (WHERE status='late')::int AS late
          FROM student_attendance
          WHERE school_id=$1 AND attendance_date >= CURRENT_DATE - 30`, [schoolId]),
        pool.query(`
          SELECT COALESCE(SUM(net_amount),0) AS billed,
                 COALESCE(SUM(paid_amount),0) AS paid,
                 COALESCE(SUM(balance_amount),0) AS outstanding,
                 COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled'))::int AS open_invoices
          FROM fee_invoices WHERE school_id=$1`, [schoolId]),
        pool.query(`
          SELECT COUNT(*)::int AS published_results,
                 COALESCE(AVG(percentage),0) AS average_percentage
          FROM result_snapshots
          WHERE school_id=$1 AND status='published'`, [schoolId])
      ]);
      res.json({
        schoolId,
        counts: people.rows[0],
        attendance: attendance.rows[0],
        fees: fees.rows[0],
        results: results.rows[0]
      });
    } catch (err) { next(err); }
  });

  app.get('/api/analytics/attendance', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const days = Math.min(Math.max(Number(req.query?.days) || 30, 1), 366);
      const { rows } = await pool.query(`
        SELECT attendance_date AS date,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='present')::int AS present,
               COUNT(*) FILTER (WHERE status='absent')::int AS absent,
               COUNT(*) FILTER (WHERE status='late')::int AS late
        FROM student_attendance
        WHERE school_id=$1 AND attendance_date >= CURRENT_DATE - $2::int
        GROUP BY attendance_date ORDER BY attendance_date`,
        [req.auth.schoolId, days]);
      res.json({ days, attendance: rows });
    } catch (err) { next(err); }
  });
}

module.exports = { registerAnalyticsRoutes };
