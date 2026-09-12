const { authenticate, requireRoles } = require('./auth');

function registerSyncConflictResolutionRoutes(app, pool) {
  app.post('/api/sync/conflicts/:id/resolve', authenticate, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const resolution = String(req.body?.resolution || '').trim();
      if (!['server_wins','local_wins','merged'].includes(resolution)) return res.status(400).json({ error: 'resolution must be server_wins, local_wins or merged' });
      const conflictResult = await pool.query(
        "SELECT id,school_id,device_id,entity_type,entity_id,local_payload,server_payload,resolution FROM sync_conflicts WHERE id=$1 AND school_id=$2 LIMIT 1",
        [req.params.id, req.auth.schoolId]
      );
      if (!conflictResult.rows.length) return res.status(404).json({ error: 'Sync conflict not found' });
      const conflict = conflictResult.rows[0];
      if (conflict.resolution !== 'pending') return res.status(409).json({ error: 'Sync conflict is already resolved' });
      let payload = conflict.server_payload;
      if (resolution === 'local_wins') payload = conflict.local_payload;
      if (resolution === 'merged') {
        if (!req.body?.payload || typeof req.body.payload !== 'object' || Array.isArray(req.body.payload)) return res.status(400).json({ error: 'payload object is required for merged resolution' });
        payload = req.body.payload;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("INSERT INTO sync_changes (school_id,device_id,entity_type,entity_id,operation,payload,changed_by) VALUES ($1,$2,$3,$4,'update',$5,$6)", [conflict.school_id, conflict.device_id, conflict.entity_type, conflict.entity_id, JSON.stringify(payload), req.auth.sub]);
        const updated = await client.query("UPDATE sync_conflicts SET resolution=$1,resolved_at=now() WHERE id=$2 AND school_id=$3 RETURNING id,resolution,resolved_at", [resolution, conflict.id, conflict.school_id]);
        await client.query('COMMIT');
        res.json({ conflict: updated.rows[0], appliedPayload: payload });
      } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; }
      finally { client.release(); }
    } catch (err) { next(err); }
  });
}

module.exports = { registerSyncConflictResolutionRoutes };
