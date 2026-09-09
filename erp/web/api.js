window.LSKERP = (() => {
  const TOKEN_KEY = 'lsk_access_token';
  const USER_KEY = 'lsk_user';
  const QUEUE_KEY = 'anvi_mitra_offline_queue_v2';
  const CURSOR_KEY = 'anvi_mitra_sync_cursor_v2';
  const DEVICE_KEY = 'anvi_mitra_device_key';
  const CACHE_PREFIX = 'anvi_mitra_cache_v2:';
  const token = () => sessionStorage.getItem(TOKEN_KEY);
  const user = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}'); } catch (_) { return {}; } };
  const offlineQueue = () => { try { const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); return Array.isArray(q)?q:[]; } catch (_) { return []; } };
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); window.dispatchEvent(new CustomEvent('lsk:offline-queued')); }
  function deviceKey() { let k = localStorage.getItem(DEVICE_KEY); if (!k) { k = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_KEY, k); } return k; }
  function enqueue(change) { const q=offlineQueue(); const clientId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`; q.push({clientId,...change,queuedAt:new Date().toISOString()}); saveQueue(q); return {clientId,count:q.length}; }
  function cacheGet(path) { try { const v=JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${path}`)||'null'); return v?.data ?? null; } catch (_) { return null; } }
  function cacheSet(path,data) { try { localStorage.setItem(`${CACHE_PREFIX}${path}`,JSON.stringify({savedAt:Date.now(),data})); } catch (_) {} }
  function invalidateCache(path) { try { localStorage.removeItem(`${CACHE_PREFIX}${path}`); } catch (_) {} }
  function networkFailure(error) { if(!navigator.onLine)return true; const m=String(error?.message||'').toLowerCase(); return error instanceof TypeError||m.includes('failed to fetch')||m.includes('networkerror')||m.includes('network request failed'); }

  async function request(path, options = {}) {
    const method=String(options.method||'GET').toUpperCase();
    const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const t = token(); if (t) headers.set('Authorization', `Bearer ${t}`);
    try {
      const response = await fetch(path, { ...options, headers });
      if (response.status === 401) { sessionStorage.clear(); location.replace('/erp/web/login.html'); throw new Error('Session expired'); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      if(method==='GET') cacheSet(path,data); else invalidateCache(path);
      return data;
    } catch (err) {
      if(method==='GET') { const cached=cacheGet(path); if(cached!==null) return {...cached,offline:true}; }
      if (['POST','PATCH','PUT','DELETE'].includes(method) && (options.offlineQueue || networkFailure(err))) {
        const body=options.body?(()=>{try{return JSON.parse(options.body)}catch(_){return options.body}})():null;
        const item=enqueue({path,method,payload:body,replay:options.replay===true,syncMeta:options.syncMeta||null});
        return {offlineQueued:true,queued:offlineQueue().length,clientId:item.clientId,message:'Saved on this device. It will sync automatically when internet returns.'};
      }
      throw err;
    }
  }

  async function registerDevice() { return request('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),deviceName:navigator.userAgent.slice(0,180),platform:'web'})}); }
  async function sync() {
    if(!token()||!navigator.onLine) return {online:false,uploaded:0,downloaded:0,pending:offlineQueue().length};
    await registerDevice();
    let q=offlineQueue(); let uploaded=0; let conflicts=0;
    for(const item of q.slice(0,200)){
      if(item.replay) {
        try { await request(item.path,{method:item.method,body:item.payload==null?undefined:JSON.stringify(item.payload)}); q=q.filter(x=>x.clientId!==item.clientId); saveQueue(q); uploaded++; } catch(_){ break; }
        continue;
      }
      try {
        const pushed=await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),changes:[{clientId:item.clientId,entityType:(item.syncMeta?.entityType||`web:${item.method}:${item.path}`).slice(0,100),entityId:item.syncMeta?.entityId||null,operation:item.method==='DELETE'?'delete':item.method==='POST'?'create':'update',baseCursor:Number(localStorage.getItem(CURSOR_KEY)||0),payload:{path:item.path,method:item.method,body:item.payload,queuedAt:item.queuedAt}}]})});
        const accepted=(pushed.accepted||[]).some(x=>x.clientId===item.clientId); const conflict=(pushed.conflicts||[]).some(x=>x.clientId===item.clientId);
        if(conflict) conflicts++;
        if(accepted||conflict){q=q.filter(x=>x.clientId!==item.clientId);saveQueue(q);if(accepted)uploaded++;} else break;
      } catch(_) { break; }
    }
    const cursor=Number(localStorage.getItem(CURSOR_KEY)||0);
    const pulled=await request(`/api/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=250&deviceKey=${encodeURIComponent(deviceKey())}`);
    const changes=pulled.changes||[];
    for(const change of changes){ const payload=change.payload||{}; if(payload.path)invalidateCache(payload.path); }
    if(Number(pulled.cursor||cursor)>=cursor)localStorage.setItem(CURSOR_KEY,String(pulled.cursor||cursor));
    localStorage.setItem('anvi_mitra_last_sync',new Date().toISOString());
    window.dispatchEvent(new CustomEvent('lsk:sync-complete',{detail:{uploaded,downloaded:changes.length,conflicts,pending:q.length}}));
    return {online:true,uploaded,downloaded:changes.length,conflicts,pending:q.length,changes};
  }

  async function setBranch(branchId) { const normalized=branchId||null; const result=await request('/api/auth/switch-branch',{method:'POST',body:JSON.stringify({branchId:normalized})}); if(!result.accessToken)throw new Error('Branch switch failed'); sessionStorage.setItem(TOKEN_KEY,result.accessToken); const u=user();u.branchId=result.branchId??normalized;sessionStorage.setItem(USER_KEY,JSON.stringify(u));window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));return u; }
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/erp/web/sw.js',{scope:'/erp/web/'}).catch(()=>{});
  window.addEventListener('online',()=>{if(token())sync().catch(()=>{});});
  return {token,user,setBranch,request,offlineQueue,sync,deviceKey,cacheGet,cacheSet,offlinePendingCount:()=>offlineQueue().length};
})();
