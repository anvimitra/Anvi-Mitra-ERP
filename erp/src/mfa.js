const crypto = require('crypto');
const { authenticate, requireRoles } = require('./auth');

const managers = ['super_admin', 'principal', 'admin'];

function registerMfaRoutes(app, pool) {
  app.get('/api/security/mfa', authenticate, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT method, enabled, created_at AS "createdAt" FROM user_mfa WHERE user_id=$1 ORDER BY method`,
        [req.auth.sub],
      );
      res.json({ configured: rows.length > 0, methods: rows });
    } catch (err) { next(err); }
  });

  app.post('/api/security/mfa/enroll', authenticate, async (req, res, next) => {
    try {
      const method = String(req.body?.method || 'totp').trim().toLowerCase();
      if (!['totp', 'sms', 'email'].includes(method)) return res.status(400).json({ error: 'Unsupported MFA method' });
      const secretRef = crypto.createHash('sha256').update(`${req.auth.sub}:${method}:${crypto.randomUUID()}`).digest('hex');
      const { rows } = await pool.query(
        `INSERT INTO user_mfa(user_id,method,secret_ref,enabled) VALUES($1,$2,$3,false)
         ON CONFLICT(user_id,method) DO UPDATE SET secret_ref=EXCLUDED.secret_ref,enabled=false
         RETURNING method,enabled,created_at AS "createdAt"`,
        [req.auth.sub, method, secretRef],
      );
      res.status(201).json({ enrollment: rows[0], verificationRequired: true, providerConfigured: Boolean(process.env.MFA_PROVIDER_KEY) });
    } catch (err) { next(err); }
  });

  app.post('/api/security/mfa/verify', authenticate, async (req, res, next) => {
    try {
      const method = String(req.body?.method || 'totp').trim().toLowerCase();
      const code = String(req.body?.code || '').trim();
      if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'A six-digit verification code is required' });
      const { rows } = await pool.query(
        `UPDATE user_mfa SET enabled=true WHERE user_id=$1 AND method=$2 AND secret_ref IS NOT NULL
         RETURNING method,enabled,created_at AS "createdAt"`,
        [req.auth.sub, method],
      );
      if (!rows.length) return res.status(404).json({ error: 'MFA enrollment not found' });
      res.json({ method: rows[0].method, enabled: rows[0].enabled, providerConfigured: Boolean(process.env.MFA_PROVIDER_KEY) });
    } catch (err) { next(err); }
  });

  app.delete('/api/security/mfa/:method', authenticate, async (req, res, next) => {
    try {
      const { rowCount } = await pool.query('DELETE FROM user_mfa WHERE user_id=$1 AND method=$2', [req.auth.sub, req.params.method]);
      if (!rowCount) return res.status(404).json({ error: 'MFA method not found' });
      res.json({ removed: true });
    } catch (err) { next(err); }
  });

  app.get('/api/security/mfa/policy', authenticate, requireRoles(...managers), (_req, res) => {
    res.json({ provider: process.env.MFA_PROVIDER || 'placeholder', configured: Boolean(process.env.MFA_PROVIDER_KEY), enforcement: 'optional', note: 'Enable provider verification and policy enforcement after adding production credentials.' });
  });
}

module.exports = { registerMfaRoutes };