-- Auditable metadata for server-authoritative offline conflict resolution.
ALTER TABLE sync_conflicts
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE INDEX IF NOT EXISTS sync_conflicts_school_resolved_idx
  ON sync_conflicts(school_id,resolved_by,resolved_at DESC);