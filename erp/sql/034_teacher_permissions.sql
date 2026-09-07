-- Explicit teacher permissions for class + section + subject + academic session.
-- This is the security boundary for teacher result entry.
CREATE TABLE IF NOT EXISTS teacher_class_subject_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit_marks BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, teacher_user_id, class_id, section_id, subject_id, session_id)
);

CREATE INDEX IF NOT EXISTS teacher_permissions_teacher_idx
  ON teacher_class_subject_permissions(school_id, teacher_user_id, session_id);
CREATE INDEX IF NOT EXISTS teacher_permissions_scope_idx
  ON teacher_class_subject_permissions(school_id, class_id, section_id, subject_id, session_id);

CREATE OR REPLACE FUNCTION teacher_can_edit_exam_subject(p_user_id UUID, p_exam_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN exam_subjects es ON es.id=p_exam_subject_id AND es.school_id=u.school_id
    JOIN exams e ON e.id=es.exam_id AND e.school_id=u.school_id
    JOIN teacher_class_subject_permissions p
      ON p.school_id=u.school_id
      AND p.teacher_user_id=u.id
      AND p.class_id=es.class_id
      AND p.subject_id=es.subject_id
      AND p.session_id=e.session_id
      AND p.can_view=true
      AND p.can_edit_marks=true
    JOIN sections sec ON sec.id=p.section_id AND sec.school_id=u.school_id AND sec.class_id=es.class_id
    WHERE u.id=p_user_id
      AND u.role='teacher'
      AND u.status='active'
      AND (p.branch_id IS NULL OR e.branch_id IS NULL OR p.branch_id=e.branch_id)
  );
$$;
