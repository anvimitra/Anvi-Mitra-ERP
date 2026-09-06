const { authenticate, requireRoles } = require('./auth');

async function ensureDevice(pool, req, body = {}) {
  const deviceKey = String(body.deviceKey || '').trim();
  if (!deviceKey) throw Object.assign(new Error('deviceKey is required'), { statusCode: 400 });
  const deviceName = body.deviceName ? String(body.deviceName).trim() : null;
  const platform = body.platform ? String(body.platform).trim().slice(0,30) : 'unknown';
  const { rows } = await pool.query(
    `INSERT INTO sync_devices(school_id,device_key,device_name,platform,last_seen_at,status)
     VALUES($1,$2,$3,$4,now(),'active')
     ON CONFLICT(school_id,device_key)
     DO UPDATE SET device_name=EXCLUDED.device_name,platform=EXCLUDED.platform,last_seen_at=now(),status='active'
     RETURNING id,school_id AS "schoolId",device_key AS "deviceKey",device_name AS "deviceName",platform,last_cursor AS "lastCursor",last_seen_at AS "lastSeenAt",status`,
    [req.auth.schoolId, deviceKey, deviceName, platform]
  );
  return rows[0];
}

async function recordSyncChange(pool, { schoolId, entityType, entityId = null, operation, payload = {}, changedBy = null }) {
  if (!schoolId || !entityType || !operation) return null;
  const { rows } = await pool.query(
    `INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING cursor,school_id AS "schoolId",entity_type AS "entityType",entity_id AS "entityId",operation,payload,changed_by AS "changedBy",changed_at AS "changedAt"`,
    [schoolId, String(entityType), entityId, operation, payload, changedBy]
  );
  return rows[0] || null;
}

function registerSyncRoutes(app, pool) {
  app.post('/api/sync/device', authenticate, async (req,res,next) => {
    try {
      const device = await ensureDevice(pool, req, req.body || {});
      res.status(201).json({ device });
    } catch (err) { next(err); }
  });

  app.post('/api/sync/heartbeat', authenticate, async (req,res,next) => {
    try {
      const device = await ensureDevice(pool, req, req.body || {});
      res.json({ device, serverTime: new Date().toISOString() });
    } catch (err) { next(err); }
  });

  app.get('/api/sync/pull', authenticate, async (req,res,next) => {
    try {
      const deviceKey = String(req.query.deviceKey || '').trim();
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const cursor = Math.max(0, Number.parseInt(req.query.cursor || '0', 10) || 0);
      const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit || '100', 10) || 100));
      const deviceResult = await pool.query(
        `SELECT id,last_cursor AS "lastCursor",status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,
        [req.auth.schoolId, deviceKey]
      );
      if (!deviceResult.rows.length) return res.status(404).json({ error: 'Sync device is not registered' });
      if (deviceResult.rows[0].status !== 'active') return res.status(403).json({ error: 'Sync device is revoked' });
      const { rows } = await pool.query(
        `SELECT cursor,entity_type AS "entityType",entity_id AS "entityId",operation,payload,changed_at AS "changedAt"
         FROM sync_changes
         WHERE school_id=$1 AND cursor>$2
         ORDER BY cursor ASC
         LIMIT $3`,
        [req.auth.schoolId, cursor, limit]
      );
      const nextCursor = rows.length ? Number(rows[rows.length - 1].cursor) : cursor;
      await pool.query('UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$1),last_seen_at=now() WHERE id=$2',[nextCursor,deviceResult.rows[0].id]);
      res.json({ changes: rows, nextCursor, hasMore: rows.length === limit, serverTime: new Date().toISOString() });
    } catch (err) { next(err); }
  });

  app.get('/api/sync/conflicts', authenticate, async (req,res,next) => {
    try {
      const status = String(req.query.status || 'pending');
      const allowed = ['pending','server_wins','local_wins','merged'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid conflict status' });
      const { rows } = await pool.query(
        `SELECT id,device_id AS "deviceId",entity_type AS "entityType",entity_id AS "entityId",local_payload AS "localPayload",server_payload AS "serverPayload",resolution,created_at AS "createdAt",resolved_at AS "resolvedAt"
         FROM sync_conflicts WHERE school_id=$1 AND resolution=$2 ORDER BY created_at DESC LIMIT 200`,
        [req.auth.schoolId,status]
      );
      res.json({ conflicts: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/sync/conflicts/:id/resolve', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const resolution = String(req.body?.resolution || '').trim();
      if (!['server_wins','local_wins','merged'].includes(resolution)) return res.status(400).json({ error: 'Invalid resolution' });
      const { rows } = await pool.query(
        `UPDATE sync_conflicts SET resolution=$1,resolved_at=now() WHERE id=$2 AND school_id=$3 AND resolution='pending'
         RETURNING id,device_id AS "deviceId",entity_type AS "entityType",entity_id AS "entityId",resolution,resolved_at AS "resolvedAt"`,
        [resolution,req.params.id,req.auth.schoolId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Pending sync conflict not found' });
      res.json({ conflict: rows[0] });
    } catch (err) { next(err); }
  });

  app.get('/api/local-storage/connectors', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id,device_id AS "deviceId",connector_type AS "connectorType",display_name AS "displayName",enabled,permission_mode AS "permissionMode",selected_path AS "selectedPath",last_sync_at AS "lastSyncAt",last_error AS "lastError",updated_at AS "updatedAt"
         FROM local_storage_connectors WHERE school_id=$1 ORDER BY created_at DESC`,
        [req.auth.schoolId]
      );
      res.json({ connectors: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/local-storage/connectors', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const b=req.body||{};
      if (!b.displayName) return res.status(400).json({ error:'displayName is required' });
      const type=b.connectorType || 'desktop_folder';
      if (!['desktop_folder','nas_folder','external_drive'].includes(type)) return res.status(400).json({error:'Invalid connectorType'});
      const permission=b.permissionMode || 'read_write';
      if (!['read_only','read_write'].includes(permission)) return res.status(400).json({error:'Invalid permissionMode'});
      const { rows } = await pool.query(
        `INSERT INTO local_storage_connectors(school_id,device_id,connector_type,display_name,enabled,permission_mode,selected_path)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,device_id AS "deviceId",connector_type AS "connectorType",display_name AS "displayName",enabled,permission_mode AS "permissionMode",selected_path AS "selectedPath",last_sync_at AS "lastSyncAt",last_error AS "lastError"`,
        [req.auth.schoolId,b.deviceId||null,type,String(b.displayName).trim(),b.enabled!==false,permission,b.selectedPath||null]
      );
      res.status(201).json({ connector: rows[0] });
    } catch (err) { next(err); }
  });
}

module.exports = { registerSyncRoutes, recordSyncChange };
