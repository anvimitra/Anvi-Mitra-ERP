const { authenticate, requireRoles } = require('./auth');

const adminRoles = ['super_admin', 'principal', 'admin'];

function configured(required) {
  return required.every(key => Boolean(process.env[key]));
}

function registerIntegrationSeamRoutes(app, pool) {
  app.get('/api/integrations/status', authenticate, requireRoles(...adminRoles), async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, provider, status, amount, currency_code AS "currencyCode", updated_at AS "updatedAt"
         FROM payment_intents WHERE school_id=$1 ORDER BY updated_at DESC LIMIT 10`,
        [req.auth.schoolId],
      );
      res.json({
        integrations: {
          payment: { provider: process.env.PAYMENT_PROVIDER || 'manual_adapter', configured: configured(['PAYMENT_PROVIDER', 'PAYMENT_WEBHOOK_SECRET']) },
          push: { provider: process.env.PUSH_PROVIDER || 'placeholder', configured: configured(['PUSH_PROVIDER', 'PUSH_PROVIDER_KEY']) },
          sms: { provider: process.env.SMS_PROVIDER || 'placeholder', configured: configured(['SMS_PROVIDER', 'SMS_API_KEY']) },
          email: { provider: process.env.EMAIL_PROVIDER || 'placeholder', configured: configured(['EMAIL_PROVIDER', 'EMAIL_API_KEY']) },
          storage: { provider: process.env.STORAGE_PROVIDER || 'local_connector', configured: true },
          firebase: { provider: 'firebase', configured: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) },
        },
        recentPaymentIntents: result.rows,
      });
    } catch (err) { next(err); }
  });

  app.get('/api/integrations/config', authenticate, requireRoles(...adminRoles), (_req, res) => {
    res.json({
      payment: { provider: process.env.PAYMENT_PROVIDER || 'manual_adapter', webhookConfigured: Boolean(process.env.PAYMENT_WEBHOOK_SECRET) },
      push: { provider: process.env.PUSH_PROVIDER || 'placeholder' },
      sms: { provider: process.env.SMS_PROVIDER || 'placeholder' },
      email: { provider: process.env.EMAIL_PROVIDER || 'placeholder' },
      storage: { provider: process.env.STORAGE_PROVIDER || 'local_connector' },
      firebase: { projectId: process.env.FIREBASE_PROJECT_ID || null },
      note: 'Provider secrets are never returned by this endpoint. Add provider adapters later without changing ERP routes.',
    });
  });
}

module.exports = { registerIntegrationSeamRoutes, configured };