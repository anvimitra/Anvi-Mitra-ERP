const { authenticate, requireRoles } = require('./auth');
const { hashPassword } = require('./security');

function registerStaffRoutes(app,pool){
  const admins=requireRoles('super_admin','principal','admin');
  app.get('/api/staff',authenticate,admins,async(req,res,next)=>{try{
    const r=await pool.query(`SELECT id,display_name AS "displayName",email,phone,role,branch_id AS "branchId",status,created_at AS "createdAt" FROM users WHERE school_id=$1 AND role IN ('principal','admin','teacher','accountant','office_staff','driver') ORDER BY display_name,email`,[req.auth.schoolId]);
    res.json({staff:r.rows});
  }catch(e){next(e)}});

  app.post('/api/staff',authenticate,admins,async(req,res,next)=>{try{
    const {name,email,phone,password,role='teacher',branchId=null}=req.body||{};
    const allowed=['principal','admin','teacher','accountant','office_staff','driver'];
    if(!String(name||'').trim()||!String(password||'').trim()||(!email&&!phone))return res.status(400).json({error:'name, password and email or phone are required'});
    if(!allowed.includes(String(role)))return res.status(400).json({error:'Invalid staff role'});
    if(branchId){const b=await pool.query(`SELECT 1 FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,[branchId,req.auth.schoolId]);if(!b.rows.length)return res.status(400).json({error:'Invalid branch'});}
    if(String(password).length<8)return res.status(400).json({error:'Password must be at least 8 characters'});
    const passwordHash=await hashPassword(String(password));
    const r=await pool.query(`INSERT INTO users(school_id,branch_id,display_name,email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id,display_name AS "displayName",email,phone,role,branch_id AS "branchId",status,created_at AS "createdAt"`,[req.auth.schoolId,branchId,String(name).trim(),email?String(email).trim().toLowerCase():null,phone?String(phone).trim():null,passwordHash,String(role)]);
    res.status(201).json({staff:r.rows[0]});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Email or phone already exists for this school'});next(e)}});

  app.patch('/api/staff/:id',authenticate,admins,async(req,res,next)=>{try{
    const fields={name:'display_name',email:'email',phone:'phone',role:'role',branchId:'branch_id',status:'status'};const sets=[];const vals=[];
    for(const [key,col] of Object.entries(fields))if(Object.prototype.hasOwnProperty.call(req.body||{},key)){if(key==='role'&&!['principal','admin','teacher','accountant','office_staff','driver'].includes(String(req.body[key])))return res.status(400).json({error:'Invalid staff role'});sets.push(`${col}=$${vals.length+1}`);vals.push(key==='email'?String(req.body[key]).trim().toLowerCase():req.body[key]);}
    if(req.body?.password){if(String(req.body.password).length<8)return res.status(400).json({error:'Password must be at least 8 characters'});sets.push(`password_hash=$${vals.length+1}`);vals.push(await hashPassword(String(req.body.password)));}
    if(req.body?.branchId){const b=await pool.query(`SELECT 1 FROM branches WHERE id=$1 AND school_id=$2 AND status='active'`,[req.body.branchId,req.auth.schoolId]);if(!b.rows.length)return res.status(400).json({error:'Invalid branch'});}
    if(!sets.length)return res.status(400).json({error:'No supported fields supplied'});vals.push(req.params.id,req.auth.schoolId);const r=await pool.query(`UPDATE users SET ${sets.join(',')} WHERE id=$${vals.length-1} AND school_id=$${vals.length} AND role IN ('principal','admin','teacher','accountant','office_staff','driver') RETURNING id,display_name AS "displayName",email,phone,role,branch_id AS "branchId",status,created_at AS "createdAt"`,vals);if(!r.rows.length)return res.status(404).json({error:'Staff member not found'});res.json({staff:r.rows[0]});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Email or phone already exists for this school'});next(e)}});
}
module.exports={registerStaffRoutes};
