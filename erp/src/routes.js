const { authenticate, requireRoles } = require('./auth');

function registerRoutes(app, pool) {
  app.get('/api/me', authenticate, (req,res)=>res.json({ user: req.auth }));
  app.get('/api/admin/ping', authenticate, requireRoles('super_admin','principal','admin'), (req,res)=>res.json({ ok:true, area:'admin', schoolId:req.auth.schoolId }));

  // Offline-first sync transport. Domain endpoints remain the source of truth;
  // this layer stores device cursors and distributes committed change records.
  app.post('/api/sync/device', authenticate, async (req,res,next)=>{
    try {
      const { deviceKey, deviceName='', platform='unknown' } = req.body || {};
      if (!deviceKey) return res.status(400).json({ error:'deviceKey is required' });
      const { rows } = await pool.query(`INSERT INTO sync_devices(school_id,device_key,device_name,platform,last_seen_at,status)
        VALUES($1,$2,$3,$4,now(),'active')
        ON CONFLICT(school_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name,platform=EXCLUDED.platform,last_seen_at=now(),status='active'
        RETURNING id,"device_key" AS "deviceKey","device_name" AS "deviceName",platform,last_cursor AS "lastCursor",status`,
        [req.auth.schoolId,String(deviceKey).slice(0,200),String(deviceName).slice(0,200),String(platform).slice(0,30)]);
      res.json({ device:rows[0] });
    } catch(err){ next(err); }
  });

  app.get('/api/sync/pull', authenticate, async (req,res,next)=>{
    try {
      const deviceKey=String(req.query.deviceKey||'');
      const cursor=Math.max(0,Number(req.query.cursor||0));
      const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));
      if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});
      const device=await pool.query(`SELECT id,last_cursor,status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,[req.auth.schoolId,deviceKey]);
      if(!device.rows.length)return res.status(404).json({error:'Sync device is not registered'});
      if(device.rows[0].status!=='active')return res.status(403).json({error:'Sync device is revoked'});
      const {rows}=await pool.query(`SELECT cursor,"entity_type" AS "entityType","entity_id" AS "entityId",operation,payload,"changed_at" AS "changedAt"
        FROM sync_changes WHERE school_id=$1 AND cursor>$2 ORDER BY cursor LIMIT $3`,[req.auth.schoolId,cursor,limit]);
      const nextCursor=rows.length?Number(rows[rows.length-1].cursor):cursor;
      await pool.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$1),last_seen_at=now() WHERE id=$2`,[nextCursor,device.rows[0].id]);
      res.json({changes:rows,cursor:nextCursor,hasMore:rows.length===limit});
    }catch(err){next(err)}
  });

  app.post('/api/sync/push', authenticate, async (req,res,next)=>{
    const client=await pool.connect();
    try{
      const {deviceKey,changes=[]}=req.body||{};
      if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});
      if(!Array.isArray(changes)||changes.length>200)return res.status(400).json({error:'changes must be an array with at most 200 items'});
      const d=await client.query(`SELECT id,status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,[req.auth.schoolId,deviceKey]);
      if(!d.rows.length)return res.status(404).json({error:'Sync device is not registered'});
      if(d.rows[0].status!=='active')return res.status(403).json({error:'Sync device is revoked'});
      await client.query('BEGIN');
      const accepted=[];
      for(const change of changes){
        const entityType=String(change.entityType||change.entity_type||'').slice(0,100);
        const operation=String(change.operation||'').toLowerCase();
        if(!entityType||!['create','update','delete'].includes(operation))continue;
        const entityId=change.entityId||change.entity_id||null;
        const payload=change.payload&&typeof change.payload==='object'?change.payload:{};
        const r=await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
          VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING cursor`,[req.auth.schoolId,entityType,entityId,operation,JSON.stringify(payload),req.auth.sub]);
        accepted.push({clientMutationId:change.clientMutationId||null,cursor:Number(r.rows[0].cursor)});
      }
      await client.query(`UPDATE sync_devices SET last_seen_at=now() WHERE id=$1`,[d.rows[0].id]);
      await client.query('COMMIT');
      res.status(202).json({accepted});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });
}
module.exports = { registerRoutes };
