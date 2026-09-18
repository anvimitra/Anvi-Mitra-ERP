const { authenticate, requireRoles } = require('./auth');

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, headers, rows) {
  const body = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
  res.type('text/csv').set('Content-Disposition', `attachment; filename="${filename}"`).send(body);
}

function registerReportExportRoutes(app, pool) {
  const staff = ['super_admin', 'principal', 'admin', 'teacher'];
  const finance = ['super_admin', 'principal', 'admin', 'accountant', 'office_staff'];

  app.get('/api/reports/exam-results.csv', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const { sessionId, examId, classId, sectionId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const { rows } = await pool.query(`
        SELECT s.admission_no AS "admissionNo", s.full_name AS "studentName",
               c.name AS "className", sec.name AS "sectionName", e.name AS "examName",
               rs.subjects_total AS "subjectsTotal", rs.subjects_marked AS "subjectsMarked",
               rs.marks_obtained AS "marksObtained", rs.max_marks AS "maxMarks",
               rs.percentage, rs.grade, rs.rank_position AS "rankPosition", rs.status
        FROM result_snapshots rs
        JOIN students s ON s.id=rs.student_id AND s.school_id=rs.school_id
        JOIN classes c ON c.id=rs.class_id AND c.school_id=rs.school_id
        LEFT JOIN sections sec ON sec.id=rs.section_id AND sec.school_id=rs.school_id
        JOIN exams e ON e.id=rs.exam_id AND e.school_id=rs.school_id
        WHERE rs.school_id=$1 AND rs.session_id=$2
          AND ($3::uuid IS NULL OR rs.exam_id=$3)
          AND ($4::uuid IS NULL OR rs.class_id=$4)
          AND ($5::uuid IS NULL OR rs.section_id=$5)
          AND ($6::uuid IS NULL OR c.branch_id=$6 OR c.branch_id IS NULL)
        ORDER BY c.name, sec.name NULLS FIRST, s.full_name, e.name`,
        [req.auth.schoolId, sessionId, examId || null, classId || null, sectionId || null, req.auth.branchId || null]);
      sendCsv(res, 'exam-results.csv', ['admissionNo', 'studentName', 'className', 'sectionName', 'examName', 'subjectsTotal', 'subjectsMarked', 'marksObtained', 'maxMarks', 'percentage', 'grade', 'rankPosition', 'status'], rows.map(row => [row.admissionNo, row.studentName, row.className, row.sectionName, row.examName, row.subjectsTotal, row.subjectsMarked, row.marksObtained, row.maxMarks, row.percentage, row.grade, row.rankPosition, row.status]));
    } catch (err) { next(err); }
  });

  app.get('/api/reports/fees.csv', authenticate, requireRoles(...finance), async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT s.admission_no AS "admissionNo", s.full_name AS "studentName", fi.invoice_no AS "invoiceNo",
               fi.invoice_date AS "invoiceDate", fi.due_date AS "dueDate", fi.net_amount AS "netAmount",
               fi.paid_amount AS "paidAmount", fi.balance_amount AS "balanceAmount", fi.status
        FROM fee_invoices fi JOIN students s ON s.id=fi.student_id AND s.school_id=fi.school_id
        WHERE fi.school_id=$1 AND ($2::uuid IS NULL OR fi.branch_id=$2 OR fi.branch_id IS NULL)
        ORDER BY fi.invoice_date DESC, s.full_name`,
        [req.auth.schoolId, req.auth.branchId || null]);
      sendCsv(res, 'fees.csv', ['admissionNo', 'studentName', 'invoiceNo', 'invoiceDate', 'dueDate', 'netAmount', 'paidAmount', 'balanceAmount', 'status'], rows.map(row => [row.admissionNo, row.studentName, row.invoiceNo, row.invoiceDate, row.dueDate, row.netAmount, row.paidAmount, row.balanceAmount, row.status]));
    } catch (err) { next(err); }
  });
}

module.exports = { registerReportExportRoutes, csvEscape };
