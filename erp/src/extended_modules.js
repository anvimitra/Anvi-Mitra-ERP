const { authenticate, requireRoles } = require('./auth');

function tenant(req){ return req.auth?.schoolId; }

function registerExtendedModuleRoutes(app,pool){
  const admin=['super_admin','principal','admin'];

  async function list(req,res,next,table,where=''){
    try{ const {rows}=await pool.query(`SELECT * FROM ${table} WHERE school_id=$1 ${where} ORDER BY created_at DESC`,[tenant(req)]);res.json({items:rows}); }catch(e){next(e)}
  }
  async function insert(req,res,next,table,fields){
    try{
      const body=req.body||{}; const vals=fields.map(f=>body[f]);
      if(fields.some((f,i)=>f.endsWith('name') && !vals[i])) return res.status(400).json({error:'Required fields missing'});
      const cols=['school_id',...fields], params=['$1',...fields.map((_,i)=>'$'+(i+2))];
      const {rows}=await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${params.join(',')}) RETURNING *`,[tenant(req),...vals]);
      res.status(201).json({item:rows[0]});
    }catch(e){next(e)}
  }

  app.get('/api/academic-calendar',authenticate,(req,res,n)=>list(req,res,n,'academic_calendar_events'));
  app.post('/api/academic-calendar',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'academic_calendar_events',['title','event_type','starts_at','ends_at','description','branch_id']));
  app.get('/api/homework',authenticate,(req,res,n)=>list(req,res,n,'homework_assignments'));
  app.post('/api/homework',authenticate,requireRoles(...admin,'teacher'),(req,res,n)=>insert(req,res,n,'homework_assignments',['title','description','class_id','section_id','subject_id','teacher_id','assigned_at','due_at','attachments','branch_id']));
  app.get('/api/teacher-substitutions',authenticate,(req,res,n)=>list(req,res,n,'teacher_substitutions'));
  app.post('/api/teacher-substitutions',authenticate,requireRoles(...admin,'teacher'),(req,res,n)=>insert(req,res,n,'teacher_substitutions',['timetable_slot_id','absent_teacher_id','substitute_teacher_id','class_id','section_id','subject_id','substitute_date','note','branch_id']));

  app.get('/api/transport/vehicles',authenticate,(req,res,n)=>list(req,res,n,'transport_vehicles'));
  app.post('/api/transport/vehicles',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'transport_vehicles',['registration_no','vehicle_type','capacity','driver_id','status','metadata','branch_id']));
  app.get('/api/transport/routes',authenticate,(req,res,n)=>list(req,res,n,'transport_routes'));
  app.post('/api/transport/routes',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'transport_routes',['name','code','vehicle_id','stops','status','branch_id']));
  app.get('/api/transport/assignments',authenticate,(req,res,n)=>list(req,res,n,'transport_assignments'));
  app.post('/api/transport/assignments',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'transport_assignments',['student_id','route_id','stop_name','pickup_time','drop_time','starts_on','ends_on','status']));

  app.get('/api/library/books',authenticate,(req,res,n)=>list(req,res,n,'library_books'));
  app.post('/api/library/books',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'library_books',['isbn','title','author','publisher','category','total_copies','available_copies','metadata']));
  app.get('/api/library/loans',authenticate,(req,res,n)=>list(req,res,n,'library_loans'));
  app.post('/api/library/loans',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'library_loans',['book_id','borrower_id','due_at','fine_amount','status']));

  app.get('/api/inventory/items',authenticate,(req,res,n)=>list(req,res,n,'inventory_items'));
  app.post('/api/inventory/items',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'inventory_items',['sku','name','category','unit','quantity','reorder_level','vendor_name','metadata','branch_id']));
  app.get('/api/inventory/transactions',authenticate,(req,res,n)=>list(req,res,n,'inventory_transactions'));
  app.post('/api/inventory/transactions',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'inventory_transactions',['item_id','transaction_type','quantity','reference_no','notes','created_by']));

  app.get('/api/hr/employees',authenticate,(req,res,n)=>list(req,res,n,'hr_employees'));
  app.post('/api/hr/employees',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'hr_employees',['user_id','employee_code','department','designation','joining_date','status','documents']));
  app.get('/api/hr/leaves',authenticate,(req,res,n)=>list(req,res,n,'hr_leave_requests'));
  app.post('/api/hr/leaves',authenticate,(req,res,n)=>insert(req,res,n,'hr_leave_requests',['employee_id','leave_type','starts_on','ends_on','reason','status']));
  app.get('/api/payroll/runs',authenticate,(req,res,n)=>list(req,res,n,'payroll_runs'));
  app.post('/api/payroll/runs',authenticate,requireRoles(...admin),(req,res,n)=>insert(req,res,n,'payroll_runs',['period_start','period_end','status','summary']));
  app.get('/api/payroll/payslips',authenticate,(req,res,n)=>list(req,res,n,'payroll_payslips'));

  app.get('/api/subscription',authenticate,(req,res,n)=>list(req,res,n,'saas_subscriptions','LIMIT 1'));
}
module.exports={registerExtendedModuleRoutes};
