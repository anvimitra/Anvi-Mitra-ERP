const crypto = require('crypto');
const { authenticate, requireRoles } = require('./auth');

const financeRoles = ['super_admin','principal','admin','accountant','office_staff'];

function registerPaymentRoutes(app, pool) {
  app.post('/api/payments/intents', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const b=req.body||{};
      const amount=Number(b.amount);
      const idempotencyKey=String(req.get('Idempotency-Key')||b.idempotencyKey||'').trim();
      if(!b.invoiceId || !Number.isFinite(amount) || amount<=0 || !idempotencyKey) {
        return res.status(400).json({error:'invoiceId, positive amount and Idempotency-Key are required'});
      }
      const invoice=await pool.query(
        'SELECT id,school_id,branch_id,student_id,balance_amount FROM fee_invoices WHERE id=$1 AND school_id=$2',
        [b.invoiceId,req.auth.schoolId]
      );
      if(!invoice.rowCount) return res.status(404).json({error:'Invoice not found'});
      const row=invoice.rows[0];
      if(amount>Number(row.balance_amount)+0.005) return res.status(400).json({error:'Payment exceeds invoice balance'});

      const existing=await pool.query(
        'SELECT id,provider,provider_order_id,amount,currency_code,status,metadata FROM payment_intents WHERE school_id=$1 AND idempotency_key=$2',
        [req.auth.schoolId,idempotencyKey]
      );
      if(existing.rowCount) return res.status(200).json({intent:existing.rows[0],replayed:true});

      const provider=String(b.provider||process.env.PAYMENT_PROVIDER||'manual_adapter').trim().toLowerCase();
      const metadata=typeof b.metadata==='object' && b.metadata ? b.metadata : {};
      const sql =
        'INSERT INTO payment_intents(school_id,branch_id,invoice_id,student_id,provider,provider_order_id,amount,currency_code,status,idempotency_key,metadata,created_by) ' +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'created',$9,$10::jsonb,$11) " +
        'RETURNING id,provider,provider_order_id AS "providerOrderId",amount,currency_code AS "currencyCode",status,idempotency_key AS "idempotencyKey",metadata,created_at AS "createdAt"';
      const {rows}=await pool.query(sql,
        [req.auth.schoolId,row.branch_id,row.id,row.student_id,provider,b.providerOrderId||null,amount,b.currency||'INR',idempotencyKey,JSON.stringify(metadata),req.auth.sub]
      );
      res.status(201).json({intent:rows[0],providerConfigured:Boolean(process.env.PAYMENT_PROVIDER)});
    } catch(err) { next(err); }
  });

  app.get('/api/payments/intents/:id', authenticate, requireRoles(...financeRoles), async (req,res,next)=>{
    try {
      const {rows}=await pool.query(
        'SELECT p.id,p.invoice_id AS "invoiceId",p.student_id AS "studentId",p.provider,p.provider_order_id AS "providerOrderId",p.provider_payment_id AS "providerPaymentId",p.amount,p.currency_code AS "currencyCode",p.status,p.metadata,p.created_at AS "createdAt",p.updated_at AS "updatedAt" FROM payment_intents p WHERE p.id=$1 AND p.school_id=$2',
        [req.params.id,req.auth.schoolId]
      );
      if(!rows.length) return res.status(404).json({error:'Payment intent not found'});
      res.json({intent:rows[0]});
    } catch(err){next(err);}
  });

  app.post('/api/payments/webhook', async (req,res,next)=>{
    try {
      const secret=process.env.PAYMENT_WEBHOOK_SECRET;
      if(secret){
        const provided=String(req.get('x-payment-signature')||'');
        const expected=crypto.createHmac('sha256',secret).update(JSON.stringify(req.body||{})).digest('hex');
        if(!provided || provided.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return res.status(401).json({error:'Invalid webhook signature'});
      }
      const b=req.body||{};
      const provider=String(b.provider||process.env.PAYMENT_PROVIDER||'manual_adapter');
      const eventId=String(b.eventId||b.id||'').trim();
      if(!eventId) return res.status(400).json({error:'eventId is required'});
      const event=await pool.query(
        'INSERT INTO payment_webhook_events(provider,event_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(provider,event_id) DO NOTHING RETURNING id',
        [provider,eventId,b.eventType||b.type||null,JSON.stringify(b)]
      );
      if(!event.rowCount) return res.json({ok:true,duplicate:true});

      const intentId=b.paymentIntentId||b.intentId;
      if(intentId){
        const status=['paid','failed','cancelled','refunded','pending'].includes(b.status) ? b.status : 'pending';
        await pool.query(
          'UPDATE payment_intents SET status=$1,provider_payment_id=COALESCE($2,provider_payment_id),updated_at=now(),metadata=metadata || $3::jsonb WHERE id=$4',
          [status,b.providerPaymentId||b.paymentId||null,JSON.stringify({webhookEventId:event.rows[0].id}),intentId]
        );
      }
      await pool.query('UPDATE payment_webhook_events SET processed=true,processed_at=now() WHERE id=$1',[event.rows[0].id]);
      res.json({ok:true,processed:true});
    } catch(err){ next(err); }
  });
}

module.exports={registerPaymentRoutes};
