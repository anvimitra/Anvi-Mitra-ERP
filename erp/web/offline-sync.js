window.AnviMitraOfflineSync = (() => {
  const DB_NAME = 'anvi-mitra-erp-offline';
  const DB_VERSION = 2;
  const OUTBOX = 'outbox';
  const META = 'meta';
  const CACHE = 'cache';
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'clientId' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, work) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const request = work(s);
      let result;
      if (request && typeof request.onsuccess !== 'undefined') {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
      } else result = request;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const get = (store, key) => tx(store, 'readonly', s => s.get(key));
  const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
  const remove = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  const all = store => tx(store, 'readonly', s => s.getAll());

  function deviceKey() {
    let key = localStorage.getItem('anvi_mitra_device_key');
    if (!key) {
      key = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '');
      localStorage.setItem('anvi_mitra_device_key', key);
    }
    return key;
  }

  async function request(path, options = {}) {
    if (window.LSKERP?.request) return window.LSKERP.request(path, options);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = sessionStorage.getItem('lsk_access_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const r = await fetch(path, { ...options, headers });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  async function registerDevice() {
    return request('/api/sync/device', { method: 'POST', body: JSON.stringify({ deviceKey: deviceKey(), deviceName: navigator.userAgent.slice(0, 180), platform: 'web' }) });
  }

  async function queue(entityType, entityId, operation, payload, baseCursor = 0) {
    const item = { clientId: crypto.randomUUID(), entityType, entityId: entityId || null, operation, payload: payload || {}, baseCursor: Number(baseCursor) || 0, queuedAt: new Date().toISOString() };
    await put(OUTBOX, item);
    return item;
  }

  async function save(entityType, entityId, value) {
    return put(CACHE, { key: `${entityType}:${entityId}`, entityType, entityId: entityId || null, value, savedAt: new Date().toISOString() });
  }

  async function read(entityType, entityId) {
    const item = await get(CACHE, `${entityType}:${entityId}`);
    return item?.value ?? null;
  }

  async function removeCached(entityType, entityId) {
    return remove(CACHE, `${entityType}:${entityId}`);
  }

  async function applyPulledChanges(changes = []) {
    for (const change of changes) {
      if (!change.entity_type) continue;
      if (change.operation === 'delete') await removeCached(change.entity_type, change.entity_id);
      else await save(change.entity_type, change.entity_id, change.payload || {});
    }
  }

  async function push() {
    const items = await all(OUTBOX);
    if (!items.length) return { accepted: [], conflicts: [], nextCursor: await cursor() };
    const result = await request('/api/sync/push', { method: 'POST', body: JSON.stringify({ deviceKey: deviceKey(), changes: items.map(x => ({ clientId: x.clientId, entityType: x.entityType, entityId: x.entityId, operation: x.operation, payload: x.payload, baseCursor: x.baseCursor })) }) });
    for (const accepted of (result.accepted || [])) {
      const id = accepted.client_change_id || accepted.clientChangeId || accepted.client_id;
      if (id) await remove(OUTBOX, id);
    }
    return result;
  }

  async function pull(limit = 200) {
    const c = await cursor();
    const result = await request(`/api/sync/changes?deviceKey=${encodeURIComponent(deviceKey())}&cursor=${encodeURIComponent(c)}&limit=${encodeURIComponent(limit)}`);
    await applyPulledChanges(result.changes || []);
    await setCursor(result.nextCursor || c);
    return result;
  }

  async function sync() {
    if (!navigator.onLine) return { online: false, pushed: { accepted: [], conflicts: [] }, pulled: { changes: [] } };
    await registerDevice();
    const pushed = await push();
    const pulled = await pull();
    return { pushed, pulled, online: true };
  }

  async function cursor() { return Number((await get(META, 'cursor'))?.value || 0); }
  async function setCursor(value) { return put(META, { key: 'cursor', value: Number(value) || 0 }); }
  async function outboxCount() { return (await all(OUTBOX)).length; }
  async function cacheCount() { return (await all(CACHE)).length; }
  async function status() { return { online: navigator.onLine, deviceKey: deviceKey(), cursor: await cursor(), outboxCount: await outboxCount(), cacheCount: await cacheCount() }; }

  window.addEventListener('online', () => sync().catch(() => {}));
  return { deviceKey, registerDevice, queue, save, read, removeCached, applyPulledChanges, push, pull, sync, status, cursor, setCursor, outboxCount, cacheCount };
})();
