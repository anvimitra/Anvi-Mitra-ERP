const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'web','local-storage.html'),'utf8');
const local=fs.readFileSync(path.join(root,'src','local_storage.js'),'utf8');
for(const token of ['Local Storage','Add Connector','read_write','read_only','/api/local-storage/connectors','Test Sync','navigator.onLine']) assert(ui.includes(token),'Local storage UI token missing: '+token);
for(const token of ['/api/local-storage/connectors','/heartbeat','read_only','read_write']) assert(local.includes(token),'Local storage API token missing: '+token);
console.log('ERP local-storage management UI contract checks: PASS');
