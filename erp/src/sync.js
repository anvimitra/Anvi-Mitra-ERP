const { authenticate } = require('./auth');

function registerSyncRoutes(app, pool) {
  app.post('/api/sync/device', authenticate, async (req, res, next) => {
    try {
      const { deviceKey, deviceName = null, platform = 'unknown' } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const result = await pool.query(
        `INSERT INTO sync_devices (school_id, device_key, device_name, platform, last_seen_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (school_id,device_key) DO UPDATE SET
           device_name=EXCLUDED.device_name, platform=EXCLUDED.platform,
           last_seen_at=now(), status='active'
         RETURNING id, school_id, device_key, device_name, platform, last_cursor, last_seen_at, status`,
        [req.auth.schoolId, String(deviceKey), deviceName, String(platform)]
      );
      res.json({ device: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.post('/api/sync/pull', authenticate, async (req, res, next) => {
    try {
      const { deviceKey, cursor = 0, limit = 200 } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
      const deviceResult = await pool.query(
        `SELECT id, status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,
        [req.auth.schoolId, String(deviceKey)]
      );
      const device = deviceResult.rows[0];
      if (!device || device.status !== 'active') return res.status(403).json({ error: 'Sync device is not registered or is revoked' });
      const result = await pool.query(
        `SELECT cursor, entity_type, entity_id, operation, payload, changed_by, changed_at
         FROM sync_changes WHERE school_id=$1 AND cursor>$2 ORDER BY cursor ASC LIMIT $3`,
        [req.auth.schoolId, Number(cursor) || 0, safeLimit]
      );
      const changes = result.rows;
      const nextCursor = changes.length ? Number(changes[changes.length - 1].cursor) : Number(cursor) || 0;
      await pool.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$2), last_seen_at=now() WHERE id=$1`, [device.id, nextCursor]);
      res.json({ changes, nextCursor, hasMore: changes.length === safeLimit });
    } catch (err) { next(err); }
  });

  app.post('/api/sync/push', authenticate, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { deviceKey, changes = [] } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      if (!Array.isArray(changes) || changes.length > 500) return res.status(400).json({ error: 'changes must be an array with at most 500 items' });
      const deviceResult = await client.query(`SELECT id, status FROM sync_devices WHERE school_id=$1 AND device_key=$2 FOR UPDATE`, [req.auth.schoolId, String(deviceKey)]);
      const device = deviceResult.rows[0];
      if (!device || device.status !== 'active') return res.status(403).json({ error: 'Sync device is not registered or is revoked' });
      await client.query('BEGIN');
      const accepted = [];
      for (const change of changes) {
        const entityType = String(change.entityType || '').trim();
        const operation = String(change.operation || '').trim();
        if (!entityType) throw Object.assign(new Error('entityType is required for every change'), { statusCode: 400 });
        if (!['create','update','delete'].includes(operation)) throw Object.assign(new Error('operation must be create, update or delete'), { statusCode: 400 });
        const entityId = change.entityId || null;
        const payload = change.payload && typeof change.payload === 'object' ? change.payload : {};
        const result = await client.query(
          `INSERT INTO sync_changes (school_id,entity_type,entity_id,operation,payload,changed_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING cursor, entity_type, entity_id, operation, payload, changed_at`,
          [req.auth.schoolId, entityType, entityId, operation, JSON.stringify(payload), req.auth.sub]
        );
        accepted.push(result.rows[0]);
      }
      const latest = accepted.length ? Number(accepted[accepted.length - 1].cursor) : 0;
      await client.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$2), last_seen_at=now() WHERE id=$1`, [device.id, latest]);
      await client.query('COMMIT');
      res.json({ accepted, nextCursor: latest });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally { client.release(); }
  });

  app.get('/api/sync/conflicts', authenticate, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, device_id, entity_type, entity_id, local_payload, server_payload, resolution, created_at, resolved_at
         FROM sync_conflicts WHERE school_id=$1 AND resolution='pending' ORDER BY created_at DESC LIMIT 200`,
        [req.auth.schoolId]
      );
      res.json({ conflicts: result.rows });
    } catch (err) { next(err); }
  });
}

module.exports = { registerSyncRoutes };
