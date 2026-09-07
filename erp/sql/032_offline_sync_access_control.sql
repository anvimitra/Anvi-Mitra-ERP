-- Anvi Mitra ERP: offline-first sync storage.
-- PostgreSQL is the online source of truth; clients keep a local cache/outbox.

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
