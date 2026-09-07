-- Idempotency key for offline outbox changes.
-- A device/client can safely retry the same change without creating duplicates.
ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_change_idx
  ON sync_changes(school_id, client_change_id)
  WHERE client_change_id IS NOT NULL;
