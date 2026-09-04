-- Anvi Mitra ERP: branch-level attendance isolation.
-- Existing attendance rows remain valid with a nullable branch_id during migration.
ALTER TABLE IF EXISTS attendance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_school_branch_date_idx
  ON attendance_records(school_id, branch_id, attendance_date);
