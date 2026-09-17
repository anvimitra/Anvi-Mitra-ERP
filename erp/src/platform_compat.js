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
    const client = await pool.connect();
    try {
      const body = req.body || {};
      const logoUrl = body.logoUrl === undefined ? undefined : String(body.logoUrl || '').trim();
      const secondaryColor = body.secondaryColor === undefined ? undefined : String(body.secondaryColor || '').trim();
      const primaryColor = body.primaryColor === undefined ? undefined : String(body.primaryColor || '').trim();
      if (logoUrl === undefined && secondaryColor === undefined && primaryColor === undefined) {
        return res.status(400).json({ error: 'logoUrl, primaryColor or secondaryColor is required' });
      }
      if (logoUrl !== undefined && logoUrl && !/^https:\/\//.test(logoUrl) && !/^data:image\/(png|jpeg|webp|svg\\+xml);base64,[A-Za-z0-9+/=]+$/.test(logoUrl)) {
        return res.status(400).json({ error: 'Logo must be an HTTPS URL or supported image data URL' });
      }
      await client.query('BEGIN');
      const exists = await client.query('SELECT id FROM schools WHERE id=$1', [req.params.id]);
      if (!exists.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'School not found' });
      }
      const settings = [];
      const settingsValues = [req.params.id];
      for (const [column, value] of [['logo_url', logoUrl], ['primary_color', primaryColor], ['secondary_color', secondaryColor]]) {
        if (value !== undefined) {
          settingsValues.push(value || null);
          settings.push(`${column}=$${settingsValues.length}`);
        }
      }
      await client.query(`UPDATE school_settings SET ${settings.join(',')}, updated_at=now() WHERE school_id=$1`, settingsValues);
      await client.query(`UPDATE mobile_app_configs SET ${settings.join(',')}, updated_at=now() WHERE school_id=$1`, settingsValues);
      await client.query('COMMIT');
      res.json({ message: 'School branding updated' });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });
}

module.exports = { registerPlatformCompatRoutes };
