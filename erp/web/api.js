window.LSKERP = (() => {
  const TOKEN_KEY = 'lsk_access_token';
  const USER_KEY = 'lsk_user';
  const QUEUE_KEY = 'anvi_mitra_offline_queue_v1';
  const CURSOR_KEY = 'anvi_mitra_sync_cursor';
  const DEVICE_KEY = 'anvi_mitra_device_key';
  const token = () => sessionStorage.getItem(TOKEN_KEY);
  const user = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}'); } catch (_) { return {}; } };
  const offlineQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; } };
  function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); window.dispatchEvent(new CustomEvent('lsk:offline-queued')); }
  function deviceKey() { let k = localStorage.getItem(DEVICE_KEY); if (!k) { k = crypto.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_KEY, k); } return k; }
  function enqueue(change) { const q=offlineQueue(); q.push({clientId:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,...change,queuedAt:new Date().toISOString()}); saveQueue(q); return q.length; }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const t = token(); if (t) headers.set('Authorization', `Bearer ${t}`);
    try {
      const response = await fetch(path, { ...options, headers });
      if (response.status === 401) { sessionStorage.clear(); location.replace('/erp/web/login.html'); throw new Error('Session expired'); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    } catch (err) {
      const method=String(options.method||'GET').toUpperCase();
      if (options.offlineQueue && ['POST','PATCH','PUT','DELETE'].includes(method)) {
        const body=options.body?JSON.parse(options.body):{};
        enqueue({path,method,payload:body});
        return {offlineQueued:true,queued:offlineQueue().length};
      }
      throw err;
    }
  }

  async function registerDevice() { return request('/api/sync/device',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),deviceName:navigator.userAgent.slice(0,180),platform:'web'})}); }
  async function sync() {
    if(!token()||!navigator.onLine) throw new Error('Internet connection required for sync');
    await registerDevice();
    const q=offlineQueue(); let uploaded=0;
    if(q.length){
      const changes=q.slice(0,200).map(({clientId,path,method,payload,queuedAt})=>({clientId,entityType:`web:${method}:${path}`.slice(0,100),entityId:null,operation:method==='DELETE'?'delete':method==='POST'?'create':'update',payload:{path,method,body:payload,queuedAt}}));
      const pushed=await request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey:deviceKey(),changes})});
      const accepted=pushed.accepted||[]; uploaded=accepted.length;
      const ids=new Set(accepted.map(x=>x.clientId).filter(Boolean)); localStorage.setItem(QUEUE_KEY,JSON.stringify(q.filter(x=>!ids.has(x.clientId))));
    }
    const cursor=Number(localStorage.getItem(CURSOR_KEY)||0);
    const pulled=await request(`/api/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=250&deviceKey=${encodeURIComponent(deviceKey())}`);
    const changes=pulled.changes||[];
    changes.forEach(change=>{const key=`anvi_mitra_cache_v1:${change.entity_type}:${change.entity_id||change.cursor}`; if(change.operation==='delete')localStorage.removeItem(key); else localStorage.setItem(key,JSON.stringify(change.payload||{}));});
    if(changes.length)localStorage.setItem(CURSOR_KEY,String(pulled.cursor||cursor));
    localStorage.setItem('anvi_mitra_last_sync',new Date().toISOString());
    window.dispatchEvent(new CustomEvent('lsk:sync-complete',{detail:{uploaded,downloaded:changes.length}}));
    return {uploaded,downloaded:changes.length,changes};
  }
  async function setBranch(branchId) { const normalized=branchId||null; const result=await request('/api/auth/switch-branch',{method:'POST',body:JSON.stringify({branchId:normalized})}); if(!result.accessToken)throw new Error('Branch switch failed'); sessionStorage.setItem(TOKEN_KEY,result.accessToken); const u=user();u.branchId=result.branchId??normalized;sessionStorage.setItem(USER_KEY,JSON.stringify(u));window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));return u; }
  window.addEventListener('online',()=>{if(token())sync().catch(()=>{});});
  return {token,user,setBranch,request,offlineQueue,sync,deviceKey};
})();
