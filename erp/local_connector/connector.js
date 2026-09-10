const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.LOCAL_CONNECTOR_PORT || 43800);
const ROOT = path.resolve(process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), 'data'));
const LOCAL_TOKEN = process.env.LOCAL_CONNECTOR_TOKEN || '';
const ERP_API_URL = String(process.env.ERP_API_URL || '').replace(/\/$/, '');
const ERP_ACCESS_TOKEN = process.env.ERP_ACCESS_TOKEN || '';
const DEVICE_KEY = process.env.SYNC_DEVICE_KEY || crypto.randomUUID();
const CONNECTOR_NAME = process.env.LOCAL_CONNECTOR_NAME || 'Anvi Mitra Local Storage';
const READ_WRITE = (process.env.LOCAL_PERMISSION_MODE || 'read_write') === 'read_write';
const MANIFEST = path.join(ROOT, 'manifest.json');
const CHANGES = path.join(ROOT, 'changes.jsonl');
const OUTBOX = path.join(ROOT, 'outbox.json');

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
  try { await fs.access(MANIFEST); } catch { await writeJson(MANIFEST, { version: 1, cursor: 0, deviceKey: DEVICE_KEY, connectorName: CONNECTOR_NAME }); }
  try { await fs.access(OUTBOX); } catch { await writeJson(OUTBOX, []); }
}

async function writeJson(file, value) { await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8'); }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } }

function safePath(relative) {
  const requested = String(relative || '').trim();
  if (!requested || requested.includes('\0')) throw new Error('A relative path is required');
  const target = path.resolve(ROOT, requested);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) throw new Error('Path is outside the ERP storage root');
  return target;
}

function authorized(req) { return LOCAL_TOKEN && req.headers['x-local-connector-token'] === LOCAL_TOKEN; }
function json(res, status, body) { const raw = JSON.stringify(body); res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(raw)}); res.end(raw); }
async function body(req) { let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > 1024 * 1024) throw new Error('Request too large'); } return raw ? JSON.parse(raw) : {}; }

async function listFiles(relative='') {
  const dir = safePath(relative);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.map(e => ({ name:e.name, type:e.isDirectory()?'directory':'file' })).sort((a,b)=>a.name.localeCompare(b.name));
}

async function remoteRequest(endpoint, method='GET', payload) {
  if (!ERP_API_URL || !ERP_ACCESS_TOKEN) throw new Error('Remote ERP sync is not configured');
  const url = new URL(ERP_API_URL + endpoint);
  const options = { method, headers: { authorization:`Bearer ${ERP_ACCESS_TOKEN}`, accept:'application/json' } };
  if (payload !== undefined) { options.headers['content-type']='application/json'; options.body=JSON.stringify(payload); }
  const response = await fetch(url, options);
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `ERP request failed (${response.status})`);
  return data;
}

async function syncRegister() {
  const data = await remoteRequest('/api/sync/device','POST',{deviceKey:DEVICE_KEY,deviceName:CONNECTOR_NAME,platform:'desktop'});
  if (data.device) {
    const manifest = await readJson(MANIFEST, {});
    manifest.deviceId = data.device.id;
    if (Number(data.device.last_cursor) > Number(manifest.cursor || 0)) manifest.cursor = Number(data.device.last_cursor);
    await writeJson(MANIFEST, manifest);
  }
  return data;
}

