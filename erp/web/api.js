window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };
  const queueKey = 'anvi_mitra_offline_queue_v1';
  const deviceKey = () => { let k = localStorage.getItem('anvi_mitra_device_key'); if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : 'web-' + Math.random().toString(36).slice(2)); localStorage.setItem('anvi_mitra_device_key', k); } return k; };
  const offlineQueue = () => { try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch (_) { return []; } };
  function saveQueue(q) { localStorage.setItem(queueKey, JSON.stringify(q)); window.dispatchEvent(new CustomEvent('lsk:offline-queued')); }
  function enqueue(change) { const q = offlineQueue(); q.push({ clientId: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(), ...change, queuedAt: new Date().toISOString() }); saveQueue(q); return q.length; }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const t = token(); if (t) headers.set('Authorization', `Bearer ${t}`);
    try {
      const response = await fetch(path, { ...options, headers });
      if (response.status === 401) { sessionStorage.clear(); location.replace('/erp/web/login.html'); throw new Error('Session expired'); }
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data;
    } catch (err) {
      if (options.offlineQueue && ['POST','PATCH','PUT','DELETE'].includes(String(options.method || 'GET').toUpperCase())) {
        const body = options.body ? JSON.parse(options.body) : {};
        enqueue({ path, method: options.method || 'POST', payload: body });
        return { offlineQueued: true, queued: offlineQueue().length };
      }
      throw err;
    }
  }
  async function registerDevice() { return request('/api/sync/device', { method: 'POST', body: JSON.stringify({ deviceKey: deviceKey(), deviceName: navigator.userAgent.slice(0, 180), platform: 'web' }) }); }
  async function sync() {
    if (!token() || !navigator.onLine) throw new Error('Internet connection required for sync');
    await registerDevice();
    const q = offlineQueue(); let uploaded = 0;
    if (q.length) { const pushed = await request('/api/sync/push', { method: 'POST', body: JSON.stringify({ deviceKey: deviceKey(), changes: q.map(({clientId,path,method,payload,queuedAt}) => ({ clientId, entityType: `web:${method}:${path}`, entityId: null, operation: method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update', payload: { path, method, body: payload, queuedAt } })) }) }); uploaded = (pushed.accepted || []).length; const acceptedIds = new Set((pushed.accepted || []).map(x => x.clientId)); localStorage.setItem(queueKey, JSON.stringify(q.filter(x => !acceptedIds.has(x.clientId)))); }
    const cursor = Number(localStorage.getItem('anvi_mitra_sync_cursor') || 0); const pulled = await request(`/api/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=250&deviceKey=${encodeURIComponent(deviceKey())}`); const changes = pulled.changes || []; if (changes.length) localStorage.setItem('anvi_mitra_sync_cursor', String(pulled.cursor || cursor)); localStorage.setItem('anvi_mitra_last_sync', new Date().toISOString()); window.dispatchEvent(new CustomEvent('lsk:sync-complete')); return { uploaded, downloaded: changes.length, changes };
  }
  async function setBranch(branchId) { const normalized = branchId || null; const result = await request('/api/auth/switch-branch', { method: 'POST', body: JSON.stringify({ branchId: normalized }) }); if (!result.accessToken) throw new Error('Branch switch failed'); sessionStorage.setItem('lsk_access_token', result.accessToken); const u=user(); u.branchId=result.branchId ?? normalized; sessionStorage.setItem('lsk_user', JSON.stringify(u)); window.dispatchEvent(new CustomEvent('lsk:branch-change', { detail: { branchId: u.branchId } })); return u; }
  window.addEventListener('online', () => { if (token()) sync().catch(() => {}); });
  return { token, user, setBranch, request, offlineQueue, sync, deviceKey };
})();
