const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/sync.js'),'utf8');
for(const x of ["entityType === 'fee_payment'","entityType === 'fee_invoice'","entityType === 'student_enrollment'","fee_payments","fee_invoices"])if(!src.includes(x))throw new Error('offline adapter missing: '+x);
console.log('offline entity adapter contract: ok');
