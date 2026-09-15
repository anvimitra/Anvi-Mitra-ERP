const { authenticate, requireRoles } = require('./auth');

function registerOrganizationRoutes(app, pool) {
  app.get('/api/public/school-config', async (req,res,next) => {
    try {
      const code=String(req.query.schoolCode||req.query.code||'').trim().toUpperCase();
      const slug=String(req.query.appSlug||'').trim().toLowerCase();
      if(!code&&!slug)return res.status(400).json({error:'schoolCode or appSlug is required'});
      const {rows}=await pool.query(`SELECT s.id,s.name,s.code,s.status,ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat",mac.app_name AS "appName",mac.app_slug AS "appSlug",mac.android_package AS "androidPackage",mac.ios_bundle_id AS "iosBundleId",mac.api_base_url AS "apiBaseUrl",mac.logo_url AS "appLogoUrl",mac.primary_color AS "appPrimaryColor",mac.secondary_color AS "appSecondaryColor",mac.support_email AS "supportEmail",mac.support_phone AS "supportPhone",mac.min_app_version AS "minAppVersion",mac.force_update AS "forceUpdate" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id LEFT JOIN mobile_app_configs mac ON mac.school_id=s.id WHERE s.status='active' AND ($1='' OR s.code=$1) AND ($2='' OR mac.app_slug=$2) LIMIT 1`,[code,slug]);
      if(!rows.length)return res.status(404).json({error:'Active school configuration not found'});
      res.json({school:rows[0]});
    }catch(err){next(err)}
  });
  const schoolRoles=['super_admin','principal','admin'];
  app.get('/api/organization',authenticate,async(req,res,next)=>{
    try{const {rows:schoolRows}=await pool.query(`SELECT s.id,s.name,s.code,s.status,ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id WHERE s.id=$1`,[req.auth.schoolId]);if(!schoolRows.length)return res.status(404).json({error:'School not found'});const {rows:branches}=await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`,[req.auth.schoolId]);res.json({school:schoolRows[0],branches})}catch(err){next(err)}});
  app.get('/api/branches',authenticate,async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`,[req.auth.schoolId]);res.json({branches:rows})}catch(err){next(err)}});
  app.post('/api/branches',authenticate,requireRoles(...schoolRoles),async(req,res,next)=>{try{const {name,code,address=null,phone=null,email=null,logoUrl=null,isMain=false}=req.body||{};if(!name||!code)return res.status(400).json({error:'name and code are required'});const {rows}=await pool.query(`INSERT INTO branches(school_id,name,code,address,phone,email,logo_url,is_main) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`,[req.auth.schoolId,String(name).trim(),String(code).trim().toUpperCase(),address,phone,email,logoUrl,Boolean(isMain)]);res.status(201).json({branch:rows[0]})}catch(err){next(err)}});
  app.patch('/api/branches/:id',authenticate,requireRoles(...schoolRoles),async(req,res,next)=>{try{const map={name:'name',code:'code',address:'address',phone:'phone',email:'email',logoUrl:'logo_url',status:'status',isMain:'is_main'};const keys=Object.keys(map).filter(k=>Object.prototype.hasOwnProperty.call(req.body||{},k));if(!keys.length)return res.status(400).json({error:'No fields to update'});const sets=keys.map((k,i)=>map[k]+'=$'+(i+1)),vals=keys.map(k=>k==='code'?String(req.body[k]).trim().toUpperCase():req.body[k]);vals.push(req.params.id,req.auth.schoolId);const {rows}=await pool.query(`UPDATE branches SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length-1} AND school_id=$${vals.length} RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`,vals);if(!rows.length)return res.status(404).json({error:'Branch not found'});res.json({branch:rows[0]})}catch(err){next(err)}});
  app.post('/api/platform/schools',authenticate,requireRoles('super_admin'),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const b=req.body||{};
      const name=String(b.name||'').trim(), code=String(b.code||'').trim().toUpperCase();
      const displayName=String(b.displayName||name).trim(), appName=String(b.appName||displayName).trim();
      const appSlug=String(b.appSlug||code.toLowerCase()).trim().toLowerCase();
      const adminEmail=String(b.adminEmail||'').trim().toLowerCase(), adminPhone=String(b.adminPhone||'').trim(), adminPassword=String(b.adminPassword||'');
      if(!name||!code||!appSlug)return res.status(400).json({error:'name, code and appSlug are required'});
      if(!/^[a-z0-9][a-z0-9-]{2,98}$/.test(appSlug))return res.status(400).json({error:'Invalid appSlug'});
      if(!adminEmail&&!adminPhone)return res.status(400).json({error:'First school administrator email or phone is required'});
      if(adminPassword.length<6)return res.status(400).json({error:'adminPassword must be at least 6 characters'});
      const adminRole=String(b.adminRole||'admin').toLowerCase()==='principal'?'principal':'admin';
      await client.query('BEGIN');
      const sr=await client.query(`INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id,name,code,status,created_at AS "createdAt"`,[name,code]);
      const school=sr.rows[0];
      await client.query(`INSERT INTO school_settings(school_id,display_name,logo_url,primary_color,secondary_color,address,phone,email,website,timezone,currency_code,locale,date_format) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[school.id,displayName,b.logoUrl||null,b.primaryColor||null,b.secondaryColor||null,b.address||null,b.phone||null,b.email||null,b.website||null,b.timezone||'Asia/Kolkata',b.currencyCode||'INR',b.locale||'en-IN',b.dateFormat||'DD-MM-YYYY']);
      const br=await client.query(`INSERT INTO branches(school_id,name,code,address,phone,email,logo_url,is_main) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id,name,code,status`,[school.id,b.mainBranchName||'Main Branch',String(b.mainBranchCode||'MAIN').trim().toUpperCase(),b.address||null,b.phone||null,b.email||null,b.logoUrl||null]);
      await client.query(`INSERT INTO mobile_app_configs(school_id,app_name,app_slug,android_package,ios_bundle_id,api_base_url,logo_url,primary_color,secondary_color,support_email,support_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[school.id,appName,appSlug,b.androidPackage||null,b.iosBundleId||null,b.apiBaseUrl||null,b.logoUrl||null,b.primaryColor||null,b.secondaryColor||null,b.email||null,b.phone||null]);
      const {hashPassword}=require('./security');
      const ur=await client.query(`INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id,email,phone,role,status,branch_id AS "branchId"`,[school.id,br.rows[0].id,adminEmail||null,adminPhone||null,await hashPassword(adminPassword),adminRole]);
      await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'staff',$2,'create',$3::jsonb,$4)`,[school.id,ur.rows[0].id,JSON.stringify(ur.rows[0]),req.auth.sub]);
      await client.query('COMMIT');
      res.status(201).json({school,branch:br.rows[0],admin:ur.rows[0],message:'School and first administrator provisioned'});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'School code, app slug or administrator email/phone is already in use'});next(err)}
    finally{client.release()}
  });

}
module.exports={registerOrganizationRoutes};
