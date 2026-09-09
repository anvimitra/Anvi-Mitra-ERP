-- Anvi Mitra ERP: attendance branch scoping.
ALTER TABLE IF EXISTS attendance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE attendance_records ar
SET branch_id = COALESCE(s.branch_id, e.branch_id)
FROM students s
LEFT JOIN LATERAL (
  SELECT en.branch_id
  FROM enrollments en
  WHERE en.student_id=s.id AND en.school_id=s.school_id
  ORDER BY en.created_at DESC
  LIMIT 1
) e ON true
WHERE ar.student_id=s.id
  AND ar.school_id=s.school_id
  AND ar.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS attendance_school_branch_date_idx
  ON attendance_records(school_id,branch_id,attendance_date);
CREATE INDEX IF NOT EXISTS attendance_student_branch_date_idx
  ON attendance_records(student_id,branch_id,attendance_date DESC);
