const { authenticate, requireRoles } = require('./auth');

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
      res.json({ school: rows[0], branches });
    } catch (err) { next(err); }
  });

  app.patch('/api/platform/schools/:id', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const b = req.body || {};
      const school = [];
      const schoolValues = [];
      if (Object.prototype.hasOwnProperty.call(b, 'name')) { school.push('name=$1'); schoolValues.push(String(b.name).trim()); }
      if (Object.prototype.hasOwnProperty.call(b, 'code')) { school.push(`code=$${schoolValues.length + 1}`); schoolValues.push(String(b.code).trim().toUpperCase()); }
      if (Object.prototype.hasOwnProperty.call(b, 'status')) { school.push(`status=$${schoolValues.length + 1}`); schoolValues.push(b.status); }
      const settingsMap = {displayName:'display_name',logoUrl:'logo_url',primaryColor:'primary_color',secondaryColor:'secondary_color',address:'address',phone:'phone',email:'email',website:'website',timezone:'timezone',currencyCode:'currency_code',locale:'locale',dateFormat:'date_format'};
      const appMap = {appName:'app_name',appSlug:'app_slug',androidPackage:'android_package',iosBundleId:'ios_bundle_id',apiBaseUrl:'api_base_url',appLogoUrl:'logo_url',appPrimaryColor:'primary_color',appSecondaryColor:'secondary_color',supportEmail:'support_email',supportPhone:'support_phone',minAppVersion:'min_app_version',forceUpdate:'force_update',appStatus:'status'};
      const build = map => { const set=[]; const vals=[]; for (const [key,col] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(b,key)) { set.push(`${col}=$${vals.length+1}`); vals.push(key==='appSlug' ? String(b[key]).trim().toLowerCase() : (b[key] ?? null)); } return {set,vals}; };
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
}

module.exports={registerPlatformSchoolManagementRoutes};
