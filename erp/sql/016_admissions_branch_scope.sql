-- Anvi Mitra ERP: branch-level admissions isolation.
-- Existing applications remain valid with nullable branch_id during migration.
ALTER TABLE IF EXISTS admission_applications
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS student_documents
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS admission_school_branch_session_status_idx
  ON admission_applications(school_id, branch_id, session_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS student_documents_school_branch_student_idx
  ON student_documents(school_id, branch_id, student_id, document_type);
