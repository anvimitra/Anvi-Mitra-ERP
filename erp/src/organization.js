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
    try{
      const {rows:schoolRows}=await pool.query(`SELECT s.id,s.name,s.code,s.status,ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat" FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id WHERE s.id=$1`,[req.auth.schoolId]);
      if(!schoolRows.length)return res.status(404).json({error:'School not found'});
      const {rows:branches}=await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`,[req.auth.schoolId]);
      res.json({school:schoolRows[0],branches});
    }catch(err){next(err)}
  });

  app.get('/api/branches',authenticate,async(req,res,next)=>{
    try{
      const {rows}=await pool.query(`SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain" FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`,[req.auth.schoolId]);
      res.json({branches:rows});
    }catch(err){next(err)}
  });

  app.post('/api/branches',authenticate,requireRoles(...schoolRoles),async(req,res,next)=>{
    try{
      const {name,code,address=null,phone=null,email=null,logoUrl=null,isMain=false}=req.body||{};
      if(!name||!code)return res.status(400).json({error:'name and code are required'});
      const {rows}=await pool.query(`INSERT INTO branches(school_id,name,code,address,phone,email,logo_url,is_main) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`,[req.auth.schoolId,String(name).trim(),String(code).trim().toUpperCase(),address,phone,email,logoUrl,Boolean(isMain)]);
      res.status(201).json({branch:rows[0]});
    }catch(err){next(err)}
  });

  app.patch('/api/branches/:id',authenticate,requireRoles(...schoolRoles),async(req,res,next)=>{
    try{
      const map={name:'name',code:'code',address:'address',phone:'phone',email:'email',logoUrl:'logo_url',status:'status',isMain:'is_main'};
      const keys=Object.keys(map).filter(k=>Object.prototype.hasOwnProperty.call(req.body||{},k));
      if(!keys.length)return res.status(400).json({error:'No fields to update'});
      const sets=keys.map((k,i)=>map[k]+'=$'+(i+1));
      const vals=keys.map(k=>k==='code'?String(req.body[k]).trim().toUpperCase():req.body[k]);
      vals.push(req.params.id,req.auth.schoolId);
      const {rows}=await pool.query(`UPDATE branches SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length-1} AND school_id=$${vals.length} RETURNING id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"`,vals);
      if(!rows.length)return res.status(404).json({error:'Branch not found'});
      res.json({branch:rows[0]});
    }catch(err){next(err)}
  });

  // School provisioning is owned by platform_school_management.js.
  // Keeping the route here would register a duplicate POST /api/platform/schools
  // and make Express depend on module registration order.
}

module.exports={registerOrganizationRoutes};
