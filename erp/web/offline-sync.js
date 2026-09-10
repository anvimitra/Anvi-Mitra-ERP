window.AnviOfflineSync=(()=>{
  const DB='anvi-mitra-erp'; const STORE='kv';
  const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  async function put(key,value){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
  async function get(key){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  async function del(key){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
  async function cache(entity,key,data){return put(`cache:${entity}:${key}`,{savedAt:Date.now(),data})}
  async function readCache(entity,key){const x=await get(`cache:${entity}:${key}`);return x?.data??null}
  async function queue(change){const id=change.clientId||crypto.randomUUID();const q=(await get('outbox'))||[];if(q.some(x=>x.clientId===id))return id;q.push({...change,clientId:id,queuedAt:Date.now()});await put('outbox',q);return id}
  async function outbox(){return (await get('outbox'))||[]}
  async function registerDevice(request,deviceKey){return request('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey,deviceName:navigator.userAgent.slice(0,180),platform:'web'})})}
  async function pull(request,deviceKey){if(!navigator.onLine)return{pulled:0,offline:true};const cursor=Number((await get('sync_cursor'))||0);const d=await request('/api/sync/changes?cursor='+encodeURIComponent(cursor)+'&limit=200&deviceKey='+encodeURIComponent(deviceKey));const changes=d.changes||[];if(changes.length)await put('sync_cursor',Number(d.cursor||cursor));for(const change of changes)await cache('sync-change',String(change.cursor),change);return{pulled:changes.length,cursor:Number(d.cursor||cursor),hasMore:Boolean(d.hasMore)};}
  async function flush(request,deviceKey){
    if(!navigator.onLine)return{sent:0,remaining:(await outbox()).length,offline:true};
    const q=await outbox(); if(!q.length)return{sent:0,remaining:0,offline:false};
    const batch=q.slice(0,200); const baseCursor=Number((await get('sync_cursor'))||0);
    const d=await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey,changes:batch.map(x=>({...x,baseCursor:x.baseCursor??baseCursor}))})});
    const accepted=new Set((d.accepted||[]).map(x=>x.clientId).filter(Boolean));
    const conflicts=(d.conflicts||[]).map(x=>({...x,localChange:batch.find(y=>y.clientId===x.clientId)||null}));
    const rejected=(d.rejected||[]).map(x=>({...x,localChange:batch.find(y=>y.clientId===x.clientId)||null}));
    const handled=new Set([...accepted,...conflicts.map(x=>x.clientId),...rejected.map(x=>x.clientId)].filter(Boolean));
    await put('outbox',q.filter(x=>!handled.has(x.clientId)));
    if(conflicts.length)window.dispatchEvent(new CustomEvent('anvi:sync-conflicts',{detail:conflicts}));
    if(rejected.length)window.dispatchEvent(new CustomEvent('anvi:sync-rejected',{detail:rejected}));
    return{sent:accepted.size,remaining:q.length-handled.size,conflicts:conflicts.length,rejected:rejected.length,batchSize:batch.length,offline:false,hasMore:q.length>batch.length};
  }
  let boundRequest=null,boundDeviceKey=null,timer=null,busy=false;
  async function syncNow(){if(!boundRequest||!boundDeviceKey)return{sent:0,pulled:0,remaining:(await outbox()).length,offline:!navigator.onLine};if(busy)return{sent:0,pulled:0,remaining:(await outbox()).length,busy:true};busy=true;try{await registerDevice(boundRequest,boundDeviceKey);const pushed=await flush(boundRequest,boundDeviceKey);const pulled=await pull(boundRequest,boundDeviceKey);if(pushed.hasMore)queueMicrotask(syncNow);return{...pushed,...pulled};}catch(error){window.dispatchEvent(new CustomEvent('anvi:sync-error',{detail:error}));return{sent:0,pulled:0,remaining:(await outbox()).length,offline:false,error};}finally{busy=false;}}
  function bind(request,deviceKey){boundRequest=request;boundDeviceKey=String(deviceKey||'').trim()||null;if(timer)clearInterval(timer);if(boundRequest&&boundDeviceKey){timer=setInterval(syncNow,30000);if(navigator.onLine)queueMicrotask(syncNow)}return syncNow}
  window.addEventListener('online',()=>{window.dispatchEvent(new CustomEvent('anvi:online'));syncNow()}); window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('anvi:offline')));
  return{cache,readCache,queue,outbox,flush,pull,registerDevice,bind,syncNow,get,put,del};
})();
