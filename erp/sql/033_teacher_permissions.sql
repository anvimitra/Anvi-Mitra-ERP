-- Teacher/class/subject/session permission matrix.
-- A teacher may enter marks only for an explicitly assigned class + section + subject + session.
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
CREATE INDEX IF NOT EXISTS teacher_permissions_branch_idx
  ON teacher_class_subject_permissions(school_id,branch_id);

-- Keep tenant ownership explicit even if IDs are supplied by a client.
CREATE OR REPLACE FUNCTION validate_teacher_permission_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.teacher_user_id AND school_id=NEW.school_id AND role='teacher') THEN
    RAISE EXCEPTION 'teacher_user_id is not an active teacher in this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM classes WHERE id=NEW.class_id AND school_id=NEW.school_id) THEN
    RAISE EXCEPTION 'class_id does not belong to this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sections WHERE id=NEW.section_id AND class_id=NEW.class_id AND school_id=NEW.school_id) THEN
    RAISE EXCEPTION 'section_id does not belong to the selected class';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM subjects WHERE id=NEW.subject_id AND school_id=NEW.school_id) THEN
    RAISE EXCEPTION 'subject_id does not belong to this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM academic_sessions WHERE id=NEW.session_id AND school_id=NEW.school_id) THEN
    RAISE EXCEPTION 'session_id does not belong to this school';
  END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id=NEW.branch_id AND school_id=NEW.school_id) THEN
    RAISE EXCEPTION 'branch_id does not belong to this school';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_teacher_permission_row ON teacher_class_subject_permissions;
CREATE TRIGGER trg_validate_teacher_permission_row
BEFORE INSERT OR UPDATE ON teacher_class_subject_permissions
FOR EACH ROW EXECUTE FUNCTION validate_teacher_permission_row();
