-- Anvi Mitra ERP: keep installment branch scope explicit and backfill existing rows.
ALTER TABLE IF EXISTS fee_installments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE fee_installments fi
SET branch_id = COALESCE(fi.branch_id, a.branch_id, s.branch_id)
FROM student_fee_assignments a
JOIN students s ON s.id = fi.student_id AND s.school_id = fi.school_id
WHERE fi.assignment_id = a.id
  AND fi.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS fee_installments_branch_idx
  ON fee_installments(school_id,branch_id,session_id,due_date);
