CREATE TABLE IF NOT EXISTS admission_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  application_no VARCHAR(60) NOT NULL,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  applied_class_id UUID REFERENCES classes(id) ON DELETE RESTRICT,
  student_name VARCHAR(200) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(30),
  father_name VARCHAR(200),
  mother_name VARCHAR(200),
  guardian_phone VARCHAR(30),
  address TEXT,
  previous_school VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','approved','rejected','cancelled','enrolled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, application_no)
);

CREATE TABLE IF NOT EXISTS student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(60) NOT NULL,
  document_no VARCHAR(100),
  file_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admission_school_session_status_idx ON admission_applications(school_id, session_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS student_documents_student_idx ON student_documents(school_id, student_id, document_type);
