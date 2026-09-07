const { authenticate, requireRoles } = require('./auth');

function registerRoutes(app) {
  app.get('/api/me', authenticate, (req,res)=>res.json({ user: req.auth }));
  app.get('/api/admin/ping', authenticate, requireRoles('super_admin','principal','admin'), (req,res)=>res.json({ ok:true, area:'admin', schoolId:req.auth.schoolId }));
}
module.exports = { registerRoutes };
