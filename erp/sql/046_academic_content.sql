-- Academic content and learning workflow.
CREATE TABLE IF NOT EXISTS syllabus_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE, class_id UUID NOT NULL,
  subject_id UUID NOT NULL, title VARCHAR(250) NOT NULL, description TEXT, sequence_no INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active', created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS syllabus_school_class_subject_idx ON syllabus_units(school_id,session_id,class_id,subject_id,sequence_no);

CREATE TABLE IF NOT EXISTS study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE, class_id UUID, section_id UUID, subject_id UUID,
  teacher_id UUID, title VARCHAR(250) NOT NULL, description TEXT, resource_url TEXT, attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(), status VARCHAR(20) NOT NULL DEFAULT 'published', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_material_school_scope_idx ON study_materials(school_id,session_id,class_id,section_id,subject_id,published_at DESC);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  homework_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE, student_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), content TEXT, attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted', teacher_feedback TEXT, marks NUMERIC(8,2), graded_at TIMESTAMPTZ,
  UNIQUE(school_id,homework_id,student_id)
);
CREATE INDEX IF NOT EXISTS homework_submission_school_student_idx ON homework_submissions(school_id,student_id,submitted_at DESC);
