-- Add the originating device to the sync journal before device-scoped idempotency indexes.
ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES sync_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sync_changes_device_cursor_idx
  ON sync_changes(school_id, device_id, cursor);
