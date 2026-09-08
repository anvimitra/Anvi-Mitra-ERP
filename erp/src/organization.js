const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function requireSchool(req, res, next) { if (!req.auth?.schoolId) return res.status(403).json({ error: 'School context required' }); next(); }

function registerOrganizationRoutes(app, pool) {
  app.get('/api/organization', authenticate, requireSchool, async (req, res, next) => {
    try {
      const school = await pool.query(`SELECT id,name,code,display_name AS "displayName",address,phone,email,logo_url AS "logoUrl",status FROM schools WHERE id=$1`, [req.auth.schoolId]);
      if (!school.rows.length) return res.status(404).json({ error: 'School not found' });
      const branches = await pool.query(`SELECT id,name,code,address,phone,status FROM branches WHERE school_id=$1 ORDER BY name`, [req.auth.schoolId]);
      res.json({ school: school.rows[0], branches: branches.rows });
    } catch (e) { next(e); }
  });

  app.get('/api/branches', authenticate, requireSchool, async (req, res, next) => {
    try {
      const r = await pool.query(`SELECT id,name,code,address,phone,status FROM branches WHERE school_id=$1 ORDER BY name`, [req.auth.schoolId]);
      res.json({ branches: r.rows });
    } catch (e) { next(e); }
  });

  app.post('/api/branches', authenticate, requireSchool, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const name = clean(req.body?.name); const code = clean(req.body?.code, 50).toUpperCase();
      if (!name || !code) return res.status(400).json({ error: 'name and code are required' });
      const r = await pool.query(`INSERT INTO branches(school_id,name,code,address,phone,status) VALUES($1,$2,$3,$4,$5,'active') RETURNING id,name,code,address,phone,status`, [req.auth.schoolId,name,code,req.body?.address || null,req.body?.phone || null]);
      res.status(201).json({ branch: r.rows[0] });
    } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Branch code already exists for this school' }); next(e); }
  });

  app.patch('/api/branches/:id', authenticate, requireSchool, requireRoles('super_admin','principal','admin'), async (req, res, next) => {
    try {
      const map = { name: 'name', code: 'code', address: 'address', phone: 'phone', status: 'status' };
      const sets = []; const values = [];
      for (const [key, col] of Object.entries(map)) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) { sets.push(`${col}=$${values.length + 1}`); values.push(key === 'code' ? clean(req.body[key], 50).toUpperCase() : req.body[key]); }
      if (!sets.length) return res.status(400).json({ error: 'No supported fields supplied' });
      values.push(req.params.id, req.auth.schoolId);
      const r = await pool.query(`UPDATE branches SET ${sets.join(',')},updated_at=now() WHERE id=$${values.length-1} AND school_id=$${values.length} RETURNING id,name,code,address,phone,status`, values);
      if (!r.rows.length) return res.status(404).json({ error: 'Branch not found' });
      res.json({ branch: r.rows[0] });
    } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Branch code already exists for this school' }); next(e); }
  });

  app.get('/api/platform/schools', authenticate, requireRoles('super_admin'), async (_req, res, next) => {
    try {
      const r = await pool.query(`SELECT s.id,s.name,s.code,s.display_name,s.address,s.phone,s.email,s.logo_url,s.status,s.created_at,mc.app_name,mc.app_slug,b.name AS branch_name,b.code AS branch_code FROM schools s LEFT JOIN mobile_app_configs mc ON mc.school_id=s.id LEFT JOIN branches b ON b.school_id=s.id AND b.code='MAIN' ORDER BY s.created_at DESC`);
      res.json({ schools: r.rows });
    } catch (e) { next(e); }
  });

  app.post('/api/platform/schools', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const name = clean(req.body?.name); const code = clean(req.body?.code, 50).toUpperCase(); const appSlug = clean(req.body?.appSlug, 100).toLowerCase();
      const adminEmail = clean(req.body?.initialAdminEmail, 254).toLowerCase();
      const adminPhone = clean(req.body?.initialAdminPhone, 30);
      const adminPassword = String(req.body?.initialAdminPassword || '');
      const adminName = clean(req.body?.initialAdminName, 200);
      if (!name || !code || !appSlug) return res.status(400).json({ error: 'name, code and appSlug are required' });
      if ((adminEmail || adminPhone) && adminPassword.length < 6) return res.status(400).json({ error: 'Initial admin password must be at least 6 characters' });
      if (!adminEmail && !adminPhone) return res.status(400).json({ error: 'Initial admin email or phone is required for school onboarding' });
      if (!adminName) return res.status(400).json({ error: 'Initial admin name is required' });
      const branchName = clean(req.body?.branchName || 'Main Branch'); const branchCode = clean(req.body?.branchCode || 'MAIN', 50).toUpperCase();
      await client.query('BEGIN');
      const s = await client.query(`INSERT INTO schools(name,code,display_name,address,phone,email,logo_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id,name,code,display_name,address,phone,email,logo_url,status,created_at`, [name,code,req.body?.displayName || name,req.body?.address || null,req.body?.phone || null,req.body?.supportEmail || null,req.body?.logoUrl || null]);
      const schoolId = s.rows[0].id;
      await client.query(`INSERT INTO school_settings(school_id) VALUES($1) ON CONFLICT(school_id) DO NOTHING`, [schoolId]);
      const b = await client.query(`INSERT INTO branches(school_id,name,code,address,phone,status) VALUES($1,$2,$3,$4,$5,'active') RETURNING id,name,code`, [schoolId,branchName,branchCode,req.body?.address || null,req.body?.phone || null]);
      await client.query(`INSERT INTO mobile_app_configs(school_id,app_name,app_slug,android_package,ios_bundle_id,api_base_url,logo_url,primary_color,secondary_color,support_email,support_phone,min_app_version,force_update,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active')`, [schoolId,req.body?.appName || `${name} App`,appSlug,req.body?.androidPackage || null,req.body?.iosBundleId || null,req.body?.apiBaseUrl || null,req.body?.logoUrl || null,req.body?.primaryColor || '4F46E5',req.body?.secondaryColor || '0F1720',req.body?.supportEmail || null,req.body?.supportPhone || null,req.body?.minAppVersion || '1.0.0',Boolean(req.body?.forceUpdate)]);
      const passwordHash = await hashPassword(adminPassword);
      const admin = await client.query(`INSERT INTO users(school_id,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,'admin','active') RETURNING id,email,phone,role,status,created_at`, [schoolId,adminEmail || null,adminPhone || null,passwordHash]);
      await client.query(`INSERT INTO audit_logs(school_id,user_id,action,entity_type,metadata) VALUES($1,$2,$3,$4,$5)`, [schoolId,req.auth.sub,'school_onboarded','school',JSON.stringify({initialAdminId:admin.rows[0].id,mainBranchId:b.rows[0].id})]);
      await client.query('COMMIT');
      res.status(201).json({ school: s.rows[0], mainBranch: b.rows[0], initialAdmin: admin.rows[0] });
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); if (e.code === '23505') return res.status(409).json({ error: 'School code, app slug, branch code or initial admin contact already exists' }); next(e); } finally { client.release(); }
  });

  app.patch('/api/platform/schools/:id', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const schoolId = req.params.id;
      const schoolFields = { name:'name', code:'code', displayName:'display_name', address:'address', phone:'phone', supportEmail:'email', logoUrl:'logo_url', status:'status' };
      const appFields = { appName:'app_name', appSlug:'app_slug', androidPackage:'android_package', iosBundleId:'ios_bundle_id', apiBaseUrl:'api_base_url', primaryColor:'primary_color', secondaryColor:'secondary_color', supportEmail:'support_email', supportPhone:'support_phone', minAppVersion:'min_app_version', forceUpdate:'force_update', appStatus:'status' };
      const schoolSets=[]; const schoolValues=[]; const appSets=[]; const appValues=[];
      for (const [key,col] of Object.entries(schoolFields)) if (Object.prototype.hasOwnProperty.call(req.body||{},key)) { schoolSets.push(`${col}=$${schoolValues.length+1}`); schoolValues.push(key==='code'?clean(req.body[key],50).toUpperCase():req.body[key]); }
      for (const [key,col] of Object.entries(appFields)) if (Object.prototype.hasOwnProperty.call(req.body||{},key)) { appSets.push(`${col}=$${appValues.length+1}`); appValues.push(key==='appSlug'?clean(req.body[key],100).toLowerCase():req.body[key]); }
      await client.query('BEGIN');
      let school;
      if (schoolSets.length) { schoolValues.push(schoolId); const r=await client.query(`UPDATE schools SET ${schoolSets.join(',')} WHERE id=$${schoolValues.length} RETURNING id,name,code,display_name,address,phone,email,logo_url,status,created_at`,schoolValues); if(!r.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'School not found'});} school=r.rows[0]; }
      else { const r=await client.query(`SELECT id,name,code,display_name,address,phone,email,logo_url,status,created_at FROM schools WHERE id=$1`,[schoolId]); if(!r.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'School not found'});} school=r.rows[0]; }
      if (appSets.length) { appValues.push(schoolId); await client.query(`UPDATE mobile_app_configs SET ${appSets.join(',')} WHERE school_id=$${appValues.length}`,appValues); }
      await client.query('COMMIT'); res.json({ school });
    } catch(e){ await client.query('ROLLBACK').catch(()=>{}); if(e.code==='23505')return res.status(409).json({error:'School code or app slug already exists'}); next(e); } finally { client.release(); }
  });
}
module.exports = { registerOrganizationRoutes };
