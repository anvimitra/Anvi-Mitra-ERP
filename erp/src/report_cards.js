const { authenticate, requireRoles } = require('./auth');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function registerReportCardRoutes(app, pool) {
  const staff = ['super_admin', 'principal', 'admin', 'teacher', 'office_staff'];

  app.get('/api/report-cards/student/:studentId', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const { sessionId, examId } = req.query || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
      const { rows } = await pool.query(`
        SELECT rs.id, rs.exam_id AS "examId", rs.student_id AS "studentId", rs.subjects_total AS "subjectsTotal",
               rs.subjects_marked AS "subjectsMarked", rs.marks_obtained AS "marksObtained", rs.max_marks AS "maxMarks",
               rs.percentage, rs.grade, rs.rank_position AS "rankPosition", rs.published_at AS "publishedAt",
               e.name AS "examName", s.admission_no AS "admissionNo", s.full_name AS "studentName",
               c.name AS "className", sec.name AS "sectionName"
        FROM result_snapshots rs
        JOIN exams e ON e.id=rs.exam_id AND e.school_id=rs.school_id
        JOIN students s ON s.id=rs.student_id AND s.school_id=rs.school_id
        JOIN classes c ON c.id=rs.class_id AND c.school_id=rs.school_id
        LEFT JOIN sections sec ON sec.id=rs.section_id AND sec.school_id=rs.school_id
        WHERE rs.school_id=$1 AND rs.student_id=$2 AND rs.session_id=$3 AND rs.status='published'
          AND ($4::uuid IS NULL OR rs.exam_id=$4)
          AND ($5::uuid IS NULL OR c.branch_id=$5 OR c.branch_id IS NULL)
        ORDER BY e.starts_on NULLS LAST,e.name`,
        [req.auth.schoolId, req.params.studentId, sessionId, examId || null, req.auth.branchId || null]);
      res.json({ reportCards: rows });
    } catch (err) { next(err); }
  });

  app.get('/api/report-cards/:examId/:studentId/print', authenticate, requireRoles(...staff), async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT rs.exam_id AS "examId", rs.student_id AS "studentId", rs.subjects_total AS "subjectsTotal",
               rs.subjects_marked AS "subjectsMarked", rs.marks_obtained AS "marksObtained", rs.max_marks AS "maxMarks",
               rs.percentage, rs.grade, rs.rank_position AS "rankPosition", rs.published_at AS "publishedAt",
               e.name AS "examName", s.admission_no AS "admissionNo", s.full_name AS "studentName",
               c.name AS "className", sec.name AS "sectionName"
        FROM result_snapshots rs JOIN exams e ON e.id=rs.exam_id AND e.school_id=rs.school_id
        JOIN students s ON s.id=rs.student_id AND s.school_id=rs.school_id
        JOIN classes c ON c.id=rs.class_id AND c.school_id=rs.school_id
        LEFT JOIN sections sec ON sec.id=rs.section_id AND sec.school_id=rs.school_id
        WHERE rs.school_id=$1 AND rs.exam_id=$2 AND rs.student_id=$3 AND rs.status='published'
          AND ($4::uuid IS NULL OR c.branch_id=$4)`,
        [req.auth.schoolId, req.params.examId, req.params.studentId, req.auth.branchId || null]);
      if (!rows.length) return res.status(404).json({ error: 'Published report card not found' });
      const card = rows[0];
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(card.examName)} - ${escapeHtml(card.studentName)}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#172033}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #cbd5e1;padding:10px;text-align:left}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.box{border:1px solid #cbd5e1;padding:12px}</style></head><body><h1>${escapeHtml(card.examName)}</h1><p><b>Student:</b> ${escapeHtml(card.studentName)}<br><b>Admission No:</b> ${escapeHtml(card.admissionNo)}<br><b>Class:</b> ${escapeHtml(card.className)} <b>Section:</b> ${escapeHtml(card.sectionName || '')}</p><div class="summary"><div class="box">Marks<br><b>${escapeHtml(card.marksObtained)} / ${escapeHtml(card.maxMarks)}</b></div><div class="box">Percentage<br><b>${escapeHtml(card.percentage)}%</b></div><div class="box">Grade<br><b>${escapeHtml(card.grade || '-')}</b></div><div class="box">Rank<br><b>${escapeHtml(card.rankPosition || '-')}</b></div></div><p>Subjects marked: ${escapeHtml(card.subjectsMarked)} / ${escapeHtml(card.subjectsTotal)}</p><script>window.addEventListener('load',()=>window.print())</script></body></html>`;
      res.type('html').send(html);
    } catch (err) { next(err); }
  });
}

module.exports = { registerReportCardRoutes, escapeHtml };