window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };
  const CACHE_DB = 'anvi-mitra-erp-cache';
  const CACHE_STORE = 'responses';
  let cacheDbPromise;

  function openCache() {
    if (cacheDbPromise) return cacheDbPromise;
    if (!window.indexedDB) return Promise.resolve(null);
    cacheDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
    return cacheDbPromise;
  }

  async function cacheGet(key) {
    const db = await openCache();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const t = db.transaction(CACHE_STORE, 'readonly');
        const r = t.objectStore(CACHE_STORE).get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async function cachePut(key, data) {
    const db = await openCache();
    if (!db) return;
    try {
      const t = db.transaction(CACHE_STORE, 'readwrite');
      t.objectStore(CACHE_STORE).put({ key, data, savedAt: new Date().toISOString() });
    } catch (_) {}
  }

  function cacheKey(path) {
    return `${user().schoolId || 'school'}:${user().branchId || 'school'}:${path}`;
  }

  async function setBranch(branchId) {
    const normalized = branchId || null;
    const result = await request('/api/auth/switch-branch', {
      method: 'POST',
      body: JSON.stringify({ branchId: normalized })
    });
    if (!result.accessToken) throw new Error('Branch switch failed');
    sessionStorage.setItem('lsk_access_token', result.accessToken);
    const u=user(); u.branchId=result.branchId ?? normalized; sessionStorage.setItem('lsk_user',JSON.stringify(u));
    window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));
    return u;
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers=new Headers(options.headers || {}); headers.set('Accept','application/json');
    if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const t=token(); if(t) headers.set('Authorization',`Bearer ${t}`);
    try {
      const response=await fetch(path,{...options,headers});
      if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired');}
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||`Request failed (${response.status})`);
      if(method==='GET') await cachePut(cacheKey(path), data);
      return data;
    } catch (error) {
      if(method==='GET') {
        const cached = await cacheGet(cacheKey(path));
        if(cached) {
          window.dispatchEvent(new CustomEvent('lsk:offline-data',{detail:{path,savedAt:cached.savedAt}}));
          return cached.data;
        }
      }
      throw error;
    }
  }
  return {token,user,setBranch,request};
})();
