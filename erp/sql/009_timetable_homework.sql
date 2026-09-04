CREATE TABLE IF NOT EXISTS teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  UNIQUE (teacher_id, subject_id, section_id, session_id)
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_no SMALLINT NOT NULL CHECK (period_no > 0),
  starts_at TIME,
  ends_at TIME,
  room VARCHAR(60),
  UNIQUE (section_id, session_id, day_of_week, period_no),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assigned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  due_on DATE,
  attachment_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_on IS NULL OR due_on >= assigned_on)
);

CREATE INDEX IF NOT EXISTS timetable_section_idx ON timetable_entries(school_id, session_id, section_id, day_of_week, period_no);
CREATE INDEX IF NOT EXISTS homework_section_due_idx ON homework(school_id, section_id, due_on DESC);
