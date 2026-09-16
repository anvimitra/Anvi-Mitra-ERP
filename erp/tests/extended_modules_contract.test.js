const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'sql/045_extended_erp_modules.sql'), 'utf8');
const route = fs.readFileSync(path.join(root, 'src/extended_modules.js'), 'utf8');

for (const table of [
  'academic_calendar_events','homework_assignments','teacher_substitutions',
  'transport_vehicles','transport_routes','transport_assignments',
  'library_books','library_loans','inventory_items','inventory_transactions',
  'hr_employees','hr_leave_requests','payroll_structures','payroll_runs','payroll_payslips',
  'saas_subscriptions','user_mfa'
]) assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table + ' schema missing');

for (const endpoint of [
  '/api/academic-calendar','/api/homework','/api/teacher-substitutions',
  '/api/transport/vehicles','/api/transport/routes','/api/transport/assignments',
  '/api/library/books','/api/library/loans','/api/inventory/items','/api/inventory/transactions',
  '/api/hr/employees','/api/hr/leaves','/api/payroll/runs','/api/payroll/payslips','/api/subscription'
]) assert(route.includes(endpoint), endpoint + ' route missing');

assert(route.includes('authenticate'));
assert(route.includes('requireRoles'));
assert(route.includes('school_id'));
console.log('Extended ERP module contract: PASS');
