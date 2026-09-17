const { authenticate, requireRoles } = require('./auth');

function registerPlatformCompatRoutes(app, pool) {
  app.get('/api/platform/schools', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT s.id, s.name, s.code, s.status, s.created_at AS "createdAt",
               ss.display_name AS "displayName", ss.logo_url AS "logoUrl"
        FROM schools s
        LEFT JOIN school_settings ss ON ss.school_id = s.id
        ORDER BY s.created_at DESC, s.name
      `);
      res.json({ schools: rows });
    } catch (err) { next(err); }
  });

  app.patch('/api/platform/schools/:id/branding', authenticate, requireRoles('super_admin'), async (req, res, next) => {
    const body = req.body || {};
    const logoUrl = body.logoUrl === undefined ? undefined : String(body.logoUrl || '').trim();
    const primaryColor = body.primaryColor === undefined ? undefined : String(body.primaryColor || '').trim();
    const secondaryColor = body.secondaryColor === undefined ? undefined : String(body.secondaryColor || '').trim();
    if (logoUrl === undefined && primaryColor === undefined && secondaryColor === undefined) {
      return res.status(400).json({ error: 'logoUrl, primaryColor or secondaryColor is required' });
    }
    if (logoUrl !== undefined && logoUrl && !/^https:\/\//.test(logoUrl) && !/^data:image\/(png|jpeg|webp|svg\\+xml);base64,[A-Za-z0-9+/=]+$/.test(logoUrl)) {
      return res.status(400).json({ error: 'Logo must be an HTTPS URL or supported image data URL' });
    }
    try {
      const school = await pool.query('SELECT id FROM schools WHERE id=$1', [req.params.id]);
      if (!school.rowCount) return res.status(404).json({ error: 'School not found' });
      const values = [req.params.id];
      const set = [];
      for (const [column, value] of [['logo_url', logoUrl], ['primary_color', primaryColor], ['secondary_color', secondaryColor]]) {
        if (value !== undefined) { values.push(value || null); set.push(`${column}=$${values.length}`); }
      }
      const settings = await pool.query(`UPDATE school_settings SET ${set.join(',')}, updated_at=now() WHERE school_id=$1`, values);
      if (!settings.rowCount) return res.status(404).json({ error: 'School settings not found' });
      await pool.query(`UPDATE mobile_app_configs SET ${set.join(',')}, updated_at=now() WHERE school_id=$1`, values);
      res.json({ message: 'School branding updated' });
    } catch (err) { next(err); }
  });
}

module.exports = { registerPlatformCompatRoutes };
