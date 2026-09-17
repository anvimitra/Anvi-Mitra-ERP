const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/notification_automation.js'),'utf8');
for(const token of ['/api/notifications/automate/fees','/api/notifications/automate/attendance','fee_due','attendance_alert','student_portal_profiles','requireRoles(...admins)'])if(!src.includes(token))throw new Error('notification automation contract missing: '+token);
console.log('notification automation contract: ok');
