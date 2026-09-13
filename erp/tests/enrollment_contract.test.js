const fs = require('fs');
const path = require('path');
const assert = require('assert');

const enrollment = fs.readFileSync(path.join(__dirname, '..', 'src', 'student_enrollment.js'), 'utf8');
const staff = fs.readFileSync(path.join(__dirname, '..', 'src', 'staff.js'), 'utf8');
const enrollmentUi = fs.readFileSync(path.join(__dirname, '..', 'web', 'student-enrollment.html'), 'utf8');

assert(enrollment.includes("app.get('/api/enrollment/masters'"));
assert(enrollment.includes("app.get('/api/enrollment/students'"));
assert(enrollment.includes("app.post('/api/enrollment/students'"));
assert(enrollment.includes("app.post('/api/enrollment/parents'"));
assert(enrollment.includes("requireRoles(...staff)"));
assert(enrollment.includes("academic_sessions"));
assert(enrollment.includes("sections"));
assert(enrollment.includes("enrollments"));
assert(enrollment.includes("student_portal_profiles"));
assert(enrollment.includes("sync_changes"));

assert(staff.includes("app.get('/api/staff'"));
assert(staff.includes("app.post('/api/staff'"));
assert(staff.includes("role === 'teacher'"));
assert(staff.includes("teachers"));
assert(staff.includes("hashPassword(password)"));

assert(enrollmentUi.includes('Student Enrollment'));
assert(enrollmentUi.includes('Enroll Student'));
assert(enrollmentUi.includes('/api/enrollment/masters'));
assert(enrollmentUi.includes('/api/enrollment/students'));
assert(enrollmentUi.includes('Session'));
assert(enrollmentUi.includes('Section'));

console.log('ERP staff/student enrollment contract checks: PASS');
