window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token') || localStorage.getItem('anvi_erp_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || localStorage.getItem('anvi_erp_user') || '{}'); } catch (_) { return {}; } };
  const isMutation = (method) => !['GET','HEAD','OPTIONS'].includes(String(method || 'GET').toUpperCase());
  const entityTypeFromPath = (path) => {
    const clean = String(path || '').split('?')[0].replace(/^\/+/, '');
    const parts = clean.split('/').filter(Boolean);
    return (parts[parts.length - 1] || parts[parts.length - 2] || 'generic').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,100);
  };
  const queueOffline = (path, options) => {
    if (!window.AnviOfflineSync || !isMutation(options.method)) return false;
    let payload = {};
    try { payload = options.body ? JSON.parse(options.body) : {}; } catch (_) { payload = { rawBody: String(options.body || '') }; }
    window.AnviOfflineSync.enqueue({
      entityType: entityTypeFromPath(path),
      operation: String(options.method || 'POST').toLowerCase() === 'post' ? 'create' : String(options.method || 'PUT').toLowerCase() === 'delete' ? 'delete' : 'update',
      entityId: payload.id || payload.entityId || payload.studentId || null,
      payload
    });
    return true;
  };

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
    const headers=new Headers(options.headers || {});
    headers.set('Accept','application/json');
    if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const t=token(); if(t) headers.set('Authorization',`Bearer ${t}`);

    if (method !== 'GET' && !navigator.onLine) {
      queueOffline(path, {...options, method});
      window.dispatchEvent(new CustomEvent('lsk:offline-write-queued',{detail:{path,method}}));
      return { queued: true, offline: true, message: 'Saved locally and will sync when online.' };
    }

    try {
      const response=await fetch(path,{...options,method,headers});
      if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired');}
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw Object.assign(new Error(data.error||`Request failed (${response.status})`),{status:response.status,data});
      return data;
    } catch (error) {
      // Only transport failures are queued. Server-side 4xx/5xx responses are never
      // hidden because those errors require user-visible validation/authorization.
      const transportFailure = !('status' in error) || !error.status;
      if (transportFailure && method !== 'GET' && queueOffline(path,{...options,method})) {
        window.dispatchEvent(new CustomEvent('lsk:offline-write-queued',{detail:{path,method,error:String(error)}}));
        return { queued: true, offline: true, message: 'Connection unavailable. Saved locally and will sync automatically.' };
      }
      throw error;
    }
  }
  return {token,user,setBranch,request};
})();
