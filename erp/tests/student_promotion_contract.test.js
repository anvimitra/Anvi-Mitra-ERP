const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/student_promotion.js'),'utf8');
for(const token of ['/api/promotion/masters','/api/promotion/students','/api/promotion/preview','/api/promotion/promote','fromSessionId','toSessionId','ON CONFLICT(student_id,session_id)','sync_changes'])if(!src.includes(token))throw new Error('promotion contract missing: '+token);
console.log('student promotion contract: ok');
