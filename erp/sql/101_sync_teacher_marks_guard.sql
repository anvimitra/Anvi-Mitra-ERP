-- Enforce teacher marks permissions at the offline sync journal boundary.
-- This runs after 038_teacher_subject_assignments.sql on a clean database.
CREATE OR REPLACE FUNCTION guard_sync_teacher_exam_marks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  exam_subject_id UUID;
BEGIN
  IF NEW.entity_type IN ('exam_mark', 'exam_marks')
     AND NEW.changed_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM users WHERE id = NEW.changed_by AND role = 'teacher') THEN
    exam_subject_id := NULLIF(COALESCE(NEW.payload->>'examSubjectId', NEW.payload->>'exam_subject_id'), '')::UUID;
    IF exam_subject_id IS NULL THEN
      RAISE EXCEPTION 'examSubjectId is required for teacher exam-mark sync';
    END IF;
    IF NOT teacher_can_edit_exam_subject(NEW.changed_by, exam_subject_id) THEN
      RAISE EXCEPTION 'Teacher is not assigned to this exam subject/class';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sync_teacher_exam_marks ON sync_changes;
CREATE TRIGGER trg_guard_sync_teacher_exam_marks
BEFORE INSERT ON sync_changes
FOR EACH ROW EXECUTE FUNCTION guard_sync_teacher_exam_marks();
