-- Anvi Mitra ERP: sync runtime contract hardening.
-- Keeps the journal schema aligned with the active sync API implementation.

ALTER TABLE sync_changes
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES sync_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_change_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS base_cursor BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sync_changes_device_cursor_idx
  ON sync_changes(school_id, device_id, cursor);

CREATE UNIQUE INDEX IF NOT EXISTS sync_changes_device_client_change_uidx
  ON sync_changes(school_id, device_id, client_change_id)
  WHERE client_change_id IS NOT NULL;

-- Backfill journal rows created before device-aware idempotency was introduced.
UPDATE sync_changes
SET base_cursor = 0
WHERE base_cursor IS NULL;
