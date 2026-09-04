const { authenticate, requireRoles } = require('./auth');

function registerFeeAssignmentRoutes(app, pool) {
  const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

  app.post('/api/fees/assignments', authenticate, requireRoles(...financeRoles), async (req,res,next) => {
    try {
      const { studentId,sessionId,feeHeadId,amount,frequency='annual',startDate,dueDay=null,branchId=null } = req.body || {};
      if(!studentId||!sessionId||!feeHeadId||amount===undefined||!startDate) return res.status(400).json({error:'studentId, sessionId, feeHeadId, amount and startDate are required'});
      const effectiveBranch=branchId||req.auth.branchId||null;
      const {rows}=await pool.query(`SELECT s.id,s.branch_id,e.section_id,sec.class_id FROM students s JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$3 AND e.status='active' JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id WHERE s.id=$1 AND s.school_id=$2 AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL) LIMIT 1`,[studentId,req.auth.schoolId,sessionId,effectiveBranch]);
      if(!rows.length) return res.status(404).json({error:'Active student enrollment not found for this session/branch'});
      if(effectiveBranch && rows[0].branch_id && rows[0].branch_id!==effectiveBranch) return res.status(403).json({error:'Student belongs to another branch'});
      const {rows:heads}=await pool.query(`SELECT id FROM fee_heads WHERE id=$1 AND school_id=$2 AND is_active=true`,[feeHeadId,req.auth.schoolId]);
      if(!heads.length) return res.status(404).json({error:'Fee head not found'});
      const {rows:created}=await pool.query(`INSERT INTO student_fee_assignments(school_id,student_id,session_id,branch_id,fee_head_id,amount,frequency,start_date,due_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id,student_id AS "studentId",session_id AS "sessionId",branch_id AS "branchId",fee_head_id AS "feeHeadId",amount,frequency,start_date AS "startDate",due_day AS "dueDay",status`,[req.auth.schoolId,studentId,sessionId,effectiveBranch,feeHeadId,Number(amount),frequency,startDate,dueDay]);
      if(!created.length) return res.status(409).json({error:'Fee assignment already exists for this student and fee head'});
      res.status(201).json({assignment:created[0]});
    }catch(err){next(err)}
  });

  app.get('/api/fees/assignments/student/:studentId', authenticate, async(req,res,next)=>{
    try{const {rows}=await pool.query(`SELECT a.id,a.student_id AS "studentId",a.session_id AS "sessionId",a.branch_id AS "branchId",a.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",a.amount,a.frequency,a.start_date AS "startDate",a.end_date AS "endDate",a.due_day AS "dueDay",a.status FROM student_fee_assignments a JOIN fee_heads fh ON fh.id=a.fee_head_id WHERE a.school_id=$1 AND a.student_id=$2 AND ($3::uuid IS NULL OR a.branch_id=$3 OR a.branch_id IS NULL) ORDER BY fh.name,a.start_date DESC`,[req.auth.schoolId,req.params.studentId,req.auth.branchId||null]);res.json({assignments:rows})}catch(err){next(err)}
  });

  app.post('/api/fees/installments/generate', authenticate, requireRoles(...financeRoles), async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const {sessionId,studentId=null,fromDate,toDate}=req.body||{};
      if(!sessionId||!fromDate||!toDate)return res.status(400).json({error:'sessionId, fromDate and toDate are required'});
      await client.query('BEGIN');
      const params=[req.auth.schoolId,sessionId,req.auth.branchId||null,studentId];
      const {rows:assignments}=await client.query(`SELECT a.* FROM student_fee_assignments a WHERE a.school_id=$1 AND a.session_id=$2 AND a.status='active' AND ($3::uuid IS NULL OR a.branch_id=$3 OR a.branch_id IS NULL) AND ($4::uuid IS NULL OR a.student_id=$4) AND a.start_date <= $6::date AND (a.end_date IS NULL OR a.end_date >= $5::date)`,[...params,fromDate,toDate]);
      let created=0;
      for(const a of assignments){
        const {rows}=await client.query(`INSERT INTO fee_installments(school_id,assignment_id,student_id,session_id,fee_head_id,period_start,period_end,due_date,amount,status) SELECT $1,$2,$3,$4,$5,g::date,(CASE WHEN $7='monthly' THEN (g + interval '1 month - 1 day')::date WHEN $7='quarterly' THEN (g + interval '3 months - 1 day')::date WHEN $7='half_yearly' THEN (g + interval '6 months - 1 day')::date ELSE g::date END),LEAST((date_trunc('month',g)::date + ($8::int-1)),(CASE WHEN $7='monthly' THEN (g + interval '1 month - 1 day')::date WHEN $7='quarterly' THEN (g + interval '3 months - 1 day')::date WHEN $7='half_yearly' THEN (g + interval '6 months - 1 day')::date ELSE g::date END)), $9, 'due' FROM generate_series($6::date,$10::date,CASE WHEN $7='monthly' THEN interval '1 month' WHEN $7='quarterly' THEN interval '3 months' WHEN $7='half_yearly' THEN interval '6 months' ELSE interval '100 years' END) g WHERE $7='one_time' OR $7='annual' OR g::date <= $10::date ON CONFLICT (assignment_id,period_start) DO NOTHING RETURNING id`,[req.auth.schoolId,a.id,a.student_id,a.session_id,a.fee_head_id,a.start_date,a.frequency,a.due_day||1,a.amount,toDate]);
        created+=rows.length;
      }
      await client.query('COMMIT');res.status(201).json({generated:created,assignments:assignments.length});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });

  app.post('/api/fees/installments/invoice', authenticate, requireRoles(...financeRoles), async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const {sessionId,studentId=null,fromDate=null,toDate=null,installmentIds=null,dueDate=null}=req.body||{};
      if(!sessionId)return res.status(400).json({error:'sessionId is required'});
      await client.query('BEGIN');
      const params=[req.auth.schoolId,sessionId,req.auth.branchId||null,studentId];
      let sql=`SELECT fi.id,fi.student_id AS "studentId",fi.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",fi.period_start AS "periodStart",fi.period_end AS "periodEnd",fi.due_date AS "dueDate",fi.amount,fi.invoice_id AS "invoiceId" FROM fee_installments fi JOIN fee_heads fh ON fh.id=fi.fee_head_id AND fh.school_id=fi.school_id JOIN students s ON s.id=fi.student_id AND s.school_id=fi.school_id WHERE fi.school_id=$1 AND fi.session_id=$2 AND fi.status='due' AND fi.invoice_id IS NULL AND ($3::uuid IS NULL OR fi.branch_id=$3 OR s.branch_id=$3 OR (fi.branch_id IS NULL AND s.branch_id IS NULL)) AND ($4::uuid IS NULL OR fi.student_id=$4)`;
      if(Array.isArray(installmentIds)&&installmentIds.length){params.push(installmentIds);sql+=` AND fi.id=ANY($${params.length}::uuid[])`}
      if(fromDate){params.push(fromDate);sql+=` AND fi.due_date >= $${params.length}`}
      if(toDate){params.push(toDate);sql+=` AND fi.due_date <= $${params.length}`}
      sql+=' ORDER BY fi.student_id,fi.due_date,fi.id FOR UPDATE';
      const {rows:installments}=await client.query(sql,params);
      if(!installments.length){await client.query('ROLLBACK');return res.status(404).json({error:'No uninvoiced due installments found'})}
      const groups=new Map();
      for(const item of installments){if(!groups.has(item.studentId))groups.set(item.studentId,[]);groups.get(item.studentId).push(item)}
      const invoices=[];
      for(const [sid,items] of groups){
        const total=items.reduce((sum,x)=>sum+Number(x.amount||0),0);
        const branch=req.auth.branchId||null;
        const invoiceNo=`INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString(36).toUpperCase()}-${invoices.length+1}`;
        const invoiceDue=dueDate||items.reduce((min,x)=>!min||x.dueDate<min?x.dueDate:min,null);
        const {rows:inv}=await client.query(`INSERT INTO fee_invoices(school_id,student_id,session_id,branch_id,invoice_no,due_date,total_amount,discount_amount,net_amount,paid_amount,balance_amount,status) VALUES($1,$2,$3,$4,$5,$6,$7,0,$7,0,$7,'unpaid') RETURNING id,invoice_no AS "invoiceNo",student_id AS "studentId",net_amount AS "netAmount",balance_amount AS "balanceAmount",status`,[req.auth.schoolId,sid,sessionId,branch,invoiceNo,invoiceDue,total]);
        for(const item of items){
          await client.query(`INSERT INTO fee_invoice_items(school_id,invoice_id,fee_head_id,description,amount) VALUES($1,$2,$3,$4,$5)`,[req.auth.schoolId,inv[0].id,item.feeHeadId,`${item.feeHeadName} (${item.periodStart} to ${item.periodEnd})`,Number(item.amount)]);
          await client.query(`UPDATE fee_installments SET invoice_id=$1,status='invoiced' WHERE id=$2 AND invoice_id IS NULL`,[inv[0].id,item.id]);
        }
        invoices.push({...inv[0],installmentCount:items.length});
      }
      await client.query('COMMIT');
      res.status(201).json({invoices,count:invoices.length,totalAmount:invoices.reduce((s,x)=>s+Number(x.netAmount||0),0)});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });

  app.get('/api/fees/installments', authenticate, requireRoles(...financeRoles), async(req,res,next)=>{
    try{const {sessionId=null,studentId=null,status=null}=req.query;const params=[req.auth.schoolId,sessionId,req.auth.branchId||null,studentId,status];let sql=`SELECT fi.id,fi.student_id AS "studentId",s.admission_no AS "admissionNo",s.full_name AS "studentName",fi.session_id AS "sessionId",fi.fee_head_id AS "feeHeadId",fh.name AS "feeHeadName",fi.period_start AS "periodStart",fi.period_end AS "periodEnd",fi.due_date AS "dueDate",fi.amount,COALESCE(fi.paid_amount,0) AS "paidAmount",fi.invoice_id AS "invoiceId",fi.status FROM fee_installments fi JOIN students s ON s.id=fi.student_id JOIN fee_heads fh ON fh.id=fi.fee_head_id WHERE fi.school_id=$1 AND ($2::uuid IS NULL OR fi.session_id=$2) AND ($3::uuid IS NULL OR fi.student_id IN (SELECT id FROM students WHERE id=fi.student_id AND (branch_id=$3 OR branch_id IS NULL))) AND ($4::uuid IS NULL OR fi.student_id=$4) AND ($5::text IS NULL OR fi.status=$5) ORDER BY fi.due_date,s.full_name`;const {rows}=await pool.query(sql,params);res.json({installments:rows,totalDue:rows.filter(x=>x.status!=='paid'&&x.status!=='cancelled').reduce((s,x)=>s+Math.max(0,Number(x.amount||0)-Number(x.paidAmount||0)),0)})}catch(err){next(err)}
  });
}
module.exports={registerFeeAssignmentRoutes};
