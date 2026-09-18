const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

const managers = ['super_admin', 'principal', 'admin', 'office_staff'];
const MAX_ROWS = 1000;

function csvRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const parse = line => {
    const cells = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(value.trim()); value = ''; }
      else value += ch;
    }
    cells.push(value.trim());
    return cells;
  };
  const headers = parse(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
  return lines.slice(1).map(line => Object.fromEntries(parse(line).map((v, i) => [headers[i], v])));
}

function normalizeRows(body) {
  if (Array.isArray(body?.rows)) return body.rows;
  if (typeof body?.csv === 'string') return csvRows(body.csv);
  return [];
}

function registerBulkImportRoutes(app, pool) {
  app.post('/api/import/students/preview', authenticate, requireRoles(...managers), async (req, res) => {
    const rows = normalizeRows(req.body);
    const errors = [];
    if (!rows.length) return res.status(400).json({ error: 'rows or csv is required' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Maximum ${MAX_ROWS} rows per import` });
    rows.forEach((row, index) => {
      if (!String(row.fullName || '').trim()) errors.push({ row: index + 1, field: 'fullName', error: 'Required' });
      if (!String(row.admissionNo || '').trim()) errors.push({ row: index + 1, field: 'admissionNo', error: 'Required' });
      if (!row.sessionId) errors.push({ row: index + 1, field: 'sessionId', error: 'Required' });
      if (!row.sectionId) errors.push({ row: index + 1, field: 'sectionId', error: 'Required' });
    });
    res.json({ entity: 'students', total: rows.length, valid: rows.length - errors.length, errors, rows });
  });

  app.post('/api/import/students', authenticate, requireRoles(...managers), async (req, res, next) => {
    const rows = normalizeRows(req.body);
    if (!rows.length || rows.length > MAX_ROWS) return res.status(400).json({ error: `1-${MAX_ROWS} rows are required` });
    if (req.body?.dryRun) return res.json({ dryRun: true, total: rows.length, rows });
    const client = await pool.connect(); let imported = 0; const errors = [];
    try {
      await client.query('BEGIN');
      for (const [index, row] of rows.entries()) {
        try {
          const name = String(row.fullName || '').trim(); const admissionNo = String(row.admissionNo || '').trim();
          if (!name || !admissionNo || !row.sessionId || !row.sectionId) throw new Error('fullName, admissionNo, sessionId and sectionId are required');
          const branchId = row.branchId || req.auth.branchId || null;
          const valid = await client.query(`SELECT sec.id FROM sections sec JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id JOIN academic_sessions a ON a.school_id=sec.school_id WHERE sec.id=$1 AND sec.school_id=$2 AND a.id=$3 AND ($4::uuid IS NULL OR c.branch_id=$4 OR c.branch_id IS NULL)`, [row.sectionId, req.auth.schoolId, row.sessionId, branchId]);
          if (!valid.rowCount) throw new Error('Invalid section/session/branch');
          const student = await client.query(`INSERT INTO students(school_id,branch_id,admission_no,roll_no,full_name,date_of_birth,gender,admission_date,status) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,'active') ON CONFLICT(school_id,admission_no) DO UPDATE SET branch_id=COALESCE(EXCLUDED.branch_id,students.branch_id),roll_no=EXCLUDED.roll_no,full_name=EXCLUDED.full_name,date_of_birth=EXCLUDED.date_of_birth,gender=EXCLUDED.gender,status='active',updated_at=now() RETURNING id`, [req.auth.schoolId, branchId, admissionNo, row.rollNo || null, name, row.dateOfBirth || null, row.gender || null]);
          await client.query(`INSERT INTO enrollments(school_id,branch_id,student_id,session_id,section_id,roll_no,status) VALUES($1,$2,$3,$4,$5,$6,'active') ON CONFLICT(student_id,session_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,section_id=EXCLUDED.section_id,roll_no=EXCLUDED.roll_no,status='active'`, [req.auth.schoolId, branchId, student.rows[0].id, row.sessionId, row.sectionId, row.rollNo || null]);
          imported += 1;
        } catch (error) { errors.push({ row: index + 1, error: error.message }); }
      }
      await client.query('COMMIT');
      res.status(201).json({ entity: 'students', total: rows.length, imported, errors });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  app.post('/api/import/staff/preview', authenticate, requireRoles(...managers), async (req, res) => {
    const rows = normalizeRows(req.body); const errors = [];
    if (!rows.length) return res.status(400).json({ error: 'rows or csv is required' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `Maximum ${MAX_ROWS} rows per import` });
    rows.forEach((row, index) => {
      if (!String(row.email || row.phone || '').trim()) errors.push({ row: index + 1, field: 'email/phone', error: 'Required' });
      if (!String(row.password || '').trim() || String(row.password).length < 6) errors.push({ row: index + 1, field: 'password', error: 'Minimum 6 characters' });
      if (!['principal', 'admin', 'teacher', 'office_staff', 'accountant', 'driver'].includes(String(row.role || '').toLowerCase())) errors.push({ row: index + 1, field: 'role', error: 'Invalid role' });
    });
    res.json({ entity: 'staff', total: rows.length, valid: rows.length - errors.length, errors, rows });
  });

  app.post('/api/import/staff', authenticate, requireRoles(...managers), async (req, res, next) => {
    const rows = normalizeRows(req.body);
    if (!rows.length || rows.length > MAX_ROWS) return res.status(400).json({ error: `1-${MAX_ROWS} rows are required` });
    if (req.body?.dryRun) return res.json({ dryRun: true, total: rows.length, rows });
    const client = await pool.connect(); let imported = 0; const errors = [];
    try {
      await client.query('BEGIN');
      for (const [index, row] of rows.entries()) {
        try {
          const role = String(row.role || '').toLowerCase(); const email = String(row.email || '').trim().toLowerCase(); const phone = String(row.phone || '').trim();
          if ((!email && !phone) || String(row.password || '').length < 6 || !['principal', 'admin', 'teacher', 'office_staff', 'accountant', 'driver'].includes(role)) throw new Error('Invalid email/phone, password or role');
          if (role === 'principal' && req.auth.role !== 'super_admin') throw new Error('Only Super Admin can import principals');
          const branchId = row.branchId || req.auth.branchId || null;
          const user = await client.query(`INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,'active') ON CONFLICT DO NOTHING RETURNING id`, [req.auth.schoolId, branchId, email || null, phone || null, await hashPassword(String(row.password)), role]);
          if (!user.rowCount) throw new Error('Email or phone already exists');
          if (role === 'teacher') await client.query(`INSERT INTO teachers(school_id,user_id,branch_id,full_name,status) VALUES($1,$2,$3,$4,'active') ON CONFLICT(user_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,full_name=EXCLUDED.full_name,status='active'`, [req.auth.schoolId, user.rows[0].id, branchId, String(row.fullName || email || phone).slice(0, 200)]);
          imported += 1;
        } catch (error) { errors.push({ row: index + 1, error: error.message }); }
      }
      await client.query('COMMIT'); res.status(201).json({ entity: 'staff', total: rows.length, imported, errors });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client.release(); }
  });
}

module.exports = { registerBulkImportRoutes, csvRows, normalizeRows };