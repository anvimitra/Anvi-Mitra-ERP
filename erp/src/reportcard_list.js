const { authenticate, requireRoles } = require('./auth');

function registerReportCardListRoutes(app, pool) {
  app.get('/api/report-cards', authenticate, async (req,res,next) => {
    try {
      const { sessionId='', configId='', classId='', sectionId='', status='' } = req.query || {};
      const branchId = req.auth.branchId || null;
      const params = [req.auth.schoolId, branchId];
      const where = ['rc.school_id=$1','($2::uuid IS NULL OR rc.branch_id=$2 OR rc.branch_id IS NULL)'];
      if (sessionId) { params.push(sessionId); where.push(`rc.session_id=$${params.length}`); }
      if (configId) { params.push(configId); where.push(`rc.config_id=$${params.length}`); }
      if (status) { params.push(status); where.push(`rc.status=$${params.length}`); }
      if (classId) { params.push(classId); where.push(`e.class_id=$${params.length}`); }
      if (sectionId) { params.push(sectionId); where.push(`e.section_id=$${params.length}`); }
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (rc.id) rc.id,rc.status,rc.session_id AS "sessionId",rc.student_id AS "studentId",
          rc.config_id AS "configId",rc.branch_id AS "branchId",rc.total_marks AS "totalMarks",
          rc.percentage,rc.overall_grade AS "overallGrade",rc.generated_at AS "generatedAt",
          s.admission_no AS "admissionNo",s.full_name AS "studentName",
          cfg.name AS "configName",sess.name AS "sessionName",
          cls.id AS "classId",cls.name AS "className",sec.id AS "sectionId",sec.name AS "sectionName",
          COALESCE(b.name,'School') AS "branchName"
        FROM report_cards rc
        JOIN students s ON s.id=rc.student_id
        JOIN report_card_configs cfg ON cfg.id=rc.config_id
        LEFT JOIN academic_sessions sess ON sess.id=rc.session_id
        LEFT JOIN enrollments e ON e.student_id=rc.student_id AND e.session_id=rc.session_id AND e.school_id=rc.school_id AND e.status='active'
        LEFT JOIN sections sec ON sec.id=e.section_id
        LEFT JOIN classes cls ON cls.id=e.class_id
        LEFT JOIN branches b ON b.id=rc.branch_id
        WHERE ${where.join(' AND ')}
        ORDER BY rc.id,cls.name NULLS LAST,sec.name NULLS LAST,s.full_name
      `, params);
      rows.sort((a,b)=>String(a.className||'').localeCompare(String(b.className||''))||String(a.sectionName||'').localeCompare(String(b.sectionName||''))||String(a.studentName||'').localeCompare(String(b.studentName||'')));
      res.json({ reportCards: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/report-card/eligible-students', authenticate, requireRoles('super_admin','principal','admin','teacher'), async (req,res,next) => {
    try {
      const { sessionId='', classId='', sectionId='' } = req.query || {};
      if (!sessionId) return res.status(400).json({error:'sessionId is required'});
      const branchId=req.auth.branchId||null;
      const params=[req.auth.schoolId,sessionId,branchId];
      const where=['e.school_id=$1','e.session_id=$2','e.status=\'active\'','($3::uuid IS NULL OR e.branch_id=$3 OR e.branch_id IS NULL)'];
      if(classId){params.push(classId);where.push(`e.class_id=$${params.length}`);}
      if(sectionId){params.push(sectionId);where.push(`e.section_id=$${params.length}`);}
      const {rows}=await pool.query(`SELECT DISTINCT ON (s.id) s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",e.class_id AS "classId",c.name AS "className",e.section_id AS "sectionId",sec.name AS "sectionName",e.branch_id AS "branchId" FROM enrollments e JOIN students s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id JOIN sections sec ON sec.id=e.section_id WHERE ${where.join(' AND ')} AND s.school_id=$1 AND ($3::uuid IS NULL OR s.branch_id IS NULL OR s.branch_id=$3) ORDER BY s.id,e.created_at DESC` ,params);
      rows.sort((a,b)=>String(a.className||'').localeCompare(String(b.className||''))||String(a.sectionName||'').localeCompare(String(b.sectionName||''))||String(a.fullName||'').localeCompare(String(b.fullName||'')));
      res.json({students:rows});
    }catch(err){next(err);}
  });

  app.post('/api/report-card/publish-bulk', authenticate, requireRoles('super_admin','principal','admin'), async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String).filter(Boolean))]:[];
      if(!ids.length)return res.status(400).json({error:'ids array is required'});
      await client.query('BEGIN');
      const {rows}=await client.query(`UPDATE report_cards SET status='published' WHERE id=ANY($1::uuid[]) AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3) AND status='draft' RETURNING id`,[ids,req.auth.schoolId,req.auth.branchId||null]);
      await client.query('COMMIT');
      res.json({publishedIds:rows.map(r=>r.id),publishedCount:rows.length,requestedCount:ids.length});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
  });
}

module.exports = { registerReportCardListRoutes };