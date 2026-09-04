const { authenticate, requireRoles } = require('./auth');

function registerFeeRoutes(app, pool) {
  const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

  app.get('/api/fee-heads', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT id,code,name,description,is_active AS "isActive" FROM fee_heads WHERE school_id=$1 AND is_active=true ORDER BY name`, [req.auth.schoolId]);
      res.json({ feeHeads: rows });
    } catch(err){ next(err); }
  });

  app.post('/api/fee-heads', authenticate, requireRoles(...financeRoles), async (req,res,next) => {
    try {
      const { name, code, description=null } = req.body || {};
      if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
      const { rows } = await pool.query(`INSERT INTO fee_heads (school_id,name,code,description) VALUES ($1,$2,$3,$4) RETURNING id,name,code,description,is_active AS "isActive"`, [req.auth.schoolId,String(name).trim(),String(code).trim().toUpperCase(),description]);
      res.status(201).json({ feeHead: rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/fees/student/:studentId', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount" FROM fee_invoices i JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id WHERE i.school_id=$1 AND i.student_id=$2 ORDER BY i.invoice_date DESC`, [req.auth.schoolId,req.params.studentId]);
      res.json({ invoices: rows, totalBalance: rows.reduce((sum,r)=>sum+Number(r.balanceAmount||0),0) });
    } catch(err){ next(err); }
  });
}
module.exports = { registerFeeRoutes };
