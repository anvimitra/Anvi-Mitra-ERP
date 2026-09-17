const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/report_exports.js'),'utf8');
for(const token of ['/api/reports/exam-results.csv','/api/reports/fees.csv','result_snapshots','fee_invoices','requireRoles(...staff)','requireRoles(...finance)','school_id','csvEscape'])if(!src.includes(token))throw new Error('report export contract missing: '+token);
console.log('report export contract: ok');
