const { authenticate, requireRoles } = require('./auth');

function registerFeeReceiptRoutes(app, pool) {
  const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

  app.get('/api/fees/payments/:receiptNo/receipt', authenticate, requireRoles(...financeRoles), async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT p.id AS "paymentId", p.receipt_no AS "receiptNo", p.paid_on AS "paidOn",
               p.amount, p.method, p.transaction_ref AS "transactionRef", p.remarks,
               i.id AS "invoiceId", i.invoice_no AS "invoiceNo", i.due_date AS "dueDate",
               i.total_amount AS "totalAmount", i.discount_amount AS "discountAmount",
               i.net_amount AS "netAmount", i.paid_amount AS "paidAmount", i.balance_amount AS "balanceAmount",
               s.id AS "studentId", s.admission_no AS "admissionNo", s.full_name AS "studentName",
               c.name AS "className", sec.name AS "sectionName",
               b.name AS "branchName", b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
               u.name AS "receivedBy"
        FROM fee_payments p
        JOIN fee_invoices i ON i.id=p.invoice_id AND i.school_id=p.school_id
        JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id
        LEFT JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=i.session_id AND e.status='active'
        LEFT JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
        LEFT JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
        LEFT JOIN branches b ON b.id=COALESCE(p.branch_id,i.branch_id) AND b.school_id=p.school_id
        LEFT JOIN users u ON u.id=p.received_by AND u.school_id=p.school_id
        WHERE p.school_id=$1 AND p.receipt_no=$2
          AND ($3::uuid IS NULL OR COALESCE(p.branch_id,i.branch_id)=$3 OR COALESCE(p.branch_id,i.branch_id) IS NULL)
        LIMIT 1`, [req.auth.schoolId, req.params.receiptNo, req.auth.branchId || null]);
      if (!rows.length) return res.status(404).json({ error: 'Receipt not found' });
      const receipt = rows[0];
      const { rows: items } = await pool.query(`
        SELECT ii.id, ii.fee_head_id AS "feeHeadId", fh.name AS "feeHeadName", ii.description, ii.amount
        FROM fee_invoice_items ii
        JOIN fee_heads fh ON fh.id=ii.fee_head_id AND fh.school_id=ii.school_id
        WHERE ii.school_id=$1 AND ii.invoice_id=$2 ORDER BY fh.name`, [req.auth.schoolId, receipt.invoiceId]);
      res.json({ receipt, items });
    } catch (err) { next(err); }
  });
}

module.exports = { registerFeeReceiptRoutes };
