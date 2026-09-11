const { authenticate, requireRoles } = require('./auth');

function registerSyncAdminRoutes(app, pool) {
  const admins = ['super_admin','principal','admin'];

  app.get('/api/sync/admin/conflicts', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(
        `SELECT id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at
         FROM sync_conflicts WHERE school_id=$1 ORDER BY created_at DESC LIMIT 500`,
        [req.auth.schoolId]
      );
      res.json({conflicts:result.rows});
    }catch(err){next(err)}
  });

  app.post('/api/sync/admin/conflicts/:id/resolve', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const resolution=String(req.body?.resolution||'').trim();
      if(!['server_wins','local_wins','merged'].includes(resolution)) return res.status(400).json({error:'resolution must be server_wins, local_wins or merged'});
      const result=await pool.query(
        `UPDATE sync_conflicts SET resolution=$3,resolved_at=now()
         WHERE id=$1 AND school_id=$2 AND resolution='pending'
         RETURNING id,entity_type,entity_id,resolution,resolved_at,local_payload,server_payload`,
        [req.params.id,req.auth.schoolId,resolution]
      );
      if(!result.rows.length) return res.status(404).json({error:'Pending conflict not found'});
      res.json({conflict:result.rows[0]});
    }catch(err){next(err)}
  });

  app.get('/api/sync/admin/devices', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(
        `SELECT id,device_key,device_name,platform,last_cursor,last_seen_at,status,created_at
         FROM sync_devices WHERE school_id=$1 ORDER BY last_seen_at DESC NULLS LAST`,
        [req.auth.schoolId]
      );
      res.json({devices:result.rows});
    }catch(err){next(err)}
  });

  app.post('/api/sync/admin/devices/:id/revoke', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(
        `UPDATE sync_devices SET status='revoked'
         WHERE id=$1 AND school_id=$2
         RETURNING id,device_key,device_name,platform,status`,
        [req.params.id,req.auth.schoolId]
      );
      if(!result.rows.length) return res.status(404).json({error:'Sync device not found'});
      res.json({device:result.rows[0]});
    }catch(err){next(err)}
  });
}

module.exports={registerSyncAdminRoutes};
