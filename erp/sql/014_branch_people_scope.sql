-- Anvi Mitra ERP: branch-level isolation for people and enrollment.
-- Safe migration: adds nullable branch_id first so existing school records continue to work.
ALTER TABLE IF EXISTS students ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS teachers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS parents ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS enrollments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS students_school_branch_idx ON students(school_id,branch_id);
CREATE INDEX IF NOT EXISTS teachers_school_branch_idx ON teachers(school_id,branch_id);
CREATE INDEX IF NOT EXISTS parents_school_branch_idx ON parents(school_id,branch_id);
CREATE INDEX IF NOT EXISTS enrollments_school_branch_idx ON enrollments(school_id,branch_id);
