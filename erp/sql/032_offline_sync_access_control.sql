-- Anvi Mitra ERP: offline-first synchronization and secondary local-storage coordination.
-- Online PostgreSQL remains the source of truth. Clients keep a local cache/outbox and
-- synchronize through the API when connectivity returns.

CREATE TABLE IF NOT EXISTS sync_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  device_key VARCHAR(200) NOT NULL,
  device_name VARCHAR(200),
  platform VARCHAR(30) NOT NULL DEFAULT 'unknown',
  last_cursor BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, device_key)
);
CREATE INDEX IF NOT EXISTS sync_devices_school_status_idx ON sync_devices(school_id,status);

CREATE TABLE IF NOT EXISTS sync_changes (
  cursor BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('create','update','delete')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_changes_school_cursor_idx ON sync_changes(school_id,cursor);
CREATE INDEX IF NOT EXISTS sync_changes_school_entity_idx ON sync_changes(school_id,entity_type,entity_id,cursor);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  device_id UUID REFERENCES sync_devices(id) ON DELETE SET NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  local_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (resolution IN ('pending','server_wins','local_wins','merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sync_conflicts_school_status_idx ON sync_conflicts(school_id,resolution,created_at DESC);

CREATE TABLE IF NOT EXISTS local_storage_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  device_id UUID REFERENCES sync_devices(id) ON DELETE SET NULL,
  connector_type VARCHAR(30) NOT NULL DEFAULT 'desktop_folder' CHECK (connector_type IN ('desktop_folder','nas_folder','external_drive')),
  display_name VARCHAR(200) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  permission_mode VARCHAR(20) NOT NULL DEFAULT 'read_write' CHECK (permission_mode IN ('read_only','read_write')),
  selected_path TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS local_storage_school_device_idx ON local_storage_connectors(school_id,device_id,enabled);

-- Security helper used by result-entry APIs. A teacher is allowed to edit marks only
-- when their teacher_subjects assignment matches the exam session, subject and class.
CREATE OR REPLACE FUNCTION teacher_can_edit_exam_subject(p_user_id UUID, p_exam_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN teachers t ON t.user_id=u.id AND t.school_id=u.school_id
    JOIN exam_subjects es ON es.id=p_exam_subject_id AND es.school_id=u.school_id
    JOIN exams e ON e.id=es.exam_id AND e.school_id=u.school_id AND e.session_id=ts.session_id
    JOIN teacher_subjects ts ON ts.teacher_id=t.id
      AND ts.school_id=u.school_id
      AND ts.subject_id=es.subject_id
      AND ts.session_id=e.session_id
    JOIN sections sec ON sec.id=ts.section_id AND sec.school_id=u.school_id
    WHERE u.id=p_user_id
      AND u.role='teacher'
      AND sec.class_id=es.class_id
      AND (ts.branch_id IS NULL OR es.branch_id IS NULL OR ts.branch_id=es.branch_id)
  );
$$;
