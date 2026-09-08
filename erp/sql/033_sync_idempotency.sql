-- Anvi Mitra ERP: idempotent offline sync change tracking.
-- Mobile/web outbox items send a client_change_id so retries never create duplicates.

ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_change_uidx
  ON sync_changes(school_id, client_change_id)
  WHERE client_change_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sync_changes_school_changed_by_idx
  ON sync_changes(school_id, changed_by, cursor);
