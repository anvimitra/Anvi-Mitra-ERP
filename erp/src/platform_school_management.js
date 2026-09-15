const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function registerPlatformSchoolManagementRoutes(app, pool) {
  app.get('/api/platform/schools/:id', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.id,s.name,s.code,s.status,s.created_at AS "createdAt",
          ss.display_name AS "displayName",ss.logo_url AS "logoUrl",ss.primary_color AS "primaryColor",ss.secondary_color AS "secondaryColor",
          ss.address,ss.phone,ss.email,ss.website,ss.timezone,ss.currency_code AS "currencyCode",ss.locale,ss.date_format AS "dateFormat",
          mac.app_name AS "appName",mac.app_slug AS "appSlug",mac.android_package AS "androidPackage",mac.ios_bundle_id AS "iosBundleId",
          mac.api_base_url AS "apiBaseUrl",mac.logo_url AS "appLogoUrl",mac.primary_color AS "appPrimaryColor",mac.secondary_color AS "appSecondaryColor",
          mac.support_email AS "supportEmail",mac.support_phone AS "supportPhone",mac.min_app_version AS "minAppVersion",mac.force_update AS "forceUpdate",mac.status AS "appStatus"
         FROM schools s LEFT JOIN school_settings ss ON ss.school_id=s.id
         LEFT JOIN mobile_app_configs mac ON mac.school_id=s.id WHERE s.id=$1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'School not found' });
      const { rows: branches } = await pool.query(
        `SELECT id,name,code,address,phone,email,logo_url AS "logoUrl",status,is_main AS "isMain"
         FROM branches WHERE school_id=$1 ORDER BY is_main DESC,name`, [req.params.id]);
      const { rows: admins } = await pool.query(
        `SELECT id,email,phone,role,status,branch_id AS "branchId" FROM users
         WHERE school_id=$1 AND role IN ('principal','admin') ORDER BY role,email`, [req.params.id]);
      res.json({ school: rows[0], branches, admins });
    } catch (err) { next(err); }
  });

  app.patch('/api/platform/schools/:id', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const b = req.body || {};
      const school = [], schoolValues = [];
      if (Object.prototype.hasOwnProperty.call(b, 'name')) { school.push('name=$1'); schoolValues.push(String(b.name).trim()); }
      if (Object.prototype.hasOwnProperty.call(b, 'code')) { school.push(`code=$${schoolValues.length + 1}`); schoolValues.push(String(b.code).trim().toUpperCase()); }
      if (Object.prototype.hasOwnProperty.call(b, 'status')) { school.push(`status=$${schoolValues.length + 1}`); schoolValues.push(b.status); }
      const settingsMap = {displayName:'display_name',logoUrl:'logo_url',primaryColor:'primary_color',secondaryColor:'secondary_color',address:'address',phone:'phone',email:'email',website:'website',timezone:'timezone',currencyCode:'currency_code',locale:'locale',dateFormat:'date_format'};
      const appMap = {appName:'app_name',appSlug:'app_slug',androidPackage:'android_package',iosBundleId:'ios_bundle_id',apiBaseUrl:'api_base_url',appLogoUrl:'logo_url',appPrimaryColor:'primary_color',appSecondaryColor:'secondary_color',supportEmail:'support_email',supportPhone:'support_phone',minAppVersion:'min_app_version',forceUpdate:'force_update',appStatus:'status'};
      const build = map => { const set=[],vals=[]; for (const [key,col] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(b,key)) { set.push(`${col}=$${vals.length+1}`); vals.push(key==='appSlug' ? String(b[key]).trim().toLowerCase() : (b[key] ?? null)); } return {set,vals}; };
      const settings=build(settingsMap), appConfig=build(appMap);
      if (b.appSlug && !/^[a-z0-9][a-z0-9-]{2,98}$/.test(String(b.appSlug).trim().toLowerCase())) return res.status(400).json({error:'Invalid appSlug'});
      if (!school.length && !settings.set.length && !appConfig.set.length) return res.status(400).json({error:'No supported fields supplied'});
      await client.query('BEGIN');
      const sr=await client.query(`UPDATE schools SET ${school.length ? school.join(',')+',' : ''}updated_at=now() WHERE id=$${schoolValues.length+1} RETURNING id,name,code,status,created_at AS "createdAt"`, [...schoolValues,req.params.id]);
      if (!sr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({error:'School not found'}); }
      if (settings.set.length) await client.query(`UPDATE school_settings SET ${settings.set.join(',')},updated_at=now() WHERE school_id=$${settings.vals.length+1}`,[...settings.vals,req.params.id]);
      if (appConfig.set.length) await client.query(`UPDATE mobile_app_configs SET ${appConfig.set.join(',')},updated_at=now() WHERE school_id=$${appConfig.vals.length+1}`,[...appConfig.vals,req.params.id]);
      await client.query('COMMIT');
      res.json({school:sr.rows[0],message:'School configuration updated'});
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); next(err); } finally { client.release(); }
  });

  app.post('/api/platform/schools/:id/admin', authenticate, requireRoles('super_admin'), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const b=req.body||{};
      const email=String(b.email||'').trim().toLowerCase();
      const phone=String(b.phone||'').trim();
      const password=String(b.password||'');
      const role=String(b.role||'admin').trim().toLowerCase();
      if ((!email&&!phone)||password.length<6||!['admin','principal'].includes(role)) return res.status(400).json({error:'email or phone, password (min 6), and admin/principal role are required'});
      await client.query('BEGIN');
      const school=await client.query(`SELECT id FROM schools WHERE id=$1 AND status='active'`,[req.params.id]);
      if(!school.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'School not found or inactive'});}
      let branchId=b.branchId||null;
      if(branchId){
        const branch=await client.query(`SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,[branchId,req.params.id]);
        if(!branch.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Invalid school branch'});}
      } else {
        const branch=await client.query(`SELECT id FROM branches WHERE school_id=$1 AND status='active' ORDER BY is_main DESC LIMIT 1`,[req.params.id]);
        branchId=branch.rows[0]?.id||null;
      }
      const u=await client.query(`INSERT INTO users(school_id,branch_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id,email,phone,role,status,branch_id AS "branchId"`,[req.params.id,branchId,email||null,phone||null,await hashPassword(password),role]);
      await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,'staff',$2,'create',$3::jsonb,$4)`,[req.params.id,u.rows[0].id,JSON.stringify(u.rows[0]),req.auth.sub]);
      await client.query('COMMIT');
      res.status(201).json({admin:u.rows[0]});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});if(err.code==='23505')return res.status(409).json({error:'Administrator email/phone already exists'});next(err)}finally{client.release()}
  });

  // Upload a school logo as a data URL. This endpoint intentionally limits
  // uploads to small branding assets; larger media should use object storage.
  app.post('/api/platform/schools/:id/logo', authenticate, requireRoles('super_admin'), async (req,res,next)=>{
    try {
      const logoUrl=String(req.body?.logoUrl||'').trim();
      if(!logoUrl) return res.status(400).json({error:'logoUrl is required'});
      if(logoUrl.length>700000) return res.status(413).json({error:'Logo is too large'});
      if(!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logoUrl) && !/^https:\/\//.test(logoUrl)) return res.status(400).json({error:'Logo must be a PNG/JPEG/WebP/SVG data URL or HTTPS URL'});
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const s=await client.query('UPDATE school_settings SET logo_url=$1,updated_at=now() WHERE school_id=$2 RETURNING school_id,logo_url AS "logoUrl"',[logoUrl,req.params.id]);
        if(!s.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'School settings not found'});}
        await client.query('UPDATE mobile_app_configs SET logo_url=$1,updated_at=now() WHERE school_id=$2',[logoUrl,req.params.id]);
        await client.query('INSERT INTO sync_changes(school_id,entity_type,operation,payload,changed_by) VALUES($1,\'school_branding\',\'update\',$2::jsonb,$3)',[req.params.id,JSON.stringify({logoUrl}),req.auth.sub]);
        await client.query('COMMIT');
        res.json({logoUrl,message:'School and mobile-app logo updated'});
      }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}finally{client.release()}
    } catch(err){next(err)}
  });
}
module.exports={registerPlatformSchoolManagementRoutes};
