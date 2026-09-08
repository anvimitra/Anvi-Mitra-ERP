const { authenticate, requireRoles } = require('./auth');

function requireSchool(req,res,next){if(!req.auth?.schoolId)return res.status(403).json({error:'School context required'});next();}
function requireConnectorAdmin(...roles){return requireRoles(...roles);}
function text(value,max=500){return String(value??'').trim().slice(0,max);}

async function deviceFor(client,auth,key){
  const deviceKey=text(key,200); if(!deviceKey)throw Object.assign(new Error('deviceKey is required'),{statusCode:400});
  const r=await client.query(`SELECT id,status,last_cursor FROM sync_devices WHERE school_id=$1 AND device_key=$2 LIMIT 1`,[auth.schoolId,deviceKey]);
  if(!r.rows.length)throw Object.assign(new Error('Sync device is not registered'),{statusCode:403});
  if(r.rows[0].status!=='active')throw Object.assign(new Error('Sync device is revoked'),{statusCode:403});
  return r.rows[0];
}

async function teacherMarkAccess(client,auth,payload){
  if(['super_admin','principal','admin'].includes(auth.role))return true;
  if(auth.role!=='teacher')return false;
  const r=await client.query(`SELECT 1 FROM teacher_class_subject_permissions
    WHERE school_id=$1 AND teacher_user_id=$2 AND class_id=$3 AND section_id=$4 AND subject_id=$5 AND session_id=$6
      AND can_view=true AND can_edit_marks=true AND ($7::uuid IS NULL OR branch_id=$7 OR branch_id IS NULL) LIMIT 1`,
    [auth.schoolId,auth.sub,payload.classId,payload.sectionId,payload.subjectId,payload.sessionId,auth.branchId||null]);
  return !!r.rowCount;
}

