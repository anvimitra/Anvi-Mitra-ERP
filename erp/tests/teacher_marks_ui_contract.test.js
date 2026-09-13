const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../web/teacher-marks.html'), 'utf8');

const required = [
  '/api/exam-marks/roster?examSubjectId=',
  '/api/exam-marks/batch',
  'Authorized Roster',
  'Teacher Workspace',
  'studentId',
  'examSubjectId'
];

for (const token of required) {
  if (!html.includes(token)) throw new Error('Teacher marks UI contract missing: ' + token);
}

console.log('Teacher marks UI contract: PASS');