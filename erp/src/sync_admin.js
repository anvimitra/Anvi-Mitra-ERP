const { authenticate, requireRoles } = require('./auth');

function registerSyncAdminRoutes(app, pool) {
  const admins = ['super_admin','principal','admin'];

  app.get('/api/sync/admin/conflicts', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(`SELECT id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at
         FROM sync_conflicts WHERE school_id=$1 ORDER BY created_at DESC LIMIT 500`,[req.auth.schoolId]);
      res.json({conflicts:result.rows});
    }catch(err){next(err)}
  });

  app.post('/api/sync/admin/conflicts/:id/resolve', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const resolution=String(req.body?.resolution||'').trim();
      if(!['server_wins','local_wins','merged'].includes(resolution)) return res.status(400).json({error:'resolution must be server_wins, local_wins or merged'});
      if(resolution==='merged' && (!req.body?.mergedPayload || typeof req.body.mergedPayload!=='object')) return res.status(400).json({error:'mergedPayload is required for merged resolution'});
      const found=await pool.query(`SELECT * FROM sync_conflicts WHERE id=$1 AND school_id=$2 AND resolution='pending'`,[req.params.id,req.auth.schoolId]);
      if(!found.rows.length) return res.status(404).json({error:'Pending conflict not found'});
      const conflict=found.rows[0];
      const payload=resolution==='server_wins'?conflict.server_payload:resolution==='local_wins'?conflict.local_payload:req.body.mergedPayload;
      const journal=await pool.query(`INSERT INTO sync_changes(school_id,device_id,entity_type,entity_id,operation,payload,changed_by,base_cursor) VALUES($1,$2,$3,$4,'update',$5,$6,0) RETURNING cursor`,[req.auth.schoolId,conflict.device_id,conflict.entity_type,conflict.entity_id,JSON.stringify(payload),req.auth.sub]);
      const result=await pool.query(`UPDATE sync_conflicts SET resolution=$3,resolved_at=now() WHERE id=$1 AND school_id=$2 AND resolution='pending' RETURNING id,entity_type,entity_id,resolution,resolved_at`,[req.params.id,req.auth.schoolId,resolution]);
      if(!result.rows.length) return res.status(409).json({error:'Conflict was resolved concurrently'});
      res.json({conflict:result.rows[0],journalCursor:Number(journal.rows[0].cursor)});
    }catch(err){next(err)}
  });

  app.get('/api/sync/admin/devices', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(`SELECT id,device_key,device_name,platform,last_cursor,last_seen_at,status,created_at
         FROM sync_devices WHERE school_id=$1 ORDER BY last_seen_at DESC NULLS LAST`,[req.auth.schoolId]);
      res.json({devices:result.rows});
    }catch(err){next(err)}
  });

  app.post('/api/sync/admin/devices/:id/revoke', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(`UPDATE sync_devices SET status='revoked'
         WHERE id=$1 AND school_id=$2 RETURNING id,device_key,device_name,platform,status`,[req.params.id,req.auth.schoolId]);
      if(!result.rows.length) return res.status(404).json({error:'Sync device not found'});
      res.json({device:result.rows[0]});
    }catch(err){next(err)}
  });

  app.post('/api/sync/admin/devices/:id/reset', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const result=await pool.query(`UPDATE sync_devices SET status='active',last_cursor=0,last_seen_at=now()
         WHERE id=$1 AND school_id=$2 RETURNING id,device_key,device_name,platform,last_cursor,last_seen_at,status`,[req.params.id,req.auth.schoolId]);
      if(!result.rows.length) return res.status(404).json({error:'Sync device not found'});
      res.json({device:result.rows[0],message:'Device sync cursor reset; client must perform a fresh pull before pushing queued changes'});
    }catch(err){next(err)}
  });
}

module.exports={registerSyncAdminRoutes};
