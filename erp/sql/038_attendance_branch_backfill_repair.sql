-- Repair migration for databases where attendance branch backfill was already applied
-- before the corrected 027 migration became available.
ALTER TABLE IF EXISTS attendance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE attendance_records ar
SET branch_id = COALESCE(
  s.branch_id,
  (
    SELECT en.branch_id
    FROM enrollments en
    WHERE en.student_id=s.id
      AND en.school_id=s.school_id
      AND en.session_id=ar.session_id
    LIMIT 1
  )
)
FROM students s
WHERE ar.student_id=s.id
  AND ar.school_id=s.school_id
  AND ar.branch_id IS NULL;
