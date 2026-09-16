const { authenticate, requireRoles } = require('./auth');

const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

function registerFeeRoutes(app, pool) {
  app.get('/api/fee-heads', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const { rows } = await pool.query(
        'SELECT id,name,code,description,status FROM fee_heads WHERE school_id=$1 ORDER BY name',
        [req.auth.schoolId]
      );
      res.json({feeHeads:rows});
    } catch(err){ next(err); }
  });

  app.post('/api/fee-heads', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const b=req.body||{}, name=String(b.name||'').trim(), code=String(b.code||'').trim().toUpperCase();
      if(!name||!code) return res.status(400).json({error:'name and code are required'});
      const { rows }=await pool.query(
        'INSERT INTO fee_heads(school_id,name,code,description) VALUES($1,$2,$3,$4) RETURNING id,name,code,description,status',
        [req.auth.schoolId,name,code,b.description||null]
      );
      res.status(201).json({feeHead:rows[0]});
    } catch(err){ if(err.code==='23505') return res.status(409).json({error:'Fee head code already exists'}); next(err); }
  });

  app.get('/api/fee-structures', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const p=[req.auth.schoolId], conditions=['fs.school_id=$1','fs.status=\'active\''];
      if(req.query.sessionId){p.push(req.query.sessionId);conditions.push('fs.session_id=$'+p.length);}
      if(req.auth.branchId){p.push(req.auth.branchId);conditions.push('(fs.branch_id=$'+p.length+' OR fs.branch_id IS NULL)');}
      const {rows}=await pool.query(
        'SELECT fs.id,fs.session_id AS "sessionId",a.name AS "sessionName",fs.class_id AS "classId",c.name AS "className",fs.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",fh.code AS "feeHeadCode",fs.frequency,fs.amount,fs.due_day AS "dueDay",fs.branch_id AS "branchId",b.name AS "branchName" FROM fee_structures fs JOIN academic_sessions a ON a.id=fs.session_id JOIN classes c ON c.id=fs.class_id JOIN fee_heads fh ON fh.id=fs.fee_head_id LEFT JOIN branches b ON b.id=fs.branch_id WHERE '+conditions.join(' AND ')+' ORDER BY c.name,fh.name,fs.frequency',
        p
      );
      res.json({feeStructures:rows});
    } catch(err){next(err);}
  });

  app.post('/api/fee-structures', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const b=req.body||{}, amount=Number(b.amount);
      if(!b.sessionId||!b.classId||!b.feeHeadId) return res.status(400).json({error:'sessionId, classId and feeHeadId are required'});
      if(!Number.isFinite(amount)||amount<0) return res.status(400).json({error:'amount must be a non-negative number'});
      const branchId=b.branchId||req.auth.branchId||null;
      const valid=await pool.query('SELECT c.id FROM classes c JOIN academic_sessions a ON a.school_id=c.school_id WHERE c.id=$1 AND c.school_id=$2 AND a.id=$3 AND ($4::uuid IS NULL OR c.branch_id=$4 OR c.branch_id IS NULL)',[b.classId,req.auth.schoolId,b.sessionId,branchId]);
      if(!valid.rowCount)return res.status(400).json({error:'Class/session/branch scope is invalid'});
      const {rows}=await pool.query('INSERT INTO fee_structures(school_id,branch_id,session_id,class_id,fee_head_id,frequency,amount,due_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,session_id AS "sessionId",class_id AS "classId",fee_head_id AS "feeHeadId",frequency,amount,due_day AS "dueDay",branch_id AS "branchId",status',[req.auth.schoolId,branchId,b.sessionId,b.classId,b.feeHeadId,b.frequency||'annual',amount,b.dueDay||null]);
      res.status(201).json({feeStructure:rows[0]});
    } catch(err){if(err.code==='23505')return res.status(409).json({error:'Matching fee structure already exists'});next(err);}
  });

  app.post('/api/fees/invoices', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try{
      const b=req.body||{}; if(!b.studentId||!b.sessionId)return res.status(400).json({error:'studentId and sessionId are required'});
      const branchId=b.branchId||req.auth.branchId||null;
      await client.query('BEGIN');
      const student=await client.query('SELECT s.id,e.section_id,c.id AS class_id FROM students s JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$3 AND e.status=\'active\' JOIN sections sec ON sec.id=e.section_id JOIN classes c ON c.id=sec.class_id WHERE s.id=$1 AND s.school_id=$2 AND s.status=\'active\' AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL)',[b.studentId,req.auth.schoolId,b.sessionId,branchId]);
      if(!student.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Student is not enrolled in the selected session/branch'});}
      const structures=await client.query('SELECT fs.fee_head_id,fh.name fee_head_name,fs.amount,fs.due_day FROM fee_structures fs JOIN fee_heads fh ON fh.id=fs.fee_head_id WHERE fs.school_id=$1 AND fs.session_id=$2 AND fs.class_id=$3 AND fs.status=\'active\' AND ($4::uuid IS NULL OR fs.branch_id=$4 OR fs.branch_id IS NULL)',[req.auth.schoolId,b.sessionId,student.rows[0].class_id,branchId]);
      if(!structures.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'No active fee structure for this student class/session'});}
      const discount=Math.max(0,Number(b.discountAmount||0)), gross=structures.rows.reduce((s,x)=>s+Number(x.amount),0), net=Math.max(0,gross-discount);
      if(discount>gross){await client.query('ROLLBACK');return res.status(400).json({error:'Discount cannot exceed gross amount'});}
      const seq=(await client.query("SELECT nextval('fee_invoice_no_seq')")).rows[0].nextval;
      const invoiceNo='INV-'+new Date().getFullYear()+'-'+String(seq).padStart(6,'0');
      const dueDay=structures.rows.find(x=>x.due_day)?.due_day||null;
      let dueDate=null; if(dueDay){const d=new Date();const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();dueDate=new Date(d.getFullYear(),d.getMonth(),Math.min(Number(dueDay),last)).toISOString().slice(0,10);}
      const inv=await client.query('INSERT INTO fee_invoices(school_id,branch_id,student_id,session_id,invoice_no,due_date,gross_amount,discount_amount,net_amount,balance_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING id,invoice_no AS "invoiceNo",invoice_date AS "invoiceDate",due_date AS "dueDate",gross_amount AS "grossAmount",discount_amount AS "discountAmount",net_amount AS "netAmount",paid_amount AS "paidAmount",balance_amount AS "balanceAmount",status',[req.auth.schoolId,branchId,b.studentId,b.sessionId,invoiceNo,dueDate,gross,discount,net,req.auth.sub]);
      for(const s of structures.rows) await client.query('INSERT INTO fee_invoice_items(school_id,invoice_id,fee_head_id,description,amount) VALUES($1,$2,$3,$4,$5)',[req.auth.schoolId,inv.rows[0].id,s.fee_head_id,s.fee_head_name,s.amount]);
      await client.query('INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,\'fee_invoice\',$2,\'create\',$3::jsonb,$4)',[req.auth.schoolId,inv.rows[0].id,JSON.stringify({invoice:inv.rows[0]}),req.auth.sub]);
      await client.query('COMMIT'); res.status(201).json({invoice:inv.rows[0]});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
  });

  app.get('/api/fees/student/:studentId', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try{
      const p=[req.auth.schoolId,req.params.studentId], scope=req.auth.branchId?' AND (i.branch_id=$3 OR i.branch_id IS NULL)':'';
      if(req.auth.branchId)p.push(req.auth.branchId);
      const {rows}=await pool.query('SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount",COALESCE(json_agg(json_build_object(\'feeHeadName\',it.description,\'amount\',it.amount)) FILTER(WHERE it.id IS NOT NULL),\'[]\') items FROM fee_invoices i LEFT JOIN fee_invoice_items it ON it.invoice_id=i.id WHERE i.school_id=$1 AND i.student_id=$2'+scope+' GROUP BY i.id ORDER BY i.invoice_date DESC',p);
      res.json({invoices:rows,totalBalance:rows.reduce((s,x)=>s+Number(x.balanceAmount),0)});
    }catch(err){next(err);}
  });

  app.get('/api/fees/invoices/:id', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try{
      const {rows}=await pool.query('SELECT i.id,i.invoice_no AS "invoiceNo",i.invoice_date AS "invoiceDate",i.due_date AS "dueDate",i.status,i.gross_amount AS "grossAmount",i.discount_amount AS "discountAmount",i.net_amount AS "netAmount",i.paid_amount AS "paidAmount",i.balance_amount AS "balanceAmount",s.full_name AS "studentName",s.admission_no AS "admissionNo",COALESCE(json_agg(json_build_object(\'feeHeadName\',it.description,\'amount\',it.amount)) FILTER(WHERE it.id IS NOT NULL),\'[]\') items FROM fee_invoices i JOIN students s ON s.id=i.student_id AND s.school_id=i.school_id LEFT JOIN fee_invoice_items it ON it.invoice_id=i.id WHERE i.school_id=$1 AND i.id=$2 GROUP BY i.id,s.full_name,s.admission_no',[req.auth.schoolId,req.params.id]);
      if(!rows.length)return res.status(404).json({error:'Invoice not found'}); res.json({invoice:rows[0]});
    }catch(err){next(err);}
  });

  app.post('/api/fees/payments', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try{
      const b=req.body||{}, amount=Number(b.amount); if(!b.invoiceId||!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'invoiceId and positive amount are required'});
      await client.query('BEGIN');
      const inv=await client.query('SELECT * FROM fee_invoices WHERE id=$1 AND school_id=$2 FOR UPDATE',[b.invoiceId,req.auth.schoolId]);
      if(!inv.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Invoice not found'});}
      const row=inv.rows[0]; if(row.status==='cancelled')return res.status(400).json({error:'Cancelled invoice cannot receive payment'});
      if(amount>Number(row.balance_amount)+0.005)return res.status(400).json({error:'Payment exceeds invoice balance'});
      const seq=(await client.query("SELECT nextval('fee_receipt_no_seq')")).rows[0].nextval;
      const receiptNo='RCT-'+new Date().getFullYear()+'-'+String(seq).padStart(6,'0');
      const payment=await client.query('INSERT INTO fee_payments(school_id,branch_id,invoice_id,receipt_no,amount,method,transaction_ref,collected_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,receipt_no AS "receiptNo",amount,method,transaction_ref AS "transactionRef",paid_on AS "paidOn"',[req.auth.schoolId,row.branch_id,row.id,receiptNo,amount,b.method||'cash',b.transactionRef||null,req.auth.sub]);
      const paid=Number(row.paid_amount)+amount,balance=Math.max(0,Number(row.net_amount)-paid),status=balance<=0.005?'paid':'partial';
      await client.query('UPDATE fee_invoices SET paid_amount=$1,balance_amount=$2,status=$3,updated_at=now() WHERE id=$4',[paid,balance,status,row.id]);
      await client.query('INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,\'fee_payment\',$2,\'create\',$3::jsonb,$4)',[req.auth.schoolId,payment.rows[0].id,JSON.stringify({payment:payment.rows[0],invoiceId:row.id}),req.auth.sub]);
      await client.query('COMMIT'); res.status(201).json({receipt:payment.rows[0],invoiceId:row.id,balanceAmount:balance,status});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err);}finally{client.release();}
  });

  app.get('/api/fees/reports/collection', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try{
      const p=[req.auth.schoolId], c=['p.school_id=$1']; if(req.query.from){p.push(req.query.from);c.push('p.paid_on >= $'+p.length+'::date');} if(req.query.to){p.push(req.query.to);c.push('p.paid_on < ($'+p.length+'::date + interval \'1 day\')');}
      const {rows}=await pool.query('SELECT p.receipt_no AS "receiptNo",p.paid_on AS "paidOn",p.amount,p.method,s.full_name AS "studentName" FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id JOIN students s ON s.id=i.student_id WHERE '+c.join(' AND ')+' ORDER BY p.paid_on DESC',p);
      res.json({totalCollected:rows.reduce((s,x)=>s+Number(x.amount),0),payments:rows});
    }catch(err){next(err);}
  });

  app.get('/api/fees/reports/outstanding', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try{
      const p=[req.auth.schoolId], c=['i.school_id=$1','i.status IN (\'unpaid\',\'partial\')'];
      if(req.query.sessionId){p.push(req.query.sessionId);c.push('i.session_id=$'+p.length);}
      if(req.query.classId){p.push(req.query.classId);c.push('EXISTS(SELECT 1 FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN classes c2 ON c2.id=sec.class_id WHERE e.student_id=i.student_id AND e.session_id=i.session_id AND e.status=\'active\' AND c2.id=$'+p.length+')');}
      if(req.query.onlyOverdue==='true')c.push('i.due_date IS NOT NULL AND i.due_date<CURRENT_DATE');
      const {rows}=await pool.query('SELECT s.admission_no AS "admissionNo",s.full_name AS "studentName",COALESCE(c.name,\'-\') AS "className",COALESCE(sec.name,\'\') AS "sectionName",SUM(i.balance_amount) AS "outstandingAmount",MIN(i.due_date) AS "earliestDueDate",COUNT(*) AS "openInvoices" FROM fee_invoices i JOIN students s ON s.id=i.student_id LEFT JOIN enrollments e ON e.student_id=s.id AND e.session_id=i.session_id AND e.status=\'active\' LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE '+c.join(' AND ')+' GROUP BY s.id,s.admission_no,s.full_name,c.name,sec.name ORDER BY s.full_name',p);
      res.json({totalOutstanding:rows.reduce((s,x)=>s+Number(x.outstandingAmount),0),studentCount:rows.length,students:rows});
    }catch(err){next(err);}
  });

  app.get('/api/fees/reports/due', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try{
      const p=[req.auth.schoolId], c=['i.school_id=$1','i.status IN (\'unpaid\',\'partial\')','i.due_date IS NOT NULL'];
      if(req.query.from){p.push(req.query.from);c.push('i.due_date >= $'+p.length+'::date');} if(req.query.to){p.push(req.query.to);c.push('i.due_date <= $'+p.length+'::date');} if(req.query.sessionId){p.push(req.query.sessionId);c.push('i.session_id=$'+p.length);}
      const {rows}=await pool.query('SELECT i.invoice_no AS "invoiceNo",i.due_date AS "dueDate",i.balance_amount AS "balanceAmount",s.full_name AS "studentName",COALESCE(c.name,\'-\') AS "className",COALESCE(sec.name,\'\') AS "sectionName" FROM fee_invoices i JOIN students s ON s.id=i.student_id LEFT JOIN enrollments e ON e.student_id=s.id AND e.session_id=i.session_id AND e.status=\'active\' LEFT JOIN sections sec ON sec.id=e.section_id LEFT JOIN classes c ON c.id=sec.class_id WHERE '+c.join(' AND ')+' ORDER BY i.due_date,s.full_name',p);
      res.json({totalDue:rows.reduce((s,x)=>s+Number(x.balanceAmount),0),invoices:rows});
    }catch(err){next(err);}
  });
}

module.exports={registerFeeRoutes};
