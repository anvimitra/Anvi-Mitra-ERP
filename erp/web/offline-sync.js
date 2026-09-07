window.LSKOfflineSync = (() => {
  const DB_NAME = 'anvi-mitra-erp-offline';
  const DB_VERSION = 1;
  const OUTBOX = 'outbox';
  const META = 'meta';
  let dbPromise;
  let syncing = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX)) {
          db.createObjectStore(OUTBOX, { keyPath: 'clientId' });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline database could not be opened'));
    });
    return dbPromise;
  }

  function tx(store, mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const request = action(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }

  const getMeta = key => tx(META, 'readonly', s => s.get(key)).then(row => row?.value);
  const setMeta = (key, value) => tx(META, 'readwrite', s => s.put({ key, value }));

  async function queue(entityType, operation, payload, entityId = null) {
    if (!['create', 'update', 'delete'].includes(operation)) throw new Error('Invalid offline operation');
    const item = {
      clientId: `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`,
      entityType: String(entityType).slice(0, 100),
      entityId: entityId || null,
      operation,
      payload: payload || {},
      queuedAt: new Date().toISOString()
    };
    await tx(OUTBOX, 'readwrite', s => s.put(item));
    window.dispatchEvent(new CustomEvent('lsk:offline-queued', { detail: item }));
    if (navigator.onLine) sync().catch(() => {});
    return item;
  }

  async function allOutbox() {
    return tx(OUTBOX, 'readonly', s => s.getAll());
  }

  async function remove(clientIds) {
    if (!clientIds.length) return;
    await openDb().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(OUTBOX, 'readwrite');
      for (const id of clientIds) t.objectStore(OUTBOX).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  }

  async function ensureDevice() {
    let key = await getMeta('deviceKey');
    if (!key) {
      key = `web-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`;
      await setMeta('deviceKey', key);
    }
    const r = await LSKERP.request('/api/sync/device', {
      method: 'POST',
      body: JSON.stringify({ deviceKey: key, deviceName: navigator.userAgent.slice(0, 180), platform: 'web' })
    });
    await setMeta('deviceId', r.device?.id || null);
    return key;
  }

  async function sync() {
    if (syncing || !navigator.onLine || !LSKERP.token()) return { skipped: true };
    syncing = true;
    try {
      const deviceKey = await ensureDevice();
      const pending = await allOutbox();
      let pushed = [];
      if (pending.length) {
        const result = await LSKERP.request('/api/sync/push', {
          method: 'POST',
          body: JSON.stringify({ deviceKey, changes: pending.slice(0, 200) })
        });
        pushed = (result.accepted || []).map(x => x.clientId).filter(Boolean);
        await remove(pushed);
      }
      const cursor = Number((await getMeta('cursor')) || 0);
      const result = await LSKERP.request(`/api/sync/changes?cursor=${encodeURIComponent(cursor)}&deviceKey=${encodeURIComponent(deviceKey)}&limit=200`);
      await setMeta('cursor', Number(result.cursor || cursor));
      for (const change of result.changes || []) {
        window.dispatchEvent(new CustomEvent('lsk:sync-change', { detail: change }));
      }
      window.dispatchEvent(new CustomEvent('lsk:sync-complete', { detail: { pushed: pushed.length, pulled: (result.changes || []).length, cursor: Number(result.cursor || cursor) } }));
      return { pushed: pushed.length, pulled: (result.changes || []).length, cursor: Number(result.cursor || cursor) };
    } finally {
      syncing = false;
    }
  }

  window.addEventListener('online', () => sync().catch(() => {}));
  return { queue, sync, pending: allOutbox, getMeta };
})();
