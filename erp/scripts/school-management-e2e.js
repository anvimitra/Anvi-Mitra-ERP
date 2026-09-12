const { spawn } = require('child_process');
const { Client } = require('pg');
const { hashPassword } = require('../src/security');

const base = process.env.ERP_BASE_URL || 'http://127.0.0.1:4183';
const db = process.env.DATABASE_URL;
if (!db) throw new Error('DATABASE_URL is required');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { response, data };
}

async function waitForHealth() {
  let last;
  for (let i = 0; i < 30; i += 1) {
    try {
      const { response, data } = await fetchJson('/api/health');
      if (response.ok && data.ok && data.database === 'ok') return data;
      last = new Error('Health returned: ' + JSON.stringify(data));
    } catch (error) { last = error; }
    await sleep(500);
  }
  throw last || new Error('ERP API did not become healthy');
}

async function main() {
  const client = new Client({ connectionString: db });
  await client.connect();
  const stamp = Date.now();
  const seedCode = 'E2E-' + stamp;
  const seedEmail = 'superadmin+' + stamp + '@example.test';
  const seedPassword = 'E2E-' + stamp + '-Pass!';
  const createdAdminEmail = 'admin+' + stamp + '@example.test';
  const createdAdminPassword = 'School-12345!';
  let child;
  let createdId;

  try {
    const school = await client.query(
      "INSERT INTO schools(name,code,status) VALUES($1,$2,'active') RETURNING id",
      ['E2E Platform School', seedCode],
    );
    const schoolId = school.rows[0].id;
    const branch = await client.query(
      "INSERT INTO branches(school_id,name,code,is_main) VALUES($1,'Main Branch',$2,true) RETURNING id",
      [schoolId, 'MAIN'],
    );
    await client.query(
      "INSERT INTO school_settings(school_id,display_name,timezone,currency_code,locale,date_format) VALUES($1,'E2E Platform School','Asia/Kolkata','INR','en-IN','DD-MM-YYYY')",
      [schoolId],
    );
    await client.query(
      "INSERT INTO mobile_app_configs(school_id,app_name,app_slug) VALUES($1,'E2E Platform School','e2e-platform-school')",
      [schoolId],
    );
    await client.query(
      "INSERT INTO users(school_id,branch_id,email,password_hash,role,status) VALUES($1,$2,$3,$4,'super_admin','active')",
      [schoolId, branch.rows[0].id, seedEmail, await hashPassword(seedPassword)],
    );

    child = spawn(process.execPath, ['src/server.js'], {
      cwd: require('path').resolve(__dirname, '..'),
      env: { ...process.env, PORT: '4183', NODE_ENV: 'test', DATABASE_URL: db, JWT_SECRET: process.env.JWT_SECRET || 'e2e-test-secret-at-least-32-characters-long' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForHealth();

    const login = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({schoolCode:seedCode,login:seedEmail,password:seedPassword}),
    });
    if (!login.response.ok || !login.data.accessToken) throw new Error('Super Admin login failed: ' + JSON.stringify(login.data));
    const auth = {Authorization:'Bearer ' + login.data.accessToken, 'Content-Type':'application/json'};

    const createdCode = 'E2E-' + stamp + '-NEW';
    const create = await fetchJson('/api/platform/schools', {
      method:'POST',
      headers:auth,
      body: JSON.stringify({
        name:'E2E New School',
        code:createdCode,
        displayName:'E2E New School',
        appName:'E2E New School',
        appSlug:'e2e-new-' + stamp,
        adminEmail:createdAdminEmail,
        adminPassword:createdAdminPassword,
        mainBranchName:'Main Campus',
        mainBranchCode:'MAIN',
        timezone:'Asia/Kolkata',
        currencyCode:'INR',
        locale:'en-IN'
      }),
    });
    if (create.response.status !== 201 || !create.data.school?.id || !create.data.admin?.id) {
      throw new Error('School create E2E failed: HTTP ' + create.response.status + ' ' + JSON.stringify(create.data));
    }

    createdId = create.data.school.id;
    const createdBranchId = create.data.admin.branchId;
    const detail = await fetchJson('/api/platform/schools/' + createdId, {headers:auth});
    if (!detail.response.ok || detail.data.school?.code !== createdCode || !detail.data.branches?.length) throw new Error('School detail/branch E2E failed');

    const edit = await fetchJson('/api/platform/schools/' + createdId, {
      method:'PATCH',
      headers:auth,
      body:JSON.stringify({displayName:'E2E New School Updated',primaryColor:'#123456'})
    });
    if (!edit.response.ok) throw new Error('School edit E2E failed: ' + JSON.stringify(edit.data));

    const branding = await fetchJson('/api/platform/schools/' + createdId + '/branding', {
      method:'PATCH',
      headers:auth,
      body:JSON.stringify({logoUrl:'https://example.test/logo.svg',secondaryColor:'#654321'})
    });
    if (!branding.response.ok) throw new Error('School branding E2E failed: ' + JSON.stringify(branding.data));

    const deactivate = await fetchJson('/api/platform/schools/' + createdId, {
      method:'PATCH',
      headers:auth,
      body:JSON.stringify({status:'inactive'})
    });
    if (!deactivate.response.ok) throw new Error('School deactivate E2E failed: ' + JSON.stringify(deactivate.data));

    const publicConfig = await fetchJson('/api/public/school-config?schoolCode=' + encodeURIComponent(createdCode));
    if (publicConfig.response.status !== 404) throw new Error('Inactive school leaked through public config: HTTP ' + publicConfig.response.status);

    const reactivate = await fetchJson('/api/platform/schools/' + createdId, {
      method:'PATCH',
      headers:auth,
      body:JSON.stringify({status:'active'})
    });
    if (!reactivate.response.ok) throw new Error('School reactivate E2E failed: ' + JSON.stringify(reactivate.data));

    const activeConfig = await fetchJson('/api/public/school-config?schoolCode=' + encodeURIComponent(createdCode));
    if (!activeConfig.response.ok || activeConfig.data.school?.code !== createdCode) throw new Error('Active public school config E2E failed');

    const adminLogin = await fetchJson('/api/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({schoolCode:createdCode,login:createdAdminEmail,password:createdAdminPassword})
    });
    if (!adminLogin.response.ok || adminLogin.data.user?.role !== 'admin' || !adminLogin.data.accessToken) {
      throw new Error('Provisioned school administrator login failed: ' + JSON.stringify(adminLogin.data));
    }

    const adminBranchSwitch = await fetchJson('/api/auth/switch-branch', {
      method:'POST',
      headers:{Authorization:'Bearer '+adminLogin.data.accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({branchId:createdBranchId})
    });
    if (!adminBranchSwitch.response.ok || !adminBranchSwitch.data.accessToken || String(adminBranchSwitch.data.branchId) !== String(createdBranchId)) {
      throw new Error('Provisioned administrator branch scope failed: ' + JSON.stringify(adminBranchSwitch.data));
    }

    const list = await fetchJson('/api/platform/schools', {headers:auth});
    if (!list.response.ok || !Array.isArray(list.data.schools)) throw new Error('School list E2E failed');

    console.log('Authenticated Super Admin create -> edit -> branding -> deactivate/reactivate -> provisioned admin login -> branch scope E2E: PASS');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await sleep(300);
      if (!child.killed) child.kill('SIGKILL');
    }
    if (createdId) await client.query("UPDATE schools SET status='inactive' WHERE id=$1", [createdId]).catch(() => {});
    await client.query("UPDATE schools SET status='inactive' WHERE code=$1", [seedCode]).catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
