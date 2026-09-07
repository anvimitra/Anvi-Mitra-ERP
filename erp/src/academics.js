const { authenticate, requireRoles } = require('./auth');

function registerAcademicRoutes(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];

  app.get('/api/timetable', authenticate, async (req,res,next) => {
    try {
      const sectionId = req.query.sectionId;
      if (!sectionId) return res.status(400).json({ error: 'sectionId is required' });
      const { rows } = await pool.query(`SELECT t.id,t.day_of_week AS "dayOfWeek",t.period_no AS "periodNo",t.starts_at AS "startsAt",t.ends_at AS "endsAt",t.room,su.id AS "subjectId",su.name AS "subjectName",te.id AS "teacherId",te.full_name AS "teacherName",t.branch_id AS "branchId",b.name AS "branchName" FROM timetable_entries t JOIN subjects su ON su.id=t.subject_id LEFT JOIN teachers te ON te.id=t.teacher_id LEFT JOIN branches b ON b.id=t.branch_id WHERE t.school_id=$1 AND t.section_id=$2 AND ($3::uuid IS NULL OR t.branch_id=$3) ORDER BY t.day_of_week,t.period_no`, [req.auth.schoolId,sectionId,req.auth.branchId || null]);
      res.json({ timetable: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/timetable', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, sectionId, subjectId, teacherId=null, dayOfWeek, periodNo, startsAt=null, endsAt=null, room=null } = req.body || {};
      if (!sessionId || !sectionId || !subjectId || !dayOfWeek || !periodNo) return res.status(400).json({ error: 'sessionId, sectionId, subjectId, dayOfWeek and periodNo are required' });
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`INSERT INTO timetable_entries (school_id,branch_id,session_id,section_id,subject_id,teacher_id,day_of_week,period_no,starts_at,ends_at,room) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 WHERE EXISTS (SELECT 1 FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=$4 AND s.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2)) AND EXISTS (SELECT 1 FROM subjects WHERE id=$5 AND school_id=$1) AND ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM teachers WHERE id=$6 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2))) RETURNING id,day_of_week AS "dayOfWeek",period_no AS "periodNo",starts_at AS "startsAt",ends_at AS "endsAt",room,branch_id AS "branchId"`, [req.auth.schoolId,branchId,sessionId,sectionId,subjectId,teacherId,Number(dayOfWeek),Number(periodNo),startsAt,endsAt,room]);
      if (!rows.length) return res.status(404).json({ error: 'Section, subject or teacher not found for this branch' });
      res.status(201).json({ entry: rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/homework', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT h.id,h.title,h.description,h.assigned_on AS "assignedOn",h.due_on AS "dueOn",h.attachment_url AS "attachmentUrl",h.status,su.name AS "subjectName",h.branch_id AS "branchId",b.name AS "branchName" FROM homework h JOIN subjects su ON su.id=h.subject_id LEFT JOIN branches b ON b.id=h.branch_id WHERE h.school_id=$1 AND ($2::uuid IS NULL OR h.section_id=$2) AND ($3::uuid IS NULL OR h.branch_id=$3) ORDER BY h.due_on DESC NULLS LAST,h.created_at DESC`, [req.auth.schoolId,req.query.sectionId || null,req.auth.branchId || null]);
      res.json({ homework: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/homework', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    try {
      const { sessionId, sectionId, subjectId, teacherId=null, title, description=null, assignedOn=null, dueOn=null, attachmentUrl=null } = req.body || {};
      if (!sessionId || !sectionId || !subjectId || !title) return res.status(400).json({ error: 'sessionId, sectionId, subjectId and title are required' });
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`INSERT INTO homework (school_id,branch_id,session_id,section_id,subject_id,teacher_id,title,description,assigned_on,due_on,attachment_url) SELECT $1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date,CURRENT_DATE),$10,$11 WHERE EXISTS (SELECT 1 FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=$4 AND s.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2)) AND EXISTS (SELECT 1 FROM subjects WHERE id=$5 AND school_id=$1) AND ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM teachers WHERE id=$6 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2))) RETURNING id,title,description,assigned_on AS "assignedOn",due_on AS "dueOn",attachment_url AS "attachmentUrl",status,branch_id AS "branchId"`, [req.auth.schoolId,branchId,sessionId,sectionId,subjectId,teacherId,String(title).trim(),description,assignedOn,dueOn,attachmentUrl]);
      if (!rows.length) return res.status(404).json({ error: 'Section, subject or teacher not found for this branch' });
      res.status(201).json({ homework: rows[0] });
    } catch(err){ next(err); }
  });
}
module.exports = { registerAcademicRoutes };
