#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.LOCAL_CONNECTOR_PORT || 43800);
const HOST = '127.0.0.1';
const ROOT = path.resolve(process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), 'data'));
const TOKEN = String(process.env.LOCAL_CONNECTOR_TOKEN || '');
const MAX_BODY = 1024 * 1024;

function safePath(input) {
  const relative = String(input || '').replace(/^[/\\]+/, '');
  const target = path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) throw new Error('Path is outside LOCAL_STORAGE_ROOT');
  return target;
}

async function jsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  if (!body) return {};
  return JSON.parse(body);
}

function send(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function authorized(req) {
  return TOKEN && req.headers['x-local-connector-token'] === TOKEN;
}

async function list(rel = '') {
  const dir = safePath(rel);
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return Promise.all(entries.map(async entry => {
    const relPath = path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/');
    if (entry.isDirectory()) return { name: entry.name, path: relPath, type: 'directory' };
    const stat = await fsp.stat(path.join(dir, entry.name));
    return { name: entry.name, path: relPath, type: 'file', size: stat.size, modifiedAt: stat.mtime.toISOString() };
  }));
}

async function manifest() {
  const files = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.name === '.anvi-manifest.json') continue;
      if (entry.isDirectory()) await walk(absolute);
      else {
        const stat = await fsp.stat(absolute);
        const hash = crypto.createHash('sha256');
        const data = await fsp.readFile(absolute);
        hash.update(data);
        files.push({ path: path.relative(ROOT, absolute).split(path.sep).join('/'), size: stat.size, modifiedAt: stat.mtime.toISOString(), sha256: hash.digest('hex') });
      }
    }
  }
  await walk(ROOT);
  return { version: 1, generatedAt: new Date().toISOString(), files };
}

async function writeManifest() {
  const value = await manifest();
  await fsp.writeFile(path.join(ROOT, '.anvi-manifest.json'), JSON.stringify(value, null, 2), 'utf8');
  return value;
}

async function main() {
  await fsp.mkdir(ROOT, { recursive: true });
  if (!TOKEN) console.warn('WARNING: LOCAL_CONNECTOR_TOKEN is not set; local file endpoints will be disabled.');

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'anvi-mitra-local-connector', root: ROOT, port: PORT });
      if (!authorized(req)) return send(res, 401, { error: 'Local connector authentication required' });

      if (req.method === 'GET' && url.pathname === '/list') return send(res, 200, { root: ROOT, entries: await list(url.searchParams.get('path') || '') });
      if (req.method === 'GET' && url.pathname === '/read') {
        const file = safePath(url.searchParams.get('path'));
        const stat = await fsp.stat(file);
        if (!stat.isFile()) return send(res, 400, { error: 'Path is not a file' });
        return send(res, 200, { path: path.relative(ROOT, file).split(path.sep).join('/'), content: await fsp.readFile(file, 'utf8'), modifiedAt: stat.mtime.toISOString() });
      }
      if (req.method === 'POST' && url.pathname === '/write') {
        const body = await jsonBody(req);
        const file = safePath(body.path);
        if (!body.path || typeof body.content !== 'string') return send(res, 400, { error: 'path and string content are required' });
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file, body.content, 'utf8');
        return send(res, 201, { ok: true, path: path.relative(ROOT, file).split(path.sep).join('/') });
      }
      if (req.method === 'POST' && url.pathname === '/manifest') return send(res, 200, await writeManifest());
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      send(res, Number(error.status || 500), { error: error.message || 'Connector error' });
    }
  });
  server.listen(PORT, HOST, () => console.log(`Anvi Mitra local connector listening on http://${HOST}:${PORT}`));
}

main().catch(error => { console.error(error); process.exit(1); });
