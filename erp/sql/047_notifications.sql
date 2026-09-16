-- Notifications and communication foundation.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_role VARCHAR(40),
  class_id UUID,
  section_id UUID,
  event_type VARCHAR(60) NOT NULL DEFAULT 'announcement',
  title VARCHAR(250) NOT NULL,
  message TEXT NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(recipient_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_school_scope_idx ON notifications(school_id,recipient_role,class_id,section_id,created_at DESC);

CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL,
  destination TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_delivery_notification_idx ON notification_delivery_log(notification_id,attempted_at DESC);
