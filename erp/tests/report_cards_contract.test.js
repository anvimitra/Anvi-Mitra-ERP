const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/report_cards.js'),'utf8');
for(const token of ['/api/report-cards/student/:studentId','/api/report-cards/:examId/:studentId/print','result_snapshots','status=\'published\'','escapeHtml'])if(!src.includes(token))throw new Error('report card contract missing: '+token);
console.log('report card contract: ok');
