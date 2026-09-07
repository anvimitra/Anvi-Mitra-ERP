const { authenticate, requireRoles } = require('./auth');

function registerMobileRoutes(app, pool) {
  app.get('/api/mobile/config', authenticate, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT app_name AS "appName",app_slug AS "appSlug",android_package AS "androidPackage",ios_bundle_id AS "iosBundleId",api_base_url AS "apiBaseUrl",logo_url AS "logoUrl",primary_color AS "primaryColor",secondary_color AS "secondaryColor",support_email AS "supportEmail",support_phone AS "supportPhone",min_app_version AS "minAppVersion",force_update AS "forceUpdate",status FROM mobile_app_configs WHERE school_id=$1 AND status='active'`, [req.auth.schoolId]);
      if (!rows.length) return res.status(404).json({error:'Mobile app is not configured for this school'});
      res.json({app:rows[0]});
    } catch(err){ next(err); }
  });

  app.put('/api/mobile/config', authenticate, requireRoles('super_admin','principal','admin'), async (req,res,next) => {
    try {
      const { appName,appSlug,androidPackage=null,iosBundleId=null,apiBaseUrl=null,logoUrl=null,primaryColor=null,secondaryColor=null,supportEmail=null,supportPhone=null,minAppVersion=null,forceUpdate=false,status='active' } = req.body || {};
      if (!appName || !appSlug) return res.status(400).json({error:'appName and appSlug are required'});
      const { rows } = await pool.query(`INSERT INTO mobile_app_configs(school_id,app_name,app_slug,android_package,ios_bundle_id,api_base_url,logo_url,primary_color,secondary_color,support_email,support_phone,min_app_version,force_update,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(school_id) DO UPDATE SET app_name=EXCLUDED.app_name,app_slug=EXCLUDED.app_slug,android_package=EXCLUDED.android_package,ios_bundle_id=EXCLUDED.ios_bundle_id,api_base_url=EXCLUDED.api_base_url,logo_url=EXCLUDED.logo_url,primary_color=EXCLUDED.primary_color,secondary_color=EXCLUDED.secondary_color,support_email=EXCLUDED.support_email,support_phone=EXCLUDED.support_phone,min_app_version=EXCLUDED.min_app_version,force_update=EXCLUDED.force_update,status=EXCLUDED.status,updated_at=now() RETURNING id,app_name AS "appName",app_slug AS "appSlug",android_package AS "androidPackage",ios_bundle_id AS "iosBundleId",api_base_url AS "apiBaseUrl",logo_url AS "logoUrl",primary_color AS "primaryColor",secondary_color AS "secondaryColor",support_email AS "supportEmail",support_phone AS "supportPhone",min_app_version AS "minAppVersion",force_update AS "forceUpdate",status`, [req.auth.schoolId,appName,String(appSlug).trim().toLowerCase(),androidPackage,iosBundleId,apiBaseUrl,logoUrl,primaryColor,secondaryColor,supportEmail,supportPhone,minAppVersion,Boolean(forceUpdate),status]);
      res.json({app:rows[0]});
    } catch(err){ next(err); }
  });
}

module.exports = { registerMobileRoutes };
