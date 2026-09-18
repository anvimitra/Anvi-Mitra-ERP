const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/analytics.js'),'utf8');
for(const token of ["/api/analytics/school","/api/analytics/attendance","requireRoles(...staff)","school_id","student_attendance","fee_invoices","result_snapshots"])if(!src.includes(token))throw new Error('analytics contract missing: '+token);
console.log('analytics contract: ok');
