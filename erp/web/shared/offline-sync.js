/* Anvi Mitra ERP offline-first client.
 * Stores a tenant-scoped cache and mutation outbox in IndexedDB, then syncs when online.
 */
(function (global) {
  'use strict';
  const DB = 'anvi-mitra-erp-offline-v1';
  const VERSION = 1;
  const STORES = ['records', 'outbox', 'meta'];

  function OfflineSync(options) {
    this.deviceKey = options.deviceKey || ('web-' + crypto.randomUUID());
    this.deviceName = options.deviceName || 'ERP Web';
    this.platform = options.platform || 'web';
    this.apiBase = options.apiBase || '';
    this.intervalMs = options.intervalMs || 15000;
    this.dbPromise = null;
    this.running = false;
    this.listeners = {};
  }

  OfflineSync.prototype.on = function (event, fn) {
    (this.listeners[event] ||= []).push(fn);
    return this;
  };
  OfflineSync.prototype.emit = function (event, value) {
    (this.listeners[event] || []).forEach(function (fn) { try { fn(value); } catch (_) {} });
  };
  OfflineSync.prototype.open = function () {
    const self = this;
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) {
          const outbox = db.createObjectStore('outbox', { keyPath: 'clientId' });
          outbox.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return this.dbPromise;
  };
  OfflineSync.prototype.tx = async function (store, mode, work) {
    const db = await this.open();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(store, mode), objectStore = tx.objectStore(store);
      let value;
      try { value = work(objectStore); } catch (e) { reject(e); return; }
      tx.oncomplete = function () { resolve(value); };
      tx.onerror = function () { reject(tx.error); };
    });
  };
  OfflineSync.prototype.putRecord = function (schoolId, entityType, entityId, payload, cursor) {
    return this.tx('records', 'readwrite', function (s) {
      s.put({ key: schoolId + ':' + entityType + ':' + entityId, schoolId, entityType, entityId, payload, cursor: Number(cursor || 0), updatedAt: Date.now() });
    });
  };
  OfflineSync.prototype.queue = function (change) {
    const clientId = change.clientId || crypto.randomUUID();
    const item = Object.assign({}, change, { clientId, createdAt: Date.now() });
    return this.tx('outbox', 'readwrite', function (s) { s.put(item); });
  };
  OfflineSync.prototype.getMeta = async function (key, fallback) {
    const db = await this.open();
    return new Promise(function (resolve, reject) {
      const req = db.transaction('meta').objectStore('meta').get(key);
      req.onsuccess = function () { resolve(req.result ? req.result.value : fallback); };
      req.onerror = function () { reject(req.error); };
    });
  };
  OfflineSync.prototype.setMeta = function (key, value) {
    return this.tx('meta', 'readwrite', function (s) { s.put({ key, value }); });
  };
  OfflineSync.prototype.outbox = async function () {
    const db = await this.open();
    return new Promise(function (resolve, reject) {
      const req = db.transaction('outbox').objectStore('outbox').getAll();
      req.onsuccess = function () { resolve(req.result.sort(function (a,b) { return a.createdAt-b.createdAt; })); };
      req.onerror = function () { reject(req.error); };
    });
  };
  OfflineSync.prototype.register = async function () {
    const r = await this.fetch('/api/sync/device', { method:'POST', body: JSON.stringify({ deviceKey:this.deviceKey, deviceName:this.deviceName, platform:this.platform }) });
    await this.setMeta('registered', true);
    return r;
  };
  OfflineSync.prototype.fetch = async function (url, init) {
    const token = sessionStorage.getItem('lsk_access_token') || localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    const headers = Object.assign({}, (init && init.headers) || {}, { Authorization:'Bearer '+token, 'Content-Type':'application/json' });
    return fetch(this.apiBase + url, Object.assign({}, init || {}, { headers })).then(async function (r) {
      const d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.error || 'Sync request failed');
      return d;
    });
  };
  OfflineSync.prototype.sync = async function () {
    if (!navigator.onLine || this.running) return;
    this.running = true;
    this.emit('state', { status:'syncing' });
    try {
      if (!(await this.getMeta('registered', false))) await this.register();
      const cursor = Number(await this.getMeta('cursor', 0)) || 0;
      const pending = await this.outbox();
      if (pending.length) {
        const pushed = await this.fetch('/api/sync/push', { method:'POST', body:JSON.stringify({ deviceKey:this.deviceKey, changes:pending.map(function (x) { return { clientId:x.clientId, baseCursor:x.baseCursor||cursor, entityType:x.entityType, entityId:x.entityId||null, operation:x.operation, payload:x.payload }; }) }) });
        const conflicts = pushed.conflicts || [];
        const acceptedIds = new Set((pushed.accepted || []).map(function (x) { return x.client_change_id; }).filter(Boolean));
        await this.tx('outbox', 'readwrite', function (s) { pending.forEach(function (x) { if (acceptedIds.has(x.clientId)) s.delete(x.clientId); }); });
        if (conflicts.length) this.emit('conflicts', conflicts);
      }
      let nextCursor = cursor, page;
      do {
        page = await this.fetch('/api/sync/changes?deviceKey='+encodeURIComponent(this.deviceKey)+'&cursor='+nextCursor+'&limit=200');
        for (const change of (page.changes || [])) {
          await this.putRecord(await this.getMeta('schoolId','unknown'), change.entity_type, change.entity_id || change.cursor, change.payload, change.cursor);
          nextCursor = Number(change.cursor);
        }
        if (!page.changes || !page.changes.length) break;
      } while (page.hasMore);
      if (nextCursor > cursor) await this.fetch('/api/sync/ack', { method:'POST', body:JSON.stringify({deviceKey:this.deviceKey,cursor:nextCursor}) });
      await this.setMeta('cursor', nextCursor);
      this.emit('state', { status:'online', cursor:nextCursor, pending:(await this.outbox()).length });
    } catch (error) {
      this.emit('state', { status:'offline-pending', error:error.message });
    } finally { this.running = false; }
  };
  OfflineSync.prototype.start = function () {
    const self = this;
    if (this.started) return this;
    this.started = true;
    addEventListener('online', function () { self.sync(); });
    addEventListener('offline', function () { self.emit('state', { status:'offline' }); });
    this.sync();
    setInterval(function () { self.sync(); }, this.intervalMs);
    return this;
  };
  global.AnviMitraOfflineSync = OfflineSync;
})(window);
