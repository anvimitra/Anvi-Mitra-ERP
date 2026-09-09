const { authenticate, requireRoles } = require('./auth');

function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function requireSchool(req, res, next) { if (!req.auth?.schoolId) return res.status(403).json({ error: 'School context required' }); next(); }

function registerLocalStorageRoutes(app, pool) {
  app.get('/api/local-storage/connectors', authenticate, requireSchool, async (req, res, next) => {
    try {
      const r = await pool.query(`SELECT id,school_id AS "schoolId",device_id AS "deviceId",connector_type AS "connectorType",display_name AS "displayName",enabled,permission_mode AS "permissionMode",selected_path AS "selectedPath",last_sync_at AS "lastSyncAt",last_error AS "lastError",updated_at AS "updatedAt" FROM local_storage_connectors WHERE school_id=$1 ORDER BY created_at DESC`, [req.auth.schoolId]);
      res.json({ connectors: r.rows });
    } catch (e) { next(e); }
  });

  app.post('/api/local-storage/connectors', authenticate, requireSchool, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const displayName = text(req.body?.displayName, 200);
      const connectorType = text(req.body?.connectorType || 'desktop_folder', 30);
      const permissionMode = text(req.body?.permissionMode || 'read_write', 20);
      if (!displayName) return res.status(400).json({ error: 'displayName is required' });
      if (!['desktop_folder','nas_folder','external_drive'].includes(connectorType)) return res.status(400).json({ error: 'Unsupported connectorType' });
      if (!['read_only','read_write'].includes(permissionMode)) return res.status(400).json({ error: 'Unsupported permissionMode' });
      const deviceId = req.body?.deviceId || null;
      if (deviceId) {
        const d = await pool.query(`SELECT id FROM sync_devices WHERE id=$1 AND school_id=$2 AND status='active'`, [deviceId, req.auth.schoolId]);
        if (!d.rowCount) return res.status(400).json({ error: 'Active sync device not found' });
      }
      const r = await pool.query(`INSERT INTO local_storage_connectors(school_id,device_id,connector_type,display_name,enabled,permission_mode,selected_path) VALUES($1,$2,$3,$4,true,$5,$6) RETURNING id,school_id AS "schoolId",device_id AS "deviceId",connector_type AS "connectorType",display_name AS "displayName",enabled,permission_mode AS "permissionMode",selected_path AS "selectedPath",last_sync_at AS "lastSyncAt",last_error AS "lastError",updated_at AS "updatedAt"`, [req.auth.schoolId, deviceId, connectorType, displayName, permissionMode, text(req.body?.selectedPath, 1000) || null]);
      res.status(201).json({ connector: r.rows[0] });
    } catch (e) { next(e); }
  });

  app.patch('/api/local-storage/connectors/:id', authenticate, requireSchool, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const map = { displayName: 'display_name', enabled: 'enabled', permissionMode: 'permission_mode', selectedPath: 'selected_path', connectorType: 'connector_type', deviceId: 'device_id' };
      const sets = [], values = [];
      for (const [key, col] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        sets.push(`${col}=$${values.length + 1}`);
        values.push(key === 'displayName' ? text(req.body[key], 200) : key === 'selectedPath' ? text(req.body[key], 1000) || null : req.body[key]);
      }
      if (!sets.length) return res.status(400).json({ error: 'No supported fields supplied' });
      values.push(req.params.id, req.auth.schoolId);
      const r = await pool.query(`UPDATE local_storage_connectors SET ${sets.join(',')},updated_at=now() WHERE id=$${values.length-1} AND school_id=$${values.length} RETURNING id,school_id AS "schoolId",device_id AS "deviceId",connector_type AS "connectorType",display_name AS "displayName",enabled,permission_mode AS "permissionMode",selected_path AS "selectedPath",last_sync_at AS "lastSyncAt",last_error AS "lastError",updated_at AS "updatedAt"`, values);
      if (!r.rowCount) return res.status(404).json({ error: 'Connector not found' });
      res.json({ connector: r.rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/local-storage/connectors/:id/heartbeat', authenticate, requireSchool, async (req, res, next) => {
    try {
      const r = await pool.query(`UPDATE local_storage_connectors SET last_sync_at=now(),last_error=$1,updated_at=now() WHERE id=$2 AND school_id=$3 AND enabled=true RETURNING id,last_sync_at AS "lastSyncAt",last_error AS "lastError",permission_mode AS "permissionMode",selected_path AS "selectedPath"`, [text(req.body?.lastError, 1000) || null, req.params.id, req.auth.schoolId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Active connector not found' });
      res.json({ connector: r.rows[0] });
    } catch (e) { next(e); }
  });
}

module.exports = { registerLocalStorageRoutes };
