const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
for(const file of ['src/timetable.js','sql/035_timetable.sql','web/timetable.html']){if(!fs.existsSync(path.join(root,file)))throw new Error('Missing timetable implementation: '+file)}
const route=fs.readFileSync(path.join(root,'src/timetable.js'),'utf8');if(!route.includes('/api/timetable')||!route.includes('/api/timetable/entries'))throw new Error('Timetable API contract missing');
console.log('timetable implementation contract: PASS');
