-- Helps stale-processing recovery and pending queue scans stay efficient.
CREATE INDEX IF NOT EXISTS idx_parent_push_queue_processing_age
  ON parent_push_queue(status, queued_at)
  WHERE status = 'processing';
