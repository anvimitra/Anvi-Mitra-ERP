CREATE TABLE IF NOT EXISTS student_portal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation VARCHAR(40),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (student_id, user_id)
);
CREATE INDEX IF NOT EXISTS student_portal_user_idx ON student_portal_profiles(school_id,user_id,status);
