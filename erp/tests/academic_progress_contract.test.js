const fs=require('fs');const path=require('path');
const assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../src/academic_progress.js'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'../sql/049_syllabus_progress.sql'),'utf8');
for(const token of [
  "app.get('/api/academic/syllabus'",
  "app.post('/api/academic/syllabus'",
  "app.put('/api/academic/syllabus/:id/progress'",
  'progressPercent','teacher_can_edit_exam_subject','sync_changes',
  'Syllabus unit not found','Teacher is not assigned'
]) assert(src.includes(token),'academic progress contract missing: '+token);
for(const token of ['syllabus_progress','progress_percent','UNIQUE(school_id,session_id,syllabus_unit_id,class_id,section_id,subject_id)']) assert(schema.includes(token),'syllabus schema contract missing: '+token);
console.log('academic progress contract: ok');
