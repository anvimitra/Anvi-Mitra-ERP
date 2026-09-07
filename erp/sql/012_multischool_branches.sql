-- Anvi Mitra ERP: multi-school / multi-branch foundation.
-- Existing rows remain valid because branch_id is nullable during migration.

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT,
  phone VARCHAR(30),
  email VARCHAR(254),
  logo_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code),
  UNIQUE (school_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_main_branch_per_school ON branches(school_id) WHERE is_main;
CREATE INDEX IF NOT EXISTS branches_school_status_idx ON branches(school_id, status);

CREATE TABLE IF NOT EXISTS school_settings (
  school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  display_name VARCHAR(200),
  logo_url TEXT,
  primary_color VARCHAR(30),
  secondary_color VARCHAR(30),
  address TEXT,
  phone VARCHAR(30),
  email VARCHAR(254),
  website VARCHAR(255),
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  locale VARCHAR(20) NOT NULL DEFAULT 'en-IN',
  date_format VARCHAR(30) NOT NULL DEFAULT 'DD-MM-YYYY',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_school_branch_idx ON users(school_id, branch_id);
CREATE INDEX IF NOT EXISTS classes_school_branch_idx ON classes(school_id, branch_id);
CREATE INDEX IF NOT EXISTS teachers_school_branch_idx ON teachers(school_id, branch_id);
CREATE INDEX IF NOT EXISTS parents_school_branch_idx ON parents(school_id, branch_id);
CREATE INDEX IF NOT EXISTS students_school_branch_idx ON students(school_id, branch_id);
