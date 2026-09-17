const { authenticate, requireRoles } = require('./auth');

function registerNotificationAutomationRoutes(app, pool) {
  const admins = ['super_admin', 'principal', 'admin', 'office_staff'];

  app.post('/api/notifications/automate/fees', authenticate, requireRoles(...admins), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const schoolId = req.auth.schoolId;
      const branchId = req.auth.branchId || null;
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT DISTINCT sp.user_id AS "userId", fi.id AS "invoiceId", fi.invoice_no AS "invoiceNo",
               s.full_name AS "studentName", fi.balance_amount AS "balanceAmount"
        FROM fee_invoices fi
        JOIN students s ON s.id=fi.student_id AND s.school_id=fi.school_id
        JOIN student_portal_profiles sp ON sp.student_id=s.id AND sp.school_id=s.school_id
          AND sp.status='active'
        WHERE fi.school_id=$1 AND fi.status NOT IN ('paid','cancelled') AND fi.balance_amount>0
          AND ($2::uuid IS NULL OR fi.branch_id=$2 OR fi.branch_id IS NULL)
          AND ($3::date IS NULL OR fi.due_date <= $3::date)
      `, [schoolId, branchId, req.body?.dueOn || null]);
      let created = 0;
      for (const item of rows) {
        const result = await client.query(`
          INSERT INTO notifications(school_id,branch_id,recipient_user_id,event_type,title,message,action_payload)
          SELECT $1,$2,$3,'fee_due',$4,$5,$6::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications n WHERE n.school_id=$1 AND n.recipient_user_id=$3
              AND n.event_type='fee_due' AND n.action_payload->>'invoiceId'=$7
              AND n.created_at >= CURRENT_DATE
          ) RETURNING id
        `, [schoolId, branchId, item.userId, 'Fee payment reminder', `Fee balance ₹${item.balanceAmount} is pending for ${item.studentName} (${item.invoiceNo}).`, JSON.stringify({ invoiceId: item.invoiceId, route: '/fees' }), String(item.invoiceId)]);
        created += result.rowCount;
      }
      await client.query('COMMIT');
      res.json({ matched: rows.length, created });
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
    finally { client.release(); }
  });

  app.post('/api/notifications/automate/attendance', authenticate, requireRoles(...admins), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const schoolId = req.auth.schoolId;
      const date = req.body?.date || new Date().toISOString().slice(0, 10);
      const branchId = req.auth.branchId || null;
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT DISTINCT sp.user_id AS "userId", s.id AS "studentId", s.full_name AS "studentName",
               sa.status, sa.attendance_date AS "attendanceDate"
        FROM student_attendance sa
        JOIN students s ON s.id=sa.student_id AND s.school_id=sa.school_id
        JOIN student_portal_profiles sp ON sp.student_id=s.id AND sp.school_id=s.school_id AND sp.status='active'
        WHERE sa.school_id=$1 AND sa.attendance_date=$2::date AND sa.status IN ('absent','late','half_day','leave')
          AND ($3::uuid IS NULL OR sa.branch_id=$3 OR sa.branch_id IS NULL)
      `, [schoolId, date, branchId]);
      let created = 0;
      for (const item of rows) {
        const result = await client.query(`
          INSERT INTO notifications(school_id,branch_id,recipient_user_id,event_type,title,message,action_payload)
          SELECT $1,$2,$3,'attendance_alert',$4,$5,$6::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications n WHERE n.school_id=$1 AND n.recipient_user_id=$3
              AND n.event_type='attendance_alert' AND n.action_payload->>'studentId'=$7
              AND n.action_payload->>'attendanceDate'=$8
          ) RETURNING id
        `, [schoolId, branchId, item.userId, 'Attendance alert', `${item.studentName} was marked ${item.status} on ${item.attendanceDate}.`, JSON.stringify({ studentId: item.studentId, attendanceDate: String(item.attendanceDate), route: '/attendance' }), String(item.studentId), String(item.attendanceDate)]);
        created += result.rowCount;
      }
      await client.query('COMMIT');
      res.json({ matched: rows.length, created });
    } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
    finally { client.release(); }
  });
}

module.exports = { registerNotificationAutomationRoutes };