/* Anvi Mitra ERP web offline-first cache/outbox. Filesystem access is never implicit. */
(function (global) {
  'use strict';
  const DB_NAME = 'anvi-mitra-erp-offline';
  const DB_VERSION = 2;
  const OUTBOX = 'outbox';
  const CACHE = 'cache';
  const META = 'meta';

  function id() {
    return global.crypto && typeof global.crypto.randomUUID === 'function'
      ? global.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB is not available'));
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'clientId' });
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Unable to open offline database'));
    });
  }

  function tx(storeName, mode, operation) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = operation(store); } catch (e) { reject(e); return; }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Offline transaction failed'));
    }));
  }

  async function enqueue(change) {
    if (!change || !change.entityType || !['create','update','delete'].includes(change.operation)) {
      throw new Error('entityType and valid operation are required');
    }
    const item = {
      clientId: change.clientId || id(),
      entityType: change.entityType,
      entityId: change.entityId || null,
      operation: change.operation,
      payload: change.payload || {},
      baseCursor: Number(change.baseCursor || 0),
      createdAt: new Date().toISOString()
    };
    await tx(OUTBOX, 'readwrite', store => store.put(item));
    return item;
  }

  async function pending() {
    return openDb().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      request.onerror = () => reject(request.error);
    }));
  }

  async function clear(clientIds) {
    const ids = Array.isArray(clientIds) ? clientIds : [];
    if (!ids.length) return;
    await tx(OUTBOX, 'readwrite', store => ids.forEach(value => store.delete(value)));
  }

  async function cachePut(key, value) {
    await tx(CACHE, 'readwrite', store => store.put({ key: String(key), value, updatedAt: new Date().toISOString() }));
    return value;
  }

  async function cacheGet(key) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(CACHE, 'readonly').objectStore(CACHE).get(String(key));
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    }));
  }

  async function cacheDelete(key) {
    return tx(CACHE, 'readwrite', store => store.delete(String(key)));
  }

  async function getMeta(key, fallback = 0) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(META, 'readonly').objectStore(META).get(String(key));
      request.onsuccess = () => resolve(request.result ? request.result.value : fallback);
      request.onerror = () => reject(request.error);
    }));
  }

  async function setMeta(key, value) {
    await tx(META, 'readwrite', store => store.put({ key: String(key), value }));
    return value;
  }

  async function registerDevice(options) {
    const opts = options || {};
    if (!opts.accessToken || !opts.deviceKey) throw new Error('accessToken and deviceKey are required');
    const response = await global.fetch((opts.apiBaseUrl || '') + '/api/sync/device', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + opts.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceKey: opts.deviceKey,
        deviceName: opts.deviceName || 'Web Browser',
        platform: 'web'
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to register sync device');
    return result.device;
  }

  async function pull(options) {
    const opts = options || {};
    if (global.navigator && global.navigator.onLine === false) {
      return { offline: true, changes: [], nextCursor: await getMeta('serverCursor', 0) };
    }
    if (!opts.accessToken || !opts.deviceKey) throw new Error('accessToken and deviceKey are required');
    const cursor = Number(opts.cursor == null ? await getMeta('serverCursor', 0) : opts.cursor);
    const params = new URLSearchParams({
      deviceKey: opts.deviceKey,
      cursor: String(cursor),
      limit: String(Math.min(Math.max(Number(opts.limit) || 200, 1), 1000))
    });
    const response = await global.fetch((opts.apiBaseUrl || '') + '/api/sync/changes?' + params.toString(), {
      headers: { Authorization: 'Bearer ' + opts.accessToken }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Offline pull failed');
    for (const change of result.changes || []) {
      await cachePut('entity:' + change.entityType + ':' + (change.entityId || change.cursor), change);
    }
    await setMeta('serverCursor', Number(result.nextCursor || cursor));
    return { offline: false, changes: result.changes || [], nextCursor: Number(result.nextCursor || cursor), hasMore: Boolean(result.hasMore) };
  }

  async function sync(options) {
    const opts = options || {};
    if (global.navigator && global.navigator.onLine === false) return { offline: true, accepted: [], conflicts: [] };
    if (!opts.accessToken || !opts.deviceKey) throw new Error('accessToken and deviceKey are required');
    await registerDevice(opts).catch(() => null);

    const queue = await pending();
    // Keep the last applied server cursor separate from cursors assigned to our own pushed changes.
    const appliedCursor = await getMeta('serverCursor', 0);
    let pushed = { accepted: [], conflicts: [], nextCursor: appliedCursor };
    if (queue.length) {
      const response = await global.fetch((opts.apiBaseUrl || '') + '/api/sync/push', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + opts.accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceKey: opts.deviceKey, changes: queue })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Offline synchronization failed');
      const conflicts = new Set((result.conflicts || []).map(item => item.clientChangeId).filter(Boolean));
      await clear(queue.filter(item => !conflicts.has(item.clientId)).map(item => item.clientId));
      pushed = { offline: false, accepted: result.accepted || [], conflicts: result.conflicts || [], nextCursor: appliedCursor };
    }
    // Pull from the previously applied cursor, not from a cursor assigned to our pushed writes.
    // This prevents missing other devices' changes that were created before/around our push.
    const pulled = await pull({ ...opts, cursor: appliedCursor }).catch(() => null);
    if (pulled && !pulled.offline) {
      await global.fetch((opts.apiBaseUrl || '') + '/api/sync/ack', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + opts.accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceKey: opts.deviceKey, cursor: pulled.nextCursor })
      }).catch(() => null);
    }
    return {
      offline: false,
      accepted: pushed.accepted,
      conflicts: pushed.conflicts,
      changes: pulled ? pulled.changes : [],
      nextCursor: pulled ? pulled.nextCursor : pushed.nextCursor
    };
  }

  function bindAutoSync(options) {
    const run = () => sync(options).catch(() => null);
    global.addEventListener('online', run);
    return () => global.removeEventListener('online', run);
  }

  global.AnviOfflineSync = {
    enqueue, pending, clear, cachePut, cacheGet, cacheDelete,
    getMeta, setMeta, registerDevice, pull, sync, bindAutoSync,
    online: () => global.navigator.onLine
  };
})(window);
