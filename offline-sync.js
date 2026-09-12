(function(){
  'use strict';
  const KEY='anvi_erp_sync_queue';
  const CURSOR_KEY='anvi_erp_sync_cursor';
  const DEVICE_KEY='anvi_erp_device_key';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch(_){return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const deviceKey=()=>{let k=localStorage.getItem(DEVICE_KEY);if(!k){k=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem(DEVICE_KEY,k)}return k};
  const queue=()=>read(KEY,[]);
  const token=()=>sessionStorage.getItem('lsk_access_token')||localStorage.getItem('anvi_erp_access_token');
  const api=()=>window.ANVI_ERP_API_BASE||'';
  async function request(path,options){const headers=Object.assign({'Content-Type':'application/json'},options&&options.headers||{});const t=token();if(t)headers.Authorization='Bearer '+t;const r=await fetch(api()+path,Object.assign({},options,{headers}));let data={};try{data=await r.json()}catch(_){}if(!r.ok)throw Object.assign(new Error(data.error||'Sync request failed'),{status:r.status,data});return data}
  async function register(){return request('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),deviceName:navigator.userAgent.slice(0,120),platform:'web'})})}
  async function push(){const q=queue();if(!q.length||!navigator.onLine)return{accepted:[],conflicts:[],nextCursor:read(CURSOR_KEY,0)};await register();const changes=q.map(c=>Object.assign({},c,{baseCursor:Number(c.baseCursor||read(CURSOR_KEY,0))}));const data=await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),changes})});const acceptedIds=new Set((data.accepted||[]).map(c=>c.client_change_id||c.clientId));const conflicts=data.conflicts||[];write(KEY,q.filter(c=>!acceptedIds.has(c.clientId)));if(data.nextCursor!=null)localStorage.setItem(CURSOR_KEY,String(data.nextCursor));window.dispatchEvent(new CustomEvent('anvi-erp-sync',{detail:{type:'push',accepted:data.accepted||[],conflicts}}));return data}
  async function pull(){if(!navigator.onLine)return{changes:[],nextCursor:read(CURSOR_KEY,0),hasMore:false};await register();const cursor=Number(read(CURSOR_KEY,0));const data=await request('/api/sync/pull',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),cursor,limit:200})});if(data.nextCursor!=null)localStorage.setItem(CURSOR_KEY,String(data.nextCursor));window.dispatchEvent(new CustomEvent('anvi-erp-sync',{detail:{type:'pull',changes:data.changes||[],nextCursor:data.nextCursor}}));return data}
  async function sync(){if(!navigator.onLine)return{offline:true};try{const pushed=await push();const pulled=await pull();window.dispatchEvent(new CustomEvent('anvi-erp-sync',{detail:{type:'complete',pushed,pulled}}));return{pushed,pulled}}catch(error){window.dispatchEvent(new CustomEvent('anvi-erp-sync',{detail:{type:'error',error}}));throw error}}
  function enqueue(change){const q=queue();const item=Object.assign({},change,{clientId:change.clientId||crypto.randomUUID(),baseCursor:change.baseCursor!=null?change.baseCursor:Number(read(CURSOR_KEY,0)),queuedAt:change.queuedAt||new Date().toISOString()});q.push(item);write(KEY,q);if(navigator.onLine)sync().catch(()=>{});return q.length}
  window.addEventListener('online',()=>sync().catch(()=>{}));
  window.AnviOfflineSync={enqueue,pending:queue,clear:()=>write(KEY,[]),online:()=>navigator.onLine,deviceKey,cursor:()=>Number(read(CURSOR_KEY,0)),register,sync,push,pull};
})();