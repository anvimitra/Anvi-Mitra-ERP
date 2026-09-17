const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/integration_seams.js'),'utf8');
for(const token of ['/api/integrations/status','/api/integrations/config','PAYMENT_PROVIDER','PUSH_PROVIDER','SMS_PROVIDER','EMAIL_PROVIDER','FIREBASE_PROJECT_ID','STORAGE_PROVIDER','Provider secrets are never returned'])if(!src.includes(token))throw new Error('integration seam contract missing: '+token);
console.log('integration seam contract: ok');
