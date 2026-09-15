const fs = require('fs');
const path = require('path');
const sync = fs.readFileSync(path.join(__dirname,'../src/sync.js'),'utf8');
if (!sync.includes("entityType === 'student_attendance'")) throw new Error('offline student attendance adapter missing');
if (!sync.includes('student_attendance(school_id')) throw new Error('offline student attendance persistence missing');
if (!sync.includes("Student is not enrolled in this school/branch")) throw new Error('offline attendance roster authorization missing');
if (!sync.includes("Invalid offline attendance status")) throw new Error('offline attendance status guard missing');
console.log('offline attendance contract ok');
