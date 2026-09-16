const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/exam_results.js'),'utf8');
for(const x of ['/api/exam-results/calculate','/api/exam-results/published/:studentId','/api/exam-results/publish-snapshot','result_snapshots','grade_scales'])if(!src.includes(x))throw new Error('result processing contract missing: '+x);
const sql=fs.readFileSync(path.join(__dirname,'../sql/048_result_rules_and_notification_preferences.sql'),'utf8');
for(const x of ['grade_scales','result_snapshots','notification_preferences'])if(!sql.includes(x))throw new Error('result/notification schema missing: '+x);
console.log('result processing contract: ok');
