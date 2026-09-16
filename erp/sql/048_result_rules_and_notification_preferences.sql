-- Result processing rules and user notification preferences.
CREATE TABLE IF NOT EXISTS grade_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL DEFAULT 'Default',
  min_percentage NUMERIC(6,2) NOT NULL,
  max_percentage NUMERIC(6,2) NOT NULL,
  grade VARCHAR(20) NOT NULL,
  grade_point NUMERIC(5,2),
  remark VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_percentage >= 0 AND max_percentage <= 100 AND min_percentage <= max_percentage)
);
CREATE INDEX IF NOT EXISTS grade_scales_school_range_idx ON grade_scales(school_id,min_percentage,max_percentage);

CREATE TABLE IF NOT EXISTS result_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL,
  student_id UUID NOT NULL,
  session_id UUID NOT NULL,
  class_id UUID NOT NULL,
  section_id UUID,
  subjects_total INTEGER NOT NULL DEFAULT 0,
  subjects_marked INTEGER NOT NULL DEFAULT 0,
  marks_obtained NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_marks NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(7,2) NOT NULL DEFAULT 0,
  grade VARCHAR(20),
  rank_position INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE(school_id,exam_id,student_id)
);
CREATE INDEX IF NOT EXISTS result_snapshots_school_exam_idx ON result_snapshots(school_id,exam_id,class_id,section_id,rank_position);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT true,
  push BOOLEAN NOT NULL DEFAULT true,
  email BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id,user_id,event_type)
);
CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences(school_id,user_id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
