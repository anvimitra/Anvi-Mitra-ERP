const admin = require('firebase-admin');

const firebaseApps = new Map();
let schoolFirebaseConfig = null;

function loadSchoolFirebaseConfig() {
  if (schoolFirebaseConfig !== null) return schoolFirebaseConfig;
  const raw = process.env.FIREBASE_SCHOOL_CONFIG_JSON;
  if (!raw) {
    schoolFirebaseConfig = {};
    return schoolFirebaseConfig;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('FIREBASE_SCHOOL_CONFIG_JSON must be an object keyed by school_id');
    }
    schoolFirebaseConfig = parsed;
  } catch (err) {
    console.error('[push-worker] invalid FIREBASE_SCHOOL_CONFIG_JSON:', err.message || err);
    schoolFirebaseConfig = {};
  }
  return schoolFirebaseConfig;
}

function firebaseAppName(schoolId) {
  return `school-${String(schoolId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function getFirebaseApp(schoolId) {
  const configs = loadSchoolFirebaseConfig();
  const schoolConfig = configs[String(schoolId)];

  if (schoolConfig?.projectId && schoolConfig?.clientEmail && schoolConfig?.privateKey) {
    const name = firebaseAppName(schoolId);
    if (firebaseApps.has(name)) return firebaseApps.get(name);
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: schoolConfig.projectId,
        clientEmail: schoolConfig.clientEmail,
        privateKey: schoolConfig.privateKey.replace(/\\n/g, '\n'),
      }),
    }, name);
    firebaseApps.set(name, app);
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;

  const name = 'default';
  if (firebaseApps.has(name)) return firebaseApps.get(name);
  const app = admin.apps.find((candidate) => candidate.name === '[DEFAULT]') || admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
  firebaseApps.set(name, app);
  return app;
}

async function processPushQueue(pool, batchSize=20) {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const { rows }=await client.query(`SELECT q.id,q.school_id AS "schoolId",q.device_token_id AS "deviceTokenId",q.title,q.message,q.data_json AS "data",d.token FROM parent_push_queue q JOIN parent_device_tokens d ON d.id=q.device_token_id WHERE q.status='pending' AND d.is_active=true ORDER BY q.queued_at FOR UPDATE OF q SKIP LOCKED LIMIT $1`,[batchSize]);
    for(const row of rows){
      await client.query(`UPDATE parent_push_queue SET status='processing',attempts=attempts+1 WHERE id=$1`,[row.id]);
    }
    await client.query('COMMIT');
    for(const row of rows){
      try{
        const app = getFirebaseApp(row.schoolId);
        if (!app) {
          await pool.query(`UPDATE parent_push_queue SET status='pending',last_error=$2 WHERE id=$1`,[row.id,'firebase-not-configured']);
          continue;
        }
        const response=await admin.messaging(app).send({token:row.token,notification:{title:row.title,body:row.message},data:Object.fromEntries(Object.entries(row.data||{}).map(([k,v])=>[k,String(v??'')]))});
        await pool.query(`UPDATE parent_push_queue SET status='sent',provider_message_id=$2,sent_at=now(),last_error=NULL WHERE id=$1`,[row.id,response]);
      }catch(err){
        const terminal = row.attempts >= 5;
        await pool.query(`UPDATE parent_push_queue SET status=$2,last_error=$3 WHERE id=$1`,[row.id,terminal?'failed':'pending',String(err.message||err).slice(0,1000)]);
      }
    }
    return { processed:rows.length };
  }catch(err){ await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

function startPushWorker(pool){
  const intervalMs=Number(process.env.PUSH_WORKER_INTERVAL_MS||30000);
  let running=false;
  const tick=async()=>{ if(running)return; running=true; try{await processPushQueue(pool);}catch(err){console.error('[push-worker]',err.message||err)}finally{running=false} };
  setInterval(tick,intervalMs);
  tick();
}

module.exports={startPushWorker,processPushQueue};
