-- Fix explicit teacher-permission upsert compatibility.
-- The permission table's original uniqueness includes nullable branch_id, while
-- the API updates a permission for the same teacher/class/section/subject/session.
-- This index gives that API conflict target a concrete unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_permissions_core_uidx
  ON teacher_class_subject_permissions(
    school_id, teacher_user_id, class_id, section_id, subject_id, session_id
  );
