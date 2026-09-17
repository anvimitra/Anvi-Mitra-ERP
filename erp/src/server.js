require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { registerAuthRoutes } = require('./auth');
const { registerExtendedModuleRoutes } = require('./extended_modules');

const app = express();
const port = Number(process.env.PORT || 4000);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) : null;
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../web')));
const superAdminPage = path.join(__dirname, '../web/super-admin/schools.html');
app.get('/', (_req, res) => res.sendFile(superAdminPage));
app.get('/super-admin/schools', (_req, res) => res.sendFile(superAdminPage));
app.get('/super-admin/school-onboarding', (_req, res) => res.sendFile(path.join(__dirname, '../web/super-admin/school-onboarding.html')));
app.get('/super-admin/school', (_req, res) => res.sendFile(path.join(__dirname, '../web/super-admin/school.html')));
app.get('/super-admin/teacher-permissions', (_req, res) => res.sendFile(path.join(__dirname, '../web/super-admin/teacher-assignments.html')));
app.get('/super-admin/sync-conflicts', (_req, res) => res.sendFile(path.join(__dirname, '../web/super-admin/sync-conflicts.html')));
app.get('/super-admin/sync-monitoring', (_req, res) => res.sendFile(path.join(__dirname, '../web/super-admin/sync-monitoring.html')));
app.get('/super-admin/local-storage', (_req, res) => res.sendFile(path.join(__dirname, '../web/local-storage.html')));
app.get('/local-storage', (_req, res) => res.sendFile(path.join(__dirname, '../web/local-storage.html')));
app.get('/school/enrollment', (_req, res) => res.sendFile(path.join(__dirname, '../web/school/enrollment.html')));
app.get('/school/staff', (_req, res) => res.sendFile(path.join(__dirname, '../web/school/staff.html')));
app.get('/staff-attendance', (_req, res) => res.sendFile(path.join(__dirname, '../web/staff-attendance.html')));
app.get('/attendance', (_req, res) => res.sendFile(path.join(__dirname, '../../attendance.html')));
app.get('/attendance-report', (_req, res) => res.sendFile(path.join(__dirname, '../../attendance-report.html')));
app.get('/api/health', async (_req, res) => {
  let database = 'not-configured';
  if (pool) { try { await pool.query('SELECT 1'); database = 'ok'; } catch (_) { database = 'unavailable'; } }
  res.json({ ok: true, service: 'anvi-mitra-erp-api', product: 'Anvi Mitra ERP', database, timestamp: new Date().toISOString() });
});
function registerOptional(moduleName, registerName) {
  let file;
  try { file = require.resolve('./' + moduleName); } catch (_) { console.warn('Optional ERP module not present: ' + moduleName + '.js'); return false; }
  try { const mod = require(file); if (typeof mod[registerName] !== 'function') { console.warn('ERP module ' + moduleName + '.js does not export ' + registerName); return false; } mod[registerName](app, pool); return true; }
  catch (error) { console.error('Failed to load ERP module ' + moduleName + '.js:', error); if (process.env.NODE_ENV === 'production') throw error; return false; }
}
if (pool) {
  registerAuthRoutes(app, pool);
  registerExtendedModuleRoutes(app, pool);
  const modules = [
    ['sync_routes','registerSyncRoutes'], ['local_storage','registerLocalStorageRoutes'], ['organization','registerOrganizationRoutes'],
    ['platform_school_management','registerPlatformSchoolManagementRoutes'], ['platform_compat','registerPlatformCompatRoutes'],
    ['routes','registerRoutes'], ['people','registerPeopleRoutes'], ['staff','registerStaffRoutes'], ['attendance','registerAttendanceRoutes'],
    ['staff_attendance','registerStaffAttendanceRoutes'], ['attendance_reports','registerAttendanceReportRoutes'], ['exams','registerExamRoutes'],
    ['exam_results','registerExamResultRoutes'], ['exam_marks','registerExamMarkRoutes'], ['fees','registerFeeRoutes'], ['fee_ledger','registerFeeLedgerRoutes'],
    ['fee_assignments','registerFeeAssignmentRoutes'], ['fee_receipts','registerFeeReceiptRoutes'], ['payments','registerPaymentRoutes'],
    ['notifications','registerNotificationRoutes'], ['reportcard_engine_route','registerReportCardEngineRoute'], ['reportcard_result_sync','registerReportCardResultSyncRoutes'],
    ['reportcards','registerReportCardRoutes'], ['reportcard_context','registerReportCardContextRoutes'], ['reportcard_list','registerReportCardListRoutes'], ['reportcard_bulk','registerReportCardBulkRoutes'],
    ['academics','registerAcademicRoutes'], ['timetable','registerTimetableRoutes'], ['academic_master','registerAcademicMasterRoutes'], ['academic_progress','registerAcademicProgressRoutes'],
    ['admissions','registerAdmissionRoutes'], ['portal','registerPortalRoutes'], ['student_crud','registerStudentCrudRoutes'], ['student_enrollment','registerStudentEnrollmentRoutes'],
    ['enrollment','registerEnrollmentRoutes'], ['teacher_assignments','registerTeacherAssignmentRoutes'], ['school_summary','registerSchoolSummaryRoutes'], ['mobile','registerMobileRoutes'],
    ['mobile_dashboards','registerMobileDashboardRoutes'], ['transport','registerTransportRoutes'], ['sync_admin','registerSyncAdminRoutes'], ['sync_conflict_resolution','registerSyncConflictResolutionRoutes'], ['teacher_permissions','registerTeacherPermissionRoutes']
  ];
  for (const [moduleName, registerName] of modules) registerOptional(moduleName, registerName);
  try { require('./notification_worker').startNotificationWorker(pool); } catch (_) { console.warn('Notification worker unavailable'); }
  try { require('./push_worker').startPushWorker(pool); } catch (_) { console.warn('Push worker unavailable'); }
} else {
  app.post('/api/auth/login', (_req, res) => res.status(503).json({ error: 'Database is not configured' }));
}
app.use((err, _req, res, _next) => { console.error(err); const status = [400,401,403,404,409,422].includes(err?.statusCode) ? err.statusCode : 500; res.status(status).json({ error: status < 500 ? (err.message || 'Request failed') : 'Internal server error' }); });
if (require.main === module) app.listen(port, () => console.log('Anvi Mitra ERP API listening on ' + port));
module.exports = { app, pool };
