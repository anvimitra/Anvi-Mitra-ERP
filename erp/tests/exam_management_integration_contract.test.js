const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../web/../..', 'exam-management.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../src/exam_marks.js'), 'utf8');
for (const token of ['/api/exam-marks?', '/api/exam-students?', '/api/exam-marks', 'examSubjectId', 'studentId']) {
  if (!html.includes(token) && !source.includes(token)) throw new Error('Exam marks integration contract missing: ' + token);
}
for (const token of ['authorizeExamSubject', 'teacher_can_edit_exam_subject', 'validateStudent', 'Marks cannot exceed maximum', 'Published exam marks cannot be edited']) {
  if (!source.includes(token)) throw new Error('Exam marks authorization contract missing: ' + token);
}
console.log('Exam management integration contract: PASS');
