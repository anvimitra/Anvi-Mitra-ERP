const { authenticate, requireRoles } = require('./auth');

function registerLocalStorageRoutes(app, pool) {
  app.get('/api/local-storage/connectors', authenticate, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, device_id, connector_type, display_name, enabled, permission_mode,
                selected_path, last_sync_at, last_error, created_at, updated_at
         FROM local_storage_connectors
         WHERE school_id=$1
         ORDER BY created_at DESC`,
        [req.auth.schoolId]
      );
      res.json({ connectors: result.rows });
    } catch (err) { next(err); }
  });

  app.post('/api/local-storage/connectors', authenticate, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const { deviceId=null, connectorType='desktop_folder', displayName, permissionMode='read_write', selectedPath=null, enabled=true } = req.body || {};
      if (!displayName) return res.status(400).json({ error: 'displayName is required' });
      if (!['desktop_folder','nas_folder','external_drive'].includes(connectorType)) return res.status(400).json({ error: 'Invalid connectorType' });
      if (!['read_only','read_write'].includes(permissionMode)) return res.status(400).json({ error: 'Invalid permissionMode' });
      const result = await pool.query(
        `INSERT INTO local_storage_connectors
           (school_id,device_id,connector_type,display_name,enabled,permission_mode,selected_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,device_id,connector_type,display_name,enabled,permission_mode,selected_path,last_sync_at,last_error`,
        [req.auth.schoolId, deviceId || null, connectorType, String(displayName).trim(), Boolean(enabled), permissionMode, selectedPath || null]
      );
      res.status(201).json({ connector: result.rows[0] });
    } catch (err) { next(err); }
  });

  app.patch('/api/local-storage/connectors/:id', authenticate, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const allowed = {
        displayName: 'display_name', enabled: 'enabled', permissionMode: 'permission_mode',
        selectedPath: 'selected_path', connectorType: 'connector_type'
      };
      const sets=[]; const values=[req.params.id, req.auth.schoolId]; let i=3;
      for (const [key,column] of Object.entries(allowed)) {
        if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
        if (key==='connectorType' && !['desktop_folder','nas_folder','external_drive'].includes(req.body[key])) return res.status(400).json({error:'Invalid connectorType'});
        if (key==='permissionMode' && !['read_only','read_write'].includes(req.body[key])) return res.status(400).json({error:'Invalid permissionMode'});
        sets.push(`${column}=$${i++}`); values.push(key==='enabled' ? Boolean(req.body[key]) : req.body[key]);
      }
      if (!sets.length) return res.status(400).json({error:'No supported fields supplied'});
      sets.push('updated_at=now()');
      const result=await pool.query(
        `UPDATE local_storage_connectors SET ${sets.join(',')} WHERE id=$1 AND school_id=$2
         RETURNING id,device_id,connector_type,display_name,enabled,permission_mode,selected_path,last_sync_at,last_error,updated_at`,
        values
      );
      if (!result.rows.length) return res.status(404).json({error:'Connector not found'});
      res.json({connector:result.rows[0]});
    } catch(err){next(err)}
  });

  app.post('/api/local-storage/connectors/:id/heartbeat', authenticate, async (req,res,next)=>{
    try {
      const result=await pool.query(
        `UPDATE local_storage_connectors SET last_sync_at=now(),last_error=$3,updated_at=now()
         WHERE id=$1 AND school_id=$2
         RETURNING id,last_sync_at,last_error,enabled,permission_mode,selected_path`,
        [req.params.id, req.auth.schoolId, req.body?.error ? String(req.body.error).slice(0,2000) : null]
      );
      if(!result.rows.length) return res.status(404).json({error:'Connector not found'});
      res.json({connector:result.rows[0]});
    }catch(err){next(err)}
  });
}

module.exports={registerLocalStorageRoutes};
