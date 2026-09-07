window.AnviOfflineSync=(()=>{
  const DB='anvi-mitra-erp';
  const STORE='kv';
  const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  async function put(key,value){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
  async function get(key){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  async function del(key){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
  async function cache(entity,key,data){return put(`cache:${entity}:${key}`,{savedAt:Date.now(),data})}
  async function readCache(entity,key){const x=await get(`cache:${entity}:${key}`);return x?.data??null}
  async function queue(change){const id=change.clientId||crypto.randomUUID();const q=(await get('outbox'))||[];q.push({...change,clientId:id,queuedAt:Date.now()});await put('outbox',q);return id}
  async function outbox(){return (await get('outbox'))||[]}
  async function flush(request,deviceKey){
    if(!navigator.onLine)return {sent:0,remaining:(await outbox()).length,offline:true};
    const q=await outbox();
    if(!q.length)return {sent:0,remaining:0,offline:false};
    const d=await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey,changes:q})});
    const accepted=new Set((d.accepted||[]).map(x=>x.clientId).filter(Boolean));
    await put('outbox',q.filter(x=>!accepted.has(x.clientId)));
    if(d.conflicts?.length) window.dispatchEvent(new CustomEvent('anvi:sync-conflicts',{detail:d.conflicts}));
    return {sent:accepted.size,remaining:q.length-accepted.size,conflicts:(d.conflicts||[]).length,offline:false};
  }
  let boundRequest=null;
  let boundDeviceKey=null;
  let timer=null;
  async function syncNow(){
    if(!boundRequest||!boundDeviceKey)return {sent:0,remaining:(await outbox()).length,offline:!navigator.onLine};
    try{return await flush(boundRequest,boundDeviceKey)}catch(error){
      window.dispatchEvent(new CustomEvent('anvi:sync-error',{detail:error}));
      return {sent:0,remaining:(await outbox()).length,offline:false,error};
    }
  }
  function bind(request,deviceKey){
    boundRequest=request;
    boundDeviceKey=String(deviceKey||'').trim()||null;
    if(timer)clearInterval(timer);
    if(boundRequest&&boundDeviceKey){
      timer=setInterval(syncNow,30000);
      if(navigator.onLine)queueMicrotask(syncNow);
    }
    return syncNow;
  }
  window.addEventListener('online',()=>{window.dispatchEvent(new CustomEvent('anvi:online'));syncNow()});
  window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('anvi:offline')));
  return{cache,readCache,queue,outbox,flush,bind,syncNow,get,put,del};
})();
