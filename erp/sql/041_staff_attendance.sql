CREATE TABLE IF NOT EXISTS staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','late','half_day','leave')),
  note TEXT,
  marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id,user_id,attendance_date)
);
CREATE INDEX IF NOT EXISTS staff_attendance_school_date_idx ON staff_attendance(school_id,attendance_date);
CREATE INDEX IF NOT EXISTS staff_attendance_school_branch_date_idx ON staff_attendance(school_id,branch_id,attendance_date);
