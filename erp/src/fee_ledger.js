const { authenticate, requireRoles } = require('./auth');

function registerFeeLedgerRoutes(app, pool) {
  const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

  app.get('/api/fees/student/:studentId/ledger', authenticate, requireRoles(...financeRoles), async (req,res,next) => {
    try {
      const branchId=req.auth.branchId||null;
      const student=await pool.query(`SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.status,b.name AS "branchName"
        FROM students s LEFT JOIN branches b ON b.id=s.branch_id AND b.school_id=s.school_id
        WHERE s.id=$1 AND s.school_id=$2 AND ($3::uuid IS NULL OR s.branch_id=$3 OR s.branch_id IS NULL) LIMIT 1`,[req.params.studentId,req.auth.schoolId,branchId]);
      if(!student.rowCount)return res.status(404).json({error:'Student not found'});
      const invoices=await pool.query(`SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,
        i.total_amount AS "totalAmount",i.discount_amount AS "discountAmount",i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount",
        COALESCE(json_agg(json_build_object('feeHeadName',fh.name,'description',ii.description,'amount',ii.amount) ORDER BY fh.name) FILTER(WHERE ii.id IS NOT NULL),'[]') AS items
        FROM fee_invoices i LEFT JOIN fee_invoice_items ii ON ii.invoice_id=i.id AND ii.school_id=i.school_id
        LEFT JOIN fee_heads fh ON fh.id=ii.fee_head_id AND fh.school_id=ii.school_id
        WHERE i.school_id=$1 AND i.student_id=$2 AND ($3::uuid IS NULL OR i.branch_id=$3 OR i.branch_id IS NULL)
        GROUP BY i.id ORDER BY i.invoice_date DESC,i.invoice_no DESC`,[req.auth.schoolId,req.params.studentId,branchId]);
      const payments=await pool.query(`SELECT p.id,p.receipt_no AS "receiptNo",p.paid_on AS "paidOn",p.amount,p.method,p.transaction_ref AS "transactionRef",p.remarks,p.invoice_id AS "invoiceId",i.invoice_no AS "invoiceNo"
        FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id AND i.school_id=p.school_id
        WHERE p.school_id=$1 AND i.student_id=$2 AND ($3::uuid IS NULL OR COALESCE(p.branch_id,i.branch_id)=$3 OR COALESCE(p.branch_id,i.branch_id) IS NULL)
        ORDER BY p.paid_on DESC,p.created_at DESC`,[req.auth.schoolId,req.params.studentId,branchId]);
      const totalInvoiced=invoices.rows.reduce((n,x)=>n+Number(x.netAmount||0),0);
      const totalPaid=payments.rows.reduce((n,x)=>n+Number(x.amount||0),0);
      const balance=Math.max(0,totalInvoiced-totalPaid);
      res.json({student:student.rows[0],summary:{totalInvoiced,totalPaid,balance,invoiceCount:invoices.rowCount,paymentCount:payments.rowCount},invoices:invoices.rows,payments:payments.rows});
    }catch(err){next(err)}
  });
}
module.exports={registerFeeLedgerRoutes};
