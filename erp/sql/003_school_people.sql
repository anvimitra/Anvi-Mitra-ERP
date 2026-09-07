CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  UNIQUE (school_id, name)
);
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  UNIQUE (school_id, class_id, name)
);
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40),
  UNIQUE (school_id, name)
);
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  employee_code VARCHAR(60),
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(30),
  joining_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (school_id, employee_code)
);
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(200) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(254),
  address TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_no VARCHAR(60) NOT NULL,
  roll_no VARCHAR(40),
  full_name VARCHAR(200) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(30),
  photo_url TEXT,
  admission_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','alumni','transferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, admission_no)
);
CREATE TABLE IF NOT EXISTS student_parents (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relation VARCHAR(40),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, parent_id)
);
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  roll_no VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','promoted','withdrawn')),
  UNIQUE (student_id, session_id),
  UNIQUE (school_id, session_id, section_id, roll_no)
);
CREATE INDEX IF NOT EXISTS students_school_name_idx ON students(school_id, full_name);
CREATE INDEX IF NOT EXISTS enrollments_school_session_idx ON enrollments(school_id, session_id, section_id);
