-- Enforce teacher marks-entry scope at the database boundary.
CREATE OR REPLACE FUNCTION teacher_can_edit_exam_subject(p_user_id UUID, p_exam_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN teachers t ON t.user_id=u.id AND t.school_id=u.school_id
    JOIN exam_subjects es ON es.id=p_exam_subject_id AND es.school_id=u.school_id
    JOIN teacher_subjects ts ON ts.teacher_id=t.id
      AND ts.school_id=u.school_id
      AND ts.subject_id=es.subject_id
      AND ts.session_id=(SELECT session_id FROM exams WHERE id=es.exam_id AND school_id=u.school_id)
    JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=u.school_id
    WHERE u.id=p_user_id
      AND u.role='teacher'
      AND sec.class_id=es.class_id
      AND (ts.branch_id IS NULL OR es.branch_id IS NULL OR ts.branch_id=es.branch_id)
  );
$$;
