-- Idempotent client mutation IDs make offline retries safe.
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_change_uidx
  ON sync_changes(school_id, client_change_id)
  WHERE client_change_id IS NOT NULL;
