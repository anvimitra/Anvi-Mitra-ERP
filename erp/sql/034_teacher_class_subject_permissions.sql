-- Teacher marks-entry permissions: a teacher may be assigned only to explicit
-- class/section/subject/session combinations. The marks API can use this table
-- as the server-side authorization source.
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
  UNIQUE (school_id,teacher_user_id,class_id,section_id,subject_id,session_id)
);
CREATE INDEX IF NOT EXISTS teacher_permissions_lookup_idx
  ON teacher_class_subject_permissions(school_id,teacher_user_id,session_id,class_id,section_id,subject_id);
CREATE INDEX IF NOT EXISTS teacher_permissions_subject_idx
  ON teacher_class_subject_permissions(school_id,subject_id,session_id);
