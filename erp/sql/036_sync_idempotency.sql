-- Idempotent offline sync metadata: every device can safely retry the same client change.
ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS base_cursor BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_device_client_idx
  ON sync_changes(school_id, device_id, client_change_id)
  WHERE client_change_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sync_changes_device_entity_idx
  ON sync_changes(school_id, device_id, entity_type, entity_id, cursor);
