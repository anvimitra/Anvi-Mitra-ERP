/* Anvi Mitra ERP web offline-first cache/outbox. Filesystem access is never implicit. */
(function (global) {
  'use strict';
  const DB_NAME = 'anvi-mitra-erp-offline';
  const DB_VERSION = 1;
  const STORE = 'outbox';
  function id() { return global.crypto && typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB is not available'));
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'clientId' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Unable to open offline database'));
    });
  }
  function tx(mode, operation) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode), store = transaction.objectStore(STORE);
      let result;
      try { result = operation(store); } catch (e) { reject(e); return; }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Offline transaction failed'));
    }));
  }
  async function enqueue(change) {
    if (!change || !change.entityType || !['create','update','delete'].includes(change.operation)) throw new Error('entityType and valid operation are required');
    const item = { clientId: change.clientId || id(), entityType: change.entityType, entityId: change.entityId || null, operation: change.operation, payload: change.payload || {}, baseCursor: Number(change.baseCursor || 0), createdAt: new Date().toISOString() };
    await tx('readwrite', store => store.put(item));
    return item;
  }
  async function pending() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.sort((a,b) => a.createdAt.localeCompare(b.createdAt)));
      request.onerror = () => reject(request.error);
    });
  }
  async function clear(clientIds) {
    const ids = Array.isArray(clientIds) ? clientIds : [];
    if (!ids.length) return;
    await tx('readwrite', store => ids.forEach(value => store.delete(value)));
  }
  async function sync(options) {
    const opts = options || {};
    if (global.navigator && global.navigator.onLine === false) return { offline: true, accepted: [], conflicts: [] };
    if (!opts.accessToken || !opts.deviceKey) throw new Error('accessToken and deviceKey are required');
    const queue = await pending();
    if (!queue.length) return { offline: false, accepted: [], conflicts: [] };
    const response = await global.fetch((opts.apiBaseUrl || '') + '/api/sync/push', { method: 'POST', headers: { Authorization: 'Bearer ' + opts.accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceKey: opts.deviceKey, changes: queue }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Offline synchronization failed');
    const conflicts = new Set((result.conflicts || []).map(item => item.clientChangeId).filter(Boolean));
    await clear(queue.filter(item => !conflicts.has(item.clientId)).map(item => item.clientId));
    return { offline: false, accepted: result.accepted || [], conflicts: result.conflicts || [], nextCursor: result.nextCursor || 0 };
  }
  function bindAutoSync(options) { const run = () => sync(options).catch(() => null); global.addEventListener('online', run); return () => global.removeEventListener('online', run); }
  global.AnviOfflineSync = { enqueue, pending, clear, sync, bindAutoSync, online: () => global.navigator.onLine };
})(window);
