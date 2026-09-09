-- Make exam data branch-aware before the database-level teacher marks guard runs.
-- Nullable keeps existing records valid while multi-branch data is introduced.

ALTER TABLE exam_types
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE exam_subjects
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE exam_marks
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_types_school_branch_idx
  ON exam_types(school_id, branch_id);

CREATE INDEX IF NOT EXISTS exams_school_branch_idx
  ON exams(school_id, branch_id);

CREATE INDEX IF NOT EXISTS exam_subjects_school_branch_idx
  ON exam_subjects(school_id, branch_id);

CREATE INDEX IF NOT EXISTS exam_marks_school_branch_idx
  ON exam_marks(school_id, branch_id);
