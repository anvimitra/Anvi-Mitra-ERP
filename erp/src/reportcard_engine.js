async function getGrade(client, schoolId, branchId, percent) {
  const { rows } = await client.query(`SELECT grade FROM grade_scales WHERE school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL) AND min_percent <= $3 AND max_percent >= $3 ORDER BY branch_id NULLS LAST,min_percent DESC LIMIT 1`, [schoolId, branchId || null, percent]);
  return rows[0]?.grade || null;
}

async function generateReportCard({ client, auth, studentId, sessionId, configId }) {
  const branchId = auth.branchId || null;
  const student = await client.query(`SELECT id,admission_no AS "admissionNo",full_name AS "fullName",branch_id AS "branchId" FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id IS NULL OR branch_id=$3)`, [studentId, auth.schoolId, branchId]);
  if (!student.rowCount) throw Object.assign(new Error('Student not found for this school or branch'), { statusCode: 404 });

  const enrollment = await client.query(`SELECT id,branch_id AS "branchId" FROM enrollments WHERE student_id=$1 AND school_id=$2 AND session_id=$3 AND is_active=true AND ($4::uuid IS NULL OR branch_id=$4 OR branch_id IS NULL) ORDER BY branch_id NULLS LAST,created_at DESC LIMIT 1`, [studentId, auth.schoolId, sessionId, branchId]);
  if (!enrollment.rowCount) throw Object.assign(new Error('Student has no active enrollment for this session/branch'), { statusCode: 422 });

  const cfg = await client.query(`SELECT c.id,c.session_id AS "sessionId",c.branch_id AS "branchId",c.template_id AS "templateId",x.exam_type_id AS "examTypeId",x.weight_percent AS "weightPercent" FROM report_card_configs c JOIN report_card_components x ON x.config_id=c.id WHERE c.id=$1 AND c.school_id=$2 AND c.session_id=$3 AND ($4::uuid IS NULL OR c.branch_id=$4) ORDER BY x.display_order`, [configId, auth.schoolId, sessionId, branchId]);
  if (!cfg.rowCount) throw Object.assign(new Error('Report card configuration not found'), { statusCode: 404 });

  const components = cfg.rows;
  const existing = await client.query(`SELECT id,status FROM report_cards WHERE school_id=$1 AND session_id=$2 AND student_id=$3 AND ($4::uuid IS NULL OR branch_id=$4) FOR UPDATE`, [auth.schoolId, sessionId, studentId, branchId]);
  if (existing.rows[0]?.status === 'published') throw Object.assign(new Error('Report card is already published'), { statusCode: 409 });

  const exams = await client.query(`SELECT e.id,e.exam_type_id AS "examTypeId",es.id AS "examSubjectId",es.subject_id AS "subjectId",es.max_marks AS "maxMarks",m.marks FROM exams e JOIN exam_subjects es ON es.exam_id=e.id LEFT JOIN exam_marks m ON m.exam_subject_id=es.id AND m.student_id=$1 AND m.school_id=$2 WHERE e.school_id=$2 AND e.session_id=$3 AND ($4::uuid IS NULL OR e.branch_id=$4) AND e.exam_type_id=ANY($5::uuid[]) ORDER BY es.subject_id,e.created_at DESC`, [studentId, auth.schoolId, sessionId, branchId, components.map(x => x.examTypeId)]);
  const bySubject = new Map();
  for (const row of exams.rows) {
    if (!bySubject.has(row.subjectId)) bySubject.set(row.subjectId, []);
    bySubject.get(row.subjectId).push(row);
  }

  const card = await client.query(`INSERT INTO report_cards (school_id,branch_id,session_id,student_id,config_id,status,total_marks,percentage) VALUES ($1,$2,$3,$4,$5,'draft',0,0) ON CONFLICT (school_id,session_id,student_id) DO UPDATE SET config_id=EXCLUDED.config_id,branch_id=EXCLUDED.branch_id,status='draft',generated_at=now() RETURNING id`, [auth.schoolId, branchId, sessionId, studentId, configId]);
  const cardId = card.rows[0].id;
  await client.query('DELETE FROM report_card_subjects WHERE report_card_id=$1', [cardId]);

  let grandPercentage = 0, subjectCount = 0, totalRawMarks = 0;
  for (const [subjectId, rows] of bySubject) {
    let weighted = 0, availableWeight = 0, totalRaw = 0;
    for (const component of components) {
      const row = rows.find(x => x.examTypeId === component.examTypeId);
      if (row && row.marks !== null && Number(row.maxMarks) > 0) {
        const pct = Number(row.marks) / Number(row.maxMarks) * 100;
        weighted += pct * Number(component.weightPercent) / 100;
        availableWeight += Number(component.weightPercent);
        totalRaw += Number(row.marks);
      }
    }
    const pct = availableWeight ? weighted * 100 / availableWeight : 0;
    const grade = await getGrade(client, auth.schoolId, branchId, pct);
    const subject = await client.query(`INSERT INTO report_card_subjects (report_card_id,subject_id,total_marks,percentage,grade) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [cardId, subjectId, totalRaw, pct, grade]);
    for (const component of components) {
      const row = rows.find(x => x.examTypeId === component.examTypeId);
      if (row) await client.query(`INSERT INTO report_card_exam_marks (report_card_subject_id,exam_type_id,marks,max_marks,weighted_marks) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (report_card_subject_id,exam_type_id) DO UPDATE SET marks=EXCLUDED.marks,max_marks=EXCLUDED.max_marks,weighted_marks=EXCLUDED.weighted_marks`, [subject.rows[0].id, component.examTypeId, row.marks, row.maxMarks, row.marks === null ? null : Number(row.marks) / Number(row.maxMarks) * Number(component.weightPercent)]);
    }
    grandPercentage += pct;
    subjectCount++;
    totalRawMarks += totalRaw;
  }

  const percentage = subjectCount ? grandPercentage / subjectCount : 0;
  const overallGrade = await getGrade(client, auth.schoolId, branchId, percentage);
  await client.query(`UPDATE report_cards SET total_marks=$2,percentage=$3,overall_grade=$4,generated_at=now() WHERE id=$1`, [cardId, totalRawMarks, percentage, overallGrade]);
  return { reportCardId: cardId, studentId, status: 'draft', percentage: Number(percentage.toFixed(2)), overallGrade, templateId: components[0]?.templateId || null };
}

module.exports = { generateReportCard };