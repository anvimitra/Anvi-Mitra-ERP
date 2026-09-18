const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/bulk_import.js'),'utf8');
for(const token of ['/api/import/students/preview','/api/import/students','/api/import/staff/preview','/api/import/staff','MAX_ROWS','csvRows','ON CONFLICT'])if(!src.includes(token))throw new Error('bulk import contract missing: '+token);
console.log('bulk import contract: ok');
