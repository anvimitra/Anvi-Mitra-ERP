const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.join(__dirname,'..');
const portal=fs.readFileSync(path.join(root,'src/portal.js'),'utf8');
const dashboard=fs.readFileSync(path.join(__dirname,'../../parent-dashboard.html'),'utf8');
for(const marker of [
  "app.get('/api/portal/me/overview'",
  "app.get('/api/portal/children'",
  "app.get('/api/portal/children/:studentId/summary'",
  "app.get('/api/portal/children/:studentId/attendance'",
  "app.get('/api/portal/children/:studentId/fees'",
  "requireRoles('parent')",
  'student_portal_profiles',
  'fee_invoices',
  'homework_assignments',
  'student_attendance'
]) assert(portal.includes(marker),'Parent portal API missing: '+marker);
for(const marker of ['/api/portal/me/overview','/api/notifications/me','parent-notifications.html','parent-attendance.html']) assert(dashboard.includes(marker),'Parent dashboard integration missing: '+marker);
console.log('parent_portal_contract: ok');
