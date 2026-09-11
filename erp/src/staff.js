const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function registerStaffRoutes(app, pool) {
  const managers = ['super_admin','principal','admin'];
  const roles = ['principal','admin','teacher','office_staff','accountant','driver'];

  app.get('/api/staff', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id,u.email,u.phone,u.role,u.status,u.branch_id AS "branchId",
                b.name AS "branchName",u.last_login_at AS "lastLoginAt"
         FROM users u
         LEFT JOIN branches b ON b.id=u.branch_id
         WHERE u.school_id=$1
           AND u.role = ANY($2::text[])
           AND ($3::uuid IS NULL OR u.branch_id=$3 OR u.branch_id IS NULL)
         ORDER BY u.role,u.email`,
        [req.auth.schoolId, roles, req.auth.branchId || null]
      );
      res.json({ staff: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/staff', authenticate, requireRoles(...managers), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      const phone = String(b.phone || '').trim();
      const password = String(b.password || '');
      const role = String(b.role || '').trim().toLowerCase();
      const branchId = b.branchId || req.auth.branchId || null;
      if ((!email && !phone) || password.length < 6 || !roles.includes(role)) {
        return res.status(400).json({ error: 'email or phone, password (min 6), and a valid staff role are required' });
      }
      if (role === 'principal' && req.auth.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can create a principal' });
      }

      await client.query('BEGIN');
      if (branchId) {
        const branch = await client.query(
          `SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,
          [branchId, req.auth.schoolId]
        );
        if (!branch.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid branch' });
        }
      }

      const user = await client.query(
        `INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status)
         VALUES($1,$2,$3,$4,$5,$6,'active')
         RETURNING id,email,phone,role,status,branch_id AS "branchId"`,
        [req.auth.schoolId, branchId, email || null, phone || null, await hashPassword(password), role]
      );

      // Teacher assignments use the teacher table as their stable identity.
      // Keep the row minimal so the staff account can immediately receive subject/class assignments.
      if (role === 'teacher') {
        await client.query(
          `INSERT INTO teachers(school_id,user_id,branch_id,status)
           VALUES($1,$2,$3,'active')
           ON CONFLICT (user_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,status='active'`,
          [req.auth.schoolId, user.rows[0].id, branchId]
        );
      }

      await client.query(
        `INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
         VALUES($1,'staff',$2,'create',$3::jsonb,$4)`,
        [req.auth.schoolId, user.rows[0].id, JSON.stringify(user.rows[0]), req.auth.sub]
      );

      await client.query('COMMIT');
      res.status(201).json({ staff: user.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') return res.status(409).json({ error: 'Staff email/phone or teacher account already exists' });
      next(err);
    } finally {
      client.release();
    }
  });

  app.patch('/api/staff/:id', authenticate, requireRoles(...managers), async (req,res,next) => {
    try {
      const b = req.body || {};
      const allowed = ['email','phone','status','branchId'];
      const keys = allowed.filter(k => Object.prototype.hasOwnProperty.call(b,k));
      if (!keys.length) return res.status(400).json({ error:'No supported fields supplied' });

      if (b.branchId) {
        const branch = await pool.query(
          `SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,
          [b.branchId, req.auth.schoolId]
        );
        if (!branch.rowCount) return res.status(400).json({ error:'Invalid branch' });
      }

      const column = {email:'email',phone:'phone',status:'status',branchId:'branch_id'};
      const values = keys.map(k => k === 'email' ? String(b[k]).trim().toLowerCase() : b[k] ?? null);
      const sets = keys.map((k,i) => `${column[k]}=$${i+1}`);
      values.push(req.params.id, req.auth.schoolId);

      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(',')},updated_at=now()
         WHERE id=$${values.length-1} AND school_id=$${values.length}
         RETURNING id,email,phone,role,status,branch_id AS "branchId"`,
        values
      );
      if (!rows.length) return res.status(404).json({ error:'Staff account not found' });
      res.json({ staff: rows[0] });
    } catch (err) { next(err); }
  });
}

module.exports = { registerStaffRoutes };
