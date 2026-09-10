const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ERP_API_URL=String(process.env.ERP_API_URL||'http://localhost:4000').replace(/\/$/,'');
const ERP_ACCESS_TOKEN=String(process.env.ERP_ACCESS_TOKEN||'');
const LOCAL_ROOT=path.resolve(process.env.LOCAL_ROOT||'./anvi-mitra-data');
const DEVICE_NAME=process.env.DEVICE_NAME||require('os').hostname();
const INTERVAL_MS=Math.max(15000,Number(process.env.SYNC_INTERVAL_MS||60000));
if(!ERP_ACCESS_TOKEN){console.error('ERP_ACCESS_TOKEN is required');process.exit(1)}
fs.mkdirSync(LOCAL_ROOT,{recursive:true});
const stateFile=path.join(LOCAL_ROOT,'.anvi-mitra-connector.json');
let state={deviceKey:crypto.randomUUID(),cursor:0};
try{state={...state,...JSON.parse(fs.readFileSync(stateFile,'utf8'))}}catch(_){}
function save(){fs.writeFileSync(stateFile,JSON.stringify(state,null,2),'utf8')}
async function api(p,options={}){const r=await fetch(ERP_API_URL+p,{...options,headers:{Accept:'application/json',Authorization:`Bearer ${ERP_ACCESS_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`ERP request failed (${r.status})`);return d}
function safeEntity(name){return String(name||'unknown').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)||'unknown'}
function writeChange(c){const dir=path.join(LOCAL_ROOT,'sync',safeEntity(c.entity_type));fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${c.cursor}-${c.operation}.json`);fs.writeFileSync(file,JSON.stringify(c,null,2),'utf8')}
async function sync(){
 await api('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey:state.deviceKey,deviceName:DEVICE_NAME,platform:'desktop-local-connector'})});
 const d=await api(`/api/sync/changes?deviceKey=${encodeURIComponent(state.deviceKey)}&cursor=${state.cursor}&limit=250`);
 for(const c of d.changes||[]){writeChange(c);state.cursor=Number(c.cursor)}
 save();
 console.log(new Date().toISOString(),`downloaded=${(d.changes||[]).length} cursor=${state.cursor}`);
}
async function main(){try{await sync()}catch(e){console.error(new Date().toISOString(),e.message)}setTimeout(main,INTERVAL_MS)}
save();main();
