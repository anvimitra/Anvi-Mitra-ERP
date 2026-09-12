window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };
  const DEVICE_KEY='anvi-mitra-erp-device';
  const CACHE_DB='anvi-mitra-erp-cache', CACHE_STORE='responses', OUTBOX_STORE='outbox', META_STORE='meta';
  let cacheDbPromise, flushing=false, syncTimer;

  function deviceKey(){
    let key=localStorage.getItem(DEVICE_KEY);
    if(!key){key=(crypto?.randomUUID?.()||('web-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(DEVICE_KEY,key)}
    return key;
  }
  function openCache(){
    if(cacheDbPromise)return cacheDbPromise;
    if(!window.indexedDB)return Promise.resolve(null);
    cacheDbPromise=new Promise(resolve=>{
      const r=indexedDB.open(CACHE_DB,3);
      r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE,{keyPath:'key'});if(!db.objectStoreNames.contains(OUTBOX_STORE))db.createObjectStore(OUTBOX_STORE,{keyPath:'id',autoIncrement:true});if(!db.objectStoreNames.contains(META_STORE))db.createObjectStore(META_STORE,{keyPath:'key'});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);
    });return cacheDbPromise;
  }
  async function cacheGet(key){const db=await openCache();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction(CACHE_STORE,'readonly').objectStore(CACHE_STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)}catch(_){resolve(null)}})}
  async function cachePut(key,data){const db=await openCache();if(!db)return;try{db.transaction(CACHE_STORE,'readwrite').objectStore(CACHE_STORE).put({key,data,savedAt:new Date().toISOString()})}catch(_) {}}
  async function metaGet(key){const db=await openCache();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction(META_STORE,'readonly').objectStore(META_STORE).get(key);r.onsuccess=()=>resolve(r.result?.value??null);r.onerror=()=>resolve(null)}catch(_){resolve(null)}})}
  async function metaPut(key,value){const db=await openCache();if(!db)return;try{db.transaction(META_STORE,'readwrite').objectStore(META_STORE).put({key,value})}catch(_) {}}
  async function outboxAdd(item){const db=await openCache();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction(OUTBOX_STORE,'readwrite');tx.objectStore(OUTBOX_STORE).add({...item,createdAt:new Date().toISOString()});tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch(_){resolve(false)}})}
  async function outboxAll(){const db=await openCache();if(!db)return[];return new Promise(resolve=>{try{const r=db.transaction(OUTBOX_STORE,'readonly').objectStore(OUTBOX_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([])}catch(_){resolve([])}})}
  async function outboxDelete(id){const db=await openCache();if(!db)return;try{db.transaction(OUTBOX_STORE,'readwrite').objectStore(OUTBOX_STORE).delete(id)}catch(_) {}}
  function cacheKey(path){return `${user().schoolId||'school'}:${user().branchId||'school'}:${path}`;}
  function canQueue(path){return !path.startsWith('/api/auth/')&&!path.startsWith('/api/sync/')&&!path.startsWith('/api/platform/');}

  async function registerSyncDevice(){
    if(!token())return null;
    const result=await fetch('/api/sync/device',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({deviceKey:deviceKey(),deviceName:'ERP Web',platform:'web'})});
    if(!result.ok)return null;const data=await result.json();return data.device||null;
  }
  async function syncPull(limit=200){
    if(!navigator.onLine||!token())return {changes:[],nextCursor:await metaGet('syncCursor')||0};
    const cursor=Number(await metaGet('syncCursor')||0),r=await fetch('/api/sync/pull',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({deviceKey:deviceKey(),cursor,limit})});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Sync pull failed');
    const data=await r.json();for(const change of data.changes||[]){if(change.entityType&&change.entityId)await cachePut(cacheKey(`sync:${change.entityType}:${change.entityId}`),change.payload)}
    await metaPut('syncCursor',data.nextCursor??cursor);window.dispatchEvent(new CustomEvent('lsk:sync-pulled',{detail:data}));return data;
  }
  async function queueChange(entityType,operation,payload,entityId=null){
    const baseCursor=Number(await metaGet('syncCursor')||0),clientId=crypto?.randomUUID?.()||('change-'+Date.now()+'-'+Math.random().toString(36).slice(2));
    const db=await openCache();if(!db)return{queued:false};
    const queued=await outboxAdd({syncChange:true,deviceKey:deviceKey(),entityType,operation,entityId,payload,clientId,baseCursor});
    if(queued)window.dispatchEvent(new CustomEvent('lsk:offline-queued',{detail:{entityType,operation,clientId}}));
    if(navigator.onLine)await flushOutbox();return{queued};
  }
  async function flushOutbox(){
    if(flushing||!navigator.onLine||!token())return;flushing=true;
    try{
      const items=await outboxAll(), syncItems=items.filter(i=>i.syncChange), normalItems=items.filter(i=>!i.syncChange);
      if(syncItems.length){
        const r=await fetch('/api/sync/push',{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({deviceKey:deviceKey(),changes:syncItems.map(i=>({entityType:i.entityType,operation:i.operation,entityId:i.entityId,payload:i.payload,clientId:i.clientId,baseCursor:i.baseCursor}))})});
        if(r.ok){const data=await r.json();for(const item of syncItems)await outboxDelete(item.id);await metaPut('syncCursor',data.nextCursor??await metaGet('syncCursor')||0);window.dispatchEvent(new CustomEvent('lsk:sync-pushed',{detail:data}))}
      }
      for(const item of normalItems){try{const h=new Headers(item.headers||{});h.set('Authorization',`Bearer ${token()}`);const r=await fetch(item.path,{method:item.method,headers:h,body:item.body});if(r.ok||(r.status>=400&&r.status<500))await outboxDelete(item.id);else break}catch(_){break}}
      await syncPull().catch(()=>{});window.dispatchEvent(new CustomEvent('lsk:sync-complete'));
    }finally{flushing=false}
  }

  async function setBranch(branchId){const normalized=branchId||null,result=await request('/api/auth/switch-branch',{method:'POST',body:JSON.stringify({branchId:normalized})});if(!result.accessToken)throw new Error('Branch switch failed');sessionStorage.setItem('lsk_access_token',result.accessToken);const u=user();u.branchId=result.branchId??normalized;sessionStorage.setItem('lsk_user',JSON.stringify(u));window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));return u;}

  async function request(path,options={}){
    const method=String(options.method||'GET').toUpperCase(),headers=new Headers(options.headers||{});headers.set('Accept','application/json');if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const t=token();if(t)headers.set('Authorization',`Bearer ${t}`);
    try{const response=await fetch(path,{...options,headers});if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired')}const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);if(method==='GET')await cachePut(cacheKey(path),data);return data;
    }catch(error){
      if(method==='GET'){const cached=await cacheGet(cacheKey(path));if(cached){window.dispatchEvent(new CustomEvent('lsk:offline-data',{detail:{path,savedAt:cached.savedAt}}));return cached.data}}
      else if(canQueue(path)&&(error instanceof TypeError||!navigator.onLine)){const queued=await outboxAdd({path,method,body:typeof options.body==='string'?options.body:null,headers:Object.fromEntries(headers.entries())});if(queued){window.dispatchEvent(new CustomEvent('lsk:offline-queued',{detail:{path,method}}));return{offline:true,pendingSync:true,message:'Saved offline. It will sync automatically when internet returns.'}}}
      throw error;
    }
  }
  window.addEventListener('online',async()=>{window.dispatchEvent(new CustomEvent('lsk:online'));try{await registerSyncDevice();await flushOutbox()}catch(_){}});
  window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('lsk:offline')));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',async()=>{try{await registerSyncDevice();await flushOutbox()}catch(_){}});else{registerSyncDevice().then(flushOutbox).catch(()=>{})}
  syncTimer=setInterval(()=>{if(navigator.onLine)syncPull().catch(()=>{})},30000);
  return {token,user,setBranch,request,flushOutbox,outboxAll,queueChange,syncPull,registerSyncDevice,deviceKey};
})();
