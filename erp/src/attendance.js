const { authenticate, requireRoles } = require('./auth');

function registerAttendanceRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];
  const managerRoles = ['super_admin','principal','admin'];
  const allowed = ['present','absent','late','half_day','leave'];

  app.get('/api/attendance', authenticate, async (req,res,next) => {
    try {
      const date = String(req.query.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date=YYYY-MM-DD is required' });
      const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
      const sectionId = req.query.sectionId ? String(req.query.sectionId) : null;
      const { rows } = await pool.query(`
        SELECT a.id,a.student_id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",
               a.attendance_date AS "date",a.status,a.note,a.session_id AS "sessionId",a.branch_id AS "branchId",
               b.name AS "branchName",c.name AS "className",sec.name AS "sectionName"
        FROM attendance_records a
        JOIN students s ON s.id=a.student_id
        LEFT JOIN branches b ON b.id=a.branch_id
        LEFT JOIN enrollments e ON e.student_id=s.id AND e.session_id=a.session_id AND e.status='active'
        LEFT JOIN sections sec ON sec.id=e.section_id
        LEFT JOIN classes c ON c.id=sec.class_id
        WHERE a.school_id=$1 AND a.attendance_date=$2
          AND ($3::uuid IS NULL OR a.session_id=$3)
          AND ($4::uuid IS NULL OR a.branch_id=$4 OR a.branch_id IS NULL)
          AND ($5::uuid IS NULL OR e.section_id=$5)
        ORDER BY c.name,sec.name,s.full_name`,
        [req.auth.schoolId,date,sessionId,req.auth.branchId || null,sectionId]);
      res.json({ attendance: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/attendance/roster', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const date = String(req.query.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A valid date=YYYY-MM-DD is required' });
      const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
      const sectionId = req.query.sectionId ? String(req.query.sectionId) : null;
      const params = [req.auth.schoolId, date, sessionId, sectionId, req.auth.branchId || null, req.auth.sub];
      const teacherClause = req.auth.role === 'teacher' ? `
        AND EXISTS (
          SELECT 1 FROM teacher_subjects ts
          JOIN users tu ON tu.teacher_id=ts.teacher_id
          WHERE ts.school_id=$1 AND ts.section_id=e.section_id AND ts.session_id=e.session_id
            AND tu.id=$6 AND ($5::uuid IS NULL OR ts.branch_id=$5 OR ts.branch_id IS NULL)
        )` : '';
      const { rows } = await pool.query(`
        SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.photo_url AS "photoUrl",
               e.session_id AS "sessionId",e.section_id AS "sectionId",sec.name AS "sectionName",
               c.id AS "classId",c.name AS "className",COALESCE(a.status,'present') AS status,a.note,
               a.id AS "attendanceId"
        FROM enrollments e
        JOIN students s ON s.id=e.student_id
        JOIN sections sec ON sec.id=e.section_id
        JOIN classes c ON c.id=sec.class_id
        LEFT JOIN attendance_records a ON a.school_id=e.school_id AND a.student_id=e.student_id
          AND a.attendance_date=$2 AND ($3::uuid IS NULL OR a.session_id=$3)
          AND ($5::uuid IS NULL OR a.branch_id=$5 OR a.branch_id IS NULL)
        WHERE e.school_id=$1 AND e.status='active'
          AND ($3::uuid IS NULL OR e.session_id=$3)
          AND ($4::uuid IS NULL OR e.section_id=$4)
          AND ($5::uuid IS NULL OR e.branch_id=$5 OR e.branch_id IS NULL OR c.branch_id=$5 OR c.branch_id IS NULL)
          AND (s.branch_id=$5 OR s.branch_id IS NULL OR $5::uuid IS NULL)
          ${teacherClause}
        ORDER BY c.name,sec.name,s.full_name`, params);
      res.json({ date, sessionId, sectionId, roster: rows });
    } catch(err){ next(err); }
  });

  app.get('/api/attendance/summary', authenticate, async (req,res,next) => {
    try {
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || from).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'Valid from/to dates are required' });
      const studentId = req.query.studentId ? String(req.query.studentId) : null;
      const { rows } = await pool.query(`
        SELECT a.student_id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE a.status='present')::int AS present,
               COUNT(*) FILTER (WHERE a.status='absent')::int AS absent,
               COUNT(*) FILTER (WHERE a.status='late')::int AS late,
               COUNT(*) FILTER (WHERE a.status='half_day')::int AS "halfDay",
               COUNT(*) FILTER (WHERE a.status='leave')::int AS leave
        FROM attendance_records a JOIN students s ON s.id=a.student_id
        WHERE a.school_id=$1 AND a.attendance_date BETWEEN $2 AND $3
          AND ($4::uuid IS NULL OR a.student_id=$4)
          AND ($5::uuid IS NULL OR a.branch_id=$5 OR a.branch_id IS NULL)
        GROUP BY a.student_id,s.admission_no,s.full_name
        ORDER BY s.full_name`, [req.auth.schoolId,from,to,studentId,req.auth.branchId || null]);
      res.json({ from,to,summary:rows });
    } catch(err){ next(err); }
  });

  app.post('/api/attendance', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { studentId, date, status, note = null, sessionId = null } = req.body || {};
      if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !allowed.includes(status)) return res.status(400).json({ error: 'studentId, valid date and valid status are required' });
      const student = await pool.query(`SELECT id,branch_id AS "branchId" FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`, [studentId,req.auth.schoolId,req.auth.branchId || null]);
      if (!student.rowCount) return res.status(404).json({ error: 'Student not found in selected branch' });
      const branchId = student.rows[0].branchId || req.auth.branchId || null;
      const selectedSession = sessionId || null;
      if (req.auth.role === 'teacher') {
        const check = await pool.query(`
          SELECT 1 FROM enrollments e
          JOIN teacher_subjects ts ON ts.section_id=e.section_id AND ts.session_id=e.session_id
          JOIN users u ON u.teacher_id=ts.teacher_id
          WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active'
            AND ($3::uuid IS NULL OR e.session_id=$3) AND u.id=$4
            AND ($5::uuid IS NULL OR ts.branch_id=$5 OR ts.branch_id IS NULL) LIMIT 1`,
          [req.auth.schoolId,studentId,selectedSession,req.auth.sub,req.auth.branchId || null]);
        if (!check.rowCount) return res.status(403).json({ error: 'Teacher is not assigned to this student section' });
      }
      const { rows } = await pool.query(`
        INSERT INTO attendance_records (school_id,session_id,student_id,attendance_date,status,note,marked_by,branch_id)
        SELECT $1,asess.id,$2,$3,$4,$5,$6,$7 FROM academic_sessions asess
        WHERE asess.school_id=$1 AND ($8::uuid IS NULL OR asess.id=$8)
          AND (asess.is_current=true OR asess.id=$8) LIMIT 1
        ON CONFLICT (school_id,student_id,attendance_date) DO UPDATE SET
          session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,
          marked_by=EXCLUDED.marked_by,branch_id=EXCLUDED.branch_id,updated_at=now()
        RETURNING id,student_id AS "studentId",attendance_date AS "date",status,note,session_id AS "sessionId",branch_id AS "branchId"`,
        [req.auth.schoolId,studentId,date,status,note,req.auth.sub,branchId,selectedSession]);
      if (!rows.length) return res.status(409).json({ error: 'No matching academic session configured for this school' });
      res.json({ attendance: rows[0] });
    } catch(err){ next(err); }
  });

  app.post('/api/attendance/bulk', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { date, sessionId = null, records = [] } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !Array.isArray(records) || !records.length || records.length > 500) return res.status(400).json({ error: 'date and 1-500 attendance records are required' });
      await client.query('BEGIN');
      const results=[];
      for (const item of records) {
        const { studentId,status,note=null }=item||{};
        if(!studentId || !allowed.includes(status)) throw Object.assign(new Error('Each record needs studentId and valid status'),{statusCode:400});
        const student=await client.query(`SELECT id,branch_id AS "branchId" FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,[studentId,req.auth.schoolId,req.auth.branchId||null]);
        if(!student.rowCount) throw Object.assign(new Error('Student not found in selected branch'),{statusCode:404});
        if(req.auth.role==='teacher'){
          const check=await client.query(`SELECT 1 FROM enrollments e JOIN teacher_subjects ts ON ts.section_id=e.section_id AND ts.session_id=e.session_id JOIN users u ON u.teacher_id=ts.teacher_id WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND ($3::uuid IS NULL OR e.session_id=$3) AND u.id=$4 AND ($5::uuid IS NULL OR ts.branch_id=$5 OR ts.branch_id IS NULL) LIMIT 1`,[req.auth.schoolId,studentId,sessionId,req.auth.sub,req.auth.branchId||null]);
          if(!check.rowCount) throw Object.assign(new Error('Teacher is not assigned to this student section'),{statusCode:403});
        }
        const branchId=student.rows[0].branchId||req.auth.branchId||null;
        const {rows}=await client.query(`INSERT INTO attendance_records(school_id,session_id,student_id,attendance_date,status,note,marked_by,branch_id) SELECT $1,asess.id,$2,$3,$4,$5,$6,$7 FROM academic_sessions asess WHERE asess.school_id=$1 AND ($8::uuid IS NULL OR asess.id=$8) AND (asess.is_current=true OR asess.id=$8) LIMIT 1 ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE SET session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,branch_id=EXCLUDED.branch_id,updated_at=now() RETURNING id,student_id AS "studentId",status`,[req.auth.schoolId,studentId,date,status,note,req.auth.sub,branchId,sessionId]);
        if(!rows.length) throw Object.assign(new Error('No matching academic session configured for this school'),{statusCode:409});
        results.push(rows[0]);
      }
      await client.query('COMMIT');
      res.json({count:results.length,attendance:results});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
  });

  app.get('/api/attendance/sections', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const sessionId=req.query.sessionId?String(req.query.sessionId):null;
      const {rows}=await pool.query(`SELECT sec.id AS "sectionId",sec.name AS "sectionName",c.id AS "classId",c.name AS "className",COUNT(e.student_id)::int AS "studentCount" FROM sections sec JOIN classes c ON c.id=sec.class_id LEFT JOIN enrollments e ON e.section_id=sec.id AND e.status='active' AND ($2::uuid IS NULL OR e.session_id=$2) WHERE c.school_id=$1 AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL) GROUP BY sec.id,sec.name,c.id,c.name ORDER BY c.name,sec.name`,[req.auth.schoolId,sessionId,req.auth.branchId||null]);
      res.json({sections:rows});
    }catch(err){next(err);}
  });

  app.post('/api/attendance/sections/:sectionId/mark-all', authenticate, requireRoles(...managerRoles), async (req,res,next) => {
    try {
      const {date,status,note=null,sessionId=null}=req.body||{};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||!allowed.includes(status)) return res.status(400).json({error:'valid date and status are required'});
      const {rows}=await pool.query(`INSERT INTO attendance_records(school_id,session_id,student_id,attendance_date,status,note,marked_by,branch_id) SELECT $1,e.session_id,e.student_id,$2,$3,$4,$5,COALESCE(s.branch_id,$6) FROM enrollments e JOIN students s ON s.id=e.student_id JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id WHERE e.school_id=$1 AND e.section_id=$7 AND e.status='active' AND ($8::uuid IS NULL OR e.session_id=$8) AND ($6::uuid IS NULL OR c.branch_id=$6 OR c.branch_id IS NULL) ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE SET session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,branch_id=EXCLUDED.branch_id,updated_at=now() RETURNING id`,[req.auth.schoolId,date,status,note,req.auth.sub,req.auth.branchId||null,req.params.sectionId,sessionId]);
      res.json({count:rows.length});
    }catch(err){next(err);}
  });
}
module.exports={registerAttendanceRoutes};
