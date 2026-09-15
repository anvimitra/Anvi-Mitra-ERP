const { authenticate, requireRoles } = require('./auth');

function registerAttendanceRoutes(app, pool) {
  const markingRoles = ['super_admin','principal','admin','office_staff','teacher'];

  app.get('/api/attendance/sections', authenticate, requireRoles(...markingRoles), async (req,res,next) => {
    try {
      const branchId = req.auth.branchId || null;
      const sessionId = req.query.sessionId || null;
      const { rows } = await pool.query(
        `SELECT sec.id AS "sectionId", c.id AS "classId", c.name AS "className", sec.name AS "sectionName",
                COUNT(DISTINCT e.student_id)::int AS "studentCount"
           FROM sections sec
           JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
           LEFT JOIN enrollments e ON e.section_id=sec.id AND e.school_id=sec.school_id AND e.status='active'
                AND ($2::uuid IS NULL OR e.session_id=$2)
          WHERE sec.school_id=$1
            AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL)
          GROUP BY sec.id,c.id,c.name,sec.name ORDER BY c.name,sec.name`,
        [req.auth.schoolId, sessionId, branchId]
      );
      res.json({ sections: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/attendance/roster', authenticate, requireRoles(...markingRoles), async (req,res,next) => {
    try {
      const date = String(req.query.date || '').trim();
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return res.status(400).json({error:'Valid attendance date is required'});
      const params=[req.auth.schoolId,date];
      const sessionId=req.query.sessionId || null; params.push(sessionId);
      const sectionId=req.query.sectionId || null; params.push(sectionId);
      const branchId=req.auth.branchId || null; params.push(branchId);
      const { rows } = await pool.query(
        `SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",c.name AS "className",sec.name AS "sectionName",
                COALESCE(a.status,'present') AS status,a.note,a.id AS "attendanceId"
           FROM enrollments e
           JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id AND s.status='active'
           JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
           JOIN classes c ON c.id=sec.class_id AND c.school_id=e.school_id
           LEFT JOIN student_attendance a ON a.school_id=e.school_id AND a.student_id=s.id AND a.attendance_date=$2::date
          WHERE e.school_id=$1 AND e.status='active'
            AND ($3::uuid IS NULL OR e.session_id=$3)
            AND ($4::uuid IS NULL OR e.section_id=$4)
            AND ($5::uuid IS NULL OR s.branch_id=$5 OR s.branch_id IS NULL)
          ORDER BY c.name,sec.name,s.full_name`,
        params
      );
      res.json({roster:rows});
    } catch (err) { next(err); }
  });

  app.post('/api/attendance/bulk', authenticate, requireRoles(...markingRoles), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const { date, sessionId=null, records=[] }=req.body||{};
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date||''))) return res.status(400).json({error:'Valid attendance date is required'});
      if (!Array.isArray(records) || !records.length) return res.status(400).json({error:'Attendance records are required'});
      if (records.length>1000) return res.status(400).json({error:'Too many attendance records'});
      const allowed=new Set(['present','absent','late','half_day','leave']);
      await client.query('BEGIN');
      let saved=0;
      for (const record of records) {
        if (!record.studentId || !allowed.has(record.status)) continue;
        const valid=await client.query(
          `SELECT e.student_id FROM enrollments e JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id
            WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND s.status='active'
              AND ($3::uuid IS NULL OR e.session_id=$3)
              AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL)
            LIMIT 1`,
          [req.auth.schoolId,record.studentId,sessionId,req.auth.branchId||null]
        );
        if (!valid.rowCount) continue;
        await client.query(
          `INSERT INTO student_attendance(school_id,branch_id,student_id,session_id,attendance_date,status,note,marked_by,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE SET branch_id=EXCLUDED.branch_id,session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,updated_at=now()`,
          [req.auth.schoolId,req.auth.branchId||null,record.studentId,sessionId,date,record.status,record.note||null,req.auth.sub]
        );
        saved++;
      }
      await client.query('COMMIT');
      res.json({saved,date});
    } catch(err){ await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
  });

  app.get('/api/attendance/report', authenticate, requireRoles(...markingRoles), async (req,res,next) => {
    try {
      const from=String(req.query.from||req.query.date||'').trim();
      const to=String(req.query.to||req.query.date||from).trim();
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(from)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(to)) return res.status(400).json({error:'Valid from/to dates are required'});
      const { rows }=await pool.query(
        `SELECT attendance_date AS date,
                COUNT(*)::int AS marked,
                COUNT(*) FILTER (WHERE status='present')::int AS present,
                COUNT(*) FILTER (WHERE status='absent')::int AS absent,
                COUNT(*) FILTER (WHERE status='late')::int AS late,
                COUNT(*) FILTER (WHERE status='half_day')::int AS half_day,
                COUNT(*) FILTER (WHERE status='leave')::int AS leave
           FROM student_attendance
          WHERE school_id=$1 AND attendance_date BETWEEN $2::date AND $3::date
            AND ($4::uuid IS NULL OR branch_id=$4 OR branch_id IS NULL)
          GROUP BY attendance_date ORDER BY attendance_date`,
        [req.auth.schoolId,from,to,req.auth.branchId||null]
      );
      res.json({from,to,report:rows});
    } catch(err){next(err)}
  });
}
module.exports={registerAttendanceRoutes};
