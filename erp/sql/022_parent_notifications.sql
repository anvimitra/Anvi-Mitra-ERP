-- Anvi Mitra ERP: parent notification inbox, device tokens and outbound SMS queue.
CREATE TABLE IF NOT EXISTS parent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parent_notifications_user_idx
  ON parent_notifications(school_id,user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS parent_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android','ios','web')),
  token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id,user_id,token)
);
CREATE INDEX IF NOT EXISTS parent_device_tokens_user_idx
  ON parent_device_tokens(school_id,user_id,is_active);

CREATE TABLE IF NOT EXISTS notification_sms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  phone VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(120),
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notification_sms_queue_pending_idx
  ON notification_sms_queue(status,queued_at);
CREATE INDEX IF NOT EXISTS notification_sms_queue_school_idx
  ON notification_sms_queue(school_id,queued_at DESC);
