const { authenticate, requireRoles } = require('./auth');

function registerSyncConflictRoutes(app, pool) {
  const resolverRoles = ['super_admin','principal','admin'];

  app.get('/api/sync/conflicts', authenticate, async (req,res,next)=>{
    try {
      const resolution = ['pending','server_wins','local_wins','merged'].includes(req.query.resolution) ? req.query.resolution : 'pending';
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
      const { rows } = await pool.query(`SELECT c.id,c.device_id AS "deviceId",d.device_name AS "deviceName",c.entity_type AS "entityType",c.entity_id AS "entityId",c.local_payload AS "localPayload",c.server_payload AS "serverPayload",c.resolution,c.resolution_payload AS "resolutionPayload",c.resolution_note AS "resolutionNote",c.created_at AS "createdAt",c.resolved_at AS "resolvedAt",c.resolved_by AS "resolvedBy" FROM sync_conflicts c LEFT JOIN sync_devices d ON d.id=c.device_id WHERE c.school_id=$1 AND c.resolution=$2 ORDER BY c.created_at DESC LIMIT $3`,[req.auth.schoolId,resolution,limit]);
      res.json({ conflicts: rows });
    } catch(e){ next(e); }
  });

  app.get('/api/sync/conflicts/:id', authenticate, async (req,res,next)=>{
    try {
      const { rows } = await pool.query(`SELECT c.id,c.device_id AS "deviceId",d.device_name AS "deviceName",c.entity_type AS "entityType",c.entity_id AS "entityId",c.local_payload AS "localPayload",c.server_payload AS "serverPayload",c.resolution,c.resolution_payload AS "resolutionPayload",c.resolution_note AS "resolutionNote",c.created_at AS "createdAt",c.resolved_at AS "resolvedAt",c.resolved_by AS "resolvedBy" FROM sync_conflicts c LEFT JOIN sync_devices d ON d.id=c.device_id WHERE c.id=$1 AND c.school_id=$2`,[req.params.id,req.auth.schoolId]);
      if(!rows.length)return res.status(404).json({error:'Sync conflict not found'});
      res.json({ conflict: rows[0] });
    } catch(e){ next(e); }
  });

  app.post('/api/sync/conflicts/:id/resolve', authenticate, requireRoles(...resolverRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try {
      const resolution=String(req.body?.resolution||'').trim();
      if(!['server_wins','local_wins','merged'].includes(resolution))return res.status(400).json({error:'resolution must be server_wins, local_wins or merged'});
      const note=String(req.body?.note||'').trim().slice(0,1000);
      const mergedPayload=req.body?.mergedPayload && typeof req.body.mergedPayload==='object' ? req.body.mergedPayload : null;
      if(resolution==='merged'&&!mergedPayload)return res.status(400).json({error:'mergedPayload is required for merged resolution'});
      await client.query('BEGIN');
      const found=await client.query(`SELECT id,entity_type,entity_id,local_payload,server_payload,resolution FROM sync_conflicts WHERE id=$1 AND school_id=$2 FOR UPDATE`,[req.params.id,req.auth.schoolId]);
      if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Sync conflict not found'});}
      const conflict=found.rows[0];
      if(conflict.resolution!=='pending'){await client.query('ROLLBACK');return res.status(409).json({error:'Sync conflict is already resolved',resolution:conflict.resolution});}
      const chosen=resolution==='server_wins'?conflict.server_payload:resolution==='local_wins'?conflict.local_payload:mergedPayload;
      const change=await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,$2,$3,'update',$4::jsonb,$5) RETURNING cursor`,[req.auth.schoolId,conflict.entity_type,conflict.entity_id,JSON.stringify(chosen||{}),req.auth.sub]);
      const updated=await client.query(`UPDATE sync_conflicts SET resolution=$1,resolution_payload=$2::jsonb,resolution_note=$3,resolved_by=$4,resolved_at=now() WHERE id=$5 AND school_id=$6 RETURNING id,resolution,resolution_payload AS "resolutionPayload",resolution_note AS "resolutionNote",resolved_by AS "resolvedBy",resolved_at AS "resolvedAt"`,[resolution,JSON.stringify(chosen||{}),note||null,req.auth.sub,req.params.id,req.auth.schoolId]);
      await client.query(`INSERT INTO audit_logs(school_id,user_id,action,entity_type,metadata) VALUES($1,$2,$3,'sync_conflict',$4::jsonb)`,[req.auth.schoolId,req.auth.sub,'sync_conflict_resolved',JSON.stringify({conflictId:req.params.id,resolution,cursor:Number(change.rows[0].cursor)})]);
      await client.query('COMMIT');
      res.json({conflict:updated.rows[0],syncCursor:Number(change.rows[0].cursor)});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
  });
}
module.exports={registerSyncConflictRoutes};