CREATE TABLE IF NOT EXISTS parent_push_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  device_token_id UUID REFERENCES parent_device_tokens(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_parent_push_queue_status ON parent_push_queue(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_parent_push_queue_school ON parent_push_queue(school_id, queued_at DESC);
