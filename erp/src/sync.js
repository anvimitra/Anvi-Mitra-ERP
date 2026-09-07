const { authenticate, requireRoles } = require('./auth');

function requireSchool(req,res,next){if(!req.auth?.schoolId)return res.status(403).json({error:'School context required'});next();}
function requireConnectorAdmin(...roles){return requireRoles(...roles);}

function registerSyncRoutes(app,pool){
  app.post('/api/sync/device',authenticate,requireSchool,async(req,res,next)=>{try{
    const {deviceKey,deviceName=null,platform='unknown'}=req.body||{}; if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});
    const r=await pool.query(`INSERT INTO sync_devices(school_id,device_key,device_name,platform,last_seen_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(school_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name,platform=EXCLUDED.platform,last_seen_at=now(),status='active' RETURNING id,school_id,device_key,device_name,platform,last_cursor,last_seen_at,status`,[req.auth.schoolId,String(deviceKey).trim(),deviceName,String(platform).trim().slice(0,30)]);
    res.json({device:r.rows[0]});
  }catch(e){next(e)}});

  app.get('/api/sync/changes',authenticate,requireSchool,async(req,res,next)=>{try{
    const cursor=Math.max(0,Number(req.query.cursor||0)); const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));
    const r=await pool.query(`SELECT cursor,entity_type,entity_id,operation,payload,changed_at FROM sync_changes WHERE school_id=$1 AND cursor>$2 ORDER BY cursor ASC LIMIT $3`,[req.auth.schoolId,Number.isFinite(cursor)?cursor:0,limit]);
    const last=r.rows.length?Number(r.rows[r.rows.length-1].cursor):cursor; const key=String(req.query.deviceKey||'').trim();
    if(key) await pool.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$1),last_seen_at=now() WHERE school_id=$2 AND device_key=$3`,[last,req.auth.schoolId,key]);
    res.json({cursor:last,changes:r.rows});
  }catch(e){next(e)}});

  app.post('/api/sync/push',authenticate,requireSchool,async(req,res,next)=>{const client=await pool.connect();try{
    const {deviceKey,changes=[]}=req.body||{}; if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});
    if(!Array.isArray(changes)||changes.length>200)return res.status(400).json({error:'changes must be an array with at most 200 items'});
    const d=await client.query(`SELECT id,status FROM sync_devices WHERE school_id=$1 AND device_key=$2`,[req.auth.schoolId,String(deviceKey).trim()]);
    if(!d.rows.length)return res.status(400).json({error:'Sync device is not registered'}); if(d.rows[0].status!=='active')return res.status(403).json({error:'Sync device is revoked'});
    await client.query('BEGIN'); const accepted=[];
    for(const item of changes){const entityType=String(item?.entityType||'').trim().slice(0,100);const operation=String(item?.operation||'').trim().toLowerCase();if(!entityType||!['create','update','delete'].includes(operation))continue;let entityId=null;if(item?.entityId){const parsed=String(item.entityId).trim();if(/^[0-9a-f-]{36}$/i.test(parsed))entityId=parsed;}const r=await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING cursor`,[req.auth.schoolId,entityType,entityId,operation,JSON.stringify(item?.payload||{}),req.auth.sub]);accepted.push({clientId:item?.clientId||null,cursor:Number(r.rows[0].cursor)});}
    await client.query(`UPDATE sync_devices SET last_seen_at=now() WHERE id=$1`,[d.rows[0].id]); await client.query('COMMIT'); res.json({accepted});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}});

  app.get('/api/sync/conflicts',authenticate,requireSchool,async(req,res,next)=>{try{
    const status=String(req.query.status||'pending').trim().toLowerCase();
    const allowed=['pending','server_wins','local_wins','merged'];
    if(!allowed.includes(status))return res.status(400).json({error:'Invalid conflict status'});
    const limit=Math.min(200,Math.max(1,Number(req.query.limit||50)));
    const r=await pool.query(`SELECT id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at FROM sync_conflicts WHERE school_id=$1 AND resolution=$2 ORDER BY created_at DESC LIMIT $3`,[req.auth.schoolId,status,limit]);
    res.json({conflicts:r.rows});
  }catch(e){next(e)}});

  app.patch('/api/sync/conflicts/:id',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{
    const resolution=String(req.body?.resolution||'').trim().toLowerCase();
    if(!['server_wins','local_wins','merged'].includes(resolution))return res.status(400).json({error:'Resolution must be server_wins, local_wins or merged'});
    const r=await pool.query(`UPDATE sync_conflicts SET resolution=$1,resolved_at=now() WHERE id=$2 AND school_id=$3 RETURNING id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at`,[resolution,req.params.id,req.auth.schoolId]);
    if(!r.rows.length)return res.status(404).json({error:'Conflict not found'});
    res.json({conflict:r.rows[0]});
  }catch(e){next(e)}});

  app.get('/api/sync/local-connectors',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const r=await pool.query(`SELECT id,connector_type,display_name,enabled,permission_mode,selected_path,last_sync_at,last_error,created_at,updated_at FROM local_storage_connectors WHERE school_id=$1 ORDER BY created_at DESC`,[req.auth.schoolId]);res.json({connectors:r.rows})}catch(e){next(e)}});
  app.post('/api/sync/local-connectors',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const {deviceId=null,connectorType='desktop_folder',displayName,permissionMode='read_write',selectedPath=null}=req.body||{};if(!displayName)return res.status(400).json({error:'displayName is required'});if(!['desktop_folder','nas_folder','external_drive'].includes(connectorType))return res.status(400).json({error:'Invalid connector type'});if(!['read_only','read_write'].includes(permissionMode))return res.status(400).json({error:'Invalid permission mode'});if(deviceId){const d=await pool.query('SELECT id FROM sync_devices WHERE id=$1 AND school_id=$2 AND status=\'active\'',[deviceId,req.auth.schoolId]);if(!d.rows.length)return res.status(400).json({error:'Device is not registered for this school'});}const r=await pool.query(`INSERT INTO local_storage_connectors(school_id,device_id,connector_type,display_name,permission_mode,selected_path) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.auth.schoolId,deviceId,connectorType,String(displayName).trim().slice(0,200),permissionMode,selectedPath]);res.status(201).json({connector:r.rows[0]})}catch(e){next(e)}});
  app.patch('/api/sync/local-connectors/:id',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const allowed={displayName:'display_name',enabled:'enabled',permissionMode:'permission_mode',selectedPath:'selected_path'};const sets=[];const vals=[];for(const [key,column] of Object.entries(allowed)){if(Object.prototype.hasOwnProperty.call(req.body||{},key)){sets.push(`${column}=$${vals.length+1}`);vals.push(req.body[key]);}}if(req.body?.permissionMode&&!['read_only','read_write'].includes(req.body.permissionMode))return res.status(400).json({error:'Invalid permission mode'});if(!sets.length)return res.status(400).json({error:'No supported fields supplied'});vals.push(req.params.id,req.auth.schoolId);const r=await pool.query(`UPDATE local_storage_connectors SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length-1} AND school_id=$${vals.length} RETURNING *`,vals);if(!r.rows.length)return res.status(404).json({error:'Connector not found'});res.json({connector:r.rows[0]})}catch(e){next(e)}});
}
module.exports={registerSyncRoutes};
