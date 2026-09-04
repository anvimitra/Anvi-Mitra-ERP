const { authenticate, requireRoles } = require('./auth');

function registerReportCardResultSyncRoutes(app, pool) {
  const roles = ['super_admin','principal','admin','teacher'];

  app.get('/api/report-card/result-preview/:studentId', authenticate, requireRoles(...roles), async (req,res,next) => {
    try {
      const { sessionId, configId } = req.query || {};
      if (!sessionId || !configId) return res.status(400).json({ error: 'sessionId and configId are required' });
      const branchId=req.auth.branchId||null;
      const { rows } = await pool.query(`
        SELECT s.id AS "subjectId",s.name AS "subjectName",rps.total_marks AS "totalMarks",
               rps.percentage,rps.grade,rtc.exam_type_id AS "examTypeId",et.code AS "examTypeCode",
               et.name AS "examTypeName",rtc.weight_percent AS "weightPercent",
               rc.id AS "reportCardId",rc.status,rc.overall_grade AS "overallGrade"
        FROM report_cards rc
        JOIN report_card_subjects rps ON rps.report_card_id=rc.id
        JOIN subjects s ON s.id=rps.subject_id AND s.school_id=rc.school_id
        LEFT JOIN report_card_exam_marks rem ON rem.report_card_subject_id=rps.id
        LEFT JOIN report_card_components rtc ON rtc.config_id=rc.config_id AND rtc.exam_type_id=rem.exam_type_id
        LEFT JOIN exam_types et ON et.id=rem.exam_type_id AND et.school_id=rc.school_id
        WHERE rc.id IN (
          SELECT rc2.id FROM report_cards rc2
          WHERE rc2.school_id=$1 AND rc2.student_id=$2 AND rc2.session_id=$3 AND rc2.config_id=$4
            AND ($5::uuid IS NULL OR rc2.branch_id=$5 OR rc2.branch_id IS NULL)
          ORDER BY rc2.generated_at DESC LIMIT 1
        )
        ORDER BY s.name,rtc.display_order,et.name`,
        [req.auth.schoolId,req.params.studentId,sessionId,configId,branchId]);
      if(!rows.length)return res.status(404).json({error:'Report card result not found'});
      const first=rows[0];
      res.json({reportCardId:first.reportCardId,status:first.status,overallGrade:first.overallGrade,subjects:rows});
    } catch(err){next(err);}
  });
}

module.exports={registerReportCardResultSyncRoutes};
