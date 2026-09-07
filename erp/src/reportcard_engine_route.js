const { authenticate, requireRoles } = require('./auth');
const { generateReportCard } = require('./reportcard_engine');

function registerReportCardEngineRoute(app, pool) {
  const staffRoles = ['super_admin','principal','admin','teacher'];

  app.post('/api/report-card/generate/:studentId', authenticate, requireRoles(...staffRoles), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { sessionId, configId } = req.body || {};
      if (!sessionId || !configId) return res.status(400).json({ error: 'sessionId and configId are required' });
      await client.query('BEGIN');
      const result = await generateReportCard({ client, auth: req.auth, studentId: req.params.studentId, sessionId, configId });
      await client.query('COMMIT');
      res.status(201).json(result);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });
}

module.exports = { registerReportCardEngineRoute };