-- Offline sync client idempotency and device heartbeat.
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS client_id VARCHAR(200);
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_idx ON sync_changes(school_id,client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_school_client_change_idx ON sync_changes(school_id,client_change_id) WHERE client_change_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sync_changes_school_changed_idx ON sync_changes(school_id,changed_at DESC);
