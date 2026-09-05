const { authenticate } = require('./auth');

function registerNotificationRoutes(app, pool) {
  app.post('/api/notifications/device-token', authenticate, async (req,res,next) => {
    try {
      const { token, platform } = req.body || {};
      if (!token || !['android','ios','web'].includes(platform)) return res.status(400).json({ error: 'token and valid platform are required' });
      const { rows } = await pool.query(`INSERT INTO parent_device_tokens (school_id,user_id,platform,token,is_active,last_seen_at) VALUES ($1,$2,$3,$4,true,now()) ON CONFLICT (school_id,user_id,token) DO UPDATE SET platform=EXCLUDED.platform,is_active=true,last_seen_at=now() RETURNING id`, [req.auth.schoolId,req.auth.sub,platform,String(token)]);
      res.status(201).json({ deviceToken: rows[0] });
    } catch (err) { next(err); }
  });

  app.get('/api/notifications/me', authenticate, async (req,res,next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
      const { rows } = await pool.query(`SELECT id,student_id AS "studentId",type,title,message,data_json AS "data",read_at AS "readAt",created_at AS "createdAt" FROM parent_notifications WHERE school_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3`, [req.auth.schoolId,req.auth.sub,limit]);
      res.json({ notifications: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/notifications/:id/read', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`UPDATE parent_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND school_id=$2 AND user_id=$3 RETURNING id,read_at AS "readAt"`, [req.params.id,req.auth.schoolId,req.auth.sub]);
      if (!rows.length) return res.status(404).json({ error: 'Notification not found' });
      res.json({ notification: rows[0] });
    } catch (err) { next(err); }
  });
}

async function queueParentNotifications(client, { schoolId, studentId, type, title, message, data, eventType }) {
  const { rows: parents } = await client.query(`SELECT DISTINCT p.user_id AS "userId",pr.phone,s.full_name AS "studentName",s.admission_no AS "admissionNo" FROM student_portal_profiles p JOIN students s ON s.id=p.student_id AND s.school_id=p.school_id LEFT JOIN parents pr ON pr.user_id=p.user_id AND pr.school_id=p.school_id WHERE p.school_id=$1 AND p.student_id=$2 AND p.status='active' AND p.user_id IS NOT NULL`, [schoolId,studentId]);
  for (const parent of parents) {
    await client.query(`INSERT INTO parent_notifications (school_id,user_id,student_id,type,title,message,data_json) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [schoolId,parent.userId,studentId,type,title,message,JSON.stringify({...data||{},studentName:parent.studentName,admissionNo:parent.admissionNo})]);
    if (parent.phone) await client.query(`INSERT INTO notification_sms_queue (school_id,user_id,student_id,phone,message,event_type) VALUES ($1,$2,$3,$4,$5,$6)`, [schoolId,parent.userId,studentId,phoneForSms(parent.phone),message,eventType||type]);
  }
}

function phoneForSms(phone) {
  return String(phone || '').trim();
}

async function queueFeePaymentNotifications(client, { schoolId, invoiceId, studentId, amount, receiptNo, method, paidAmount, balanceAmount }) {
  const { rows } = await client.query(`SELECT full_name AS "studentName",admission_no AS "admissionNo" FROM students WHERE id=$1 AND school_id=$2 LIMIT 1`, [studentId,schoolId]);
  const student = rows[0] || {};
  const label = student.studentName ? `${student.studentName}${student.admissionNo ? ` (${student.admissionNo})` : ''}` : 'student';
  const message = `Fee payment received for ${label}. Amount ₹${Number(amount).toFixed(2)}, Receipt ${receiptNo}. Balance ₹${Number(balanceAmount).toFixed(2)}.`;
  await queueParentNotifications(client,{schoolId,studentId,type:'fee_payment',title:'Fee Payment Received',message,data:{event:'fee_payment',invoiceId,studentId,studentName:student.studentName||null,admissionNo:student.admissionNo||null,amount:Number(amount),receiptNo,method,paidAmount:Number(paidAmount),balanceAmount:Number(balanceAmount)},eventType:'fee_payment'});
}

async function queueFeeInvoiceNotifications(client, { schoolId, invoiceId, studentId, invoiceNo, amount, dueDate }) {
  const { rows } = await client.query(`SELECT full_name AS "studentName",admission_no AS "admissionNo" FROM students WHERE id=$1 AND school_id=$2 LIMIT 1`, [studentId,schoolId]);
  const student = rows[0] || {};
  const label = student.studentName ? `${student.studentName}${student.admissionNo ? ` (${student.admissionNo})` : ''}` : 'student';
  const message = `Fee invoice ${invoiceNo} generated for ${label}. Amount ₹${Number(amount).toFixed(2)}, due ${dueDate}.`;
  await queueParentNotifications(client,{schoolId,studentId,type:'fee_invoice',title:'Fee Invoice Generated',message,data:{event:'fee_invoice',invoiceId,studentId,studentName:student.studentName||null,admissionNo:student.admissionNo||null,invoiceNo,amount:Number(amount),dueDate},eventType:'fee_invoice'});
}

async function queueAttendanceNotifications(client, { schoolId, studentId, date, status, note=null }) {
  const { rows } = await client.query(`SELECT full_name AS "studentName",admission_no AS "admissionNo" FROM students WHERE id=$1 AND school_id=$2 LIMIT 1`, [studentId,schoolId]);
  const student = rows[0] || {};
  const label = student.studentName ? `${student.studentName}${student.admissionNo ? ` (${student.admissionNo})` : ''}` : 'student';
  const pretty = {present:'Present',absent:'Absent',late:'Late',half_day:'Half Day',leave:'Leave'}[status] || status;
  const message = `Attendance update: ${label} was marked ${pretty} on ${date}.${note ? ` Note: ${note}` : ''}`;
  await queueParentNotifications(client,{schoolId,studentId,type:'attendance',title:`Attendance: ${pretty}`,message,data:{event:'attendance',studentId,date,status,note},eventType:'attendance'});
}

module.exports = { registerNotificationRoutes, queueFeePaymentNotifications, queueFeeInvoiceNotifications, queueAttendanceNotifications };