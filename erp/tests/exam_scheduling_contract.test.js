const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/exam_scheduling.js'),'utf8');
for(const token of ['/api/exams/schedule','/api/exams','/api/exams/:examId/subjects','exam_date','max_marks','requireRoles(...managers)'])if(!src.includes(token))throw new Error('exam scheduling contract missing: '+token);
console.log('exam scheduling contract: ok');
