-- Syllabus/progress tracking.
CREATE TABLE IF NOT EXISTS syllabus_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  syllabus_unit_id UUID NOT NULL REFERENCES syllabus_units(id) ON DELETE CASCADE,
  teacher_id UUID,
  class_id UUID NOT NULL,
  section_id UUID,
  subject_id UUID NOT NULL,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent>=0 AND progress_percent<=100),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,session_id,syllabus_unit_id,class_id,section_id,subject_id)
);
CREATE INDEX IF NOT EXISTS syllabus_progress_school_scope_idx ON syllabus_progress(school_id,session_id,class_id,section_id,subject_id);
