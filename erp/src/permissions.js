const { authenticate, requireRoles } = require('./auth');

function registerPermissionRoutes(app,pool){
  app.get('/api/permissions/exam-subject/:examSubjectId',authenticate,requireRoles('super_admin','principal','admin','teacher'),async(req,res,next)=>{
    try{
      const r=await pool.query('SELECT teacher_can_edit_exam_subject($1,$2) AS allowed',[req.auth.sub,req.params.examSubjectId]);
      res.json({allowed:Boolean(r.rows[0]?.allowed),examSubjectId:req.params.examSubjectId});
    }catch(e){next(e)}
  });
}
module.exports={registerPermissionRoutes};
