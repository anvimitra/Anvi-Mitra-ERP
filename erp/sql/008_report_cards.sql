CREATE TABLE IF NOT EXISTS report_card_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id, session_id, name)
);

CREATE TABLE IF NOT EXISTS report_card_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES report_card_configs(id) ON DELETE CASCADE,
  exam_type_id UUID NOT NULL REFERENCES exam_types(id) ON DELETE RESTRICT,
  weight_percent NUMERIC(6,2) NOT NULL CHECK (weight_percent >= 0 AND weight_percent <= 100),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (config_id, exam_type_id)
);

CREATE TABLE IF NOT EXISTS report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  config_id UUID REFERENCES report_card_configs(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  total_marks NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  overall_grade VARCHAR(10),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, session_id, student_id)
);

CREATE TABLE IF NOT EXISTS report_card_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  total_marks NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  grade VARCHAR(10),
  remarks TEXT,
  UNIQUE (report_card_id, subject_id)
);

CREATE TABLE IF NOT EXISTS report_card_exam_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_subject_id UUID NOT NULL REFERENCES report_card_subjects(id) ON DELETE CASCADE,
  exam_type_id UUID NOT NULL REFERENCES exam_types(id) ON DELETE RESTRICT,
  marks NUMERIC(10,2),
  max_marks NUMERIC(10,2),
  weighted_marks NUMERIC(10,2),
  UNIQUE (report_card_subject_id, exam_type_id)
);

CREATE INDEX IF NOT EXISTS report_cards_student_idx ON report_cards(school_id, student_id, session_id);