async function syncPull() {
  const manifest = await readJson(MANIFEST, {cursor:0});
  const cursor = Number(manifest.cursor || 0);
  const data = await remoteRequest(`/api/sync/changes?deviceKey=${encodeURIComponent(DEVICE_KEY)}&cursor=${cursor}&limit=500`);
  const changes = Array.isArray(data.changes) ? data.changes : [];
  if (changes.length) await fs.appendFile(CHANGES, changes.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  manifest.cursor = Number(data.cursor || cursor);
  manifest.lastPullAt = new Date().toISOString();
  await writeJson(MANIFEST, manifest);
  return { cursor:manifest.cursor, count:changes.length, hasMore:Boolean(data.hasMore) };
}

async function syncPush() {
  const items = await readJson(OUTBOX, []);
  if (!Array.isArray(items) || items.length === 0) return { accepted:[], conflicts:[], count:0 };
  const data = await remoteRequest('/api/sync/push','POST',{deviceKey:DEVICE_KEY,changes:items.slice(0,200)});
  const done = new Set([...(data.accepted||[]),...(data.conflicts||[])].map(x => x.clientId).filter(Boolean));
  await writeJson(OUTBOX, items.filter(x => !done.has(x.clientId)));
  return {...data,count:items.length};
}

async function syncOnce() {
  await syncRegister();
  const pushed = await syncPush();
  const pulled = await syncPull();
  return {pushed,pulled};
}

async function route(req,res) {
  if (!authorized(req)) return json(res,401,{error:'Local connector authentication required'});
  const url = new URL(req.url,'http://127.0.0.1');
  try {
    if (req.method==='GET' && url.pathname==='/health') return json(res,200,{ok:true,service:'anvi-mitra-local-connector',root:ROOT,permissionMode:READ_WRITE?'read_write':'read_only',deviceKey:DEVICE_KEY,remoteSyncConfigured:Boolean(ERP_API_URL&&ERP_ACCESS_TOKEN)});
    if (req.method==='GET' && url.pathname==='/list') return json(res,200,{files:await listFiles(url.searchParams.get('path')||'')});
    if (req.method==='GET' && url.pathname==='/read') { const file=safePath(url.searchParams.get('path')); const stat=await fs.stat(file); if(!stat.isFile()) throw new Error('Path is not a file'); return json(res,200,{path:path.relative(ROOT,file),content:await fs.readFile(file,'utf8')}); }
    if (req.method==='POST' && url.pathname==='/write') { if(!READ_WRITE)return json(res,403,{error:'Connector is read-only'}); const data=await body(req); const file=safePath(data.path); if (path.basename(file)==='manifest.json' || path.basename(file)==='outbox.json') throw new Error('Protected connector file'); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,String(data.content??''),'utf8'); return json(res,200,{ok:true,path:path.relative(ROOT,file)}); }
    if (req.method==='POST' && url.pathname==='/sync') return json(res,200,{ok:true,...await syncOnce()});
    if (req.method==='GET' && url.pathname==='/sync/status') { const m=await readJson(MANIFEST,{}); const out=await readJson(OUTBOX,[]); return json(res,200,{deviceKey:DEVICE_KEY,deviceId:m.deviceId||null,cursor:Number(m.cursor||0),pending:Array.isArray(out)?out.length:0,lastPullAt:m.lastPullAt||null,remoteSyncConfigured:Boolean(ERP_API_URL&&ERP_ACCESS_TOKEN)}); }
    if (req.method==='POST' && url.pathname==='/sync/queue') { if(!READ_WRITE)return json(res,403,{error:'Connector is read-only'}); const data=await body(req); if(!['create','update','delete'].includes(data.operation)) throw new Error('Invalid operation'); const items=await readJson(OUTBOX,[]); items.push({clientId:data.clientId||crypto.randomUUID(),entityType:String(data.entityType||'local_file'),entityId:data.entityId||null,operation:data.operation,payload:data.payload||{},baseCursor:Number((await readJson(MANIFEST,{cursor:0})).cursor||0),queuedAt:new Date().toISOString()}); await writeJson(OUTBOX,items); return json(res,201,{ok:true,pending:items.length}); }
    return json(res,404,{error:'Not found'});
  } catch (e) { return json(res,400,{error:e.message||'Request failed'}); }
}

(async()=>{ await ensureRoot(); const server=http.createServer((req,res)=>route(req,res)); server.listen(PORT,'127.0.0.1',()=>console.log(`Anvi Mitra local connector listening on 127.0.0.1:${PORT}`)); setInterval(()=>{ if(ERP_API_URL&&ERP_ACCESS_TOKEN) syncOnce().catch(e=>console.error('sync:',e.message)); },60_000); if(ERP_API_URL&&ERP_ACCESS_TOKEN) syncOnce().catch(e=>console.error('initial sync:',e.message)); })();
