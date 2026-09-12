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
      await pool.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$2), last_seen_at=now() WHERE id=$1`, [device.id, nextCursor]);
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
        if (baseCursor > 0) {
          const newer = await client.query(`SELECT cursor,payload FROM sync_changes WHERE school_id=$1 AND entity_type=$2 AND entity_id IS NOT DISTINCT FROM $3 AND cursor>$4 ORDER BY cursor ASC LIMIT 1`, [req.auth.schoolId,entityType,entityId,baseCursor]);
          if (newer.rows.length) {
            const conflictResult = await client.query(`INSERT INTO sync_conflicts(school_id,device_id,entity_type,entity_id,local_payload,server_payload,resolution) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id`, [req.auth.schoolId,device.id,entityType,entityId,JSON.stringify(payload),JSON.stringify(newer.rows[0].payload)]);
            conflicts.push({id:conflictResult.rows[0].id,entityType,entityId,clientChangeId});
            continue;
          }
        }
        const result = await client.query(`INSERT INTO sync_changes(school_id,device_id,client_change_id,base_cursor,entity_type,entity_id,operation,payload,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING cursor,entity_type,entity_id,operation,payload,changed_at,client_change_id,base_cursor`, [req.auth.schoolId,device.id,clientChangeId,baseCursor,entityType,entityId,operation,JSON.stringify(payload),req.auth.sub]);
        accepted.push(result.rows[0]);
      }
      const latest = accepted.length ? Number(accepted[accepted.length - 1].cursor) : Number(device.last_cursor || 0);
      await client.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$2),last_seen_at=now() WHERE id=$1`, [device.id,latest]);
      await client.query('COMMIT');
      res.json({accepted,conflicts,nextCursor:latest});
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); }
    finally { client.release(); }
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
