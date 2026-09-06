const { authenticate } = require('./auth');

function requireSchool(req, res, next) {
  if (!req.auth?.schoolId) return res.status(403).json({ error: 'School context required' });
  next();
}

function registerSyncRoutes(app, pool) {
  app.post('/api/sync/device', authenticate, requireSchool, async (req, res, next) => {
    try {
      const { deviceKey, deviceName = null, platform = 'unknown' } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      const result = await pool.query(
        `INSERT INTO sync_devices (school_id, device_key, device_name, platform, last_seen_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (school_id, device_key)
         DO UPDATE SET device_name=EXCLUDED.device_name, platform=EXCLUDED.platform,
                       last_seen_at=now(), status='active'
         RETURNING id, school_id, device_key, device_name, platform, last_cursor, last_seen_at, status`,
        [req.auth.schoolId, String(deviceKey).trim(), deviceName, String(platform).trim().slice(0, 30)]
      );
      res.json({ device: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.get('/api/sync/changes', authenticate, requireSchool, async (req, res, next) => {
    try {
      const cursor = Math.max(0, Number(req.query.cursor || 0));
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
      const result = await pool.query(
        `SELECT cursor, entity_type, entity_id, operation, payload, changed_at
           FROM sync_changes
          WHERE school_id=$1 AND cursor>$2
          ORDER BY cursor ASC LIMIT $3`,
        [req.auth.schoolId, Number.isFinite(cursor) ? cursor : 0, limit]
      );
      const lastCursor = result.rows.length ? Number(result.rows[result.rows.length - 1].cursor) : cursor;
      await pool.query(
        `UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$1), last_seen_at=now()
          WHERE school_id=$2 AND device_key=$3`,
        [lastCursor, req.auth.schoolId, String(req.query.deviceKey || '').trim()]
      );
      res.json({ cursor: lastCursor, changes: result.rows });
    } catch (err) { next(err); }
  });

  app.post('/api/sync/push', authenticate, requireSchool, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { deviceKey, changes = [] } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error: 'deviceKey is required' });
      if (!Array.isArray(changes) || changes.length > 200) return res.status(400).json({ error: 'changes must be an array with at most 200 items' });

      const device = await client.query(
        `SELECT id,status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,
        [req.auth.schoolId, String(deviceKey).trim()]
      );
      if (!device.rows.length) return res.status(400).json({ error: 'Sync device is not registered' });
      if (device.rows[0].status !== 'active') return res.status(403).json({ error: 'Sync device is revoked' });

      await client.query('BEGIN');
      const accepted = [];
      for (const item of changes) {
        const entityType = String(item?.entityType || '').trim().slice(0, 100);
        const operation = String(item?.operation || '').trim().toLowerCase();
        if (!entityType || !['create','update','delete'].includes(operation)) continue;
        let entityId = null;
        if (item?.entityId) {
          const parsed = String(item.entityId).trim();
          if (/^[0-9a-f-]{36}$/i.test(parsed)) entityId = parsed;
        }
        const result = await client.query(
          `INSERT INTO sync_changes (school_id, entity_type, entity_id, operation, payload, changed_by)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING cursor`,
          [req.auth.schoolId, entityType, entityId, operation, JSON.stringify(item?.payload || {}), req.auth.sub]
        );
        accepted.push({ clientId: item?.clientId || null, cursor: Number(result.rows[0].cursor) });
      }
      await client.query(
        `UPDATE sync_devices SET last_seen_at=now() WHERE id=$1`,
        [device.rows[0].id]
      );
      await client.query('COMMIT');
      res.json({ accepted });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally { client.release(); }
  });
}

module.exports = { registerSyncRoutes };
