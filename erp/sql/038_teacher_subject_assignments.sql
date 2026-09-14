-- Teacher -> session -> branch -> section/class -> subject permissions.
-- Renumbered from 035 so the migration runner has unique, deterministic ordering.
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  can_mark BOOLEAN NOT NULL DEFAULT true,
  can_attendance BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id,session_id,section_id,subject_id)
);
CREATE INDEX IF NOT EXISTS teacher_subjects_school_idx ON teacher_subjects(school_id,session_id,section_id,subject_id,status);
CREATE INDEX IF NOT EXISTS teacher_subjects_teacher_idx ON teacher_subjects(teacher_id,session_id,status);

CREATE OR REPLACE FUNCTION teacher_can_edit_exam_subject(p_user_id UUID, p_exam_subject_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(
   SELECT 1 FROM users u
   JOIN teachers t ON t.user_id=u.id AND t.school_id=u.school_id AND t.status='active'
   JOIN exam_subjects es ON es.id=p_exam_subject_id AND es.school_id=u.school_id
   JOIN exams e ON e.id=es.exam_id AND e.school_id=u.school_id
   JOIN teacher_subjects ts ON ts.teacher_id=t.id AND ts.school_id=u.school_id
     AND ts.session_id=e.session_id AND ts.subject_id=es.subject_id AND ts.can_mark=true AND ts.status='active'
   JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=u.school_id
   WHERE u.id=p_user_id AND u.role='teacher' AND sec.class_id=es.class_id
     AND (ts.branch_id IS NULL OR es.branch_id IS NULL OR ts.branch_id=es.branch_id)
 );
$$;
