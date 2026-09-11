const { authenticate, requireRoles } = require('./auth');

function registerOrganizationRoutes(app, pool) {
  const platformRoles = ['super_admin'];
  const schoolRoles = ['super_admin','principal','admin'];

  app.get('/api/organization', authenticate, async (req, res, next) => {
    try {
      const { rows: schoolRows } = await pool.query(`SELECT s.id,s.name,s.code,s.status,ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id WHERE s.id=$1`, [req.auth.schoolId]);
      if (!schoolRows.length) return res.status(404).json({ error: 'School not found' });
      const { rows: branches } = await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`, [req.auth.schoolId]);
      res.json({ school: schoolRows[0], branches });
    } catch (err) { next(err); }
  });

  app.get('/api/branches', authenticate, async (req,res,next) => {
    try { const { rows } = await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`, [req.auth.schoolId]); res.json({ branches: rows }); }
    catch (err) { next(err); }
  });

  app.post('/api/branches', authenticate, requireRoles(...schoolRoles), async (req,res,next) => {
    try { const { name, code, address=null, phone=null, email=null, logoUrl=null, isMain=false } = req.body || {}; if (!name || !code) return res.status(400).json({ error:'name and code are required' }); const { rows } = await pool.query(`INSERT INTO branches(school_id,name,code,address,phone,email,logo_url,is_main) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`, [req.auth.schoolId,String(name).trim(),String(code).trim().toUpperCase(),address,phone,email,logoUrl,Boolean(isMain)]); res.status(201).json({ branch: rows[0] }); }
    catch (err) { next(err); }
  });

  app.patch('/api/branches/:id', authenticate, requireRoles(...schoolRoles), async (req,res,next) => {
    try { const map={name:'name',code:'code',address:'address',phone:'phone',email:'email',logoUrl:'logo_url',status:'status',isMain:'is_main'}; const keys=Object.keys(map).filter(k=>Object.prototype.hasOwnProperty.call(req.body||{},k)); if(!keys.length)return res.status(400).json({error:'No fields to update'}); const sets=keys.map((k,i)=>`${map[k]}=$${i+1}`); const vals=keys.map(k=>k==='code'?String(req.body[k]).trim().toUpperCase():req.body[k]); vals.push(req.params.id,req.auth.schoolId); const {rows}=await pool.query(`UPDATE branches SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length-1} AND school_id=$${vals.length} RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`,vals); if(!rows.length)return res.status(404).json({error:'Branch not found'}); res.json({branch:rows[0]}); }
    catch(err){next(err);}
  });

  app.get('/api/platform/schools', authenticate, requireRoles(...platformRoles), async (_req,res,next) => {
    try { const {rows}=await pool.query(`SELECT s.id,s.name,s.code,s.status,s.created_at AS "createdAt",ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat",mac.app_name AS "appName",mac.app_slug AS "appSlug",mac.android_package AS "androidPackage",mac.ios_bundle_id AS "iosBundleId",mac.api_base_url AS "apiBaseUrl",mac.logo_url AS "appLogoUrl",mac.primary_color AS "appPrimaryColor",mac.secondary_color AS "appSecondaryColor",mac.support_email AS "supportEmail",mac.support_phone AS "supportPhone",mac.min_app_version AS "minAppVersion",mac.force_update AS "forceUpdate",mac.status AS "appStatus" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id LEFT JOIN mobile_app_configs mac ON mac.school_id=s.id ORDER BY s.name`); res.json({schools:rows}); }
    catch(err){next(err);}
  });

  app.get('/api/platform/schools/:id', authenticate, requireRoles(...platformRoles), async (req,res,next) => {
    try {
      const {rows}=await pool.query(`SELECT s.id,s.name,s.code,s.status,s.created_at AS "createdAt",ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat",mac.app_name AS "appName",mac.app_slug AS "appSlug",mac.android_package AS "androidPackage",mac.ios_bundle_id AS "iosBundleId",mac.api_base_url AS "apiBaseUrl",mac.logo_url AS "appLogoUrl",mac.primary_color AS "appPrimaryColor",mac.secondary_color AS "appSecondaryColor",mac.support_email AS "supportEmail",mac.support_phone AS "supportPhone",mac.min_app_version AS "minAppVersion",mac.force_update AS "forceUpdate",mac.status AS "appStatus" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id LEFT JOIN mobile_app_configs mac ON mac.school_id=s.id WHERE s.id=$1`,[req.params.id]);
      if(!rows.length)return res.status(404).json({error:'School not found'});
      const {rows:branches}=await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`,[req.params.id]);
      res.json({school:rows[0],branches});
    }catch(err){next(err);}
  });

  app.patch('/api/platform/schools/:id', authenticate, requireRoles(...platformRoles), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const b=req.body||{};
      const schoolFields={name:'name',code:'code',status:'status'};
      const settingsFields={displayName:'display_name',logoUrl:'logo_url',primaryColor:'primary_color',secondaryColor:'secondary_color',address:'address',phone:'phone',email:'email',website:'website',timezone:'timezone',currencyCode:'currency_code',locale:'locale',dateFormat:'date_format'};
      const appFields={appName:'app_name',appSlug:'app_slug',androidPackage:'android_package',iosBundleId:'ios_bundle_id',apiBaseUrl:'api_base_url',appLogoUrl:'logo_url',appPrimaryColor:'primary_color',appSecondaryColor:'secondary_color',supportEmail:'support_email',supportPhone:'support_phone',minAppVersion:'min_app_version',forceUpdate:'force_update',appStatus:'status'};
      const schoolSet=[],schoolVals=[],settingsSet=[],settingsVals=[],appSet=[],appVals=[];
      for(const [k,c] of Object.entries(schoolFields)) if(Object.prototype.hasOwnProperty.call(b,k)){schoolSet.push(`${c}=$${schoolVals.length+1}`);schoolVals.push(k==='code'?String(b[k]).trim().toUpperCase():b[k]);}
      for(const [k,c] of Object.entries(settingsFields)) if(Object.prototype.hasOwnProperty.call(b,k)){settingsSet.push(`${c}=$${settingsVals.length+1}`);settingsVals.push(b[k] ?? null);}
      for(const [k,c] of Object.entries(appFields)) if(Object.prototype.hasOwnProperty.call(b,k)){appSet.push(`${c}=$${appVals.length+1}`);appVals.push(k==='appSlug'?String(b[k]).trim().toLowerCase():b[k]);}
      if(b.appSlug && !/^[a-z0-9][a-z0-9-]{2,98}$/.test(String(b.appSlug).trim().toLowerCase())) return res.status(400).json({error:'Invalid appSlug'});
      if(!schoolSet.length&&!settingsSet.length&&!appSet.length)return res.status(400).json({error:'No supported fields supplied'});
      await client.query('BEGIN');
      let school;
      if(schoolSet.length){
        schoolVals.push(req.params.id);
        const r=await client.query(`UPDATE schools SET ${schoolSet.join(',')},updated_at=now() WHERE id=$${schoolVals.length} RETURNING id,name,code,status,created_at AS "createdAt"`,schoolVals);
        if(!r.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'School not found'});} school=r.rows[0];
      } else {
        const r=await client.query(`SELECT id,name,code,status,created_at AS "createdAt" FROM schools WHERE id=$1`,[req.params.id]);
        if(!r.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'School not found'});} school=r.rows[0];
      }
      if(settingsSet){settingsVals.push(req.params.id);await client.query(`UPDATE school_settings SET ${settingsSet.join(',')},updated_at=now() WHERE school_id=$${settingsVals.length}`,settingsVals);}
      if(appSet){appVals.push(req.params.id);await client.query(`UPDATE mobile_app_configs SET ${appSet.join(',')},updated_at=now() WHERE school_id=$${appVals.length}`,appVals);}
      await client.query('COMMIT');
      res.json({school,message:'School configuration updated'});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'School code or app identifier is already in use'});next(err);}
    finally{client.release();}
  });

  app.post('/api/platform/schools', authenticate, requireRoles(...platformRoles), async (req,res,next)=>{
    const client=await pool.connect();
    try { const body=req.body||{}; const name=String(body.name||'').trim(); const code=String(body.code||'').trim().toUpperCase(); const displayName=String(body.displayName||name).trim(); const appName=String(body.appName||displayName).trim(); const appSlug=String(body.appSlug||code.toLowerCase()).trim().toLowerCase(); if(!name||!code||!appSlug)return res.status(400).json({error:'name, code and appSlug are required'}); if(!/^[a-z0-9][a-z0-9-]{2,98}$/.test(appSlug))return res.status(400).json({error:'appSlug must contain 3-99 lowercase letters, numbers or hyphens'}); await client.query('BEGIN'); const schoolResult=await client.query(`INSERT INTO schools(name,code,status) VALUES($1,$2,$3) RETURNING id,name,code,status,created_at AS "createdAt"`,[name,body.status==='inactive'?'inactive':'active']); const school=schoolResult.rows[0]; await client.query(`INSERT INTO school_settings(school_id,display_name,logo_url,primary_color,secondary_color,address,phone,email,website,timezone,currency_code,locale,date_format) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[school.id,displayName,body.logoUrl||null,body.primaryColor||null,body.secondaryColor||null,body.address||null,body.phone||null,body.email||null,body.website||null,body.timezone||'Asia/Kolkata',body.currencyCode||'INR',body.locale||'en-IN',body.dateFormat||'DD-MM-YYYY']); await client.query(`INSERT INTO branches(school_id,name,code,address,phone,email,logo_url,is_main) VALUES($1,$2,$3,$4,$5,$6,$7,true)`,[school.id,body.mainBranchName||'Main Branch',body.mainBranchCode||'MAIN',body.address||null,body.phone||null,body.email||null,body.logoUrl||null]); await client.query(`INSERT INTO mobile_app_configs(school_id,app_name,app_slug,android_package,ios_bundle_id,api_base_url,logo_url,primary_color,secondary_color,support_email,support_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[school.id,appName,appSlug,body.androidPackage||null,body.iosBundleId||null,body.apiBaseUrl||null,body.logoUrl||null,body.primaryColor||null,body.secondaryColor||null,body.email||null,body.phone||null]); await client.query('COMMIT'); res.status(201).json({school,message:'School created with settings, main branch and mobile app configuration'}); }
    catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'School code or mobile app slug/package is already in use'});next(err);}
    finally{client.release();}
  });
}
module.exports={registerOrganizationRoutes};
