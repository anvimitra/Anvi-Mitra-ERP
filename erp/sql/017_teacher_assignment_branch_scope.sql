-- Anvi Mitra ERP: branch-level teacher assignment isolation.
-- Existing assignments remain valid with nullable branch_id during migration.
ALTER TABLE IF EXISTS teacher_subjects
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS timetable_entries
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS homework
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teacher_subjects_school_branch_idx ON teacher_subjects(school_id,branch_id,session_id,section_id);
CREATE INDEX IF NOT EXISTS timetable_school_branch_idx ON timetable_entries(school_id,branch_id,session_id,section_id,day_of_week,period_no);
CREATE INDEX IF NOT EXISTS homework_school_branch_idx ON homework(school_id,branch_id,session_id,section_id,due_on DESC);
