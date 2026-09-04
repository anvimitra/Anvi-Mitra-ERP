const { authenticate, requireRoles } = require('./auth');

function registerStudentCrudRoutes(app,pool){
 const staff=['super_admin','principal','admin','office_staff'];
 const finance=['super_admin','principal','admin','accountant','office_staff'];
 const scope=(req,alias='s')=> req.auth.branchId ? ` AND (${alias}.branch_id=$2 OR ${alias}.branch_id IS NULL)` : '';
 const select=`SELECT s.id,s.admission_no AS "admissionNo",s.roll_no AS "rollNo",s.full_name AS "fullName",s.date_of_birth AS "dateOfBirth",s.gender,s.photo_url AS "photoUrl",s.status,s.branch_id AS "branchId",b.name AS "branchName" FROM students s LEFT JOIN branches b ON b.id=s.branch_id AND b.school_id=s.school_id`;

 app.get('/api/students/search',authenticate,requireRoles(...finance,'teacher'),async(req,res,next)=>{try{
   const q=String(req.query.q||'').trim(); if(!q)return res.status(400).json({error:'q is required'});
   const limit=Math.min(Math.max(Number(req.query.limit)||10,1),25); const like=`%${q}%`;
   const params=[req.auth.schoolId,like]; let branch='';
   if(req.auth.branchId){params.push(req.auth.branchId);branch=' AND (s.branch_id=$3 OR s.branch_id IS NULL)';}
   const {rows}=await pool.query(`${select} WHERE s.school_id=$1 AND (s.admission_no ILIKE $2 OR s.full_name ILIKE $2)${branch} ORDER BY CASE WHEN s.admission_no ILIKE $2 THEN 0 ELSE 1 END,s.full_name LIMIT ${limit}`,params);
   res.json({students:rows});
 }catch(e){next(e)}});

 app.get('/api/students/:id',authenticate,requireRoles(...staff,'teacher'),async(req,res,next)=>{try{const params=[req.params.id,req.auth.schoolId];let branch='';if(req.auth.branchId){params.push(req.auth.branchId);branch=' AND (s.branch_id=$3 OR s.branch_id IS NULL)';}const {rows}=await pool.query(`${select} WHERE s.id=$1 AND s.school_id=$2${branch}`.replace(/\$3/g,'$3'),params);if(!rows.length)return res.status(404).json({error:'Student not found'});res.json({student:rows[0]})}catch(e){next(e)}});

 app.post('/api/students',authenticate,requireRoles(...staff),async(req,res,next)=>{try{const {admissionNo,rollNo,fullName,dateOfBirth=null,gender=null,photoUrl=null,status='active'}=req.body||{};if(!admissionNo||!String(admissionNo).trim())return res.status(400).json({error:'admissionNo is required'});if(!fullName||!String(fullName).trim())return res.status(400).json({error:'fullName is required'});const branchId=req.auth.branchId||null;const {rows}=await pool.query(`INSERT INTO students(school_id,branch_id,admission_no,roll_no,full_name,date_of_birth,gender,photo_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,admission_no AS "admissionNo",roll_no AS "rollNo",full_name AS "fullName",date_of_birth AS "dateOfBirth",gender,photo_url AS "photoUrl",status,branch_id AS "branchId"`,[req.auth.schoolId,branchId,String(admissionNo).trim(),rollNo||null,String(fullName).trim(),dateOfBirth,gender,photoUrl,status]);res.status(201).json({student:rows[0]})}catch(e){next(e)}});

 app.patch('/api/students/:id',authenticate,requireRoles(...staff),async(req,res,next)=>{try{const allowed=['admissionNo','rollNo','fullName','dateOfBirth','gender','photoUrl','status'];const map={admissionNo:'admission_no',rollNo:'roll_no',fullName:'full_name',dateOfBirth:'date_of_birth',gender:'gender',photoUrl:'photo_url',status:'status'};const keys=allowed.filter(k=>Object.prototype.hasOwnProperty.call(req.body||{},k));if(!keys.length)return res.status(400).json({error:'No fields to update'});const sets=keys.map((k,i)=>`${map[k]}=$${i+1}`);const vals=keys.map(k=>k==='admissionNo'?(req.body[k]?String(req.body[k]).trim():null):k==='fullName'?(req.body[k]?String(req.body[k]).trim():null):req.body[k]);if(keys.includes('admissionNo')&&!vals[keys.indexOf('admissionNo')])return res.status(400).json({error:'admissionNo cannot be empty'});if(keys.includes('fullName')&&!vals[keys.indexOf('fullName')])return res.status(400).json({error:'fullName cannot be empty'});vals.push(req.params.id,req.auth.schoolId);let branch='';if(req.auth.branchId){vals.push(req.auth.branchId);branch=` AND (branch_id=$${vals.length} OR branch_id IS NULL)`;}const {rows}=await pool.query(`UPDATE students SET ${sets.join(',')} WHERE id=$${keys.length+1} AND school_id=$${keys.length+2}${branch} RETURNING id,admission_no AS "admissionNo",roll_no AS "rollNo",full_name AS "fullName",date_of_birth AS "dateOfBirth",gender,photo_url AS "photoUrl",status,branch_id AS "branchId"`,vals);if(!rows.length)return res.status(404).json({error:'Student not found'});res.json({student:rows[0]})}catch(e){next(e)}});
}
module.exports={registerStudentCrudRoutes};
