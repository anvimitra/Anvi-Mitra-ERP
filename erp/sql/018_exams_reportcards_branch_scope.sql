ALTER TABLE IF EXISTS exam_types ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS exam_subjects ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS exam_marks ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS grade_scales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS report_card_configs ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS report_cards ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS exam_types_branch_idx ON exam_types(school_id, branch_id);
CREATE INDEX IF NOT EXISTS exams_branch_idx ON exams(school_id, branch_id, session_id);
CREATE INDEX IF NOT EXISTS exam_subjects_branch_idx ON exam_subjects(school_id, branch_id, class_id);
CREATE INDEX IF NOT EXISTS exam_marks_branch_idx ON exam_marks(school_id, branch_id, student_id);
CREATE INDEX IF NOT EXISTS grade_scales_branch_idx ON grade_scales(school_id, branch_id);
CREATE INDEX IF NOT EXISTS report_card_configs_branch_idx ON report_card_configs(school_id, branch_id, session_id);
CREATE INDEX IF NOT EXISTS report_cards_branch_idx ON report_cards(school_id, branch_id, session_id, student_id);
