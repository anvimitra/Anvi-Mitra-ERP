window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };
  const queueKey = 'anvi_mitra_offline_queue_v1';
  const cacheKey = path => `anvi_mitra_cache_v1:${path}`;
  function readQueue() { try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch (_) { return []; } }
  function writeQueue(items) { localStorage.setItem(queueKey, JSON.stringify(items)); }
  function cacheGet(path) { try { const v=JSON.parse(localStorage.getItem(cacheKey(path)) || 'null'); return v?.data ?? null; } catch (_) { return null; } }
  function cacheSet(path,data) { try { localStorage.setItem(cacheKey(path),JSON.stringify({savedAt:Date.now(),data})); } catch (_) {} }
  function deviceKey() { let key=localStorage.getItem('anvi_mitra_device_key'); if(!key){ key=`web-${crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`; localStorage.setItem('anvi_mitra_device_key',key); } return key; }

  async function setBranch(branchId) {
    const normalized=branchId||null;
    const result=await request('/api/auth/switch-branch',{method:'POST',body:JSON.stringify({branchId:normalized})});
    if(!result.accessToken) throw new Error('Branch switch failed');
    sessionStorage.setItem('lsk_access_token',result.accessToken);
    const u=user(); u.branchId=result.branchId ?? normalized; sessionStorage.setItem('lsk_user',JSON.stringify(u));
    window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}})); return u;
  }

  async function request(path,options={}) {
    const method=(options.method||'GET').toUpperCase();
    const headers=new Headers(options.headers||{}); headers.set('Accept','application/json');
    if(options.body&&!headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const t=token(); if(t) headers.set('Authorization',`Bearer ${t}`);
    try {
      const response=await fetch(path,{...options,headers});
      if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired');}
      const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
      if(method==='GET') cacheSet(path,data); return data;
    } catch(err) {
      if(method==='GET'){const cached=cacheGet(path); if(cached!==null) return {...cached,offline:true};}
      throw err;
    }
  }

  function queueMutation(path,options={},meta={}) {
    const item={clientId:crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,path,method:(options.method||'POST').toUpperCase(),body:options.body||null,entityType:meta.entityType||'web_mutation',entityId:meta.entityId||null,queuedAt:new Date().toISOString()};
    const queue=readQueue(); queue.push(item); writeQueue(queue); window.dispatchEvent(new CustomEvent('lsk:offline-queued',{detail:item})); return item;
  }

  async function sync() {
    if(!token()||!navigator.onLine) return {online:false,uploaded:0,downloaded:0};
    const key=deviceKey();
    await request('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey:key,deviceName:'Web Browser',platform:'web'})});
    let queue=readQueue(); let uploaded=0;
    for(const item of queue){try{await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey:key,changes:[{clientId:item.clientId,entityType:item.entityType,entityId:item.entityId,operation:item.method==='DELETE'?'delete':item.method==='PUT'||item.method==='PATCH'?'update':'create',payload:{path:item.path,method:item.method,body:item.body}}]})});uploaded++;queue=queue.filter(x=>x.clientId!==item.clientId);writeQueue(queue);}catch(_){break;}}
    const cursor=Number(localStorage.getItem('anvi_mitra_sync_cursor')||0);
    const incoming=await request(`/api/sync/changes?cursor=${cursor}&deviceKey=${encodeURIComponent(key)}`);
    const nextCursor=Number(incoming.cursor||cursor); localStorage.setItem('anvi_mitra_sync_cursor',String(nextCursor)); localStorage.setItem('anvi_mitra_last_sync',new Date().toISOString());
    window.dispatchEvent(new CustomEvent('lsk:sync-complete',{detail:{uploaded,downloaded:(incoming.changes||[]).length,cursor:nextCursor}}));
    return {online:true,uploaded,downloaded:(incoming.changes||[]).length,cursor:nextCursor,changes:incoming.changes||[]};
  }
  window.addEventListener('online',()=>sync().catch(()=>{}));
  return {token,user,setBranch,request,queueMutation,sync,offlineQueue:readQueue,deviceKey};
})();
