-- Idempotency key for offline client mutations.
-- A client may retry the same queued mutation after a network timeout; the
-- central sync log must accept it only once per school.

ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_change_uidx
  ON sync_changes(school_id, client_change_id)
  WHERE client_change_id IS NOT NULL;
