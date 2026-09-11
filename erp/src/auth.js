const { hashPassword, verifyPassword, signAccessToken, verifyAccessToken } = require('./security');
function normalizeLogin(value) { return String(value || '').trim().toLowerCase(); }

async function resolveBranch(pool, schoolId, requestedBranchId, userBranchId, role) {
  const branchId = requestedBranchId || userBranchId || null;
  if (!branchId) return null;
  if (!schoolId) throw Object.assign(new Error('School context is required for branch access'), { statusCode: 400 });
  const { rows } = await pool.query("SELECT id FROM branches WHERE id=$1 AND school_id=$2 AND status='active'", [branchId, schoolId]);
  if (!rows.length) throw Object.assign(new Error('Branch not found'), { statusCode: 400 });
  const schoolWide = ['super_admin','principal','admin'].includes(role);
  if (!schoolWide && userBranchId && userBranchId !== branchId) throw Object.assign(new Error('User is not assigned to this branch'), { statusCode: 403 });
  if (!schoolWide && !userBranchId) throw Object.assign(new Error('User has no branch assignment'), { statusCode: 403 });
  return branchId;
}

function registerAuthRoutes(app, pool) {
  app.post('/api/auth/login', async (req,res,next)=>{
    try {
      if(!pool) return res.status(503).json({error:'Database is not configured'});
      const {login,password,schoolCode=null,branchId=null}=req.body||{};
      if(!login||!password) return res.status(400).json({error:'login and password are required'});
      const result=await pool.query(
        `SELECT u.id,u.school_id,u.branch_id,u.password_hash,u.role,u.status,
                s.name school_name,s.code school_code
         FROM users u
         LEFT JOIN schools s ON s.id=u.school_id
         WHERE (lower(u.email)=lower($1) OR u.phone=$1)
           AND (u.role='super_admin' OR ($2 IS NOT NULL AND s.code=$2))
         LIMIT 1`,
        [normalizeLogin(login), schoolCode ? String(schoolCode).trim() : null]
      );
      const user=result.rows[0];
      if(!user||user.status!=='active'||!(await verifyPassword(password,user.password_hash))) return res.status(401).json({error:'Invalid login credentials'});
      const effectiveBranchId = await resolveBranch(pool,user.school_id,branchId,user.branch_id,user.role);
      await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
      const token=signAccessToken({sub:user.id,schoolId:user.school_id || null,branchId:effectiveBranchId,role:user.role});
      if (user.school_id) await pool.query('INSERT INTO audit_logs (school_id,user_id,action,entity_type) VALUES ($1,$2,$3,$4)',[user.school_id,user.id,'login','user']);
      res.json({accessToken:token,user:{id:user.id,schoolId:user.school_id || null,schoolName:user.school_name || 'Platform',branchId:effectiveBranchId,role:user.role}})
    }catch(err){next(err)}
  });

  app.post('/api/auth/switch-branch', authenticate, async (req,res,next)=>{
    try {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'branchId')) return res.status(400).json({error:'branchId is required'});
      const branchId = req.body.branchId || null;
      const schoolWide = ['super_admin','principal','admin'].includes(req.auth.role);
      if (!branchId) {
        if (!schoolWide) return res.status(403).json({error:'Only school-wide administrators can switch to school level'});
        const token=signAccessToken({sub:req.auth.sub,schoolId:req.auth.schoolId,branchId:null,role:req.auth.role});
        return res.json({accessToken:token,branchId:null});
      }
      const effectiveBranchId = await resolveBranch(pool,req.auth.schoolId,branchId,null,req.auth.role);
      const token=signAccessToken({sub:req.auth.sub,schoolId:req.auth.schoolId,branchId:effectiveBranchId,role:req.auth.role});
      res.json({accessToken:token,branchId:effectiveBranchId});
    } catch(err){next(err)}
  });

  app.post('/api/auth/hash-password',async(req,res,next)=>{try{if(process.env.NODE_ENV==='production')return res.status(404).end();res.json({hash:await hashPassword(req.body?.password)})}catch(err){next(err)}});
}

function authenticate(req,res,next){try{const header=req.get('authorization')||'';if(!header.startsWith('Bearer '))return res.status(401).json({error:'Authentication required'});req.auth=verifyAccessToken(header.slice(7));next()}catch(_err){return res.status(401).json({error:'Invalid or expired token'})}}
function requireRoles(...roles){return(req,res,next)=>roles.includes(req.auth?.role)?next():res.status(403).json({error:'Insufficient permissions'})}
module.exports={registerAuthRoutes,authenticate,requireRoles};
