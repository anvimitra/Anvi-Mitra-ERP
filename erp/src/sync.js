const { authenticate, requireRoles } = require('./auth');

async function resolveDevice(pool, schoolId, deviceKey) {
  const result = await pool.query(
    `SELECT id,status,last_cursor FROM sync_devices WHERE school_id=$1 AND device_key=$2`,
    [schoolId, String(deviceKey)]
  );
  return result.rows[0] || null;
}

function registerSyncRoutes(app, pool) {
  app.post('/api/sync/device', authenticate, async (req, res, next) => {
    try {
      const { deviceKey, deviceName = null, platform = 'unknown' } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const result = await pool.query(
        `INSERT INTO sync_devices (school_id, device_key, device_name, platform, last_seen_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (school_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name, platform=EXCLUDED.platform, last_seen_at=now(), status='active'
         RETURNING id, school_id, device_key, device_name, platform, last_cursor, last_seen_at, status`,
        [req.auth.schoolId, String(deviceKey), deviceName, String(platform)]
      );
      res.json({ device: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.get('/api/sync/status', authenticate, async (req, res, next) => {
    try {
      const [devices, changes, conflicts, latest] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, MAX(last_seen_at) AS last_seen_at FROM sync_devices WHERE school_id=$1`, [req.auth.schoolId]),
        pool.query(`SELECT COUNT(*)::int AS count FROM sync_changes WHERE school_id=$1`, [req.auth.schoolId]),
        pool.query(`SELECT COUNT(*)::int AS count FROM sync_conflicts WHERE school_id=$1 AND resolution='pending'`, [req.auth.schoolId]),
        pool.query(`SELECT MAX(changed_at) AS changed_at, MAX(cursor) AS cursor FROM sync_changes WHERE school_id=$1`, [req.auth.schoolId])
      ]);
      res.json({ deviceCount: devices.rows[0], changeCount: changes.rows[0].count, pendingConflictCount: conflicts.rows[0].count, latestChange: latest.rows[0], onlineSourceOfTruth: 'postgresql' });
    } catch (err) { next(err); }
  });

  async function pullChanges(req, res, next) {
    try {
      const source = req.query.deviceKey ? req.query : (req.body || {});
      const { deviceKey, cursor = 0, limit = 200 } = source;
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
      const device = await resolveDevice(pool, req.auth.schoolId, deviceKey);
      if (!device || device.status !== 'active') return res.status(403).json({ error: 'Sync device is not registered or is revoked' });
      const result = await pool.query(`SELECT cursor,entity_type,entity_id,operation,payload,changed_by,changed_at,client_change_id,base_cursor FROM sync_changes WHERE school_id=$1 AND cursor>$2 ORDER BY cursor ASC LIMIT $3`, [req.auth.schoolId, Number(cursor) || 0, safeLimit]);
      const changes = result.rows;
      const nextCursor = changes.length ? Number(changes[changes.length - 1].cursor) : Number(cursor) || 0;
      // Pull does not acknowledge durable application; the client must call /api/sync/ack after applying changes.
      res.json({ changes, nextCursor, hasMore: changes.length === safeLimit });
    } catch (err) { next(err); }
  }

  app.get('/api/sync/changes', authenticate, pullChanges);
  app.post('/api/sync/pull', authenticate, async (req, res, next) => {
    req.query = req.query || {};
    req.query.deviceKey = req.body?.deviceKey;
    req.query.cursor = req.body?.cursor ?? 0;
    req.query.limit = req.body?.limit ?? 200;
    return pullChanges(req, res, next);
  });

  app.post('/api/sync/ack', authenticate, async (req,res,next) => {
    try {
      const {deviceKey,cursor=0}=req.body||{};
      if(!deviceKey) return res.status(400).json({error:'deviceKey is required'});
      const device=await resolveDevice(pool,req.auth.schoolId,deviceKey);
      if(!device || device.status!=='active') return res.status(403).json({error:'Sync device is not registered or is revoked'});
      const nextCursor=Math.max(Number(cursor)||0,0);
      const {rows}=await pool.query('UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$2),last_seen_at=now() WHERE id=$1 RETURNING last_cursor',[device.id,nextCursor]);
      res.json({acknowledgedCursor:Number(rows[0].last_cursor)});
    } catch(err){next(err)}
  });

  app.post('/api/sync/push', authenticate, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { deviceKey, changes = [] } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      if (!Array.isArray(changes) || changes.length > 500) return res.status(400).json({ error: 'changes must be an array with at most 500 items' });
      const deviceResult = await client.query(`SELECT id,status,last_cursor FROM sync_devices WHERE school_id=$1 AND device_key=$2 FOR UPDATE`, [req.auth.schoolId, String(deviceKey)]);
      const device = deviceResult.rows[0];
      if (!device || device.status !== 'active') return res.status(403).json({ error: 'Sync device is not registered or is revoked' });
      await client.query('BEGIN');
      const accepted = [];
      const conflicts = [];

      for (const change of changes) {
        const entityType = String(change.entityType || '').trim();
        const operation = String(change.operation || '').trim();
        const clientChangeId = String(change.clientId || change.clientChangeId || '').trim() || null;
        const baseCursor = Math.max(Number(change.baseCursor) || 0, 0);
        if (!entityType) throw Object.assign(new Error('entityType is required for every change'), { statusCode: 400 });
        if (!['create','update','delete'].includes(operation)) throw Object.assign(new Error('operation must be create, update or delete'), { statusCode: 400 });
        if (clientChangeId) {
          const duplicate = await client.query(`SELECT cursor,entity_type,entity_id,operation,payload,changed_at,client_change_id,base_cursor FROM sync_changes WHERE school_id=$1 AND device_id=$2 AND client_change_id=$3 LIMIT 1`, [req.auth.schoolId, device.id, clientChangeId]);
          if (duplicate.rows.length) { accepted.push({ ...duplicate.rows[0], duplicate: true }); continue; }
        }
        const entityId = change.entityId || null;
        const payload = change.payload && typeof change.payload === 'object' ? change.payload : {};
        if (['fee_receipt','fee_payment'].includes(entityType) && req.auth.role === 'teacher') throw Object.assign(new Error('Teacher is not allowed to sync financial records'), { statusCode: 403 });
        // Detect concurrent edits BEFORE mutating high-risk records.
        // This prevents an offline client from overwriting a newer server value.
        if (baseCursor > 0) {
          const newer = await client.query(
            'SELECT cursor,payload FROM sync_changes WHERE school_id=$1 AND entity_type=$2 AND entity_id IS NOT DISTINCT FROM $3 AND cursor>$4 ORDER BY cursor ASC LIMIT 1',
            [req.auth.schoolId, entityType, entityId, baseCursor]
          );
          if (newer.rows.length) {
            const conflictResult = await client.query(
              "INSERT INTO sync_conflicts(school_id,device_id,entity_type,entity_id,local_payload,server_payload,resolution) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id",
              [req.auth.schoolId, device.id, entityType, entityId, JSON.stringify(payload), JSON.stringify(newer.rows[0].payload)]
            );
            conflicts.push({id: conflictResult.rows[0].id, entityType, entityId, clientChangeId});
            continue;
          }
        }
        if (entityType === 'fee_payment') {
          if (!['super_admin','principal','admin','accountant','office_staff'].includes(req.auth.role)) {
            throw Object.assign(new Error('User is not allowed to sync fee payments'), { statusCode: 403 });
          }
          const invoiceId = payload.invoiceId;
          const amount = Number(payload.amount);
          if (!invoiceId || !Number.isFinite(amount) || amount <= 0) {
            throw Object.assign(new Error('invoiceId and positive amount are required'), { statusCode: 400 });
          }
          const invoice = await client.query(
            'SELECT id,branch_id,net_amount,paid_amount,balance_amount,status FROM fee_invoices WHERE id=$1 AND school_id=$2 FOR UPDATE',
            [invoiceId, req.auth.schoolId]
          );
          if (!invoice.rowCount) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
          const inv = invoice.rows[0];
          if (inv.status === 'cancelled') throw Object.assign(new Error('Cancelled invoice cannot receive payment'), { statusCode: 409 });
          if (amount > Number(inv.balance_amount) + 0.005) throw Object.assign(new Error('Payment exceeds invoice balance'), { statusCode: 422 });
          const duplicate = await client.query(
            'SELECT id FROM fee_payments WHERE school_id=$1 AND transaction_ref=$2 AND transaction_ref IS NOT NULL LIMIT 1',
            [req.auth.schoolId, payload.transactionRef || null]
          );
          if (payload.transactionRef && duplicate.rowCount) {
            throw Object.assign(new Error('Payment transaction already exists'), { statusCode: 409 });
          }
          const seq=(await client.query("SELECT nextval('fee_receipt_no_seq')")).rows[0].nextval;
          const receiptNo=payload.receiptNo || 'RCT-'+new Date().getFullYear()+'-'+String(seq).padStart(6,'0');
          const payment=await client.query(
            'INSERT INTO fee_payments(school_id,branch_id,invoice_id,receipt_no,amount,method,transaction_ref,collected_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [req.auth.schoolId,inv.branch_id,invoiceId,receiptNo,amount,payload.method||'cash',payload.transactionRef||null,req.auth.sub]
          );
          const paid=Number(inv.paid_amount)+amount;
          const balance=Math.max(0,Number(inv.net_amount)-paid);
          const status=balance<=0.005?'paid':'partial';
          await client.query('UPDATE fee_invoices SET paid_amount=$1,balance_amount=$2,status=$3,updated_at=now() WHERE id=$4 AND school_id=$5',[paid,balance,status,invoiceId,req.auth.schoolId]);
          payload = {...payload, paymentId: payment.rows[0].id, receiptNo, balanceAmount: balance, status};
        }

        if (entityType === 'fee_invoice') {
          if (!['super_admin','principal','admin','accountant','office_staff'].includes(req.auth.role)) {
            throw Object.assign(new Error('User is not allowed to sync fee invoices'), { statusCode: 403 });
          }
          if (!payload.studentId || !payload.sessionId || !Array.isArray(payload.items) || !payload.items.length) {
            throw Object.assign(new Error('studentId, sessionId and invoice items are required'), { statusCode: 400 });
          }
          const enrollment = await client.query(
            'SELECT e.id FROM enrollments e WHERE e.school_id=$1 AND e.student_id=$2 AND e.session_id=$3 AND e.status=\'active\' AND ($4::uuid IS NULL OR e.branch_id=$4 OR e.branch_id IS NULL) LIMIT 1',
            [req.auth.schoolId,payload.studentId,payload.sessionId,req.auth.branchId||null]
          );
          if (!enrollment.rowCount) throw Object.assign(new Error('Student is not enrolled in this session/branch'), { statusCode: 403 });
          const gross=payload.items.reduce((sum,item)=>sum+Number(item.amount||0),0);
          const discount=Math.max(0,Number(payload.discountAmount||0));
          if (!Number.isFinite(gross)||gross<0||discount>gross) throw Object.assign(new Error('Invalid invoice totals'), { statusCode: 422 });
          const net=Math.max(0,gross-discount);
          const seq=(await client.query("SELECT nextval('fee_invoice_no_seq')")).rows[0].nextval;
          const invoiceNo=payload.invoiceNo || 'INV-'+new Date().getFullYear()+'-'+String(seq).padStart(6,'0');
          const invoice=await client.query(
            'INSERT INTO fee_invoices(school_id,branch_id,student_id,session_id,invoice_no,due_date,gross_amount,discount_amount,net_amount,balance_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING id',
            [req.auth.schoolId,req.auth.branchId||null,payload.studentId,payload.sessionId,invoiceNo,payload.dueDate||null,gross,discount,net,req.auth.sub]
          );
          for(const item of payload.items) {
            const amount=Number(item.amount||0);
            if(!Number.isFinite(amount)||amount<0) throw Object.assign(new Error('Invalid invoice item amount'), { statusCode: 422 });
            await client.query('INSERT INTO fee_invoice_items(school_id,invoice_id,fee_head_id,description,amount) VALUES($1,$2,$3,$4,$5)',[req.auth.schoolId,invoice.rows[0].id,item.feeHeadId||null,String(item.description||'Fee').slice(0,200),amount]);
          }
          payload={...payload,invoiceId:invoice.rows[0].id,invoiceNo,netAmount:net,balanceAmount:net};
        }

        if (entityType === 'student_enrollment') {
          if (!['super_admin','principal','admin','office_staff'].includes(req.auth.role)) {
            throw Object.assign(new Error('User is not allowed to sync enrollment'), { statusCode: 403 });
          }
          const p=payload;
          if(!p.studentId||!p.sessionId||!p.sectionId) throw Object.assign(new Error('studentId, sessionId and sectionId are required'), { statusCode:400 });
          const valid=await client.query(
            'SELECT sec.id,c.id AS class_id,c.branch_id AS class_branch_id FROM sections sec JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id WHERE sec.id=$1 AND sec.school_id=$2',
            [p.sectionId,req.auth.schoolId]
          );
          if(!valid.rowCount) throw Object.assign(new Error('Target section not found'), { statusCode:404 });
          if(req.auth.branchId && valid.rows[0].class_branch_id && valid.rows[0].class_branch_id!==req.auth.branchId) throw Object.assign(new Error('Target section is outside active branch'), { statusCode:403 });
          const student=await client.query('SELECT id FROM students WHERE id=$1 AND school_id=$2 AND status=\'active\'',[p.studentId,req.auth.schoolId]);
          if(!student.rowCount) throw Object.assign(new Error('Student not found'), { statusCode:404 });
          const enrollment=await client.query(
            `INSERT INTO enrollments(school_id,branch_id,student_id,session_id,section_id,roll_no,status)
             VALUES($1,$2,$3,$4,$5,$6,'active')
             ON CONFLICT(student_id,session_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,section_id=EXCLUDED.section_id,roll_no=EXCLUDED.roll_no,status='active'
             RETURNING id`,
            [req.auth.schoolId,req.auth.branchId||valid.rows[0].class_branch_id||null,p.studentId,p.sessionId,p.sectionId,p.rollNo||null]
          );
          payload={...payload,enrollmentId:enrollment.rows[0].id};
        }

        if (entityType === 'student_attendance') {
          if (!payload.studentId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(payload.date || ''))) {
            throw Object.assign(new Error('studentId and valid attendance date are required for offline attendance sync'), { statusCode: 400 });
          }
          if (!['present','absent','late','half_day','leave'].includes(String(payload.status || ''))) {
            throw Object.assign(new Error('Invalid offline attendance status'), { statusCode: 422 });
          }
          const enrollment = await client.query(
            `SELECT 1 FROM enrollments e
               JOIN students s ON s.id=e.student_id AND s.school_id=e.school_id
              WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND s.status='active'
                AND ($3::uuid IS NULL OR e.session_id=$3)
                AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL)
              LIMIT 1`,
            [req.auth.schoolId, payload.studentId, payload.sessionId || null, req.auth.branchId || null]
          );
          if (!enrollment.rows.length) throw Object.assign(new Error('Student is not enrolled in this school/branch'), { statusCode: 403 });
          await client.query(
            `INSERT INTO student_attendance(school_id,branch_id,student_id,session_id,attendance_date,status,note,marked_by,updated_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
             ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE
             SET branch_id=EXCLUDED.branch_id,session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,updated_at=now()`,
            [req.auth.schoolId, req.auth.branchId || null, payload.studentId, payload.sessionId || null, payload.date, payload.status, payload.note || null, req.auth.sub]
          );
        }
        if (['exam_mark','exam_marks'].includes(entityType)) {
          if (req.auth.role === 'teacher' && !payload.examSubjectId) throw Object.assign(new Error('examSubjectId is required for offline teacher marks sync'), { statusCode: 400 });
          const subjectResult = await client.query(`SELECT es.id AS "examSubjectId",es.class_id AS "classId",es.max_marks AS "maxMarks",es.branch_id AS "branchId",e.session_id AS "sessionId",e.status AS "examStatus" FROM exam_subjects es JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id WHERE es.id=$1 AND es.school_id=$2`, [payload.examSubjectId, req.auth.schoolId]);
          if (!subjectResult.rows.length) throw Object.assign(new Error('Exam subject not found for this school'), { statusCode: 404 });
          const subject = subjectResult.rows[0];
          if (req.auth.branchId && subject.branchId && subject.branchId !== req.auth.branchId) throw Object.assign(new Error('Exam subject is outside the active branch'), { statusCode: 403 });
          if (subject.examStatus === 'published') throw Object.assign(new Error('Published exam marks cannot be edited'), { statusCode: 409 });
          if (req.auth.role === 'teacher') {
            const permission = await client.query('SELECT teacher_can_edit_exam_subject($1,$2) AS allowed', [req.auth.sub, payload.examSubjectId]);
            if (!permission.rows[0]?.allowed) throw Object.assign(new Error('Teacher is not assigned to this subject/class'), { statusCode: 403 });
          }
          const marks = Number(payload.marks);
          if (!Number.isFinite(marks) || marks < 0 || (subject.maxMarks !== null && marks > Number(subject.maxMarks))) throw Object.assign(new Error('Invalid marks value for offline sync'), { statusCode: 422 });
          const enrollment = await client.query(`SELECT 1 FROM enrollments WHERE school_id=$1 AND student_id=$2 AND session_id=$3 AND class_id=$4 AND status='active' AND ($5::uuid IS NULL OR branch_id=$5 OR branch_id IS NULL) LIMIT 1`, [req.auth.schoolId,payload.studentId,subject.sessionId,subject.classId,req.auth.branchId || null]);
          if (!enrollment.rows.length) throw Object.assign(new Error('Student is not enrolled in this class/session'), { statusCode: 403 });
          const saved = await client.query(`INSERT INTO exam_marks(school_id,exam_subject_id,student_id,marks,grade,remarks) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,exam_subject_id,student_id) DO UPDATE SET marks=EXCLUDED.marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,updated_at=now() RETURNING id`, [req.auth.schoolId,payload.examSubjectId,payload.studentId,marks,payload.grade || null,payload.remarks || null]);
          if (entityId && String(entityId) !== String(saved.rows[0].id)) throw Object.assign(new Error('Offline mark entity does not match the target mark'), { statusCode: 409 });
        }
        const result = await client.query(`INSERT INTO sync_changes(school_id,device_id,client_change_id,base_cursor,entity_type,entity_id,operation,payload,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING cursor,entity_type,entity_id,operation,payload,changed_at,client_change_id,base_cursor`, [req.auth.schoolId,device.id,clientChangeId,baseCursor,entityType,entityId,operation,JSON.stringify(payload),req.auth.sub]);
        accepted.push(result.rows[0]);
      }
      // Client cursors acknowledge server changes only after the client has pulled and applied them.
      // A pushed change receives a global cursor, but advancing last_cursor here could skip unrelated
      // changes created by other devices between the client's previous cursor and this new cursor.
      await client.query('UPDATE sync_devices SET last_seen_at=now() WHERE id=$1', [device.id]);
      await client.query('COMMIT');
      res.json({accepted,conflicts});
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); }
    finally { client.release(); }
  });

  app.get('/api/sync/devices', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id,device_key AS "deviceKey",device_name AS "deviceName",platform,last_cursor AS "lastCursor",last_seen_at AS "lastSeenAt",status,created_at AS "createdAt"
         FROM sync_devices WHERE school_id=$1 ORDER BY last_seen_at DESC NULLS LAST,created_at DESC`,
        [req.auth.schoolId]
      );
      res.json({devices:rows});
    } catch(err){ next(err); }
  });

  app.patch('/api/sync/devices/:id', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const status=String(req.body?.status||'').trim();
      if(!['active','revoked'].includes(status)) return res.status(400).json({error:'status must be active or revoked'});
      const {rows}=await pool.query(
        `UPDATE sync_devices SET status=$1,last_seen_at=now()
         WHERE id=$2 AND school_id=$3
         RETURNING id,device_key AS "deviceKey",device_name AS "deviceName",platform,last_cursor AS "lastCursor",last_seen_at AS "lastSeenAt",status,created_at AS "createdAt"`,
        [status,req.params.id,req.auth.schoolId]
      );
      if(!rows.length) return res.status(404).json({error:'Sync device not found'});
      res.json({device:rows[0]});
    } catch(err){next(err)}
  });

  app.post('/api/sync/devices/:id/reset-cursor', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const {rows}=await pool.query(
        `UPDATE sync_devices SET last_cursor=0,last_seen_at=now()
         WHERE id=$1 AND school_id=$2
         RETURNING id,device_key AS "deviceKey",last_cursor AS "lastCursor",status`,
        [req.params.id,req.auth.schoolId]
      );
      if(!rows.length) return res.status(404).json({error:'Sync device not found'});
      res.json({device:rows[0],message:'Cursor reset; client will re-pull available changes'});
    } catch(err){next(err)}
  });

  app.get('/api/sync/conflicts', authenticate, async (req,res,next) => {
    try {
      const result=await pool.query(`SELECT id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at FROM sync_conflicts WHERE school_id=$1 AND resolution='pending' ORDER BY created_at DESC LIMIT 200`,[req.auth.schoolId]);
      res.json({conflicts:result.rows});
    } catch(err){next(err)}
  });

  app.patch('/api/sync/conflicts/:id', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const {resolution,mergedPayload=null}=req.body||{};
      if(!['server_wins','local_wins','merged'].includes(resolution)) return res.status(400).json({error:'resolution must be server_wins, local_wins or merged'});
      if(resolution==='merged' && (!mergedPayload || typeof mergedPayload!=='object')) return res.status(400).json({error:'mergedPayload is required for merged resolution'});
      await client.query('BEGIN');
      const found=await client.query(`SELECT * FROM sync_conflicts WHERE id=$1 AND school_id=$2 AND resolution='pending' FOR UPDATE`,[req.params.id,req.auth.schoolId]);
      if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Pending sync conflict not found'});}
      const conflict=found.rows[0];
      const payload=resolution==='server_wins'?conflict.server_payload:resolution==='local_wins'?conflict.local_payload:mergedPayload;
      const journal=await client.query(`INSERT INTO sync_changes(school_id,device_id,entity_type,entity_id,operation,payload,changed_by,base_cursor) VALUES($1,$2,$3,$4,'update',$5,$6,0) RETURNING cursor`,[req.auth.schoolId,conflict.device_id,conflict.entity_type,conflict.entity_id,JSON.stringify(payload),req.auth.sub]);
      const updated=await client.query(`UPDATE sync_conflicts SET resolution=$2,resolved_at=now() WHERE id=$1 RETURNING id,entity_type,entity_id,resolution,resolved_at`,[req.params.id,resolution]);
      await client.query('COMMIT');
      res.json({conflict:updated.rows[0],journalCursor:Number(journal.rows[0].cursor)});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });
}

module.exports = { registerSyncRoutes };
