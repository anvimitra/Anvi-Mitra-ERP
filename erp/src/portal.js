const { authenticate, requireRoles } = require('./auth');

function registerPortalRoutes(app, pool) {
  const parentOnly = requireRoles('parent');

  async function linkedChildren(req) {
    const { rows } = await pool.query(
      `SELECT s.id,s.full_name AS "fullName",s.admission_no AS "admissionNo",s.photo_url AS "photoUrl",
              b.name AS "branchName",a.id AS "sessionId",a.name AS "sessionName",
              c.id AS "classId",c.name AS "className",sec.id AS "sectionId",sec.name AS "sectionName",
              sp.relation,sp.is_primary AS "isPrimary"
       FROM student_portal_profiles sp
       JOIN students s ON s.id=sp.student_id AND s.school_id=sp.school_id
       LEFT JOIN branches b ON b.id=s.branch_id
       LEFT JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.status='active'
       LEFT JOIN academic_sessions a ON a.id=e.session_id
       LEFT JOIN sections sec ON sec.id=e.section_id
       LEFT JOIN classes c ON c.id=sec.class_id
       WHERE sp.school_id=$1 AND sp.user_id=$2 AND sp.status='active' AND s.status='active'
       ORDER BY sp.is_primary DESC,s.full_name`,
      [req.auth.schoolId, req.auth.sub]
    );
    return rows;
  }

  app.get('/api/portal/children', authenticate, parentOnly, async (req,res,next) => {
    try { res.json({children:await linkedChildren(req)}); } catch(err){next(err)}
  });

  app.get('/api/portal/me/overview', authenticate, parentOnly, async (req,res,next) => {
    try {
      const children=await linkedChildren(req);
      const students=[];
      for(const child of children){
        const [attendance,fees,homework]=await Promise.all([
          pool.query(`SELECT COUNT(*) FILTER(WHERE status='present')::int AS present,COUNT(*) FILTER(WHERE status='absent')::int AS absent,COUNT(*) FILTER(WHERE status='late')::int AS late,COUNT(*)::int AS total FROM student_attendance WHERE school_id=$1 AND student_id=$2 AND attendance_date>=CURRENT_DATE-30`,[req.auth.schoolId,child.id]),
          pool.query(`SELECT COALESCE(SUM(balance_amount),0) AS outstanding,COALESCE(SUM(paid_amount),0) AS paid,COUNT(*) FILTER(WHERE status NOT IN ('paid','cancelled'))::int AS open_invoices FROM fee_invoices WHERE school_id=$1 AND student_id=$2`,[req.auth.schoolId,child.id]),
          pool.query(`SELECT h.id,h.title,h.description,h.due_at AS "dueAt",h.due_at::date AS "dueOn",sub.name AS "subjectName" FROM homework_assignments h LEFT JOIN subjects sub ON sub.id=h.subject_id AND sub.school_id=h.school_id WHERE h.school_id=$1 AND ($2::uuid IS NULL OR h.class_id=$2) AND ($3::uuid IS NULL OR h.section_id=$3) ORDER BY h.due_at DESC NULLS LAST LIMIT 10`,[req.auth.schoolId,child.classId||null,child.sectionId||null])
        ]);
        const a=attendance.rows[0]||{present:0,absent:0,late:0,total:0},f=fees.rows[0]||{outstanding:0,paid:0,open_invoices:0},total=Number(a.total||0);
        students.push({...child,attendance:{present:Number(a.present||0),absent:Number(a.absent||0),late:Number(a.late||0),total,attendancePercent:total?Number((Number(a.present||0)/total*100).toFixed(1)):0},fees:{outstandingAmount:Number(f.outstanding||0),paidAmount:Number(f.paid||0),openInvoices:Number(f.open_invoices||0)},homework:homework.rows});
      }
      res.json({students});
    } catch(err){next(err)}
  });

  app.get('/api/portal/children/:studentId/summary', authenticate, parentOnly, async (req,res,next) => {
    try {
      const child=(await linkedChildren(req)).find(x=>String(x.id)===String(req.params.studentId));
      if(!child)return res.status(404).json({error:'Child not linked to this parent'});
      const [attendance,marks,fees,homework,calendar]=await Promise.all([
        pool.query(`SELECT COUNT(*) FILTER(WHERE status='present')::int AS present,COUNT(*) FILTER(WHERE status='absent')::int AS absent,COUNT(*) FILTER(WHERE status='late')::int AS late,COUNT(*)::int AS total FROM student_attendance WHERE school_id=$1 AND student_id=$2`,[req.auth.schoolId,child.id]),
        pool.query(`SELECT es.id AS "examSubjectId",sub.name AS "subjectName",e.name AS "examName",em.marks,em.grade,es.max_marks AS "maxMarks" FROM exam_marks em JOIN exam_subjects es ON es.id=em.exam_subject_id AND es.school_id=em.school_id JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id JOIN subjects sub ON sub.id=es.subject_id AND sub.school_id=es.school_id WHERE em.school_id=$1 AND em.student_id=$2 ORDER BY e.created_at DESC,sub.name LIMIT 100`,[req.auth.schoolId,child.id]),
        pool.query(`SELECT id,invoice_no AS "invoiceNo",invoice_date AS "invoiceDate",due_date AS "dueDate",net_amount AS "netAmount",paid_amount AS "paidAmount",balance_amount AS "balanceAmount",status FROM fee_invoices WHERE school_id=$1 AND student_id=$2 ORDER BY invoice_date DESC LIMIT 30`,[req.auth.schoolId,child.id]),
        pool.query(`SELECT h.id,h.title,h.description,h.assigned_at AS "assignedAt",h.due_at AS "dueAt",h.due_at::date AS "dueOn",sub.name AS "subjectName",h.status FROM homework_assignments h LEFT JOIN subjects sub ON sub.id=h.subject_id AND sub.school_id=h.school_id WHERE h.school_id=$1 AND ($2::uuid IS NULL OR h.class_id=$2) AND ($3::uuid IS NULL OR h.section_id=$3) ORDER BY h.due_at DESC NULLS LAST LIMIT 50`,[req.auth.schoolId,child.classId||null,child.sectionId||null]),
        pool.query(`SELECT id,title,event_type AS "eventType",starts_at AS "startsAt",ends_at AS "endsAt",description FROM academic_calendar_events WHERE school_id=$1 AND starts_at>=now()-interval '7 days' ORDER BY starts_at LIMIT 50`,[req.auth.schoolId])
      ]);
      res.json({child,attendance:attendance.rows[0],marks:marks.rows,fees:fees.rows,homework:homework.rows,calendar:calendar.rows});
    }catch(err){next(err)}
  });

  app.get('/api/portal/children/:studentId/attendance', authenticate, parentOnly, async(req,res,next)=>{
    try{
      const child=(await linkedChildren(req)).find(x=>String(x.id)===String(req.params.studentId));
      if(!child)return res.status(404).json({error:'Child not linked to this parent'});
      const {rows}=await pool.query(`SELECT attendance_date AS "date",status,note FROM student_attendance WHERE school_id=$1 AND student_id=$2 ORDER BY attendance_date DESC LIMIT 366`,[req.auth.schoolId,child.id]);
      res.json({attendance:rows});
    }catch(err){next(err)}
  });

  app.get('/api/portal/children/:studentId/fees', authenticate, parentOnly, async(req,res,next)=>{
    try{
      const child=(await linkedChildren(req)).find(x=>String(x.id)===String(req.params.studentId));
      if(!child)return res.status(404).json({error:'Child not linked to this parent'});
      const {rows}=await pool.query(`SELECT id,invoice_no AS "invoiceNo",invoice_date AS "invoiceDate",due_date AS "dueDate",gross_amount AS "grossAmount",discount_amount AS "discountAmount",net_amount AS "netAmount",paid_amount AS "paidAmount",balance_amount AS "balanceAmount",status FROM fee_invoices WHERE school_id=$1 AND student_id=$2 ORDER BY invoice_date DESC LIMIT 100`,[req.auth.schoolId,child.id]);
      res.json({invoices:rows});
    }catch(err){next(err)}
  });
}
module.exports={registerPortalRoutes};
