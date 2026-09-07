-- Anvi Mitra ERP: attendance branch scoping.
ALTER TABLE IF EXISTS attendance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE attendance_records ar
SET branch_id = COALESCE(s.branch_id, e.branch_id)
FROM students s
LEFT JOIN LATERAL (
  SELECT branch_id
  FROM enrollments
  WHERE student_id=s.id AND school_id=ar.school_id
  ORDER BY created_at DESC
  LIMIT 1
) e ON true
WHERE ar.student_id=s.id
  AND ar.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS attendance_school_branch_date_idx
  ON attendance_records(school_id,branch_id,attendance_date);
CREATE INDEX IF NOT EXISTS attendance_student_branch_date_idx
  ON attendance_records(student_id,branch_id,attendance_date DESC);
