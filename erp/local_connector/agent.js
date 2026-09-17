#!/usr/bin/env node
/**
 * Anvi Mitra ERP local secondary-storage connector.
 *
 * Run this on the school's Windows/Linux PC. It reads/writes ONLY inside
 * LOCAL_DATA_DIR. The online ERP remains the source of truth.
 *
 * Required env:
 *   ERP_API_URL       e.g. https://erp.example.com
 *   ERP_ACCESS_TOKEN  service/user access token for this school
 *   LOCAL_DATA_DIR    folder used for the secondary copy
 * Optional:
 *   DEVICE_KEY        stable connector id (generated when omitted)
 *   DEVICE_NAME      friendly machine name
 *   POLL_SECONDS     default 30
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const API = String(process.env.ERP_API_URL || '').replace(/\/$/, '');
const TOKEN = String(process.env.ERP_ACCESS_TOKEN || '');
const DATA_DIR = path.resolve(process.env.LOCAL_DATA_DIR || './anvi-mitra-local-data');
const DEVICE_FILE = path.join(DATA_DIR, '.device-key');
const CURSOR_FILE = path.join(DATA_DIR, '.sync-cursor');
const POLL_MS = Math.max(Number(process.env.POLL_SECONDS || 30), 10) * 1000;

if (!API || !TOKEN) {
  console.error('ERP_API_URL and ERP_ACCESS_TOKEN are required.');
  process.exit(1);
}

async function readText(file, fallback='') {
  try { return await fs.readFile(file, 'utf8'); } catch (_) { return fallback; }
}
async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value, 'utf8');
}
async function deviceKey() {
  const existing = (await readText(DEVICE_FILE)).trim();
  if (existing) return existing;
  const key = crypto.randomUUID();
  await writeText(DEVICE_FILE, key);
  return key;
}
async function cursor() { return Number((await readText(CURSOR_FILE, '0')).trim()) || 0; }

async function api(pathname, options={}) {
  const response = await fetch(API + pathname, {
    ...options,
    headers: { Accept:'application/json', Authorization:`Bearer ${TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `ERP request failed (${response.status})`);
  return data;
}

function safePart(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0,120);
}
async function applyChange(change) {
  // Store an append-only JSON snapshot per entity. This gives the school a
  // durable local copy without allowing the connector to write outside DATA_DIR.
  if (!change.entityType) return;
  const dir = path.join(DATA_DIR, 'entities', safePart(change.entityType));
  const file = path.join(dir, safePart(change.entityId || `cursor-${change.cursor}`) + '.json');
  const payload = {
    cursor: Number(change.cursor),
    entityType: change.entityType,
    entityId: change.entityId || null,
    operation: change.operation,
    payload: change.payload || {},
    changedAt: change.changedAt || change.changed_at || new Date().toISOString()
  };
  if (change.operation === 'delete') {
    await fs.rm(file, { force:true });
    return;
  }
  await writeText(file, JSON.stringify(payload, null, 2));
}

async function syncOnce() {
  const key = await deviceKey();
  await api('/api/sync/device', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
    deviceKey:key,
    deviceName:process.env.DEVICE_NAME || 'Anvi Mitra Local Connector',
    platform:'desktop-local-storage'
  })});
  let current = await cursor();
  let total = 0;
  for (;;) {
    const data = await api('/api/sync/pull', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({deviceKey:key,cursor:current,limit:200}) });
    for (const change of data.changes || []) {
      await applyChange(change);
      current = Number(change.cursor) || current;
      total++;
    }
    await api('/api/sync/ack', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({deviceKey:key,cursor:current}) });
    await writeText(CURSOR_FILE, String(current));
    if (!data.hasMore) break;
  }
  await api('/api/local-storage/connectors').catch(()=>({}));
  console.log(new Date().toISOString(), `sync ok; applied ${total} change(s), cursor ${current}`);
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { await syncOnce(); }
  catch (error) { console.error(new Date().toISOString(), 'sync error:', error.message); }
  finally { running = false; }
}

(async()=>{
  await fs.mkdir(DATA_DIR, { recursive:true });
  console.log(`Anvi Mitra local connector started: ${DATA_DIR}`);
  await tick();
  setInterval(tick, POLL_MS);
})();
