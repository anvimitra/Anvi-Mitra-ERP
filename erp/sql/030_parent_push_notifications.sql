CREATE TABLE IF NOT EXISTS parent_push_queue (
  id BIGSERIAL PRIMARY KEY,
  school_id BIGINT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  device_token_id BIGINT REFERENCES parent_device_tokens(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_parent_push_queue_status ON parent_push_queue(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_parent_push_queue_school ON parent_push_queue(school_id, queued_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_push_pending_token_event ON parent_push_queue(device_token_id, student_id, title, queued_at);
