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

  app.get('/api/fee-structures', authenticate, async (req,res,next) => {
    try {
      const { sessionId=null, classId=null } = req.query;
      const params=[req.auth.schoolId, req.auth.branchId || null];
      let sql=`SELECT fs.id,fs.session_id AS "sessionId",fs.class_id AS "classId",c.name AS "className",fs.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",fh.code AS "feeHeadCode",fs.amount,fs.frequency,fs.due_day AS "dueDay",fs.branch_id AS "branchId" FROM fee_structures fs JOIN classes c ON c.id=fs.class_id AND c.school_id=fs.school_id JOIN fee_heads fh ON fh.id=fs.fee_head_id AND fh.school_id=fs.school_id WHERE fs.school_id=$1 AND ($2::uuid IS NULL OR fs.branch_id=$2 OR fs.branch_id IS NULL)`;
      if(sessionId){params.push(sessionId);sql+=` AND fs.session_id=$${params.length}`;}
      if(classId){params.push(classId);sql+=` AND fs.class_id=$${params.length}`;}
      sql+=' ORDER BY c.name,fh.name,fs.frequency';
      const { rows }=await pool.query(sql,params); res.json({feeStructures:rows});
    } catch(err){next(err)}
  });

  app.post('/api/fee-structures', authenticate, requireRoles(...financeRoles), async (req,res,next) => {
    try {
      const { sessionId,classId,feeHeadId,amount,frequency='annual',dueDay=null,branchId=null }=req.body||{};
      if(!sessionId||!classId||!feeHeadId||amount===undefined) return res.status(400).json({error:'sessionId, classId, feeHeadId and amount are required'});
      const effectiveBranch=branchId||req.auth.branchId||null;
      const {rows:cls}=await pool.query(`SELECT id,branch_id FROM classes WHERE id=$1 AND school_id=$2`,[classId,req.auth.schoolId]);
      if(!cls.length) return res.status(404).json({error:'Class not found'});
      if(effectiveBranch && cls[0].branch_id && cls[0].branch_id!==effectiveBranch) return res.status(403).json({error:'Class belongs to another branch'});
      if(effectiveBranch && branchId && branchId!==req.auth.branchId && !['super_admin','principal','admin'].includes(req.auth.role)) return res.status(403).json({error:'Cannot create fee structure for another branch'});
      const {rows}=await pool.query(`INSERT INTO fee_structures (school_id,session_id,class_id,fee_head_id,amount,frequency,due_day,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id,session_id AS "sessionId",class_id AS "classId",fee_head_id AS "feeHeadId",amount,frequency,due_day AS "dueDay",branch_id AS "branchId"`,[req.auth.schoolId,sessionId,classId,feeHeadId,Number(amount),frequency,dueDay,effectiveBranch]);
      if(!rows.length) return res.status(409).json({error:'Fee structure already exists for this class, fee head, frequency and branch'});
      res.status(201).json({feeStructure:rows[0]});
    }catch(err){next(err)}
  });

  app.get('/api/fees/student/:studentId', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,i.total_amount AS "totalAmount",i.discount_amount AS "discountAmount",i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount",i.branch_id AS "branchId" FROM fee_invoices i JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id WHERE i.school_id=$1 AND i.student_id=$2 AND ($3::uuid IS NULL OR i.branch_id=$3 OR i.branch_id IS NULL) ORDER BY i.invoice_date DESC,i.created_at DESC`, [req.auth.schoolId,req.params.studentId,req.auth.branchId||null]);
      res.json({ invoices: rows, totalBalance: rows.reduce((sum,r)=>sum+Number(r.balanceAmount||0),0) });
    } catch(err){ next(err); }
  });

  app.post('/api/fees/invoices', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try{
      const {studentId,sessionId,discountAmount=0,dueDate=null,items=[]}=req.body||{};
      if(!studentId||!sessionId) return res.status(400).json({error:'studentId and sessionId are required'});
      await client.query('BEGIN');
      const {rows:students}=await client.query(`SELECT s.id,s.branch_id,e.section_id,sec.class_id FROM students s JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$3 AND e.status='active' JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id WHERE s.id=$1 AND s.school_id=$2 AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL) LIMIT 1`,[studentId,req.auth.schoolId,sessionId,req.auth.branchId||null]);
      if(!students.length){await client.query('ROLLBACK');return res.status(404).json({error:'Active student enrollment not found for this session/branch'});}
      const student=students[0];
      let invoiceItems=Array.isArray(items)&&items.length?items:null;
      if(!invoiceItems){
        const {rows}=await client.query(`SELECT fee_head_id AS "feeHeadId",name AS description,amount FROM fee_structures fs JOIN fee_heads fh ON fh.id=fs.fee_head_id WHERE fs.school_id=$1 AND fs.session_id=$2 AND fs.class_id=$3 AND ($4::uuid IS NULL OR fs.branch_id=$4 OR fs.branch_id IS NULL)`,[req.auth.schoolId,sessionId,student.class_id,req.auth.branchId||null]);
        invoiceItems=rows;
      }
      if(!invoiceItems.length){await client.query('ROLLBACK');return res.status(400).json({error:'No fee items found for the student class'});}
      const total=invoiceItems.reduce((s,x)=>s+Number(x.amount||0),0); const discount=Math.max(0,Math.min(total,Number(discountAmount||0))); const net=total-discount;
      const invoiceNo=`INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString(36).toUpperCase()}`;
      const {rows:inv}=await client.query(`INSERT INTO fee_invoices (school_id,student_id,session_id,branch_id,invoice_no,due_date,total_amount,discount_amount,net_amount,balance_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,invoice_no AS "invoiceNo",net_amount AS "netAmount",balance_amount AS "balanceAmount",status`,[req.auth.schoolId,studentId,sessionId,req.auth.branchId||student.branch_id||null,invoiceNo,dueDate,total,discount,net]);
      for(const item of invoiceItems){if(!item.feeHeadId||Number(item.amount)<0) throw Object.assign(new Error('Invalid invoice item'),{statusCode:400});await client.query(`INSERT INTO fee_invoice_items (school_id,invoice_id,fee_head_id,description,amount) VALUES ($1,$2,$3,$4,$5)`,[req.auth.schoolId,inv[0].id,item.feeHeadId,item.description||null,Number(item.amount)]);}
      await client.query('COMMIT');res.status(201).json({invoice:inv[0]});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });

  app.get('/api/fees/invoices/:invoiceId', authenticate, async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,i.total_amount AS "totalAmount",i.discount_amount AS "discountAmount",i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount",s.id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",i.branch_id AS "branchId" FROM fee_invoices i JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id WHERE i.id=$1 AND i.school_id=$2 AND ($3::uuid IS NULL OR i.branch_id=$3 OR i.branch_id IS NULL)`,[req.params.invoiceId,req.auth.schoolId,req.auth.branchId||null]);if(!rows.length)return res.status(404).json({error:'Invoice not found'});const items=await pool.query(`SELECT ii.id,ii.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",ii.description,ii.amount FROM fee_invoice_items ii JOIN fee_heads fh ON fh.id=ii.fee_head_id WHERE ii.invoice_id=$1 AND ii.school_id=$2 ORDER BY fh.name`,[req.params.invoiceId,req.auth.schoolId]);res.json({invoice:rows[0],items:items.rows})}catch(err){next(err)}});

  app.post('/api/fees/payments', authenticate, requireRoles(...financeRoles), async(req,res,next)=>{const client=await pool.connect();try{const {invoiceId,amount,method,transactionRef=null,remarks=null}=req.body||{};if(!invoiceId||!amount||!method)return res.status(400).json({error:'invoiceId, amount and method are required'});await client.query('BEGIN');const {rows}=await client.query(`SELECT id,net_amount,paid_amount,balance_amount,branch_id FROM fee_invoices WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL) FOR UPDATE`,[invoiceId,req.auth.schoolId,req.auth.branchId||null]);if(!rows.length)throw Object.assign(new Error('Invoice not found'),{statusCode:404});const inv=rows[0];const paid=Number(amount);if(paid<=0||paid>Number(inv.balance_amount))throw Object.assign(new Error('Payment amount exceeds invoice balance'),{statusCode:400});const receiptNo=`RCPT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString(36).toUpperCase()}`;await client.query(`INSERT INTO fee_payments (school_id,invoice_id,branch_id,receipt_no,amount,method,transaction_ref,received_by,remarks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[req.auth.schoolId,invoiceId,req.auth.branchId||inv.branch_id||null,receiptNo,paid,method,transactionRef,req.auth.sub,remarks]);const newPaid=Number(inv.paid_amount)+paid;const balance=Number(inv.net_amount)-newPaid;const status=balance<=0?'paid':newPaid>0?'partial':'unpaid';const {rows:updated}=await client.query(`UPDATE fee_invoices SET paid_amount=$1,balance_amount=$2,status=$3 WHERE id=$4 RETURNING id,invoice_no AS "invoiceNo",paid_amount AS "paidAmount",balance_amount AS "balanceAmount",status`,[newPaid,Math.max(0,balance),status,invoiceId]);await client.query('COMMIT');res.status(201).json({receipt:{receiptNo,amount:paid,method},invoice:updated[0]})}catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}});

  app.get('/api/fees/reports/collection', authenticate, requireRoles(...financeRoles), async(req,res,next)=>{try{const {from,to}=req.query;const params=[req.auth.schoolId,req.auth.branchId||null];let sql=`SELECT p.receipt_no AS "receiptNo",p.paid_on AS "paidOn",p.amount,p.method,p.transaction_ref AS "transactionRef",i.invoice_no AS "invoiceNo",s.admission_no AS "admissionNo",s.full_name AS "studentName" FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id AND i.school_id=p.school_id JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id WHERE p.school_id=$1 AND ($2::uuid IS NULL OR p.branch_id=$2 OR p.branch_id IS NULL)`;if(from){params.push(from);sql+=` AND p.paid_on::date >= $${params.length}`;}if(to){params.push(to);sql+=` AND p.paid_on::date <= $${params.length}`;}sql+=' ORDER BY p.paid_on DESC';const {rows}=await pool.query(sql,params);res.json({payments:rows,totalCollected:rows.reduce((s,r)=>s+Number(r.amount||0),0)})}catch(err){next(err)}});
}
module.exports={registerFeeRoutes};
