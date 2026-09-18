-- Base integrity helpers used by enrollment and reporting modules.
CREATE OR REPLACE FUNCTION set_enrollment_class_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT class_id INTO NEW.class_id FROM sections WHERE id = NEW.section_id AND school_id = NEW.school_id;
  IF NEW.class_id IS NULL THEN
    RAISE EXCEPTION 'section_id does not belong to the enrollment school';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enrollments_class_id_trigger ON enrollments;
CREATE TRIGGER enrollments_class_id_trigger
BEFORE INSERT OR UPDATE OF section_id, school_id ON enrollments
FOR EACH ROW EXECUTE FUNCTION set_enrollment_class_id();
CREATE INDEX IF NOT EXISTS enrollments_class_scope_idx ON enrollments(school_id,session_id,class_id,section_id,status);
CREATE INDEX IF NOT EXISTS exam_marks_student_scope_idx ON exam_marks(school_id,student_id,exam_subject_id);
