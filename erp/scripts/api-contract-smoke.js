const { spawn } = require('child_process');

const base = process.env.ERP_BASE_URL || 'http://127.0.0.1:4173';
const db = process.env.DATABASE_URL;
if (!db) throw new Error('DATABASE_URL is required');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForHealth() {
  let last;
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(base + '/api/health');
      const data = await response.json();
      if (response.ok && data.ok && data.database === 'ok') return data;
      last = new Error('Health returned: ' + JSON.stringify(data));
    } catch (error) { last = error; }
    await sleep(500);
  }
  throw last || new Error('ERP API did not become healthy');
}

async function main() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: require('path').resolve(__dirname, '..'),
    env: { ...process.env, PORT: '4173', NODE_ENV: 'test', DATABASE_URL: db },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data.toString(); });
  child.stderr.on('data', data => { logs += data.toString(); });
  try {
    const health = await waitForHealth();
    if (health.product !== 'Anvi Mitra ERP') throw new Error('Unexpected product in health response');

    const page = await fetch(base + '/super-admin/schools');
    if (!page.ok) throw new Error('Super Admin school page failed: HTTP ' + page.status);
    const html = await page.text();
    if (!html.includes('School') || !html.includes('<html')) throw new Error('Super Admin school page content contract failed');

    const protectedResponse = await fetch(base + '/api/platform/schools');
    if (protectedResponse.status !== 401) throw new Error('Protected school API should reject unauthenticated access; got HTTP ' + protectedResponse.status);

    console.log('ERP API contract smoke test: PASS');
    console.log('Health:', JSON.stringify(health));
    console.log('Super Admin page: HTTP', page.status);
    console.log('Protected school API: HTTP', protectedResponse.status);
  } finally {
    child.kill('SIGTERM');
    await sleep(250);
    if (!child.killed) child.kill('SIGKILL');
    if (logs.trim()) console.log(logs.trim());
  }
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
