/* Anvi Mitra ERP — browser offline-first sync client.
 * Keeps an IndexedDB cache/outbox, pushes idempotently, pulls by server cursor,
 * acknowledges only after local application, and exposes connection state.
 */
(function (global) {
  'use strict';
  const DB = 'anvi-mitra-erp-offline';
  const VERSION = 1;
  const STORE = 'kv';
  const OUTBOX = 'outbox';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(OUTBOX)) {
          const s = db.createObjectStore(OUTBOX, { keyPath: 'clientId' });
          s.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      let result;
      try { result = fn(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
    });
  }

  const id = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  const read = (store, key) => tx(store, 'readonly', s => new Promise((res, rej) => { const r=s.get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }));
  const write = (store, key, value) => tx(store, 'readwrite', s => s.put(value, key));

  class OfflineSync {
    constructor(options) {
      this.apiBase = (options.apiBase || '').replace(/\\/$/, '');
      this.token = options.token;
      this.deviceKey = options.deviceKey;
      this.deviceName = options.deviceName || navigator.userAgent.slice(0, 120);
      this.platform = options.platform || 'web';
      this.onState = options.onState || function () {};
      this.state = navigator.onLine ? 'online' : 'offline';
      addEventListener('online', () => { this.setState('online'); this.sync(); });
      addEventListener('offline', () => this.setState('offline'));
    }
    setState(state, detail) { this.state = state; this.onState({state, detail}); }
    headers() { return { 'Content-Type':'application/json', 'Authorization':'Bearer ' + (typeof this.token === 'function' ? this.token() : this.token) }; }
    async request(path, init) {
      const r = await fetch(this.apiBase + path, {...init, headers:{...this.headers(), ...(init && init.headers || {})}});
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || ('Sync request failed: ' + r.status));
      return d;
    }
    async registerDevice() {
      return this.request('/api/sync/device', {method:'POST', body:JSON.stringify({deviceKey:this.deviceKey,deviceName:this.deviceName,platform:this.platform})});
    }
    async getCursor() { return Number((await read(STORE, 'cursor')) || 0); }
    async setCursor(cursor) { return write(STORE, 'cursor', Number(cursor) || 0); }
    async enqueue(entityType, entityId, operation, payload, baseCursor) {
      const change = {clientId:id(), entityType, entityId:entityId || null, operation, payload:payload || {}, baseCursor:Number(baseCursor) || await this.getCursor(), createdAt:Date.now()};
      await tx(OUTBOX,'readwrite',s=>s.put(change));
      this.onState({state:this.state, pending:true});
      if (navigator.onLine) this.sync();
      return change.clientId;
    }
    async listOutbox() {
      return tx(OUTBOX,'readonly',s=>new Promise((resolve,reject)=>{const r=s.getAll();r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>a.createdAt-b.createdAt));r.onerror=()=>reject(r.error)}));
    }
    async removeOutbox(ids) {
      if (!ids.length) return;
      await tx(OUTBOX,'readwrite',s=>ids.forEach(x=>s.delete(x)));
    }
    async push() {
      const changes=await this.listOutbox();
      if (!changes.length) return {accepted:[],conflicts:[]};
      const result=await this.request('/api/sync/push',{method:'POST',body:JSON.stringify({deviceKey:this.deviceKey,changes})});
      const acceptedIds=(result.accepted||[]).map(x=>x.client_change_id).filter(Boolean);
      await this.removeOutbox(acceptedIds);
      return result;
    }
    async pullAndApply(applyChange) {
      let cursor=await this.getCursor();
      let total=0;
      while (true) {
        const result=await this.request('/api/sync/pull',{method:'POST',body:JSON.stringify({deviceKey:this.deviceKey,cursor,limit:200})});
        for (const change of result.changes || []) await applyChange(change);
        total += (result.changes || []).length;
        if (result.changes && result.changes.length) {
          cursor=Number(result.nextCursor)||cursor;
          await this.request('/api/sync/ack',{method:'POST',body:JSON.stringify({deviceKey:this.deviceKey,cursor})});
          await this.setCursor(cursor);
        }
        if (!result.hasMore) break;
      }
      return {cursor,total};
    }
    async sync(applyChange) {
      if (!navigator.onLine) return {offline:true};
      try {
        this.setState('syncing');
        await this.registerDevice();
        const pushed=await this.push();
        const pulled=applyChange ? await this.pullAndApply(applyChange) : null;
        this.setState('online',{pushed,pulled});
        return {pushed,pulled};
      } catch (error) {
        this.setState('sync-error', error.message);
        return {error:error.message};
      }
    }
  }
  global.AnviMitraOfflineSync = OfflineSync;
})(window);
