const { authenticate, requireRoles } = require('./auth');

function registerStudentPromotionRoutes(app, pool) {
  const staff = ['super_admin','principal','admin','office_staff'];

  app.get('/api/promotion/masters', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const schoolId = req.auth.schoolId;
      const branchId = req.auth.branchId || null;
      const [sessions, classes, sections] = await Promise.all([
        pool.query(`SELECT id,name,starts_on AS "startsOn",ends_on AS "endsOn",is_current AS "isCurrent"
                    FROM academic_sessions WHERE school_id=$1 ORDER BY starts_on DESC`, [schoolId]),
        pool.query(`SELECT id,name,branch_id AS "branchId" FROM classes
                    WHERE school_id=$1 AND ($2::uuid IS NULL OR branch_id=$2 OR branch_id IS NULL)
                    ORDER BY name`, [schoolId, branchId]),
        pool.query(`SELECT s.id,s.class_id AS "classId",s.name,c.name AS "className",c.branch_id AS "branchId"
                    FROM sections s JOIN classes c ON c.id=s.class_id AND c.school_id=s.school_id
                    WHERE s.school_id=$1 AND ($2::uuid IS NULL OR c.branch_id=$2 OR c.branch_id IS NULL)
                    ORDER BY c.name,s.name`, [schoolId, branchId])
      ]);
      res.json({sessions:sessions.rows,classes:classes.rows,sections:sections.rows});
    } catch (err) { next(err); }
  });

  app.get('/api/promotion/students', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const sessionId = String(req.query.sessionId || '');
      if (!sessionId) return res.status(400).json({error:'sessionId is required'});
      const branchId = req.auth.branchId || null;
      const { rows } = await pool.query(`
        SELECT s.id,s.admission_no AS "admissionNo",s.full_name AS "fullName",s.gender,
               e.id AS "enrollmentId",e.session_id AS "sessionId",e.section_id AS "sectionId",
               c.id AS "classId",c.name AS "className",sec.name AS "sectionName",
               e.roll_no AS "rollNo",s.branch_id AS "branchId"
        FROM students s
        JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$2 AND e.status='active'
        JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
        JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
        WHERE s.school_id=$1 AND s.status='active'
          AND ($3::uuid IS NULL OR s.branch_id=$3 OR s.branch_id IS NULL)
        ORDER BY c.name,sec.name,e.roll_no NULLS LAST,s.full_name
      `, [req.auth.schoolId, sessionId, branchId]);
      res.json({students:rows});
    } catch (err) { next(err); }
  });

  app.post('/api/promotion/preview', authenticate, requireRoles(...staff), async (req,res,next) => {
    try {
      const {fromSessionId,toSessionId,students=[]}=req.body||{};
      if(!fromSessionId||!toSessionId||fromSessionId===toSessionId||!Array.isArray(students)||!students.length)
        return res.status(400).json({error:'fromSessionId, toSessionId and students are required'});
      const ids=students.map(x=>x.studentId).filter(Boolean);
      const {rows}=await pool.query(`
        SELECT s.id AS "studentId",s.full_name AS "fullName",s.admission_no AS "admissionNo",
               e.section_id AS "currentSectionId",c.name AS "currentClass",sec.name AS "currentSection",
               COALESCE(e2.id::text,'') AS "targetEnrollment"
        FROM students s
        JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$2 AND e.status='active'
        JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
        JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
        LEFT JOIN enrollments e2 ON e2.student_id=s.id AND e2.school_id=s.school_id AND e2.session_id=$3
        WHERE s.school_id=$1 AND s.id=ANY($4::uuid[])
      `, [req.auth.schoolId,fromSessionId,toSessionId,ids]);
      res.json({preview:rows});
    } catch(err){next(err)}
  });

  app.post('/api/promotion/promote', authenticate, requireRoles(...staff), async (req,res,next) => {
    const client=await pool.connect();
    try {
      const {fromSessionId,toSessionId,students=[]}=req.body||{};
      if(!fromSessionId||!toSessionId||fromSessionId===toSessionId||!Array.isArray(students)||!students.length)
        return res.status(400).json({error:'fromSessionId, toSessionId and students are required'});
      const branchId=req.auth.branchId||null;
      await client.query('BEGIN');

      const validSession=await client.query(
        `SELECT id FROM academic_sessions WHERE school_id=$1 AND id=ANY($2::uuid[])`,
        [req.auth.schoolId,[fromSessionId,toSessionId]]
      );
      if(validSession.rowCount!==2){
        await client.query('ROLLBACK');
        return res.status(400).json({error:'Both academic sessions must belong to this school'});
      }

      let promoted=0, skipped=0;
      for (const item of students) {
        if(!item.studentId||!item.targetSectionId){skipped++;continue;}
        const source=await client.query(`
          SELECT s.id,s.full_name,e.roll_no,c.branch_id AS "classBranchId"
          FROM students s
          JOIN enrollments e ON e.student_id=s.id AND e.school_id=s.school_id AND e.session_id=$2 AND e.status='active'
          JOIN sections sec ON sec.id=e.section_id AND sec.school_id=e.school_id
          JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
          WHERE s.id=$1 AND s.school_id=$3 AND s.status='active'
            AND ($4::uuid IS NULL OR s.branch_id=$4 OR s.branch_id IS NULL)
          FOR UPDATE
        `,[item.studentId,fromSessionId,req.auth.schoolId,branchId]);
        if(!source.rowCount){skipped++;continue;}

        const target=await client.query(`
          SELECT sec.id,c.branch_id AS "classBranchId"
          FROM sections sec JOIN classes c ON c.id=sec.class_id AND c.school_id=sec.school_id
          WHERE sec.id=$1 AND sec.school_id=$2
            AND ($3::uuid IS NULL OR c.branch_id=$3 OR c.branch_id IS NULL)
        `,[item.targetSectionId,req.auth.schoolId,branchId]);
        if(!target.rowCount){skipped++;continue;}
        if(branchId && target.rows[0].classBranchId && target.rows[0].classBranchId!==branchId){skipped++;continue;}

        await client.query(`
          INSERT INTO enrollments(school_id,branch_id,student_id,session_id,section_id,roll_no,status)
          VALUES($1,$2,$3,$4,$5,$6,'active')
          ON CONFLICT(student_id,session_id)
          DO UPDATE SET branch_id=EXCLUDED.branch_id,section_id=EXCLUDED.section_id,roll_no=EXCLUDED.roll_no,status='active'
        `,[req.auth.schoolId,source.rows[0].classBranchId||branchId,source.rows[0].id,toSessionId,item.targetSectionId,item.rollNo||null]);

        await client.query(`
          INSERT INTO sync_changes(school_id,entity_type,entity_id,operation,payload,changed_by)
          VALUES($1,'student_promotion',$2,'create',$3::jsonb,$4)
        `,[req.auth.schoolId,source.rows[0].id,JSON.stringify({
          fromSessionId,toSessionId,targetSectionId:item.targetSectionId,studentId:source.rows[0].id
        }),req.auth.sub]);
        promoted++;
      }

      await client.query('COMMIT');
      res.json({promoted,skipped,message:`${promoted} student(s) promoted successfully`});
    } catch(err){await client.query('ROLLBACK').catch(()=>{});next(err)}
    finally{client.release()}
  });
}

module.exports={registerStudentPromotionRoutes};
