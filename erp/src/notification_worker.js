const crypto = require('crypto');

function providerConfigured() {
  return Boolean(process.env.SMS_API_URL && process.env.SMS_API_KEY);
}

function buildSmsPayload(row) {
  return {
    to: row.phone,
    message: row.message,
    sender: process.env.SMS_SENDER_ID || undefined,
    eventType: row.event_type,
    clientReference: row.id
  };
}

async function sendSms(row) {
  if (!providerConfigured()) throw new Error('SMS provider is not configured: set SMS_API_URL and SMS_API_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(process.env.SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SMS_API_KEY}` },
      body: JSON.stringify(buildSmsPayload(row)),
      signal: controller.signal
    });
    const text = await response.text();
    let body={}; try { body=JSON.parse(text); } catch (_) {}
    if(!response.ok) throw new Error(`SMS provider HTTP ${response.status}: ${text.slice(0,300)}`);
    return body.messageId || body.message_id || body.id || crypto.randomUUID();
  } finally { clearTimeout(timeout); }
}

async function processSmsQueue(pool, batchSize=25) {
  if(!providerConfigured()) return { processed:0, skipped:true, reason:'provider_not_configured' };
  const client=await pool.connect();
  let processed=0;
  try {
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT id,phone,message,event_type,attempts FROM notification_sms_queue WHERE status IN ('pending','failed') AND attempts < 5 AND (status='pending' OR queued_at < now()-interval '10 minutes') ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT $1`,[batchSize]);
    for(const row of rows){
      await client.query(`UPDATE notification_sms_queue SET status='processing',attempts=attempts+1 WHERE id=$1`,[row.id]);
      try{
        const providerMessageId=await sendSms(row);
        await client.query(`UPDATE notification_sms_queue SET status='sent',provider_message_id=$2,sent_at=now(),last_error=NULL WHERE id=$1`,[row.id,providerMessageId]);
        processed++;
      }catch(err){
        await client.query(`UPDATE notification_sms_queue SET status='failed',last_error=$2 WHERE id=$1`,[row.id,String(err.message).slice(0,1000)]);
      }
    }
    await client.query('COMMIT');
    return {processed,skipped:false};
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}finally{client.release()}
}

function istWeekKey() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

async function queueWeeklyFeeReminders(pool) {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const weekKey=istWeekKey();
    const schools=await client.query(`SELECT id FROM schools WHERE status IS NULL OR status='active'`);
    let queued=0;
    for(const school of schools.rows){
      const marker=await client.query(`INSERT INTO fee_reminder_runs(school_id,week_key,run_type) VALUES($1,$2,'weekly_due') ON CONFLICT DO NOTHING RETURNING id`,[school.id,weekKey]);
      if(!marker.rows.length) continue;
      const {rows}=await client.query(`SELECT DISTINCT p.user_id AS "userId",p.student_id AS "studentId",pr.phone,s.full_name AS "studentName",COALESCE(SUM(fi.balance_amount),0) AS balance,MIN(fi.due_date) AS "dueDate" FROM student_portal_profiles p JOIN students s ON s.id=p.student_id AND s.school_id=p.school_id JOIN fee_invoices fi ON fi.student_id=s.id AND fi.school_id=s.school_id AND fi.status IN ('unpaid','partial') LEFT JOIN parents pr ON pr.user_id=p.user_id AND pr.school_id=p.school_id WHERE p.school_id=$1 AND p.status='active' AND p.user_id IS NOT NULL GROUP BY p.user_id,p.student_id,pr.phone,s.full_name HAVING COALESCE(SUM(fi.balance_amount),0)>0`,[school.id]);
      for(const parent of rows){
        const due=parent.dueDate?` Earliest due date: ${parent.dueDate}.`:'';
        const message=`Fee reminder for ${parent.studentName}: outstanding balance ₹${Number(parent.balance).toFixed(2)}.${due} Please pay the pending fee.`;
        const data={event:'weekly_fee_reminder',studentId:parent.studentId,balanceAmount:Number(parent.balance),dueDate:parent.dueDate||null,weekKey};
        await client.query(`INSERT INTO parent_notifications(school_id,user_id,student_id,type,title,message,data_json) VALUES($1,$2,$3,'fee_reminder','Weekly Fee Reminder',$4,$5)`,[school.id,parent.userId,parent.studentId,message,JSON.stringify(data)]);
        if(parent.phone) await client.query(`INSERT INTO notification_sms_queue(school_id,user_id,student_id,phone,message,event_type) VALUES($1,$2,$3,$4,$5,'weekly_fee_reminder')`,[school.id,parent.userId,parent.studentId,parent.phone,message]);
        queued++;
      }
    }
    await client.query('COMMIT');
    return {queued,weekKey};
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}finally{client.release()}
}

function startNotificationWorker(pool) {
  if(!pool || process.env.NOTIFICATION_WORKER_ENABLED==='false') return null;
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{await processSmsQueue(pool);const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',hour12:false}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));if(p.weekday==='Sat' && Number(p.hour)>=9 && Number(p.hour)<12) await queueWeeklyFeeReminders(pool);}catch(err){console.error('notification worker:',err.message)}finally{running=false}};
  tick();
  return setInterval(tick,5*60*1000);
}

module.exports={processSmsQueue,queueWeeklyFeeReminders,startNotificationWorker};
