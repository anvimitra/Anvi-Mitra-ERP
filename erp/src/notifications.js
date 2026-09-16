const { authenticate, requireRoles } = require('./auth');

function registerNotificationRoutes(app, pool) {
  const admins=['super_admin','principal','admin'];

  app.get('/api/notifications/me', authenticate, async (req,res,next)=>{
    try {
      const limit=Math.min(Math.max(Number(req.query?.limit)||50,1),200);
      const {rows}=await pool.query(
        `SELECT id,event_type AS "eventType",title,message,action_payload AS "actionPayload",read_at AS "readAt",created_at AS "createdAt"
         FROM notifications WHERE school_id=$1 AND (recipient_user_id=$2 OR (recipient_user_id IS NULL AND (recipient_role IS NULL OR recipient_role=$3)))
         ORDER BY created_at DESC LIMIT $4`,[req.auth.schoolId,req.auth.sub,req.auth.role,limit]);
      res.json({notifications:rows});
    } catch(err){next(err)}
  });

  app.post('/api/notifications/:id/read', authenticate, async (req,res,next)=>{
    try {
      const {rows}=await pool.query(
        `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND school_id=$2 AND (recipient_user_id=$3 OR (recipient_user_id IS NULL AND (recipient_role IS NULL OR recipient_role=$4))) RETURNING id,read_at AS "readAt"`,
        [req.params.id,req.auth.schoolId,req.auth.sub,req.auth.role]);
      if(!rows.length)return res.status(404).json({error:'Notification not found'});
      res.json({notification:rows[0]});
    }catch(err){next(err)}
  });

  app.get('/api/notifications/unread-count', authenticate, async (req,res,next)=>{
    try {
      const {rows}=await pool.query(
        `SELECT COUNT(*)::int AS count FROM notifications WHERE school_id=$1 AND read_at IS NULL AND (recipient_user_id=$2 OR (recipient_user_id IS NULL AND (recipient_role IS NULL OR recipient_role=$3)))`,
        [req.auth.schoolId,req.auth.sub,req.auth.role]);
      res.json({count:rows[0].count});
    }catch(err){next(err)}
  });

  app.post('/api/notifications', authenticate, requireRoles(...admins), async (req,res,next)=>{
    try {
      const b=req.body||{}; const title=String(b.title||'').trim(); const message=String(b.message||'').trim();
      if(!title||!message)return res.status(400).json({error:'title and message are required'});
      const recipientUserId=b.recipientUserId||null, recipientRole=b.recipientRole?String(b.recipientRole).trim().toLowerCase():null;
      if(!recipientUserId&&!recipientRole&&!b.classId&&!b.sectionId)return res.status(400).json({error:'Provide a recipient user, role, class or section'});
      const {rows}=await pool.query(
        `INSERT INTO notifications(school_id,branch_id,recipient_user_id,recipient_role,class_id,section_id,event_type,title,message,action_payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,event_type AS "eventType",title,message,action_payload AS "actionPayload",created_at AS "createdAt"`,
        [req.auth.schoolId,req.auth.branchId||null,recipientUserId,recipientRole,b.classId||null,b.sectionId||null,String(b.eventType||'announcement'),title,message,JSON.stringify(b.actionPayload&&typeof b.actionPayload==='object'?b.actionPayload:{})]);
      res.status(201).json({notification:rows[0]});
    }catch(err){next(err)}
  });
}
module.exports={registerNotificationRoutes};
