const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/notifications.js'),'utf8');
if(!src.includes("/api/notifications/me"))throw new Error('notification inbox route missing');
if(!src.includes("/api/notifications/:id/read"))throw new Error('notification read route missing');
if(!src.includes("/api/notifications/unread-count"))throw new Error('notification unread count route missing');
if(!src.includes("requireRoles(...admins)"))throw new Error('notification admin authorization missing');
const sql=fs.readFileSync(path.join(__dirname,'../sql/047_notifications.sql'),'utf8');
for(const x of ['notifications','notification_delivery_log','recipient_user_id','action_payload'])if(!sql.includes(x))throw new Error('notification schema field missing: '+x);
console.log('notifications contract: ok');
