const { authenticate, requireRoles } = require('./auth');

function registerNotificationRoutes(app, pool) {
  const admins=['super_admin','principal','admin'];

  app.get('/api/notifications/me', authenticate, async (req,res,next)=>{
    try {
      const limit=Math.min(Math.max(Number(req.query?.limit)||50,1),200);
      const {rows}=await pool.query(
        `SELECT n.id,n.event_type AS "eventType",n.title,n.message,n.action_payload AS "actionPayload",
                n.read_at AS "readAt",n.created_at AS "createdAt",n.expires_at AS "expiresAt"
         FROM notifications n
         WHERE n.school_id=$1 AND (n.expires_at IS NULL OR n.expires_at>now())
           AND (n.recipient_user_id=$2
                OR (n.recipient_user_id IS NULL AND (n.recipient_role IS NULL OR n.recipient_role=$3)
                    AND n.class_id IS NULL AND n.section_id IS NULL)
                OR (n.recipient_user_id IS NULL AND (n.class_id IS NOT NULL OR n.section_id IS NOT NULL)
                    AND (
                      EXISTS (
                        SELECT 1 FROM enrollments en
                        JOIN students st ON st.id=en.student_id AND st.school_id=en.school_id
                        WHERE en.school_id=n.school_id AND en.status='active'
                          AND en.session_id IS NOT NULL
                          AND (n.class_id IS NULL OR EXISTS (SELECT 1 FROM sections sx WHERE sx.id=en.section_id AND sx.class_id=n.class_id))
                          AND (n.section_id IS NULL OR en.section_id=n.section_id)
                          AND (EXISTS (
                            SELECT 1 FROM student_portal_profiles spp
                            WHERE spp.school_id=st.school_id AND spp.student_id=st.id AND spp.user_id=$2 AND spp.status='active'
                          ))
                      )
                      OR EXISTS (
                        SELECT 1 FROM teacher_subjects ts
                        JOIN teachers tt ON tt.id=ts.teacher_id AND tt.school_id=ts.school_id
                        WHERE ts.school_id=n.school_id AND tt.user_id=$2 AND ts.status='active'
                          AND (n.section_id IS NULL OR ts.section_id=n.section_id)
                          AND (n.class_id IS NULL OR EXISTS (SELECT 1 FROM sections sx WHERE sx.id=ts.section_id AND sx.class_id=n.class_id))
                      )
                    )))
         ORDER BY n.created_at DESC LIMIT $4`,
        [req.auth.schoolId,req.auth.sub,req.auth.role,limit]);
      res.json({notifications:rows});
    } catch(err){next(err)}
  });

  app.post('/api/notifications/:id/read', authenticate, async (req,res,next)=>{
    try {
      const {rows}=await pool.query(
        `UPDATE notifications n SET read_at=COALESCE(read_at,now())
         WHERE n.id=$1 AND n.school_id=$2 AND
           (n.recipient_user_id=$3 OR (n.recipient_user_id IS NULL AND (n.recipient_role IS NULL OR n.recipient_role=$4)))
         RETURNING n.id,n.read_at AS "readAt"`,
        [req.params.id,req.auth.schoolId,req.auth.sub,req.auth.role]);
      if(!rows.length)return res.status(404).json({error:'Notification not found'});
      res.json({notification:rows[0]});
    }catch(err){next(err)}
  });

  app.get('/api/notifications/unread-count', authenticate, async (req,res,next)=>{
    try {
      const {rows}=await pool.query(
        `SELECT COUNT(*)::int AS count FROM notifications n
         WHERE n.school_id=$1 AND n.read_at IS NULL AND (n.expires_at IS NULL OR n.expires_at>now())
           AND (n.recipient_user_id=$2
                OR (n.recipient_user_id IS NULL AND (n.recipient_role IS NULL OR n.recipient_role=$3)
                    AND n.class_id IS NULL AND n.section_id IS NULL)
                OR (n.recipient_user_id IS NULL AND (n.class_id IS NOT NULL OR n.section_id IS NOT NULL)
                    AND (
                      EXISTS (
                        SELECT 1 FROM enrollments en
                        JOIN students st ON st.id=en.student_id AND st.school_id=en.school_id
                        WHERE en.school_id=n.school_id AND en.status='active'
                          AND en.session_id IS NOT NULL
                          AND (n.class_id IS NULL OR EXISTS (SELECT 1 FROM sections sx WHERE sx.id=en.section_id AND sx.class_id=n.class_id))
                          AND (n.section_id IS NULL OR en.section_id=n.section_id)
                          AND (st.user_id=$2 OR EXISTS (
                            SELECT 1 FROM student_portal_profiles spp
                            WHERE spp.school_id=st.school_id AND spp.student_id=st.id AND spp.user_id=$2 AND spp.status='active'
                          ))
                      )
                      OR EXISTS (
                        SELECT 1 FROM teacher_subjects ts
                        JOIN teachers tt ON tt.id=ts.teacher_id AND tt.school_id=ts.school_id
                        WHERE ts.school_id=n.school_id AND tt.user_id=$2 AND ts.status='active'
                          AND (n.section_id IS NULL OR ts.section_id=n.section_id)
                          AND (n.class_id IS NULL OR EXISTS (SELECT 1 FROM sections sx WHERE sx.id=ts.section_id AND sx.class_id=n.class_id))
                      )
                    )))`,
        [req.auth.schoolId,req.auth.sub,req.auth.role]);
      res.json({count:rows[0].count});
    }catch(err){next(err)}
  });

  app.get('/api/notifications/preferences', authenticate, async (req,res,next)=>{
    try {
      const {rows}=await pool.query(`SELECT event_type AS "eventType",in_app AS "inApp",push,email FROM notification_preferences WHERE school_id=$1 AND user_id=$2 ORDER BY event_type`,[req.auth.schoolId,req.auth.sub]);
      res.json({preferences:rows});
    }catch(err){next(err)}
  });

  app.put('/api/notifications/preferences', authenticate, async (req,res,next)=>{
    const client=await pool.connect();
    try {
      const items=Array.isArray(req.body?.preferences)?req.body.preferences:[];
      if(items.length>100)return res.status(400).json({error:'Too many preferences'});
      await client.query('BEGIN');
      for(const p of items){
        const eventType=String(p.eventType||'').trim(); if(!eventType)continue;
        await client.query(`INSERT INTO notification_preferences(school_id,user_id,event_type,in_app,push,email) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,user_id,event_type) DO UPDATE SET in_app=EXCLUDED.in_app,push=EXCLUDED.push,email=EXCLUDED.email,updated_at=now()`,[req.auth.schoolId,req.auth.sub,eventType,p.inApp!==false,p.push!==false,p.email===true]);
      }
      await client.query('COMMIT');
      const {rows}=await pool.query(`SELECT event_type AS "eventType",in_app AS "inApp",push,email FROM notification_preferences WHERE school_id=$1 AND user_id=$2 ORDER BY event_type`,[req.auth.schoolId,req.auth.sub]);
      res.json({preferences:rows});
    }catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}finally{client.release()}
  });

  app.post('/api/notifications', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const b=req.body||{}; const title=String(b.title||'').trim(); const message=String(b.message||'').trim();
      if(!title||!message)return res.status(400).json({error:'title and message are required'});
      const recipientUserId=b.recipientUserId||null, recipientRole=b.recipientRole?String(b.recipientRole).trim().toLowerCase():null;
      if(!recipientUserId&&!recipientRole&&!b.classId&&!b.sectionId)return res.status(400).json({error:'Provide a recipient user, role, class or section'});
      const {rows}=await pool.query(`INSERT INTO notifications(school_id,branch_id,recipient_user_id,recipient_role,class_id,section_id,event_type,title,message,action_payload,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,event_type AS "eventType",title,message,action_payload AS "actionPayload",created_at AS "createdAt",expires_at AS "expiresAt"`,[req.auth.schoolId,req.auth.branchId||null,recipientUserId,recipientRole,b.classId||null,b.sectionId||null,String(b.eventType||'announcement'),title,message,JSON.stringify(b.actionPayload&&typeof b.actionPayload==='object'?b.actionPayload:{}),b.expiresAt||null]);
      res.status(201).json({notification:rows[0]});
    }catch(err){next(err)}
  });
}
module.exports={registerNotificationRoutes};