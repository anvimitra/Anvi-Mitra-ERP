CREATE TABLE IF NOT EXISTS student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','late','half_day','leave')),
  note TEXT,
  marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS student_attendance_school_date_idx ON student_attendance(school_id,attendance_date);
CREATE INDEX IF NOT EXISTS student_attendance_school_session_idx ON student_attendance(school_id,session_id,attendance_date);
CREATE INDEX IF NOT EXISTS student_attendance_student_date_idx ON student_attendance(student_id,attendance_date DESC);
