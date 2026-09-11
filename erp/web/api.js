window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };
  const CACHE_DB='anvi-mitra-erp-cache', CACHE_STORE='responses', OUTBOX_STORE='outbox';
  let cacheDbPromise, flushing=false;

  function openCache(){
    if(cacheDbPromise)return cacheDbPromise;
    if(!window.indexedDB)return Promise.resolve(null);
    cacheDbPromise=new Promise(resolve=>{
      const r=indexedDB.open(CACHE_DB,2);
      r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE,{keyPath:'key'});if(!db.objectStoreNames.contains(OUTBOX_STORE))db.createObjectStore(OUTBOX_STORE,{keyPath:'id',autoIncrement:true});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);
    });
    return cacheDbPromise;
  }
  async function cacheGet(key){const db=await openCache();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction(CACHE_STORE,'readonly').objectStore(CACHE_STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)}catch(_){resolve(null)}})}
  async function cachePut(key,data){const db=await openCache();if(!db)return;try{db.transaction(CACHE_STORE,'readwrite').objectStore(CACHE_STORE).put({key,data,savedAt:new Date().toISOString()})}catch(_){}}
  async function outboxAdd(item){const db=await openCache();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction(OUTBOX_STORE,'readwrite');tx.objectStore(OUTBOX_STORE).add({...item,createdAt:new Date().toISOString()});tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false)}catch(_){resolve(false)}})}
  async function outboxAll(){const db=await openCache();if(!db)return[];return new Promise(resolve=>{try{const r=db.transaction(OUTBOX_STORE,'readonly').objectStore(OUTBOX_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([])}catch(_){resolve([])}})}
  async function outboxDelete(id){const db=await openCache();if(!db)return;try{db.transaction(OUTBOX_STORE,'readwrite').objectStore(OUTBOX_STORE).delete(id)}catch(_){}}
  function cacheKey(path){return `${user().schoolId||'school'}:${user().branchId||'school'}:${path}`;}
  function canQueue(path){return !path.startsWith('/api/auth/')&&!path.startsWith('/api/sync/')&&!path.startsWith('/api/platform/');}

  async function flushOutbox(){
    if(flushing||!navigator.onLine||!token())return;flushing=true;
    try{for(const item of await outboxAll()){try{const h=new Headers(item.headers||{});h.set('Authorization',`Bearer ${token()}`);const r=await fetch(item.path,{method:item.method,headers:h,body:item.body});if(r.ok||(r.status>=400&&r.status<500))await outboxDelete(item.id);else break}catch(_){break}}window.dispatchEvent(new CustomEvent('lsk:sync-complete'));}finally{flushing=false}
  }

  async function setBranch(branchId){
    const normalized=branchId||null,result=await request('/api/auth/switch-branch',{method:'POST',body:JSON.stringify({branchId:normalized})});
    if(!result.accessToken)throw new Error('Branch switch failed');
    sessionStorage.setItem('lsk_access_token',result.accessToken);const u=user();u.branchId=result.branchId??normalized;sessionStorage.setItem('lsk_user',JSON.stringify(u));
    window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));return u;
  }

  async function request(path,options={}){
    const method=String(options.method||'GET').toUpperCase(),headers=new Headers(options.headers||{});
    headers.set('Accept','application/json');if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const t=token();if(t)headers.set('Authorization',`Bearer ${t}`);
    try{
      const response=await fetch(path,{...options,headers});if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired')}
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
      if(method==='GET')await cachePut(cacheKey(path),data);return data;
    }catch(error){
      if(method==='GET'){const cached=await cacheGet(cacheKey(path));if(cached){window.dispatchEvent(new CustomEvent('lsk:offline-data',{detail:{path,savedAt:cached.savedAt}}));return cached.data}}
      else if(canQueue(path)&&(error instanceof TypeError||!navigator.onLine)){
        const queued=await outboxAdd({path,method,body:typeof options.body==='string'?options.body:null,headers:Object.fromEntries(headers.entries())});
        if(queued){window.dispatchEvent(new CustomEvent('lsk:offline-queued',{detail:{path,method}}));return{offline:true,pendingSync:true,message:'Saved offline. It will sync automatically when internet returns.'}}
      }
      throw error;
    }
  }
  window.addEventListener('online',flushOutbox);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',flushOutbox);else flushOutbox();
  return {token,user,setBranch,request,flushOutbox,outboxAll};
})();