-- Metadata required for idempotent offline push and conflict detection.
ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES sync_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_change_id UUID,
  ADD COLUMN IF NOT EXISTS base_cursor BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sync_changes_school_device_client
  ON sync_changes(school_id, device_id, client_change_id);

CREATE INDEX IF NOT EXISTS idx_sync_changes_conflict_scan
  ON sync_changes(school_id, entity_type, entity_id, cursor);
