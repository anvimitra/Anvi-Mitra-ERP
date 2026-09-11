require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const { registerAuthRoutes } = require('./auth');

const app = express();
const port = Number(process.env.PORT || 4000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) : null;

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  let database = 'not-configured';
  if (pool) {
    try { await pool.query('SELECT 1'); database = 'ok'; }
    catch (_) { database = 'unavailable'; }
  }
  res.json({
    ok: true,
    service: 'anvi-mitra-erp-api',
    product: 'Anvi Mitra ERP',
    database,
    timestamp: new Date().toISOString()
  });
});

function registerOptional(moduleName, registerName) {
  let file;
  try { file = require.resolve(`./${moduleName}`); }
  catch (_) { console.warn(`Optional ERP module not present: ${moduleName}.js`); return false; }
  try {
    const mod = require(file);
    if (typeof mod[registerName] !== 'function') {
      console.warn(`ERP module ${moduleName}.js does not export ${registerName}`);
      return false;
    }
    mod[registerName](app, pool);
    return true;
  } catch (error) {
    console.error(`Failed to load ERP module ${moduleName}.js:`, error);
    if (process.env.NODE_ENV === 'production') throw error;
    return false;
  }
}

if (pool) {
  registerAuthRoutes(app, pool);
  const modules = [
    ['routes','registerRoutes'], ['people','registerPeopleRoutes'], ['attendance','registerAttendanceRoutes'],
    ['attendance_reports','registerAttendanceReportRoutes'], ['exams','registerExamRoutes'],
    ['exam_results','registerExamResultRoutes'], ['fees','registerFeeRoutes'], ['fee_ledger','registerFeeLedgerRoutes'],
    ['fee_assignments','registerFeeAssignmentRoutes'], ['fee_receipts','registerFeeReceiptRoutes'],
    ['notifications','registerNotificationRoutes'], ['reportcard_engine_route','registerReportCardEngineRoute'],
    ['reportcard_result_sync','registerReportCardResultSyncRoutes'], ['reportcards','registerReportCardRoutes'],
    ['reportcard_context','registerReportCardContextRoutes'], ['reportcard_list','registerReportCardListRoutes'],
    ['reportcard_bulk','registerReportCardBulkRoutes'], ['academics','registerAcademicRoutes'],
    ['academic_master','registerAcademicMasterRoutes'], ['admissions','registerAdmissionRoutes'],
    ['portal','registerPortalRoutes'], ['student_crud','registerStudentCrudRoutes'], ['enrollment','registerEnrollmentRoutes'],
    ['teacher_assignments','registerTeacherAssignmentRoutes'], ['organization','registerOrganizationRoutes'],
    ['mobile','registerMobileRoutes'], ['mobile_dashboards','registerMobileDashboardRoutes'],
    ['transport','registerTransportRoutes'], ['sync_routes','registerSyncRoutes'],
    ['sync_admin','registerSyncAdminRoutes'], ['local_storage','registerLocalStorageRoutes'],
    ['teacher_permissions','registerTeacherPermissionRoutes']
  ];
  for (const [moduleName, registerName] of modules) registerOptional(moduleName, registerName);
  try { require('./notification_worker').startNotificationWorker(pool); } catch (_) { console.warn('Notification worker unavailable'); }
  try { require('./push_worker').startPushWorker(pool); } catch (_) { console.warn('Push worker unavailable'); }
} else {
  app.post('/api/auth/login', (_req, res) => res.status(503).json({ error: 'Database is not configured' }));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = [400,401,403,404,409,422].includes(err?.statusCode) ? err.statusCode : 500;
  res.status(status).json({ error: status < 500 ? (err.message || 'Request failed') : 'Internal server error' });
});

if (require.main === module) app.listen(port, () => console.log(`Anvi Mitra ERP API listening on ${port}`));
module.exports = { app, pool };
