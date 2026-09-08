-- Database-level guard for teacher marks entry.
-- The API already checks teacher permissions; this trigger makes the rule
-- non-bypassable if a teacher reaches PostgreSQL through another application path.

CREATE OR REPLACE FUNCTION enforce_teacher_marks_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role TEXT;
  allowed BOOLEAN;
BEGIN
  SELECT role INTO actor_role
  FROM users
  WHERE id=NEW.entered_by AND school_id=NEW.school_id;

  IF actor_role IS DISTINCT FROM 'teacher' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM exam_subjects es
    JOIN exams e ON e.id=es.exam_id AND e.school_id=NEW.school_id
    JOIN teacher_class_subject_permissions p
      ON p.school_id=NEW.school_id
      AND p.teacher_user_id=NEW.entered_by
      AND p.class_id=es.class_id
      AND p.subject_id=es.subject_id
      AND p.session_id=e.session_id
      AND p.can_view=true
      AND p.can_edit_marks=true
    JOIN enrollments en
      ON en.student_id=NEW.student_id
      AND en.school_id=NEW.school_id
      AND en.session_id=e.session_id
      AND en.class_id=es.class_id
      AND en.section_id=p.section_id
      AND en.status='active'
    WHERE es.id=NEW.exam_subject_id
      AND es.school_id=NEW.school_id
      AND (p.branch_id IS NULL OR e.branch_id IS NULL OR p.branch_id=e.branch_id)
      AND (NEW.branch_id IS NULL OR p.branch_id IS NULL OR NEW.branch_id=p.branch_id)
      AND e.status <> 'published'
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Teacher is not permitted to enter marks for this class, section and subject' USING ERRCODE='42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_marks_teacher_permission_guard ON exam_marks;
CREATE TRIGGER exam_marks_teacher_permission_guard
BEFORE INSERT OR UPDATE OF exam_subject_id,student_id,marks,grade,remarks,entered_by,branch_id ON exam_marks
FOR EACH ROW
EXECUTE FUNCTION enforce_teacher_marks_permission();
