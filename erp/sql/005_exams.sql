CREATE TABLE IF NOT EXISTS exam_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('formative','summative','annual','custom')),
  display_order INTEGER NOT NULL DEFAULT 0,
  max_marks NUMERIC(8,2),
  pass_marks NUMERIC(8,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  exam_type_id UUID NOT NULL REFERENCES exam_types(id) ON DELETE RESTRICT,
  name VARCHAR(150) NOT NULL,
  starts_on DATE,
  ends_on DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','completed','published','cancelled')),
  UNIQUE (school_id, session_id, name),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS exam_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  max_marks NUMERIC(8,2) NOT NULL CHECK (max_marks > 0),
  pass_marks NUMERIC(8,2),
  exam_date DATE,
  UNIQUE (exam_id, subject_id, class_id)
);

CREATE TABLE IF NOT EXISTS exam_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_subject_id UUID NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks NUMERIC(8,2),
  grade VARCHAR(10),
  remarks TEXT,
  entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_subject_id, student_id),
  CHECK (marks IS NULL OR marks >= 0)
);

CREATE TABLE IF NOT EXISTS grade_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  min_percent NUMERIC(5,2) NOT NULL,
  max_percent NUMERIC(5,2) NOT NULL,
  grade VARCHAR(10) NOT NULL,
  UNIQUE (school_id, name, grade),
  CHECK (min_percent >= 0 AND max_percent <= 100 AND max_percent >= min_percent)
);

CREATE INDEX IF NOT EXISTS exams_school_session_idx ON exams(school_id, session_id);
CREATE INDEX IF NOT EXISTS exam_marks_school_student_idx ON exam_marks(school_id, student_id);
