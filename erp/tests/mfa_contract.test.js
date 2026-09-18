const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../src/mfa.js'),'utf8');
for(const token of ['/api/security/mfa','/api/security/mfa/enroll','/api/security/mfa/verify','user_mfa','MFA_PROVIDER_KEY','requireRoles(...managers)'])if(!src.includes(token))throw new Error('MFA contract missing: '+token);
console.log('MFA contract: ok');