async function replayAttendance(client,auth,p){
  if(!p.studentId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(p.date||''))||!['present','absent','late','half_day','leave'].includes(p.status))throw Object.assign(new Error('attendance requires studentId, valid date and status'),{statusCode:400});
  const s=await client.query(`SELECT id,branch_id AS "branchId" FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,[p.studentId,auth.schoolId,auth.branchId||null]);
  if(!s.rowCount)throw Object.assign(new Error('Student not found in selected branch'),{statusCode:404});
  if(auth.role==='teacher'){
    const q=await client.query(`SELECT 1 FROM enrollments e JOIN teacher_subjects ts ON ts.section_id=e.section_id AND ts.session_id=e.session_id JOIN users u ON u.teacher_id=ts.teacher_id WHERE e.school_id=$1 AND e.student_id=$2 AND e.status='active' AND ($3::uuid IS NULL OR e.session_id=$3) AND u.id=$4 AND ($5::uuid IS NULL OR ts.branch_id=$5 OR ts.branch_id IS NULL) LIMIT 1`,[auth.schoolId,p.studentId,p.sessionId||null,auth.sub,auth.branchId||null]);
    if(!q.rowCount)throw Object.assign(new Error('Teacher is not assigned to this student section'),{statusCode:403});
  }
  const branchId=s.rows[0].branchId||auth.branchId||null;
  const r=await client.query(`INSERT INTO attendance_records(school_id,session_id,student_id,attendance_date,status,note,marked_by,branch_id)
    SELECT $1,asess.id,$2,$3,$4,$5,$6,$7 FROM academic_sessions asess WHERE asess.school_id=$1 AND ($8::uuid IS NULL OR asess.id=$8) AND (asess.is_current=true OR asess.id=$8) LIMIT 1
    ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE SET session_id=EXCLUDED.session_id,status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,branch_id=EXCLUDED.branch_id,updated_at=now()
    RETURNING id,student_id AS "studentId",attendance_date AS "date",status,note,session_id AS "sessionId",branch_id AS "branchId"`,[auth.schoolId,p.studentId,p.date,p.status,p.note||null,auth.sub,branchId,p.sessionId||null]);
  if(!r.rowCount)throw Object.assign(new Error('No matching academic session configured for this school'),{statusCode:409});
  return {entityType:'attendance',entityId:r.rows[0].id,payload:r.rows[0]};
}

async function replayExamMark(client,auth,p){
  const required=['examId','sessionId','classId','sectionId','studentId','subjectId'];
  if(required.some(k=>!p[k]))throw Object.assign(new Error('exam_mark requires examId, sessionId, classId, sectionId, studentId and subjectId'),{statusCode:400});
  const q=await client.query(`SELECT es.id AS "examSubjectId",es.subject_id AS "subjectId",es.max_marks AS "maxMarks",e.status AS "examStatus" FROM exam_subjects es JOIN exams e ON e.id=es.exam_id AND e.school_id=es.school_id WHERE es.school_id=$1 AND es.exam_id=$2 AND e.session_id=$3 AND es.class_id=$4 AND es.subject_id=$5 AND ($6::uuid IS NULL OR es.branch_id=$6 OR es.branch_id IS NULL) AND ($6::uuid IS NULL OR e.branch_id=$6 OR e.branch_id IS NULL) LIMIT 1`,[auth.schoolId,p.examId,p.sessionId,p.classId,p.subjectId,auth.branchId||null]);
  if(!q.rowCount)throw Object.assign(new Error('Exam subject not found'),{statusCode:404});
  const es=q.rows[0]; if(es.examStatus==='published')throw Object.assign(new Error('Published exam marks are locked'),{statusCode:409});
  if(!(await teacherMarkAccess(client,auth,p)))throw Object.assign(new Error('You are not permitted to edit marks for this class, section and subject'),{statusCode:403});
  const en=await client.query(`SELECT 1 FROM enrollments WHERE school_id=$1 AND student_id=$2 AND session_id=$3 AND class_id=$4 AND section_id=$5 AND status='active' AND ($6::uuid IS NULL OR branch_id=$6 OR branch_id IS NULL) LIMIT 1`,[auth.schoolId,p.studentId,p.sessionId,p.classId,p.sectionId,auth.branchId||null]);
  if(!en.rowCount)throw Object.assign(new Error('Student is not enrolled in the selected class/section/session'),{statusCode:400});
  let marks=null;if(p.marks!==null&&p.marks!==undefined&&p.marks!==''){marks=Number(p.marks);if(!Number.isFinite(marks)||marks<0||marks>Number(es.maxMarks))throw Object.assign(new Error(`Marks must be between 0 and ${es.maxMarks}`),{statusCode:400});}
  const r=await client.query(`INSERT INTO exam_marks(school_id,branch_id,exam_subject_id,student_id,marks,remarks,entered_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(exam_subject_id,student_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,marks=EXCLUDED.marks,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by,updated_at=now() RETURNING id,marks,remarks,entered_by AS "enteredBy",branch_id AS "branchId"`,[auth.schoolId,auth.branchId||null,es.examSubjectId,p.studentId,marks,text(p.remarks),auth.sub]);
  return {entityType:'exam_mark',entityId:r.rows[0].id,payload:{...r.rows[0],examSubjectId:es.examSubjectId,studentId:p.studentId}};
}

async function replayAdmission(client,auth,p){
  if(!p.sessionId||!p.studentName||!p.applicationNo)throw Object.assign(new Error('admission requires applicationNo, sessionId and studentName'),{statusCode:400});
  const r=await client.query(`INSERT INTO admission_applications(id,school_id,application_no,session_id,applied_class_id,student_name,date_of_birth,gender,father_name,mother_name,guardian_phone,address,previous_school,status,notes,created_by)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15)
    ON CONFLICT(school_id,application_no) DO UPDATE SET session_id=EXCLUDED.session_id,applied_class_id=EXCLUDED.applied_class_id,student_name=EXCLUDED.student_name,date_of_birth=EXCLUDED.date_of_birth,gender=EXCLUDED.gender,father_name=EXCLUDED.father_name,mother_name=EXCLUDED.mother_name,guardian_phone=EXCLUDED.guardian_phone,address=EXCLUDED.address,previous_school=EXCLUDED.previous_school,notes=EXCLUDED.notes,updated_at=now()
    RETURNING id,application_no AS "applicationNo",session_id AS "sessionId",applied_class_id AS "appliedClassId",student_name AS "studentName",status,updated_at AS "updatedAt"`,[p.id||null,auth.schoolId,text(p.applicationNo,60),p.sessionId,p.appliedClassId||null,text(p.studentName,200),p.dateOfBirth||null,text(p.gender,30),text(p.fatherName,200),text(p.motherName,200),text(p.guardianPhone,30),p.address||null,text(p.previousSchool,200),p.notes||null,auth.sub]);
  return {entityType:'admission',entityId:r.rows[0].id,payload:r.rows[0]};
}

async function replayEnrollment(client,auth,p){
  if(!p.studentId||!p.sessionId||!p.sectionId)throw Object.assign(new Error('enrollment requires studentId, sessionId and sectionId'),{statusCode:400});
  const s=await client.query(`SELECT id FROM students WHERE id=$1 AND school_id=$2 AND ($3::uuid IS NULL OR branch_id=$3 OR branch_id IS NULL)`,[p.studentId,auth.schoolId,auth.branchId||null]);if(!s.rowCount)throw Object.assign(new Error('Student not found in selected school/branch'),{statusCode:404});
  const sec=await client.query(`SELECT sec.id FROM sections sec JOIN classes c ON c.id=sec.class_id WHERE sec.id=$1 AND sec.school_id=$2 AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL)`,[p.sectionId,auth.schoolId,auth.branchId||null]);if(!sec.rowCount)throw Object.assign(new Error('Section not found in selected school/branch'),{statusCode:404});
  const r=await client.query(`INSERT INTO enrollments(id,school_id,student_id,session_id,section_id,roll_no,status) VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7) ON CONFLICT(student_id,session_id) DO UPDATE SET section_id=EXCLUDED.section_id,roll_no=EXCLUDED.roll_no,status=EXCLUDED.status RETURNING id,student_id AS "studentId",session_id AS "sessionId",section_id AS "sectionId",roll_no AS "rollNo",status`,[p.id||null,auth.schoolId,p.studentId,p.sessionId,p.sectionId,text(p.rollNo,40)||null,p.status||'active']);
  return {entityType:'enrollment',entityId:r.rows[0].id,payload:r.rows[0]};
}

async function replay(client,auth,item){
  const type=text(item.entityType||item.entity_type,100).toLowerCase();
  if(item.operation==='delete')throw Object.assign(new Error('Delete replay is disabled for transactional safety'),{statusCode:400});
  const p=item.payload&&typeof item.payload==='object'?item.payload:{};
  if(type==='attendance')return replayAttendance(client,auth,p);
  if(type==='exam_mark')return replayExamMark(client,auth,p);
  if(type==='admission')return replayAdmission(client,auth,p);
  if(type==='enrollment')return replayEnrollment(client,auth,p);
  throw Object.assign(new Error(`Unsupported sync entity: ${type||'unknown'}`),{statusCode:400});
}

function registerSyncRoutes(app,pool){
  app.post('/api/sync/device',authenticate,requireSchool,async(req,res,next)=>{try{const {deviceKey,deviceName=null,platform='unknown'}=req.body||{};if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});const r=await pool.query(`INSERT INTO sync_devices(school_id,device_key,device_name,platform,last_seen_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(school_id,device_key) DO UPDATE SET device_name=EXCLUDED.device_name,platform=EXCLUDED.platform,last_seen_at=now(),status='active' RETURNING id,school_id,device_key,device_name,platform,last_cursor,last_seen_at,status`,[req.auth.schoolId,text(deviceKey,200),text(deviceName,200)||null,text(platform,30)]);res.json({device:r.rows[0]})}catch(e){next(e)}});

  app.get('/api/sync/status',authenticate,requireSchool,async(req,res,next)=>{try{const [devices,changes,conflicts,latest]=await Promise.all([pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='active')::int AS active,MAX(last_seen_at) AS last_seen_at FROM sync_devices WHERE school_id=$1`,[req.auth.schoolId]),pool.query(`SELECT COUNT(*)::int AS count FROM sync_changes WHERE school_id=$1 AND changed_at>now()-interval '24 hours'`,[req.auth.schoolId]),pool.query(`SELECT COUNT(*)::int AS count FROM sync_conflicts WHERE school_id=$1 AND resolution='pending'`,[req.auth.schoolId]),pool.query(`SELECT MAX(changed_at) AS changed_at,MAX(cursor) AS cursor FROM sync_changes WHERE school_id=$1`,[req.auth.schoolId])]);res.json({deviceCount:devices.rows[0],changesLast24h:changes.rows[0].count,pendingConflicts:conflicts.rows[0].count,latestChange:latest.rows[0],onlineSourceOfTruth:'postgresql'})}catch(e){next(e)}});

  app.get('/api/sync/changes',authenticate,requireSchool,async(req,res,next)=>{try{const cursor=Math.max(0,Number(req.query.cursor||0));const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));const r=await pool.query(`SELECT cursor,entity_type,entity_id,operation,payload,changed_by,changed_at FROM sync_changes WHERE school_id=$1 AND cursor>$2 ORDER BY cursor ASC LIMIT $3`,[req.auth.schoolId,Number.isFinite(cursor)?cursor:0,limit]);const last=r.rows.length?Number(r.rows[r.rows.length-1].cursor):cursor;const key=text(req.query.deviceKey,200);if(key)await pool.query(`UPDATE sync_devices SET last_cursor=GREATEST(last_cursor,$1),last_seen_at=now() WHERE school_id=$2 AND device_key=$3`,[last,req.auth.schoolId,key]);res.json({cursor:last,changes:r.rows})}catch(e){next(e)}});

  app.post('/api/sync/push',authenticate,requireSchool,requireRoles('super_admin','principal','admin','teacher'),async(req,res,next)=>{const client=await pool.connect();try{const {deviceKey,changes=[]}=req.body||{};if(!deviceKey)return res.status(400).json({error:'deviceKey is required'});if(!Array.isArray(changes)||changes.length>200)return res.status(400).json({error:'changes must be an array with at most 200 items'});const d=await deviceFor(client,req.auth,deviceKey);await client.query('BEGIN');const accepted=[],conflicts=[],rejected=[];
    for(const item of changes){const clientId=text(item?.clientId,200)||null;const entityType=text(item?.entityType||item?.entity_type,100).toLowerCase();const operation=text(item?.operation,20).toLowerCase();const entityId=item?.entityId||item?.entity_id||null;const baseCursor=Math.max(0,Number(item?.baseCursor||0));if(!clientId||!entityType||!['create','update','delete'].includes(operation)){rejected.push({clientId,error:'clientId, entityType and valid operation are required'});continue;}
      if(entityId&&/^[0-9a-f-]{36}$/i.test(String(entityId))&&Number.isFinite(baseCursor)&&baseCursor>0){const newer=await client.query(`SELECT cursor,payload FROM sync_changes WHERE school_id=$1 AND entity_type=$2 AND entity_id=$3 AND cursor>$4 ORDER BY cursor DESC LIMIT 1`,[req.auth.schoolId,entityType,entityId,baseCursor]);if(newer.rowCount){const c=await client.query(`INSERT INTO sync_conflicts(school_id,device_id,entity_type,entity_id,local_payload,server_payload) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id`,[req.auth.schoolId,d.id,entityType,entityId,JSON.stringify(item.payload||{}),JSON.stringify(newer.rows[0].payload||{})]);conflicts.push({clientId,conflictId:c.rows[0].id,serverCursor:Number(newer.rows[0].cursor)});continue;}}
      try{const result=await replay(client,req.auth,item);const r=clientId?await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by,client_change_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT DO NOTHING RETURNING cursor`,[req.auth.schoolId,result.entityType,result.entityId,operation,JSON.stringify(result.payload||{}),req.auth.sub,clientId]):await client.query(`INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING cursor`,[req.auth.schoolId,result.entityType,result.entityId,operation,JSON.stringify(result.payload||{}),req.auth.sub]);if(!r.rowCount&&clientId){const existing=await client.query(`SELECT cursor FROM sync_changes WHERE school_id=$1 AND client_change_id=$2`,[req.auth.schoolId,clientId]);if(existing.rowCount)accepted.push({clientId,entityType,resultEntityId:result.entityId,cursor:Number(existing.rows[0].cursor),payload:result.payload});else rejected.push({clientId,entityType,error:'Could not record synchronized change'});}else if(r.rowCount)accepted.push({clientId,entityType,entityId:result.entityId,cursor:Number(r.rows[0].cursor),payload:result.payload});}catch(e){rejected.push({clientId,entityType,error:e.message||'Replay failed',statusCode:e.statusCode||500});}}
    await client.query(`UPDATE sync_devices SET last_seen_at=now() WHERE id=$1`,[d.id]);await client.query('COMMIT');const latest=await client.query(`SELECT COALESCE(MAX(cursor),0)::bigint AS cursor FROM sync_changes WHERE school_id=$1`,[req.auth.schoolId]);res.json({accepted,conflicts,rejected,cursor:Number(latest.rows[0].cursor)});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}});

  app.get('/api/sync/conflicts',authenticate,requireSchool,async(req,res,next)=>{try{const status=text(req.query.status||'pending',20).toLowerCase();if(!['pending','server_wins','local_wins','merged'].includes(status))return res.status(400).json({error:'Invalid conflict status'});const limit=Math.min(200,Math.max(1,Number(req.query.limit||50)));const r=await pool.query(`SELECT id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at FROM sync_conflicts WHERE school_id=$1 AND resolution=$2 ORDER BY created_at DESC LIMIT $3`,[req.auth.schoolId,status,limit]);res.json({conflicts:r.rows})}catch(e){next(e)}});
  app.patch('/api/sync/conflicts/:id',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const resolution=text(req.body?.resolution,20).toLowerCase();if(!['server_wins','local_wins','merged'].includes(resolution))return res.status(400).json({error:'Resolution must be server_wins, local_wins or merged'});const r=await pool.query(`UPDATE sync_conflicts SET resolution=$1,resolved_at=now() WHERE id=$2 AND school_id=$3 RETURNING id,device_id,entity_type,entity_id,local_payload,server_payload,resolution,created_at,resolved_at`,[resolution,req.params.id,req.auth.schoolId]);if(!r.rowCount)return res.status(404).json({error:'Conflict not found'});res.json({conflict:r.rows[0]})}catch(e){next(e)}});
  app.get('/api/sync/devices',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const r=await pool.query(`SELECT id,device_key,device_name,platform,last_cursor,last_seen_at,status,created_at FROM sync_devices WHERE school_id=$1 ORDER BY last_seen_at DESC NULLS LAST`,[req.auth.schoolId]);res.json({devices:r.rows})}catch(e){next(e)}});
  app.patch('/api/sync/devices/:id/revoke',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const r=await pool.query(`UPDATE sync_devices SET status='revoked' WHERE id=$1 AND school_id=$2 RETURNING id,device_key,device_name,platform,status`,[req.params.id,req.auth.schoolId]);if(!r.rowCount)return res.status(404).json({error:'Sync device not found'});res.json({device:r.rows[0]})}catch(e){next(e)}});
  app.get('/api/sync/local-connectors',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const r=await pool.query(`SELECT id,connector_type,display_name,enabled,permission_mode,selected_path,last_sync_at,last_error,created_at,updated_at FROM local_storage_connectors WHERE school_id=$1 ORDER BY created_at DESC`,[req.auth.schoolId]);res.json({connectors:r.rows})}catch(e){next(e)}});
  app.post('/api/sync/local-connectors',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const {deviceId=null,connectorType='desktop_folder',displayName,permissionMode='read_write',selectedPath=null}=req.body||{};if(!displayName)return res.status(400).json({error:'displayName is required'});if(!['desktop_folder','nas_folder','external_drive'].includes(connectorType))return res.status(400).json({error:'Invalid connector type'});if(!['read_only','read_write'].includes(permissionMode))return res.status(400).json({error:'Invalid permission mode'});if(deviceId){const d=await pool.query(`SELECT id FROM sync_devices WHERE id=$1 AND school_id=$2 AND status='active'`,[deviceId,req.auth.schoolId]);if(!d.rowCount)return res.status(400).json({error:'Device is not registered for this school'});}const r=await pool.query(`INSERT INTO local_storage_connectors(school_id,device_id,connector_type,display_name,permission_mode,selected_path) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.auth.schoolId,deviceId,connectorType,text(displayName,200),permissionMode,selectedPath||null]);res.status(201).json({connector:r.rows[0]})}catch(e){next(e)}});
  app.patch('/api/sync/local-connectors/:id',authenticate,requireSchool,requireConnectorAdmin('super_admin','principal','admin'),async(req,res,next)=>{try{const map={displayName:'display_name',enabled:'enabled',permissionMode:'permission_mode',selectedPath:'selected_path'};const sets=[],vals=[];for(const[k,col]of Object.entries(map))if(Object.prototype.hasOwnProperty.call(req.body||{},k)){sets.push(`${col}=$${vals.length+1}`);vals.push(req.body[k]);}if(req.body?.permissionMode&&!['read_only','read_write'].includes(req.body.permissionMode))return res.status(400).json({error:'Invalid permission mode'});if(!sets.length)return res.status(400).json({error:'No supported fields supplied'});vals.push(req.params.id,req.auth.schoolId);const r=await pool.query(`UPDATE local_storage_connectors SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length-1} AND school_id=$${vals.length} RETURNING *`,vals);if(!r.rowCount)return res.status(404).json({error:'Connector not found'});res.json({connector:r.rows[0]})}catch(e){next(e)}});
}
module.exports={registerSyncRoutes};
