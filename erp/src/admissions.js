const { authenticate, requireRoles } = require('./auth');

function registerAdmissionRoutes(app, pool) {
  const officeRoles = ['super_admin','principal','admin','office_staff'];

  app.get('/api/admissions', authenticate, requireRoles(...officeRoles), async (req,res,next) => {
    try {
      const { status = null, sessionId = null } = req.query;
      const { rows } = await pool.query(`SELECT a.id,a.application_no AS "applicationNo",a.session_id AS "sessionId",a.applied_class_id AS "appliedClassId",c.name AS "appliedClassName",a.student_name AS "studentName",a.date_of_birth AS "dateOfBirth",a.gender,a.father_name AS "fatherName",a.mother_name AS "motherName",a.guardian_phone AS "guardianPhone",a.previous_school AS "previousSchool",a.status,a.branch_id AS "branchId",b.name AS "branchName",a.created_at AS "createdAt" FROM admission_applications a LEFT JOIN classes c ON c.id=a.applied_class_id AND c.school_id=a.school_id LEFT JOIN branches b ON b.id=a.branch_id WHERE a.school_id=$1 AND ($2::text IS NULL OR a.status=$2) AND ($3::uuid IS NULL OR a.session_id=$3) AND ($4::uuid IS NULL OR a.branch_id=$4) ORDER BY a.created_at DESC`, [req.auth.schoolId,status || null,sessionId || null,req.auth.branchId || null]);
      res.json({ applications: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/admissions', authenticate, requireRoles(...officeRoles), async (req,res,next) => {
    try {
      const b = req.body || {};
      if (!b.sessionId || !b.applicationNo || !b.studentName) return res.status(400).json({ error: 'sessionId, applicationNo and studentName are required' });
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`INSERT INTO admission_applications (school_id,branch_id,application_no,session_id,applied_class_id,student_name,date_of_birth,gender,father_name,mother_name,guardian_phone,address,previous_school,status,notes,created_by) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 WHERE EXISTS (SELECT 1 FROM academic_sessions WHERE id=$4 AND school_id=$1) AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM classes WHERE id=$5 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2))) RETURNING id,application_no AS "applicationNo",status,branch_id AS "branchId",created_at AS "createdAt"`, [req.auth.schoolId,branchId,String(b.applicationNo).trim(),b.sessionId,b.appliedClassId || null,String(b.studentName).trim(),b.dateOfBirth || null,b.gender || null,b.fatherName || null,b.motherName || null,b.guardianPhone || null,b.address || null,b.previousSchool || null,b.status || 'submitted',b.notes || null,req.auth.sub]);
      if (!rows.length) return res.status(404).json({ error: 'Academic session or class not found for this branch' });
      res.status(201).json({ application: rows[0] });
    } catch (err) { next(err); }
  });

  app.post('/api/admissions/:id/status', authenticate, requireRoles(...officeRoles), async (req,res,next) => {
    try {
      const allowed = ['under_review','approved','rejected','cancelled'];
      const status = String(req.body?.status || '');
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid admission status' });
      const { rows } = await pool.query(`UPDATE admission_applications SET status=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 AND school_id=$2 AND ($5::uuid IS NULL OR branch_id=$5) RETURNING id,application_no AS "applicationNo",status,branch_id AS "branchId",reviewed_at AS "reviewedAt"`, [req.params.id,req.auth.schoolId,status,req.auth.sub,req.auth.branchId || null]);
      if (!rows.length) return res.status(404).json({ error: 'Admission application not found in selected branch' });
      res.json({ application: rows[0] });
    } catch (err) { next(err); }
  });

  app.post('/api/admissions/:id/enroll', authenticate, requireRoles(...officeRoles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { sectionId, admissionNo, rollNo = null } = req.body || {};
      if (!sectionId || !admissionNo) return res.status(400).json({ error: 'sectionId and admissionNo are required' });
      await client.query('BEGIN');
      const a = await client.query(`SELECT a.* FROM admission_applications a WHERE a.id=$1 AND a.school_id=$2 AND ($3::uuid IS NULL OR a.branch_id=$3) FOR UPDATE`, [req.params.id,req.auth.schoolId,req.auth.branchId || null]);
      if (!a.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Admission application not found in selected branch' }); }
      const application = a.rows[0];
      if (!['approved','submitted','under_review'].includes(application.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Application is not eligible for enrollment' }); }
      const section = await client.query(`SELECT s.id,s.class_id,c.branch_id AS "branchId" FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=$1 AND s.school_id=$2 AND ($3::uuid IS NULL OR c.branch_id=$3)`, [sectionId,req.auth.schoolId,req.auth.branchId || null]);
      if (!section.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Section not found for this branch' }); }
      if (application.applied_class_id && application.applied_class_id !== section.rows[0].class_id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Selected section does not belong to the applied class' }); }
      const duplicate = await client.query(`SELECT 1 FROM students WHERE school_id=$1 AND admission_no=$2`, [req.auth.schoolId,String(admissionNo).trim()]);
      if (duplicate.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Admission number already exists' }); }
      const branchId = section.rows[0].branchId || application.branch_id || req.auth.branchId || null;
      const student = await client.query(`INSERT INTO students (school_id,branch_id,admission_no,roll_no,full_name,date_of_birth,gender,admission_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,'active') RETURNING id,admission_no AS "admissionNo",roll_no AS "rollNo",full_name AS "fullName",branch_id AS "branchId",status`, [req.auth.schoolId,branchId,String(admissionNo).trim(),rollNo,String(application.student_name).trim(),application.date_of_birth,application.gender]);
      const session = await client.query(`SELECT id FROM academic_sessions WHERE id=$1 AND school_id=$2`, [application.session_id,req.auth.schoolId]);
      if (!session.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Academic session not found' }); }
      const enrollment = await client.query(`INSERT INTO enrollments (school_id,branch_id,student_id,session_id,section_id,roll_no) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,session_id AS "sessionId",section_id AS "sectionId",roll_no AS "rollNo",branch_id AS "branchId",status`, [req.auth.schoolId,branchId,student.rows[0].id,application.session_id,sectionId,rollNo]);
      await client.query(`UPDATE admission_applications SET status='enrolled',updated_at=now(),reviewed_by=$2,reviewed_at=now() WHERE id=$1`, [req.params.id,req.auth.sub]);
      await client.query('COMMIT');
      res.status(201).json({ student: student.rows[0], enrollment: enrollment.rows[0] });
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
  });

  app.post('/api/students/:studentId/documents', authenticate, requireRoles(...officeRoles), async (req,res,next) => {
    try {
      const b=req.body||{};
      if (!b.documentType) return res.status(400).json({ error:'documentType is required' });
      const { rows } = await pool.query(`INSERT INTO student_documents (school_id,branch_id,student_id,document_type,document_no,file_url,notes) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS (SELECT 1 FROM students WHERE id=$3 AND school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2)) RETURNING id,document_type AS "documentType",document_no AS "documentNo",file_url AS "fileUrl",verified,notes,created_at AS "createdAt"`, [req.auth.schoolId,req.auth.branchId || null,req.params.studentId,b.documentType,b.documentNo||null,b.fileUrl||null,b.notes||null]);
      if (!rows.length) return res.status(404).json({ error:'Student not found in selected branch' });
      res.status(201).json({ document: rows[0] });
    } catch(err){ next(err); }
  });
}

module.exports = { registerAdmissionRoutes };
