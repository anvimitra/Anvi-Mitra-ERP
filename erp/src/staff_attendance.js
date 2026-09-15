const { authenticate, requireRoles } = require('./auth');

function registerStaffAttendanceRoutes(app, pool) {
  const managers = ['super_admin','principal','admin','office_staff'];
  const allStaff = ['principal','admin','teacher','office_staff','accountant','driver'];

  app.get('/api/staff-attendance/roster', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const date=String(req.query.date||'').trim();
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return res.status(400).json({error:'Valid attendance date is required'});
      const {rows}=await pool.query(
        `SELECT u.id,u.email,u.phone,u.role,u.branch_id AS "branchId",b.name AS "branchName",
                COALESCE(a.status,'present') AS status,a.note,a.id AS "attendanceId"
           FROM users u LEFT JOIN branches b ON b.id=u.branch_id
           LEFT JOIN staff_attendance a ON a.user_id=u.id AND a.school_id=u.school_id AND a.attendance_date=$2::date
          WHERE u.school_id=$1 AND u.status='active' AND u.role=ANY($3::text[])
            AND ($4::uuid IS NULL OR u.branch_id=$4 OR u.branch_id IS NULL)
          ORDER BY u.role,u.email`,
        [req.auth.schoolId,date,allStaff,req.auth.branchId||null]
      );
      res.json({date,roster:rows});
    } catch(err){next(err)}
  });

  app.post('/api/staff-attendance/bulk', authenticate, requireRoles(...managers), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const {date,records=[]}=req.body||{};
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date||''))) return res.status(400).json({error:'Valid attendance date is required'});
      if(!Array.isArray(records)||!records.length||records.length>1000) return res.status(400).json({error:'Valid staff attendance records are required'});
      const allowed=new Set(['present','absent','late','half_day','leave']);
      await client.query('BEGIN'); let saved=0;
      for(const record of records){
        if(!record.userId||!allowed.has(record.status)) continue;
        const valid=await client.query(
          `SELECT id,branch_id AS "branchId" FROM users
            WHERE id=$1 AND school_id=$2 AND status='active' AND role=ANY($3::text[])
              AND ($4::uuid IS NULL OR branch_id=$4 OR branch_id IS NULL)`,
          [record.userId,req.auth.schoolId,allStaff,req.auth.branchId||null]
        );
        if(!valid.rowCount) continue;
        await client.query(
          `INSERT INTO staff_attendance(school_id,branch_id,user_id,attendance_date,status,note,marked_by,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,now())
           ON CONFLICT(school_id,user_id,attendance_date) DO UPDATE
           SET branch_id=EXCLUDED.branch_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,updated_at=now()`,
          [req.auth.schoolId,req.auth.branchId||valid.rows[0].branchId||null,record.userId,date,record.status,record.note||null,req.auth.sub]
        );
        await client.query(
          `INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
           VALUES($1,'staff_attendance',$2,'update',$3::jsonb,$4)`,
          [req.auth.schoolId,record.userId,JSON.stringify({userId:record.userId,date,status:record.status,note:record.note||null}),req.auth.sub]
        );
        saved++;
      }
      await client.query('COMMIT'); res.json({saved,date});
    } catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)} finally{client.release()}
  });

  app.get('/api/staff-attendance/report', authenticate, requireRoles(...managers), async (req,res,next)=>{
    try{
      const from=String(req.query.from||req.query.date||'').trim(), to=String(req.query.to||req.query.date||from).trim();
      if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(from)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(to)) return res.status(400).json({error:'Valid from/to dates are required'});
      const {rows}=await pool.query(
        `SELECT attendance_date AS date,COUNT(*)::int AS marked,
                COUNT(*) FILTER(WHERE status='present')::int AS present,
                COUNT(*) FILTER(WHERE status='absent')::int AS absent,
                COUNT(*) FILTER(WHERE status='late')::int AS late,
                COUNT(*) FILTER(WHERE status='half_day')::int AS half_day,
                COUNT(*) FILTER(WHERE status='leave')::int AS leave
           FROM staff_attendance
          WHERE school_id=$1 AND attendance_date BETWEEN $2::date AND $3::date
            AND ($4::uuid IS NULL OR branch_id=$4 OR branch_id IS NULL)
          GROUP BY attendance_date ORDER BY attendance_date`,
        [req.auth.schoolId,from,to,req.auth.branchId||null]
      );
      res.json({from,to,report:rows});
    }catch(err){next(err)}
  });
}
module.exports={registerStaffAttendanceRoutes};
